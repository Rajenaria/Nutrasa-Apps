import { PG_MIGRATE_LOCK_ID } from 'node-pg-migrate/runner';

interface LockConnection {
  query(sql: string, values: number[]): Promise<{ rows: { acquired?: unknown; released?: unknown }[] }>;
}

// Protect preflight before the engine can initialize history. Its lock is reentrant on this same session.
export async function withMigrationLock<T>(client: LockConnection, execute: () => Promise<T>) {
  const lock = await client.query('SELECT pg_catalog.pg_try_advisory_lock($1::bigint) AS acquired', [PG_MIGRATE_LOCK_ID]);
  if (lock.rows.length !== 1 || lock.rows[0]?.acquired !== true) {
    throw new Error('Migration lock unavailable; no metadata inspection or initialization permitted.');
  }
  try {
    return await execute();
  } finally {
    const unlock = await client.query('SELECT pg_catalog.pg_advisory_unlock($1::bigint) AS released', [PG_MIGRATE_LOCK_ID]);
    if (unlock.rows.length !== 1 || unlock.rows[0]?.released !== true) {
      throw new Error('Failed to release migration preflight lock.');
    }
  }
}
