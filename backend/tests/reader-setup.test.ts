import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Client } from 'pg';
import { fileURLToPath } from 'node:url';
import { readSqlSnapshots } from '../src/migrations/checksum.ts';
import { assertInstalledState, assertProvisionSuccess, assertSetupAdmin, assertSetupHba, readerPrivilegeStatements,
  readerSetupDatabase, readReaderSetupEnvironment, runReaderSetup, testingDataDirectory, testingSystemIdentifier } from './integration/reader-setup.ts';
import type { ReaderSetupStages, SetupHbaRule } from './integration/reader-setup.ts';
import { readerColumns } from './integration/reader-guard.ts';
import { bootstrapIntegrationTarget } from './integration/installation.ts';
import { setupReaderIntegration } from './integration/setup-reader.ts';

const db = readerSetupDatabase;
const environment = {
  NUTRASA_IT_ADMIN_URL: 'postgresql://nutrasa_it_admin:synthetic@127.0.0.1:5433/postgres',
  NUTRASA_IT_DATABASE_URL: `postgresql://${db}_migrator:synthetic@127.0.0.1:5433/${db}`,
  NUTRASA_IT_READER_URL: `postgresql://${db}_runtime:synthetic@127.0.0.1:5433/${db}`,
  NUTRASA_IT_CONFIRM_DATABASE: db,
};
const config = readReaderSetupEnvironment(environment);
const facts = { database: 'postgres', role: 'nutrasa_it_admin', session_role: 'nutrasa_it_admin', superuser: true,
  address: '127.0.0.1', port: 5433, version: 180006, cluster: 'nutrasa_it_pg18', directory: testingDataDirectory,
  system_identifier: testingSystemIdentifier, runtime_writable: true, read_committed: true, hba_loaded: true };

test('installer is pinned to the approved candidate with explicit separate credentials before any connection', () => {
  assert.equal(config.reader.database, db); assert.notEqual(config.reader.role, config.migrator.role);
  for (const [key, value] of Object.entries(environment)) {
    if (!key.endsWith('_URL')) continue;
    for (const changed of [value.replace(':5433', ':5432'), value.replace('127.0.0.1', 'localhost'),
      value + '?options=x', value.replace(':synthetic@', '@')])
      assert.throws(() => readReaderSetupEnvironment({ ...environment, [key]: changed }));
  }
  assert.throws(() => readReaderSetupEnvironment(Object.fromEntries(Object.entries(environment).map(([key, value]) =>
    [key, value.replaceAll(db, 'nutrasa_it_0123456789abcdef0123456789abcdef')]))));
  for (const key of ['PGOPTIONS', 'PGREPLICATION', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPORT'])
    assert.throws(() => readReaderSetupEnvironment({ ...environment, [key]: 'unapproved' }));
});

test('administrator proof requires actual system identifier directory version endpoint and unmodified session', () => {
  assertSetupAdmin(facts, 'postgres');
  for (const key of Object.keys(facts)) assert.throws(() => assertSetupAdmin({ ...facts, [key]: null }, 'postgres'), key);
  assert.throws(() => assertSetupAdmin(facts, db));
});

test('exit zero without exactly one target-bound final success marker is never provisioning success', () => {
  const marker = `NUTRASA_IT_PROVISION_COMPLETE ${db} ${config.migrator.role}`;
  assertProvisionSuccess(0, `CREATE DATABASE\r\n${marker}\r\n`, db, config.migrator.role);
  for (const output of ['', 'CREATE ROLE\nCREATE DATABASE', 'Provisioning complete.',
    marker + '\n' + marker, marker.replace(db, 'other'), 'STOP: partial\n' + marker])
    assert.throws(() => assertProvisionSuccess(0, output, db, config.migrator.role));
  for (const code of [1, 2, 3, null]) assert.throws(() => assertProvisionSuccess(code, marker, db, config.migrator.role));
});

test('exact SCRAM HBA must exist for both roles before any generic matching rule, with no parse error', () => {
  const rules: SetupHbaRule[] = [config.migrator.role, config.reader.role].map((role, index) => ({
    rule_number: index + 1, type: 'host', database: [db], user_name: [role], address: '127.0.0.1',
    netmask: '255.255.255.255', auth_method: 'scram-sha-256', error: null,
  }));
  assertSetupHba(rules, config);
  for (const bad of [[], rules.slice(1), [...rules, rules[0]],
    rules.map(row => ({ ...row, auth_method: 'trust' })), rules.map(row => ({ ...row, error: 'invalid' })),
    [{ ...rules[0], rule_number: 0, database: ['all'], user_name: ['all'], auth_method: 'reject' }, ...rules]])
    assert.throws(() => assertSetupHba(bad, config));
});

test('history and all eight checksums must match actual immutable files, including missing or changed baselines', async () => {
  const discovered = await readSqlSnapshots(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(discovered.length, 11);
  const files = discovered.slice(0, 8);
  assert.throws(() => assertInstalledState({ ledgerExists: true, historyExists: true,
    history: discovered.map(file => file.name), ledger: discovered.map(file => ({ name: file.name, sha256: file.sha256 })) }, discovered));
  const state = { ledgerExists: true, historyExists: true, history: files.map(row => row.name),
    ledger: files.map(row => ({ name: row.name, sha256: row.sha256 })) };
  assertInstalledState(state, files);
  for (const changed of [{ ...state, historyExists: false }, { ...state, ledger: state.ledger.slice(1) },
    { ...state, history: state.history.toReversed() }, { ...state, ledger: state.ledger.map(row => ({ ...row, sha256: '0'.repeat(64) })) }])
    assert.throws(() => assertInstalledState(changed, files));
});

test('reader installation generates only the approved thirteen column grants and no membership or table-wide rights', () => {
  const sql = readerPrivilegeStatements(config.reader.role);
  assert.equal(sql.length, 7);
  const selects = sql.filter(statement => statement.startsWith('GRANT SELECT'));
  assert.equal(selects.length, 3);
  for (const [table, columns] of Object.entries(readerColumns))
    assert.ok(selects.includes(`GRANT SELECT (${columns.join(', ')}) ON TABLE nutrasa.${table} TO ${config.reader.role}`));
  assert.doesNotMatch(sql.join('\n'), /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|SECURITY DEFINER|WITH GRANT OPTION|SET ROLE)\b/);
  assert.throws(() => readerPrivilegeStatements(config.migrator.role));
});

test('any failed setup stage stops all later actions without retry, including collisions and partial provisioning', async () => {
  const names: (keyof ReaderSetupStages)[] = ['preflight', 'provision', 'verifyProvision', 'install', 'verifyInstall',
    'prepareReader', 'enableReader', 'verifyReader', 'verifyPreservation'];
  for (const failAt of [...names, undefined]) {
    const calls: string[] = [];
    const action = (name: keyof ReaderSetupStages) => async () => {
      calls.push(name); if (name === failAt) throw new Error('SENSITIVE_INTERNAL_ERROR');
    };
    const stages: ReaderSetupStages = { preflight: action('preflight'), provision: action('provision'),
      verifyProvision: action('verifyProvision'), install: action('install'), verifyInstall: action('verifyInstall'),
      prepareReader: action('prepareReader'), enableReader: action('enableReader'), verifyReader: action('verifyReader'),
      verifyPreservation: action('verifyPreservation') };
    if (failAt) await assert.rejects(runReaderSetup(stages), { message: `STOP: ${failAt} failed; preserve partial state, no retry or cleanup.` });
    else await runReaderSetup(stages);
    assert.deepEqual(calls, failAt ? names.slice(0, names.indexOf(failAt) + 1) : names);
  }
});

test('manual SQL failure branches raise an error before quit and only final paths emit success markers', async () => {
  for (const name of ['provision.sql', 'enable-reader.sql']) {
    const sql = await readFile(new URL('./integration/' + name, import.meta.url), 'utf8');
    assert.ok(sql.includes('\\set ON_ERROR_STOP on'));
    for (const prefix of sql.split('\\quit').slice(0, -1)) assert.match(prefix.trimEnd(), /SELECT 1 \/ 0 AS \w+;$/);
    assert.doesNotMatch(sql, /(?:PASSWORD\s+'|\bDROP\b|\bTRUST\b)/i);
    assert.ok(sql.includes('pg_control_system()'));
  }
});

test('shared bootstrap rejects the wrong session before any transaction or DDL', async t => {
  const client = new Client();
  const query = t.mock.method(client, 'query', async () => ({ rows: [{ database: 'wrong', role: 'wrong', login_role: 'wrong' }] }));
  await assert.rejects(bootstrapIntegrationTarget(client, config.migrator));
  assert.equal(query.mock.callCount(), 1);
});

test('installer rejects an invalid target before administrator connection construction', async t => {
  const connect = t.mock.method(Client.prototype, 'connect', () => { throw new Error('Network forbidden.'); });
  await assert.rejects(setupReaderIntegration({ ...environment, NUTRASA_IT_CONFIRM_DATABASE: 'nutrasa_test' }));
  assert.equal(connect.mock.callCount(), 0);
});
