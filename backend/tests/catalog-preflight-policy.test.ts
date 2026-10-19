import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertMigrationSqlPolicy } from '../src/migrations/sql-policy.ts';

const source = await readFile(new URL('../migrations/0010_catalog_preflight.sql', import.meta.url), 'utf8');

test('internal catalog checks use the existing read-only SQL grammar and three exact closed signatures', () => {
  assert.doesNotThrow(() => assertMigrationSqlPolicy(source));
  assert.equal((source.match(/CREATE FUNCTION /g) ?? []).length, 3);
  assert.equal((source.match(/STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp/g) ?? []).length, 3);
  assert.equal((source.match(/REVOKE EXECUTE ON FUNCTION/g) ?? []).length, 3);
  assert.doesNotMatch(source, /SECURITY DEFINER|CREATE TRIGGER|GRANT EXECUTE|ALTER ROLE|OWNER TO|INSERT INTO|UPDATE nutrasa|DELETE FROM nutrasa/);
  assert.doesNotMatch(source, /'eligible'|'authorized'|'publication_allowed'/);
});

test('read-only helper changes cannot widen execute ACL or introduce privileged/session/migration access', () => {
  for (const mutated of [
    source.replace('STABLE SECURITY INVOKER', 'STABLE SECURITY DEFINER'),
    source.replace('STABLE SECURITY INVOKER', 'VOLATILE SECURITY INVOKER'),
    source.replace('pg_catalog, pg_temp', 'public, pg_catalog'),
    source.replace('SELECT COALESCE', "SELECT pg_catalog.set_config('role','unsafe',true), COALESCE"),
    source.replace('SELECT COALESCE', 'SELECT * FROM nutrasa_migrations.pgmigrations; SELECT COALESCE'),
    source.replace('SELECT COALESCE', 'DELETE FROM nutrasa.foods; SELECT COALESCE'),
    source.replace('FROM PUBLIC;', 'FROM unapproved_role;'),
    source.replace('catalog_category_parent_valid_v1(uuid,uuid) FROM PUBLIC', 'unapproved_helper(uuid,uuid) FROM PUBLIC'),
    source.replace('SELECT COALESCE', 'SELECT pg_catalog.pg_advisory_unlock(1), COALESCE'),
    source.replace('SELECT COALESCE', 'SELECT 1; COMMIT; SELECT COALESCE'),
    source.replace('$category$;', '-- Down Migration\n$category$;'),
  ]) assert.throws(() => assertMigrationSqlPolicy(mutated));
});
