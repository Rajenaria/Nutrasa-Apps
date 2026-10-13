import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const clientStatus =
    error instanceof Error && 'statusCode' in error &&
    (error.statusCode === 400 || error.statusCode === 404 ||
      error.statusCode === 413 || error.statusCode === 415)
      ? error.statusCode
      : undefined;
  const validationFailed =
    error instanceof Error && 'code' in error && error.code === 'FST_ERR_VALIDATION';

  let code = 'SERVER_ERROR';
  let message = 'An internal server error occurred.';
  if (clientStatus === 404) {
    code = 'NOT_FOUND';
    message = 'Resource not found.';
  } else if (clientStatus !== undefined) {
    code = validationFailed ? 'VALIDATION_FAILED' : 'INVALID_REQUEST';
    message = validationFailed ? 'Request validation failed.' : 'Invalid request.';
  }

  return reply.code(clientStatus ?? 500).send({
    error: { code, message },
    request_id: request.id,
  });
}

export function buildApp() {
  // Router errors such as malformed URLs bypass setErrorHandler.
  const app = Fastify({ frameworkErrors: handleError });
  app.setErrorHandler(handleError);

  app.setNotFoundHandler((request, reply) => reply.code(404).send({
    error: { code: 'NOT_FOUND', message: 'Resource not found.' },
    request_id: request.id,
  }));

  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));

  return app;
}
