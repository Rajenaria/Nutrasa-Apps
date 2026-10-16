import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { assertLockReleased, createMigrationHarness } from './harness.ts';

const identityTables = ['app_users', 'privacy_acknowledgements', 'user_preferences', 'user_profiles'];
const insertSource = `INSERT INTO nutrasa.food_sources
  (name, source_type, edition, reference, license_status, permission_notes, accessed_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text AS id`;
const sourceValues = (): (string | null)[] =>
  ['SYNTHETIC source', 'SYNTHETIC unclassified type', null, 'Synthetic bibliography for storage testing only', 'UNVERIFIED', null, null];

test('food sources constraints and lifecycle preserve identity on a fresh isolated PostgreSQL target', { timeout: 90000 }, async (t) => {
  const { directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap } =
    await createMigrationHarness(t);
  const copyMigration = async (filename: string) => writeFile(join(directory, filename),
    await readFile(new URL(`../../migrations/${filename}`, import.meta.url)));
  let userId: string;

  const identityState = async () => ({
    structure: (await client.query<{
      name: string; oid: string; columns: string[]; constraints: string[];
    }>(`SELECT c.relname::text AS name, c.oid::text AS oid,
      ARRAY(SELECT a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
                   || ':' || a.attnotnull::text || ':' || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
            FROM pg_catalog.pg_attribute a
            LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns,
      ARRAY(SELECT p.conname::text || ':' || pg_catalog.pg_get_constraintdef(p.oid)
            FROM pg_catalog.pg_constraint p WHERE p.conrelid = c.oid ORDER BY p.conname) AS constraints
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'nutrasa' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`, [identityTables])).rows,
    // These are storage fixtures; they do not approve clinical parameters or legal evidence.
    user: (await client.query('SELECT * FROM nutrasa.app_users WHERE id = $1', [userId])).rows,
    profile: (await client.query('SELECT * FROM nutrasa.user_profiles WHERE user_id = $1', [userId])).rows,
    preferences: (await client.query('SELECT * FROM nutrasa.user_preferences WHERE user_id = $1', [userId])).rows,
    acknowledgement: (await client.query('SELECT * FROM nutrasa.privacy_acknowledgements WHERE user_id = $1', [userId])).rows,
  });
  const rejectSource = (values: (string | null)[], expected: { code: string; column?: string; constraint?: string }) =>
    assert.rejects(client.query(insertSource, values), { ...expected, schema: 'nutrasa', table: 'food_sources' });

  await scenario('bootstrap a fresh target and establish identity with synthetic rows before upgrade', async () => {
    await copyMigration('0001_identity.sql');
    await bootstrap();
    await migrate('up');
    const row = (await client.query<{ id: string }>(
      "INSERT INTO nutrasa.app_users (firebase_uid, account_status) VALUES ('synthetic_food_sources_owner', 'ACTIVE') RETURNING id",
    )).rows[0];
    assert.ok(row);
    userId = row.id;
    await client.query(`INSERT INTO nutrasa.user_profiles
      (user_id, date_of_birth, height_cm, calculation_parameter, activity_level, goal_type, onboarding_completed_at)
      VALUES ($1, '1990-01-01', '170.25', 'SYNTHETIC_UNAPPROVED', 'moderate', 'maintenance', '2026-01-01T00:00:00Z')`, [userId]);
    await client.query(`INSERT INTO nutrasa.user_preferences
      (user_id, language_code, time_zone, preferred_weight_unit) VALUES ($1, 'id-ID', 'Asia/Jakarta', 'kg')`, [userId]);
    await client.query(`INSERT INTO nutrasa.privacy_acknowledgements (user_id, notice_version, ack_type)
      VALUES ($1, 'SYNTHETIC_NOT_A_LEGAL_NOTICE', 'SYNTHETIC_STORAGE_TEST')`, [userId]);
    await expectState(['0001_identity'], 1);
    await assertLockReleased(observer);
  });
  const identityBefore = await identityState();
  assert.equal(identityBefore.structure.length, 4);
  for (const rows of [identityBefore.user, identityBefore.profile, identityBefore.preferences, identityBefore.acknowledgement]) {
    assert.equal(rows.length, 1);
  }
  const expectIdentity = async () => assert.deepEqual(await identityState(), identityBefore);
  await copyMigration('0002_food_sources.sql');

  await scenario('failure after actual food sources DDL rolls back the batch, history and checksum without changing identity', async () => {
    const failurePath = join(directory, '0003_failure.sql');
    await writeFile(failurePath, await readFile(new URL('./fixtures/food-sources/0003_failure.sql', import.meta.url)));
    try {
      await assert.rejects(migrate('up'), { code: '22012' });
      assert.equal(await tableExists('food_sources'), false);
      await expectState(['0001_identity'], 1);
      await expectIdentity();
      await assertLockReleased(observer);
    } finally {
      await rm(failurePath);
    }
  });

  await scenario('actual food sources UP upgrades identity and commits matching history and checksum', async () => {
    await migrate('up');
    await expectState(['0001_identity', '0002_food_sources'], 2);
    await expectIdentity();
    await assertLockReleased(observer);
    const tables = (await client.query<{ name: string; owned: boolean }>(`SELECT c.relname::text AS name,
      c.relowner = current_user::regrole AS owned FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'nutrasa' AND c.relkind = 'r' ORDER BY c.relname`)).rows;
    assert.deepEqual(tables.map(row => row.name), [...identityTables, 'food_sources'].sort());
    assert.ok(tables.every(row => row.owned));
  });

  await scenario('exactly eight approved columns have the required types, nullability and only the UUID default', async () => {
    const rows = (await client.query<{ name: string; type: string; not_null: boolean; expression: string | null }>(`
      SELECT a.attname::text AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS expression
      FROM pg_catalog.pg_attribute a
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'nutrasa.food_sources'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`)).rows;
    assert.deepEqual(rows.map(row => [row.name, row.type, row.not_null]), [
      ['id', 'uuid', true], ['name', 'text', true], ['source_type', 'text', true], ['edition', 'text', false],
      ['reference', 'text', true], ['license_status', 'text', true], ['permission_notes', 'text', false],
      ['accessed_at', 'timestamp with time zone', false],
    ]);
    assert.match(rows[0]?.expression ?? '', /^(pg_catalog\.)?gen_random_uuid\(\)$/);
    for (const row of rows.slice(1)) assert.equal(row.expression, null, row.name);
  });

  await scenario('only the id primary key and its index exist, without invented unique keys, foreign keys or triggers', async () => {
    const keys = (await client.query<{ kind: string; columns: string[] }>(`SELECT c.contype AS kind,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ordinal)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
            ORDER BY k.ordinal) AS columns
      FROM pg_catalog.pg_constraint c WHERE c.conrelid = 'nutrasa.food_sources'::regclass
      AND c.contype IN ('p', 'u', 'f')`)).rows;
    assert.deepEqual(keys, [{ kind: 'p', columns: ['id'] }]);
    const indexes = (await client.query<{ primary_key: boolean; unique_key: boolean; valid: boolean }>(`
      SELECT indisprimary AS primary_key, indisunique AS unique_key, indisvalid AS valid
      FROM pg_catalog.pg_index WHERE indrelid = 'nutrasa.food_sources'::regclass`)).rows;
    assert.deepEqual(indexes, [{ primary_key: true, unique_key: true, valid: true }]);
    const triggers = await client.query(`SELECT oid FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'nutrasa.food_sources'::regclass AND NOT tgisinternal`);
    assert.equal(triggers.rowCount, 0);
  });

  await scenario('UUIDs are generated and distinct, duplicate IDs are rejected and optional values stay NULL', async () => {
    const first = (await client.query<{ id: string }>(insertSource, sourceValues())).rows[0];
    const second = (await client.query<{ id: string }>(insertSource, sourceValues())).rows[0];
    assert.ok(first && second);
    assert.match(first.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.notEqual(first.id, second.id);
    await assert.rejects(client.query('INSERT INTO nutrasa.food_sources SELECT * FROM nutrasa.food_sources WHERE id = $1', [first.id]), {
      code: '23505', constraint: 'food_sources_pkey',
    });
    const stored = (await client.query('SELECT edition, permission_notes, accessed_at FROM nutrasa.food_sources WHERE id = $1', [first.id])).rows;
    assert.deepEqual(stored, [{ edition: null, permission_notes: null, accessed_at: null }]);
    await assert.rejects(client.query(`INSERT INTO nutrasa.food_sources (id, name, source_type, reference, license_status)
      VALUES (NULL, 'SYNTHETIC', 'SYNTHETIC', 'Synthetic bibliography', 'UNVERIFIED')`), { code: '23502', column: 'id' });
  });

  await scenario('required values cannot be NULL and all five text fields reject empty or whitespace-only values', async () => {
    for (const [index, column] of [[0, 'name'], [1, 'source_type'], [3, 'reference'], [4, 'license_status']] as const) {
      const values = sourceValues();
      values[index] = null;
      await rejectSource(values, { code: '23502', column });
    }
    for (const [index, column] of [[0, 'name'], [1, 'source_type'], [2, 'edition'], [3, 'reference'], [5, 'permission_notes']] as const) {
      for (const blank of ['', ' ', '\t', '\n', ' \t\r\n ']) {
        const values = sourceValues();
        values[index] = blank;
        await rejectSource(values, { code: '23514', constraint: `food_sources_${column}_nonblank_check` });
      }
    }
  });

  await scenario('text remains untrimmed, source type has no invented enum and bibliographic references need no URL', async () => {
    const values = ['  SYNTHETIC source  ', '  SYNTHETIC arbitrary type  ', '  Test edition  ',
      '  Synthetic bibliography, page 1  ', 'UNVERIFIED', '  Synthetic note; no permission granted  ', '2026-01-01T12:00:00+07:00'];
    const row = (await client.query<{ id: string }>(insertSource, values)).rows[0];
    assert.ok(row);
    const stored = (await client.query(`SELECT name, source_type, edition, reference, license_status, permission_notes,
      accessed_at = $2::timestamptz AS accessed_at_correct FROM nutrasa.food_sources WHERE id = $1`, [row.id, values[6]])).rows;
    assert.deepEqual(stored, [{ name: values[0], source_type: values[1], edition: values[2], reference: values[3],
      license_status: values[4], permission_notes: values[5], accessed_at_correct: true }]);
  });

  await scenario('all four license statuses are explicit and only their exact values are accepted', async () => {
    // ALLOWED is synthetic storage input, not legal clearance for any real source.
    for (const status of ['UNVERIFIED', 'ALLOWED', 'RESTRICTED', 'DENIED']) {
      const values = sourceValues();
      values[4] = status;
      await client.query(insertSource, values);
    }
    for (const status of ['', ' ', 'allowed', ' ALLOWED ', 'APPROVED', 'UNVERIFIED\n']) {
      const values = sourceValues();
      values[4] = status;
      await rejectSource(values, { code: '23514', constraint: 'food_sources_license_status_check' });
    }
    await assert.rejects(client.query(`INSERT INTO nutrasa.food_sources (name, source_type, reference)
      VALUES ('SYNTHETIC', 'SYNTHETIC', 'Synthetic bibliography')`), { code: '23502', column: 'license_status' });
  });

  await scenario('access time accepts NULL or a finite instant and rejects both timestamp infinities', async () => {
    for (const value of ['infinity', '-infinity']) {
      const values = sourceValues();
      values[6] = value;
      await rejectSource(values, { code: '23514', constraint: 'food_sources_accessed_at_finite_check' });
    }
    await expectIdentity();
    await expectState(['0001_identity', '0002_food_sources'], 2);
  });

  await scenario('DOWN removes only food sources and preserves identity rows, structure, history and immutable baselines', async () => {
    await migrate('down');
    assert.equal(await tableExists('food_sources'), false);
    await expectIdentity();
    await expectState(['0001_identity'], 2);
    await assertLockReleased(observer);
  });

  await scenario('identical UP and re-run restore food sources without duplicating history or losing identity', async () => {
    await migrate('up');
    assert.equal(await tableExists('food_sources'), true);
    assert.equal((await client.query('SELECT id FROM nutrasa.food_sources')).rowCount, 0);
    await expectIdentity();
    await expectState(['0001_identity', '0002_food_sources'], 2);
    assert.deepEqual(await migrate('up'), []);
    await expectState(['0001_identity', '0002_food_sources'], 2);
    await assertLockReleased(observer);
  });
});
