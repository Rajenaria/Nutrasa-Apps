import type { Client } from 'pg';
import { runner } from 'node-pg-migrate/runner';

import { assertSafeConfig, ignoredMigrationFiles, migrationConfig, parseCommand } from './config.ts';
import { executeAfterIntegrityCheck, readSqlSnapshots } from './checksum.ts';
import type { IntegrityState } from './checksum.ts';
import { createVerifiedLoader } from './loader.ts';
import { withMigrationLock } from './lock.ts';

export function assertHistoryLocation(relations: readonly { schema: string }[]) {
  if (relations.some((relation) => relation.schema !== migrationConfig.migrationsSchema)) {
    throw new Error('Migration history found outside nutrasa_migrations; explicit review required.');
  }
}

export async function inspectIntegrityState(client: Client): Promise<IntegrityState> {
  // pg_catalog includes relations invisible to information_schema privilege filtering, even empty ones.
  const locations = await client.query<{ schema: string }>(`
    SELECT n.nspname AS schema FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'pgmigrations'`);
  assertHistoryLocation(locations.rows);
  const metadata = await client.query<{
    relname: string; relkind: string; has_pk: boolean; owned: boolean; valid_ledger: boolean;
  }>(`
    SELECT c.relname, c.relkind,
           c.relowner = current_user::regrole AS owned,
           EXISTS (SELECT 1 FROM pg_catalog.pg_constraint p
                   WHERE p.conrelid = c.oid AND p.contype = 'p') AS has_pk,
           c.relname <> 'migration_checksums' OR (
             (SELECT count(*) FROM pg_catalog.pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname IN ('name', 'sha256')
                AND a.attnotnull AND a.atttypid = 'text'::regtype AND NOT a.attisdropped) = 2
             AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint p
                         JOIN pg_catalog.pg_attribute a
                           ON a.attrelid = c.oid AND a.attnum = p.conkey[1]
                         WHERE p.conrelid = c.oid AND p.contype = 'p'
                           AND cardinality(p.conkey) = 1 AND a.attname = 'name')
           ) AS valid_ledger
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'nutrasa_migrations'
      AND c.relname IN ('pgmigrations', 'migration_checksums')`);
  if (metadata.rows.some((row) => row.relkind !== 'r' || !row.has_pk || !row.owned || !row.valid_ledger)) {
    throw new Error('Invalid migration metadata tables.');
  }
  const historyExists = metadata.rows.some((row) => row.relname === 'pgmigrations');
  const ledgerExists = metadata.rows.some((row) => row.relname === 'migration_checksums');
  const history = historyExists ? (await client.query<{ name: unknown }>(
    'SELECT name FROM nutrasa_migrations.pgmigrations ORDER BY run_on, id',
  )).rows.map((row) => {
    if (typeof row.name !== 'string') throw new Error('Invalid migration history.');
    return row.name;
  }) : [];
  const ledger = ledgerExists ? (await client.query<{ name: unknown; sha256: unknown }>(
    'SELECT name, sha256 FROM nutrasa_migrations.migration_checksums',
  )).rows.map((row) => {
    if (typeof row.name !== 'string' || typeof row.sha256 !== 'string') throw new Error('Invalid ledger.');
    return { name: row.name, sha256: row.sha256 };
  }) : [];
  return { ledgerExists, historyExists, history, ledger };
}

export interface MigrationTarget {
  readonly database: string;
  readonly role: string;
}

export function assertConnectionIdentity(
  identity: { database: string; role: string; login_role: string } | undefined,
  target: MigrationTarget,
) {
  if (!identity || identity.database !== target.database ||
      identity.role !== target.role || identity.login_role !== target.role) {
    throw new Error('Migration connection identity mismatch.');
  }
}

export function assertSchemaOwnership(schemas: readonly { name: string; owned: boolean }[]) {
  if (schemas.length !== 2 || schemas.some((schema) => !schema.owned) ||
      !['nutrasa', 'nutrasa_migrations'].every((name) => schemas.some((schema) => schema.name === name))) {
    throw new Error('Migration schemas must be owned by the connected migrator.');
  }
}

export async function verifyMigrationConnection(client: Client, target: MigrationTarget) {
  const identity = await client.query<{ database: string; role: string; login_role: string }>(
    'SELECT current_database() AS database, current_user AS role, session_user AS login_role',
  );
  if (identity.rows.length !== 1) throw new Error('Invalid migration connection identity.');
  assertConnectionIdentity(identity.rows[0], target);
  const schemas = await client.query<{ name: string; owned: boolean }>(
    `SELECT nspname AS name, nspowner = current_user::regrole AS owned
     FROM pg_catalog.pg_namespace WHERE nspname IN ('nutrasa', 'nutrasa_migrations')`,
  );
  assertSchemaOwnership(schemas.rows);
}

// Callers enforce their own target allowlist; the core never accepts engine option overrides.
export async function runMigrationCore(
  command: { direction: 'up' | 'down'; count?: number },
  options: MigrationTarget & { client: Client; directory: string },
) {
  const commandArgs = command.count === undefined ? [command.direction] :
    [command.direction, String(command.count)];
  const validatedCommand = parseCommand(commandArgs);
  assertSafeConfig(migrationConfig);
  const snapshots = await readSqlSnapshots(options.directory);
  if (snapshots.length === 0) throw new Error('No domain migrations available.');
  await verifyMigrationConnection(options.client, options);
  const inspect = () => inspectIntegrityState(options.client);
  return withMigrationLock(options.client, async () =>
    executeAfterIntegrityCheck(snapshots, await inspect(), () => runner({
      ...migrationConfig,
      direction: validatedCommand.direction,
      count: 'count' in validatedCommand ? validatedCommand.count : undefined,
      dir: options.directory,
      ignorePattern: ignoredMigrationFiles,
      dbClient: options.client,
      migrationLoaderStrategies: [{ extensions: ['.sql'], loader: createVerifiedLoader(snapshots, inspect) }],
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    })));
}
