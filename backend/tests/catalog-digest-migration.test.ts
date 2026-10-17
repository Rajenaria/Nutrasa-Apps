import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MigrationBuilder } from 'node-pg-migrate/migrationBuilder';
import { assertIntegrity, readSqlSnapshots, sha256, snapshotSql } from '../src/migrations/checksum.ts';
import { migrationsDirectory } from '../src/migrations/config.ts';
import { createVerifiedLoader } from '../src/migrations/loader.ts';
import { vectors } from './integration/fixtures/catalog-digest/vectors.ts';

const historicalHashes = [
  'a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af',
  '9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6',
  '24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888',
  'd5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542',
  '1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218',
  'c682c41851dd2932e79b66846b696f6ad5d4f8ed8906c77e355f37350ed89961',
];

test('digest discovery preserves all six byte hashes and excludes candidate vectors/failure fixture', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  assert.deepEqual(files.map(file => file.name), ['0001_identity','0002_food_sources','0003_food_catalog',
    '0004_food_taxonomy','0005_food_servings_provenance','0006_catalog_audit','0007_catalog_digest', '0008_catalog_capabilities']);
  assert.deepEqual(files.slice(0,6).map(file => file.sha256), historicalHashes);
  assert.ok(!files.some(file => file.name === '0008_failure'));
});

test('actual helpers queue UP/DOWN plus immutable checksum through the public transactional loader', async () => {
  const files = await readSqlSnapshots(migrationsDirectory);
  const digest = files[6]; assert.ok(digest);
  const units = await createVerifiedLoader(files, async () => ({ ledgerExists:true,historyExists:false,history:[],ledger:[] }))(
    files.map(file => file.path));
  const unit = units[6]; assert.ok(unit);
  for (const direction of ['up','down'] as const) {
    const denied = async () => { throw new Error('No database access in unit tests.'); };
    const builder = new MigrationBuilder({query:denied,select:denied},{},false,{info(){},warn(){},error(){}});
    const action = unit.actions[direction]; assert.equal(typeof action,'function');
    if (typeof action !== 'function') throw new Error('Missing direction.');
    await action(builder);
    assert.equal(builder.isUsingTransaction(),true);
    assert.equal(builder.getSqlSteps().length,2);
    assert.ok(builder.getSqlSteps()[1]?.includes(digest.sha256));
  }
  const sql=digest.content;
  assert.equal((sql.match(/CREATE FUNCTION nutrasa\./g) ?? []).length,3);
  assert.equal((sql.match(/SECURITY INVOKER SET search_path = pg_catalog, pg_temp/g) ?? []).length,3);
  assert.equal((sql.match(/REVOKE EXECUTE ON FUNCTION/g) ?? []).length,3);
  assert.doesNotMatch(sql,/SECURITY DEFINER|\bGRANT\b|\bCASCADE\b|CREATE (?:TABLE|TRIGGER|ROLE)|\b(?:INSERT INTO|UPDATE nutrasa|DELETE FROM)\b/);
  for (const clause of ["AT TIME ZONE 'UTC'",'r.basis_quantity::text','n.value::text','d.base_quantity::text',
    "pg_catalog.convert_to(p_payload::text, 'UTF8')",'ORDER BY d.id','ORDER BY v.source_id','p_permission_review_ids IS NOT NULL'])
    assert.ok(sql.includes(clause),clause);
});

test('frozen candidate byte vectors have independent pinned hashes and distinct NULL/missing/zero states', () => {
  assert.equal(vectors.length,6);
  assert.equal(new Set(vectors.map(vector=>vector.sha256)).size,6);
  for (const vector of vectors) {
    assert.equal(sha256(Buffer.from(vector.text,'utf8')),vector.sha256);
    const parsed: unknown=JSON.parse(vector.text);
    assert.ok(parsed!==null && typeof parsed==='object');
  }
});

test('changed or removed historical digest remains rejected after DOWN', async () => {
  const files=await readSqlSnapshots(migrationsDirectory);
  const digest=files[6]; assert.ok(digest);
  const state={ledgerExists:true,historyExists:true,history:files.slice(0,6).map(file=>file.name),
    ledger:files.map(file=>({name:file.name,sha256:file.sha256}))};
  assert.throws(()=>assertIntegrity(files.slice(0,6),state));
  const changed=snapshotSql(digest.path,Buffer.from(digest.content+'\n'));
  assert.throws(()=>assertIntegrity([...files.slice(0,6),changed],state));
  const failure=new URL('./integration/fixtures/catalog-digest/0008_failure.sql',import.meta.url);
  assert.equal(snapshotSql(failure.pathname,await readFile(failure)).name,'0008_failure');
});
