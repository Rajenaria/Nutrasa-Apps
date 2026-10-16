import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { PG_MIGRATE_LOCK_ID } from 'node-pg-migrate/runner';

import {
  assertSafeConfig, ignoredMigrationFiles, maxMigrationNameLength, migrationConfig,
  migrationNamePattern, migrationVersion, parseCommand,
} from '../src/migrations/config.ts';
import { readMigrationEnvironment } from '../src/migrations/environment.ts';
import {
  assertIntegrity, executeAfterIntegrityCheck, readSqlSnapshots, sha256, snapshotSql,
} from '../src/migrations/checksum.ts';
import type { IntegrityState } from '../src/migrations/checksum.ts';
import { checksumStatement, createVerifiedLoader } from '../src/migrations/loader.ts';
import { withMigrationLock } from '../src/migrations/lock.ts';
import { assertHistoryLocation } from '../src/migrations/core.ts';

const sql = '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 2;\n';
const first = snapshotSql('/virtual/0001_first.sql', Buffer.from(sql));
const second = snapshotSql('/virtual/0002_second.sql', Buffer.from(sql));
const bootstrapped: IntegrityState = {
  ledgerExists: true, historyExists: false, history: [], ledger: [],
};
const applied: IntegrityState = {
  ledgerExists: true, historyExists: true,
  history: [first.name], ledger: [{ name: first.name, sha256: first.sha256 }],
};

test('SHA-256 matches a known vector and changes with file bytes', () => {
  assert.equal(sha256(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(Buffer.from(sql)), first.sha256);
  assert.notEqual(sha256(Buffer.from(`${sql}\n`)), first.sha256);
});

test('SQL filenames, encoding, markers, and transaction boundaries fail closed', () => {
  for (const name of ['first.sql', '0000_first.sql', '0001_First.sql', '0001_first.ts', "0001_a'.sql"]) {
    assert.throws(() => snapshotSql(name, Buffer.from(sql)));
  }
  for (const content of [sql.replaceAll('\n', '\r\n'), `\uFEFF${sql}`, sql.trimEnd(),
    sql.replace('-- Down Migration', '-- Missing direction'),
    sql.replace('SELECT 1;', 'COMMIT;'), sql.replace('SELECT 1;', 'END;'),
    sql.replace('SELECT 1;', 'BEGIN;'), sql.replace('SELECT 1;', 'SELECT pg_advisory_unlock_all();'),
    sql.replace('SELECT 1;', 'DELETE FROM nutrasa_migrations.migration_checksums;')]) {
    assert.throws(() => snapshotSql('0001_first.sql', Buffer.from(content)));
  }
  assert.throws(() => snapshotSql('0001_first.sql', new Uint8Array([0xff])));
});

test('unsafe runner options and CLI bypass flags are rejected', () => {
  assert.doesNotThrow(() => assertSafeConfig(migrationConfig));
  for (const changes of [
    { fake: true }, { dryRun: true }, { noLock: true }, { singleTransaction: false },
    { checkOrder: false }, { createSchema: true }, { migrationsSchema: 'public' },
    { advisoryLockMode: 'wait' },
  ]) assert.throws(() => assertSafeConfig({ ...migrationConfig, ...changes }));
  assert.deepEqual(parseCommand(['up']), { direction: 'up' });
  assert.deepEqual(parseCommand(['down']), { direction: 'down', count: 1 });
  assert.deepEqual(parseCommand(['down', '2']), { direction: 'down', count: 2 });
  for (const args of [[], ['up', '--fake'], ['up', '--no-lock'], ['down', '0'],
    ['down', '-1'], ['down', '9007199254740992'], ['dry-run'], ['down', '1', '--fake']]) {
    assert.throws(() => parseCommand(args));
  }
});

test('the library discovery filter excludes executable JS/TS and other alternate inputs', () => {
  const ignored = new RegExp(`^${ignoredMigrationFiles}$`);
  assert.equal(ignored.test('0001_first.sql'), false);
  for (const name of ['0001_first.ts', '0001_first.js', '0001_first.mjs', '.gitkeep',
    '0001_first.SQL', 'unexpected.sql', 'unexpected.sh']) {
    assert.equal(ignored.test(name), true);
  }
});

test('one naming convention governs snapshots, discovery, history, and ledger statements', () => {
  const ignored = new RegExp(`^${ignoredMigrationFiles}$`);
  for (const name of ['0001_identity', '9999_last_2', `0002_${'a'.repeat(maxMigrationNameLength - 5)}`]) {
    assert.doesNotThrow(() => migrationVersion(name));
    assert.equal(snapshotSql(`${name}.sql`, Buffer.from(sql)).name, name);
    assert.equal(ignored.test(`${name}.sql`), false);
  }
  for (const name of ['0000_identity', '001_identity', '10000_identity', '0001_Identity',
    '0001_identity-name', '20261013000000000_identity', '1791849600000_identity', '0001_identity\n',
    `0001_${'a'.repeat(maxMigrationNameLength - 4)}`, "0001_a'", '0001_é']) {
    assert.throws(() => migrationVersion(name));
    assert.throws(() => snapshotSql(`${name}.sql`, Buffer.from(sql)));
    assert.equal(ignored.test(`${name}.sql`), true);
    assert.throws(() => checksumStatement({ ...first, name }));
    assert.throws(() => assertIntegrity([first], { ...applied, history: [name] }));
    assert.throws(() => assertIntegrity([first], { ...applied, ledger: [{ name, sha256: first.sha256 }] }));
  }
  assert.equal(ignored.test('0001_identity.sql\n'), true);
  assert.throws(() => checksumStatement({ ...first, sha256: "bad'" }));
  assert.throws(() => assertIntegrity([{ ...first, name: '0002_changed' }], bootstrapped));
});

test('bootstrap draft matches naming bounds, foreign-history guard, and published lock key', async () => {
  // Inspect the draft only; this does not execute or semantically validate PostgreSQL SQL.
  const bootstrap = await readFile(new URL('../sql/bootstrap-migration-ledger.sql', import.meta.url), 'utf8');
  assert.ok(bootstrap.includes(`name COLLATE "C" ~ '^${migrationNamePattern}$'`));
  assert.ok(bootstrap.includes('sha256 COLLATE "C"'));
  assert.ok(bootstrap.includes("left(name, 4) <> '0000'"));
  assert.ok(bootstrap.includes(`char_length(name) <= ${maxMigrationNameLength}`));
  assert.ok(bootstrap.includes(`pg_try_advisory_xact_lock(${PG_MIGRATE_LOCK_ID}::bigint)`));
  assert.ok(bootstrap.includes("c.relname = 'pgmigrations' AND n.nspname <> 'nutrasa_migrations'"));
  assert.ok(bootstrap.indexOf("c.relname = 'pgmigrations'") < bootstrap.indexOf('CREATE TABLE'));
});

test('foreign history is rejected even if empty or alongside canonical history', () => {
  assert.doesNotThrow(() => assertHistoryLocation([]));
  assert.doesNotThrow(() => assertHistoryLocation([{ schema: 'nutrasa_migrations' }]));
  for (const schema of ['public', 'nutrasa', 'legacy', 'pg_temp_1']) {
    assert.throws(() => assertHistoryLocation([{ schema }]));
    assert.throws(() => assertHistoryLocation([{ schema: 'nutrasa_migrations' }, { schema }]));
  }
});

test('preflight lock precedes validation and engine; lock refusal never invokes either', async () => {
  const events: string[] = [];
  const connection = {
    query: async (statement: string, values: number[]) => {
      assert.deepEqual(values, [PG_MIGRATE_LOCK_ID]);
      if (statement.includes('pg_try_advisory_lock')) {
        events.push('acquire');
        return { rows: [{ acquired: true }] };
      }
      assert.ok(statement.includes('pg_advisory_unlock'));
      events.push('release');
      return { rows: [{ released: true }] };
    },
  };
  await withMigrationLock(connection, async () => {
    events.push('inspect');
    return executeAfterIntegrityCheck([first], applied, async () => { events.push('engine callback'); });
  });
  assert.deepEqual(events, ['acquire', 'inspect', 'engine callback', 'release']);
  let callbackCalled = false;
  for (const rows of [[], [{ acquired: false }], [{ acquired: 'true' }]]) {
    await assert.rejects(withMigrationLock({ query: async () => ({ rows }) }, async () => {
      callbackCalled = true;
    }));
  }
  assert.equal(callbackCalled, false);
});

test('invalid history or checksum under the preflight lock releases it without invoking the engine', async () => {
  const events: string[] = [];
  const connection = {
    query: async (statement: string) => {
      if (statement.includes('pg_try_advisory_lock')) {
        events.push('acquire');
        return { rows: [{ acquired: true }] };
      }
      events.push('release');
      return { rows: [{ released: true }] };
    },
  };
  await assert.rejects(withMigrationLock(connection, async () => {
    assertHistoryLocation([{ schema: 'public' }]);
    events.push('engine callback');
  }));
  await assert.rejects(withMigrationLock(connection, () =>
    executeAfterIntegrityCheck([first], { ...applied, ledger: [] }, async () => { events.push('engine callback'); })));
  await assert.rejects(withMigrationLock(connection, async () => { throw new Error('engine failure'); }));
  assert.deepEqual(events, ['acquire', 'release', 'acquire', 'release', 'acquire', 'release']);
  await assert.rejects(withMigrationLock({
    query: async (statement: string) => ({
      rows: [statement.includes('pg_try_advisory_lock') ? { acquired: true } : { released: false }],
    }),
  }, async () => {}), /Failed to release/);
});

test('nested acquisitions on the same simulated session release only their own lock hold', async () => {
  let holds = 0;
  const connection = {
    query: async (statement: string, values: number[]) => {
      assert.deepEqual(values, [PG_MIGRATE_LOCK_ID]);
      if (statement.includes('pg_try_advisory_lock')) {
        holds += 1;
        return { rows: [{ acquired: true }] };
      }
      assert.ok(holds > 0);
      holds -= 1;
      return { rows: [{ released: true }] };
    },
  };
  await withMigrationLock(connection, async () => {
    assert.equal(holds, 1);
    // Model the library's same-session acquisition, without executing the library runner.
    await withMigrationLock(connection, async () => { assert.equal(holds, 2); });
    assert.equal(holds, 1);
  });
  assert.equal(holds, 0);
});

test('environment requires a matching local migrator and does not leak rejected input', () => {
  for (const database of ['nutrasa_dev', 'nutrasa_test']) {
    const role = `${database}_migrator`;
    const value = `postgresql://${role}@127.0.0.1:5432/${database}`;
    assert.equal(readMigrationEnvironment({ MIGRATION_DATABASE_URL: value }).role, role);
  }
  assert.throws(() => readMigrationEnvironment({}));
  for (const value of [
    'not-a-url', 'postgresql://nutrasa_dev_app@127.0.0.1/nutrasa_dev',
    'postgresql://nutrasa_dev_migrator@127.0.0.1/nutrasa_test',
    'postgresql://nutrasa_dev_migrator@example.com/nutrasa_dev',
    'postgresql://nutrasa_dev_migrator@127.0.0.1/nutrasa_dev?options=unsafe',
  ]) {
    assert.throws(() => readMigrationEnvironment({ MIGRATION_DATABASE_URL: value }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
});

test('CLI normalizes missing ports while retaining passwordless URLs and both local targets', () => {
  for (const database of ['nutrasa_dev', 'nutrasa_test']) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      for (const port of ['', ':5432']) {
        const target = readMigrationEnvironment({
          MIGRATION_DATABASE_URL: `postgresql://${database}_migrator@${host}${port}/${database}`,
          PGPORT: '6543',
        });
        const url = new URL(target.connectionString);
        assert.equal(url.port, '5432');
        assert.equal(url.password, '');
        assert.equal(target.database, database);
      }
    }
  }
  for (const port of ['0', '5433', '65536', 'invalid']) {
    assert.throws(() => readMigrationEnvironment({
      MIGRATION_DATABASE_URL: `postgresql://nutrasa_dev_migrator@localhost:${port}/nutrasa_dev`,
    }));
  }
});

test('CLI rejects nonempty startup settings in the supplied environment without exposing values', () => {
  const environment = { MIGRATION_DATABASE_URL: 'postgresql://nutrasa_dev_migrator@localhost/nutrasa_dev' };
  for (const key of ['PGOPTIONS', 'PGREPLICATION']) {
    for (const value of ['unit-test-private-setting', ' ', '0']) {
      assert.throws(() => readMigrationEnvironment({ ...environment, [key]: value }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Inherited PGOPTIONS/);
        if (value.trim()) assert.ok(!error.message.includes(value));
        assert.ok(!error.message.includes(environment.MIGRATION_DATABASE_URL));
        return true;
      });
    }
  }
  assert.doesNotThrow(() => readMigrationEnvironment({ ...environment, PGOPTIONS: '', PGREPLICATION: '' }));
});

test('CLI wrapper checks actual process settings before connecting, independently of the caller map', () => {
  // Only validation and pg construction run: connect/query are mocked before calling the wrapper.
  const script = `
    import assert from 'node:assert/strict';
    import { Client } from 'pg';
    import { runMigrations } from './src/migrations/runner.ts';
    const before = { ...process.env };
    const observed = [];
    let queried = false;
    Client.prototype.connect = async function () {
      observed.push({ port: this.port, database: this.database, role: this.user, password: this.password });
      throw new Error('Synthetic stop before network access.');
    };
    Client.prototype.query = async function () {
      queried = true;
      throw new Error('SQL prohibited in unit tests.');
    };
    Client.prototype.end = async function () {};
    const unsafe = Boolean(process.env.PGOPTIONS || process.env.PGREPLICATION);
    for (const database of ['nutrasa_dev', 'nutrasa_test']) {
      for (const port of ['', ':5432']) {
        await assert.rejects(runMigrations({ direction: 'up' }, {
          MIGRATION_DATABASE_URL: 'postgresql://' + database + '_migrator@localhost' + port + '/' + database,
        }), unsafe ? /Inherited PGOPTIONS/ : /Synthetic stop before network access/);
        if (!unsafe) assert.deepEqual(observed.at(-1), {
          port: 5432, database, role: database + '_migrator', password: process.env.PGPASSWORD || null,
        });
      }
    }
    assert.equal(observed.length, unsafe ? 0 : 4);
    assert.equal(queried, false);
    assert.deepEqual({ ...process.env }, before);
  `;
  for (const settings of [
    {}, { PGPORT: '6543' }, { PGPORT: 'invalid' },
    { PGOPTIONS: '-c search_path=public' }, { PGREPLICATION: 'database' },
    { PGOPTIONS: ' ', PGREPLICATION: '0' }, { PGPASSWORD: 'unit-test-placeholder' },
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 10000,
      env: { SystemRoot: process.env.SystemRoot, ...settings },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('empty bootstrap must have a ledger; existing history cannot be silently baselined', () => {
  assert.doesNotThrow(() => assertIntegrity([first], bootstrapped));
  assert.doesNotThrow(() => assertIntegrity([], bootstrapped));
  assert.throws(() => assertIntegrity([first], { ...bootstrapped, ledgerExists: false }));
  assert.throws(() => assertIntegrity([first], { ...applied, ledger: [] }));
  assert.throws(() => assertIntegrity([first], { ...applied, historyExists: false }));
});

test('changed or missing historical files and malformed ledger hashes are rejected', () => {
  const changed = snapshotSql(first.path, Buffer.from(sql.replace('SELECT 1;', 'SELECT 3;')));
  assert.throws(() => assertIntegrity([changed], applied));
  assert.throws(() => assertIntegrity([], applied));
  assert.throws(() => assertIntegrity([first], { ...applied, ledger: [{ name: first.name, sha256: 'invalid' }] }));
  assert.throws(() => assertIntegrity([first], { ...applied, ledger: [...applied.ledger, ...applied.ledger] }));
});

test('history ordering and ledger prefixes must agree; rolled-back baselines remain valid', () => {
  assert.doesNotThrow(() => assertIntegrity([first, second], applied));
  assert.doesNotThrow(() => assertIntegrity([first], { ...applied, history: [] }));
  assert.throws(() => assertIntegrity([first], { ...applied, history: [first.name, first.name] }));
  assert.throws(() => assertIntegrity([first, second], {
    ...applied, history: [second.name], ledger: [{ name: second.name, sha256: second.sha256 }],
  }));
});

test('engine callback is never invoked when integrity fails', async () => {
  let engineCalls = 0;
  await assert.rejects(executeAfterIntegrityCheck([first], { ...applied, ledger: [] }, async () => {
    engineCalls += 1;
  }));
  assert.equal(engineCalls, 0);
  await executeAfterIntegrityCheck([first], applied, async () => { engineCalls += 1; });
  assert.equal(engineCalls, 1);
});

test('loader rechecks integrity after locking and rejects a changed file list', async () => {
  const loader = createVerifiedLoader([first], async () => ({ ...applied, ledger: [] }));
  await assert.rejects(loader([first.path]));
  const safeLoader = createVerifiedLoader([first], async () => applied);
  await assert.rejects(safeLoader([]));
  await assert.rejects(safeLoader([first.path, first.path]));
  await assert.rejects(safeLoader(['/virtual/0002_second.sql']));
});

test('a successful earlier check cannot bypass changed metadata at the loader hook', async () => {
  assertIntegrity([first], applied);
  const changed = { ...applied, ledger: [{ name: first.name, sha256: 'a'.repeat(64) }] };
  await assert.rejects(createVerifiedLoader([first], async () => changed)([first.path]));
  await assert.rejects(createVerifiedLoader([first], async () => {
    assertHistoryLocation([{ schema: 'public' }]);
    return applied;
  })([first.path]));
});

test('SQL and checksum are queued together on a transactional public builder, including down', async () => {
  // The builder only queues SQL; any attempted database execution fails this test.
  const forbiddenQuery = async () => { throw new Error('Database access prohibited in unit tests.'); };
  const builder = new MigrationBuilder({ query: forbiddenQuery, select: forbiddenQuery }, {}, false,
    { info: () => {}, warn: () => {}, error: () => {} });
  const units = await createVerifiedLoader([first], async () => applied)([first.path]);
  const unit = units[0];
  assert.ok(unit);
  assert.ok(typeof unit.actions.up === 'function' && typeof unit.actions.down === 'function');
  await unit.actions.up(builder);
  const steps = builder.getSqlSteps();
  assert.equal(steps.length, 2);
  assert.match(steps[0] ?? '', /SELECT 1/);
  assert.match(steps[1] ?? '', new RegExp(first.sha256));
  assert.match(steps[1] ?? '', /ELSE NULL/);
  assert.equal(builder.isUsingTransaction(), true);
  await unit.actions.down(builder);
  assert.match(builder.getSqlSteps()[2] ?? '', /SELECT 2/);
  assert.equal(builder.getSqlSteps()[3], steps[1]);
  assert.ok(!builder.getSql().includes('DELETE FROM nutrasa_migrations.migration_checksums'));
});

test('file snapshots are read once; later edits cannot change the queued SQL/hash', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nutrasa-migration-unit-'));
  t.after(async () => {
    assert.equal(dirname(directory), tmpdir());
    await rm(directory, { recursive: true, force: true });
  });
  const path = join(directory, '0001_first.sql');
  await writeFile(join(directory, '.gitkeep'), '');
  await writeFile(path, sql);
  const snapshots = await readSqlSnapshots(directory);
  await writeFile(path, sql.replace('SELECT 1;', 'SELECT 99;'));
  assert.equal(snapshots[0]?.sha256, sha256(Buffer.from(sql)));
  assert.equal(snapshots[0]?.content, sql);
  assert.notEqual(sha256(await readFile(path)), snapshots[0]?.sha256);
  const units = await createVerifiedLoader(snapshots, async () => bootstrapped)([path]);
  assert.equal(units.length, 1);
  await writeFile(join(directory, '0001_duplicate.sql'), sql);
  await assert.rejects(readSqlSnapshots(directory));
  await rm(join(directory, '0001_duplicate.sql'));
  await writeFile(join(directory, 'unexpected.js'), '');
  await assert.rejects(readSqlSnapshots(directory));
  await rm(join(directory, 'unexpected.js'));
  await rm(path);
  await assert.rejects(readFile(path));
});
