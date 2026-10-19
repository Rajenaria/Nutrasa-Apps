import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { governanceSignature } from '../../src/governance-contract.ts';
import { readIntegrationEnvironment } from './guard.ts';
import { readReaderEnvironment, readerColumns } from './reader-guard.ts';
import { adminIdentitySql, assertSetupAdmin, assertSetupHba } from './reader-setup.ts';
import type { SetupHbaRule } from './reader-setup.ts';

const retained = new Set([
  '19aef3f06cbc428b8928f15d96bee4af', 'b31050e74d094192b8d63e5cbc915d34',
  '78bb7ba14c944afe860e0424cbfbd9c9', '7058d1b4a4144bd5b63d383ccc4b2478',
  '1451d777bc364abf928bf93c278e3f96', '088c02bb1b884ba794ce8cab56d14603',
  '49e23e0805ba43fda3f5078a57d28a10', '283df900c3dc4107b5e0c9aeaacbf2c4',
  'fe30b453570e472daf0e35ff4d251748', '00ce468c0642416bb39d7374f11ba412',
  'b6ffd021fd5e4f00b14f135b764a6cdc',
]);

export function readGovernanceEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  const migrator = readIntegrationEnvironment(environment);
  const reader = readReaderEnvironment(environment);
  let writer: URL; let admin: URL;
  try { writer = new URL(environment.NUTRASA_IT_WRITER_URL ?? ''); admin = new URL(environment.NUTRASA_IT_ADMIN_URL ?? ''); }
  catch { throw Error('Explicit disposable writer and administrator required.'); }
  if (retained.has(migrator.id) || reader.database !== migrator.database ||
      environment.NUTRASA_IT_GOVERNANCE_CONFIRM !== migrator.database) throw Error('New governance target approval required.');
  for (const [url, user] of [[writer, `${migrator.database}_writer`], [admin, 'nutrasa_it_admin']] as const) {
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '5433' ||
        url.pathname !== '/' + migrator.database || url.username !== user || !url.password || url.search || url.hash) {
      throw Error('Governance connections must explicitly match the new local target.');
    }
  }
  if (new URL(migrator.connectionString).hostname !== '127.0.0.1' || new URL(reader.connectionString).hostname !== '127.0.0.1') {
    throw Error('IPv4 testing loopback required.');
  }
  return { migrator, reader, writerUrl: writer.toString(), adminUrl: admin.toString(),
    writerRole: writer.username, executorRole: `${migrator.database}_executor` };
}
export type GovernanceEnvironment = ReturnType<typeof readGovernanceEnvironment>;

export async function verifyGovernanceAdmin(admin: Client, config: GovernanceEnvironment) {
  const identity = await admin.query<Record<string, unknown>>(adminIdentitySql);
  assert.equal(identity.rows.length, 1); assertSetupAdmin(identity.rows[0], config.migrator.database);
  const roles = await admin.query<{ rolname: string; valid: boolean }>(`SELECT r.rolname,
    NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls)
    AND r.rolcanlogin = (r.rolname <> $3)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid<>r.oid
      AND (pg_catalog.pg_has_role(r.oid,x.oid,'USAGE') OR pg_catalog.pg_has_role(r.oid,x.oid,'SET')))
    AND NOT pg_catalog.has_database_privilege(r.oid, current_database(), 'CREATE')
    AND NOT pg_catalog.has_database_privilege(r.oid, current_database(), 'TEMPORARY') AS valid
    FROM pg_catalog.pg_roles r WHERE r.rolname=ANY($1::text[]) AND r.rolname<>$2`,
  [[config.writerRole, config.reader.role, config.executorRole], config.migrator.role, config.executorRole]);
  assert.equal(roles.rows.length, 3); assert.ok(roles.rows.every(row => row.valid));
  const hba = await admin.query<{ errors: string }>('SELECT count(*)::text AS errors FROM pg_catalog.pg_hba_file_rules WHERE error IS NOT NULL');
  assert.equal(hba.rows[0]?.errors, '0');
  const rules = (await admin.query<SetupHbaRule>('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error FROM pg_catalog.pg_hba_file_rules ORDER BY rule_number')).rows;
  assertSetupHba(rules, { migrator: config.migrator, reader: config.reader });
  assertSetupHba(rules, { migrator: config.migrator,
    reader: { ...config.reader, role: config.writerRole } });
}

export function governanceInstallStatements(config: GovernanceEnvironment): readonly string[] {
  // Revalidate the role strings before any identifier interpolation; no generic SQL/role override.
  if (!/^nutrasa_it_[a-f0-9]{32}$/.test(config.migrator.database) ||
      config.migrator.database !== `nutrasa_it_${config.migrator.id}` || retained.has(config.migrator.id) ||
      config.writerRole !== `${config.migrator.database}_writer` ||
      config.executorRole !== `${config.migrator.database}_executor` || config.reader.role !== `${config.migrator.database}_runtime`) {
    throw Error('Unsafe governance installation target.');
  }
  const { writerRole, executorRole } = config;
  return [
    `ALTER FUNCTION nutrasa.${governanceSignature} OWNER TO ${executorRole}`,
    `REVOKE ALL ON FUNCTION nutrasa.${governanceSignature} FROM PUBLIC`,
    `GRANT USAGE ON SCHEMA nutrasa TO ${executorRole}, ${writerRole}, ${config.reader.role}`,
    ...Object.entries(readerColumns).flatMap(([table, columns]) => [
      `GRANT SELECT (${columns.join(', ')}) ON nutrasa.${table} TO ${executorRole}`,
      `GRANT SELECT (${columns.join(', ')}) ON nutrasa.${table} TO ${config.reader.role}`,
    ]),
    `GRANT INSERT (subject_id, capability, scope, action, actor_subject_id, reason, request_id) ON nutrasa.catalog_capability_events TO ${executorRole}`,
    `GRANT INSERT (subject_id, capability, scope, last_event_id), UPDATE (last_event_id) ON nutrasa.catalog_capability_assignments TO ${executorRole}`,
    `GRANT EXECUTE ON FUNCTION nutrasa.${governanceSignature} TO ${writerRole}`,
  ];
}
