import { Client } from 'pg';
import type { CapabilityDatabase } from '../../src/capabilities.ts';
import { readIntegrationEnvironment } from './guard.ts';
import type { IntegrationTarget } from './guard.ts';

export const readerColumns = Object.freeze({
  app_users: Object.freeze(['id', 'firebase_uid', 'account_status']),
  catalog_capability_assignments: Object.freeze(['subject_id', 'capability', 'scope', 'last_event_id']),
  catalog_capability_events: Object.freeze(['id', 'subject_id', 'capability', 'scope', 'action', 'event_number']),
});

export function readReaderEnvironment(environment: Readonly<Record<string, string | undefined>>): IntegrationTarget {
  for (const key of ['PGOPTIONS', 'PGREPLICATION', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) {
    if (environment[key]) throw new Error('Inherited PostgreSQL connection overrides are forbidden.');
  }
  if (environment.PGPORT && environment.PGPORT !== '5433') throw new Error('Unexpected inherited PostgreSQL port.');
  let url: URL;
  try { url = new URL(environment.NUTRASA_IT_READER_URL ?? ''); }
  catch { throw new Error('Explicit isolated reader connection required.'); }
  const role = url.username;
  const database = url.pathname.slice(1);
  if (role !== `${database}_runtime`) throw new Error('Dedicated nonowner runtime reader required.');
  // Reuse the strict disposable naming/endpoint parser without changing the migrator guard.
  url.username = `${database}_migrator`;
  const target = readIntegrationEnvironment({ ...environment, NUTRASA_IT_DATABASE_URL: url.toString() });
  url.username = role;
  return { ...target, role, connectionString: url.toString() };
}

export const readerIdentitySql = `SELECT current_database() AS database, current_user AS role,
  session_user AS session_role, host(inet_server_addr()) AS address, inet_server_port() AS port,
  current_setting('server_version_num')::integer AS version,
  current_setting('cluster_name') AS cluster,
  pg_catalog.pg_get_userbyid(d.datdba) AS owner,
  pg_catalog.shobj_description(d.oid,'pg_database') AS marker,
  current_setting('search_path') AS search_path,
  current_setting('default_transaction_read_only') = 'off' AS runtime_writable,
  current_setting('transaction_isolation') = 'read committed' AS read_committed,
  NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls)
    AND r.rolcanlogin AS restricted_role,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid<>r.oid
      AND (pg_catalog.pg_has_role(r.oid,x.oid,'USAGE') OR pg_catalog.pg_has_role(r.oid,x.oid,'SET')))
    AS no_role_paths,
  pg_catalog.has_database_privilege(r.oid,d.oid,'CONNECT')
    AND NOT pg_catalog.has_database_privilege(r.oid,d.oid,'CREATE')
    AND NOT pg_catalog.has_database_privilege(r.oid,d.oid,'TEMPORARY') AS database_rights,
  NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
    WHERE a.grantee=0 OR (a.grantee=r.oid AND a.is_grantable)) AS database_acl,
  (SELECT count(*)=2 AND bool_and(pg_catalog.pg_get_userbyid(n.nspowner)=$1)
    FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AS schema_owners,
  pg_catalog.has_schema_privilege(r.oid,'nutrasa','USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspowner=r.oid
      OR (n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND
        (pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') OR
         (n.nspname<>'nutrasa' AND pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE')))))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL
      pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname IN ('nutrasa','nutrasa_migrations','public')
        AND (a.grantee=0 OR (a.grantee=r.oid AND a.is_grantable))) AS schema_rights,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relowner=r.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proowner=r.oid) AS no_object_ownership
  FROM pg_catalog.pg_database d CROSS JOIN pg_catalog.pg_roles r
  WHERE d.datname=current_database() AND r.rolname=current_user`;

export function assertReaderIdentity(row: Record<string, unknown> | undefined, target: IntegrationTarget) {
  if (!row || row.database !== target.database || row.role !== target.role || row.session_role !== target.role ||
      !['127.0.0.1', '::1'].includes(String(row.address)) || row.port !== 5433 ||
      typeof row.version !== 'number' || !Number.isInteger(row.version) || row.version < 180000 || row.version >= 190000 ||
      row.cluster !== 'nutrasa_it_pg18' || row.owner !== 'nutrasa_it_admin' ||
      row.marker !== `NUTRASA migration integration:${target.id}` || row.search_path !== 'pg_catalog, nutrasa' ||
      ['runtime_writable', 'read_committed', 'restricted_role', 'no_role_paths', 'database_rights',
        'database_acl', 'schema_owners', 'schema_rights', 'no_object_ownership'].some(key => row[key] !== true)) {
    throw new Error('Reader identity, ownership or privilege boundary rejected.');
  }
}

// Effective column privileges include table grants, PUBLIC and inherited roles.
const columnSql = `SELECT n.nspname::text AS schema, c.relname::text AS table, a.attname::text AS column,
  pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS readable,
  (pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'INSERT') OR
   pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') OR
   pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'REFERENCES')) AS writable,
  EXISTS (SELECT 1 FROM pg_catalog.aclexplode(a.attacl) x WHERE x.grantee=0 OR x.is_grantable) AS unsafe_acl
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname IN ('nutrasa','nutrasa_migrations') AND c.relkind IN ('r','p','v','m','f')
    AND a.attnum>0 AND NOT a.attisdropped`;

const objectSql = `SELECT
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('nutrasa','nutrasa_migrations') AND
    ((c.relkind IN ('r','p','v','m','f') AND
      (pg_catalog.has_table_privilege(current_user,c.oid,'SELECT') OR
       pg_catalog.has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')))
     OR (c.relkind='S' AND pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
     OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(c.relacl) a WHERE a.grantee=0 OR a.is_grantable))) AS closed_relations,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('nutrasa','nutrasa_migrations') AND
    (pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE') OR
     EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
       WHERE a.grantee=0 OR a.is_grantable))) AS closed_functions,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles r ON r.oid=d.defaclrole
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE r.rolname=$1 AND a.grantee<>d.defaclrole) AND
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE((SELECT d.defaclacl FROM pg_catalog.pg_default_acl d
      WHERE d.defaclrole=r.oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'),
      pg_catalog.acldefault('f',r.oid))) a WHERE r.rolname=$1 AND a.grantee<>r.oid) AS closed_defaults`;

export function assertReaderColumns(rows: readonly Record<string, unknown>[]) {
  const expected = Object.entries(readerColumns).flatMap(([table, columns]) => columns.map(column => `nutrasa.${table}.${column}`));
  const readable: string[] = [];
  for (const row of rows) {
    if (typeof row.readable !== 'boolean' || row.writable !== false || row.unsafe_acl !== false) {
      throw new Error('Unsafe reader column privileges.');
    }
    if (row.readable) readable.push(`${row.schema}.${row.table}.${row.column}`);
  }
  if (JSON.stringify(readable.sort()) !== JSON.stringify(expected.sort())) throw new Error('Reader SELECT manifest mismatch.');
}

export async function verifyReaderConnection(database: CapabilityDatabase, target: IntegrationTarget) {
  const identity = await database.query(readerIdentitySql, [`${target.database}_migrator`]);
  if (identity.rows.length !== 1) throw new Error('Reader identity unavailable.');
  assertReaderIdentity(identity.rows[0], target);
  assertReaderColumns((await database.query(columnSql, [])).rows);
  const objects = await database.query(objectSql, [`${target.database}_migrator`]);
  const row = objects.rows[0];
  if (objects.rows.length !== 1 || !row || ['closed_relations', 'closed_functions', 'closed_defaults'].some(key => row[key] !== true)) {
    throw new Error('Unsafe effective reader object or default privileges.');
  }
}

export async function connectReader(target: IntegrationTarget) {
  // Revalidate before Client construction, which can otherwise consume environment defaults.
  const validated = readReaderEnvironment({ ...process.env,
    NUTRASA_IT_READER_URL: target.connectionString, NUTRASA_IT_CONFIRM_DATABASE: target.database });
  if (validated.id !== target.id || validated.role !== target.role) throw new Error('Reader target mismatch.');
  const client = new Client({ connectionString: validated.connectionString, ssl: false, application_name: 'nutrasa_it_reader' });
  client.on('error', () => { /* Never log credentials or raw connection errors. */ });
  try {
    await client.connect();
    await verifyReaderConnection(client, validated);
    await client.query("SET statement_timeout = '10s'");
    return client;
  } catch {
    await client.end();
    throw new Error('Isolated reader connection rejected or unavailable.');
  }
}
