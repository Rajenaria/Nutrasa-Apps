import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertMigrationSqlPolicy } from '../src/migrations/sql-policy.ts';

const sql = await readFile(new URL('../migrations/0011_catalog_lineage.sql', import.meta.url), 'utf8');

test('lineage structural migration uses the existing scanner without a new SQL grammar', () => {
  assert.doesNotThrow(() => assertMigrationSqlPolicy(sql));
});

test('lineage SQL cannot bypass transaction metadata and execution restrictions', () => {
  for (const statement of ['COMMIT;', 'ALTER ROLE unsafe SUPERUSER;', 'GRANT ALL ON SCHEMA nutrasa TO PUBLIC;',
    'SELECT * FROM nutrasa_migrations.migration_checksums;', "SELECT set_config('role','unsafe',true);",
    'SELECT pg_advisory_unlock(1);', "DO $$ BEGIN RAISE NOTICE 'unsafe'; END; $$;"]) {
    assert.throws(() => assertMigrationSqlPolicy(sql.replace('-- Down Migration', statement + '\n-- Down Migration')));
  }
});
