import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { readCatalogLineageEnvironment } from './catalog-lineage-guard.ts';
import { verifyIntegrationConnection } from './guard.ts';
import { adminIdentitySql, assertSetupAdmin, assertSetupHba } from './reader-setup.ts';
import type { SetupHbaRule } from './reader-setup.ts';

// This approval profile cannot select a retained failed target or a new database.
export const localDatabase = 'nutrasa_it_419e5962579e4d22a83a8ff1ecea417f';
export const localRoles = Object.freeze({ admin: 'nutrasa_it_admin',
  migrator: localDatabase + '_migrator', runtime: localDatabase + '_runtime',
  writer: localDatabase + '_writer', executor: localDatabase + '_executor' });
const psql = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const environmentKeys = ['PGOPTIONS', 'PGREPLICATION', 'PGHOSTADDR', 'PGSERVICE',
  'PGSERVICEFILE', 'PGPASSWORD', 'PGPASSFILE', 'NODE_OPTIONS'];
const actions = ['preflight', 'reset-arguments', 'check-writer', 'preflight-run'] as const;
type Action = typeof actions[number];
export type LocalStage = 'configuration' | 'admin preflight' | 'native writer login' | 'node writer login' | 'run preflight';

export function parseLocalArguments(args: readonly string[]): Action {
  if (args.length !== 4 || args[0] !== '--action' || args[2] !== '--database' || args[3] !== localDatabase) {
    throw Error('Invalid local target arguments.');
  }
  const action = actions.find(value => value === args[1]);
  if (!action) throw Error('Unknown local action.');
  return action;
}

export function assertLocalEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  if (environmentKeys.some(key => environment[key]) || (environment.PGPORT && environment.PGPORT !== '5433')) {
    throw Error('Inherited local connection override.');
  }
}

export function localConnection(environment: Readonly<Record<string, string | undefined>>, kind: 'admin' | 'writer') {
  assertLocalEnvironment(environment);
  let url: URL;
  try { url = new URL(environment[kind === 'admin' ? 'NUTRASA_IT_ADMIN_URL' : 'NUTRASA_IT_WRITER_URL'] ?? ''); }
  catch { throw Error('Explicit local credential required.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.port !== '5433' || url.pathname !== '/' + localDatabase || url.username !== localRoles[kind] ||
      !url.password || url.search || url.hash || /[\0\r\n]/.test(decodeURIComponent(url.password))) {
    throw Error('Local connection binding rejected.');
  }
  return url;
}

// Never print an exception message, stack, URL, stderr or arbitrary error.code.
export function localFailure(stage: LocalStage, error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const allowed = ['28P01', '28000', '42501', '57P03', 'ECONNREFUSED', 'ETIMEDOUT'];
  return `STOP: ${stage} failed [${typeof code === 'string' && allowed.includes(code) ? code : 'CHECK_FAILED'}]. No retry; integration NOT invoked.`;
}

// Metadata only: no password verifier, role mutation, bootstrap or migration query.
const factsSql = `SELECT
  EXISTS(SELECT 1 FROM pg_catalog.pg_database d WHERE d.datname=current_database()
    AND d.datdba=current_user::regrole AND d.datallowconn
    AND pg_catalog.shobj_description(d.oid,'pg_database')='NUTRASA migration integration:419e5962579e4d22a83a8ff1ecea417f') AS owner_marker,
  (SELECT count(*)=2 AND bool_and(nspowner='${localRoles.migrator}'::regrole)
    FROM pg_catalog.pg_namespace WHERE nspname IN ('nutrasa','nutrasa_migrations')) AS schema_owners,
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','nutrasa','nutrasa_migrations'))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','nutrasa','nutrasa_migrations'))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname IN ('public','nutrasa','nutrasa_migrations'))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('information_schema','public','nutrasa','nutrasa_migrations')) AS fresh,
  (SELECT count(*)=4 AND bool_and(
    NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls)
    AND r.rolcanlogin=(r.rolname<>'${localRoles.executor}')
    AND (r.rolvaliduntil IS NULL OR r.rolvaliduntil>pg_catalog.clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles other WHERE other.oid<>r.oid
      AND (pg_catalog.pg_has_role(r.oid,other.oid,'USAGE') OR pg_catalog.pg_has_role(r.oid,other.oid,'SET')))
    AND pg_catalog.has_database_privilege(r.oid,current_database(),'CONNECT')=(r.rolname<>'${localRoles.executor}')
    AND NOT pg_catalog.has_database_privilege(r.oid,current_database(),'CREATE')
    AND NOT pg_catalog.has_database_privilege(r.oid,current_database(),'TEMPORARY'))
    FROM pg_catalog.pg_roles r WHERE r.rolname IN ('${localRoles.migrator}','${localRoles.runtime}',
      '${localRoles.writer}','${localRoles.executor}')) AS roles_and_expiry,
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database d CROSS JOIN LATERAL
    pg_catalog.aclexplode(COALESCE(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND (a.grantee=0 OR (a.grantee<>d.datdba AND
      (a.is_grantable OR a.privilege_type<>'CONNECT' OR pg_catalog.pg_get_userbyid(a.grantee)
       NOT IN ('${localRoles.migrator}','${localRoles.runtime}','${localRoles.writer}'))))) AS database_acl,
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL
    pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
    WHERE n.nspname IN ('public','nutrasa','nutrasa_migrations') AND a.grantee<>n.nspowner)
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN pg_catalog.pg_roles r
    WHERE r.rolname IN ('${localRoles.runtime}','${localRoles.writer}','${localRoles.executor}')
      AND (n.nspowner=r.oid OR (n.nspname IN ('public','nutrasa','nutrasa_migrations') AND
        (pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') OR pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE'))))) AS schema_acl,
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl d CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE d.defaclrole='${localRoles.migrator}'::regrole AND a.grantee<>d.defaclrole)
  AND (SELECT count(*)=2 FROM pg_catalog.pg_default_acl WHERE defaclrole='${localRoles.migrator}'::regrole
    AND defaclnamespace=0 AND defaclobjtype IN ('f','T')) AS default_acl,
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datname=current_database()
    AND pid<>pg_catalog.pg_backend_pid()) AS no_other_sessions,
  replace(current_setting('hba_file'),chr(92),'/')='D:/Rajendra/NUTRASA-Postgres-IT/data/pg_hba.conf'
    AND (SELECT count(*)=34 AND bool_and(error IS NULL) FROM pg_catalog.pg_hba_file_rules) AS hba_34`;

const writerIdentitySql = `SELECT current_database()='${localDatabase}' AND current_user='${localRoles.writer}'
  AND session_user=current_user AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5433
  AND current_setting('server_version_num')::integer=180006 AND current_setting('cluster_name')='nutrasa_it_pg18'
  AND current_setting('transaction_read_only')='on' AND current_setting('default_transaction_read_only')='off'
  AND current_setting('transaction_isolation')='read committed'
  AND replace(current_setting('search_path'),' ','')='pg_catalog,nutrasa' AS valid`;

async function readOnlyConnection(url: URL, execute: (client: Client) => Promise<void>) {
  const client = new Client({ connectionString: url.toString(), ssl: false, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, application_name: 'nutrasa_local_recovery' });
  client.on('error', () => {});
  try {
    await client.connect(); await client.query('BEGIN READ ONLY');
    await execute(client); await client.query('ROLLBACK');
  } finally { await client.end(); }
}

export async function verifyLocalAdmin(url: URL) {
  await readOnlyConnection(url, async client => {
    const identity = (await client.query<Record<string, unknown>>(adminIdentitySql)).rows;
    assert.equal(identity.length, 1); assertSetupAdmin(identity[0], localDatabase);
    const facts = (await client.query<Record<string, unknown>>(factsSql)).rows[0];
    assert.ok(facts); assert.ok(Object.values(facts).every(value => value === true));
    const rules = (await client.query<SetupHbaRule>(`SELECT rule_number,type,database,user_name,address,netmask,auth_method,error
      FROM pg_catalog.pg_hba_file_rules ORDER BY rule_number`)).rows;
    for (const role of [localRoles.runtime,localRoles.writer]) {
      assertSetupHba(rules, { migrator: { database: localDatabase, role: localRoles.migrator }, reader: { role } });
    }
    const roles = (await client.query<{ role: string; valid_until: string | null }>(
      `SELECT rolname::text AS role,rolvaliduntil::text AS valid_until FROM pg_catalog.pg_roles
       WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [Object.values(localRoles).filter(role => role !== localRoles.admin)])).rows;
    console.log('ADMIN READ-ONLY PREFLIGHT PASS', JSON.stringify({ ...facts, roles }));
  });
}

// A second cluster/freshness check runs in the same native session as \password.
export function writerResetArguments() {
  const guard = `BEGIN READ ONLY; WITH identity AS (${adminIdentitySql}), facts AS (${factsSql})
    SELECT 1 / CASE WHEN (i.database='${localDatabase}' AND i.role='nutrasa_it_admin' AND i.session_role=i.role
      AND i.superuser AND i.address='127.0.0.1' AND i.port=5433 AND i.version=180006
      AND i.cluster='nutrasa_it_pg18' AND replace(i.directory,chr(92),'/')='D:/Rajendra/NUTRASA-Postgres-IT/data'
      AND i.system_identifier='7697229180258678980' AND i.runtime_writable AND i.read_committed AND i.hba_loaded
      AND (SELECT bool_and(value='true'::jsonb) FROM pg_catalog.jsonb_each(to_jsonb(f)))) IS TRUE
      THEN 1 ELSE 0 END AS target_verified FROM identity i CROSS JOIN facts f; ROLLBACK;`;
  return ['-X','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-d', nativeConnection(localRoles.admin),
    '-c',guard,'-c',"SET password_encryption='scram-sha-256'",'-c','\\password ' + localRoles.writer];
}

function nativeConnection(role: string) {
  return `host=127.0.0.1 hostaddr=127.0.0.1 port=5433 dbname=${localDatabase} user=${role} connect_timeout=5 sslmode=disable gssencmode=disable`;
}

type NativeLaunch = (file: string, args: readonly string[], options: {
  env: NodeJS.ProcessEnv; windowsHide: boolean; timeout: number; maxBuffer: number;
}, complete: (error: Error | null, stdout: string) => void) => void;
const launchNative: NativeLaunch = (file,args,options,complete) => { execFile(file,args,options,complete); };

export function nativeWriterCheck(url: URL, launch: NativeLaunch = launchNative): Promise<void> {
  // Raw credential goes only to this child's environment, never arguments or parent PGPASSWORD.
  const environment: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
    PGCLIENTENCODING: 'UTF8', PGPASSWORD: decodeURIComponent(url.password) };
  return new Promise((resolveCheck, reject) => {
    launch(psql, ['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-d',nativeConnection(localRoles.writer),
      '-c',`BEGIN READ ONLY; ${writerIdentitySql}; ROLLBACK;`],
    { env: environment, windowsHide: true, timeout: 20000, maxBuffer: 8192 }, (error, stdout) => {
      delete environment.PGPASSWORD;
      // Native stderr is deliberately not forwarded, even when it contains server detail.
      if (error || stdout.trim() !== 't') reject(Error('Native writer check failed.'));
      else resolveCheck();
    });
  });
}

export async function nodeWriterCheck(url: URL) {
  await readOnlyConnection(url, async client => {
    assert.equal((await client.query<{ valid: boolean }>(writerIdentitySql)).rows[0]?.valid, true);
  });
}

export async function verifyWriterOnce(url: URL, checks = { native: nativeWriterCheck, node: nodeWriterCheck },
  report: (line: string) => void = console.log) {
  let stage: LocalStage = 'native writer login';
  try {
    await checks.native(url); report('NATIVE PSQL WRITER LOGIN PASS');
    stage = 'node writer login'; await checks.node(url); report('NODE WRITER LOGIN PASS');
  } catch (error: unknown) { throw Error(localFailure(stage,error)); }
}

async function verifyRun(environment: NodeJS.ProcessEnv) {
  const config = readCatalogLineageEnvironment(environment);
  assert.equal(config.migrator.database,localDatabase);
  await verifyLocalAdmin(localConnection(environment,'admin'));
  await readOnlyConnection(new URL(config.migrator.connectionString), client => verifyIntegrationConnection(client,config.migrator));
  for (const [url,role] of [[config.reader.connectionString,config.reader.role],[config.writerUrl,config.writerRole]]) {
    await readOnlyConnection(new URL(url), async client => {
      const row = (await client.query<{ role: string; session_role: string }>('SELECT current_user AS role,session_user AS session_role')).rows[0];
      assert.equal(row?.role,role); assert.equal(row?.session_role,role);
    });
  }
}

async function main() {
  let stage: LocalStage = 'configuration';
  try {
    const action = parseLocalArguments(process.argv.slice(2)); assertLocalEnvironment(process.env);
    if (action === 'reset-arguments') console.log(JSON.stringify(writerResetArguments()));
    else if (action === 'preflight') { stage='admin preflight'; await verifyLocalAdmin(localConnection(process.env,'admin')); }
    else if (action === 'check-writer') {
      // Only this function reports the whitelisted client stage; no nested exception text is printed.
      try { await verifyWriterOnce(localConnection(process.env,'writer')); }
      catch (error: unknown) {
        if (error instanceof Error && /^STOP: (native|node) writer login failed \[(CHECK_FAILED|28P01|28000|42501|57P03|ECONNREFUSED|ETIMEDOUT)\]\. No retry; integration NOT invoked\.$/.test(error.message)) {
          console.error(error.message); process.exitCode=1; return;
        }
        throw Error('Writer check rejected.');
      }
      console.log('WRITER AUTH RECOVERY PASS; integration NOT invoked.');
    } else { stage='run preflight'; await verifyRun(process.env); console.log('RUN PREFLIGHT PASS'); }
  } catch (error: unknown) { console.error(localFailure(stage,error)); process.exitCode=1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
