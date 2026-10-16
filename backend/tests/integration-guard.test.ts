import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from 'pg';

import { assertConnectionIdentity, assertSchemaOwnership } from '../src/migrations/core.ts';
import { readMigrationEnvironment } from '../src/migrations/environment.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { readSqlSnapshots } from '../src/migrations/checksum.ts';
import {
  assertIntegrationServer, connectIntegrationTarget, ledgerDefinitionFromBootstrap, readIntegrationEnvironment, verifyFixtureDirectory,
  verifyIntegrationConnection,
} from './integration/guard.ts';

const id = 'a'.repeat(32);
const database = `nutrasa_it_${id}`;
const role = `${database}_migrator`;
const connection = `postgresql://${role}:unit-test-placeholder@127.0.0.1:5433/${database}`;
const target = readIntegrationEnvironment({
  NUTRASA_IT_DATABASE_URL: connection, NUTRASA_IT_CONFIRM_DATABASE: database,
});

test('integration guard requires an exact fresh target, matching role and explicit confirmation', () => {
  assert.equal(target.database, database);
  assert.throws(() => readIntegrationEnvironment({}));
  for (const changes of [
    { NUTRASA_IT_DATABASE_URL: undefined }, { NUTRASA_IT_CONFIRM_DATABASE: undefined },
    { NUTRASA_IT_DATABASE_URL: connection.replace(':unit-test-placeholder', '') },
    { NUTRASA_IT_CONFIRM_DATABASE: 'nutrasa_test' },
    { NUTRASA_IT_DATABASE_URL: connection.replace('127.0.0.1', '192.168.1.2') },
    { NUTRASA_IT_DATABASE_URL: connection.replace('5433', '5432') },
    { NUTRASA_IT_DATABASE_URL: `${connection}?options=unsafe` },
    { NUTRASA_IT_DATABASE_URL: `${connection}#override` },
    { NUTRASA_IT_DATABASE_URL: connection.replace(role, 'nutrasa_test_migrator') },
    { NUTRASA_IT_DATABASE_URL: connection.replace(`/${database}`, '/nutrasa_dev') },
    { NUTRASA_IT_DATABASE_URL: connection.replace(`/${database}`, `/${database}extra`) },
    { NUTRASA_IT_DATABASE_URL: connection.replace(`/${database}`, `/nutrasa_it_${'A'.repeat(32)}`) },
  ]) {
    assert.throws(() => readIntegrationEnvironment({
      NUTRASA_IT_DATABASE_URL: connection, NUTRASA_IT_CONFIRM_DATABASE: database, ...changes,
    }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(connection));
      return true;
    });
  }
});

test('integration URLs require an explicit approved port before client construction', () => {
  assert.equal(new URL(target.connectionString).port, '5433');
  for (const port of ['', ':', ':0', ':5432', ':5434', ':65536', ':invalid']) {
    assert.throws(() => readIntegrationEnvironment({
      NUTRASA_IT_DATABASE_URL: connection.replace(':5433', port),
      NUTRASA_IT_CONFIRM_DATABASE: database,
    }));
  }
});

test('integration environment rejects inherited startup settings without revealing their values', () => {
  for (const key of ['PGOPTIONS', 'PGREPLICATION']) {
    for (const value of ['unit-test-private-setting', ' ', '0']) {
      assert.throws(() => readIntegrationEnvironment({
        NUTRASA_IT_DATABASE_URL: connection, NUTRASA_IT_CONFIRM_DATABASE: database, [key]: value,
      }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(key));
        if (value.trim()) assert.ok(!error.message.includes(value));
        assert.ok(!error.message.includes(connection));
        return true;
      });
    }
  }
  assert.equal(readIntegrationEnvironment({
    NUTRASA_IT_DATABASE_URL: connection, NUTRASA_IT_CONFIRM_DATABASE: database,
    PGOPTIONS: '', PGREPLICATION: '',
  }).database, database);
});

test('direct integration connection rejects forged targets without initiating connections', async (t) => {
  const connect = t.mock.method(Client.prototype, 'connect', () => {
    throw new Error('Database access prohibited in unit tests.');
  });
  for (const changes of [
    { database: 'nutrasa_dev' }, { role: 'postgres' }, { id: 'b'.repeat(32) },
    { connectionString: connection.replace(':5433', '') },
    { connectionString: connection.replace(':5433', ':5432') },
    { connectionString: connection.replace(':unit-test-placeholder', '') },
    { connectionString: connection.replace('127.0.0.1', '192.168.1.2') },
    { connectionString: connection.replace(`/${database}`, '/nutrasa_test') },
  ]) {
    await assert.rejects(connectIntegrationTarget({ ...target, ...changes }, 'unit_test'));
  }
  assert.equal(connect.mock.callCount(), 0);
});

test('actual pg construction cannot inherit a different port or unapproved startup settings', () => {
  // Child processes isolate synthetic PG settings; the parent environment is never mutated.
  const script = `
    import assert from 'node:assert/strict';
    import { Client } from 'pg';
    import { connectIntegrationTarget, readIntegrationEnvironment } from './tests/integration/guard.ts';
    const target = readIntegrationEnvironment({
      NUTRASA_IT_DATABASE_URL: ${JSON.stringify(connection)},
      NUTRASA_IT_CONFIRM_DATABASE: ${JSON.stringify(database)},
    });
    const before = { ...process.env };
    let connected = false;
    let observed;
    const statements = [];
    Client.prototype.connect = async function () {
      connected = true;
      observed = { port: this.port, database: this.database, role: this.user, ssl: this.ssl };
      return this;
    };
    Client.prototype.query = async function (statement) {
      statements.push(statement);
      if (statement.includes('current_database() AS database'))
        return { rows: [{ database: target.database, role: target.role, login_role: target.role }] };
      if (statement.includes('nspname AS name'))
        return { rows: [{ name: 'nutrasa', owned: true }, { name: 'nutrasa_migrations', owned: true }] };
      if (statement.includes('inet_server_addr()'))
        return { rows: [{ address: '127.0.0.1', port: 5433,
          server_version_num: 180006, cluster_name: 'nutrasa_it_pg18', database_owner: 'nutrasa_it_admin',
          marker: 'NUTRASA migration integration:' + target.id, privileged: false }] };
      assert.equal(statement, "SET statement_timeout = '10s'");
      return { rows: [] };
    };
    Client.prototype.end = async function () {};
    if (process.env.PGOPTIONS || process.env.PGREPLICATION) {
      await assert.rejects(connectIntegrationTarget(target, 'unit_test'), /Inherited PGOPTIONS/);
      assert.equal(statements.length, 0);
    } else {
      const client = await connectIntegrationTarget(target, 'unit_test');
      assert.deepEqual(observed, { port: 5433, database: target.database, role: target.role, ssl: false });
      assert.equal(statements.length, 4);
      await client.end();
    }
    assert.equal(connected, !(process.env.PGOPTIONS || process.env.PGREPLICATION));
    assert.deepEqual({ ...process.env }, before);
  `;
  for (const settings of [
    {},
    { PGPORT: '5432' }, { PGPORT: '6543' }, { PGPORT: 'invalid' },
    { PGOPTIONS: '-c search_path=public' }, { PGREPLICATION: 'database' },
    { PGOPTIONS: ' ', PGREPLICATION: '0' },
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 10000,
      env: { SystemRoot: process.env.SystemRoot, ...settings },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('production allowlist cannot be widened by integration variables', () => {
  assert.throws(() => readMigrationEnvironment({
    MIGRATION_DATABASE_URL: connection,
    NUTRASA_IT_DATABASE_URL: connection, NUTRASA_IT_CONFIRM_DATABASE: database,
  }));
  for (const name of ['nutrasa_dev', 'nutrasa_test']) {
    const url = `postgresql://${name}_migrator@localhost/${name}`;
    assert.equal(readMigrationEnvironment({ MIGRATION_DATABASE_URL: url }).database, name);
    assert.throws(() => readIntegrationEnvironment({
      NUTRASA_IT_DATABASE_URL: url, NUTRASA_IT_CONFIRM_DATABASE: name,
    }));
  }
});

test('session identity and schema ownership reject role switching and incorrect ownership', () => {
  const identity = { database, role, login_role: role };
  assert.doesNotThrow(() => assertConnectionIdentity(identity, target));
  for (const changes of [{ database: 'nutrasa_test' }, { role: 'postgres' }, { login_role: 'postgres' }]) {
    assert.throws(() => assertConnectionIdentity({ ...identity, ...changes }, target));
  }
  assert.throws(() => assertConnectionIdentity(undefined, target));
  const schemas = [{ name: 'nutrasa', owned: true }, { name: 'nutrasa_migrations', owned: true }];
  assert.doesNotThrow(() => assertSchemaOwnership(schemas));
  assert.throws(() => assertSchemaOwnership(schemas.slice(0, 1)));
  assert.throws(() => assertSchemaOwnership([...schemas, { name: 'public', owned: true }]));
  assert.throws(() => assertSchemaOwnership(schemas.map((schema) => ({ ...schema, owned: false }))));
  assert.throws(() => assertSchemaOwnership([schemas[0], schemas[0]].filter((schema) => schema !== undefined)));
});

test('server facts require the dedicated PostgreSQL 18 cluster, expected owner, marker and unprivileged migrator', () => {
  const facts = {
    address: '127.0.0.1', port: 5433, marker: `NUTRASA migration integration:${id}`, privileged: false,
    server_version_num: 180006, cluster_name: 'nutrasa_it_pg18', database_owner: 'nutrasa_it_admin',
  };
  assert.doesNotThrow(() => assertIntegrationServer(facts, target));
  assert.doesNotThrow(() => assertIntegrationServer({ ...facts, address: '::1' }, target));
  assert.doesNotThrow(() => assertIntegrationServer({ ...facts, server_version_num: 180000 }, target));
  assert.doesNotThrow(() => assertIntegrationServer({ ...facts, server_version_num: 189999 }, target));
  for (const changes of [{ address: '10.0.0.1' }, { port: 5432 }, { port: 5434 }, { marker: null },
    { marker: 'another target' }, { privileged: true }, { server_version_num: 179999 },
    { server_version_num: 190000 }, { server_version_num: NaN }, { server_version_num: 180000.5 },
    { cluster_name: '' }, { cluster_name: 'primary' }, { database_owner: role }, { database_owner: 'postgres' }]) {
    assert.throws(() => assertIntegrationServer({ ...facts, ...changes }, target));
  }
  assert.throws(() => assertIntegrationServer(undefined, target));
});

test('connection guard requests host addresses without inet netmasks and rejects remote hosts', async (t) => {
  for (const address of [
    { text: '127.0.0.1/32', host: '127.0.0.1', accepted: true },
    { text: '::1/128', host: '::1', accepted: true },
    { text: '192.168.1.2/32', host: '192.168.1.2', accepted: false },
  ]) {
    const client = new Client({ connectionString: connection, ssl: false });
    t.mock.method(client, 'connect', () => { throw new Error('Database access prohibited in unit tests.'); });
    // Model PostgreSQL's text/host results without opening a connection or executing SQL.
    t.mock.method(client, 'query', async (statement: string) => {
      if (statement.includes('current_database() AS database')) {
        return { rows: [{ database, role, login_role: role }] };
      }
      if (statement.includes('nspname AS name')) {
        return { rows: [{ name: 'nutrasa', owned: true }, { name: 'nutrasa_migrations', owned: true }] };
      }
      if (statement.includes('inet_server_addr()')) {
        return { rows: [{
          address: statement.includes('host(inet_server_addr()) AS address') ? address.host : address.text,
          port: 5433, marker: `NUTRASA migration integration:${id}`, privileged: false,
          server_version_num: 180006, cluster_name: 'nutrasa_it_pg18', database_owner: 'nutrasa_it_admin',
        }] };
      }
      throw new Error('Unexpected query in connection guard.');
    });
    if (address.accepted) {
      await verifyIntegrationConnection(client, target);
    } else {
      await assert.rejects(verifyIntegrationConnection(client, target), /Integration server/);
    }
  }
});

test('wrong server identity closes the mocked client before session configuration or mutations', async (t) => {
  const connect = t.mock.method(Client.prototype, 'connect', async function (this: Client) { return this; });
  const end = t.mock.method(Client.prototype, 'end', async () => {});
  let facts = {
    address: '127.0.0.1', port: 5433, marker: `NUTRASA migration integration:${id}`, privileged: false,
    server_version_num: 180006, cluster_name: 'nutrasa_it_pg18', database_owner: 'nutrasa_it_admin',
  };
  const query = t.mock.method(Client.prototype, 'query', async (statement: string) => {
    if (statement.includes('current_database() AS database')) return { rows: [{ database, role, login_role: role }] };
    if (statement.includes('nspname AS name')) return { rows: [{ name: 'nutrasa', owned: true }, { name: 'nutrasa_migrations', owned: true }] };
    if (statement.includes('inet_server_addr()')) {
      assert.ok(statement.includes("current_setting('server_version_num')::integer AS server_version_num"));
      assert.ok(statement.includes("current_setting('cluster_name') AS cluster_name"));
      assert.ok(statement.includes('pg_catalog.pg_get_userbyid(d.datdba) AS database_owner'));
      assert.ok(statement.includes("pg_catalog.has_database_privilege(r.oid, d.oid, 'CREATE')"));
      assert.ok(statement.includes("pg_catalog.has_database_privilege(r.oid, d.oid, 'TEMPORARY')"));
      assert.ok(statement.includes('m.member = r.oid OR m.roleid = r.oid'));
      return { rows: [facts] };
    }
    throw new Error('Unexpected session configuration or mutation.');
  });
  const expected = { ...facts };
  const changes = [{ port: 5432 }, { server_version_num: 170006 },
    { cluster_name: 'primary' }, { database_owner: 'postgres' }];
  for (const change of changes) {
    facts = { ...expected, ...change };
    await assert.rejects(connectIntegrationTarget(target, 'unit_test'), /rejected or unavailable/);
  }
  assert.equal(connect.mock.callCount(), changes.length);
  assert.equal(end.mock.callCount(), changes.length);
  assert.equal(query.mock.callCount(), changes.length * 3);
});

test('manual provisioning and cleanup guard the dedicated instance before DDL and after every reconnect', async () => {
  for (const name of ['provision', 'cleanup']) {
    const source = await readFile(new URL(`./integration/${name}.sql`, import.meta.url), 'utf8');
    const guard = "host(inet_server_addr()) IN ('127.0.0.1', '::1') AND inet_server_port() = 5433";
    const checks = source.split('\\connect ');
    for (const section of checks) {
      for (const clause of [guard, "current_user = 'nutrasa_it_admin' AND session_user = current_user",
        "current_setting('server_version_num')::integer >= 180000",
        "current_setting('server_version_num')::integer < 190000",
        "current_setting('cluster_name') = 'nutrasa_it_pg18'"]) {
        assert.ok(section.includes(clause));
      }
      const firstMutation = section.search(/(?:CREATE ROLE|REVOKE ALL|DROP DATABASE)/);
      if (firstMutation >= 0) assert.ok(section.indexOf(guard) < firstMutation);
    }
    assert.ok(!source.includes('5432'));
    assert.ok(!source.includes('inet_server_addr()::text'));
  }
});

test('integration bootstrap reuses the reviewed ledger definition and fails on changed boundaries', async () => {
  const source = await readFile(new URL('../sql/bootstrap-migration-ledger.sql', import.meta.url), 'utf8');
  const definition = ledgerDefinitionFromBootstrap(source);
  assert.ok(definition.startsWith('CREATE TABLE nutrasa_migrations.migration_checksums ('));
  assert.ok(definition.includes('COLLATE "C"'));
  assert.ok(!definition.includes('DO $bootstrap$') && !definition.includes('COMMIT;'));
  for (const changed of ['', source.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '),
    source.replace('\nREVOKE ALL ON TABLE', '\n-- missing boundary'), `${source}\n${definition}`]) {
    assert.throws(() => ledgerDefinitionFromBootstrap(changed));
  }
});

test('all integration fixtures pass the real snapshot parser and remain outside domain discovery', async () => {
  for (const group of ['success', 'failure', 'pending', 'concurrent']) {
    const path = fileURLToPath(new URL(`./integration/fixtures/${group}/`, import.meta.url));
    assert.notEqual(path, migrationsDirectory);
    const snapshots = await readSqlSnapshots(path);
    assert.equal(snapshots.length, 1);
  }
  const config = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.ok(config.includes('"test": "node --test tests/*.test.ts"'));
  assert.ok(config.includes('tests/integration/migrations.integration.ts'));
});

test('worker fixture workspace requires matching run id and cannot use the domain directory', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), `nutrasa-it-${id}-`)));
  t.after(async () => {
    assert.equal(dirname(root), await realpath(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const directory = join(root, 'migrations');
  await mkdir(directory);
  await writeFile(join(root, 'run-id'), id);
  await verifyFixtureDirectory(directory, target);
  await assert.rejects(verifyFixtureDirectory(migrationsDirectory, target));
  await writeFile(join(root, 'run-id'), 'b'.repeat(32));
  await assert.rejects(verifyFixtureDirectory(directory, target));
});
