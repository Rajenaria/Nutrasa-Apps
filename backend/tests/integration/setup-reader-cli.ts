import { setupReaderIntegration } from './setup-reader.ts';

try {
  await setupReaderIntegration(process.env);
} catch (error: unknown) {
  console.error(error instanceof Error && /^STOP: \w+ failed; preserve partial state, no retry or cleanup\.$/.test(error.message)
    ? error.message : 'STOP: disposable reader setup rejected or incomplete. Preserve state; no retry or cleanup.');
  process.exitCode = 1;
}
