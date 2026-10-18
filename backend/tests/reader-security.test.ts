import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Client, Pool } from 'pg';
import { createReaderTestPool } from './integration/reader-pool.ts';
import { assertReaderColumns, assertReaderIdentity, readReaderEnvironment, readerColumns,
  verifyReaderConnection } from './integration/reader-guard.ts';

const id = '0123456789abcdef0123456789abcdef';
const database = `nutrasa_it_${id}`;
const environment = { NUTRASA_IT_READER_URL: `postgresql://${database}_runtime:synthetic@127.0.0.1:5433/${database}`,
  NUTRASA_IT_CONFIRM_DATABASE: database };
const target = readReaderEnvironment(environment);
const identity = { database, role: target.role, session_role: target.role, address: '127.0.0.1', port: 5433,
  version: 180006, cluster: 'nutrasa_it_pg18', owner: 'nutrasa_it_admin', marker: `NUTRASA migration integration:${id}`,
  search_path: 'pg_catalog, nutrasa', runtime_writable: true, read_committed: true, restricted_role: true,
  no_role_paths: true, database_rights: true, database_acl: true, schema_owners: true,
  schema_rights: true, no_object_ownership: true };
const columns = Object.entries(readerColumns).flatMap(([table, names]) => names.map(column =>
  ({ schema: 'nutrasa', table, column, readable: true, writable: false, unsafe_acl: false })));

test('reader accepts only confirmed disposable runtime credentials on explicit test port without overrides', () => {
  assert.equal(target.role, `${database}_runtime`);
  for (const [key, value] of [['PGOPTIONS', '-c role=admin'], ['PGREPLICATION', 'database'], ['PGHOSTADDR', 'remote'],
    ['PGSERVICE', 'service'], ['PGSERVICEFILE', 'file'], ['PGPORT', '5432'], ['NUTRASA_IT_CONFIRM_DATABASE', 'other']])
    assert.throws(() => readReaderEnvironment({ ...environment, [key]: value }));
  for (const url of [environment.NUTRASA_IT_READER_URL.replace(':5433', ':5432'),
    environment.NUTRASA_IT_READER_URL.replace(':5433', ''),
    environment.NUTRASA_IT_READER_URL.replace('127.0.0.1', 'example.invalid'),
    environment.NUTRASA_IT_READER_URL.replace('_runtime:', '_migrator:'),
    environment.NUTRASA_IT_READER_URL.replace(':synthetic@', '@'),
    environment.NUTRASA_IT_READER_URL + '?options=x', environment.NUTRASA_IT_READER_URL + '#x'])
    assert.throws(() => readReaderEnvironment({ ...environment, NUTRASA_IT_READER_URL: url }));
});

test('reader identity rejects incorrect endpoint user marker ownership role paths and effective privileges', () => {
  assert.doesNotThrow(() => assertReaderIdentity(identity, target));
  for (const [key, value] of Object.entries(identity)) {
    assert.throws(() => assertReaderIdentity({ ...identity, [key]: typeof value === 'boolean' ? false : null }, target), key);
  }
  assert.throws(() => assertReaderIdentity({ ...identity, version: 190000 }, target));
  assert.throws(() => assertReaderIdentity({ ...identity, address: '127.0.0.1/32' }, target));
  // SQL normalizes inet to host(), rather than trusting/casting its /32 text representation.
});

test('manifest requires exactly thirteen readable columns and rejects writes PUBLIC grants and extra reads', () => {
  assert.equal(columns.length, 13); assertReaderColumns(columns);
  for (const rows of [columns.slice(1), [...columns, columns[0]],
    [...columns, { ...columns[0], column: 'reason' }],
    columns.map((r, i) => i ? r : { ...r, writable: true }),
    columns.map((r, i) => i ? r : { ...r, unsafe_acl: true }),
    columns.map((r, i) => i ? r : { ...r, readable: 'true' })]) assert.throws(() => assertReaderColumns(rows));
});

test('reader guard stops before further queries on identity or ACL failure; mocks do not prove database security', async () => {
  for (const failAt of [0, 1, 2]) {
    let calls = 0;
    await assert.rejects(verifyReaderConnection({ async query() {
      const step = calls++;
      if (step === 0) return { rows: [{ ...identity, no_role_paths: failAt !== 0 }] };
      if (step === 1) return { rows: failAt === 1 ? [] : columns };
      return { rows: [{ closed_relations: true, closed_functions: true, closed_defaults: failAt !== 2 }] };
    } }, target));
    assert.equal(calls, failAt + 1);
  }
});

test('manifest matches all query column references and immutable schema declarations statically', async () => {
  const adapter = await readFile(new URL('../src/capabilities.ts', import.meta.url), 'utf8');
  const aliases = { u: 'app_users', a: 'catalog_capability_assignments', e: 'catalog_capability_events', newer: 'catalog_capability_events' };
  const referenced = new Set<string>();
  for (const [alias, table] of Object.entries(aliases)) {
    for (const match of adapter.matchAll(new RegExp('\\b' + alias + '\\.([a-z_]+)', 'g'))) referenced.add(`${table}.${match[1]}`);
  }
  const expected = Object.entries(readerColumns).flatMap(([table, names]) => names.map(column => `${table}.${column}`));
  assert.deepEqual([...referenced].sort(), expected.sort());
  for (const [table, names] of Object.entries(readerColumns)) {
    const migration = await readFile(new URL('../migrations/' + (table === 'app_users' ? '0001_identity.sql' : '0008_catalog_capabilities.sql'), import.meta.url), 'utf8');
    const body = migration.split(`CREATE TABLE nutrasa.${table} (`)[1]?.split('\n);')[0];
    assert.ok(body);
    for (const name of names) assert.match(body, new RegExp('(?:^|\\n)  ' + name + '\\s'));
  }
});

test('test Pool guards each checkout and releases or discards on failure without a real connection', async t => {
  const releases: boolean[] = [];
  const client = Object.assign(new Client(), { release: (discard = false) => releases.push(discard) });
  t.mock.method(Client.prototype, 'connect', () => { throw new Error('Network forbidden.'); });
  const checkout = t.mock.method(Pool.prototype, 'connect', async () => client);
  const end = t.mock.method(Pool.prototype, 'end', async () => {});
  let rejectIdentity = false;
  t.mock.method(client, 'query', async (sql: string) => {
    if (sql.includes('current_database() AS database')) return { rows: [{ ...identity, no_role_paths: !rejectIdentity }] };
    if (sql.includes('AS readable')) return { rows: columns };
    if (sql.includes('AS closed_relations')) return { rows: [{ closed_relations: true, closed_functions: true, closed_defaults: true }] };
    if (sql.includes('pg_backend_pid()')) return { rows: [{ pid: 123 }] };
    assert.fail('Unsafe query must not execute after a rejected checkout.');
  });
  const guarded = await createReaderTestPool(target);
  assert.deepEqual(releases, [false]);
  await guarded.database.query('SELECT pg_catalog.pg_backend_pid() AS pid', []);
  rejectIdentity = true;
  await assert.rejects(guarded.database.query('UNSAFE_QUERY_MUST_NOT_RUN', []));
  assert.deepEqual(releases, [false, false, true]);
  assert.equal(checkout.mock.callCount(), 3);
  await guarded.pool.end(); assert.equal(end.mock.callCount(), 1);
});
