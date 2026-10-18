import { Pool } from 'pg';
import type { CapabilityDatabase } from '../../src/capabilities.ts';
import type { IntegrationTarget } from './guard.ts';
import { readReaderEnvironment, verifyReaderConnection } from './reader-guard.ts';

// Test-owned pool only. Every checkout is verified while held, before the real lookup.
export async function createReaderTestPool(target: IntegrationTarget) {
  const validated = readReaderEnvironment({ ...process.env,
    NUTRASA_IT_READER_URL: target.connectionString, NUTRASA_IT_CONFIRM_DATABASE: target.database });
  if (validated.id !== target.id || validated.role !== target.role) throw new Error('Reader pool target mismatch.');
  const pool = new Pool({ connectionString: validated.connectionString, ssl: false, max: 1,
    idleTimeoutMillis: 0, connectionTimeoutMillis: 5000, statement_timeout: 10000,
    application_name: 'nutrasa_it_reader_pool' });
  pool.on('error', () => { /* Never log credentials or raw PostgreSQL errors. */ });
  const database: CapabilityDatabase = {
    async query(sql, values) {
      const client = await pool.connect();
      let discard = false;
      try {
        await verifyReaderConnection(client, validated);
        return await client.query<Record<string, unknown>>(sql, values);
      } catch (error: unknown) { discard = true; throw error; }
      finally { client.release(discard); }
    },
  };
  try {
    await database.query('SELECT pg_catalog.pg_backend_pid() AS pid', []);
    return { pool, database };
  } catch {
    await pool.end();
    throw new Error('STOP: isolated reader pool rejected or unavailable.');
  }
}
