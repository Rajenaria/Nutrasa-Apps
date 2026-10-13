import { resolve } from 'node:path';
import { getActions } from 'node-pg-migrate/sqlMigration';
import type { MigrationLoader, MigrationUnit } from 'node-pg-migrate/migrationLoader';

import { assertIntegrity } from './checksum.ts';
import type { IntegrityState, SqlSnapshot } from './checksum.ts';
import { migrationVersion } from './config.ts';

export function checksumStatement(file: SqlSnapshot) {
  migrationVersion(file.name);
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid migration checksum.');
  // Names/hashes are validated before interpolation; mismatched existing hashes violate NOT NULL.
  return `INSERT INTO nutrasa_migrations.migration_checksums AS existing (name, sha256)
VALUES ('${file.name}', '${file.sha256}')
ON CONFLICT (name) DO UPDATE SET sha256 =
CASE WHEN existing.sha256 = EXCLUDED.sha256 THEN existing.sha256 ELSE NULL END;`;
}

export function createVerifiedLoader(
  snapshots: readonly SqlSnapshot[], inspect: () => Promise<IntegrityState>,
): MigrationLoader {
  return async (paths) => {
    const expectedPaths = new Set(snapshots.map((file) => resolve(file.path)));
    if (paths.length !== expectedPaths.size || new Set(paths.map((path) => resolve(path))).size !== paths.length ||
        paths.some((path) => !expectedPaths.has(resolve(path)))) {
      throw new Error('Migration file list changed after snapshot.');
    }
    // The runner has acquired its advisory lock before invoking this public loader hook.
    assertIntegrity(snapshots, await inspect());
    return snapshots.map((file): MigrationUnit => {
      const actions = getActions(file.content);
      const up = actions.up;
      const down = actions.down;
      if (typeof up !== 'function' || typeof down !== 'function') {
        throw new Error('Both migration directions must be available.');
      }
      return {
        id: file.path,
        filePaths: [file.path],
        actions: {
          up: async (pgm) => { await up(pgm); pgm.sql(checksumStatement(file)); },
          down: async (pgm) => { await down(pgm); pgm.sql(checksumStatement(file)); },
        },
      };
    });
  };
}
