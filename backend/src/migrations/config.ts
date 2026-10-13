import { fileURLToPath } from 'node:url';

export const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
export const migrationNamePattern = '[0-9]{4}_[a-z][a-z0-9_]*';
// Leave four characters for .sql within the Windows/Linux filename component limit.
export const maxMigrationNameLength = 251;
const validMigrationName = new RegExp(`^${migrationNamePattern}(?![\\s\\S])`);

export function migrationVersion(name: string) {
  if (!validMigrationName.test(name) || name.length > maxMigrationNameLength || name.startsWith('0000_')) {
    throw new Error('Invalid migration name: use 0001 through 9999 and lowercase ASCII identifiers.');
  }
  return Number(name.slice(0, 4));
}

// Prevent the library's default JS/TS loader from becoming an alternate execution path.
export const ignoredMigrationFiles =
  `(?!(?=.{1,${maxMigrationNameLength + 4}}(?![\\s\\S]))(?!0000_)${migrationNamePattern}\\.sql(?![\\s\\S]))[\\s\\S]*`;

export const migrationConfig = Object.freeze({
  schema: 'nutrasa',
  migrationsSchema: 'nutrasa_migrations',
  migrationsTable: 'pgmigrations',
  createSchema: false,
  createMigrationsSchema: false,
  singleTransaction: true,
  checkOrder: true,
  noLock: false,
  advisoryLockMode: 'fail',
} as const);

export function assertSafeConfig(config: Readonly<Record<string, unknown>>) {
  const entries = Object.entries(migrationConfig);
  if (Object.keys(config).length !== entries.length ||
      entries.some(([key, value]) => config[key] !== value)) {
    throw new Error('Unsafe migration configuration.');
  }
}

export function parseCommand(args: readonly string[]) {
  const [direction, count] = args;
  if (direction === 'up' && args.length === 1) return { direction } as const;
  if (direction === 'down' && args.length <= 2 &&
      (count === undefined || /^[1-9]\d*$/.test(count))) {
    const parsedCount = count === undefined ? 1 : Number(count);
    if (Number.isSafeInteger(parsedCount)) return { direction, count: parsedCount } as const;
  }
  throw new Error('Usage: npm run migrate -- up | down [positive count].');
}
