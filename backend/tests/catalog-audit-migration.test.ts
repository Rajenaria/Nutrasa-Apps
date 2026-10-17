import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import type { MigrationUnit } from 'node-pg-migrate/migrationLoader';

import { executeAfterIntegrityCheck, readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';

test('audit discovery preserves all five applied byte hashes and excludes its failure fixture', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.deepEqual(files.map(file => file.name), ['0001_identity', '0002_food_sources', '0003_food_catalog',
    '0004_food_taxonomy', '0005_food_servings_provenance', '0006_catalog_audit', '0007_catalog_digest']);
  assert.deepEqual(files.slice(0, 5).map(file => file.sha256), [
    'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af',
    '9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6',
    '24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888',
    'd5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542',
    '1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218',
  ]);
  const path = new URL('./integration/fixtures/catalog-audit/0007_failure.sql', import.meta.url);
  assert.equal(snapshotSql(path.pathname, await readFile(path)).name, '0007_failure');
  assert.ok(!files.some(file => file.name === '0007_failure'));
});

test('actual audit UP and guarded DOWN queue with their checksum through the transactional public loader', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const audit = files[5];
  assert.ok(audit);
  const units = await createVerifiedLoader(files, async () => ({ ledgerExists: true, historyExists: false, history: [], ledger: [] }))(
    files.map(file => file.path));
  const unit = units[5];
  assert.ok(unit);
  for (const direction of ['up', 'down'] as const) {
    const denied = async () => { throw new Error('Database access prohibited.'); };
    const builder = new MigrationBuilder({ query: denied, select: denied }, {}, false, { info() {}, warn() {}, error() {} });
    const action: MigrationUnit['actions']['up'] = unit.actions[direction];
    assert.equal(typeof action, 'function');
    if (typeof action !== 'function') throw new Error('Missing migration direction.');
    await action(builder);
    const [sql, checksum] = builder.getSqlSteps();
    assert.ok(sql && checksum);
    assert.ok(checksum.includes(audit.sha256));
    assert.equal(builder.getSqlSteps().length, 2);
    assert.equal(builder.isUsingTransaction(), true);
    assert.doesNotMatch(sql, /\bCASCADE\b|CREATE\s+(?:FUNCTION|TRIGGER|PROCEDURE)|\bGRANT\b/i);
    if (direction === 'down') {
      assert.ok(sql.indexOf('LOCK TABLE') < sql.indexOf('SELECT 1 /'));
      assert.ok(sql.indexOf('SELECT 1 /') < sql.indexOf('DROP INDEX'));
      for (const table of ['catalog_reviews', 'catalog_import_batches', 'catalog_review_sources'])
        assert.ok(sql.includes(`NOT EXISTS (SELECT 1 FROM nutrasa.${table})`));
      assert.ok(sql.includes('WHERE import_batch_id IS NOT NULL'));
      assert.ok(sql.includes("pg_catalog.current_setting('transaction_isolation') = 'read committed'"));
    }
  }
});

test('changed or missing applied audit SQL never reaches execution even after DOWN', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const audit = files[5];
  assert.ok(audit);
  const changed = snapshotSql(audit.path, Buffer.from(`${audit.content}\n`));
  for (const history of [files.map(file => file.name), files.slice(0, 5).map(file => file.name)]) {
    const state = { ledgerExists: true, historyExists: true, history,
      ledger: files.map(file => ({ name: file.name, sha256: file.sha256 })) };
    let calls = 0;
    const execute = async () => { calls++; };
    await assert.rejects(executeAfterIntegrityCheck([...files.slice(0, 5), changed, ...files.slice(6)], state, execute));
    await assert.rejects(executeAfterIntegrityCheck(files.filter(file => file.name !== audit.name), state, execute));
    assert.equal(calls, 0);
  }
});
