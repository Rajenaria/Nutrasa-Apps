import { Client } from 'pg';
import { readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { verifyMigrationConnection } from '../../src/migrations/core.ts';
import type { MigrationTarget } from '../../src/migrations/core.ts';
import { assertSafePgEnvironment } from '../../src/migrations/environment.ts';

export interface IntegrationTarget extends MigrationTarget {
  readonly connectionString: string;
  readonly id: string;
}

interface IntegrationServerFacts {
  address: string;
  port: number;
  marker: string | null;
  privileged: boolean;
  server_version_num: number;
  cluster_name: string;
  database_owner: string;
}

export function readIntegrationEnvironment(environment: Readonly<Record<string, string | undefined>>): IntegrationTarget {
  assertSafePgEnvironment(environment);
  let url: URL;
  try {
    url = new URL(environment.NUTRASA_IT_DATABASE_URL ?? '');
  } catch {
    throw new Error('Explicit isolated integration connection required.');
  }
  const database = url.pathname.slice(1);
  const match = /^nutrasa_it_([a-f0-9]{32})$/.exec(database);
  const id = match?.[1];
  if (!id || match?.[0] !== database || !url.password ||
      url.username !== `${database}_migrator` || environment.NUTRASA_IT_CONFIRM_DATABASE !== database ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.port !== '5433' || url.search !== '' || url.hash !== '') {
    throw new Error('Integration target must be a confirmed isolated local database and dedicated migrator.');
  }
  return { database, role: url.username, id, connectionString: url.toString() };
}

export function assertIntegrationServer(
  row: IntegrationServerFacts | undefined,
  target: IntegrationTarget,
) {
  if (!row || !['127.0.0.1', '::1'].includes(row.address) || row.port !== 5433 || row.privileged ||
      !Number.isInteger(row.server_version_num) || row.server_version_num < 180000 || row.server_version_num >= 190000 ||
      row.cluster_name !== 'nutrasa_it_pg18' || row.database_owner !== 'nutrasa_it_admin' ||
      row.marker !== `NUTRASA migration integration:${target.id}`) {
    throw new Error('Integration server, provisioning marker, or migrator privileges invalid.');
  }
}

function validateIntegrationTarget(target: IntegrationTarget) {
  const validated = readIntegrationEnvironment({
    NUTRASA_IT_DATABASE_URL: target.connectionString, NUTRASA_IT_CONFIRM_DATABASE: target.database,
    PGOPTIONS: process.env.PGOPTIONS, PGREPLICATION: process.env.PGREPLICATION,
  });
  if (validated.id !== target.id || validated.role !== target.role) throw new Error('Integration target mismatch.');
  return validated;
}

export async function verifyIntegrationConnection(client: Client, target: IntegrationTarget) {
  const validated = validateIntegrationTarget(target);
  await verifyMigrationConnection(client, validated);
  const identity = await client.query<IntegrationServerFacts>(`SELECT host(inet_server_addr()) AS address, inet_server_port() AS port,
      current_setting('server_version_num')::integer AS server_version_num,
      current_setting('cluster_name') AS cluster_name,
      pg_catalog.pg_get_userbyid(d.datdba) AS database_owner,
      pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
      (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit
       OR pg_catalog.has_database_privilege(r.oid, d.oid, 'CREATE')
       OR pg_catalog.has_database_privilege(r.oid, d.oid, 'TEMPORARY')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid OR m.roleid = r.oid)) AS privileged
      FROM pg_catalog.pg_database d CROSS JOIN pg_catalog.pg_roles r
      WHERE d.datname = current_database() AND r.rolname = current_user`);
  if (identity.rows.length !== 1) throw new Error('Invalid integration server identity.');
  assertIntegrationServer(identity.rows[0], validated);
}

export async function connectIntegrationTarget(target: IntegrationTarget, applicationName: string) {
  // Validate before construction: pg reads process environment defaults in its constructor.
  const validated = validateIntegrationTarget(target);
  const client = new Client({ connectionString: validated.connectionString, ssl: false, application_name: applicationName });
  client.on('error', () => { /* Do not print connection details. */ });
  try {
    await client.connect();
    await verifyIntegrationConnection(client, validated);
    await client.query("SET statement_timeout = '10s'");
    return client;
  } catch {
    await client.end();
    throw new Error('Isolated integration connection rejected or unavailable.');
  }
}

export async function verifyFixtureDirectory(directory: string, target: IntegrationTarget) {
  const actual = await realpath(directory);
  const root = dirname(actual);
  if (actual !== resolve(directory) || basename(actual) !== 'migrations' ||
      dirname(root) !== await realpath(tmpdir()) ||
      !basename(root).startsWith(`nutrasa-it-${target.id}-`) ||
      await realpath(join(root, 'run-id')) !== join(root, 'run-id') ||
      await readFile(join(root, 'run-id'), 'utf8') !== target.id) {
    throw new Error('Integration fixtures require a matching isolated temporary workspace.');
  }
}

export function ledgerDefinitionFromBootstrap(source: string) {
  const marker = 'CREATE TABLE nutrasa_migrations.migration_checksums (';
  const start = source.indexOf(marker);
  const end = source.indexOf('\nREVOKE ALL ON TABLE nutrasa_migrations.migration_checksums', start);
  if (start < 0 || end < 0 || source.indexOf(marker, start + marker.length) !== -1 ||
      !source.slice(start, end).trimEnd().endsWith('\n);')) {
    throw new Error('Bootstrap definition boundaries changed; review integration bootstrap before execution.');
  }
  // Reuse the actual reviewed table definition, not a second copy of its constraints.
  return source.slice(start, end);
}
