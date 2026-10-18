import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Client } from 'pg';
import { inspectIntegrityState } from '../../src/migrations/core.ts';
import { withMigrationLock } from '../../src/migrations/lock.ts';
import { ledgerDefinitionFromBootstrap, verifyIntegrationConnection } from './guard.ts';
import type { IntegrationTarget } from './guard.ts';

// Shared by existing integration harnesses and the disposable installer, never the production CLI.
export async function bootstrapIntegrationTarget(client: Client, target: IntegrationTarget) {
  await verifyIntegrationConnection(client, target);
  await withMigrationLock(client, async () => {
    const state = await inspectIntegrityState(client);
    assert.equal(state.historyExists, false);
    assert.equal(state.ledgerExists, false);
    const objects = await client.query<{ count: string }>(
      `SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('nutrasa','nutrasa_migrations')`);
    assert.equal(objects.rows[0]?.count, '0', 'A new empty integration target is required.');
    const source = await readFile(new URL('../../sql/bootstrap-migration-ledger.sql', import.meta.url), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(ledgerDefinitionFromBootstrap(source));
      await client.query('REVOKE ALL ON TABLE nutrasa_migrations.migration_checksums FROM PUBLIC');
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
