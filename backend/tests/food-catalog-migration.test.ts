import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';

import { assertIntegrity, readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';

test('catalog discovery preserves both historical migrations and isolates the batch failure fixture', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.deepEqual(files.map(file => file.name), [
    '0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy', '0005_food_servings_provenance',
  ]);
  assert.equal(files[0]?.sha256, 'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af');
  assert.equal(files[1]?.sha256, '9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6');
  const path = fileURLToPath(new URL('./integration/fixtures/food-catalog/0004_failure.sql', import.meta.url));
  assert.equal(snapshotSql(path, await readFile(path)).name, '0004_failure');
  assert.ok(!files.some(file => file.path === path));
});

test('catalog SQL uses the public loader and atomic checksum actions without database access', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const catalog = files[2];
  assert.ok(catalog);
  const load = createVerifiedLoader(files, async () => ({
    ledgerExists: true, historyExists: false, history: [], ledger: [],
  }));
  await assert.rejects(load(files.slice(0, 2).map(file => file.path)), /file list changed/);
  const units = await load(files.map(file => file.path));
  assert.deepEqual(units.map(unit => unit.id), files.map(file => file.path));
  const unit = units[2];
  assert.ok(unit);
  const forbiddenQuery = async () => { throw new Error('Database access prohibited in unit tests.'); };
  for (const direction of ['up', 'down'] as const) {
    const builder = new MigrationBuilder({ query: forbiddenQuery, select: forbiddenQuery }, {}, false,
      { info: () => {}, warn: () => {}, error: () => {} });
    const action = unit.actions[direction];
    assert.ok(typeof action === 'function');
    await action(builder);
    const steps = builder.getSqlSteps();
    assert.equal(steps.length, 2);
    const sql = steps[0];
    assert.ok(sql);
    if (direction === 'up') {
      const positions = ['CREATE TABLE nutrasa.foods', 'CREATE TABLE nutrasa.food_revisions',
        'CREATE TABLE nutrasa.food_revision_nutrients', 'ALTER TABLE nutrasa.foods'].map(statement => sql.indexOf(statement));
      assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > (positions[index - 1] ?? position))));
    } else {
      assert.match(sql, /^\s*-- Down Migration\s+ALTER TABLE nutrasa\.foods DROP CONSTRAINT foods_current_published_revision_fkey;/);
      assert.ok(sql.indexOf('DROP TABLE nutrasa.food_revision_nutrients') < sql.indexOf('DROP TABLE nutrasa.food_revisions;'));
      assert.ok(sql.indexOf('DROP TABLE nutrasa.food_revisions;') < sql.indexOf('DROP TABLE nutrasa.foods;'));
    }
    assert.doesNotMatch(sql, /\bCASCADE\b/i);
    assert.ok(steps[1]?.includes(catalog.sha256));
    assert.equal(builder.isUsingTransaction(), true);
  }
});

test('applied catalog baseline rejects changed or missing SQL and a reordered history', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const catalog = files[2];
  assert.ok(catalog);
  const state = { ledgerExists: true, historyExists: true,
    history: files.map(file => file.name), ledger: files.map(file => ({ name: file.name, sha256: file.sha256 })) };
  assert.doesNotThrow(() => assertIntegrity(files, state));
  const modified = snapshotSql(catalog.path, new TextEncoder().encode(`${catalog.content}\n`));
  assert.throws(() => assertIntegrity(files.map(file => file === catalog ? modified : file), state), /Historical migration missing, changed/);
  assert.throws(() => assertIntegrity(files.filter(file => file !== catalog), state), /Historical migration missing, changed/);
  assert.throws(() => assertIntegrity(files, { ...state, history: [...state.history].reverse() }), /history and checksum ledger disagree/);
});
