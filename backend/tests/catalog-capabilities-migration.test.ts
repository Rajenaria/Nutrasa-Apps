import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { executeAfterIntegrityCheck, readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';

test('capability migration follows all seven immutable domains and excludes its failure fixture', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.equal(files.length, 11);
  assert.equal(files[8]?.name, '0009_catalog_capability_writer');
  assert.equal(files[6]?.sha256, 'b6df290443a21652ce28776bbf3b2f86fac085151eb8759b6c0c9d2802930425');
  assert.equal(files[7]?.name, '0008_catalog_capabilities');
  const fixture = snapshotSql('0009_failure.sql', await readFile(new URL('./integration/fixtures/catalog-capabilities/0009_failure.sql', import.meta.url)));
  assert.equal(fixture.name, '0009_failure');
  assert.ok(!files.some(file => file.name === fixture.name));
});

test('capability SQL uses the public transactional loader with checksums and guarded DOWN without new privileges', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const file = files[7]; assert.ok(file);
  const units = await createVerifiedLoader(files, async () => ({ ledgerExists: true, historyExists: false, history: [], ledger: [] }))(
    files.map(file => file.path));
  const unit = units[7]; assert.ok(unit);
  for (const direction of ['up', 'down'] as const) {
    const denied = async () => { throw new Error('Database access prohibited.'); };
    const builder = new MigrationBuilder({ query: denied, select: denied }, {}, false, { info() {}, warn() {}, error() {} });
    const action = unit.actions[direction];
    assert.equal(typeof action, 'function');
    if (typeof action !== 'function') throw new Error('Missing direction.');
    await action(builder);
    const [sql, checksum] = builder.getSqlSteps(); assert.ok(sql && checksum);
    assert.equal(builder.isUsingTransaction(), true);
    assert.equal(builder.getSqlSteps().length, 2);
    assert.ok(checksum.includes(file.sha256));
    assert.doesNotMatch(sql, /\bCASCADE\b|SECURITY DEFINER|CREATE\s+(?:FUNCTION|TRIGGER|ROLE)|^\s*(?:GRANT|INSERT|UPDATE|DELETE|ALTER)\s/im);
    if (direction === 'up') {
      assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 2);
      assert.equal((sql.match(/ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE/g) ?? []).length, 3);
      assert.equal((sql.match(/CHECK \(scope ~ '\[\^\[:space:\]\]'/g) ?? []).length, 2);
      assert.doesNotMatch(sql, /scope\s*=|CATALOG|CREATE INDEX/);
    } else {
      assert.ok(sql.indexOf('LOCK TABLE') < sql.indexOf('SELECT 1 /'));
      assert.ok(sql.indexOf('SELECT 1 /') < sql.indexOf('DROP TABLE'));
      assert.ok(sql.includes("pg_catalog.current_setting('transaction_isolation') = 'read committed'"));
      for (const table of ['catalog_capability_events', 'catalog_capability_assignments'])
        assert.ok(sql.includes(`NOT EXISTS (SELECT 1 FROM nutrasa.${table})`));
      assert.ok(sql.indexOf('DROP TABLE nutrasa.catalog_capability_assignments') < sql.indexOf('DROP TABLE nutrasa.catalog_capability_events'));
    }
  }
});

test('changed or missing capability history is rejected before execution even after DOWN', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const file = files[7]; assert.ok(file);
  const changed = snapshotSql(file.path, Buffer.from(`${file.content}\n`));
  for (const history of [files.map(file => file.name), files.slice(0, 7).map(file => file.name)]) {
    const state = { ledgerExists: true, historyExists: true, history, ledger: files.map(file => ({ name: file.name, sha256: file.sha256 })) };
    let calls = 0;
    const execute = async () => { calls++; };
    await assert.rejects(executeAfterIntegrityCheck([...files.slice(0, 7), changed], state, execute));
    await assert.rejects(executeAfterIntegrityCheck(files.slice(0, 7), state, execute));
    assert.equal(calls, 0);
  }
});
