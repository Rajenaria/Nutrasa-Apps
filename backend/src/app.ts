import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify();

  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));

  return app;
}
