import { Client } from 'pg';

import { migrationsDirectory } from './config.ts';
import { runMigrationCore } from './core.ts';
import { readMigrationEnvironment } from './environment.ts';

export async function runMigrations(
  command: { direction: 'up' | 'down'; count?: number },
  environment: Readonly<Record<string, string | undefined>>,
) {
  const target = readMigrationEnvironment(environment);
  const client = new Client({ connectionString: target.connectionString });
  client.on('error', () => { /* Query failures propagate; do not print connection details. */ });
  try {
    await client.connect();
    return await runMigrationCore(command, { ...target, client, directory: migrationsDirectory });
  } finally {
    await client.end();
  }
}
