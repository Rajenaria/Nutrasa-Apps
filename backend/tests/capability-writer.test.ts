import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyRequest } from 'fastify';
import { buildApp } from '../src/app.ts';
import { createCapabilityWriter } from '../src/capability-writer.ts';
import type { CapabilityTransition, GovernanceClient } from '../src/capability-writer.ts';
import { verifiedRequestUid } from '../src/identity.ts';

const subject = '10000000-0000-4000-8000-000000000001';
const event = '20000000-0000-4000-8000-000000000002';
const authorization = 'Bearer e30.e30.signature';
const command: CapabilityTransition = { subjectId: subject, capability: 'catalog.nutrition.review',
  scope: 'CATALOG', action: 'GRANT', expectedEventId: null, reason: 'Offline test only' };

function fakeClient(failure?: string) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const releases: (boolean | undefined)[] = [];
  const client: GovernanceClient = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === failure || (failure === 'function' && sql.startsWith('SELECT nutrasa.'))) {
        throw new Error('PRIVATE_SQL_DETAIL');
      }
      return { rows: sql.startsWith('SELECT current_user') ? [{ valid: true }] :
        sql.startsWith('SELECT nutrasa.') ? [{ event_id: event }] : [] };
    },
    release(discard) { releases.push(discard); },
  };
  return { client, calls, releases };
}

test('writer uses only verifier-issued request identity, bound SQL and one owned transaction', async t => {
  const mock = fakeClient();
  const writer = createCapabilityWriter({ async connect() { return mock.client; } });
  const app = buildApp({ verifier: { async verifyIdToken() { return { uid: 'EXACT_VERIFIED_UID' }; } } });
  t.after(() => app.close());
  let captured: FastifyRequest | undefined;
  app.post('/test/write', { onRequest: app.authenticate }, async request => {
    captured = request;
    // Even overwriting the public object cannot change privately issued provenance.
    request.identity = { firebaseUid: 'FORGED_PUBLIC_IDENTITY' };
    return { event: await writer(request, command) };
  });
  const response = await app.inject({ method: 'POST', url: '/test/write', headers: { authorization,
    'x-actor-subject': 'FORGED' }, payload: { uid: 'FORGED', role: 'admin', actor_subject: 'FORGED' } });
  assert.equal(response.statusCode, 200); assert.equal(response.json().event, event);
  const call = mock.calls.find(call => call.sql.startsWith('SELECT nutrasa.'));
  assert.deepEqual(call?.values?.slice(0, 7), ['EXACT_VERIFIED_UID', subject, command.capability, 'CATALOG', 'GRANT', null, command.reason]);
  assert.match(String(call?.values?.[7]), /^[a-f0-9-]{36}$/);
  assert.ok(!call?.sql.includes('EXACT_VERIFIED_UID'));
  assert.deepEqual(mock.calls.map(call => call.sql.split(' ')[0]), ['SELECT', 'BEGIN', 'SET', 'SELECT', 'COMMIT']);
  assert.deepEqual(mock.releases, [false]);
  assert.ok(captured); const completed = captured;
  assert.throws(() => verifiedRequestUid(completed), /Verified request identity required/);
});

test('plain identity objects and an unrelated request cannot issue writer provenance', async t => {
  let connections = 0;
  const writer = createCapabilityWriter({ async connect() { connections++; throw Error('No connection.'); } });
  const app = buildApp(); t.after(() => app.close());
  app.post('/test/write', async request => {
    request.identity = Object.freeze({ firebaseUid: 'FORGED' });
    return writer(request, command);
  });
  assert.equal((await app.inject({ method: 'POST', url: '/test/write' })).statusCode, 500);
  assert.equal(connections, 0);
});

test('administrative unknown and malformed transition inputs reject before checkout', async t => {
  let connections = 0;
  const writer = createCapabilityWriter({ async connect() { connections++; throw Error('No connection.'); } });
  const app = buildApp({ verifier: { async verifyIdToken() { return { uid: 'UID' }; } } });
  t.after(() => app.close());
  const inputs = [ { ...command, capability: 'catalog.capability.grant' },
    { ...command, capability: 'catalog.capability.revoke' }, { ...command, capability: 'catalog.*' },
    { ...command, scope: 'catalog' }, { ...command, subjectId: 'not-uuid' }, { ...command, reason: '  ' },
    { ...command, expectedEventId: 'invalid' }, { ...command, actor_subject: 'FORGED' } ];
  for (const [index, input] of inputs.entries()) {
    app.post(`/test/write/${index}`, { onRequest: app.authenticate }, request => writer(request, input));
  }
  for (let i = 0; i < inputs.length; i++) assert.equal((await app.inject({ method: 'POST', url: `/test/write/${i}`, headers: { authorization } })).statusCode, 500);
  assert.equal(connections, 0);
});

test('Firebase disabled/deleted actors never reach writer checkout', async t => {
  for (const code of ['auth/user-disabled', 'auth/user-not-found']) {
    let connections = 0;
    const writer = createCapabilityWriter({ async connect() { connections++; throw Error('No connection.'); } });
    const app = buildApp({ verifier: { async verifyIdToken() { throw Object.assign(Error('PRIVATE'), { code }); } } });
    t.after(() => app.close());
    app.post('/test/write', { onRequest: app.authenticate }, request => writer(request, command));
    assert.equal((await app.inject({ method: 'POST', url: '/test/write', headers: { authorization } })).statusCode, 401);
    assert.equal(connections, 0);
  }
});

test('session mismatch and transaction failures sanitize errors, rollback and discard without retry', async t => {
  for (const failure of ['identity', 'BEGIN ISOLATION LEVEL READ COMMITTED', 'function', 'COMMIT', 'rollback']) {
    const mock = fakeClient(failure === 'rollback' ? 'function' : failure);
    const base = mock.client.query;
    if (failure === 'identity') mock.client.query = async (sql, values) => {
      await base(sql, values); return { rows: [{ valid: false }] };
    };
    if (failure === 'rollback') mock.client.query = async (sql, values) => {
      if (sql === 'ROLLBACK') throw Error('PRIVATE_ROLLBACK_DETAIL');
      return base(sql, values);
    };
    const writer = createCapabilityWriter({ async connect() { return mock.client; } });
    const app = buildApp({ verifier: { async verifyIdToken() { return { uid: 'UID' }; } } });
    t.after(() => app.close());
    app.post('/test/write', { onRequest: app.authenticate }, request => writer(request, command));
    const response = await app.inject({ method: 'POST', url: '/test/write', headers: { authorization } });
    assert.equal(response.statusCode, 500); assert.ok(!response.body.includes('PRIVATE'));
    assert.deepEqual(mock.releases, [true]);
    assert.ok(mock.calls.filter(call => call.sql.startsWith('SELECT nutrasa.')).length <= 1);
    if (failure === 'identity') assert.equal(mock.calls.length, 1);
    if (failure === 'function' || failure === 'COMMIT') assert.equal(mock.calls.at(-1)?.sql, 'ROLLBACK');
  }
});

test('concurrent request identities use separate clients without shared actor context', async t => {
  const mocks = [fakeClient(), fakeClient()]; let checkouts = 0;
  const writer = createCapabilityWriter({ async connect() {
    const mock = mocks[checkouts++]; assert.ok(mock); return mock.client;
  } });
  const app = buildApp({ verifier: { async verifyIdToken(token) { return { uid: token.endsWith('first') ? 'FIRST' : 'SECOND' }; } } });
  t.after(() => app.close());
  app.post('/test/write', { onRequest: app.authenticate }, request => writer(request, command));
  const responses = await Promise.all(['first', 'second'].map(suffix => app.inject({ method: 'POST',
    url: '/test/write', headers: { authorization: `Bearer e30.e30.${suffix}` } })));
  assert.ok(responses.every(response => response.statusCode === 200));
  assert.deepEqual(mocks.map(mock => mock.calls.find(call => call.sql.startsWith('SELECT nutrasa.'))?.values?.[0]).sort(), ['FIRST', 'SECOND']);
  assert.ok(mocks.every(mock => mock.releases.length === 1 && mock.releases[0] === false));
});
