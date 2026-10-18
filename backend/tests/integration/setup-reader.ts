import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { readSqlSnapshots } from '../../src/migrations/checksum.ts';
import { inspectIntegrityState, runMigrationCore } from '../../src/migrations/core.ts';
import { withMigrationLock } from '../../src/migrations/lock.ts';
import { connectIntegrationTarget, verifyIntegrationConnection } from './guard.ts';
import { bootstrapIntegrationTarget } from './installation.ts';
import { connectReader, verifyReaderConnection } from './reader-guard.ts';
import { assertInstalledState, assertProvisionSuccess, assertSetupAdmin, assertSetupHba, readReaderSetupEnvironment,
  readerPrivilegeStatements, runReaderSetup } from './reader-setup.ts';
import type { ReaderSetupConfig, SetupHbaRule } from './reader-setup.ts';

const adminIdentitySql = `SELECT current_database() AS database, current_user AS role,
  session_user AS session_role, r.rolsuper AS superuser, host(inet_server_addr()) AS address,
  inet_server_port() AS port, current_setting('server_version_num')::integer AS version,
  current_setting('cluster_name') AS cluster, current_setting('data_directory') AS directory,
  (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier,
  current_setting('default_transaction_read_only')='off' AS runtime_writable,
  pg_catalog.pg_conf_load_time() >= (pg_catalog.pg_stat_file(current_setting('hba_file'))).modification AS hba_loaded,
  current_setting('transaction_isolation')='read committed' AS read_committed
  FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`;

async function verifyAdmin(client: Client, database: string) {
  const result = await client.query<Record<string, unknown>>(adminIdentitySql);
  assert.equal(result.rows.length, 1);
  assertSetupAdmin(result.rows[0], database);
}

async function adminConnection(config: ReaderSetupConfig, database: string) {
  const url = new URL(config.adminUrl); url.pathname = '/' + database;
  const client = new Client({ connectionString: url.toString(), ssl: false,
    connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: 'nutrasa_it_reader_installer' });
  client.on('error', () => { /* Never print connection details. */ });
  try { await client.connect(); await verifyAdmin(client, database); return client; }
  catch { await client.end(); throw new Error('STOP: test administrator connection rejected.'); }
}

// Capture only psql's ordinary output, never password input. No shell/string-built command execution.
async function psql(config: ReaderSetupConfig, database: string, script: string) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-v', `run_id=${config.migrator.id}`, '-d',
    `host=127.0.0.1 hostaddr=127.0.0.1 port=5433 dbname=${database} user=nutrasa_it_admin connect_timeout=5 sslmode=disable`,
    '-f', fileURLToPath(new URL(script, import.meta.url))];
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn('C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe', args, {
      shell: false, windowsHide: true, stdio: ['inherit', 'pipe', 'inherit'],
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
        PGPASSWORD: decodeURIComponent(new URL(config.adminUrl).password), PGCLIENTENCODING: 'UTF8' },
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      process.stdout.write(chunk);
      if (output.length > 65536) { child.kill(); reject(new Error('STOP: excessive provisioning output.')); }
    });
    child.once('error', () => reject(new Error('STOP: psql unavailable; no automatic retry.')));
    child.once('close', code => resolve({ code, output }));
  });
}

async function assertNamesAbsent(admin: Client, config: ReaderSetupConfig) {
  const result = await admin.query<{ available: boolean }>(`SELECT
    NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=$1)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY($2::text[])) AS available`,
  [config.migrator.database, [config.migrator.role, config.reader.role]]);
  assert.equal(result.rows[0]?.available, true, 'STOP: database or role collision; do not reuse.');
}

async function preservedCatalog(admin: Client, config: ReaderSetupConfig) {
  const databases = await admin.query<Record<string, unknown>>(`SELECT datname::text,datdba::text,datacl::text,datallowconn,
    pg_catalog.shobj_description(oid,'pg_database') AS marker FROM pg_catalog.pg_database WHERE datname<>$1 ORDER BY datname`,
  [config.migrator.database]);
  const roles = await admin.query<Record<string, unknown>>(`SELECT rolname::text,rolsuper,rolinherit,rolcreaterole,rolcreatedb,
    rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_catalog.pg_roles
    WHERE NOT(rolname=ANY($1::text[])) ORDER BY rolname`, [[config.migrator.role, config.reader.role]]);
  const memberships = await admin.query<Record<string, unknown>>('SELECT roleid::text,member::text,grantor::text,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members ORDER BY roleid,member,grantor');
  return { databases: databases.rows, roles: roles.rows, memberships: memberships.rows };
}

export async function assertEmptyReaderDomains(client: Client) {
  const ownership = await client.query<{ owned: boolean }>(`SELECT
    NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('nutrasa','nutrasa_migrations') AND c.relowner<>current_user::regrole)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('nutrasa','nutrasa_migrations') AND p.proowner<>current_user::regrole) AS owned`);
  assert.equal(ownership.rows[0]?.owned, true, 'STOP: schema object ownership mismatch.');
  const tables = await client.query<{ name: string; owned: boolean }>(`SELECT c.relname::text AS name,
    c.relowner=current_user::regrole AS owned FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='nutrasa' AND c.relkind='r' ORDER BY c.relname`);
  assert.equal(tables.rows.length, 17, 'STOP: unexpected domain structure.');
  for (const table of tables.rows) {
    assert.match(table.name, /^[a-z_]+$/); assert.equal(table.owned, true);
    assert.equal((await client.query<{ count: string }>('SELECT count(*) FROM nutrasa.' + table.name)).rows[0]?.count, '0', 'STOP: nonempty target.');
  }
}

export async function setupReaderIntegration(environment: Readonly<Record<string, string | undefined>>) {
  // Check both the supplied map and the actual process defaults consumed by pg.
  const config = readReaderSetupEnvironment(environment);
  readReaderSetupEnvironment({ ...environment,
    ...Object.fromEntries(['PGOPTIONS','PGREPLICATION','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPORT']
      .map(key => [key, process.env[key] || environment[key]])) });
  const directory = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const snapshots = await readSqlSnapshots(directory);
  assert.equal(snapshots.length, 8);
  const admin = await adminConnection(config, 'postgres');
  let migrator: Client | undefined;
  let databaseAdmin: Client | undefined;
  let reader: Client | undefined;
  let baseline: Awaited<ReturnType<typeof preservedCatalog>> | undefined;
  try {
    await runReaderSetup({
      async preflight() {
        await verifyAdmin(admin, 'postgres');
        await assertNamesAbsent(admin, config);
        assertSetupHba((await admin.query<SetupHbaRule>(`SELECT rule_number,type,database,user_name,address,netmask,auth_method,error
          FROM pg_catalog.pg_hba_file_rules ORDER BY rule_number`)).rows, config);
        baseline = await preservedCatalog(admin, config);
        assert.ok(baseline.databases.filter(row => typeof row.datname === 'string' && /^nutrasa_it_[a-f0-9]{32}$/.test(row.datname)).length >= 9,
          'STOP: retained target baseline requires review.');
        // Show catalog CONNECT/TEMP separately from authentication isolation; never connect to old databases.
        console.log('READ_ONLY_PREFLIGHT_PASS: cluster and all three names verified.');
      },
      async provision() {
        await verifyAdmin(admin, 'postgres'); await assertNamesAbsent(admin, config);
        const result = await psql(config, 'postgres', './provision.sql');
        assertProvisionSuccess(result.code, result.output, config.migrator.database, config.migrator.role);
      },
      async verifyProvision() {
        migrator = await connectIntegrationTarget(config.migrator, 'nutrasa_it_reader_install');
        databaseAdmin = await adminConnection(config, config.migrator.database);
        const state = await inspectIntegrityState(migrator);
        assert.equal(state.ledgerExists, false); assert.equal(state.historyExists, false);
        assert.equal((await migrator.query<{ count: string }>(`SELECT count(*) FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')`)).rows[0]?.count, '0');
      },
      async install() {
        assert.ok(migrator); await verifyAdmin(admin, 'postgres');
        const client = migrator;
        await withMigrationLock(client, async () => {
          await bootstrapIntegrationTarget(client, config.migrator);
          await runMigrationCore({ direction: 'up' }, { ...config.migrator, client, directory });
        });
      },
      async verifyInstall() {
        assert.ok(migrator); await verifyIntegrationConnection(migrator, config.migrator);
        assertInstalledState(await inspectIntegrityState(migrator), snapshots);
        await assertEmptyReaderDomains(migrator);
      },
      async prepareReader() {
        assert.ok(databaseAdmin); assert.ok(migrator);
        await verifyAdmin(databaseAdmin, config.migrator.database);
        await assertEmptyReaderDomains(migrator);
        await databaseAdmin.query('BEGIN');
        try {
          // The full verification rejects any leaked privileges before the suite may perform fixture DML.
          for (const sql of readerPrivilegeStatements(config.reader.role)) await databaseAdmin.query(sql);
          await databaseAdmin.query('COMMIT');
        } catch (error: unknown) { await databaseAdmin.query('ROLLBACK'); throw error; }
      },
      async enableReader() {
        assert.ok(databaseAdmin); await verifyAdmin(databaseAdmin, config.migrator.database);
        const result = await psql(config, config.migrator.database, './enable-reader.sql');
        const marker = `NUTRASA_IT_READER_ENABLED ${config.reader.role}`;
        assert.equal(result.code, 0);
        assert.equal(result.output.split(/\r?\n/).filter(line => line.trim() === marker).length, 1);
        assert.doesNotMatch(result.output, /\bSTOP:/);
      },
      async verifyReader() {
        reader = await connectReader(config.reader);
        await verifyReaderConnection(reader, config.reader);
        assert.ok(migrator); await assertEmptyReaderDomains(migrator);
        assertInstalledState(await inspectIntegrityState(migrator), snapshots);
        const crossDatabase = await admin.query<Record<string, unknown>>(`SELECT d.datname::text,
          pg_catalog.has_database_privilege(r.oid,d.oid,'CONNECT') AS can_connect,
          pg_catalog.has_database_privilege(r.oid,d.oid,'TEMPORARY') AS can_temp
          FROM pg_catalog.pg_database d CROSS JOIN pg_catalog.pg_roles r
          WHERE r.rolname=$1 ORDER BY d.datname`, [config.reader.role]);
        console.log('DATABASE_ACL_VISIBILITY_ONLY', JSON.stringify(crossDatabase.rows));
      },
      async verifyPreservation() {
        assert.deepEqual(await preservedCatalog(admin, config), baseline);
        console.log(`NUTRASA_IT_READER_SETUP_COMPLETE ${config.migrator.database}`);
      },
    });
  } finally {
    // Closing owned connections is the only automatic cleanup. Never DROP/reset/retry database objects.
    await Promise.allSettled([reader?.end(), migrator?.end(), databaseAdmin?.end(), admin.end()]);
  }
}
