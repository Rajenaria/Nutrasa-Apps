import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { readSqlSnapshots } from '../../src/migrations/checksum.ts';
import { assertLockReleased, createMigrationHarness } from './harness.ts';

type DefaultKind = 'uuid' | 'now' | 'one' | null;
type ColumnContract = readonly [name: string, type: string, notNull: boolean, defaultKind: DefaultKind];

const columns: Record<string, readonly ColumnContract[]> = {
  app_users: [
    ['id', 'uuid', true, 'uuid'], ['firebase_uid', 'text', true, null],
    ['email_display', 'text', false, null], ['email_verified_cache', 'boolean', false, null],
    ['account_status', 'text', true, null],
    ['created_at', 'timestamp with time zone', true, 'now'], ['updated_at', 'timestamp with time zone', true, 'now'],
  ],
  user_profiles: [
    ['user_id', 'uuid', true, null], ['date_of_birth', 'date', true, null],
    ['height_cm', 'numeric(8,2)', true, null], ['calculation_parameter', 'text', true, null],
    ['activity_level', 'text', true, null], ['goal_type', 'text', true, null],
    ['target_weight_kg', 'numeric(10,3)', false, null], ['body_type_visual', 'text', false, null],
    ['onboarding_completed_at', 'timestamp with time zone', true, null],
    ['profile_revision', 'integer', true, 'one'],
    ['created_at', 'timestamp with time zone', true, 'now'], ['updated_at', 'timestamp with time zone', true, 'now'],
  ],
  user_preferences: [
    ['user_id', 'uuid', true, null], ['language_code', 'text', true, null],
    ['time_zone', 'text', true, null], ['preferred_weight_unit', 'text', true, null],
    ['updated_at', 'timestamp with time zone', true, 'now'],
  ],
  privacy_acknowledgements: [
    ['id', 'uuid', true, 'uuid'], ['user_id', 'uuid', true, null],
    ['notice_version', 'text', true, null], ['ack_type', 'text', true, null],
    ['acknowledged_at', 'timestamp with time zone', true, 'now'],
  ],
};

const profileInsert = `INSERT INTO nutrasa.user_profiles
  (user_id, date_of_birth, height_cm, calculation_parameter, activity_level, goal_type,
   target_weight_kg, onboarding_completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

// Synthetic storage fixtures do not approve clinical parameters or activate nutrition recommendations.
const profileValues = (userId: string, goal = 'maintenance', target: string | null = null) =>
  [userId, '1990-01-01', '170.25', 'SYNTHETIC_UNAPPROVED', 'moderate', goal, target, '2026-01-01T00:00:00Z'];

test('identity migration on a fresh isolated PostgreSQL target', { timeout: 90000 }, async (t) => {
  const { directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap } =
    await createMigrationHarness(t);
  const migrationPath = join(directory, '0001_identity.sql');
  await writeFile(migrationPath, await readFile(new URL('../../migrations/0001_identity.sql', import.meta.url)));
  const snapshots = await readSqlSnapshots(directory);
  const snapshot = snapshots[0];
  assert.ok(snapshot);
  assert.equal(snapshots.length, 1);

  const rejectSql = async (sql: string, values: unknown[], expected: string | readonly string[]) => {
    const codes = typeof expected === 'string' ? [expected] : expected;
    await assert.rejects(client.query(sql, values), (error: unknown) => {
      assert.ok(typeof error === 'object' && error !== null && 'code' in error);
      assert.ok(typeof error.code === 'string' && codes.includes(error.code), `Expected SQLSTATE ${codes.join('/')}`);
      return true;
    });
  };
  const createUser = async (uid = `synthetic_${randomUUID()}`) => {
    const result = await client.query<{ id: string }>(
      "INSERT INTO nutrasa.app_users (firebase_uid, account_status) VALUES ($1, 'ACTIVE') RETURNING id", [uid],
    );
    const row = result.rows[0];
    assert.ok(row);
    return row.id;
  };
  const insertPreferences = (userId: string) => client.query(
    `INSERT INTO nutrasa.user_preferences (user_id, language_code, time_zone, preferred_weight_unit)
     VALUES ($1, 'id-ID', 'Asia/Makassar', 'kg')`, [userId],
  );
  const metadataDefinitions = async () => (await client.query<{
    name: string; oid: string; definitions: string[];
  }>(`SELECT c.relname AS name, c.oid::text AS oid,
      ARRAY(SELECT a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
            FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum) AS definitions
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'nutrasa_migrations' AND c.relkind = 'r' ORDER BY c.relname`)).rows;
  const expectSentinel = async () => assert.deepEqual((await client.query<{ marker: string }>(
    'SELECT marker FROM nutrasa.identity_test_sentinel WHERE id = 1',
  )).rows, [{ marker: 'unrelated' }]);

  await scenario('bootstrap an empty target and apply the actual identity SQL', async () => {
    await bootstrap();
    await client.query('CREATE TABLE nutrasa.identity_test_sentinel (id integer PRIMARY KEY, marker text NOT NULL)');
    await client.query("INSERT INTO nutrasa.identity_test_sentinel VALUES (1, 'unrelated')");
    await migrate('up');
    await expectState(['0001_identity'], 1);
    await expectSentinel();
    await assertLockReleased(observer);
  });
  const metadataBefore = await metadataDefinitions();
  assert.equal(metadataBefore.length, 2);

  await scenario('exact tables, columns, types, nullability and technical defaults', async () => {
    const tables = await client.query<{ name: string; owned: boolean }>(
      `SELECT c.relname AS name, c.relowner = current_user::regrole AS owned
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'nutrasa' AND c.relkind = 'r' ORDER BY c.relname`,
    );
    assert.deepEqual(tables.rows.map(row => row.name), [...Object.keys(columns), 'identity_test_sentinel'].sort());
    assert.ok(tables.rows.every(row => row.owned));
    const actual = await client.query<{
      table_name: string; name: string; type: string; not_null: boolean; expression: string | null; collation: string | null;
    }>(`SELECT c.relname AS table_name, a.attname AS name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
        pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS expression, col.collname AS collation
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        LEFT JOIN pg_catalog.pg_collation col ON col.oid = a.attcollation
        WHERE n.nspname = 'nutrasa' AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum`, [Object.keys(columns)]);
    for (const [table, expected] of Object.entries(columns)) {
      const rows = actual.rows.filter(row => row.table_name === table);
      assert.deepEqual(rows.map(row => [row.name, row.type, row.not_null]), expected.map(row => row.slice(0, 3)));
      for (const [index, column] of expected.entries()) {
        const row = rows[index];
        assert.ok(row);
        const kind = column[3];
        if (kind === null) assert.equal(row.expression, null, `${table}.${row.name} must have no default`);
        else {
          assert.ok(row.expression);
          const pattern = kind === 'uuid' ? /^(pg_catalog\.)?gen_random_uuid\(\)$/ :
            kind === 'now' ? /^(pg_catalog\.)?now\(\)$/ : /^1$/;
          assert.match(row.expression, pattern);
        }
      }
    }
    assert.equal(actual.rows.find(row => row.name === 'firebase_uid')?.collation, 'C');
    assert.ok(!actual.rows.some(row => ['onboarding_status', 'current_weight', 'current_weight_kg'].includes(row.name)));
  });

  await scenario('primary/unique keys and exactly the three approved foreign keys', async () => {
    const constraints = await client.query<{
      table_name: string; kind: string; columns: string[]; referenced_table: string | null;
      referenced_columns: string[]; delete_action: string;
    }>(`SELECT child.relname AS table_name, c.contype AS kind, c.confdeltype AS delete_action,
        parent.relname AS referenced_table,
        ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ordinal)
              JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
              ORDER BY k.ordinal) AS columns,
        ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ordinal)
              JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
              ORDER BY k.ordinal) AS referenced_columns
        FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class child ON child.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = child.relnamespace
        LEFT JOIN pg_catalog.pg_class parent ON parent.oid = c.confrelid
        WHERE n.nspname = 'nutrasa' AND child.relname = ANY($1::text[]) AND c.contype IN ('p', 'u', 'f')
        ORDER BY child.relname, c.contype`, [Object.keys(columns)]);
    assert.deepEqual(constraints.rows.filter(row => row.kind === 'p').map(row => [row.table_name, row.columns]), [
      ['app_users', ['id']], ['privacy_acknowledgements', ['id']],
      ['user_preferences', ['user_id']], ['user_profiles', ['user_id']],
    ]);
    assert.deepEqual(constraints.rows.filter(row => row.kind === 'u').map(row => [row.table_name, row.columns]), [
      ['app_users', ['firebase_uid']], ['privacy_acknowledgements', ['user_id', 'notice_version', 'ack_type']],
    ]);
    assert.deepEqual(constraints.rows.filter(row => row.kind === 'f').map(row =>
      [row.table_name, row.columns, row.referenced_table, row.referenced_columns, row.delete_action]), [
      ['privacy_acknowledgements', ['user_id'], 'app_users', ['id'], 'r'],
      ['user_preferences', ['user_id'], 'user_profiles', ['user_id'], 'c'],
      ['user_profiles', ['user_id'], 'app_users', ['id'], 'c'],
    ]);
    const indexes = await client.query<{ count: string }>(
      `SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'nutrasa' AND c.relname = ANY($1::text[])`, [Object.keys(columns)],
    );
    assert.equal(indexes.rows[0]?.count, '6', 'Only PK/UNIQUE backing indexes are needed.');
  });

  await scenario('Firebase UID is case-sensitive, unique, nonblank and preserved without trimming', async () => {
    await createUser('Synthetic_UID');
    await createUser('synthetic_uid');
    await rejectSql("INSERT INTO nutrasa.app_users (firebase_uid, account_status) VALUES ($1, 'ACTIVE')", ['Synthetic_UID'], '23505');
    for (const uid of ['', ' ', '\t\r\n']) {
      await rejectSql("INSERT INTO nutrasa.app_users (firebase_uid, account_status) VALUES ($1, 'ACTIVE')", [uid], '23514');
    }
    const id = await createUser(' preserved_UID ');
    assert.equal((await client.query<{ firebase_uid: string }>(
      'SELECT firebase_uid FROM nutrasa.app_users WHERE id = $1', [id],
    )).rows[0]?.firebase_uid, ' preserved_UID ');
  });

  await scenario('account status is controlled and explicitly required; unknown email stays NULL', async () => {
    await rejectSql('INSERT INTO nutrasa.app_users (firebase_uid) VALUES ($1)', ['missing_status'], '23502');
    await rejectSql('INSERT INTO nutrasa.app_users (firebase_uid, account_status) VALUES ($1, $2)', ['bad_status', 'DELETION_PENDING'], '23514');
    const id = await createUser();
    const result = await client.query<{ valid: boolean }>(
      `SELECT id IS NOT NULL AND email_display IS NULL AND email_verified_cache IS NULL
       AND created_at = updated_at AND created_at <= pg_catalog.now() AS valid
       FROM nutrasa.app_users WHERE id = $1`, [id],
    );
    assert.equal(result.rows[0]?.valid, true);
    for (const status of ['ACTIVE', 'PENDING_DELETION', 'DELETED']) {
      await client.query('UPDATE nutrasa.app_users SET account_status = $1 WHERE id = $2', [status, id]);
    }
  });

  await scenario('profiles require a valid account, one row per owner, completion time and nonblank parameter', async () => {
    await rejectSql(profileInsert, profileValues(randomUUID()), '23503');
    const id = await createUser();
    const values = profileValues(id);
    for (const index of [0, 1, 2, 3, 4, 5, 7]) {
      await rejectSql(profileInsert, values.map((value, i) => i === index ? null : value), '23502');
    }
    for (const parameter of ['', '\t ']) {
      await rejectSql(profileInsert, values.map((value, i) => i === 3 ? parameter : value), '23514');
    }
    await client.query(profileInsert, values);
    await rejectSql(profileInsert, values, '23505');
    const defaults = await client.query<{ valid: boolean }>(
      `SELECT profile_revision = 1 AND target_weight_kg IS NULL AND body_type_visual IS NULL
       AND onboarding_completed_at = '2026-01-01T00:00:00Z'::timestamptz
       AND created_at = updated_at AND created_at <= pg_catalog.now() AS valid
       FROM nutrasa.user_profiles WHERE user_id = $1`, [id],
    );
    assert.equal(defaults.rows[0]?.valid, true);
    await rejectSql('UPDATE nutrasa.user_profiles SET profile_revision = 0 WHERE user_id = $1', [id], '23514');
    await rejectSql('UPDATE nutrasa.user_profiles SET profile_revision = -1 WHERE user_id = $1', [id], '23514');
  });

  await scenario('approved goal/activity vocabularies and conditional target weight', async () => {
    const id = await createUser();
    for (const [index, value] of [[4, 'sedentary'], [5, 'general_tracking']]) {
      await rejectSql(profileInsert, profileValues(id).map((item, i) => i === index ? value : item), '23514');
    }
    for (const goal of ['cutting', 'bulking']) await rejectSql(profileInsert, profileValues(id, goal), '23514');
    for (const goal of ['maintenance', 'cutting', 'bulking', 'muscle_gain']) {
      const owner = await createUser();
      await client.query(profileInsert, profileValues(owner, goal, ['cutting', 'bulking'].includes(goal) ? '65.125' : null));
      for (const activity of ['very_low', 'light', 'moderate', 'high', 'very_high']) {
        await client.query('UPDATE nutrasa.user_profiles SET activity_level = $1 WHERE user_id = $2', [activity, owner]);
      }
    }
  });

  await scenario('height, optional/required target weight and date reject prohibited special values', async () => {
    const id = await createUser();
    for (const height of ['0', '-1', 'NaN', 'Infinity', '-Infinity']) {
      await rejectSql(profileInsert, profileValues(id).map((value, i) => i === 2 ? height : value), ['23514', '22003']);
    }
    for (const goal of ['maintenance', 'cutting', 'bulking', 'muscle_gain']) {
      for (const weight of ['0', '-1', 'NaN', 'Infinity', '-Infinity']) {
        await rejectSql(profileInsert, profileValues(id, goal, weight), ['23514', '22003']);
      }
    }
    for (const dob of ['infinity', '-infinity']) {
      await rejectSql(profileInsert, profileValues(id).map((value, i) => i === 1 ? dob : value), '23514');
    }
  });

  await scenario('NUMERIC scale coerces input; excess precision requires future backend validation', async () => {
    const id = await createUser();
    await client.query(profileInsert, profileValues(id, 'cutting', '65.125'));
    await client.query('UPDATE nutrasa.user_profiles SET height_cm = $1, target_weight_kg = $2 WHERE user_id = $3',
      ['170.251', '65.1251', id]);
    assert.deepEqual((await client.query<{ height: string; target: string }>(
      'SELECT height_cm::text AS height, target_weight_kg::text AS target FROM nutrasa.user_profiles WHERE user_id = $1', [id],
    )).rows, [{ height: '170.25', target: '65.125' }]);
  });

  await scenario('preferences reference profiles, require explicit nonblank settings and validate units', async () => {
    const id = await createUser();
    await assert.rejects(insertPreferences(id), (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23503');
    await client.query(profileInsert, profileValues(id));
    const sql = `INSERT INTO nutrasa.user_preferences (user_id, language_code, time_zone, preferred_weight_unit)
                 VALUES ($1, $2, $3, $4)`;
    const values = [id, 'id-ID', 'Asia/Makassar', 'kg'];
    for (const index of [0, 1, 2, 3]) {
      await rejectSql(sql, values.map((value, i) => i === index ? null : value), '23502');
    }
    for (const index of [1, 2]) {
      for (const blank of ['', '\t ']) await rejectSql(sql, values.map((value, i) => i === index ? blank : value), '23514');
    }
    await rejectSql(sql, [id, 'id-ID', 'Asia/Makassar', 'stone'], '23514');
    await insertPreferences(id);
    await assert.rejects(insertPreferences(id), (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23505');
    await client.query("UPDATE nutrasa.user_preferences SET preferred_weight_unit = 'lb' WHERE user_id = $1", [id]);
    assert.equal((await client.query<{ valid: boolean }>(
      'SELECT updated_at IS NOT NULL AND updated_at <= pg_catalog.now() AS valid FROM nutrasa.user_preferences WHERE user_id = $1', [id],
    )).rows[0]?.valid, true);
  });

  await scenario('acknowledgement FK, required evidence, uniqueness and original recording values', async () => {
    const sql = 'INSERT INTO nutrasa.privacy_acknowledgements (user_id, notice_version, ack_type) VALUES ($1, $2, $3)';
    await rejectSql(sql, [randomUUID(), 'synthetic_v1', 'SYNTHETIC_TYPE'], '23503');
    const id = await createUser();
    const values = [id, 'synthetic_v1', 'SYNTHETIC_TYPE'];
    for (const index of [0, 1, 2]) {
      await rejectSql(sql, values.map((value, i) => i === index ? null : value), '23502');
    }
    for (const index of [1, 2]) {
      for (const blank of ['', '\t ']) await rejectSql(sql, values.map((value, i) => i === index ? blank : value), '23514');
    }
    await client.query(sql, values);
    const select = 'SELECT id, acknowledged_at FROM nutrasa.privacy_acknowledgements WHERE user_id = $1';
    const original = await client.query<{ id: string; acknowledged_at: Date }>(select, [id]);
    assert.equal(original.rows.length, 1);
    assert.ok(original.rows[0]?.id);
    assert.ok(original.rows[0]?.acknowledged_at instanceof Date);
    await rejectSql(sql, values, '23505');
    assert.deepEqual((await client.query<{ id: string; acknowledged_at: Date }>(select, [id])).rows, original.rows);
  });

  await scenario('logical pending deletion keeps rows; RESTRICT then explicit resolution permits CASCADE', async () => {
    const id = await createUser();
    await client.query(profileInsert, profileValues(id));
    await insertPreferences(id);
    await client.query(`INSERT INTO nutrasa.privacy_acknowledgements (user_id, notice_version, ack_type)
                        VALUES ($1, 'synthetic_v1', 'SYNTHETIC_TYPE')`, [id]);
    const counts = async () => (await client.query<{ accounts: number; profiles: number; preferences: number }>(
      `SELECT (SELECT count(*) FROM nutrasa.app_users WHERE id = $1)::integer AS accounts,
       (SELECT count(*) FROM nutrasa.user_profiles WHERE user_id = $1)::integer AS profiles,
       (SELECT count(*) FROM nutrasa.user_preferences WHERE user_id = $1)::integer AS preferences`, [id],
    )).rows;
    await client.query("UPDATE nutrasa.app_users SET account_status = 'PENDING_DELETION' WHERE id = $1", [id]);
    assert.deepEqual(await counts(), [{ accounts: 1, profiles: 1, preferences: 1 }]);
    await rejectSql('DELETE FROM nutrasa.app_users WHERE id = $1', [id], '23503');
    assert.deepEqual(await counts(), [{ accounts: 1, profiles: 1, preferences: 1 }]);
    await client.query('DELETE FROM nutrasa.privacy_acknowledgements WHERE user_id = $1', [id]);
    await client.query('DELETE FROM nutrasa.app_users WHERE id = $1', [id]);
    assert.deepEqual(await counts(), [{ accounts: 0, profiles: 0, preferences: 0 }]);
  });

  await scenario('DOWN removes only identity tables, preserves metadata and the immutable checksum', async () => {
    await migrate('down');
    for (const name of Object.keys(columns)) assert.equal(await tableExists(name), false);
    await expectState([], 1);
    assert.deepEqual(await metadataDefinitions(), metadataBefore);
    await expectSentinel();
    assert.equal((await readSqlSnapshots(directory))[0]?.sha256, snapshot.sha256);
    await assertLockReleased(observer);
  });

  await scenario('identical UP and re-run preserve schema, history and checksum consistency', async () => {
    await migrate('up');
    assert.deepEqual(await migrate('up'), []);
    for (const name of Object.keys(columns)) assert.equal(await tableExists(name), true);
    await expectState(['0001_identity'], 1);
    assert.deepEqual(await metadataDefinitions(), metadataBefore);
    await expectSentinel();
    await assertLockReleased(observer);
  });
});
