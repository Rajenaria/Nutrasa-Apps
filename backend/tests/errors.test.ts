import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.ts';

function assertErrorResponse(body: unknown, code: string, message: string) {
  assert.ok(typeof body === 'object' && body !== null && 'request_id' in body);
  assert.equal(typeof body.request_id, 'string');
  assert.notEqual(body.request_id, '');
  assert.deepEqual(body, { error: { code, message }, request_id: body.request_id });
}

test('unknown routes return the error envelope without reflecting the URL', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject('/missing?token=private-test-token');

  assert.equal(response.statusCode, 404);
  assert.match(response.headers['content-type'] ?? '', /^application\/json/);
  assertErrorResponse(response.json(), 'NOT_FOUND', 'Resource not found.');
});

test('internal errors do not expose messages, stack traces, or attached details', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.get('/test-error', async () => {
    throw Object.assign(new Error('private-test-token; SQL SELECT secret'), {
      details: { credential: 'private-test-credential' },
    });
  });

  const response = await app.inject('/test-error');

  assert.equal(response.statusCode, 500);
  assertErrorResponse(response.json(), 'SERVER_ERROR', 'An internal server error occurred.');
});

test('malformed URLs use INVALID_REQUEST without reflecting the path', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject('/missing/%ZZ?token=private-test-token');

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json(), 'INVALID_REQUEST', 'Invalid request.');
});

test('non-Error throws also receive a safe internal error response', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.get('/test-error', async () => { throw 'private-test-token'; });

  const response = await app.inject('/test-error');

  assert.equal(response.statusCode, 500);
  assertErrorResponse(response.json(), 'SERVER_ERROR', 'An internal server error occurred.');
});

test('schema validation errors use VALIDATION_FAILED without exposing input', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.get('/test-validation', {
    schema: {
      querystring: {
        type: 'object',
        properties: { count: { type: 'integer' } },
        required: ['count'],
      },
    },
  }, async () => ({ status: 'ok' }));

  const response = await app.inject('/test-validation?count=private-test-token');

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json(), 'VALIDATION_FAILED', 'Request validation failed.');
});

test('malformed and empty JSON use INVALID_REQUEST', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.post('/test-input', async () => ({ status: 'ok' }));

  for (const payload of ['{"secret":"private-test-token"', '']) {
    const response = await app.inject({
      method: 'POST', url: '/test-input',
      headers: { 'content-type': 'application/json' }, payload,
    });

    assert.equal(response.statusCode, 400);
    assertErrorResponse(response.json(), 'INVALID_REQUEST', 'Invalid request.');
  }
});

test('body limits retain HTTP 413 with a safe error envelope', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.post('/test-input', { bodyLimit: 8 }, async () => ({ status: 'ok' }));

  const response = await app.inject({
    method: 'POST', url: '/test-input',
    headers: { 'content-type': 'application/json' }, payload: '{"value":"large"}',
  });

  assert.equal(response.statusCode, 413);
  assertErrorResponse(response.json(), 'INVALID_REQUEST', 'Invalid request.');
});

test('unsupported media types retain HTTP 415 with a safe error envelope', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.post('/test-input', async () => ({ status: 'ok' }));

  const response = await app.inject({
    method: 'POST', url: '/test-input',
    headers: { 'content-type': 'application/octet-stream' }, payload: 'private-test-token',
  });

  assert.equal(response.statusCode, 415);
  assertErrorResponse(response.json(), 'INVALID_REQUEST', 'Invalid request.');
});
