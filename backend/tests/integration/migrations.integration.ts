import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { inspectIntegrityState } from '../../src/migrations/core.ts';
import { withMigrationLock } from '../../src/migrations/lock.ts';
import { verifyIntegrationConnection } from './guard.ts';
import type { IntegrationTarget } from './guard.ts';
import { assertLockReleased, createMigrationHarness } from './harness.ts';

const barrierLock = 714390;

function startWorker(directory: string, target: IntegrationTarget, label: 'first' | 'second') {
  const child = fork(new URL('./worker.ts', import.meta.url), [directory, label], {
    execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: {
      SystemRoot: process.env.SystemRoot,
      NUTRASA_IT_DATABASE_URL: target.connectionString,
      NUTRASA_IT_CONFIRM_DATABASE: target.database,
    },
  });
  const completion = new Promise<{ result: string; code: number | null }>((resolve, reject) => {
    let result = 'missing';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Integration worker timeout.')); }, 15000);
    child.on('message', (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'result' in message &&
          typeof message.result === 'string') result = message.result;
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('Integration worker failed to start.')); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ result, code }); });
  });
  // Prevent an early process failure becoming an unhandled rejection while observing its lock.
  void completion.catch(() => {});
  return { completion, stop: () => child.kill() };
}

test('isolated PostgreSQL migration lifecycle with explicit checkpoints', { timeout: 90000 }, async (t) => {
  const { target, directory, client, observer, migrate, tableExists, expectState, scenario, bootstrap } =
    await createMigrationHarness(t);
  const fixture = (group: string, name: string) =>
    readFile(new URL(`./fixtures/${group}/${name}`, import.meta.url));
  const firstPath = join(directory, '0001_probe.sql');
  const firstBytes = await fixture('success', '0001_probe.sql');
  await writeFile(firstPath, firstBytes);

  await scenario('bootstrap empty temporary database using the production ledger definition', async () => {
    await bootstrap();
    await expectState([], 0);
    await assertLockReleased(observer);
  });
  await scenario('UP commits DDL, data, history, checksum and releases lock', async () => {
    await migrate('up');
    assert.equal(await tableExists('integration_probe'), true);
    assert.deepEqual((await client.query<{ id: number; value: string }>(
      'SELECT id, value FROM nutrasa.integration_probe',
    )).rows, [{ id: 1, value: 'original' }]);
    await expectState(['0001_probe'], 1);
    await assertLockReleased(observer);
  });
  await scenario('a failed batch rolls back DDL, data, history and checksum', async () => {
    const failurePath = join(directory, '0002_failure.sql');
    await writeFile(failurePath, await fixture('failure', '0002_failure.sql'));
    try {
      await assert.rejects(migrate('up'), (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === '22012');
      assert.equal(await tableExists('integration_failed'), false);
      assert.equal((await client.query('SELECT id FROM nutrasa.integration_probe WHERE id = 2')).rowCount, 0);
      await expectState(['0001_probe'], 1);
      await assertLockReleased(observer);
    } finally {
      await rm(failurePath);
    }
  });
  await scenario('DOWN removes domain objects and history but preserves immutable baseline', async () => {
    await migrate('down');
    assert.equal(await tableExists('integration_probe'), false);
    await expectState([], 1);
    await assertLockReleased(observer);
  });
  await scenario('identical UP succeeds after rollback', async () => {
    await migrate('up');
    await expectState(['0001_probe'], 1);
    assert.equal(await tableExists('integration_probe'), true);
    await assertLockReleased(observer);
  });
  const pendingPath = join(directory, '0002_pending.sql');
  await writeFile(pendingPath, await fixture('pending', '0002_pending.sql'));
  await scenario('historical byte changes reject before pending DDL', async () => {
    await writeFile(firstPath, Buffer.concat([firstBytes, Buffer.from('\n')]));
    try {
      await assert.rejects(migrate('up'), /Historical migration/);
      assert.equal(await tableExists('integration_pending'), false);
      await assertLockReleased(observer);
    } finally { await writeFile(firstPath, firstBytes); }
    await expectState(['0001_probe'], 1);
  });
  await scenario('missing historical file rejects before pending DDL', async () => {
    await rm(firstPath);
    try {
      await assert.rejects(migrate('up'), /Historical migration/);
      assert.equal(await tableExists('integration_pending'), false);
      await assertLockReleased(observer);
    } finally { await writeFile(firstPath, firstBytes); }
    await expectState(['0001_probe'], 1);
  });
  await scenario('history without checksum rejects; restored metadata permits recovery', async () => {
    const state = await inspectIntegrityState(client);
    const entry = state.ledger[0];
    assert.ok(entry);
    await verifyIntegrationConnection(client, target);
    await withMigrationLock(client, () => client.query(
      'DELETE FROM nutrasa_migrations.migration_checksums WHERE name = $1', [entry.name],
    ));
    try {
      await assert.rejects(migrate('up'), /ledger disagree/);
      assert.equal(await tableExists('integration_pending'), false);
      await assertLockReleased(observer);
    } finally {
      await verifyIntegrationConnection(client, target);
      await withMigrationLock(client, () => client.query(
        'INSERT INTO nutrasa_migrations.migration_checksums (name, sha256) VALUES ($1, $2)', [entry.name, entry.sha256],
      ));
    }
    await expectState(['0001_probe'], 1);
  });
  await rm(pendingPath);
  const concurrentPath = join(directory, '0002_concurrent.sql');
  await writeFile(concurrentPath, await fixture('concurrent', '0002_concurrent.sql'));
  await scenario('two processes cannot apply the same migration concurrently', async () => {
    await verifyIntegrationConnection(observer, target);
    await observer.query('SELECT pg_catalog.pg_advisory_lock($1::bigint)', [barrierLock]);
    const first = startWorker(directory, target, 'first');
    let second: ReturnType<typeof startWorker> | undefined;
    try {
      const deadline = Date.now() + 8000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const locks = await observer.query<{ waiting: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
           WHERE a.datname = current_database() AND a.application_name = 'nutrasa_it_worker_first'
             AND l.locktype = 'advisory' AND l.classid = 0 AND l.objid = $1 AND NOT l.granted) AS waiting`,
          [barrierLock],
        );
        waiting = locks.rows[0]?.waiting === true;
        if (!waiting) await delay(50);
      }
      assert.equal(waiting, true, 'First process must hold migration lock and wait at the SQL barrier.');
      second = startWorker(directory, target, 'second');
      assert.deepEqual(await second.completion, { result: 'locked', code: 1 });
      await observer.query('SELECT pg_catalog.pg_advisory_unlock($1::bigint)', [barrierLock]);
      assert.deepEqual(await first.completion, { result: 'ok', code: 0 });
      await expectState(['0001_probe', '0002_concurrent'], 2);
      assert.equal(await tableExists('integration_concurrent'), true);
      await assertLockReleased(observer);
    } finally {
      first.stop();
      second?.stop();
      await observer.query('SELECT pg_catalog.pg_advisory_unlock($1::bigint)', [barrierLock]);
      await Promise.allSettled([first.completion, ...(second ? [second.completion] : [])]);
    }
  });
  await scenario('recovery re-run does not duplicate applied history or checksum', async () => {
    assert.deepEqual(await migrate('up'), []);
    await expectState(['0001_probe', '0002_concurrent'], 2);
    await assertLockReleased(observer);
  });
});
