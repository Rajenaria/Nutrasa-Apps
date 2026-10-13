import { buildApp } from './app.ts';

const app = buildApp();

async function shutdown() {
  try {
    await app.close();
  } catch (error) {
    console.error('Backend shutdown failed:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  const address = await app.listen({ host: '127.0.0.1', port: 3000 });
  console.log(`NUTRASA backend listening at ${address}`);
} catch (error) {
  console.error('Backend startup failed:', error);
  process.exitCode = 1;
}
