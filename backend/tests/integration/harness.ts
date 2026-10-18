import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import type { Client } from 'pg';
import { PG_MIGRATE_LOCK_ID } from 'node-pg-migrate/runner';

import { inspectIntegrityState, runMigrationCore } from '../../src/migrations/core.ts';
import { readSqlSnapshots } from '../../src/migrations/checksum.ts';
import { bootstrapIntegrationTarget } from './installation.ts';
import {
  connectIntegrationTarget, readIntegrationEnvironment,
  verifyFixtureDirectory, verifyIntegrationConnection,
} from './guard.ts';

export async function assertLockReleased(observer: Client) {
  const acquired = await observer.query<{ acquired: boolean }>(
    'SELECT pg_catalog.pg_try_advisory_lock($1::bigint) AS acquired', [PG_MIGRATE_LOCK_ID],
  );
  assert.equal(acquired.rows[0]?.acquired, true, 'Migration lock must be free while the runner connection remains open.');
  const released = await observer.query<{ released: boolean }>(
    'SELECT pg_catalog.pg_advisory_unlock($1::bigint) AS released', [PG_MIGRATE_LOCK_ID],
  );
  assert.equal(released.rows[0]?.released, true);
}

export async function createMigrationHarness(t: TestContext) {
  const target = readIntegrationEnvironment({
    NUTRASA_IT_DATABASE_URL: process.env.NUTRASA_IT_DATABASE_URL,
    NUTRASA_IT_CONFIRM_DATABASE: process.env.NUTRASA_IT_CONFIRM_DATABASE,
  });
  const root = await realpath(await mkdtemp(join(tmpdir(), `nutrasa-it-${target.id}-`)));
  const directory = join(root, 'migrations');
  await mkdir(directory);
  await writeFile(join(root, 'run-id'), target.id);
  t.after(async () => {
    // Only guarded filesystem fixtures are removed; database/role cleanup remains manual.
    await verifyFixtureDirectory(directory, target);
    assert.equal(dirname(root), await realpath(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const client = await connectIntegrationTarget(target, 'nutrasa_it_harness');
  t.after(() => client.end());
  const observer = await connectIntegrationTarget(target, 'nutrasa_it_observer');
  t.after(() => observer.end());
  await verifyFixtureDirectory(directory, target);

  const migrate = async (direction: 'up' | 'down') => {
    await verifyFixtureDirectory(directory, target);
    await verifyIntegrationConnection(client, target);
    return runMigrationCore({ direction }, { ...target, client, directory });
  };
  const tableExists = async (name: string) => (await client.query<{ present: boolean }>(
    'SELECT pg_catalog.to_regclass($1) IS NOT NULL AS present', [`nutrasa.${name}`],
  )).rows[0]?.present;
  const expectState = async (names: string[], baselines: number) => {
    const state = await inspectIntegrityState(client);
    assert.deepEqual(state.history, names);
    assert.equal(state.ledger.length, baselines);
    const files = await readSqlSnapshots(directory);
    for (const entry of state.ledger) assert.equal(files.find((file) => file.name === entry.name)?.sha256, entry.sha256);
  };
  const scenario = async (name: string, execute: () => Promise<void>) => {
    let passed = false;
    await t.test(name, async () => { await execute(); passed = true; });
    assert.equal(passed, true, `STOP: failed checkpoint ${name}; do not continue mutating this target.`);
  };
  const bootstrap = () => bootstrapIntegrationTarget(client, target);
  return { target, directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap };
}
