import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import type { MigrationBuilderActions } from 'node-pg-migrate/sqlMigration';

import { readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';

test('domain discovery orders the actual food sources migration after immutable identity and excludes failure fixtures', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.deepEqual(files.map(file => file.name), ['0001_identity', '0002_food_sources']);
  assert.equal(files[0]?.sha256, 'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af');
  const fixturePath = fileURLToPath(new URL('./integration/fixtures/food-sources/0003_failure.sql', import.meta.url));
  const fixture = snapshotSql(fixturePath, await readFile(fixturePath));
  assert.equal(fixture.name, '0003_failure');
  assert.ok(!files.some(file => file.path === fixture.path));
});

test('the actual food sources SQL loads both transactional actions with its byte checksum without database access', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const source = files[1];
  assert.ok(source);
  const units = await createVerifiedLoader(files, async () => ({
    ledgerExists: true, historyExists: false, history: [], ledger: [],
  }))(files.map(file => file.path));
  const unit = units.find(entry => entry.id === source.path);
  assert.ok(unit);
  const forbiddenQuery = async () => { throw new Error('Database access prohibited in unit tests.'); };
  const builder = () => new MigrationBuilder({ query: forbiddenQuery, select: forbiddenQuery }, {}, false,
    { info: () => {}, warn: () => {}, error: () => {} });

  for (const direction of ['up', 'down'] as const) {
    const action: MigrationBuilderActions[typeof direction] = unit.actions[direction];
    assert.ok(typeof action === 'function');
    const queued = builder();
    await action(queued);
    const steps = queued.getSqlSteps();
    assert.equal(steps.length, 2);
    assert.match(steps[0] ?? '', direction === 'up' ? /CREATE TABLE nutrasa\.food_sources/ : /DROP TABLE nutrasa\.food_sources/);
    assert.ok(steps[1]?.includes(source.sha256));
    assert.equal(queued.isUsingTransaction(), true);
  }
});
