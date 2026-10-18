import { readerColumns, readReaderEnvironment } from './reader-guard.ts';
import { readIntegrationEnvironment } from './guard.ts';
import type { IntegrationTarget } from './guard.ts';
import type { IntegrityState, SqlSnapshot } from '../../src/migrations/checksum.ts';

export const readerSetupDatabase = 'nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc';
export const testingSystemIdentifier = '7697229180258678980';
export const testingDataDirectory = 'D:/Rajendra/NUTRASA-Postgres-IT/data';

export interface ReaderSetupConfig {
  readonly adminUrl: string;
  readonly migrator: IntegrationTarget;
  readonly reader: IntegrationTarget;
}

export function readReaderSetupEnvironment(environment: Readonly<Record<string, string | undefined>>): ReaderSetupConfig {
  const reader = readReaderEnvironment(environment);
  const migrator = readIntegrationEnvironment(environment);
  let admin: URL;
  try { admin = new URL(environment.NUTRASA_IT_ADMIN_URL ?? ''); }
  catch { throw new Error('Explicit test administrator connection required.'); }
  if (reader.database !== readerSetupDatabase || migrator.database !== readerSetupDatabase ||
      new URL(reader.connectionString).hostname !== '127.0.0.1' ||
      new URL(migrator.connectionString).hostname !== '127.0.0.1' ||
      !['postgres:', 'postgresql:'].includes(admin.protocol) || admin.hostname !== '127.0.0.1' ||
      admin.port !== '5433' || admin.pathname !== '/postgres' || admin.username !== 'nutrasa_it_admin' ||
      !admin.password || admin.search || admin.hash) {
    throw new Error('Setup accepts only the approved new disposable target on the dedicated test cluster.');
  }
  return { adminUrl: admin.toString(), migrator, reader };
}

export function assertSetupAdmin(row: Record<string, unknown> | undefined, database: string) {
  if (!row || row.database !== database || row.role !== 'nutrasa_it_admin' || row.session_role !== row.role ||
      row.superuser !== true || row.address !== '127.0.0.1' || row.port !== 5433 || row.version !== 180006 ||
      row.cluster !== 'nutrasa_it_pg18' || row.system_identifier !== testingSystemIdentifier ||
      typeof row.directory !== 'string' || row.directory.replaceAll('\\', '/') !== testingDataDirectory ||
      row.runtime_writable !== true || row.read_committed !== true || row.hba_loaded !== true) {
    throw new Error('STOP: test administrator or cluster identity rejected.');
  }
}

export function assertProvisionSuccess(exitCode: number | null, output: string, database: string, role: string) {
  const marker = `NUTRASA_IT_PROVISION_COMPLETE ${database} ${role}`;
  const markers = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('NUTRASA_IT_PROVISION_COMPLETE'));
  if (exitCode !== 0 || markers.length !== 1 || markers[0] !== marker || /\bSTOP:/.test(output)) {
    throw new Error('STOP: provisioning success not established; preserve partial state.');
  }
}

export interface SetupHbaRule {
  readonly rule_number: number | null;
  readonly type: string | null;
  readonly database: string[] | null;
  readonly user_name: string[] | null;
  readonly address: string | null;
  readonly netmask: string | null;
  readonly auth_method: string | null;
  readonly error: string | null;
}

export function assertSetupHba(rules: readonly SetupHbaRule[], config: ReaderSetupConfig) {
  if (!rules.length || rules.some(rule => rule.error !== null)) throw new Error('STOP: HBA parsing failed.');
  for (const role of [config.migrator.role, config.reader.role]) {
    const matches = rules.filter(rule => rule.type === 'host' &&
      JSON.stringify(rule.database) === JSON.stringify([config.migrator.database]) &&
      JSON.stringify(rule.user_name) === JSON.stringify([role]) && rule.address === '127.0.0.1' &&
      rule.netmask === '255.255.255.255' && rule.auth_method === 'scram-sha-256');
    const selected = matches[0];
    const position = selected?.rule_number;
    if (matches.length !== 1 || typeof position !== 'number' || rules.some(rule =>
      rule.rule_number !== null && rule.rule_number < position && rule.type?.startsWith('host') &&
      (rule.database?.some(value => ['all', 'sameuser', 'samerole', 'samegroup', config.migrator.database].includes(value) || value.startsWith('/') || value.startsWith('@')) ?? true) &&
      (rule.user_name?.some(value => value === 'all' || value === role || /^[+/@]/.test(value)) ?? true))) {
      throw new Error('STOP: missing, duplicate or shadowed exact SCRAM HBA rule.');
    }
  }
}

export function assertInstalledState(state: IntegrityState, snapshots: readonly SqlSnapshot[]) {
  if (snapshots.length !== 8 || !state.historyExists || !state.ledgerExists ||
      JSON.stringify(state.history) !== JSON.stringify(snapshots.map(file => file.name)) ||
      state.ledger.length !== snapshots.length || new Set(state.ledger.map(row => row.name)).size !== snapshots.length ||
      state.ledger.some(row => snapshots.find(file => file.name === row.name)?.sha256 !== row.sha256)) {
    throw new Error('STOP: installed migration history or checksum mismatch.');
  }
}

export function readerPrivilegeStatements(role: string): readonly string[] {
  if (role !== `${readerSetupDatabase}_runtime`) throw new Error('Unapproved reader role.');
  // All identifiers are fixed by the approved target/manifest, never client or CLI fragments.
  return [
    `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    `GRANT CONNECT ON DATABASE ${readerSetupDatabase} TO ${role}`,
    `GRANT USAGE ON SCHEMA nutrasa TO ${role}`,
    ...Object.entries(readerColumns).map(([table, columns]) =>
      `GRANT SELECT (${columns.join(', ')}) ON TABLE nutrasa.${table} TO ${role}`),
    `ALTER ROLE ${role} IN DATABASE ${readerSetupDatabase} SET search_path TO pg_catalog, nutrasa`,
  ];
}

// Explicit stages allow fail-closed orchestration tests without opening PostgreSQL.
export interface ReaderSetupStages {
  preflight(): Promise<void>;
  provision(): Promise<void>;
  verifyProvision(): Promise<void>;
  install(): Promise<void>;
  verifyInstall(): Promise<void>;
  prepareReader(): Promise<void>;
  enableReader(): Promise<void>;
  verifyReader(): Promise<void>;
  verifyPreservation(): Promise<void>;
}

export async function runReaderSetup(stages: ReaderSetupStages) {
  for (const name of ['preflight', 'provision', 'verifyProvision', 'install', 'verifyInstall',
    'prepareReader', 'enableReader', 'verifyReader', 'verifyPreservation'] as const) {
    try { await stages[name](); }
    catch { throw new Error(`STOP: ${name} failed; preserve partial state, no retry or cleanup.`); }
  }
}
