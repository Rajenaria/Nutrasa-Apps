import type { CapabilityAuthority } from './identity.ts';
import { isKnownCapability } from './capability-registry.ts';
import type { CapabilityPermission } from './capability-registry.ts';

// Accept a trusted pg Pool/Client query boundary; never construct connections or read credentials here.
export interface CapabilityDatabase {
  query(sql: string, values: string[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
}

// One statement observes account, pointer and event in the same PostgreSQL snapshot.
// This is a read precheck, not authorization held through a future writer transaction.
const effectiveCapabilitySql = `SELECT EXISTS (
  SELECT 1 FROM nutrasa.app_users u
  JOIN nutrasa.catalog_capability_assignments a ON a.subject_id = u.id
  JOIN nutrasa.catalog_capability_events e
    ON (e.subject_id, e.capability, e.scope, e.id)
     = (a.subject_id, a.capability, a.scope, a.last_event_id)
  WHERE u.firebase_uid = $1 COLLATE "C" AND u.account_status = 'ACTIVE'
    AND a.capability = $2 COLLATE "C" AND a.scope = $3 COLLATE "C"
    AND e.action = 'GRANT'
    AND NOT EXISTS (
      SELECT 1 FROM nutrasa.catalog_capability_events newer
      WHERE newer.subject_id = a.subject_id AND newer.capability = a.capability
        AND newer.scope = a.scope AND newer.event_number > e.event_number
    )
) AS allowed`;

export function createCapabilityAuthority(
  database: CapabilityDatabase,
  approvedPermissions: readonly CapabilityPermission[] = [],
): CapabilityAuthority {
  // Snapshot trusted configuration: later mutation must not expand operational permissions.
  const known = new Set(approvedPermissions.map(({ capability, scope }) => {
    if (!isKnownCapability(capability, scope)) {
      throw new Error('Capability policy entries must belong to the approved registry.');
    }
    return JSON.stringify([capability, scope]);
  }));

  return {
    async allows(firebaseUid, capability, scope) {
      if (firebaseUid.trim().length === 0 || !isKnownCapability(capability, scope) ||
          !known.has(JSON.stringify([capability, scope]))) return false;
      let rows: readonly Record<string, unknown>[];
      try {
        ({ rows } = await database.query(effectiveCapabilitySql, [firebaseUid, capability, scope]));
      } catch {
        throw new Error('Capability authority unavailable.');
      }
      const row = rows[0];
      if (rows.length !== 1 || typeof row?.allowed !== 'boolean') {
        throw new Error('Invalid capability authority result.');
      }
      return row.allowed;
    },
  };
}
