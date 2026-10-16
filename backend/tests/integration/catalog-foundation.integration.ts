import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { assertLockReleased, createMigrationHarness } from './harness.ts';

type Column = readonly [name: string, type: string, notNull: boolean, uuidDefault: boolean];
type Values = Record<string, string | number | boolean | null>;
const taxonomy = ['categories', 'food_aliases', 'food_categories'];
const baseline = ['app_users', 'food_revision_nutrients', 'food_revisions', 'food_sources',
  'foods', 'privacy_acknowledgements', 'user_preferences', 'user_profiles'];
const provenance = ['source_record_reference', 'source_reference_snapshot'];
const provenanceChecks = ['food_revisions_source_provenance_pair_check',
  'food_revisions_source_record_reference_nonblank_check', 'food_revisions_source_reference_snapshot_nonblank_check'];
const columns: Record<string, readonly Column[]> = {
  categories: [['id', 'uuid', true, true], ['parent_id', 'uuid', false, false], ['slug', 'text', true, false],
    ['name', 'text', true, false], ['sort_order', 'integer', true, false], ['is_active', 'boolean', true, false]],
  food_categories: [['food_id', 'uuid', true, false], ['category_id', 'uuid', true, false], ['is_primary', 'boolean', true, false]],
  food_aliases: [['id', 'uuid', true, true], ['food_id', 'uuid', true, false], ['alias', 'text', true, false],
    ['normalized_alias', 'text', true, false], ['locale', 'text', false, false]],
  serving_definitions: [['id', 'uuid', true, true], ['food_revision_id', 'uuid', true, false], ['label', 'text', true, false],
    ['base_quantity', 'numeric(14,5)', true, false], ['method', 'text', true, false], ['reviewed', 'boolean', true, false],
    ['sort_order', 'integer', true, false], ['source_id', 'uuid', true, false],
    ['source_record_reference', 'text', true, false], ['source_reference_snapshot', 'text', true, false]],
};
const taxonomyChecks = ['categories_name_nonblank_check', 'categories_parent_not_self_check',
  'categories_slug_nonblank_check', 'categories_sort_order_check', 'food_aliases_alias_nonblank_check',
  'food_aliases_locale_nonblank_check', 'food_aliases_normalized_alias_nonblank_check'];
const servingChecks = ['serving_definitions_base_quantity_check', 'serving_definitions_label_nonblank_check',
  'serving_definitions_method_nonblank_check', 'serving_definitions_sort_order_check',
  'serving_definitions_source_record_reference_nonblank_check', 'serving_definitions_source_reference_snapshot_nonblank_check'];

test('taxonomy then servings and provenance lifecycle on one fresh isolated PostgreSQL target',
  { timeout: 120000 }, async (t) => {
    const { directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap } = await createMigrationHarness(t);
    const history = ['0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy', '0005_food_servings_provenance'];
    const ids = { user: randomUUID(), source: randomUUID(), food: randomUUID(), liquid: randomUUID(),
      revision: randomUUID(), liquidRevision: randomUUID() };
    const copyMigration = async (name: string) => writeFile(join(directory, `${name}.sql`),
      await readFile(new URL(`../../migrations/${name}.sql`, import.meta.url)));
    const insert = async (table: 'categories' | 'food_aliases' | 'serving_definitions' | 'foods' | 'food_sources', values: Values) => {
      const names = Object.keys(values);
      const result = await client.query<{ id: string }>(`INSERT INTO nutrasa.${table} (${names.join(',')})
        VALUES (${names.map((_, index) => `$${index + 1}`).join(',')}) RETURNING id`, Object.values(values));
      assert.ok(result.rows[0]);
      return result.rows[0].id;
    };
    const category = (changes: Values = {}) => insert('categories', {
      slug: randomUUID(), name: 'SYNTHETIC category', sort_order: 0, is_active: true, ...changes,
    });
    const alias = (changes: Values = {}) => insert('food_aliases', {
      food_id: ids.food, alias: 'SYNTHETIC alias', normalized_alias: randomUUID(), ...changes,
    });
    const serving = (changes: Values = {}) => insert('serving_definitions', {
      food_revision_id: ids.revision, label: 'SYNTHETIC measure, not a real conversion', base_quantity: '1',
      method: 'SYNTHETIC_UNREVIEWED', reviewed: false, sort_order: 0, source_id: ids.source,
      source_record_reference: 'SYNTHETIC record', source_reference_snapshot: 'Synthetic bibliography only', ...changes,
    });
    const bareFood = () => insert('foods', { canonical_name: 'SYNTHETIC', normalized_name: 'synthetic',
      food_type: 'SYNTHETIC_UNAPPROVED', publication_status: 'DRAFT' });
    const link = (food: string, classification: string, primary: boolean) => client.query(
      'INSERT INTO nutrasa.food_categories (food_id,category_id,is_primary) VALUES ($1,$2,$3)', [food, classification, primary]);

    // Each behavior checkpoint rolls back its synthetic rows; expected SQL errors need savepoints.
    const reject = async (execute: () => Promise<unknown>, expected: { code: string; constraint?: string; column?: string }) => {
      await client.query('SAVEPOINT expected_error');
      try { await assert.rejects(execute, expected); }
      finally {
        await client.query('ROLLBACK TO SAVEPOINT expected_error');
        await client.query('RELEASE SAVEPOINT expected_error');
      }
    };
    const isolated = (name: string, execute: () => Promise<void>) => scenario(name, async () => {
      await client.query('BEGIN');
      try { await execute(); } finally { await client.query('ROLLBACK'); }
    });
    const readColumns = async (table: string) => (await client.query<{
      name: string; type: string; not_null: boolean; expression: string | null;
    }>(`SELECT a.attname::text AS name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS expression
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [`nutrasa.${table}`])).rows;
    const assertColumns = async (tables: string[]) => {
      for (const table of tables) {
        const expected = columns[table];
        assert.ok(expected);
        const actual = await readColumns(table);
        assert.deepEqual(actual.map(row => [row.name, row.type, row.not_null]), expected.map(row => row.slice(0, 3)));
        for (const [index, column] of expected.entries()) {
          if (column[3]) assert.match(actual[index]?.expression ?? '', /^(pg_catalog\.)?gen_random_uuid\(\)$/);
          else assert.equal(actual[index]?.expression, null, `${table}.${column[0]} must have no default`);
        }
      }
    };
    const snapshot = async (tables: string[], omitProvenance = false) => {
      const ignored = omitProvenance ? provenance : [];
      const ignoredChecks = omitProvenance ? provenanceChecks : [];
      const structure = (await client.query<{
        name: string; oid: string; owner: string; definitions: string[]; constraints: string[]; indexes: string[];
      }>(`SELECT c.relname::text AS name,c.oid::text AS oid,pg_catalog.pg_get_userbyid(c.relowner) AS owner,
        ARRAY(SELECT a.attname::text || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
          || ':' || a.attnotnull::text || ':' || COALESCE(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND NOT (a.attname::text=ANY($2::text[]))
          ORDER BY a.attnum) AS definitions,
        ARRAY(SELECT p.conname::text || ':' || pg_catalog.pg_get_constraintdef(p.oid)
          FROM pg_catalog.pg_constraint p WHERE p.conrelid=c.oid AND NOT (p.conname::text=ANY($3::text[]))
          ORDER BY p.conname) AS constraints,
        ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid) FROM pg_catalog.pg_index i
          WHERE i.indrelid=c.oid ORDER BY i.indexrelid) AS indexes
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='nutrasa' AND c.relkind='r' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
      [tables, ignored, ignoredChecks])).rows;
      const rows: Record<string, string[]> = {};
      for (const table of tables) rows[table] = (await client.query<{ row: string }>(
        `SELECT (to_jsonb(t) - $1::text[])::text AS row FROM nutrasa.${table} t ORDER BY 1`, [ignored],
      )).rows.map(row => row.row);
      assert.equal(structure.length, tables.length);
      return { structure, rows };
    };
    const keys = async (tables: string[]) => {
      const rows = (await client.query<{ table_name: string; kind: string; columns: string[]; target: string | null;
        target_columns: string[]; update_action: string; delete_action: string; match_type: string;
        deferrable: boolean; deferred: boolean; validated: boolean }>(`SELECT r.relname::text AS table_name,c.contype::text AS kind,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
        CASE WHEN c.contype='f' THEN c.confrelid::regclass::text ELSE NULL END AS target,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS target_columns,
        c.confupdtype::text AS update_action,c.confdeltype::text AS delete_action,c.confmatchtype::text AS match_type,
        c.condeferrable AS deferrable,c.condeferred AS deferred,c.convalidated AS validated
        FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND c.contype IN ('p','u','f')`, [tables])).rows;
      assert.ok(rows.every(row => !row.deferrable && !row.deferred && row.validated));
      for (const row of rows.filter(row => row.kind === 'f'))
        assert.deepEqual([row.update_action, row.delete_action, row.match_type], ['r', 'r', 's']);
      return rows.map(row => [row.table_name, row.kind, row.columns, row.target?.split('.').at(-1) ?? null, row.target_columns]);
    };
    const sorted = (rows: readonly unknown[]) => rows.map(row => JSON.stringify(row)).sort();
    const indexes = async (tables: string[]) => {
      const rows = (await client.query<{ name: string; columns: string[]; is_unique: boolean; is_primary: boolean;
        predicate: string | null; method: string; valid: boolean; plain: boolean }>(`SELECT ic.relname::text AS name,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
        i.indisunique AS is_unique,i.indisprimary AS is_primary,pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,
        am.amname::text AS method,(i.indisvalid AND i.indisready) AS valid,
        (i.indexprs IS NULL AND i.indnatts=i.indnkeyatts) AS plain
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid=ic.relam
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) ORDER BY ic.relname`, [tables])).rows;
      assert.ok(rows.every(row => row.method === 'btree' && row.valid && row.plain));
      return rows.map(row => [row.name, row.columns, row.is_unique, row.is_primary, row.predicate]);
    };
    const checkNames = async (tables: string[]) => (await client.query<{ name: string }>(`SELECT c.conname::text AS name
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND c.contype='c' ORDER BY c.conname`, [tables])).rows.map(row => row.name);
    const noTriggers = async (tables: string[]) => assert.equal((await client.query(`SELECT t.oid
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND NOT t.tgisinternal`, [tables])).rowCount, 0);
    const restrict = async (table: 'categories' | 'foods' | 'food_sources' | 'food_revisions', id: string, constraint: string) => {
      await reject(() => client.query(`DELETE FROM nutrasa.${table} WHERE id=$1`, [id]), { code: '23001', constraint });
      await reject(() => client.query(`UPDATE nutrasa.${table} SET id=$1 WHERE id=$2`, [randomUUID(), id]), { code: '23001', constraint });
    };

    await scenario('bootstrap once and apply immutable 0001-0003 with protected synthetic rows', async () => {
      await bootstrap();
      for (const name of history.slice(0, 3)) await copyMigration(name);
      await migrate('up');
      await client.query("INSERT INTO nutrasa.app_users (id,firebase_uid,account_status) VALUES ($1,'synthetic_foundation_owner','ACTIVE')", [ids.user]);
      await client.query(`INSERT INTO nutrasa.user_profiles
        (user_id,date_of_birth,height_cm,calculation_parameter,activity_level,goal_type,onboarding_completed_at)
        VALUES ($1,'1990-01-01','170.25','SYNTHETIC_UNAPPROVED','moderate','maintenance','2026-01-01T00:00:00Z')`, [ids.user]);
      await client.query(`INSERT INTO nutrasa.user_preferences (user_id,language_code,time_zone,preferred_weight_unit)
        VALUES ($1,'id-ID','Asia/Jakarta','kg')`, [ids.user]);
      await client.query(`INSERT INTO nutrasa.privacy_acknowledgements (user_id,notice_version,ack_type)
        VALUES ($1,'SYNTHETIC_NOT_A_LEGAL_NOTICE','SYNTHETIC_STORAGE_TEST')`, [ids.user]);
      await insert('food_sources', { id: ids.source, name: 'SYNTHETIC', source_type: 'SYNTHETIC',
        reference: 'Synthetic bibliography, not a licensed source', license_status: 'UNVERIFIED' });
      for (const [food, revision, unit] of [[ids.food, ids.revision, 'g'], [ids.liquid, ids.liquidRevision, 'ml']]) {
        await insert('foods', { id: food, canonical_name: 'SYNTHETIC', normalized_name: 'synthetic',
          food_type: 'SYNTHETIC_UNAPPROVED', publication_status: 'DRAFT' });
        await client.query(`INSERT INTO nutrasa.food_revisions
          (id,food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method,quality_status)
          VALUES ($1,$2,1,$3,'100',$4,'SYNTHETIC','SYNTHETIC_UNAPPROVED','DRAFT')`, [revision, food, ids.source, unit]);
      }
      await client.query(`INSERT INTO nutrasa.food_revision_nutrients (food_revision_id,nutrient_code,value)
        VALUES ($1,'energy_kcal','0'),($1,'sugar_g',NULL)`, [ids.revision]);
      await expectState(history.slice(0, 3), 3);
      await assertLockReleased(observer);
    });
    const before = await snapshot(baseline);
    const originalColumns = await readColumns('food_revisions');
    const originalChecks = await checkNames(['food_revisions']);
    assert.equal(originalColumns.length, 10);
    const protectedState = async () => assert.deepEqual(await snapshot(baseline, true), before);

    await scenario('0004 failure after actual DDL rolls back taxonomy history and checksum', async () => {
      await copyMigration(history[3]);
      const failure = join(directory, '0005_failure.sql');
      await writeFile(failure, await readFile(new URL('./fixtures/food-taxonomy/0005_failure.sql', import.meta.url)));
      try {
        await assert.rejects(migrate('up'), { code: '22012' });
        for (const table of taxonomy) assert.equal(await tableExists(table), false);
        await expectState(history.slice(0, 3), 3);
        await protectedState();
        await assertLockReleased(observer);
      } finally { await rm(failure); }
    });
    await scenario('0004 UP commits only taxonomy with unchanged protected domains', async () => {
      await migrate('up');
      await expectState(history.slice(0, 4), 4);
      await protectedState();
      await assertLockReleased(observer);
    });
    await scenario('taxonomy has exactly 6/3/5 columns and only approved UUID defaults', () => assertColumns(taxonomy));
    await scenario('taxonomy PK unique keys and four RESTRICT foreign keys match exactly', async () => {
      assert.deepEqual(sorted(await keys(taxonomy)), sorted([
        ['categories', 'p', ['id'], null, []], ['categories', 'u', ['slug'], null, []],
        ['categories', 'f', ['parent_id'], 'categories', ['id']],
        ['food_categories', 'p', ['food_id', 'category_id'], null, []],
        ['food_categories', 'f', ['food_id'], 'foods', ['id']],
        ['food_categories', 'f', ['category_id'], 'categories', ['id']],
        ['food_aliases', 'p', ['id'], null, []], ['food_aliases', 'u', ['food_id', 'normalized_alias'], null, []],
        ['food_aliases', 'f', ['food_id'], 'foods', ['id']],
      ]));
    });
    await scenario('taxonomy has exactly eight B-tree indexes seven CHECKs and no user triggers', async () => {
      assert.deepEqual(await indexes(taxonomy), [
        ['categories_pkey', ['id'], true, true, null], ['categories_slug_key', ['slug'], true, false, null],
        ['food_aliases_food_normalized_alias_key', ['food_id', 'normalized_alias'], true, false, null],
        ['food_aliases_normalized_alias_idx', ['normalized_alias'], false, false, null],
        ['food_aliases_pkey', ['id'], true, true, null],
        ['food_categories_category_food_idx', ['category_id', 'food_id'], false, false, null],
        ['food_categories_one_primary_idx', ['food_id'], true, false, 'is_primary'],
        ['food_categories_pkey', ['food_id', 'category_id'], true, true, null],
      ]);
      assert.deepEqual(await checkNames(taxonomy), [...taxonomyChecks].sort());
      await noTriggers(taxonomy);
    });
    await isolated('category roots children duplicate names and explicit booleans remain structural', async () => {
      const parent = await category({ name: '  SYNTHETIC Nama Daerah  ', is_active: false });
      const child = await category({ parent_id: parent, name: '  SYNTHETIC Nama Daerah  ', sort_order: 1 });
      assert.notEqual(parent, child);
      assert.match(parent, /^[a-f0-9-]{36}$/);
      assert.deepEqual((await client.query('SELECT parent_id,name,sort_order,is_active FROM nutrasa.categories WHERE id=$1', [parent])).rows,
        [{ parent_id: null, name: '  SYNTHETIC Nama Daerah  ', sort_order: 0, is_active: false }]);
      await reject(() => category({ slug: parent, id: parent }), { code: '23505', constraint: 'categories_pkey' });
      const slug = randomUUID();
      await category({ slug });
      await reject(() => category({ slug }), { code: '23505', constraint: 'categories_slug_key' });
      await reject(() => category({ parent_id: randomUUID() }), { code: '23503', constraint: 'categories_parent_id_fkey' });
      const self = randomUUID();
      await reject(() => category({ id: self, parent_id: self }), { code: '23514', constraint: 'categories_parent_not_self_check' });
      await reject(() => category({ sort_order: -1 }), { code: '23514', constraint: 'categories_sort_order_check' });
      await restrict('categories', parent, 'categories_parent_id_fkey');
    });
    await isolated('all required taxonomy fields reject NULL and all text checks reject whitespace', async () => {
      const cat = await category();
      const alternate = await alias();
      await link(ids.food, cat, false);
      for (const [table, idColumn, id] of [['categories', 'id', cat], ['food_aliases', 'id', alternate],
        ['food_categories', 'food_id', ids.food]]) {
        for (const [column,, notNull] of columns[table] ?? []) if (notNull)
          await reject(() => client.query(`UPDATE nutrasa.${table} SET ${column}=NULL WHERE ${idColumn}=$1`, [id]), { code: '23502', column });
      }
      for (const blank of ['', ' ', '\t', '\n', ' \t\r\n ']) {
        for (const column of ['slug', 'name']) await reject(() => category({ [column]: blank }),
          { code: '23514', constraint: `categories_${column}_nonblank_check` });
        for (const column of ['alias', 'normalized_alias', 'locale']) await reject(() => alias({ [column]: blank }),
          { code: '23514', constraint: `food_aliases_${column}_nonblank_check` });
      }
      await reject(() => client.query("INSERT INTO nutrasa.categories (slug,name,sort_order) VALUES ('synthetic-missing','SYNTHETIC',0)"),
        { code: '23502', column: 'is_active' });
    });
    await isolated('classification allows zero or one primary rejects duplicates and validates both references', async () => {
      const first = await category();
      const second = await category();
      const third = await category();
      await link(ids.food, first, false);
      await link(ids.food, second, false);
      await link(ids.food, third, true);
      await link(ids.liquid, first, true);
      await reject(() => link(ids.food, second, false), { code: '23505', constraint: 'food_categories_pkey' });
      await reject(() => client.query('UPDATE nutrasa.food_categories SET is_primary=true WHERE food_id=$1 AND category_id=$2', [ids.food, first]),
        { code: '23505', constraint: 'food_categories_one_primary_idx' });
      await reject(() => link(randomUUID(), first, false), { code: '23503', constraint: 'food_categories_food_id_fkey' });
      await reject(() => link(ids.food, randomUUID(), false), { code: '23503', constraint: 'food_categories_category_id_fkey' });
      const food = await bareFood();
      const cat = await category();
      await link(food, cat, false);
      await restrict('foods', food, 'food_categories_food_id_fkey');
      await restrict('categories', cat, 'food_categories_category_id_fkey');
    });
    await isolated('aliases preserve regional text NULL locale and ambiguity across foods without normalization claims', async () => {
      const text = '  SYNTHETIC Nama Daerah é  ';
      const first = await alias({ alias: text, normalized_alias: text });
      const second = await alias({ food_id: ids.liquid, normalized_alias: text });
      assert.notEqual(first, second);
      assert.deepEqual((await client.query('SELECT alias,normalized_alias,locale FROM nutrasa.food_aliases WHERE id=$1', [first])).rows,
        [{ alias: text, normalized_alias: text, locale: null }]);
      await reject(() => alias({ normalized_alias: text, locale: 'SYNTHETIC_OTHER_LOCALE' }),
        { code: '23505', constraint: 'food_aliases_food_normalized_alias_key' });
      await reject(() => alias({ id: first }), { code: '23505', constraint: 'food_aliases_pkey' });
      await reject(() => alias({ food_id: randomUUID() }), { code: '23503', constraint: 'food_aliases_food_id_fkey' });
      const food = await bareFood();
      await alias({ food_id: food });
      await restrict('foods', food, 'food_aliases_food_id_fkey');
    });
    await scenario('0004 DOWN preserves the populated baseline and immutable checksum', async () => {
      const root = await category();
      const child = await category({ parent_id: root });
      await link(ids.food, child, true);
      await alias();
      await migrate('down');
      for (const table of taxonomy) assert.equal(await tableExists(table), false);
      await expectState(history.slice(0, 3), 4);
      await protectedState();
      await assertLockReleased(observer);
    });
    await scenario('identical 0004 UP and re-run restore empty taxonomy without duplicated metadata', async () => {
      await migrate('up');
      await assertColumns(taxonomy);
      for (const table of taxonomy) assert.equal((await client.query(`SELECT * FROM nutrasa.${table}`)).rowCount, 0);
      const state = await snapshot(taxonomy);
      assert.deepEqual(await migrate('up'), []);
      assert.deepEqual(await snapshot(taxonomy), state);
      await expectState(history.slice(0, 4), 4);
      await protectedState();
      await assertLockReleased(observer);
    });
    // These rows prove 0005 preserves populated taxonomy, not merely empty tables.
    const retainedCategory = await category();
    await link(ids.food, retainedCategory, true);
    await alias({ normalized_alias: 'synthetic retained alias' });
    const retainedTaxonomy = await snapshot(taxonomy);
    const expectRetained = async () => {
      await protectedState();
      assert.deepEqual(await snapshot(taxonomy), retainedTaxonomy);
    };

    await scenario('0005 failure rolls back both revision ALTER and servings DDL history and checksum', async () => {
      await copyMigration(history[4]);
      const failure = join(directory, '0006_failure.sql');
      await writeFile(failure, await readFile(new URL('./fixtures/food-servings/0006_failure.sql', import.meta.url)));
      try {
        await assert.rejects(migrate('up'), { code: '22012' });
        assert.equal(await tableExists('serving_definitions'), false);
        assert.deepEqual(await readColumns('food_revisions'), originalColumns);
        assert.deepEqual(await checkNames(['food_revisions']), originalChecks);
        await expectState(history.slice(0, 4), 4);
        await expectRetained();
        await assertLockReleased(observer);
      } finally { await rm(failure); }
    });
    await scenario('0005 UP commits servings and nullable provenance without backfill or changes to prior rows', async () => {
      await migrate('up');
      await expectState(history, 5);
      await expectRetained();
      assert.deepEqual((await client.query('SELECT source_record_reference,source_reference_snapshot FROM nutrasa.food_revisions ORDER BY id')).rows,
        [{ source_record_reference: null, source_reference_snapshot: null }, { source_record_reference: null, source_reference_snapshot: null }]);
      await assertLockReleased(observer);
    });
    await scenario('servings has ten columns and revisions gain only the two nullable text columns', async () => {
      await assertColumns(['serving_definitions']);
      assert.deepEqual(await readColumns('food_revisions'), [...originalColumns,
        ...provenance.map(name => ({ name, type: 'text', not_null: false, expression: null }))]);
      assert.equal((await readColumns('food_revisions')).length, 12);
    });
    await scenario('servings PK two RESTRICT foreign keys two indexes and nine new CHECKs match exactly', async () => {
      assert.deepEqual(sorted(await keys(['serving_definitions'])), sorted([
        ['serving_definitions', 'p', ['id'], null, []],
        ['serving_definitions', 'f', ['food_revision_id'], 'food_revisions', ['id']],
        ['serving_definitions', 'f', ['source_id'], 'food_sources', ['id']],
      ]));
      assert.deepEqual(await indexes(['serving_definitions']), [
        ['serving_definitions_pkey', ['id'], true, true, null],
        ['serving_definitions_revision_sort_idx', ['food_revision_id', 'sort_order'], false, false, null],
      ]);
      assert.deepEqual(await checkNames(['serving_definitions']), [...servingChecks].sort());
      assert.deepEqual(await checkNames(['food_revisions']), [...originalChecks, ...provenanceChecks].sort());
      await noTriggers(['serving_definitions', 'food_revisions']);
    });
    await isolated('revision provenance accepts paired NULL or nonblank references and rejects every partial pair', async () => {
      const update = (record: string | null, reference: string | null) => client.query(
        'UPDATE nutrasa.food_revisions SET source_record_reference=$1,source_reference_snapshot=$2 WHERE id=$3', [record, reference, ids.revision]);
      await update(null, null);
      const record = '  SYNTHETIC page/table/code  ';
      const reference = '  Synthetic bibliography, edition only if known  ';
      await update(record, reference);
      assert.deepEqual((await client.query('SELECT source_record_reference,source_reference_snapshot FROM nutrasa.food_revisions WHERE id=$1', [ids.revision])).rows,
        [{ source_record_reference: record, source_reference_snapshot: reference }]);
      for (const pair of [[null, reference], [record, null]]) await reject(() => update(pair[0], pair[1]),
        { code: '23514', constraint: 'food_revisions_source_provenance_pair_check' });
      for (const blank of ['', ' ', '\t', '\n', ' \t\r\n ']) {
        await reject(() => update(blank, reference), { code: '23514', constraint: 'food_revisions_source_record_reference_nonblank_check' });
        await reject(() => update(record, blank), { code: '23514', constraint: 'food_revisions_source_reference_snapshot_nonblank_check' });
      }
      await update(null, null);
    });
    await isolated('all ten serving fields are required and text evidence rejects whitespace without trimming', async () => {
      const text = '  SYNTHETIC arbitrary reference, not a URL  ';
      const id = await serving({ label: text, method: text, source_record_reference: text, source_reference_snapshot: text });
      for (const [column] of columns.serving_definitions) await reject(() => client.query(
        `UPDATE nutrasa.serving_definitions SET ${column}=NULL WHERE id=$1`, [id]), { code: '23502', column });
      for (const column of ['label', 'method', ...provenance]) {
        for (const blank of ['', ' ', '\t', '\n', ' \t\r\n ']) await reject(() => serving({ [column]: blank }),
          { code: '23514', constraint: `serving_definitions_${column}_nonblank_check` });
      }
      assert.deepEqual((await client.query(`SELECT label,method,source_record_reference,source_reference_snapshot,reviewed,sort_order
        FROM nutrasa.serving_definitions WHERE id=$1`, [id])).rows,
      [{ label: text, method: text, source_record_reference: text, source_reference_snapshot: text, reviewed: false, sort_order: 0 }]);
      await reject(() => serving({ sort_order: -1 }), { code: '23514', constraint: 'serving_definitions_sort_order_check' });
    });
    await isolated('serving UUIDs and positive finite decimals reject duplicate ids NaN overflow zero and negatives', async () => {
      const first = await serving({ base_quantity: '0.00001' });
      const second = await serving({ base_quantity: '999999999.99999' });
      assert.notEqual(first, second);
      assert.match(first, /^[a-f0-9-]{36}$/);
      await reject(() => serving({ id: first }), { code: '23505', constraint: 'serving_definitions_pkey' });
      for (const value of ['0', '-1', 'NaN']) await reject(() => serving({ base_quantity: value }),
        { code: '23514', constraint: 'serving_definitions_base_quantity_check' });
      for (const value of ['Infinity', '-Infinity', '1000000000']) await reject(() => serving({ base_quantity: value }), { code: '22003' });
      const coerced = await serving({ base_quantity: '1.234567' });
      assert.equal((await client.query<{ value: string }>(
        'SELECT base_quantity::text AS value FROM nutrasa.serving_definitions WHERE id=$1', [coerced])).rows[0]?.value, '1.23457');
    });
    await isolated('serving source and revision FKs reject missing references and RESTRICT parent deletion or id changes', async () => {
      await reject(() => serving({ food_revision_id: randomUUID() }), { code: '23503', constraint: 'serving_definitions_food_revision_id_fkey' });
      await reject(() => serving({ source_id: randomUUID() }), { code: '23503', constraint: 'serving_definitions_source_id_fkey' });
      const source = await insert('food_sources', { name: 'SYNTHETIC portion source', source_type: 'SYNTHETIC',
        reference: 'Synthetic bibliography only', license_status: 'UNVERIFIED' });
      await serving({ food_revision_id: ids.liquidRevision, source_id: source });
      await restrict('food_revisions', ids.liquidRevision, 'serving_definitions_food_revision_id_fkey');
      await restrict('food_sources', source, 'serving_definitions_source_id_fkey');
    });
    await isolated('serving DTO unit is joined from its own g or ml revision with independent source evidence', async () => {
      const source = await insert('food_sources', { name: 'SYNTHETIC other source', source_type: 'SYNTHETIC',
        reference: 'Synthetic evidence only', license_status: 'UNVERIFIED' });
      for (const [revision, unit] of [[ids.revision, 'g'], [ids.liquidRevision, 'ml']]) {
        const id = await serving({ food_revision_id: revision, source_id: source, reviewed: true, base_quantity: '2.5' });
        assert.deepEqual((await client.query(`SELECT s.base_quantity::text AS base_quantity,r.basis_unit AS base_unit,s.reviewed,
          s.source_id=r.source_id AS same_source FROM nutrasa.serving_definitions s
          JOIN nutrasa.food_revisions r ON r.id=s.food_revision_id WHERE s.id=$1`, [id])).rows,
        [{ base_quantity: '2.50000', base_unit: unit, reviewed: true, same_source: false }]);
      }
    });
    await scenario('0005 DOWN drops only servings and added provenance while retaining populated taxonomy and all five checksums', async () => {
      await serving();
      await client.query(`UPDATE nutrasa.food_revisions SET source_record_reference='SYNTHETIC locator',
        source_reference_snapshot='Synthetic bibliography only' WHERE id=$1`, [ids.revision]);
      await migrate('down');
      assert.equal(await tableExists('serving_definitions'), false);
      assert.deepEqual(await readColumns('food_revisions'), originalColumns);
      assert.deepEqual(await checkNames(['food_revisions']), originalChecks);
      await expectState(history.slice(0, 4), 5);
      await expectRetained();
      await assertLockReleased(observer);
    });
    await scenario('identical 0005 UP and re-run preserve all prior data history and checksum baselines', async () => {
      await migrate('up');
      assert.equal((await client.query('SELECT * FROM nutrasa.serving_definitions')).rowCount, 0);
      await assertColumns(['serving_definitions']);
      const final = await snapshot([...baseline, ...taxonomy, 'serving_definitions']);
      assert.deepEqual(await migrate('up'), []);
      assert.deepEqual(await snapshot([...baseline, ...taxonomy, 'serving_definitions']), final);
      await expectState(history, 5);
      await expectRetained();
      assert.deepEqual(await readColumns('food_revisions'), [...originalColumns,
        ...provenance.map(name => ({ name, type: 'text', not_null: false, expression: null }))]);
      assert.deepEqual((await client.query('SELECT source_record_reference,source_reference_snapshot FROM nutrasa.food_revisions ORDER BY id')).rows,
        [{ source_record_reference: null, source_reference_snapshot: null }, { source_record_reference: null, source_reference_snapshot: null }]);
      assert.deepEqual((await client.query(`SELECT nutrient_code,value::text AS value FROM nutrasa.food_revision_nutrients
        WHERE food_revision_id=$1 ORDER BY nutrient_code`, [ids.revision])).rows,
      [{ nutrient_code: 'energy_kcal', value: '0.00000' }, { nutrient_code: 'sugar_g', value: null }]);
      const tables = (await client.query<{ name: string; owned: boolean }>(`SELECT c.relname::text AS name,
        c.relowner=current_user::regrole AS owned FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='nutrasa' AND c.relkind='r' ORDER BY c.relname`)).rows;
      assert.deepEqual(tables.map(row => row.name), [...baseline, ...taxonomy, 'serving_definitions'].sort());
      assert.ok(tables.every(row => row.owned));
      await assertLockReleased(observer);
    });
  });
