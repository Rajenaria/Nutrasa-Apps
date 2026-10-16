import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { assertLockReleased, createMigrationHarness } from './harness.ts';

type Values = Record<string, string | number | boolean | object | null>;
type Column = readonly [string, string, boolean, string?];
const history = ['0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy',
  '0005_food_servings_provenance', '0006_catalog_audit'];
const auditTables = ['catalog_import_batches', 'catalog_review_sources', 'catalog_reviews'];
const protectedTables = ['app_users', 'user_profiles', 'user_preferences', 'privacy_acknowledgements',
  'food_sources', 'foods', 'food_revisions', 'food_revision_nutrients', 'categories', 'food_categories',
  'food_aliases', 'serving_definitions'];
const columns: Record<string, readonly Column[]> = {
  catalog_reviews: [['id', 'uuid', true, 'uuid'], ['event_number', 'bigint', true, 'identity'],
    ['review_kind', 'text', true], ['decision', 'text', true], ['source_id', 'uuid', false],
    ['food_revision_id', 'uuid', false], ['actor_subject', 'text', true], ['recorded_at', 'timestamp with time zone', true, 'clock'],
    ['reason', 'text', true], ['evidence_reference', 'text', false], ['evidence_sha256', 'text', false],
    ['canonical_version', 'smallint', true], ['content_digest', 'text', true], ['approval_review_id', 'uuid', false],
    ['source_snapshot', 'jsonb', false], ['license_status', 'text', false], ['permission_scope', 'jsonb', false],
    ['attribution_required', 'boolean', false], ['attribution_text', 'text', false],
    ['valid_from', 'timestamp with time zone', false], ['valid_until', 'timestamp with time zone', false]],
  catalog_import_batches: [['id', 'uuid', true, 'uuid'], ['source_id', 'uuid', true], ['permission_review_id', 'uuid', true],
    ['artifact_reference', 'text', true], ['artifact_sha256', 'text', true], ['parser_version', 'text', true],
    ['mapping_version', 'text', true], ['actor_subject', 'text', true], ['recorded_at', 'timestamp with time zone', true, 'clock'],
    ['outcome', 'text', true], ['accepted_revision_count', 'integer', true], ['rejected_record_count', 'integer', true],
    ['result_reference', 'text', true]],
  catalog_review_sources: [['review_id', 'uuid', true], ['source_id', 'uuid', true], ['permission_review_id', 'uuid', true]],
};

test('catalog audit structure and guarded lifecycle on a fresh isolated PostgreSQL target', { timeout: 120000 }, async t => {
  const { directory, client, observer, bootstrap, migrate, scenario, expectState, tableExists } = await createMigrationHarness(t);
  const ids = { user: randomUUID(), source: randomUUID(), otherSource: randomUUID(), food: randomUUID(), revision: randomUUID() };
  const copy = async (name: string) => writeFile(join(directory, `${name}.sql`),
    await readFile(new URL(`../../migrations/${name}.sql`, import.meta.url)));
  const insert = async (table: 'catalog_reviews' | 'catalog_import_batches' | 'food_sources', values: Values, overrideIdentity = false) => {
    const names = Object.keys(values);
    const rows = await client.query<{ id: string }>(`INSERT INTO nutrasa.${table} (${names.join(',')})
      ${overrideIdentity ? 'OVERRIDING SYSTEM VALUE' : ''}
      VALUES (${names.map((_, index) => `$${index + 1}`).join(',')}) RETURNING id`, Object.values(values));
    const row = rows.rows[0];
    assert.ok(row);
    return row.id;
  };
  const common = { actor_subject: 'SYNTHETIC_NOT_AUTHENTICATED', reason: 'Synthetic storage test, not approval',
    canonical_version: 1, content_digest: 'a'.repeat(64) };
  const permission = (changes: Values = {}) => insert('catalog_reviews', { ...common, review_kind: 'SOURCE_PERMISSION',
    decision: 'ACCEPTED', source_id: ids.source, evidence_reference: 'Synthetic evidence, no legal clearance',
    source_snapshot: { synthetic: true }, license_status: 'ALLOWED',
    permission_scope: { store: true, redistribute: false, offline_cache: false },
    attribution_required: false, valid_from: '2026-01-01T00:00:00Z', ...changes });
  const nutrition = (changes: Values = {}) => insert('catalog_reviews', { ...common, review_kind: 'NUTRITION',
    decision: 'ACCEPTED', food_revision_id: ids.revision, evidence_reference: 'Synthetic review only', ...changes });
  const batch = (permissionId: string, changes: Values = {}) => insert('catalog_import_batches', {
    source_id: ids.source, permission_review_id: permissionId, artifact_reference: 'Synthetic artifact only',
    artifact_sha256: 'b'.repeat(64), parser_version: 'synthetic-v1', mapping_version: 'synthetic-v1',
    actor_subject: 'SYNTHETIC_NOT_AUTHENTICATED', outcome: 'IMPORTED', accepted_revision_count: 0,
    rejected_record_count: 0, result_reference: 'Synthetic validation result', ...changes });
  const link = (review: string, source: string, permissionId: string) => client.query(
    'INSERT INTO nutrasa.catalog_review_sources (review_id,source_id,permission_review_id) VALUES ($1,$2,$3)',
    [review, source, permissionId]);
  const reject = async (execute: () => Promise<unknown>, code = '23514') => {
    await client.query('SAVEPOINT expected_error');
    try { await assert.rejects(execute, { code }); }
    finally { await client.query('ROLLBACK TO SAVEPOINT expected_error'); await client.query('RELEASE SAVEPOINT expected_error'); }
  };
  const isolated = (name: string, execute: () => Promise<void>) => scenario(name, async () => {
    await client.query('BEGIN');
    try { await execute(); } finally { await client.query('ROLLBACK'); }
  });
  const readColumns = async (table: string) => (await client.query<{
    name: string; type: string; required: boolean; identity: string; expression: string | null;
  }>(`SELECT a.attname::text AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull AS required,a.attidentity::text AS identity,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [`nutrasa.${table}`])).rows;
  // Only the approved new column/FK/index are excluded; all older rows and metadata must stay identical.
  const protectedState = async () => {
    const structure = (await client.query(`SELECT c.relname::text,c.oid::text,c.relowner::text,
      ARRAY(SELECT a.attname::text||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text
        ||':'||COALESCE(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'') FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'import_batch_id' ORDER BY a.attnum) AS columns,
      ARRAY(SELECT pg_catalog.pg_get_constraintdef(p.oid) FROM pg_catalog.pg_constraint p WHERE p.conrelid=c.oid
        AND p.conname<>'food_revisions_import_batch_source_fkey' ORDER BY p.conname) AS constraints,
      ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid) FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid
        AND ic.relname<>'food_revisions_import_batch_source_idx' ORDER BY ic.relname) AS indexes
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='nutrasa' AND c.relname=ANY($1::text[]) AND c.relkind='r' ORDER BY c.relname`, [protectedTables])).rows;
    assert.equal(structure.length, protectedTables.length);
    const rows: Record<string, string[]> = {};
    for (const table of protectedTables) rows[table] = (await client.query<{ row: string }>(
      `SELECT (to_jsonb(t)-'import_batch_id')::text AS row FROM nutrasa.${table} t ORDER BY 1`)).rows.map(row => row.row);
    return { structure, rows };
  };

  await scenario('bootstrap once, apply actual 0001-0005 and establish protected synthetic data', async () => {
    await bootstrap();
    for (const name of history.slice(0, 5)) await copy(name);
    await migrate('up');
    await client.query("INSERT INTO nutrasa.app_users (id,firebase_uid,account_status) VALUES ($1,'synthetic_audit_owner','ACTIVE')", [ids.user]);
    await client.query(`INSERT INTO nutrasa.user_profiles
      (user_id,date_of_birth,height_cm,calculation_parameter,activity_level,goal_type,onboarding_completed_at)
      VALUES ($1,'1990-01-01','170','SYNTHETIC_UNAPPROVED','moderate','maintenance','2026-01-01T00:00:00Z')`, [ids.user]);
    await client.query(`INSERT INTO nutrasa.user_preferences (user_id,language_code,time_zone,preferred_weight_unit)
      VALUES ($1,'id-ID','Asia/Jakarta','kg')`, [ids.user]);
    await client.query(`INSERT INTO nutrasa.privacy_acknowledgements (user_id,notice_version,ack_type)
      VALUES ($1,'SYNTHETIC_NOT_LEGAL','SYNTHETIC')`, [ids.user]);
    for (const id of [ids.source, ids.otherSource]) await insert('food_sources', { id, name: 'SYNTHETIC',
      source_type: 'SYNTHETIC', reference: 'Synthetic bibliography only', license_status: 'UNVERIFIED' });
    await client.query(`INSERT INTO nutrasa.foods (id,canonical_name,normalized_name,food_type,publication_status)
      VALUES ($1,'SYNTHETIC','synthetic','SYNTHETIC','DRAFT')`, [ids.food]);
    await client.query(`INSERT INTO nutrasa.food_revisions
      (id,food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method,quality_status)
      VALUES ($1,$2,1,$3,100,'g','SYNTHETIC','SYNTHETIC','DRAFT')`, [ids.revision, ids.food, ids.source]);
    await client.query(`INSERT INTO nutrasa.food_revision_nutrients (food_revision_id,nutrient_code,value)
      VALUES ($1,'energy_kcal',0),($1,'sugar_g',NULL)`, [ids.revision]);
    await client.query(`INSERT INTO nutrasa.categories (slug,name,sort_order,is_active) VALUES ('synthetic','SYNTHETIC',0,true)`);
    await client.query(`INSERT INTO nutrasa.food_categories (food_id,category_id,is_primary)
      SELECT $1,id,true FROM nutrasa.categories`, [ids.food]);
    await client.query(`INSERT INTO nutrasa.food_aliases (food_id,alias,normalized_alias) VALUES ($1,'SYNTHETIC','synthetic')`, [ids.food]);
    await client.query(`INSERT INTO nutrasa.serving_definitions
      (food_revision_id,label,base_quantity,method,reviewed,sort_order,source_id,source_record_reference,source_reference_snapshot)
      VALUES ($1,'SYNTHETIC',1,'SYNTHETIC',false,0,$2,'SYNTHETIC','Synthetic bibliography')`, [ids.revision, ids.otherSource]);
    await expectState(history.slice(0, 5), 5);
  });
  const before = await protectedState();
  const originalColumns = await readColumns('food_revisions');
  const preserved = async () => assert.deepEqual(await protectedState(), before);

  await scenario('failure after actual audit DDL rolls back all new tables column history and checksum', async () => {
    await copy(history[5]);
    const failure = join(directory, '0007_failure.sql');
    await writeFile(failure, await readFile(new URL('./fixtures/catalog-audit/0007_failure.sql', import.meta.url)));
    try {
      await assert.rejects(migrate('up'), { code: '22012' });
      for (const table of auditTables) assert.equal(await tableExists(table), false);
      assert.deepEqual(await readColumns('food_revisions'), originalColumns);
      await expectState(history.slice(0, 5), 5);
      await preserved(); await assertLockReleased(observer);
    } finally { await rm(failure); }
  });
  await scenario('actual audit UP commits and preserves the five previous domains', async () => {
    await migrate('up'); await expectState(history, 6); await preserved(); await assertLockReleased(observer);
  });
  await scenario('exact 21/13/3 columns plus nullable revision link have only the approved defaults', async () => {
    for (const [table, expected] of Object.entries(columns)) {
      const actual = await readColumns(table);
      assert.deepEqual(actual.map(row => [row.name, row.type, row.required]), expected.map(row => row.slice(0, 3)));
      for (const [index, column] of expected.entries()) {
        const row = actual[index]; assert.ok(row);
        assert.equal(row.identity, column[3] === 'identity' ? 'a' : '');
        if (column[3] === 'uuid') assert.match(row.expression ?? '', /^(pg_catalog\.)?gen_random_uuid\(\)$/);
        else if (column[3] === 'clock') assert.match(row.expression ?? '', /^(pg_catalog\.)?clock_timestamp\(\)$/);
        else assert.equal(row.expression, null);
      }
    }
    assert.deepEqual(await readColumns('food_revisions'), [...originalColumns,
      { name: 'import_batch_id', type: 'uuid', required: false, identity: '', expression: null }]);
  });
  await scenario('three primary keys three unique keys nine RESTRICT foreign keys match exact column order', async () => {
    const rows = (await client.query<{ table_name: string; kind: string; columns: string[]; target: string | null;
      target_columns: string[]; delete_action: string; update_action: string; deferred: boolean; deferrable: boolean; validated: boolean }>(`
      SELECT r.relname::text AS table_name,c.contype::text AS kind,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      CASE WHEN c.contype='f' THEN c.confrelid::regclass::text ELSE NULL END AS target,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS target_columns,
      c.confdeltype::text AS delete_action,c.confupdtype::text AS update_action,
      c.condeferred AS deferred,c.condeferrable AS deferrable,c.convalidated AS validated
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
      WHERE (r.oid=ANY($1::regclass[]) OR c.conname='food_revisions_import_batch_source_fkey') AND c.contype IN ('p','u','f')`,
    [auditTables.map(table => `nutrasa.${table}`)])).rows;
    const expected = [
      ['catalog_reviews', 'p', ['id'], null, []], ['catalog_reviews', 'u', ['event_number'], null, []],
      ['catalog_reviews', 'u', ['id', 'source_id'], null, []],
      ['catalog_reviews', 'f', ['source_id'], 'food_sources', ['id']],
      ['catalog_reviews', 'f', ['food_revision_id'], 'food_revisions', ['id']],
      ['catalog_reviews', 'f', ['approval_review_id'], 'catalog_reviews', ['id']],
      ['catalog_import_batches', 'p', ['id'], null, []], ['catalog_import_batches', 'u', ['id', 'source_id'], null, []],
      ['catalog_import_batches', 'f', ['source_id'], 'food_sources', ['id']],
      ['catalog_import_batches', 'f', ['permission_review_id', 'source_id'], 'catalog_reviews', ['id', 'source_id']],
      ['catalog_review_sources', 'p', ['review_id', 'source_id'], null, []],
      ['catalog_review_sources', 'f', ['review_id'], 'catalog_reviews', ['id']],
      ['catalog_review_sources', 'f', ['source_id'], 'food_sources', ['id']],
      ['catalog_review_sources', 'f', ['permission_review_id', 'source_id'], 'catalog_reviews', ['id', 'source_id']],
      ['food_revisions', 'f', ['import_batch_id', 'source_id'], 'catalog_import_batches', ['id', 'source_id']],
    ];
    const sorted = (values: readonly unknown[]) => values.map(value => JSON.stringify(value)).sort();
    assert.deepEqual(sorted(rows.map(row => [row.table_name, row.kind, row.columns, row.target?.split('.').at(-1) ?? null, row.target_columns])), sorted(expected));
    assert.ok(rows.every(row => !row.deferred && !row.deferrable && row.validated));
    assert.ok(rows.filter(row => row.kind === 'f').every(row => row.delete_action === 'r' && row.update_action === 'r'));
  });
  await scenario('thirteen B-tree indexes thirty-seven CHECKs and no user triggers or governance functions are added', async () => {
    const indexes = (await client.query<{ table_name: string; columns: string[]; unique: boolean; method: string; plain: boolean }>(`
      SELECT r.relname::text AS table_name,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      i.indisunique AS unique,am.amname::text AS method,
      (i.indisvalid AND i.indisready AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts) AS plain
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
      JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=ic.relam
      WHERE r.oid=ANY($1::regclass[]) OR ic.relname='food_revisions_import_batch_source_idx'`,
    [auditTables.map(table => `nutrasa.${table}`)])).rows;
    const expected = [
      ['catalog_reviews', ['id'], true], ['catalog_reviews', ['event_number'], true], ['catalog_reviews', ['id', 'source_id'], true],
      ['catalog_reviews', ['source_id', 'event_number'], false], ['catalog_reviews', ['food_revision_id', 'review_kind', 'event_number'], false],
      ['catalog_reviews', ['approval_review_id'], false], ['catalog_import_batches', ['id'], true],
      ['catalog_import_batches', ['id', 'source_id'], true], ['catalog_import_batches', ['permission_review_id', 'source_id'], false],
      ['catalog_import_batches', ['source_id', 'artifact_sha256'], false], ['catalog_review_sources', ['review_id', 'source_id'], true],
      ['catalog_review_sources', ['permission_review_id', 'source_id'], false], ['food_revisions', ['import_batch_id', 'source_id'], false],
    ];
    const sorted = (values: readonly unknown[]) => values.map(value => JSON.stringify(value)).sort();
    assert.deepEqual(sorted(indexes.map(row => [row.table_name, row.columns, row.unique])), sorted(expected));
    assert.ok(indexes.every(row => row.method === 'btree' && row.plain));
    assert.deepEqual((await client.query(`SELECT r.relname::text AS name,count(*)::integer AS count FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class r ON r.oid=c.conrelid WHERE r.oid=ANY($1::regclass[]) AND c.contype='c'
      GROUP BY r.relname ORDER BY r.relname`, [auditTables.map(table => `nutrasa.${table}`)])).rows,
    [{ name: 'catalog_import_batches', count: 11 }, { name: 'catalog_reviews', count: 26 }]);
    assert.equal((await client.query(`SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid=ANY($1::regclass[]) AND NOT t.tgisinternal`,
      [auditTables.map(table => `nutrasa.${table}`)])).rowCount, 0);
    assert.equal((await client.query("SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='nutrasa'")).rowCount, 0);
  });
  await isolated('review targets vocabularies decisions and approval links obey local CHECKs', async () => {
    for (const decision of ['ACCEPTED', 'REJECTED', 'REVOKED']) await nutrition({ decision });
    const approved = await nutrition();
    const publication = await insert('catalog_reviews', { ...common, review_kind: 'PUBLICATION', decision: 'ACCEPTED',
      food_revision_id: ids.revision, approval_review_id: approved });
    await insert('catalog_reviews', { ...common, review_kind: 'WITHDRAWAL', decision: 'REVOKED',
      food_revision_id: ids.revision, approval_review_id: publication });
    const invalidTargets: Values[] = [{ review_kind: 'UNKNOWN' }, { decision: 'APPROVED' }, { source_id: ids.source },
      { food_revision_id: null }, { evidence_reference: null }, { approval_review_id: approved },
      { review_kind: 'PUBLICATION', decision: 'REJECTED', approval_review_id: approved },
      { review_kind: 'WITHDRAWAL', approval_review_id: publication }, { review_kind: 'PUBLICATION' }];
    for (const changes of invalidTargets)
      await reject(() => nutrition(changes));
    await reject(() => nutrition({ food_revision_id: randomUUID() }), '23503');
    await reject(() => nutrition({ review_kind: 'PUBLICATION', approval_review_id: randomUUID() }), '23503');
    await reject(() => nutrition({ id: approved }), '23505');
    const self = randomUUID();
    await reject(() => nutrition({ id: self, review_kind: 'PUBLICATION', evidence_reference: null, approval_review_id: self }));
  });
  await isolated('source evidence accepted permission scope JSON attribution and dates fail closed', async () => {
    for (const status of ['UNVERIFIED', 'ALLOWED', 'RESTRICTED', 'DENIED']) await permission({ decision: 'REJECTED',
      license_status: status, permission_scope: null, attribution_required: null, valid_from: null });
    await permission({ attribution_required: true, attribution_text: 'Synthetic attribution only' });
    const invalidPermissions: Values[] = [{ source_id: null }, { food_revision_id: ids.revision }, { source_snapshot: null },
      { source_snapshot: '[]' }, { source_snapshot: 'null' }, { license_status: null }, { license_status: 'allowed' }, { license_status: 'DENIED' },
      { evidence_reference: null }, { permission_scope: null }, { permission_scope: {} }, { permission_scope: 'null' },
      { permission_scope: '[]' }, { permission_scope: true },
      { permission_scope: { store: null, redistribute: true, offline_cache: true } },
      { permission_scope: { store: 'true', redistribute: true, offline_cache: true } },
      { permission_scope: { store: true, redistribute: true, offline_cache: true, extra: true } },
      { attribution_required: null }, { attribution_required: true }, { valid_from: null },
      { valid_from: 'infinity' }, { valid_until: '-infinity' }, { valid_until: '2025-01-01T00:00:00Z' }];
    for (const changes of invalidPermissions)
      await reject(() => permission(changes));
    await reject(() => permission({ source_id: randomUUID() }), '23503');
    await reject(() => nutrition({ permission_scope: { store: true, redistribute: true, offline_cache: true } }));
    await reject(() => permission({ attribution_required: true, attribution_text: ' \t\n' }));
    await reject(() => permission({ valid_until: '2026-01-01T00:00:00Z' }));
  });
  await isolated('required fields text evidence hashes and canonical version reject invalid values', async () => {
    for (const column of ['id', 'review_kind', 'decision', 'actor_subject', 'recorded_at', 'reason', 'canonical_version', 'content_digest'])
      await reject(() => nutrition({ [column]: null }), '23502');
    for (const column of ['actor_subject', 'reason', 'evidence_reference'])
      for (const value of ['', ' \t\n']) await reject(() => nutrition({ [column]: value }));
    for (const column of ['content_digest', 'evidence_sha256'])
      for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(64)}\n`, 'g'.repeat(64)])
        await reject(() => nutrition({ [column]: value }));
    await nutrition({ evidence_sha256: 'c'.repeat(64), recorded_at: '2026-01-01T00:00:00Z' });
    for (const version of [0, 2, -1]) await reject(() => nutrition({ canonical_version: version }));
    for (const recorded_at of ['infinity', '-infinity']) await reject(() => nutrition({ recorded_at }));
  });
  await isolated('sequence generates positive unique ordered values and server timestamps without business defaults', async () => {
    const first = await nutrition(); const second = await nutrition();
    const rows = (await client.query<{ id: string; number: string; finite: boolean }>(`SELECT id,event_number::text AS number,
      pg_catalog.isfinite(recorded_at) AND recorded_at<=pg_catalog.clock_timestamp() AS finite
      FROM nutrasa.catalog_reviews WHERE id=ANY($1::uuid[]) ORDER BY event_number`, [[first, second]])).rows;
    assert.deepEqual(rows.map(row => row.id), [first, second]);
    assert.ok(rows.every(row => BigInt(row.number) > 0n && row.finite));
    assert.ok(BigInt(rows[1]?.number ?? '0') > BigInt(rows[0]?.number ?? '0'));
    await reject(() => nutrition({ event_number: 1 }), '428C9');
    await reject(() => insert('catalog_reviews', { ...common, review_kind: 'NUTRITION', decision: 'ACCEPTED',
      food_revision_id: ids.revision, evidence_reference: 'Synthetic', event_number: rows[0]?.number ?? '0' }, true), '23505');
    await reject(() => insert('catalog_reviews', { ...common, review_kind: 'NUTRITION', decision: 'ACCEPTED',
      food_revision_id: ids.revision, evidence_reference: 'Synthetic', event_number: 0 }, true));
  });
  await isolated('review-source and batch-source composite FKs reject mismatches and protect referenced rows', async () => {
    const right = await permission(); const other = await permission({ source_id: ids.otherSource }); const review = await nutrition();
    await link(review, ids.source, right);
    await link(review, ids.otherSource, other);
    await reject(() => link(review, ids.source, right), '23505');
    await reject(() => link(randomUUID(), ids.source, right), '23503');
    await reject(async () => link(await nutrition(), ids.source, other), '23503');
    await reject(() => link(review, randomUUID(), right), '23503');
    await reject(() => batch(other), '23503');
    await reject(() => batch(randomUUID()), '23503');
    await reject(() => client.query('DELETE FROM nutrasa.catalog_reviews WHERE id=$1', [right]), '23001');
    await reject(() => client.query('UPDATE nutrasa.catalog_reviews SET id=$1 WHERE id=$2', [randomUUID(), right]), '23001');
    const imported = await batch(right);
    await client.query('UPDATE nutrasa.food_revisions SET import_batch_id=$1 WHERE id=$2', [imported, ids.revision]);
    const otherBatch = await batch(other, { source_id: ids.otherSource });
    await reject(() => client.query('UPDATE nutrasa.food_revisions SET import_batch_id=$1 WHERE id=$2', [otherBatch, ids.revision]), '23503');
    await reject(() => client.query('DELETE FROM nutrasa.catalog_import_batches WHERE id=$1', [imported]), '23001');
  });
  await isolated('batch terminal outcomes counts required metadata hashes and evidence remain structural', async () => {
    const right = await permission();
    const id = await batch(right);
    await batch(right, { outcome: 'REJECTED', rejected_record_count: 1 });
    for (const column of columns.catalog_import_batches.filter(column => column[2]).map(column => column[0]))
      await reject(() => batch(right, { [column]: null }), '23502');
    for (const column of ['artifact_reference', 'parser_version', 'mapping_version', 'actor_subject', 'result_reference'])
      await reject(() => batch(right, { [column]: ' \t\n' }));
    const invalidBatches: Values[] = [{ outcome: 'RUNNING' }, { outcome: 'REJECTED', accepted_revision_count: 1 },
      { accepted_revision_count: -1 }, { rejected_record_count: -1 }, { recorded_at: 'infinity' },
      { artifact_sha256: 'x'.repeat(64) }];
    for (const changes of invalidBatches) await reject(() => batch(right, changes));
    await reject(() => batch(right, { id }), '23505');
    // Migrator DML still works: append-only/authorization belongs to the later privilege/entrypoint milestone.
    await client.query("UPDATE nutrasa.catalog_import_batches SET result_reference='Synthetic correction' WHERE id=$1", [id]);
    assert.equal((await client.query('SELECT result_reference FROM nutrasa.catalog_import_batches WHERE id=$1', [id])).rows[0]?.result_reference,
      'Synthetic correction');
  });
  await scenario('empty audit DOWN removes only approved additions and retains all immutable baselines', async () => {
    await migrate('down');
    for (const table of auditTables) assert.equal(await tableExists(table), false);
    assert.deepEqual(await readColumns('food_revisions'), originalColumns);
    await expectState(history.slice(0, 5), 6); await preserved(); await assertLockReleased(observer);
  });
  await scenario('identical UP and rerun restore empty audit without duplicate metadata', async () => {
    await migrate('up'); assert.deepEqual(await migrate('up'), []);
    for (const table of auditTables) assert.equal((await client.query(`SELECT * FROM nutrasa.${table}`)).rowCount, 0);
    await expectState(history, 6); await preserved();
  });
  await scenario('populated audit DOWN is refused atomically with data schema history and checksum retained', async () => {
    const id = await permission({ decision: 'REJECTED', permission_scope: null, attribution_required: null, valid_from: null,
      license_status: 'UNVERIFIED' });
    const beforeAudit = (await client.query('SELECT to_jsonb(r)::text AS row FROM nutrasa.catalog_reviews r')).rows;
    await assert.rejects(migrate('down'), { code: '22012' });
    for (const table of auditTables) assert.equal(await tableExists(table), true);
    assert.deepEqual((await client.query('SELECT to_jsonb(r)::text AS row FROM nutrasa.catalog_reviews r')).rows, beforeAudit);
    assert.equal((await client.query('SELECT id FROM nutrasa.catalog_reviews WHERE id=$1', [id])).rowCount, 1);
    await expectState(history, 6); await preserved(); await assertLockReleased(observer);
    assert.deepEqual(await migrate('up'), []);
    assert.equal((await client.query('SELECT id FROM nutrasa.food_revisions WHERE import_batch_id IS NOT NULL')).rowCount, 0);
    assert.deepEqual((await client.query<{ name: string }>(`SELECT c.relname::text AS name FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='nutrasa' AND c.relkind='r'
      ORDER BY c.relname`)).rows.map(row => row.name), [...protectedTables, ...auditTables].sort());
    assert.deepEqual((await client.query(`SELECT nutrient_code,value::text AS value FROM nutrasa.food_revision_nutrients ORDER BY nutrient_code`)).rows,
      [{ nutrient_code: 'energy_kcal', value: '0.00000' }, { nutrient_code: 'sugar_g', value: null }]);
  });
});
