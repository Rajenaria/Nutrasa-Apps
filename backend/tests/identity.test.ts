import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { catalogCapabilities, catalogScope } from '../src/capability-registry.ts';
import { buildApp } from '../src/app.ts';
import type { IdentityDependencies } from '../src/identity.ts';

const token = 'synthetic.payload.signature';
const authorization = `Bearer ${token}`;
const verified = { async verifyIdToken(value: string, checkRevoked: true) {
  assert.equal(value, token); assert.equal(checkRevoked, true);
  return { uid: 'SYNTHETIC_UID' };
} };

function protectedApp(dependencies: IdentityDependencies = {}) {
  const app = buildApp(dependencies);
  // Protected routes exist only in tests, never in the production app.
  app.post('/test/identity', { onRequest: app.authenticate }, async request => request.identity);
  app.get('/test/capability', { onRequest: app.requireCapability(catalogCapabilities.nutritionReview, catalogScope) }, async request => request.identity);
  return app;
}

test('missing malformed or duplicate bearer authorization never invokes token verification', async t => {
  let calls = 0;
  const app = protectedApp({ verifier: { async verifyIdToken() { calls++; return { uid: 'SYNTHETIC' }; } } });
  t.after(() => app.close());
  for (const value of [undefined, '', 'Basic synthetic', 'Bearer unsigned', 'Bearer a.b.c extra', 'Bearer a..c']) {
    const response = await app.inject({ method: 'POST', url: '/test/identity',
      headers: value === undefined ? {} : { authorization: value } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'AUTH_REQUIRED');
    assert.equal(response.headers['www-authenticate'], 'Bearer');
  }
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${address}/test/identity`, { method: 'POST',
      headers: ['Host', new URL(address).host, 'Authorization', authorization, 'Authorization', authorization] }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject); request.end();
  });
  assert.equal(status, 401);
  assert.equal(calls, 0);
});

test('invalid expired revoked disabled and deleted Firebase identities fail with safe 401 envelopes', async t => {
  for (const code of ['auth/invalid-id-token', 'auth/argument-error', 'auth/id-token-expired',
    'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found']) await t.test(code, async t => {
    const app = protectedApp({ verifier: { async verifyIdToken(value, checkRevoked) {
      assert.equal(value, token); assert.equal(checkRevoked, true);
      throw Object.assign(new Error('PRIVATE_TOKEN_DETAILS'), { code });
    } } });
    t.after(() => app.close());
    const response = await app.inject({ method: 'POST', url: '/test/identity', headers: { authorization } });
    assert.equal(response.statusCode, 401);
    const body = response.json();
    assert.deepEqual(body, { error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' }, request_id: body.request_id });
    assert.equal(typeof body.request_id, 'string');
    assert.ok(!response.body.includes('PRIVATE_TOKEN_DETAILS') && !response.body.includes(token));
  });
});

test('verified UID is preserved and spoofed headers body roles and custom claims are discarded', async t => {
  const app = protectedApp({ verifier: { async verifyIdToken() {
    return { uid: ' SYNTHETIC_UID ', role: 'publisher', capabilities: [catalogCapabilities.nutritionReview], email_verified: true };
  } } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/test/identity',
    headers: { authorization: authorization.toLowerCase(), 'x-firebase-uid': 'SPOOFED', 'x-actor-subject': 'SPOOFED', 'x-role': 'publisher' },
    payload: { uid: 'SPOOFED', actor_subject: 'SPOOFED', role: 'publisher', identity: { firebaseUid: 'SPOOFED' } } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { firebaseUid: ' SYNTHETIC_UID ' });
});

test('verifier outage missing configuration and malformed verifier results fail closed as safe server errors', async t => {
  const configurations: IdentityDependencies[] = [{},
    { verifier: { async verifyIdToken() { throw Object.assign(new Error('PRIVATE_PROJECT_CREDENTIAL'), { code: 'app/network-error' }); } } },
    { verifier: { async verifyIdToken() { return { uid: '' }; } } },
  ];
  for (const config of configurations) {
    const app = protectedApp(config); t.after(() => app.close());
    const response = await app.inject({ method: 'POST', url: '/test/identity', headers: { authorization } });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json().error, { code: 'SERVER_ERROR', message: 'An internal server error occurred.' });
    assert.ok(!response.body.includes('PRIVATE_PROJECT_CREDENTIAL') && !response.body.includes(token));
  }
});

test('identity and forged custom role claims never grant a capability without an authority', async t => {
  const app = protectedApp({ verifier: { async verifyIdToken() { return { uid: 'SYNTHETIC', role: 'publisher', admin: true }; } } });
  t.after(() => app.close());
  const response = await app.inject({ url: '/test/capability', headers: { authorization, 'x-capability': catalogCapabilities.nutritionReview } });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json().error, { code: 'ACCESS_DENIED', message: 'Access denied.' });
});

test('capability lookup uses only verified UID and server route capability and rechecks revocation each request', async t => {
  let allowed = true;
  const calls: string[][] = [];
  const app = protectedApp({ verifier: verified, capabilities: { async allows(uid, capability, scope) {
    calls.push([uid, capability, scope]); return allowed;
  } } });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: '/test/capability', headers: { authorization, 'x-firebase-uid': 'SPOOFED' } })).statusCode, 200);
  allowed = false;
  assert.equal((await app.inject({ url: '/test/capability', headers: { authorization } })).statusCode, 403);
  assert.deepEqual(calls, [['SYNTHETIC_UID', catalogCapabilities.nutritionReview, catalogScope], ['SYNTHETIC_UID', catalogCapabilities.nutritionReview, catalogScope]]);
});

test('failed authentication does not call capability authority and authority outage cannot grant access', async t => {
  let calls = 0;
  const app = protectedApp({ verifier: verified, capabilities: { async allows() { calls++; throw new Error('PRIVATE_AUTHORITY_DETAILS'); } } });
  t.after(() => app.close());
  assert.equal((await app.inject('/test/capability')).statusCode, 401);
  assert.equal(calls, 0);
  const response = await app.inject({ url: '/test/capability', headers: { authorization } });
  assert.equal(response.statusCode, 500); assert.equal(calls, 1);
  assert.equal(response.json().error.code, 'SERVER_ERROR');
  assert.ok(!response.body.includes('PRIVATE_AUTHORITY_DETAILS'));
});

test('capability defaults reject unknown or missing assignments rather than inferring access', async t => {
  const app = protectedApp({ verifier: verified, capabilities: { async allows(_uid, capability) {
    return capability === 'TEST_ONLY_DIFFERENT_CAPABILITY';
  } } });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: '/test/capability', headers: { authorization } })).statusCode, 403);
  for (const capability of ['', ' ', ' TEST_ONLY_CAPABILITY']) assert.throws(() => app.requireCapability(capability, catalogScope));
});

test('concurrent requests and later unauthenticated requests never share identity context', async t => {
  let markEntered: () => void = () => { throw new Error('Barrier not initialized.'); };
  let unblock: () => void = () => { throw new Error('Barrier not initialized.'); };
  const entered = new Promise<void>(resolve => { markEntered = resolve; });
  const release = new Promise<void>(resolve => { unblock = resolve; });
  const app = protectedApp({ verifier: { async verifyIdToken(value, checkRevoked) {
    assert.equal(checkRevoked, true);
    if (value === 'first.payload.signature') { markEntered(); await release; return { uid: 'FIRST_SYNTHETIC' }; }
    return { uid: 'SECOND_SYNTHETIC' };
  } } });
  t.after(() => app.close());
  app.get('/test/public-context', async request => ({ identity: request.identity }));
  const first = app.inject({ method: 'POST', url: '/test/identity', headers: { authorization: 'Bearer first.payload.signature' } });
  const pending = first.then(response => response);
  await entered;
  try {
    const second = await app.inject({ method: 'POST', url: '/test/identity', headers: { authorization: 'Bearer second.payload.signature' } });
    assert.deepEqual(second.json(), { firebaseUid: 'SECOND_SYNTHETIC' });
    assert.deepEqual((await app.inject('/test/public-context')).json(), { identity: null });
  } finally { unblock(); }
  assert.deepEqual((await pending).json(), { firebaseUid: 'FIRST_SYNTHETIC' });
  assert.equal((await app.inject({ method: 'POST', url: '/test/identity' })).statusCode, 401);
});

test('health stays public even with malformed auth and unavailable identity dependencies', async t => {
  const app = protectedApp({ verifier: { async verifyIdToken() { throw new Error('Must not run on health.'); } } });
  t.after(() => app.close());
  const response = await app.inject({ url: '/api/v1/health/live', headers: { authorization: 'malformed' } });
  assert.equal(response.statusCode, 200); assert.deepEqual(response.json(), { status: 'ok' });
});
