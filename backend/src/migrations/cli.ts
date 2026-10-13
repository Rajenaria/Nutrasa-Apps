import { parseCommand } from './config.ts';
import { runMigrations } from './runner.ts';

try {
  const command = parseCommand(process.argv.slice(2));
  await runMigrations(command, { MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL });
  console.log('Migration command completed.');
} catch {
  console.error('Migration rejected or failed. Review command, environment, bootstrap, and integrity.');
  process.exitCode = 1;
}
