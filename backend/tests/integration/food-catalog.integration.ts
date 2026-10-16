import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { assertLockReleased, createMigrationHarness } from './harness.ts';

type Column = readonly [name: string, type: string, notNull: boolean, defaultKind: 'uuid' | 'now' | null];
const columns: Record<string, readonly Column[]> = {
  foods: [
    ['id', 'uuid', true, 'uuid'], ['canonical_name', 'text', true, null],
    ['normalized_name', 'text', true, null], ['food_type', 'text', true, null], ['region', 'text', false, null],
    ['publication_status', 'text', true, null], ['current_published_revision_id', 'uuid', false, null],
    ['created_at', 'timestamp with time zone', true, 'now'], ['updated_at', 'timestamp with time zone', true, 'now'],
  ],
  food_revisions: [
    ['id', 'uuid', true, 'uuid'], ['food_id', 'uuid', true, null], ['revision_number', 'integer', true, null],
    ['source_id', 'uuid', true, null], ['basis_quantity', 'numeric(14,5)', true, null],
    ['basis_unit', 'text', true, null], ['composition_definition', 'text', true, null],
    ['source_method', 'text', true, null], ['quality_status', 'text', true, null],
    ['published_at', 'timestamp with time zone', false, null],
  ],
  food_revision_nutrients: [
    ['food_revision_id', 'uuid', true, null], ['nutrient_code', 'text', true, null], ['value', 'numeric(14,5)', false, null],
  ],
};
const catalogTables = Object.keys(columns).sort();
const protectedTables = ['app_users', 'food_sources', 'privacy_acknowledgements', 'user_preferences', 'user_profiles'];
const codes = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'sugar_g',
  'saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg'];
const publishedAt = '2026-01-01T00:00:00Z';

interface FoodInput {
  canonical_name: string | null;
  normalized_name: string | null;
  food_type: string | null;
  region: string | null;
  publication_status: string | null;
}
interface RevisionInput {
  food_id: string | null;
  revision_number: number | null;
  source_id: string | null;
  basis_quantity: string | null;
  basis_unit: string | null;
  composition_definition: string | null;
  source_method: string | null;
  quality_status: string | null;
  published_at: string | null;
}

test('food catalog structural constraints and lifecycle preserve identity and sources on a fresh isolated target',
  { timeout: 90000 }, async (t) => {
    const { directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap } =
      await createMigrationHarness(t);
    const copyMigration = async (name: string) => writeFile(join(directory, name),
      await readFile(new URL(`../../migrations/${name}`, import.meta.url)));
    const history = ['0001_identity', '0002_food_sources', '0003_food_catalog'];
    let sourceId: string;

    const createFood = async (overrides: Partial<FoodInput> = {}) => {
      const row: FoodInput = { canonical_name: 'SYNTHETIC food', normalized_name: 'synthetic food',
        food_type: 'SYNTHETIC_UNAPPROVED', region: null, publication_status: 'DRAFT', ...overrides };
      const result = await client.query<{ id: string }>(`INSERT INTO nutrasa.foods
        (canonical_name, normalized_name, food_type, region, publication_status)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [row.canonical_name, row.normalized_name, row.food_type, row.region, row.publication_status]);
      const inserted = result.rows[0];
      assert.ok(inserted);
      return inserted.id;
    };
    const createRevision = async (foodId: string, overrides: Partial<RevisionInput> = {}) => {
      const row: RevisionInput = { food_id: foodId, revision_number: 1, source_id: sourceId,
        basis_quantity: '100', basis_unit: 'g', composition_definition: 'SYNTHETIC storage composition only',
        source_method: 'SYNTHETIC_UNAPPROVED', quality_status: 'DRAFT', published_at: null, ...overrides };
      const result = await client.query<{ id: string }>(`INSERT INTO nutrasa.food_revisions
        (food_id, revision_number, source_id, basis_quantity, basis_unit, composition_definition,
         source_method, quality_status, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [row.food_id, row.revision_number, row.source_id, row.basis_quantity, row.basis_unit,
        row.composition_definition, row.source_method, row.quality_status, row.published_at]);
      const inserted = result.rows[0];
      assert.ok(inserted);
      return inserted.id;
    };
    const insertNutrient = (revision: string, code: string, value: string | null) => client.query(
      'INSERT INTO nutrasa.food_revision_nutrients (food_revision_id, nutrient_code, value) VALUES ($1,$2,$3)',
      [revision, code, value]);
    const structure = async (tables: string[]) => (await client.query<{
      name: string; oid: string; owner: string; definitions: string[]; constraints: string[]; indexes: string[];
    }>(`SELECT c.relname::text AS name, c.oid::text AS oid, pg_catalog.pg_get_userbyid(c.relowner) AS owner,
      ARRAY(SELECT a.attname::text || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   || ':' || a.attnotnull::text || ':' || COALESCE(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')
            FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
              ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS definitions,
      ARRAY(SELECT p.conname::text || ':' || pg_catalog.pg_get_constraintdef(p.oid)
            FROM pg_catalog.pg_constraint p WHERE p.conrelid = c.oid ORDER BY p.conname) AS constraints,
      ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid) FROM pg_catalog.pg_index i
            WHERE i.indrelid = c.oid ORDER BY i.indexrelid) AS indexes
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'nutrasa' AND c.relkind = 'r' AND c.relname = ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
    const protectedState = async () => {
      const rows: Record<string, string[]> = {};
      for (const table of protectedTables) {
        rows[table] = (await client.query<{ row: string }>(
          `SELECT row_to_json(t)::text AS row FROM nutrasa.${table} t ORDER BY 1`,
        )).rows.map(row => row.row);
      }
      return { structure: await structure(protectedTables), rows };
    };

    await scenario('bootstrap fresh target and establish both historical migrations with synthetic identity and source rows', async () => {
      await bootstrap();
      await copyMigration('0001_identity.sql');
      await copyMigration('0002_food_sources.sql');
      await migrate('up');
      const user = (await client.query<{ id: string }>(`INSERT INTO nutrasa.app_users (firebase_uid, account_status)
        VALUES ('synthetic_catalog_owner', 'ACTIVE') RETURNING id`)).rows[0];
      assert.ok(user);
      await client.query(`INSERT INTO nutrasa.user_profiles
        (user_id, date_of_birth, height_cm, calculation_parameter, activity_level, goal_type, onboarding_completed_at)
        VALUES ($1,'1990-01-01','170.25','SYNTHETIC_UNAPPROVED','moderate','maintenance',$2)`, [user.id, publishedAt]);
      await client.query(`INSERT INTO nutrasa.user_preferences (user_id,language_code,time_zone,preferred_weight_unit)
        VALUES ($1,'id-ID','Asia/Jakarta','kg')`, [user.id]);
      await client.query(`INSERT INTO nutrasa.privacy_acknowledgements (user_id,notice_version,ack_type)
        VALUES ($1,'SYNTHETIC_NOT_A_LEGAL_NOTICE','SYNTHETIC_STORAGE_TEST')`, [user.id]);
      const source = (await client.query<{ id: string }>(`INSERT INTO nutrasa.food_sources
        (name,source_type,reference,license_status)
        VALUES ('SYNTHETIC registry','SYNTHETIC','Synthetic bibliography, not a licensed food source','UNVERIFIED') RETURNING id`)).rows[0];
      assert.ok(source);
      sourceId = source.id;
      await expectState(history.slice(0, 2), 2);
      await assertLockReleased(observer);
    });
    const before = await protectedState();
    assert.equal(before.structure.length, 5);
    for (const rows of Object.values(before.rows)) assert.equal(rows.length, 1);
    const expectProtected = async () => assert.deepEqual(await protectedState(), before);
    await copyMigration('0003_food_catalog.sql');

    await scenario('failure after actual catalog DDL rolls back all three tables, history and checksum as one batch', async () => {
      const failure = join(directory, '0004_failure.sql');
      await writeFile(failure, await readFile(new URL('./fixtures/food-catalog/0004_failure.sql', import.meta.url)));
      try {
        await assert.rejects(migrate('up'), { code: '22012' });
        for (const table of catalogTables) assert.equal(await tableExists(table), false);
        await expectState(history.slice(0, 2), 2);
        await expectProtected();
        await assertLockReleased(observer);
      } finally {
        await rm(failure);
      }
    });
    await scenario('actual UP commits catalog history and checksum without changing identity or sources', async () => {
      await migrate('up');
      await expectState(history, 3);
      await expectProtected();
      const tables = (await client.query<{ name: string; owned: boolean }>(`SELECT c.relname::text AS name,
        c.relowner = current_user::regrole AS owned FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='nutrasa' AND c.relkind='r' ORDER BY c.relname`)).rows;
      assert.deepEqual(tables.map(row => row.name), [...protectedTables, ...catalogTables].sort());
      assert.ok(tables.every(row => row.owned));
      await assertLockReleased(observer);
    });
    await scenario('exactly 9/10/3 columns match types, nullability and only approved technical defaults', async () => {
      for (const [table, expected] of Object.entries(columns)) {
        const actual = (await client.query<{ name: string; type: string; not_null: boolean; expression: string | null }>(`
          SELECT a.attname::text AS name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
                 a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS expression
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [`nutrasa.${table}`])).rows;
        assert.deepEqual(actual.map(row => [row.name,row.type,row.not_null]), expected.map(([name,type,nn]) => [name,type,nn]));
        for (const [index, column] of expected.entries()) {
          const expression = actual[index]?.expression;
          if (column[3] === null) assert.equal(expression, null, `${table}.${column[0]}`);
          else assert.match(expression ?? '', column[3] === 'uuid' ? /^(pg_catalog\.)?gen_random_uuid\(\)$/ : /^(pg_catalog\.)?now\(\)$/);
        }
      }
    });
    await scenario('three PKs, two unique keys and exactly four RESTRICT foreign keys including the same-food pointer match the contract', async () => {
      const keys = (await client.query<{ table_name: string; kind: string; columns: string[]; target: string | null;
        target_columns: string[]; update_action: string; delete_action: string; match_type: string;
        deferrable: boolean; deferred: boolean; validated: boolean }>(`
        SELECT r.relname::text AS table_name, c.contype::text AS kind,
          ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
                JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
          CASE WHEN c.contype='f' THEN c.confrelid::regclass::text ELSE NULL END AS target,
          ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
                JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS target_columns,
          c.confupdtype::text AS update_action,c.confdeltype::text AS delete_action,c.confmatchtype::text AS match_type,
          c.condeferrable AS deferrable,c.condeferred AS deferred,c.convalidated AS validated
        FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND c.contype IN ('p','u','f')
        ORDER BY r.relname,c.contype,c.conname`, [catalogTables])).rows;
      assert.deepEqual(keys.filter(k => k.kind !== 'f').map(k => [k.table_name,k.kind,k.columns]), [
        ['food_revision_nutrients','p',['food_revision_id','nutrient_code']],
        ['food_revisions','p',['id']], ['food_revisions','u',['food_id','id']],
        ['food_revisions','u',['food_id','revision_number']], ['foods','p',['id']],
      ]);
      const fks = keys.filter(k => k.kind === 'f');
      assert.deepEqual(fks.map(k => [k.table_name,k.columns,k.target?.split('.').at(-1),k.target_columns]), [
        ['food_revision_nutrients',['food_revision_id'],'food_revisions',['id']],
        ['food_revisions',['food_id'],'foods',['id']], ['food_revisions',['source_id'],'food_sources',['id']],
        ['foods',['id','current_published_revision_id'],'food_revisions',['food_id','id']],
      ]);
      for (const fk of fks) assert.deepEqual([fk.update_action,fk.delete_action,fk.match_type], ['r','r','s']);
      assert.ok(keys.every(k => !k.deferrable && !k.deferred && k.validated));
    });
    await scenario('exactly six plain B-tree indexes, eighteen CHECKs and no user triggers exist', async () => {
      const indexes = (await client.query<{ name: string; columns: string[]; is_unique: boolean; is_primary: boolean;
        method: string; valid: boolean; plain: boolean }>(`SELECT ic.relname::text AS name,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord)
              JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
        i.indisunique AS is_unique,i.indisprimary AS is_primary,am.amname::text AS method,
        (i.indisvalid AND i.indisready) AS valid,(i.indpred IS NULL AND i.indexprs IS NULL) AS plain
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid=ic.relam
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) ORDER BY ic.relname`, [catalogTables])).rows;
      assert.deepEqual(indexes.map(i => [i.name,i.columns,i.is_unique,i.is_primary]), [
        ['food_revision_nutrients_pkey',['food_revision_id','nutrient_code'],true,true],
        ['food_revisions_food_id_id_key',['food_id','id'],true,false],
        ['food_revisions_food_revision_key',['food_id','revision_number'],true,false],
        ['food_revisions_pkey',['id'],true,true], ['foods_normalized_name_idx',['normalized_name'],false,false],
        ['foods_pkey',['id'],true,true],
      ]);
      assert.ok(indexes.every(i => i.method === 'btree' && i.valid && i.plain));
      const checks = (await client.query<{ name: string }>(`SELECT c.conname::text AS name FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND c.contype='c' ORDER BY c.conname`, [catalogTables])).rows;
      assert.deepEqual(checks.map(row => row.name), [
        'food_revision_nutrients_code_check','food_revision_nutrients_value_check',
        'food_revisions_basis_quantity_check','food_revisions_basis_unit_check',
        'food_revisions_composition_definition_nonblank_check','food_revisions_published_at_finite_check',
        'food_revisions_published_at_status_check','food_revisions_quality_status_check',
        'food_revisions_revision_number_check','food_revisions_source_method_nonblank_check',
        'foods_canonical_name_nonblank_check','foods_created_at_finite_check','foods_food_type_nonblank_check',
        'foods_normalized_name_nonblank_check','foods_publication_status_check','foods_published_pointer_check',
        'foods_region_nonblank_check','foods_updated_at_finite_check',
      ]);
      assert.equal((await client.query(`SELECT t.oid FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='nutrasa' AND r.relname=ANY($1::text[]) AND NOT t.tgisinternal`, [catalogTables])).rowCount, 0);
    });
    await scenario('UUID defaults, duplicate names, optional NULLs and required columns behave explicitly', async () => {
      const food = await createFood();
      const second = await createFood();
      assert.notEqual(food, second);
      assert.match(food, /^[a-f0-9-]{36}$/);
      const revision = await createRevision(food);
      const another = await createRevision(second);
      assert.notEqual(revision, another);
      assert.deepEqual((await client.query('SELECT region,current_published_revision_id FROM nutrasa.foods WHERE id=$1', [food])).rows,
        [{ region: null, current_published_revision_id: null }]);
      assert.deepEqual((await client.query('SELECT published_at FROM nutrasa.food_revisions WHERE id=$1', [revision])).rows, [{ published_at: null }]);
      for (const [table, id] of [['foods',food],['food_revisions',revision]] as const) {
        await assert.rejects(client.query(`INSERT INTO nutrasa.${table} SELECT * FROM nutrasa.${table} WHERE id=$1`, [id]), { code: '23505' });
        for (const [column,,nn] of columns[table] ?? []) if (nn) {
          await assert.rejects(client.query(`UPDATE nutrasa.${table} SET ${column}=NULL WHERE id=$1`, [id]), { code: '23502', column });
        }
      }
      await insertNutrient(revision, 'sugar_g', null);
      for (const column of ['food_revision_id','nutrient_code']) {
        await assert.rejects(client.query(`UPDATE nutrasa.food_revision_nutrients SET ${column}=NULL WHERE food_revision_id=$1`, [revision]),
          { code: '23502', column });
      }
      await assert.rejects(client.query("INSERT INTO nutrasa.foods (canonical_name,normalized_name,food_type) VALUES ('SYNTHETIC','synthetic','SYNTHETIC')"),
        { code: '23502', column: 'publication_status' });
      await assert.rejects(client.query(`INSERT INTO nutrasa.food_revisions
        (food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method)
        VALUES ($1,2,$2,100,'g','SYNTHETIC','SYNTHETIC')`, [food,sourceId]), { code: '23502', column: 'quality_status' });
    });
    await scenario('all text checks reject whitespace-only values without trimming valid text or inventing vocabularies', async () => {
      for (const blank of ['', ' ', '\t', '\n', ' \t\r\n ']) {
        for (const column of ['canonical_name','normalized_name','food_type','region'] as const) {
          await assert.rejects(createFood({ [column]: blank }), { code: '23514', constraint: `foods_${column}_nonblank_check` });
        }
        const food = await createFood();
        for (const column of ['composition_definition','source_method'] as const) {
          await assert.rejects(createRevision(food, { [column]: blank }), { code: '23514', constraint: `food_revisions_${column}_nonblank_check` });
        }
      }
      const name = '  SYNTHETIC arbitrary name  ';
      const food = await createFood({ canonical_name: name, normalized_name: name, food_type: name, region: name });
      const revision = await createRevision(food, { composition_definition: name, source_method: name });
      assert.deepEqual((await client.query('SELECT canonical_name,normalized_name,food_type,region FROM nutrasa.foods WHERE id=$1', [food])).rows,
        [{ canonical_name: name, normalized_name: name, food_type: name, region: name }]);
      assert.deepEqual((await client.query('SELECT composition_definition,source_method FROM nutrasa.food_revisions WHERE id=$1', [revision])).rows,
        [{ composition_definition: name, source_method: name }]);
    });
    await scenario('missing food/source/revision references and duplicate per-food revision numbers are rejected', async () => {
      const food = await createFood();
      const revision = await createRevision(food);
      await assert.rejects(createRevision(food), { code: '23505', constraint: 'food_revisions_food_revision_key' });
      await createRevision(food, { revision_number: 2 });
      await createRevision(await createFood());
      await assert.rejects(createRevision(food, { food_id: randomUUID() }), { code: '23503', constraint: 'food_revisions_food_id_fkey' });
      await assert.rejects(createRevision(food, { revision_number: 3, source_id: randomUUID() }),
        { code: '23503', constraint: 'food_revisions_source_id_fkey' });
      await assert.rejects(insertNutrient(randomUUID(), 'energy_kcal', '1'), { code: '23503', constraint: 'food_revision_nutrients_revision_fkey' });
      for (const number of [0, -1]) await assert.rejects(createRevision(food, { revision_number: number }),
        { code: '23514', constraint: 'food_revisions_revision_number_check' });
      await insertNutrient(revision, 'energy_kcal', '0');
      await assert.rejects(insertNutrient(revision, 'energy_kcal', '1'), { code: '23505', constraint: 'food_revision_nutrients_pkey' });
    });
    await scenario('MATCH SIMPLE supports a new food; published pointers cannot cross foods or reference missing revisions', async () => {
      const first = await createFood();
      const second = await createFood();
      const revision = await createRevision(first, { quality_status: 'PUBLISHED', published_at: publishedAt });
      await assert.rejects(client.query('UPDATE nutrasa.foods SET current_published_revision_id=$1 WHERE id=$2', [revision,second]),
        { code: '23503', constraint: 'foods_current_published_revision_fkey' });
      await assert.rejects(client.query('UPDATE nutrasa.foods SET current_published_revision_id=$1 WHERE id=$2', [randomUUID(),first]),
        { code: '23503', constraint: 'foods_current_published_revision_fkey' });
      await client.query("UPDATE nutrasa.foods SET publication_status='PUBLISHED',current_published_revision_id=$1 WHERE id=$2", [revision,first]);
      assert.deepEqual((await client.query('SELECT current_published_revision_id FROM nutrasa.foods WHERE id=$1', [first])).rows,
        [{ current_published_revision_id: revision }]);
    });
    await scenario('five food states require explicit valid values and PUBLISHED requires its pointer', async () => {
      for (const status of ['DRAFT','IN_REVIEW','APPROVED','ARCHIVED']) await createFood({ publication_status: status });
      await assert.rejects(createFood({ publication_status: 'PUBLISHED' }), { code: '23514', constraint: 'foods_published_pointer_check' });
      for (const status of ['', ' ', 'published', 'PUBLISHED\n', 'OTHER']) {
        await assert.rejects(createFood({ publication_status: status }), { code: '23514', constraint: 'foods_publication_status_check' });
      }
      const food = await createFood();
      const revision = await createRevision(food, { quality_status: 'PUBLISHED', published_at: publishedAt });
      await client.query("UPDATE nutrasa.foods SET publication_status='PUBLISHED',current_published_revision_id=$1 WHERE id=$2", [revision,food]);
      await assert.rejects(client.query('UPDATE nutrasa.foods SET current_published_revision_id=NULL WHERE id=$1', [food]),
        { code: '23514', constraint: 'foods_published_pointer_check' });
      await client.query("UPDATE nutrasa.foods SET publication_status='ARCHIVED' WHERE id=$1", [food]);
      assert.deepEqual((await client.query('SELECT current_published_revision_id FROM nutrasa.foods WHERE id=$1', [food])).rows,
        [{ current_published_revision_id: revision }]);
    });
    await scenario('three revision states enforce the local publication timestamp relation and reject non-finite instants', async () => {
      for (const status of ['DRAFT','REVIEWED','PUBLISHED']) {
        const food = await createFood();
        await createRevision(food, { quality_status: status, published_at: status === 'PUBLISHED' ? publishedAt : null });
        await assert.rejects(createRevision(food, { revision_number: 2, quality_status: status,
          published_at: status === 'PUBLISHED' ? null : publishedAt }), { code: '23514', constraint: 'food_revisions_published_at_status_check' });
      }
      const food = await createFood();
      for (const status of ['', ' ', 'published', 'PUBLISHED\n', 'OTHER']) {
        await assert.rejects(createRevision(food, { quality_status: status }), { code: '23514', constraint: 'food_revisions_quality_status_check' });
      }
      for (const value of ['infinity','-infinity']) {
        await assert.rejects(createRevision(food, { quality_status: 'PUBLISHED', published_at: value }),
          { code: '23514', constraint: 'food_revisions_published_at_finite_check' });
        for (const column of ['created_at','updated_at']) {
          await assert.rejects(client.query(`UPDATE nutrasa.foods SET ${column}=$1 WHERE id=$2`, [value,food]),
            { code: '23514', constraint: `foods_${column}_finite_check` });
        }
      }
    });
    await scenario('basis accepts positive finite g/ml, rejects invalid units and numeric special values, and exposes scale coercion', async () => {
      for (const unit of ['g','ml']) await createRevision(await createFood(), { basis_unit: unit, basis_quantity: '0.00001' });
      const food = await createFood();
      for (const unit of ['', ' ', 'G', 'kg', 'g\n']) await assert.rejects(createRevision(food, { basis_unit: unit }),
        { code: '23514', constraint: 'food_revisions_basis_unit_check' });
      for (const value of ['0','-1','NaN']) await assert.rejects(createRevision(food, { basis_quantity: value }),
        { code: '23514', constraint: 'food_revisions_basis_quantity_check' });
      for (const value of ['Infinity','-Infinity','1000000000']) await assert.rejects(createRevision(food, { basis_quantity: value }), { code: '22003' });
      const revision = await createRevision(food, { basis_quantity: '1.234567' });
      assert.deepEqual((await client.query('SELECT basis_quantity::text AS value FROM nutrasa.food_revisions WHERE id=$1', [revision])).rows,
        [{ value: '1.23457' }]);
    });
    await scenario('all eleven nutrient codes preserve NULL versus zero and reject unknown codes, negatives and NaN', async () => {
      const revision = await createRevision(await createFood());
      for (const [index, code] of codes.entries()) await insertNutrient(revision, code, index % 2 === 0 ? null : '0');
      const stored = (await client.query<{ nutrient_code: string; value: string | null }>(
        'SELECT nutrient_code,value::text FROM nutrasa.food_revision_nutrients WHERE food_revision_id=$1 ORDER BY nutrient_code', [revision])).rows;
      assert.deepEqual(stored, codes.map((code,index) => ({ nutrient_code: code, value: index % 2 === 0 ? null : '0.00000' }))
        .sort((a,b) => a.nutrient_code < b.nutrient_code ? -1 : 1));
      for (const code of ['', ' ', 'total_sugar_g', 'ENERGY_KCAL', 'sugar_g\n', 'unknown']) {
        await assert.rejects(insertNutrient(revision, code, '1'), { code: '23514', constraint: 'food_revision_nutrients_code_check' });
      }
      for (const value of ['-1','NaN']) await assert.rejects(client.query(
        "UPDATE nutrasa.food_revision_nutrients SET value=$1 WHERE food_revision_id=$2 AND nutrient_code='sugar_g'", [value,revision]),
      { code: '23514', constraint: 'food_revision_nutrients_value_check' });
      for (const value of ['Infinity','-Infinity','1000000000']) await assert.rejects(client.query(
        "UPDATE nutrasa.food_revision_nutrients SET value=$1 WHERE food_revision_id=$2 AND nutrient_code='sugar_g'", [value,revision]), { code: '22003' });
      await client.query("UPDATE nutrasa.food_revision_nutrients SET value='1.234567' WHERE food_revision_id=$1 AND nutrient_code='sugar_g'", [revision]);
      assert.equal((await client.query<{ value: string }>(
        "SELECT value::text FROM nutrasa.food_revision_nutrients WHERE food_revision_id=$1 AND nutrient_code='sugar_g'", [revision])).rows[0]?.value, '1.23457');
    });
    await scenario('RESTRICT prevents deleting or renaming referenced source, food and revision identifiers', async () => {
      const food = await createFood();
      const revision = await createRevision(food);
      await insertNutrient(revision, 'energy_kcal', '0');
      const pointerFood = await createFood();
      const pointerRevision = await createRevision(pointerFood, { quality_status: 'PUBLISHED', published_at: publishedAt });
      await client.query("UPDATE nutrasa.foods SET publication_status='PUBLISHED',current_published_revision_id=$1 WHERE id=$2", [pointerRevision,pointerFood]);
      for (const [table,id,constraint] of [
        ['food_sources',sourceId,'food_revisions_source_id_fkey'], ['foods',food,'food_revisions_food_id_fkey'],
        ['food_revisions',revision,'food_revision_nutrients_revision_fkey'],
        ['food_revisions',pointerRevision,'foods_current_published_revision_fkey'],
      ]) {
        await assert.rejects(client.query(`DELETE FROM nutrasa.${table} WHERE id=$1`, [id]), { code: '23001', constraint });
        await assert.rejects(client.query(`UPDATE nutrasa.${table} SET id=$1 WHERE id=$2`, [randomUUID(),id]), { code: '23001', constraint });
      }
      await assert.rejects(client.query('UPDATE nutrasa.food_revisions SET food_id=$1 WHERE id=$2', [await createFood(),pointerRevision]),
        { code: '23001', constraint: 'foods_current_published_revision_fkey' });
      await expectProtected();
      await expectState(history, 3);
    });
    await scenario('DOWN drops only catalog tables and retains protected data, history and all immutable baselines', async () => {
      await migrate('down');
      for (const table of catalogTables) assert.equal(await tableExists(table), false);
      await expectState(history.slice(0,2), 3);
      await expectProtected();
      await assertLockReleased(observer);
    });
    await scenario('identical UP and re-run restore an empty catalog without duplicating history or changing prior domains', async () => {
      await migrate('up');
      const restored = await structure(catalogTables);
      assert.equal(restored.length, 3);
      for (const table of catalogTables) assert.equal((await client.query(`SELECT * FROM nutrasa.${table}`)).rowCount, 0);
      await expectState(history, 3);
      await expectProtected();
      assert.deepEqual(await migrate('up'), []);
      assert.deepEqual(await structure(catalogTables), restored);
      await expectState(history, 3);
      await expectProtected();
      await assertLockReleased(observer);
    });
  });
