import { buildApp } from './app.ts';
import { createFirebaseVerifier } from './firebase.ts';
import type { FirebaseTokenVerifier } from './identity.ts';

// Configuration is explicit. With no project configured, health remains available
// and protected hooks still fail closed; no credentials are discovered.
let verifier: FirebaseTokenVerifier | undefined;
try {
  verifier = createFirebaseVerifier(process.env);
} catch {
  console.error('Backend identity configuration failed.');
  process.exit(1);
}
const app = buildApp({ verifier });

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
