import { parseCommand } from '../../src/migrations/config.ts';
import { runMigrationCore } from '../../src/migrations/core.ts';
import {
  connectIntegrationTarget, readIntegrationEnvironment, verifyFixtureDirectory, verifyIntegrationConnection,
} from './guard.ts';

async function execute() {
  const [directory, label] = process.argv.slice(2);
  if (!directory || !['first', 'second'].includes(label ?? '')) throw new Error('Invalid integration worker.');
  const target = readIntegrationEnvironment({
    NUTRASA_IT_DATABASE_URL: process.env.NUTRASA_IT_DATABASE_URL,
    NUTRASA_IT_CONFIRM_DATABASE: process.env.NUTRASA_IT_CONFIRM_DATABASE,
  });
  await verifyFixtureDirectory(directory, target);
  const client = await connectIntegrationTarget(target, `nutrasa_it_worker_${label}`);
  try {
    await verifyIntegrationConnection(client, target);
    await runMigrationCore(parseCommand(['up']), { ...target, client, directory });
  } finally {
    await client.end();
  }
}

// IPC reports only classification, never SQL errors, environment values, or credentials.
try {
  await execute();
  process.send?.({ result: 'ok' });
} catch (error: unknown) {
  const result = error instanceof Error && error.message.startsWith('Migration lock unavailable;') ?
    'locked' : 'rejected';
  process.send?.({ result });
  process.exitCode = 1;
}
