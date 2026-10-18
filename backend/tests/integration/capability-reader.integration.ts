import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildApp } from '../../src/app.ts';
import { createCapabilityAuthority } from '../../src/capabilities.ts';
import { catalogCapabilities, catalogPermissions, catalogScope } from '../../src/capability-registry.ts';
import { inspectIntegrityState } from '../../src/migrations/core.ts';
import { readSqlSnapshots } from '../../src/migrations/checksum.ts';
import { connectIntegrationTarget, readIntegrationEnvironment } from './guard.ts';
import { connectReader, readReaderEnvironment, verifyReaderConnection } from './reader-guard.ts';
import { createReaderTestPool } from './reader-pool.ts';
import { assertEmptyReaderDomains } from './setup-reader.ts';

// Opt-in only. Requires separately approved multi-role provisioning and 0001-0008 installation.
// This suite never creates roles, grants privileges, migrates, or cleans up a database.
test('nonowner capability reader ACL and exact lookup on a dedicated disposable target', { timeout: 120_000 }, async t => {
  const readerTarget = readReaderEnvironment(process.env);
  const migratorTarget = readIntegrationEnvironment(process.env);
  assert.equal(readerTarget.database, migratorTarget.database);
  const writer = await connectIntegrationTarget(migratorTarget, 'nutrasa_it_reader_fixtures');
  t.after(() => writer.end());
  const reader = await connectReader(readerTarget);
  t.after(() => reader.end());
  const scenario = async (name: string, execute: () => Promise<void>) => {
    let passed = false;
    await t.test(name, async () => { await execute(); passed = true; });
    assert.ok(passed, `STOP: ${name}; preserve target and do not retry.`);
  };
  const pooled = await createReaderTestPool(readerTarget);
  t.after(async () => { if (!pooled.pool.ended) await pooled.pool.end(); });
  const { capability, scope } = catalogPermissions[0];
  const authority = createCapabilityAuthority(pooled.database, catalogPermissions);
  const first = randomUUID(); const second = randomUUID();
  const uid = 'SYNTHETIC_READER_' + first; const otherUid = 'SYNTHETIC_READER_' + second;
  const lookup = (value = uid, cap: string = capability, exactScope: string = scope) => authority.allows(value, cap, exactScope);
  const event = async (action: 'GRANT' | 'REVOKE') => {
    const result = await writer.query<{ id: string }>(`INSERT INTO nutrasa.catalog_capability_events
      (subject_id,capability,scope,action,actor_subject_id,reason,request_id)
      VALUES($1,$2,$3,$4,$1,'Synthetic reader fixture only',$5) RETURNING id`, [first, capability, scope, action, randomUUID()]);
    const row = result.rows[0]; assert.ok(row); return row.id;
  };
  await scenario('verify installed immutable history and completely empty domain tables before fixture DML', async () => {
    const snapshots = await readSqlSnapshots(fileURLToPath(new URL('../../migrations/', import.meta.url)));
    const state = await inspectIntegrityState(writer);
    assert.equal(snapshots.length, 8);
    assert.deepEqual(state.history, snapshots.map(s => s.name));
    assert.equal(state.ledger.length, snapshots.length);
    for (const baseline of state.ledger) assert.equal(baseline.sha256, snapshots.find(s => s.name === baseline.name)?.sha256);
    const tables = await writer.query<{ name: string }>("SELECT tablename::text AS name FROM pg_catalog.pg_tables WHERE schemaname='nutrasa'");
    assert.equal(tables.rows.length, 17);
    await assertEmptyReaderDomains(writer);
    for (const { name } of tables.rows) {
      assert.match(name, /^[a-z_]+$/);
      assert.equal((await writer.query<{ count: string }>('SELECT count(*) FROM nutrasa.' + name)).rows[0]?.count, '0');
    }
    await verifyReaderConnection(reader, readerTarget);
  });
  await scenario('missing binding and assignment deny; exact grant admits only the verified internal subject', async () => {
    assert.equal(await lookup(), false);
    await writer.query(`INSERT INTO nutrasa.app_users(id,firebase_uid,account_status) VALUES($1,$2,'ACTIVE'),($3,$4,'ACTIVE')`, [first, uid, second, otherUid]);
    assert.equal(await lookup(), false);
    const granted = await event('GRANT');
    await writer.query('INSERT INTO nutrasa.catalog_capability_assignments(subject_id,capability,scope,last_event_id) VALUES($1,$2,$3,$4)', [first, capability, scope, granted]);
    assert.equal(await lookup(), true);
    for (const value of [otherUid, uid.toLowerCase(), ' ' + uid, "' OR true --"]) assert.equal(await lookup(value), false);
    assert.equal(await lookup(uid, capability.toUpperCase()), false);
    assert.equal(await lookup(uid, capability, scope.toLowerCase()), false);
    assert.equal(await lookup(uid, catalogCapabilities.capabilityGrant), false);
    assert.equal(await lookup(uid, catalogCapabilities.capabilityRevoke), false);
  });
  await scenario('actual max-one reader Pool reuses its backend across sequential and concurrent request identities', async () => {
    const before = await pooled.database.query('SELECT pg_catalog.pg_backend_pid() AS pid', []);
    const app = buildApp({ capabilities: authority, verifier: { async verifyIdToken(token) {
      return { uid: token === 'first.payload.signature' ? uid : otherUid };
    } } });
    t.after(() => app.close());
    app.get('/test/reader', { onRequest: app.requireCapability(capability, catalogScope) }, async request => request.identity);
    for (const [prefix, status] of [['first', 200], ['second', 403]] as const)
      assert.equal((await app.inject({ url: '/test/reader', headers: { authorization: `Bearer ${prefix}.payload.signature` } })).statusCode, status);
    const [allowed, denied] = await Promise.all(['first', 'second'].map(prefix => app.inject({ url: '/test/reader',
      headers: { authorization: `Bearer ${prefix}.payload.signature`, 'x-firebase-uid': uid } })));
    assert.equal(allowed.statusCode, 200); assert.deepEqual(allowed.json(), { firebaseUid: uid });
    assert.equal(denied.statusCode, 403);
    assert.equal((await app.inject('/test/reader')).statusCode, 401);
    const after = await pooled.database.query('SELECT pg_catalog.pg_backend_pid() AS pid', []);
    assert.deepEqual(after.rows, before.rows, 'One actual backend must be reused.');
    await verifyReaderConnection(reader, readerTarget);
  });
  await scenario('inactive account revoked and stale pointers deny on the next autocommit statement', async () => {
    for (const status of ['PENDING_DELETION', 'DELETED']) {
      await writer.query('UPDATE nutrasa.app_users SET account_status=$1 WHERE id=$2', [status, first]);
      assert.equal(await lookup(), false);
    }
    await writer.query("UPDATE nutrasa.app_users SET account_status='ACTIVE' WHERE id=$1", [first]);
    assert.equal(await lookup(), true);
    const revoked = await event('REVOKE');
    assert.equal(await lookup(), false, 'Newer event invalidates an outdated GRANT pointer.');
    await writer.query('UPDATE nutrasa.catalog_capability_assignments SET last_event_id=$1 WHERE subject_id=$2', [revoked, first]);
    assert.equal(await lookup(), false);
  });
  await scenario('forbidden data writes DDL sequence and metadata access fail with insufficient_privilege', async () => {
    const statements = [
      ...['app_users', 'catalog_capability_assignments', 'catalog_capability_events'].flatMap(table => [
        `INSERT INTO nutrasa.${table} DEFAULT VALUES`,
        `DELETE FROM nutrasa.${table} WHERE false`,
        `TRUNCATE nutrasa.${table}`,
      ]),
      "UPDATE nutrasa.app_users SET account_status='DELETED' WHERE id IS NULL",
      'UPDATE nutrasa.catalog_capability_assignments SET last_event_id=last_event_id WHERE false',
      "UPDATE nutrasa.catalog_capability_events SET action='REVOKE' WHERE false",
      'CREATE TABLE nutrasa.reader_forbidden(id integer)',
      'CREATE TEMP TABLE reader_forbidden(id integer)',
      'ALTER TABLE nutrasa.catalog_capability_assignments ADD COLUMN reader_forbidden integer',
      "SELECT nextval('nutrasa.catalog_capability_events_event_number_seq')",
      'SELECT last_value FROM nutrasa.catalog_capability_events_event_number_seq',
      'SELECT id,reason FROM nutrasa.catalog_capability_events',
      'SELECT id,email_display FROM nutrasa.app_users',
      'SELECT name FROM nutrasa_migrations.migration_checksums',
      `SET ROLE ${migratorTarget.role}`,
    ];
    for (const sql of statements) {
      // Always roll back the attempt, even if a broken privilege boundary unexpectedly accepts it.
      await reader.query('BEGIN');
      try { await assert.rejects(reader.query(sql), { code: '42501' }); }
      finally { await reader.query('ROLLBACK'); }
    }
    await verifyReaderConnection(reader, readerTarget);
  });
  await scenario('retain synthetic audit and unchanged history without creating editorial authority', async () => {
    const state = await inspectIntegrityState(writer);
    assert.equal(state.history.length, 8); assert.equal(state.ledger.length, 8);
    const events = await writer.query<{ action: string }>('SELECT action FROM nutrasa.catalog_capability_events ORDER BY event_number');
    assert.deepEqual(events.rows.map(row => row.action), ['GRANT', 'REVOKE']);
    assert.equal((await writer.query<{ count: string }>('SELECT count(*) FROM nutrasa.catalog_capability_assignments')).rows[0]?.count, '1');
    assert.equal(await lookup(), false);
  });
  await scenario('closed owned reader Pool fails safely without inferring a grant', async () => {
    await pooled.pool.end();
    await assert.rejects(lookup(), { message: 'Capability authority unavailable.' });
  });
});
