import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { executeAfterIntegrityCheck, readSqlSnapshots, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';
import { readCatalogLineageEnvironment } from './integration/catalog-lineage-guard.ts';

const hashes = [
  'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af',
  '9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6',
  '24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888',
  'd5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542',
  '1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218',
  'c682c41851dd2932e79b66846b696f6ad5d4f8ed8906c77e355f37350ed89961',
  'b6df290443a21652ce28776bbf3b2f86fac085151eb8759b6c0c9d2802930425',
  '68ddb8d4af1ed64260863c41b93be3699a81956da1cc7233c5456ffa0d5d2328',
  '6e66bf3c84c192e584e6e7fdb785bf6e24f97b878286a6a0efcf2866f1566ac9',
  '1c8b474efcf6a69b6249aa7d7929b3b716107f2196de227619d41a6e99d3f8ea',
];

test('lineage discovery preserves all ten actual SQL byte hashes and isolates failure fixtures', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.equal(files.length, 11);
  assert.deepEqual(files.slice(0, 10).map(file => file.sha256), hashes);
  assert.equal(files[10]?.name, '0011_catalog_lineage');
  const fixture = snapshotSql('0012_failure.sql', await readFile(new URL('./integration/fixtures/catalog-lineage/0012_failure.sql', import.meta.url)));
  assert.ok(!files.some(file => file.name === fixture.name));
});

test('lineage UP and guarded DOWN use the public transactional loader with the same immutable checksum', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const file = files[10]; assert.ok(file);
  const units = await createVerifiedLoader(files, async () => ({ ledgerExists: true, historyExists: false, history: [], ledger: [] }))(files.map(file => file.path));
  for (const direction of ['up', 'down'] as const) {
    const denied = async () => { throw Error('Database access prohibited.'); };
    const builder = new MigrationBuilder({ query: denied, select: denied }, {}, false, { info() {}, warn() {}, error() {} });
    const action = units[10]?.actions[direction]; assert.equal(typeof action, 'function');
    if (typeof action !== 'function') throw Error('Missing action.');
    await action(builder);
    const steps = builder.getSqlSteps(); assert.equal(steps.length, 2);
    assert.equal(builder.isUsingTransaction(), true); assert.ok(steps[1]?.includes(file.sha256));
    const sql = steps[0]; assert.ok(sql);
    assert.doesNotMatch(sql, /\bCASCADE\b|CREATE (?:FUNCTION|TRIGGER|ROLE)|SECURITY DEFINER|OWNER TO|^\s*(?:GRANT|INSERT|UPDATE|DELETE)\b/im);
    if (direction === 'down') {
      assert.ok(sql.indexOf('LOCK TABLE') < sql.indexOf('SELECT 1 /'));
      assert.ok(sql.indexOf('SELECT 1 /') < sql.indexOf('DROP INDEX'));
      assert.ok(sql.includes('actor_subject_id IS NOT NULL OR lineage_event_id IS NOT NULL'));
      assert.ok(sql.includes("current_setting('transaction_isolation') = 'read committed'"));
      assert.ok(sql.indexOf('DROP COLUMN lineage_event_id') < sql.indexOf('DROP TABLE nutrasa.catalog_revision_lineage_events'));
    }
  }
});

test('structural SQL retains the thirteen-column contract and guards nullable composite contexts without writer claims', async () => {
  const source = await readFile(new URL('../migrations/0011_catalog_lineage.sql', import.meta.url), 'utf8');
  const body = source.split('ALTER TABLE nutrasa.catalog_reviews')[0]; assert.ok(body);
  assert.deepEqual([...body.matchAll(/^  ([a-z_]+) (?:uuid|bigint|text|timestamptz)\b/gm)].map(match => match[1]),
    ['id','event_number','food_revision_id','actor_subject_id','event_kind','previous_event_id','serving_id',
      'nutrient_code','other_revision_id','origin_event_id','request_id','reason','recorded_at']);
  assert.equal((source.match(/ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE/g) ?? []).length, 8);
  assert.equal((source.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length, 6);
  assert.ok(source.includes("(event_kind = 'CREATE_REVISION') = (previous_event_id IS NULL)"));
  assert.ok(source.includes("(event_kind IN ('MOVE_NUTRIENT_IN', 'MOVE_SERVING_IN')) = (origin_event_id IS NOT NULL)"));
  assert.ok(source.includes('OR (actor_subject_id IS NOT NULL AND food_revision_id IS NOT NULL)'));
  assert.ok(source.includes("OR actor_subject COLLATE \"C\" = 'app_users:' || actor_subject_id::text"));
  assert.ok(source.includes('a.grantee <> c.relowner'));
  assert.ok(source.indexOf('a.grantee <> c.relowner') < source.indexOf('ADD COLUMN actor_subject_id'));
  assert.equal((source.match(/ADD COLUMN (?:actor_subject_id|lineage_event_id) uuid/g) ?? []).length, 3);
});

test('changed or missing applied lineage migration fails closed even after a guarded DOWN', async () => {
  const files = await readSqlSnapshots(migrationsDirectory); const file = files[10]; assert.ok(file);
  for (const history of [files.map(file => file.name), files.slice(0, 10).map(file => file.name)]) {
    const state = { historyExists: true, ledgerExists: true, history, ledger: files.map(file => ({ name: file.name, sha256: file.sha256 })) };
    let executions = 0;
    const execute = async () => { executions++; };
    await assert.rejects(executeAfterIntegrityCheck(files.slice(0, 10), state, execute));
    await assert.rejects(executeAfterIntegrityCheck([...files.slice(0, 10), snapshotSql(file.path, Buffer.from(file.content + '\n'))], state, execute));
    assert.equal(executions, 0);
  }
});

test('lineage environment requires its own approval and rejects both retained 0010 targets before any connection', () => {
  const db = 'nutrasa_it_10000000000040008000000000000011';
  const env = { NUTRASA_IT_DATABASE_URL: `postgresql://${db}_migrator:synthetic@127.0.0.1:5433/${db}`,
    NUTRASA_IT_READER_URL: `postgresql://${db}_runtime:synthetic@127.0.0.1:5433/${db}`,
    NUTRASA_IT_WRITER_URL: `postgresql://${db}_writer:synthetic@127.0.0.1:5433/${db}`,
    NUTRASA_IT_ADMIN_URL: `postgresql://nutrasa_it_admin:synthetic@127.0.0.1:5433/${db}`,
    NUTRASA_IT_CONFIRM_DATABASE: db, NUTRASA_IT_GOVERNANCE_CONFIRM: db,
    NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM: db, NUTRASA_IT_CATALOG_LINEAGE_CONFIRM: db };
  assert.equal(readCatalogLineageEnvironment(env).migrator.database, db);
  assert.throws(() => readCatalogLineageEnvironment({ ...env, NUTRASA_IT_CATALOG_LINEAGE_CONFIRM: '' }));
  for (const id of ['6643ae844e614d2fa430c6e48953f5be','e4c65951b6bf42c2b310b5924372b20d']) {
    const retained = 'nutrasa_it_' + id;
    assert.throws(() => readCatalogLineageEnvironment(Object.fromEntries(Object.entries(env).map(([key,value]) => [key,value.replaceAll(db,retained)]))));
  }
  for (const changes of [{ PGPORT: '5432' }, { PGOPTIONS: 'unsafe' }, { PGREPLICATION: '1' },
    { NUTRASA_IT_WRITER_URL: env.NUTRASA_IT_WRITER_URL.replace('5433','5432') }])
    assert.throws(() => readCatalogLineageEnvironment({ ...env, ...changes }));
});
