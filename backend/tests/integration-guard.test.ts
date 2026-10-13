import assert from 'node:assert/strict';
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
  assertIntegrationServer, ledgerDefinitionFromBootstrap, readIntegrationEnvironment, verifyFixtureDirectory,
  verifyIntegrationConnection,
} from './integration/guard.ts';

const id = 'a'.repeat(32);
const database = `nutrasa_it_${id}`;
const role = `${database}_migrator`;
const connection = `postgresql://${role}:unit-test-placeholder@127.0.0.1:5432/${database}`;
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
    { NUTRASA_IT_DATABASE_URL: connection.replace('5432', '5433') },
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

test('server facts require loopback, provisioning marker, and an unprivileged migrator', () => {
  const facts = { address: '127.0.0.1', port: 5432, marker: `NUTRASA migration integration:${id}`, privileged: false };
  assert.doesNotThrow(() => assertIntegrationServer(facts, target));
  assert.doesNotThrow(() => assertIntegrationServer({ ...facts, address: '::1' }, target));
  for (const changes of [{ address: '10.0.0.1' }, { port: 5433 }, { marker: null },
    { marker: 'another target' }, { privileged: true }]) {
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
          port: 5432, marker: `NUTRASA migration integration:${id}`, privileged: false,
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

test('manual provisioning and cleanup use the same loopback host check', async () => {
  for (const name of ['provision', 'cleanup']) {
    const source = await readFile(new URL(`./integration/${name}.sql`, import.meta.url), 'utf8');
    assert.ok(source.includes("host(inet_server_addr()) IN ('127.0.0.1', '::1') AND inet_server_port() = 5432"));
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
