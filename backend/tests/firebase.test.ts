import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApps } from 'firebase-admin/app';
import type { Credential } from 'firebase-admin/app';
import { buildApp } from '../src/app.ts';
import { createFirebaseVerifier, firebaseTokenVerifier } from '../src/firebase.ts';

const projectId = 'synthetic-project';
const environment = { FIREBASE_PROJECT_ID: projectId };
const credential: Credential = {
  async getAccessToken() { throw new Error('Synthetic credential must never request a token.'); },
};

test('imports and missing project do not initialize Firebase or discover credentials', () => {
  const before = getApps().length;
  assert.equal(createFirebaseVerifier({}, () => { throw new Error('Must not discover credentials.'); }), undefined);
  assert.equal(getApps().length, before);
});

test('project validation and emulator rejection happen before credential discovery', () => {
  for (const project of [' ', 'UPPERCASE', 'short', '-invalid-project', 'valid-project\n', 'a'.repeat(31)]) {
    assert.throws(() => createFirebaseVerifier({ FIREBASE_PROJECT_ID: project }, () => {
      assert.fail('Invalid configuration must not discover credentials.');
    }), /Invalid Firebase project configuration/);
  }
  assert.throws(() => createFirebaseVerifier({ ...environment, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }), /not permitted/);
});

test('missing credentials produce a sanitized initialization error', () => {
  assert.throws(() => createFirebaseVerifier(environment, () => {
    throw new Error('PRIVATE_CREDENTIAL_PATH');
  }), { message: 'Firebase initialization unavailable.' });
});

test('explicit project initializes once and refuses reuse with a different project', async t => {
  let discoveries = 0;
  t.after(async () => {
    const app = getApps().find(app => app.name === 'nutrasa-backend');
    if (app) await deleteApp(app);
  });
  assert.ok(createFirebaseVerifier(environment, () => { discoveries++; return credential; }));
  assert.ok(createFirebaseVerifier(environment, () => { discoveries++; return credential; }));
  assert.equal(discoveries, 1);
  assert.equal(getApps().filter(app => app.name === 'nutrasa-backend').length, 1);
  assert.equal(getApps().find(app => app.name === 'nutrasa-backend')?.options.projectId, projectId);
  assert.throws(() => createFirebaseVerifier({ FIREBASE_PROJECT_ID: 'another-project' }, () => credential),
    { message: 'Firebase initialization unavailable.' });
});

test('SDK rejects wrong audience or issuer offline before signature or credential lookup', async t => {
  t.after(async () => {
    const app = getApps().find(app => app.name === 'nutrasa-backend');
    if (app) await deleteApp(app);
  });
  const verifier = createFirebaseVerifier(environment, () => credential);
  assert.ok(verifier);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const claims of [
    { aud: 'another-project', iss: `https://securetoken.google.com/${projectId}` },
    { aud: projectId, iss: 'https://untrusted.invalid' },
  ]) {
    const token = `${encode({ alg: 'RS256', kid: 'synthetic-key' })}.${encode({ ...claims, sub: 'SYNTHETIC_UID' })}.synthetic`;
    const app = buildApp({ verifier });
    t.after(() => app.close());
    app.get('/test/identity', { onRequest: app.authenticate }, async request => request.identity);
    const response = await app.inject({ url: '/test/identity', headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'AUTH_REQUIRED');
    assert.ok(!response.body.includes(token) && !response.body.includes(projectId));
  }
});

test('adapter delegates revocation to SDK and exposes only the verified UID', async () => {
  const verifier = firebaseTokenVerifier({ async verifyIdToken(token, checkRevoked) {
    assert.equal(token, 'synthetic.payload.signature');
    assert.equal(checkRevoked, true);
    return { uid: ' CaseSensitive_UID ', sub: ' CaseSensitive_UID ', aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`, auth_time: 1, iat: 1, exp: 2,
      firebase: { identities: {}, sign_in_provider: 'custom' }, admin: true };
  } });
  assert.deepEqual(await verifier.verifyIdToken('synthetic.payload.signature', true), { uid: ' CaseSensitive_UID ' });
});

test('SDK credential or network failure fails closed without leaking details or blocking health', async t => {
  const verifier = firebaseTokenVerifier({ async verifyIdToken() { throw new Error('PRIVATE_CREDENTIAL_TOKEN'); } });
  const app = buildApp({ verifier });
  t.after(() => app.close());
  app.get('/test/identity', { onRequest: app.authenticate }, async request => request.identity);
  const response = await app.inject({ url: '/test/identity', headers: { authorization: 'Bearer synthetic.payload.signature' } });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, 'SERVER_ERROR');
  assert.ok(!response.body.includes('PRIVATE_CREDENTIAL_TOKEN'));
  assert.deepEqual((await app.inject('/api/v1/health/live')).json(), { status: 'ok' });
});
