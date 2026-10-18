import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogCapabilities, catalogScope, catalogPermissions, isKnownCapability } from '../src/capability-registry.ts';
import { buildApp } from '../src/app.ts';
import { createCapabilityAuthority } from '../src/capabilities.ts';
import type { CapabilityDatabase } from '../src/capabilities.ts';

const permission = { capability: catalogCapabilities.nutritionReview, scope: catalogScope };
const token = 'synthetic.payload.signature';
const authorization = `Bearer ${token}`;
const verifier = { async verifyIdToken(value: string, revoked: true) {
  assert.equal(value, token); assert.equal(revoked, true); return { uid: 'VERIFIED_UID' };
} };

function protectedApp(database: CapabilityDatabase, policy = [permission]) {
  const app = buildApp({ verifier, capabilities: createCapabilityAuthority(database, policy) });
  app.post('/test/protected', { onRequest: app.requireCapability(permission.capability, permission.scope) }, async request => request.identity);
  return app;
}

test('empty policy unknown pairs missing fields and wildcard-looking input deny before database access', async () => {
  let calls = 0;
  const database = { async query() { calls++; return { rows: [{ allowed: true }] }; } };
  assert.equal(await createCapabilityAuthority(database).allows('UID', permission.capability, permission.scope), false);
  const authority = createCapabilityAuthority(database, [permission]);
  for (const [capability, scope] of [['', permission.scope], [permission.capability, ''], ['*', '*'],
    ['UNKNOWN', permission.scope], [permission.capability, 'UNKNOWN'], [permission.capability.toUpperCase(), permission.scope],
    [permission.capability, permission.scope.toLowerCase()], [permission.capability, ' ' + permission.scope]]) {
    assert.equal(await authority.allows('UID', capability, scope), false);
  }
  for (const uid of ['', ' \t']) assert.equal(await authority.allows(uid, permission.capability, permission.scope), false);
  assert.equal(calls, 0);
});

test('trusted policy is snapshotted and cannot introduce unknown pairs or normalize scope', async () => {
  const original: { capability: string; scope: string } = { ...permission };
  const policy = [original];
  const calls: string[][] = [];
  const authority = createCapabilityAuthority({ async query(_sql, values) {
    calls.push(values); return { rows: [{ allowed: true }] };
  } }, policy);
  original.scope = 'NEW_SCOPE'; policy.push({ capability: 'OTHER', scope: 'OTHER' });
  assert.equal(await authority.allows(' CaseSensitive UID ', permission.capability, permission.scope), true);
  assert.equal(await authority.allows('UID', permission.capability, 'NEW_SCOPE'), false);
  assert.equal(await authority.allows('UID', 'OTHER', 'OTHER'), false);
  assert.deepEqual(calls, [[' CaseSensitive UID ', permission.capability, permission.scope]]);
  for (const entry of [{ capability: '', scope: catalogScope }, { ...permission, scope: ' CATALOG ' },
    { capability: 'UNKNOWN', scope: catalogScope }])
    assert.throws(() => createCapabilityAuthority({ async query() { assert.fail('No query on configuration.'); } }, [entry]));
});

test('registry has exactly six frozen technical pairs and provides no implicit grant or hierarchy', async () => {
  assert.equal(catalogPermissions.length, 6);
  assert.equal(new Set(catalogPermissions.map(p => p.capability)).size, 6);
  assert.ok(Object.isFrozen(catalogCapabilities) && Object.isFrozen(catalogPermissions));
  for (const pair of catalogPermissions) {
    assert.ok(Object.isFrozen(pair)); assert.equal(pair.scope, catalogScope);
    assert.equal(isKnownCapability(pair.capability, pair.scope), true);
    assert.equal(await createCapabilityAuthority({ async query() { assert.fail('No activation.'); } })
      .allows('UID', pair.capability, pair.scope), false);
  }
  for (const value of ['catalog.*', 'catalog', 'admin', '*']) assert.equal(isKnownCapability(value, catalogScope), false);
});

test('query binds UID capability and scope as data and checks the whole effective state in one SELECT', async () => {
  const uid = "UID' OR true --";
  const { capability, scope } = permission;
  let calls = 0;
  const authority = createCapabilityAuthority({ async query(sql, values) {
    calls++; assert.deepEqual(values, [uid, capability, scope]);
    for (const value of values) assert.ok(!sql.includes(value));
    assert.match(sql, /^SELECT EXISTS/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|SET|set_config)\b/i);
    for (const fragment of ['u.firebase_uid = $1 COLLATE "C"', "u.account_status = 'ACTIVE'",
      'a.capability = $2 COLLATE "C"', 'a.scope = $3 COLLATE "C"', "e.action = 'GRANT'",
      '(e.subject_id, e.capability, e.scope, e.id)', '(a.subject_id, a.capability, a.scope, a.last_event_id)',
      'newer.event_number > e.event_number']) assert.ok(sql.includes(fragment));
    return { rows: [{ allowed: true }] };
  } }, [{ capability, scope }]);
  assert.equal(await authority.allows(uid, capability, scope), true); assert.equal(calls, 1);
});

test('denied mocked snapshot stays denied and changed authority state is rechecked without caching', async () => {
  let allowed = true; let calls = 0;
  const authority = createCapabilityAuthority({ async query() { calls++; return { rows: [{ allowed }] }; } }, [permission]);
  assert.equal(await authority.allows('UID', permission.capability, permission.scope), true);
  allowed = false;
  assert.equal(await authority.allows('UID', permission.capability, permission.scope), false);
  assert.equal(calls, 2);
  // Missing binding, non-ACTIVE account, absent/revoked/stale pointer yield false from the SQL.
  // Their actual PostgreSQL evaluation is a separate integration acceptance gate.
});

test('database outage or invalid result never becomes denial-as-success or an implicit grant', async () => {
  const unavailable = createCapabilityAuthority({ async query() { throw new Error('PRIVATE_CONNECTION_DETAILS'); } }, [permission]);
  await assert.rejects(unavailable.allows('UID', permission.capability, permission.scope), { message: 'Capability authority unavailable.' });
  for (const rows of [[], [{ allowed: 'true' }], [{ allowed: null }], [{ allowed: true }, { allowed: true }]]) {
    const authority = createCapabilityAuthority({ async query() { return { rows }; } }, [permission]);
    await assert.rejects(authority.allows('UID', permission.capability, permission.scope), { message: 'Invalid capability authority result.' });
  }
});

test('client UID actor scope role and claims cannot choose the trusted query parameters', async t => {
  const calls: string[][] = [];
  const app = protectedApp({ async query(_sql, values) { calls.push(values); return { rows: [{ allowed: true }] }; } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/test/protected',
    headers: { authorization, 'x-actor-subject': 'FORGED', 'x-role': 'admin', 'x-scope': 'FORGED' },
    payload: { firebaseUid: 'FORGED', actor_subject: 'FORGED', scope: 'FORGED', capability: 'FORGED', role: 'admin' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { firebaseUid: 'VERIFIED_UID' });
  assert.deepEqual(calls, [['VERIFIED_UID', permission.capability, permission.scope]]);
  const denied = protectedApp({ async query() { assert.fail('Unknown policy must not query.'); } }, []);
  t.after(() => denied.close());
  assert.equal((await denied.inject({ method: 'POST', url: '/test/protected', headers: { authorization } })).statusCode, 403);
});

test('Firebase-disabled identity never reaches the database even when a snapshot would allow it', async t => {
  let calls = 0;
  const app = buildApp({ verifier: { async verifyIdToken() {
    throw Object.assign(new Error('PRIVATE_ACCOUNT_DETAILS'), { code: 'auth/user-disabled' });
  } }, capabilities: createCapabilityAuthority({ async query() { calls++; return { rows: [{ allowed: true }] }; } }, [permission]) });
  t.after(() => app.close());
  app.get('/test/disabled', { onRequest: app.requireCapability(permission.capability, permission.scope) }, async request => request.identity);
  assert.equal((await app.inject({ url: '/test/disabled', headers: { authorization } })).statusCode, 401);
  assert.equal(calls, 0);
});

test('read denial is 403 authority failure is safe 500 and health never invokes the authority', async t => {
  for (const failure of [false, true]) {
    let calls = 0;
    const app = protectedApp({ async query() {
      calls++; if (failure) throw new Error('PRIVATE_SQL_CREDENTIAL'); return { rows: [{ allowed: false }] };
    } });
    t.after(() => app.close());
    assert.equal((await app.inject('/api/v1/health/live')).statusCode, 200); assert.equal(calls, 0);
    assert.equal((await app.inject({ method: 'POST', url: '/test/protected' })).statusCode, 401); assert.equal(calls, 0);
    const response = await app.inject({ method: 'POST', url: '/test/protected', headers: { authorization } });
    assert.equal(response.statusCode, failure ? 500 : 403);
    assert.equal(response.json().error.code, failure ? 'SERVER_ERROR' : 'ACCESS_DENIED');
    assert.ok(!response.body.includes('PRIVATE_SQL_CREDENTIAL') && !response.body.includes(token));
  }
});

test('concurrent mocked reads isolate UID and scope and do not persist per-user connection context', async t => {
  let entered: () => void = () => { throw new Error('Barrier not initialized.'); };
  let release: () => void = () => { throw new Error('Barrier not initialized.'); };
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const unblock = new Promise<void>(resolve => { release = resolve; });
  const calls: string[][] = [];
  const authority = createCapabilityAuthority({ async query(_sql, values) {
    calls.push(values);
    if (values[0] === 'FIRST') { entered(); await unblock; return { rows: [{ allowed: true }] }; }
    return { rows: [{ allowed: false }] };
  } }, [permission, { capability: catalogCapabilities.publicationPublish, scope: catalogScope }]);
  const app = buildApp({ capabilities: authority, verifier: { async verifyIdToken(value) {
    return { uid: value === 'first.payload.signature' ? 'FIRST' : 'SECOND' };
  } } });
  t.after(() => app.close());
  app.get('/test/first', { onRequest: app.requireCapability(permission.capability, permission.scope) }, async request => request.identity);
  app.get('/test/second', { onRequest: app.requireCapability(catalogCapabilities.publicationPublish, catalogScope) }, async request => request.identity);
  const first = app.inject({ url: '/test/first', headers: { authorization: 'Bearer first.payload.signature' } }).then(response => response);
  await waiting;
  try {
    assert.equal((await app.inject({ url: '/test/second', headers: { authorization: 'Bearer second.payload.signature' } })).statusCode, 403);
    assert.equal((await app.inject('/test/first')).statusCode, 401);
  } finally { release(); }
  assert.deepEqual((await first).json(), { firebaseUid: 'FIRST' });
  assert.deepEqual(calls, [['FIRST', permission.capability, permission.scope], ['SECOND', catalogCapabilities.publicationPublish, catalogScope]]);
});

test('protected hook requires an explicit nonblank scope at route registration', async t => {
  const app = buildApp(); t.after(() => app.close());
  for (const scope of ['', ' ', '\t']) assert.throws(() => app.requireCapability(permission.capability, scope));
});

test('unknown route pair denies even when an injected authority would return true', async t => {
  let calls = 0;
  const app = buildApp({ verifier, capabilities: { async allows() { calls++; return true; } } });
  t.after(() => app.close());
  app.get('/test/unknown', { onRequest: app.requireCapability('UNKNOWN', catalogScope) }, async () => 'forbidden');
  assert.equal((await app.inject({ url: '/test/unknown', headers: { authorization } })).statusCode, 403);
  assert.equal(calls, 0);
});
