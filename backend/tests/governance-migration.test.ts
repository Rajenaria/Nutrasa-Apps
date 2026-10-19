import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { readSqlSnapshots } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';
import { delegatedCapabilities, governanceLock, governanceSignature } from '../src/governance-contract.ts';

test('candidate writer is discovered after eight immutable domains and composes transactional UP/DOWN/checksum without a connection', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.equal(files.length, 11); const writer = files[8]; assert.ok(writer);
  assert.equal(writer.name, '0009_catalog_capability_writer');
  const units = await createVerifiedLoader(files, async () => ({ ledgerExists: true, historyExists: false, history: [], ledger: [] }))(files.map(f => f.path));
  for (const direction of ['up', 'down'] as const) {
    const forbidden = async () => { throw Error('Database access forbidden.'); };
    const builder = new MigrationBuilder({ query: forbidden, select: forbidden }, {}, false, { info() {}, warn() {}, error() {} });
    const action = units[8]?.actions[direction]; assert.equal(typeof action, 'function');
    if (typeof action !== 'function') throw Error('Missing action.');
    await action(builder); const steps = builder.getSqlSteps();
    assert.equal(builder.isUsingTransaction(), true); assert.equal(steps.length, 2);
    assert.ok(steps[1]?.includes(writer.sha256));
    assert.doesNotMatch(steps[0] ?? '', /\bGRANT\s+EXECUTE|CREATE ROLE|ALTER ROLE|OWNER TO|CREATE TABLE|\bCASCADE\b|DROP TABLE/);
  }
});

test('writer SQL pins registry delegation lock revalidation atomic audit and closed ACL; static evidence is not PostgreSQL PASS', async () => {
  const source = await readFile(new URL('../migrations/0009_catalog_capability_writer.sql', import.meta.url), 'utf8');
  assert.ok(source.includes(`REVOKE EXECUTE ON FUNCTION nutrasa.${governanceSignature} FROM PUBLIC`));
  assert.ok(source.includes('VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp'));
  assert.ok(source.includes(`pg_advisory_xact_lock(${governanceLock.join(', ')})`));
  const lock = source.indexOf('  PERFORM pg_catalog.pg_advisory_xact_lock');
  assert.ok(lock < source.indexOf('SELECT u.id'));
  assert.ok(source.indexOf('INSERT INTO nutrasa.catalog_capability_events') < source.indexOf('INSERT INTO nutrasa.catalog_capability_assignments'));
  for (const capability of delegatedCapabilities) assert.ok(source.includes(`'${capability}'`));
  for (const fragment of ["v_actor_id = p_subject_id", 'p_expected_event_id IS DISTINCT FROM v_pointer',
    'v_pointer IS DISTINCT FROM v_latest_id', 'newer.event_number > e.event_number',
    "p_action = 'GRANT' AND v_recipient_status <> 'ACTIVE'", 'a.grantee <> p.proowner']) assert.ok(source.includes(fragment), fragment);
  assert.doesNotMatch(source, /set_config|SET ROLE|pg_advisory_unlock|pg_advisory_lock\(/);
  const down = source.split('-- Down Migration')[1]; assert.ok(down);
  assert.match(down, /DROP FUNCTION/); assert.doesNotMatch(down, /DELETE FROM|TRUNCATE|DROP TABLE/);
});
