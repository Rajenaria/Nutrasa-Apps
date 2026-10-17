import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { assertLockReleased, createMigrationHarness } from './harness.ts';

const history = ['0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy',
  '0005_food_servings_provenance', '0006_catalog_audit', '0007_catalog_digest', '0008_catalog_capabilities'];
const tables = ['catalog_capability_events', 'catalog_capability_assignments'];
const eventColumns = ['id', 'event_number', 'subject_id', 'capability', 'scope', 'action', 'actor_subject_id', 'reason', 'request_id', 'recorded_at'];
const assignmentColumns = ['subject_id', 'capability', 'scope', 'last_event_id'];

test('capability storage constraints and guarded lifecycle on a fresh isolated target; not operational authorization', { timeout: 120000 }, async t => {
  const { client, observer, directory, bootstrap, migrate, scenario, expectState, tableExists } = await createMigrationHarness(t);
  const subject = randomUUID(); const actor = randomUUID(); const otherSubject = randomUUID();
  const copy = async (name: string) => writeFile(join(directory, name + '.sql'),
    await readFile(new URL('../../migrations/' + name + '.sql', import.meta.url)));
  const insertEvent = async (changes: Record<string, unknown> = {}) => {
    // Synthetic storage rows written by the migrator, never a trusted administrative writer.
    const values = { subject_id: subject, actor_subject_id: actor, capability: 'SYNTHETIC_NOT_OPERATIONAL',
      scope: 'SYNTHETIC_UNAPPROVED_SCOPE', action: 'GRANT', reason: 'Synthetic storage only', request_id: 'synthetic-correlation', ...changes };
    const keys = Object.keys(values);
    const result = await client.query<{ id: string; event_number: string; recorded_at: Date }>(
      'INSERT INTO nutrasa.catalog_capability_events (' + keys.join(',') + ') ' +
      (keys.includes('event_number') ? 'OVERRIDING SYSTEM VALUE ' : '') +
      'VALUES (' + keys.map((_, i) => '$' + (i + 1)).join(',') + ') RETURNING id,event_number,recorded_at', Object.values(values));
    const row = result.rows[0]; assert.ok(row); return row;
  };
  const assign = (id: string, uid = subject, capability = 'SYNTHETIC_NOT_OPERATIONAL', scope = 'SYNTHETIC_UNAPPROVED_SCOPE') =>
    client.query('INSERT INTO nutrasa.catalog_capability_assignments(subject_id,capability,scope,last_event_id) VALUES($1,$2,$3,$4)',
      [uid, capability, scope, id]);
  const rejected = async (execute: () => Promise<unknown>, code: string) => {
    await client.query('SAVEPOINT expected_error');
    try { await assert.rejects(execute, { code }); }
    finally { await client.query('ROLLBACK TO SAVEPOINT expected_error'); await client.query('RELEASE SAVEPOINT expected_error'); }
  };
  const isolated = (name: string, execute: () => Promise<void>) => scenario(name, async () => {
    await client.query('BEGIN');
    try { await execute(); } finally { await client.query('ROLLBACK'); }
  });
  const protectedState = async () => {
    const relations = (await client.query<{ name: string }>(
      "SELECT tablename::text AS name FROM pg_catalog.pg_tables WHERE schemaname='nutrasa' AND NOT(tablename=ANY($1::text[])) ORDER BY tablename", [tables])).rows;
    const rows: Record<string, string[]> = {};
    for (const { name } of relations) rows[name] = (await client.query<{ row: string }>(
      'SELECT to_jsonb(t)::text AS row FROM nutrasa.' + name + ' t ORDER BY 1')).rows.map(row => row.row);
    const structure = (await client.query(
      "SELECT c.relname::text,c.oid::text,c.relowner::text,pg_catalog.pg_get_constraintdef(p.oid) AS definition FROM pg_catalog.pg_class c " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_constraint p ON p.conrelid=c.oid " +
      "WHERE n.nspname='nutrasa' AND c.relkind='r' AND NOT(c.relname=ANY($1::text[])) ORDER BY c.relname,p.conname", [tables])).rows;
    const functions = (await client.query(
      "SELECT p.oid::text,pg_catalog.pg_get_functiondef(p.oid) AS definition,p.proowner::text,p.proacl::text FROM pg_catalog.pg_proc p " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='nutrasa' ORDER BY p.oid")).rows;
    return { rows, structure, functions };
  };
  await scenario('bootstrap fresh target and apply actual 0001-0007 with synthetic subjects only', async () => {
    await bootstrap();
    for (const name of history.slice(0, 7)) await copy(name);
    await migrate('up');
    for (const [id, status] of [[subject, 'ACTIVE'], [actor, 'ACTIVE'], [otherSubject, 'PENDING_DELETION']])
      await client.query('INSERT INTO nutrasa.app_users(id,firebase_uid,account_status) VALUES($1,$2,$3)', [id, 'SYNTHETIC_' + id, status]);
    await expectState(history.slice(0, 7), 7);
  });
  const before = await protectedState();
  const preserved = async () => assert.deepEqual(await protectedState(), before);
  const empty = async () => {
    for (const table of tables) assert.equal((await client.query<{ count: string }>('SELECT count(*) FROM nutrasa.' + table)).rows[0]?.count, '0');
  };
  await scenario('failure after actual capability DDL rolls back both tables history checksum and sequence', async () => {
    await copy(history[7]);
    const failure = join(directory, '0009_failure.sql');
    await writeFile(failure, await readFile(new URL('./fixtures/catalog-capabilities/0009_failure.sql', import.meta.url)));
    try { await assert.rejects(migrate('up')); } finally { await rm(failure); }
    for (const table of tables) assert.equal(await tableExists(table), false);
    assert.equal(await tableExists('catalog_capability_events_event_number_seq'), false);
    await expectState(history.slice(0, 7), 7); await preserved(); await assertLockReleased(observer);
  });
  await scenario('actual UP adds empty storage with matching history checksum and protected domains', async () => {
    await migrate('up'); await expectState(history, 8); await empty(); await preserved();
  });
  await scenario('exact 10/4 required columns defaults identity and C collations match the contract', async () => {
    for (const [table, names] of [[tables[0], eventColumns], [tables[1], assignmentColumns]] as const) {
      const columns = (await client.query<{ name: string; type: string; required: boolean; identity: string; expression: string | null; collation: string | null }>(
        'SELECT a.attname::text AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity::text AS identity,' +
        'pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS expression,c.collname::text AS collation FROM pg_catalog.pg_attribute a ' +
        'LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ' +
        'LEFT JOIN pg_catalog.pg_collation c ON c.oid=a.attcollation WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum', ['nutrasa.' + table])).rows;
      assert.deepEqual(columns.map(row => row.name), names);
      for (const row of columns) {
        assert.equal(row.required, true);
        assert.equal(row.type, ['id', 'subject_id', 'actor_subject_id', 'last_event_id'].includes(row.name) ? 'uuid' :
          row.name === 'event_number' ? 'bigint' : row.name === 'recorded_at' ? 'timestamp with time zone' : 'text');
        assert.equal(row.identity, row.name === 'event_number' ? 'a' : '');
        if (row.name === 'id') assert.match(row.expression ?? '', /gen_random_uuid\(\)/);
        else if (row.name === 'recorded_at') assert.match(row.expression ?? '', /clock_timestamp\(\)/);
        else assert.equal(row.expression, null);
        if (['capability', 'scope'].includes(row.name)) assert.equal(row.collation, 'C');
      }
    }
  });
  await scenario('exact primary unique and three ordered nondeferrable RESTRICT foreign keys plus four indexes and nine CHECKs', async () => {
    const keys = (await client.query<{ relation_name: string; kind: string; cols: string[]; parent: string | null; refs: string[]; del: string; upd: string; deferred: boolean }>(
      "SELECT (SELECT 'nutrasa.'||r.relname FROM pg_catalog.pg_class r WHERE r.oid=c.conrelid) AS relation_name,c.contype::text AS kind," +
      'ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS cols,' +
      "(SELECT 'nutrasa.'||r.relname FROM pg_catalog.pg_class r WHERE r.oid=c.confrelid) AS parent," +
      'ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS refs,' +
      "c.confdeltype::text AS del,c.confupdtype::text AS upd,c.condeferrable AS deferred FROM pg_catalog.pg_constraint c WHERE c.conrelid=ANY($1::regclass[]) AND c.contype IN ('p','u','f')", [tables.map(name => 'nutrasa.' + name)])).rows;
    assert.equal(keys.filter(key => key.kind === 'p').length, 2);
    assert.equal(keys.filter(key => key.kind === 'u').length, 2);
    for (const [table, kind, cols] of [[tables[0], 'p', ['id']], [tables[0], 'u', ['event_number']],
      [tables[0], 'u', ['subject_id','capability','scope','id']], [tables[1], 'p', ['subject_id','capability','scope']]] as const)
      assert.ok(keys.some(key => key.relation_name === 'nutrasa.' + table && key.kind === kind && JSON.stringify(key.cols) === JSON.stringify(cols)));
    const foreign = keys.filter(key => key.kind === 'f'); assert.equal(foreign.length, 3);
    for (const [table, cols, parent, refs] of [[tables[0], ['subject_id'], 'app_users', ['id']],
      [tables[0], ['actor_subject_id'], 'app_users', ['id']], [tables[1], ['subject_id','capability','scope','last_event_id'], tables[0], ['subject_id','capability','scope','id']]] as const)
      assert.ok(foreign.some(key => key.relation_name === 'nutrasa.' + table && key.parent === 'nutrasa.' + parent &&
        JSON.stringify(key.cols) === JSON.stringify(cols) && JSON.stringify(key.refs) === JSON.stringify(refs)));
    for (const key of foreign) { assert.equal(key.del, 'r'); assert.equal(key.upd, 'r'); assert.equal(key.deferred, false); }
    const indexes = (await client.query<{ method: string; plain: boolean; index_unique: boolean }>(
      'SELECT am.amname::text AS method,i.indpred IS NULL AND i.indexprs IS NULL AS plain,i.indisunique AS index_unique FROM pg_catalog.pg_index i ' +
      'JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE i.indrelid=ANY($1::regclass[])', [tables.map(name => 'nutrasa.' + name)])).rows;
    assert.equal(indexes.length, 4); assert.ok(indexes.every(row => row.method === 'btree' && row.plain && row.index_unique));
    assert.equal((await client.query<{ count: string }>("SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=ANY($1::regclass[]) AND contype='c'", [tables.map(name => 'nutrasa.' + name)])).rows[0]?.count, '9');
    assert.equal((await client.query<{ count: string }>('SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal', [tables.map(name => 'nutrasa.' + name)])).rows[0]?.count, '0');
    const acl = (await client.query<{ present: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault(c.relkind,c.relowner))) a WHERE c.oid=ANY($1::regclass[]) AND a.grantee<>c.relowner) AS present', [[...tables, 'catalog_capability_events_event_number_seq'].map(name => 'nutrasa.' + name)])).rows[0];
    assert.equal(acl?.present, false, 'No nonowner ACL may make the candidate store operational.');
    await preserved();
  });
  await isolated('UUID and sequence defaults generate distinct positive values without interpreting correlation as an idempotency key', async () => {
    const first = await insertEvent(); const second = await insertEvent();
    assert.notEqual(first.id, second.id); assert.ok(BigInt(first.event_number) > 0n);
    assert.ok(BigInt(second.event_number) > BigInt(first.event_number)); assert.ok(first.recorded_at instanceof Date);
    await rejected(() => insertEvent({ id: first.id }), '23505');
    await rejected(() => insertEvent({ event_number: first.event_number }), '23505');
    // Duplicate GRANT events are structurally allowed to the migrator. Future writers MUST refuse them.
  });
  await isolated('all required event fields reject NULL and text evidence rejects blank without normalizing values', async () => {
    for (const name of eventColumns) await rejected(() => insertEvent({ [name]: null }), '23502');
    for (const name of ['capability','scope','reason','request_id']) for (const value of ['', ' ', '\t\n'])
      await rejected(() => insertEvent({ [name]: value }), '23514');
    const row = await insertEvent({ scope: ' Mixed Case Scope ', capability: ' Mixed Case Capability ' });
    const stored = (await client.query('SELECT scope,capability FROM nutrasa.catalog_capability_events WHERE id=$1', [row.id])).rows[0];
    assert.deepEqual(stored, { scope: ' Mixed Case Scope ', capability: ' Mixed Case Capability ' });
  });
  await isolated('explicit technical actions finite timestamps and positive identity values are enforced', async () => {
    await insertEvent({ action: 'REVOKE' });
    for (const action of ['grant','REVOKE ','ALLOW','', ' ']) await rejected(() => insertEvent({ action }), '23514');
    for (const recorded_at of ['infinity','-infinity']) await rejected(() => insertEvent({ recorded_at }), '23514');
    for (const event_number of [0,-1]) await rejected(() => insertEvent({ event_number }), '23514');
  });
  await isolated('subject and actor require real internal rows while lifecycle authorization remains a writer gate', async () => {
    for (const key of ['subject_id','actor_subject_id']) await rejected(() => insertEvent({ [key]: randomUUID() }), '23503');
    // A FK cannot authenticate a user or deny a disabled subject. This is storage, not an authority test.
    await insertEvent({ subject_id: otherSubject });
  });
  await isolated('projection requires four nonnull fields exact composite event binding and unique assignment keys', async () => {
    const event = await insertEvent(); await assign(event.id);
    await rejected(() => assign(event.id), '23505');
    for (const params of [[otherSubject,'SYNTHETIC_NOT_OPERATIONAL','SYNTHETIC_UNAPPROVED_SCOPE',event.id],
      [subject,'OTHER_SYNTHETIC','SYNTHETIC_UNAPPROVED_SCOPE',event.id], [subject,'SYNTHETIC_NOT_OPERATIONAL','OTHER_SCOPE',event.id],
      [otherSubject,'OTHER_SYNTHETIC','OTHER_SCOPE',randomUUID()]])
      await rejected(() => client.query('INSERT INTO nutrasa.catalog_capability_assignments VALUES($1,$2,$3,$4)', params), '23503');
    for (let i = 0; i < 4; i++) {
      const params: (string | null)[] = [subject,'SYNTHETIC_NOT_OPERATIONAL','SYNTHETIC_UNAPPROVED_SCOPE',event.id]; params[i] = null;
      await rejected(() => client.query('INSERT INTO nutrasa.catalog_capability_assignments VALUES($1,$2,$3,$4)', params), '23502');
    }
    for (const col of ['capability','scope']) for (const value of ['', ' \t'])
      await rejected(() => client.query('UPDATE nutrasa.catalog_capability_assignments SET ' + col + '=$1 WHERE subject_id=$2', [value, subject]), '23514');
    // An accepted nonblank scope is not an operational allowlist entry or permission.
  });
  await isolated('RESTRICT protects subject actor and effective event ids from deletion and renaming', async () => {
    const event = await insertEvent(); await assign(event.id);
    for (const id of [subject,actor]) {
      await rejected(() => client.query('DELETE FROM nutrasa.app_users WHERE id=$1', [id]), '23001');
      await rejected(() => client.query('UPDATE nutrasa.app_users SET id=$1 WHERE id=$2', [randomUUID(), id]), '23001');
    }
    await rejected(() => client.query('DELETE FROM nutrasa.catalog_capability_events WHERE id=$1', [event.id]), '23001');
    await rejected(() => client.query('UPDATE nutrasa.catalog_capability_events SET id=$1 WHERE id=$2', [randomUUID(), event.id]), '23001');
  });
  await scenario('synthetic event and projection changes roll back together without a production writer claim', async () => {
    await client.query('BEGIN');
    try {
      const event = await insertEvent(); await assign(event.id);
      await assert.rejects(client.query('SELECT 1 / 0'), { code: '22012' });
    } finally { await client.query('ROLLBACK'); }
    await empty(); await preserved();
  });
  await scenario('empty DOWN removes only capability storage and identity sequence retaining eight baselines', async () => {
    await migrate('down');
    for (const table of tables) assert.equal(await tableExists(table), false);
    assert.equal(await tableExists('catalog_capability_events_event_number_seq'), false);
    await expectState(history.slice(0, 7), 8); await preserved(); await assertLockReleased(observer);
  });
  await scenario('identical UP and re-run restore empty store without duplicate metadata', async () => {
    await migrate('up'); assert.deepEqual(await migrate('up'), []);
    await expectState(history, 8); await empty(); await preserved();
  });
  await scenario('synthetic grant then revoke retains history and populated DOWN refuses atomically', async () => {
    await client.query('BEGIN');
    try {
      const granted = await insertEvent(); await assign(granted.id);
      const revoked = await insertEvent({ action: 'REVOKE' });
      await client.query('UPDATE nutrasa.catalog_capability_assignments SET last_event_id=$1 WHERE subject_id=$2', [revoked.id, subject]);
      await client.query('COMMIT');
    } catch (error: unknown) { await client.query('ROLLBACK'); throw error; }
    const state = async () => ({ events: (await client.query('SELECT * FROM nutrasa.catalog_capability_events ORDER BY event_number')).rows,
      assignments: (await client.query('SELECT * FROM nutrasa.catalog_capability_assignments')).rows });
    const retained = await state(); assert.equal(retained.events.length, 2); assert.equal(retained.assignments.length, 1);
    assert.deepEqual(retained.events.map(row => row.action), ['GRANT','REVOKE']);
    await assert.rejects(migrate('down'));
    assert.deepEqual(await state(), retained); await expectState(history, 8); await preserved(); await assertLockReleased(observer);
  });
});
