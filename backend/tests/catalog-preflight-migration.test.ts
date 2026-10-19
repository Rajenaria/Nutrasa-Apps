import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { readSqlSnapshots } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';
import { readCatalogPreflightEnvironment } from './integration/catalog-preflight-guard.ts';

test('catalog preflight builds UP/DOWN plus immutable checksum through the existing public loader without DB access', async () => {
  const snapshots = await readSqlSnapshots(migrationsDirectory);
  assert.equal(snapshots.length, 11);
  const file = snapshots[9]; assert.ok(file); assert.equal(file.name, '0010_catalog_preflight');
  const migrations = await createVerifiedLoader(snapshots, async () => ({
    ledgerExists: true, historyExists: false, history: [], ledger: [],
  }))(snapshots.map(snapshot => snapshot.path));
  for (const direction of ['up', 'down'] as const) {
    const forbidden = async () => { throw Error('Database access forbidden.'); };
    const builder = new MigrationBuilder({ query: forbidden, select: forbidden }, {}, false, { info() {}, warn() {}, error() {} });
    const action = migrations[9]?.actions[direction]; assert.equal(typeof action, 'function');
    if (typeof action !== 'function') throw Error('Missing migration action.');
    await action(builder);
    assert.equal(builder.isUsingTransaction(), true);
    assert.equal(builder.getSqlSteps().length, 2);
    assert.ok(builder.getSqlSteps()[1]?.includes(file.sha256));
    assert.doesNotMatch(builder.getSqlSteps()[0] ?? '', /CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT EXECUTE|OWNER TO|CASCADE/);
  }
  const sql = await readFile(file.path, 'utf8');
  assert.ok(sql.includes("review_kind = 'PUBLICATION'"));
  assert.ok(sql.includes('WHERE NOT a.repeated'));
  assert.ok(sql.includes('a.grantee <> p.proowner'));
});

test('catalog integration rejects the retained writer target and missing separate confirmation before any connection', () => {
  const database = 'nutrasa_it_10000000000040008000000000000010';
  const environment = {
    NUTRASA_IT_DATABASE_URL: `postgresql://${database}_migrator:synthetic@127.0.0.1:5433/${database}`,
    NUTRASA_IT_READER_URL: `postgresql://${database}_runtime:synthetic@127.0.0.1:5433/${database}`,
    NUTRASA_IT_WRITER_URL: `postgresql://${database}_writer:synthetic@127.0.0.1:5433/${database}`,
    NUTRASA_IT_ADMIN_URL: `postgresql://nutrasa_it_admin:synthetic@127.0.0.1:5433/${database}`,
    NUTRASA_IT_CONFIRM_DATABASE: database, NUTRASA_IT_GOVERNANCE_CONFIRM: database,
    NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM: database,
  };
  assert.equal(readCatalogPreflightEnvironment(environment).migrator.database, database);
  assert.throws(() => readCatalogPreflightEnvironment({ ...environment, NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM: '' }));
  const retained = 'nutrasa_it_5ca7bad4722340279d938775731cd4ee';
  assert.throws(() => readCatalogPreflightEnvironment(Object.fromEntries(Object.entries(environment).map(([key,value]) =>
    [key,value.replaceAll(database,retained)]))));
  for (const changes of [{ PGPORT: '5432' }, { PGOPTIONS: 'unapproved' }, { PGREPLICATION: '1' },
    { NUTRASA_IT_WRITER_URL: environment.NUTRASA_IT_WRITER_URL.replace('5433','5432') },
    { NUTRASA_IT_ADMIN_URL: environment.NUTRASA_IT_ADMIN_URL.replace('/'+database,'/postgres') }]) {
    assert.throws(() => readCatalogPreflightEnvironment({ ...environment, ...changes }));
  }
});
