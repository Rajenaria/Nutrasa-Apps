import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';

import { executeAfterIntegrityCheck, readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';

test('domain migrations preserve historical bytes and exclude both new failure fixtures', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.deepEqual(files.map(file => file.name), [
    '0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy', '0005_food_servings_provenance', '0006_catalog_audit', '0007_catalog_digest',
  ]);
  assert.deepEqual(files.slice(0, 3).map(file => file.sha256), [
    'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af',
    '9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6',
    '24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888',
  ]);
  for (const fixture of ['food-taxonomy/0005_failure.sql', 'food-servings/0006_failure.sql']) {
    const path = fileURLToPath(new URL(`./integration/fixtures/${fixture}`, import.meta.url));
    const snapshot = snapshotSql(path, await readFile(path));
    assert.ok(snapshot.name.endsWith('_failure'));
    assert.ok(!files.some(file => file.path === path || file.name === snapshot.name));
  }
});

for (const name of ['0004_food_taxonomy', '0005_food_servings_provenance']) {
  test(`${name} queues actual UP and DOWN with atomic checksum actions through the public loader`, async () => {
    const files = await readSqlSnapshots(migrationsDirectory);
    const file = files.find(entry => entry.name === name);
    assert.ok(file);
    const units = await createVerifiedLoader(files, async () => ({
      ledgerExists: true, historyExists: false, history: [], ledger: [],
    }))(files.map(entry => entry.path));
    const unit = units.find(entry => entry.id === file.path);
    assert.ok(unit);
    const forbiddenQuery = async () => { throw new Error('Database access prohibited in unit tests.'); };
    for (const direction of ['up', 'down'] as const) {
      const builder = new MigrationBuilder({ query: forbiddenQuery, select: forbiddenQuery }, {}, false,
        { info: () => {}, warn: () => {}, error: () => {} });
      const action = unit.actions[direction];
      assert.ok(typeof action === 'function');
      await action(builder);
      const steps = builder.getSqlSteps();
      const downStart = file.content.search(/^\s*-- Down Migration/m);
      const migrationSql: string = direction === 'up' ? file.content.slice(0, downStart) : file.content.slice(downStart);
      // The public builder appends a terminator after the snapshot's final LF.
      assert.equal(steps[0], `${migrationSql};`);
      assert.equal(steps.length, 2);
      assert.ok(steps[1]?.includes(file.sha256));
      assert.equal(builder.isUsingTransaction(), true);
      assert.doesNotMatch(steps[0] ?? '', /\bCASCADE\b/i);
    }
  });

  test(`${name} changed or missing applied bytes fail before any execution, including after DOWN`, async () => {
    const files = await readSqlSnapshots(migrationsDirectory);
    const file = files.find(entry => entry.name === name);
    assert.ok(file);
    const ledger = files.map(entry => ({ name: entry.name, sha256: entry.sha256 }));
    const changed = snapshotSql(file.path, new TextEncoder().encode(`${file.content}\n`));
    let executed = 0;
    const execute = async () => { executed++; };
    for (const history of [files.map(entry => entry.name), []]) {
      const state = { ledgerExists: true, historyExists: true, history, ledger };
      await assert.rejects(executeAfterIntegrityCheck(files.map(entry => entry === file ? changed : entry), state, execute),
        /Historical migration missing, changed/);
      await assert.rejects(executeAfterIntegrityCheck(files.filter(entry => entry !== file), state, execute),
        /Historical migration missing, changed/);
      await executeAfterIntegrityCheck(files, state, execute);
    }
    assert.equal(executed, 2, 'Only the two unchanged baselines may reach execution.');
  });
}

test('the domain migration loader rejects a fixture substitution before constructing any actions', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  let inspections = 0;
  const loader = createVerifiedLoader(files, async () => {
    inspections++;
    return { ledgerExists: true, historyExists: false, history: [], ledger: [] };
  });
  const path = fileURLToPath(new URL('./integration/fixtures/food-taxonomy/0005_failure.sql', import.meta.url));
  await assert.rejects(loader([...files.slice(0, 4).map(file => file.path), path]), /file list changed/);
  assert.equal(inspections, 0);
});
