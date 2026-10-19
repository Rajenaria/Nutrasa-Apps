import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { catalogScope } from './capability-registry.ts';
import { delegatedCapabilities, governanceFunction } from './governance-contract.ts';
import { verifiedRequestUid } from './identity.ts';

export interface CapabilityTransition {
  readonly subjectId: string;
  readonly capability: string;
  readonly scope: string;
  readonly action: 'GRANT' | 'REVOKE';
  readonly expectedEventId: string | null;
  readonly reason: string;
}
export interface GovernanceClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface GovernancePool { connect(): Promise<GovernanceClient> }

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fields = ['subjectId', 'capability', 'scope', 'action', 'expectedEventId', 'reason'];

// DI only: no pool, credentials, environment, route or operational authority is installed here.
export function createCapabilityWriter(pool: GovernancePool) {
  return async (request: FastifyRequest, command: CapabilityTransition): Promise<string> => {
    const uid = verifiedRequestUid(request);
    if (!command || Object.keys(command).length !== fields.length ||
        Object.keys(command).some(field => !fields.includes(field)) ||
        typeof command.subjectId !== 'string' || !uuid.test(command.subjectId) ||
        !delegatedCapabilities.includes(command.capability) || command.scope !== catalogScope ||
        !['GRANT', 'REVOKE'].includes(command.action) ||
        !(command.expectedEventId === null || (typeof command.expectedEventId === 'string' && uuid.test(command.expectedEventId))) ||
        typeof command.reason !== 'string' || !command.reason.trim()) {
      throw new Error('Invalid capability transition.');
    }
    let client: GovernanceClient;
    try { client = await pool.connect(); }
    catch { throw new Error('Capability transition unavailable.'); }
    let transaction = false;
    let discard = false;
    try {
      const identity = await client.query(`SELECT current_user = session_user
        AND session_user::text = current_database() || '_writer'
        AND current_setting('transaction_isolation') = 'read committed'
        AND current_setting('transaction_read_only') = 'off' AS valid`);
      if (identity.rows.length !== 1 || identity.rows[0]?.valid !== true) {
        discard = true;
        throw new Error('Writer session rejected.');
      }
      // The owned pool must supply idle clients; no client is shared with another transaction owner.
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); transaction = true;
      await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'; SET LOCAL idle_in_transaction_session_timeout = '10s'");
      if (verifiedRequestUid(request) !== uid) throw new Error('Verified request changed.');
      const result = await client.query(`SELECT nutrasa.${governanceFunction}($1,$2,$3,$4,$5,$6,$7,$8) AS event_id`,
        [uid, command.subjectId, command.capability, command.scope, command.action,
          command.expectedEventId, command.reason, randomUUID()]);
      const eventId = result.rows[0]?.event_id;
      if (result.rows.length !== 1 || typeof eventId !== 'string' || !uuid.test(eventId)) throw new Error('Invalid transition result.');
      await client.query('COMMIT'); transaction = false;
      return eventId;
    } catch {
      // A failed COMMIT may have an unknown outcome: never retry automatically.
      discard = true;
      if (transaction) {
        try { await client.query('ROLLBACK'); } catch { /* Discard even when rollback cannot be confirmed. */ }
      }
      throw new Error('Capability transition unavailable.');
    } finally { client.release(discard); }
  };
}
