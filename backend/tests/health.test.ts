import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.ts';

test('liveness is public and returns only a minimal status', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject('/api/v1/health/live');

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /^application\/json/);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('database readiness is not advertised before database integration', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject('/api/v1/health/ready');

  assert.equal(response.statusCode, 404);
});

test('liveness is reachable over local HTTP', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(`${address}/api/v1/health/live`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
