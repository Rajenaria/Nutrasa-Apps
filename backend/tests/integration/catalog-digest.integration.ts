import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { assertLockReleased, createMigrationHarness } from './harness.ts';
import { ids, vectors } from './fixtures/catalog-digest/vectors.ts';

const history = ['0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy',
  '0005_food_servings_provenance', '0006_catalog_audit', '0007_catalog_digest'];
const signatures = [
  'nutrasa.catalog_payload_digest_v1(jsonb)',
  'nutrasa.catalog_revision_payload_v1(uuid,uuid[])',
  'nutrasa.catalog_source_permission_payload_v1(uuid,text,jsonb,boolean,text,timestamptz,timestamptz,text,text)',
];

test('internal digest v1 on a fresh isolated PostgreSQL 18 target', { timeout: 120000 }, async t => {
  const { client, observer, directory, bootstrap, migrate, scenario, expectState } = await createMigrationHarness(t);
  const copy = async (name: string) => writeFile(join(directory, `${name}.sql`),
    await readFile(new URL(`../../migrations/${name}.sql`, import.meta.url)));
  const snapshot = async () => {
    const tables = (await client.query<{ name: string }>(`SELECT c.relname::text AS name FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='nutrasa' AND c.relkind='r' ORDER BY c.relname`)).rows;
    const result: Record<string, string[]> = {};
    for (const { name } of tables) result[name] = (await client.query<{ row: string }>(
      `SELECT to_jsonb(t)::text AS row FROM nutrasa.${name} t ORDER BY 1`)).rows.map(row => row.row);
    return result;
  };
  const permissionSql = `SELECT nutrasa.catalog_source_permission_payload_v1(
    $1::uuid,$2::text,$3::jsonb,$4::boolean,$5::text,$6::timestamptz,$7::timestamptz,$8::text,$9::text) AS payload`;
  const basePermission: unknown[] = [ids.source, 'UNVERIFIED', null, null, null, null, null, 'Synthetic locator', null];
  const revisionSql = 'SELECT nutrasa.catalog_revision_payload_v1($1::uuid,$2::uuid[]) AS payload';
  const matchVector = async (name: typeof vectors[number]['name'], sql: string, values: unknown[]) => {
    const vector = vectors.find(vector => vector.name === name); assert.ok(vector);
    const row = (await client.query<{ text: string; digest: string }>(`SELECT p.payload::text AS text,
      nutrasa.catalog_payload_digest_v1(p.payload) AS digest FROM (${sql}) p`, values)).rows[0];
    assert.ok(row);
    assert.equal(row.text, vector.text, `PostgreSQL canonical bytes: ${name}`);
    assert.equal(row.digest, vector.sha256, `PostgreSQL SHA-256: ${name}`);
  };
  const isolated = (name: string, execute: () => Promise<void>) => scenario(name, async () => {
    await client.query('BEGIN');
    try { await execute(); } finally { await client.query('ROLLBACK'); }
  });

  await scenario('bootstrap once apply protected 0001-0006 and insert synthetic content only', async () => {
    await bootstrap();
    for (const name of history.slice(0, 6)) await copy(name);
    await migrate('up');
    await client.query("INSERT INTO nutrasa.app_users(id,firebase_uid,account_status) VALUES($1,'DIGEST_SYNTHETIC','ACTIVE')", [ids.user]);
    for (const id of [ids.source, ids.otherSource]) await client.query(`INSERT INTO nutrasa.food_sources
      (id,name,source_type,reference,license_status) VALUES($1,'SYNTHETIC','SYNTHETIC','Synthetic bibliography','UNVERIFIED')`, [id]);
    await client.query(`INSERT INTO nutrasa.foods(id,canonical_name,normalized_name,food_type,publication_status)
      VALUES($1,'SYNTHETIC','synthetic','SYNTHETIC','DRAFT')`, [ids.food]);
    await client.query(`INSERT INTO nutrasa.food_revisions
      (id,food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method,quality_status)
      VALUES($1,$2,1,$3,100,'g','SYNTHETIC','SYNTHETIC','DRAFT')`, [ids.revision, ids.food, ids.source]);
    // Deliberately reverse insertion order. Stored event digests are synthetic, not permission approvals.
    await client.query(`INSERT INTO nutrasa.food_revision_nutrients(food_revision_id,nutrient_code,value)
      VALUES($1,'sugar_g',NULL),($1,'energy_kcal',0)`, [ids.revision]);
    for (const [id, source, hash] of [[ids.permission, ids.source, 'a'.repeat(64)], [ids.otherPermission, ids.otherSource, 'b'.repeat(64)]])
      await client.query(`INSERT INTO nutrasa.catalog_reviews
        (id,review_kind,decision,source_id,actor_subject,reason,canonical_version,content_digest,source_snapshot,license_status,evidence_reference)
        VALUES($1,'SOURCE_PERMISSION','REJECTED',$2,'SYNTHETIC_NOT_AUTHENTICATED','Synthetic only',1,$3,
          '{"synthetic":true}'::jsonb,'UNVERIFIED','Synthetic locator')`, [id, source, hash]);
    await expectState(history.slice(0, 6), 6);
  });
  const before = await snapshot();
  const preserved = async () => assert.deepEqual(await snapshot(), before);
  const functions = async () => (await client.query<{ name: string; invoker: boolean; volatility: string; path: string[];
    owned: boolean; public_execute: boolean }>(`SELECT p.proname::text AS name,NOT p.prosecdef AS invoker,
      p.provolatile::text AS volatility,p.proconfig AS path,p.proowner=current_user::regrole AS owned,
      EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='nutrasa' ORDER BY p.proname`)).rows;

  await scenario('failure after actual digest DDL rolls back functions ACL history and checksum', async () => {
    await copy(history[6]);
    const failure = join(directory, '0008_failure.sql');
    await writeFile(failure, await readFile(new URL('./fixtures/catalog-digest/0008_failure.sql', import.meta.url)));
    try {
      await assert.rejects(migrate('up'), { code: '22012' });
      assert.deepEqual(await functions(), []);
      await expectState(history.slice(0, 6), 6); await preserved(); await assertLockReleased(observer);
    } finally { await rm(failure); }
  });
  await scenario('actual UP installs exactly three invoker helpers without PUBLIC EXECUTE or domain changes', async () => {
    await migrate('up'); await expectState(history, 7); await preserved();
    const actual = await functions();
    assert.deepEqual(actual.map(row => row.name), ['catalog_payload_digest_v1', 'catalog_revision_payload_v1', 'catalog_source_permission_payload_v1']);
    for (const row of actual) {
      assert.equal(row.invoker, true); assert.equal(row.owned, true); assert.equal(row.public_execute, false);
      assert.deepEqual(row.path, ['search_path=pg_catalog, pg_temp']);
      assert.equal(row.volatility, row.name === 'catalog_payload_digest_v1' ? 'i' : 's');
    }
    const identities = (await client.query<{ signature: string }>(`SELECT p.oid::regprocedure::text AS signature
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='nutrasa' ORDER BY p.proname`)).rows.map(row => row.signature);
    // regprocedure omits visible schema names, so assert identities by OID rather than search_path formatting.
    assert.equal(identities.length, signatures.length);
    for (const signature of signatures) assert.ok((await client.query('SELECT $1::regprocedure AS oid', [signature])).rows[0]?.oid);
  });
  await isolated('source permission NULL metadata matches fixed PostgreSQL bytes and SHA-256', async () => {
    await matchVector('permission_nulls', permissionSql, basePermission);
    const changed = [...basePermission]; changed[7] = 'Other evidence';
    const original = (await client.query(permissionSql, basePermission)).rows[0]?.payload;
    const other = (await client.query(permissionSql, changed)).rows[0]?.payload;
    assert.notDeepEqual(original, other);
  });
  await isolated('Unicode remains unnormalized and timestamps use UTC with six microsecond digits across session settings', async () => {
    await client.query('UPDATE nutrasa.food_sources SET name=$1,accessed_at=$2 WHERE id=$3',
      [' Café é ', '2026-01-02T10:04:05.123456+07:00', ids.source]);
    const values = [ids.source, 'ALLOWED', { store: true, redistribute: false, offline_cache: true }, true,
      ' Synthetic attribution ', '2026-01-02T10:04:05.123456+07:00', '2027-01-02T03:04:05Z', 'Synthetic locator', 'c'.repeat(64)];
    await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
    await client.query("SET LOCAL DateStyle = 'SQL, DMY'");
    await matchVector('permission_unicode', permissionSql, values);
    await client.query("SET LOCAL TIME ZONE 'Asia/Jakarta'");
    await client.query("SET LOCAL DateStyle = 'ISO, MDY'");
    await matchVector('permission_unicode', permissionSql, values);
    await client.query('UPDATE nutrasa.food_sources SET name=$1 WHERE id=$2', [' Café é ', ids.source]);
    const composed = (await client.query(permissionSql, values)).rows[0]?.payload;
    const vector = vectors.find(vector => vector.name === 'permission_unicode'); assert.ok(vector);
    assert.notDeepEqual(composed, JSON.parse(vector.text));
  });
  await isolated('NULL zero and absent nutrient rows have distinct fixed vectors without float conversion', async () => {
    await matchVector('revision_null', revisionSql, [ids.revision, [ids.permission]]);
    await client.query("DELETE FROM nutrasa.food_revision_nutrients WHERE food_revision_id=$1 AND nutrient_code='sugar_g'", [ids.revision]);
    await matchVector('revision_missing', revisionSql, [ids.revision, [ids.permission]]);
    await client.query("INSERT INTO nutrasa.food_revision_nutrients VALUES($1,'sugar_g',0)", [ids.revision]);
    await matchVector('revision_zero', revisionSql, [ids.revision, [ids.permission]]);
  });
  await isolated('all eleven nutrient codes retain canonical order and full numeric precision', async () => {
    const codes = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'sugar_g',
      'saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg'];
    await client.query('DELETE FROM nutrasa.food_revision_nutrients WHERE food_revision_id=$1', [ids.revision]);
    for (const code of [...codes].reverse()) await client.query('INSERT INTO nutrasa.food_revision_nutrients VALUES($1,$2,$3)',
      [ids.revision, code, code === 'sugar_g' ? null : '999999999.12345']);
    const result = (await client.query<{ nutrients: { nutrient_code: string; value: string | null }[] }>(
      `SELECT p.payload->'nutrients' AS nutrients FROM (${revisionSql}) p`, [ids.revision, [ids.permission]])).rows[0];
    assert.ok(result);
    assert.deepEqual(result.nutrients, codes.map(code => ({ nutrient_code: code,
      value: code === 'sugar_g' ? null : '999999999.12345' })));
  });
  await isolated('servings and prior source decisions sort by UUID independent of insertion and input array order', async () => {
    for (const [id, source, label, quantity, sort, reference, snapshot] of [
      [ids.otherServing, ids.source, 'Other', '2.00000', 0, 'SYNTHETIC-1', 'Synthetic source 1'],
      [ids.serving, ids.otherSource, ' Porsi é ', '1.25000', 2, 'SYNTHETIC-2', 'Synthetic source 2'],
    ]) await client.query(`INSERT INTO nutrasa.serving_definitions
      (id,food_revision_id,source_id,label,base_quantity,method,reviewed,sort_order,source_record_reference,source_reference_snapshot)
      VALUES($1,$2,$3,$4,$5,'SYNTHETIC',false,$6,$7,$8)`, [id, ids.revision, source, label, quantity, sort, reference, snapshot]);
    await matchVector('revision_servings', revisionSql, [ids.revision, [ids.otherPermission, ids.permission]]);
    await matchVector('revision_servings', revisionSql, [ids.revision, [ids.permission, ids.otherPermission]]);
    const changed = await client.query(`UPDATE nutrasa.serving_definitions SET source_record_reference='Changed' WHERE id=$1`, [ids.serving]);
    assert.equal(changed.rowCount, 1);
    const payload = (await client.query(revisionSql, [ids.revision, [ids.permission, ids.otherPermission]])).rows[0]?.payload;
    const vector = vectors.find(vector => vector.name === 'revision_servings'); assert.ok(vector);
    assert.notDeepEqual(payload, JSON.parse(vector.text));
  });
  await isolated('invalid or incomplete targets return SQL NULL rather than a fabricated payload or hash', async () => {
    for (const selected of [null, [], [null], [ids.permission, ids.permission], [ids.otherPermission], [ids.permission, ids.otherPermission], [ids.user]])
      assert.equal((await client.query(revisionSql, [ids.revision, selected])).rows[0]?.payload, null);
    assert.equal((await client.query(revisionSql, [ids.user, [ids.permission]])).rows[0]?.payload, null);
    for (const [index, value] of [[0, ids.user], [1, 'INVALID'], [2, { store: true }], [2, 'null'],
      [5, 'infinity'], [6, 'infinity'], [7, ' '], [8, 'A'.repeat(64)]]) {
      assert.equal(typeof index, 'number');
      if (typeof index !== 'number') throw new Error('Invalid fixture index.');
      const values = [...basePermission]; values[index] = value;
      assert.equal((await client.query(permissionSql, values)).rows[0]?.payload, null);
    }
    for (const value of [null, 'null', '{}', '{"canonical_version":2,"payload_kind":"REVISION_CONTENT"}'])
      assert.equal((await client.query('SELECT nutrasa.catalog_payload_digest_v1($1::jsonb) AS hash', [value])).rows[0]?.hash, null);
  });
  await isolated('status actor event and display metadata do not invalidate revision content but meaningful edits do', async () => {
    await client.query("UPDATE nutrasa.food_revisions SET quality_status='PUBLISHED',published_at=now() WHERE id=$1", [ids.revision]);
    await client.query("UPDATE nutrasa.foods SET canonical_name='Other display',updated_at=now() WHERE id=$1", [ids.food]);
    await client.query("UPDATE nutrasa.catalog_reviews SET actor_subject='OTHER_SYNTHETIC',reason='Other',recorded_at=now() WHERE id=$1", [ids.permission]);
    await matchVector('revision_null', revisionSql, [ids.revision, [ids.permission]]);
    await client.query("UPDATE nutrasa.food_revisions SET source_record_reference='Changed',source_reference_snapshot='Changed' WHERE id=$1", [ids.revision]);
    const after = (await client.query(revisionSql, [ids.revision, [ids.permission]])).rows[0]?.payload;
    const vector = vectors.find(vector => vector.name === 'revision_null'); assert.ok(vector);
    assert.notDeepEqual(after, JSON.parse(vector.text));
    // Migrator bypass is expected: this package adds calculation, not immutability or authorization.
  });
  await isolated('prior permission digest changes and revision batch provenance change canonical content', async () => {
    const baseline = (await client.query(revisionSql, [ids.revision, [ids.permission]])).rows[0]?.payload;
    await client.query('UPDATE nutrasa.catalog_reviews SET content_digest=$1 WHERE id=$2', ['d'.repeat(64), ids.permission]);
    assert.notDeepEqual((await client.query(revisionSql, [ids.revision, [ids.permission]])).rows[0]?.payload, baseline);
    await client.query('UPDATE nutrasa.catalog_reviews SET content_digest=$1 WHERE id=$2', ['a'.repeat(64), ids.permission]);
    const batch = (await client.query<{ id: string }>(`INSERT INTO nutrasa.catalog_import_batches
      (source_id,permission_review_id,artifact_reference,artifact_sha256,parser_version,mapping_version,
        actor_subject,outcome,accepted_revision_count,rejected_record_count,result_reference)
      VALUES($1,$2,'SYNTHETIC',$3,'SYNTHETIC','SYNTHETIC','SYNTHETIC','IMPORTED',0,0,'SYNTHETIC') RETURNING id`,
    [ids.source, ids.permission, 'e'.repeat(64)])).rows[0];
    assert.ok(batch);
    await client.query('UPDATE nutrasa.food_revisions SET import_batch_id=$1 WHERE id=$2', [batch.id, ids.revision]);
    assert.notDeepEqual((await client.query(revisionSql, [ids.revision, [ids.permission]])).rows[0]?.payload, baseline);
    // These synthetic rows are rolled back; effective permission belongs to a future writer gate.
  });
  await scenario('helper calls leave protected rows unchanged and do not record reviews or authorize rejected permissions', async () => {
    await client.query('BEGIN READ ONLY');
    try {
      await matchVector('revision_null', revisionSql, [ids.revision, [ids.permission]]);
      await matchVector('permission_nulls', permissionSql, basePermission);
      await preserved();
    } finally { await client.query('ROLLBACK'); }
  });
  await scenario('DOWN removes only helpers and preserves populated audit history and immutable baseline', async () => {
    await migrate('down'); assert.deepEqual(await functions(), []);
    await expectState(history.slice(0, 6), 7); await preserved(); await assertLockReleased(observer);
  });
  await scenario('identical UP and rerun restore helpers ACL and all seven checksums without changing domains', async () => {
    await migrate('up'); assert.deepEqual(await migrate('up'), []);
    assert.equal((await functions()).length, 3);
    assert.ok((await functions()).every(row => row.invoker && !row.public_execute));
    await expectState(history, 7); await preserved(); await assertLockReleased(observer);
  });
});
