import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import { governanceLock } from '../../src/governance-contract.ts';
import { assertLockReleased, createMigrationHarness } from './harness.ts';
import { readCatalogPreflightEnvironment } from './catalog-preflight-guard.ts';
import { verifyGovernanceAdmin } from './governance-environment.ts';

interface SourceFacts {
  source_id: string;
  permission_review_id: string | null;
  latest_decision_accepted: boolean;
  license_allowed: boolean;
  permission_scope: unknown;
  source_digest_matches: boolean;
  valid_from_reached: boolean | null;
  valid_until_strictly_future: boolean | null;
}
interface Facts extends Record<string, unknown> {
  current_content_digest: string | null;
  sources: SourceFacts[];
}

// No test executes on import outside this opt-in file. Fixtures do not authorize real publication.
test('internal catalog facts and fixture lock protocol on a separately approved fresh target', { timeout: 180000 }, async t => {
  const config = readCatalogPreflightEnvironment(process.env);
  const { client, observer, directory, migrate, bootstrap, expectState, scenario } = await createMigrationHarness(t);
  const admin = new Client({ connectionString: config.adminUrl, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  admin.on('error', () => {}); t.after(() => admin.end()); await admin.connect();
  await verifyGovernanceAdmin(admin, config);
  const caller = new Client({ connectionString: config.writerUrl, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  caller.on('error', () => {}); t.after(() => caller.end()); await caller.connect();
  const history = ['0001_identity','0002_food_sources','0003_food_catalog','0004_food_taxonomy',
    '0005_food_servings_provenance','0006_catalog_audit','0007_catalog_digest','0008_catalog_capabilities','0009_catalog_capability_writer'];
  const name = '0010_catalog_preflight';
  const signatures = ['catalog_revision_content_mutable_v1(uuid[])','catalog_category_parent_valid_v1(uuid,uuid)','catalog_publication_preflight_v1(uuid)'];
  const ids = { source: randomUUID(), otherSource: randomUUID(), food: randomUUID(), revision: randomUUID(),
    otherRevision: randomUUID(), serving: randomUUID(), a: randomUUID(), b: randomUUID(), c: randomUUID() };
  let permissionId = ''; let nutritionId = '';
  const copy = async (file: string) => writeFile(join(directory, file + '.sql'), await readFile(new URL('../../migrations/' + file + '.sql', import.meta.url)));
  const facts = async (revision = ids.revision) => {
    const value = (await client.query<{ facts: Facts | null }>('SELECT nutrasa.catalog_publication_preflight_v1($1) AS facts', [revision])).rows[0]?.facts;
    assert.ok(value); return value;
  };
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ['app_users','food_sources','foods','food_revisions','food_revision_nutrients',
      'serving_definitions','categories','food_categories','food_aliases','catalog_reviews',
      'catalog_review_sources','catalog_import_batches','catalog_capability_events','catalog_capability_assignments']) {
      result[table] = (await client.query(`SELECT to_jsonb(t)::text AS data FROM nutrasa.${table} t ORDER BY 1`)).rows;
    }
    return result;
  };
  const isolated = (label: string, execute: () => Promise<void>) => scenario(label, async () => {
    const before = await snapshot(); await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', [...governanceLock]);
      await execute();
    } finally { await client.query('ROLLBACK'); }
    assert.deepEqual(await snapshot(), before);
  });
  const permission = async (source = ids.source, decision = 'ACCEPTED', options: {
    scope?: Record<string, boolean>; from?: string; until?: string | null;
  } = {}) => {
    const id = randomUUID();
    await client.query(`WITH payload AS (
      SELECT nutrasa.catalog_source_permission_payload_v1($3,'ALLOWED',$4::jsonb,false,NULL,$5::timestamptz,$6::timestamptz,'SYNTHETIC evidence only',NULL) AS value
    ) INSERT INTO nutrasa.catalog_reviews
      (id,review_kind,decision,source_id,actor_subject,reason,canonical_version,content_digest,
       source_snapshot,license_status,permission_scope,attribution_required,valid_from,valid_until,evidence_reference)
      SELECT $1,'SOURCE_PERMISSION',$2,$3,'SYNTHETIC_NOT_A_REAL_REVIEWER','Synthetic fixture',1,
        nutrasa.catalog_payload_digest_v1(value),value->'source_snapshot','ALLOWED',$4::jsonb,false,$5,$6,'SYNTHETIC evidence only'
      FROM payload`, [id, decision, source, options.scope ?? { store: true, redistribute: true, offline_cache: true },
      options.from ?? '2000-01-01T00:00:00Z', options.until ?? null]);
    return id;
  };
  const nutrition = async (decision = 'ACCEPTED', permissions = [permissionId]) => {
    const id = randomUUID();
    await client.query(`INSERT INTO nutrasa.catalog_reviews
      (id,review_kind,decision,food_revision_id,actor_subject,reason,evidence_reference,canonical_version,content_digest)
      VALUES($1,'NUTRITION',$2,$3,'SYNTHETIC_NOT_A_REAL_REVIEWER','Synthetic fixture','SYNTHETIC evidence only',1,
        nutrasa.catalog_payload_digest_v1(nutrasa.catalog_revision_payload_v1($3,$4::uuid[])))`, [id, decision, ids.revision, permissions]);
    await client.query(`INSERT INTO nutrasa.catalog_review_sources(review_id,source_id,permission_review_id)
      SELECT $1,source_id,id FROM nutrasa.catalog_reviews WHERE id=ANY($2::uuid[])`, [id, permissions]);
    return id;
  };
  const publishedFixture = async () => {
    const digest = (await facts()).current_content_digest; assert.ok(digest);
    await client.query("UPDATE nutrasa.food_revisions SET quality_status='PUBLISHED',published_at=clock_timestamp() WHERE id=$1", [ids.revision]);
    await client.query("UPDATE nutrasa.foods SET publication_status='PUBLISHED',current_published_revision_id=$1 WHERE id=$2", [ids.revision,ids.food]);
    await client.query(`INSERT INTO nutrasa.catalog_reviews
      (review_kind,decision,food_revision_id,actor_subject,reason,canonical_version,content_digest,approval_review_id)
      VALUES('PUBLICATION','ACCEPTED',$1,'SYNTHETIC_NOT_A_REAL_PUBLISHER','Synthetic fixture',1,$2,$3)`, [ids.revision,digest,nutritionId]);
  };

  await scenario('fresh guard and actual historical 0001-0009 precede candidate DDL', async () => {
    const row = (await admin.query(`SELECT
      NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations'))
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations'))
      AND NOT EXISTS(SELECT 1 FROM pg_type y JOIN pg_namespace n ON n.oid=y.typnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AS fresh`)).rows[0];
    assert.equal(row?.fresh, true); await bootstrap();
    for (const file of history) await copy(file);
    await migrate('up'); await expectState(history,9);
    // Schema visibility only for negative ACL tests, no helper EXECUTE or table/column privileges.
    await admin.query(`GRANT USAGE ON SCHEMA nutrasa TO ${config.writerRole}`);
  });
  await scenario('failure after actual candidate DDL rolls back helper ACL history and checksum', async () => {
    await copy(name);
    await writeFile(join(directory,'0011_failure.sql'), await readFile(new URL('./fixtures/catalog-preflight/0011_failure.sql',import.meta.url)));
    await assert.rejects(migrate('up'), { code: '22012' }); await expectState(history,9);
    for (const signature of signatures) assert.equal((await client.query('SELECT to_regprocedure($1) IS NULL AS absent',['nutrasa.'+signature])).rows[0]?.absent,true);
    await assertLockReleased(observer); await rm(join(directory,'0011_failure.sql'));
  });
  await scenario('inherited nonowner defaults are rejected before any helper activates', async () => {
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa GRANT EXECUTE ON FUNCTIONS TO ${config.writerRole}`);
    await assert.rejects(migrate('up'), { code: '22012' }); await expectState(history,9);
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa REVOKE EXECUTE ON FUNCTIONS FROM ${config.writerRole}`);
  });
  await scenario('UP installs only three closed stable invoker functions with fixed paths', async () => {
    const before = await snapshot(); await migrate('up'); await expectState([...history,name],10); assert.deepEqual(await snapshot(),before);
    for (const signature of signatures) {
      const row = (await admin.query(`SELECT NOT prosecdef AS invoker,provolatile,proconfig,proowner=$2::regrole AS owned,
        NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a WHERE a.grantee<>proowner) AS closed
        FROM pg_proc WHERE oid=to_regprocedure($1)`, ['nutrasa.'+signature,config.migrator.role])).rows[0];
      assert.equal(row?.invoker,true); assert.equal(row?.provolatile,'s'); assert.equal(row?.owned,true); assert.equal(row?.closed,true);
      assert.deepEqual(row?.proconfig,['search_path=pg_catalog, pg_temp']);
    }
  });
  await scenario('synthetic complete content uses native digest and exact source/review links without authority', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
      for (const source of [ids.source,ids.otherSource]) await client.query(`INSERT INTO nutrasa.food_sources
        (id,name,source_type,reference,license_status) VALUES($1,'SYNTHETIC','SYNTHETIC','SYNTHETIC bibliography','ALLOWED')`,[source]);
      await client.query(`INSERT INTO nutrasa.foods(id,canonical_name,normalized_name,food_type,publication_status)
        VALUES($1,'SYNTHETIC','synthetic','SYNTHETIC','APPROVED')`,[ids.food]);
      for (const [revision,number] of [[ids.revision,1],[ids.otherRevision,2]]) await client.query(`INSERT INTO nutrasa.food_revisions
        (id,food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method,quality_status,source_record_reference,source_reference_snapshot)
        VALUES($1,$2,$3,$4,100,'g','SYNTHETIC','SYNTHETIC','REVIEWED','SYNTHETIC record','SYNTHETIC reference')`,[revision,ids.food,number,ids.source]);
      const codes=['energy_kcal','protein_g','carbohydrate_g','fat_g','fiber_g','sugar_g','saturated_fat_g','trans_fat_g','cholesterol_mg','sodium_mg','potassium_mg'];
      for (const [index,code] of codes.entries()) await client.query('INSERT INTO nutrasa.food_revision_nutrients VALUES($1,$2,$3)',[ids.revision,code,index<4?'0.00000':null]);
      permissionId=await permission(); nutritionId=await nutrition();
      for (const [category,parent] of [[ids.a,null],[ids.b,ids.a],[ids.c,ids.b]]) await client.query(`INSERT INTO nutrasa.categories
        (id,parent_id,slug,name,sort_order,is_active) VALUES($1::uuid,$2::uuid,($1::uuid)::text,'SYNTHETIC',0,true)`,[category,parent]);
      await client.query('COMMIT');
    } catch(error: unknown) { await client.query('ROLLBACK'); throw error; }
    const value=await facts();
    for (const key of ['all_nutrient_rows_present','core_nutrients_known','composition_provenance_present','all_servings_reviewed',
      'latest_nutrition_accepted','nutrition_digest_matches','nutrition_sources_match_latest','content_mutable']) assert.equal(value[key],true,key);
    assert.equal(value.sources.length,1); assert.equal(value.sources[0]?.source_digest_matches,true);
    assert.equal(value.assessment_kind,'CATALOG_STRUCTURAL_PREFLIGHT_V1'); assert.equal('eligible' in value,false);
  });
  await isolated('NULL core missing rows and missing provenance are separate negative facts', async () => {
    await client.query("UPDATE nutrasa.food_revision_nutrients SET value=NULL WHERE food_revision_id=$1 AND nutrient_code='energy_kcal'",[ids.revision]);
    assert.equal((await facts()).core_nutrients_known,false); assert.equal((await facts()).all_nutrient_rows_present,true);
    await client.query("DELETE FROM nutrasa.food_revision_nutrients WHERE food_revision_id=$1 AND nutrient_code='sugar_g'",[ids.revision]);
    assert.equal((await facts()).all_nutrient_rows_present,false);
    await client.query('UPDATE nutrasa.food_revisions SET source_record_reference=NULL,source_reference_snapshot=NULL WHERE id=$1',[ids.revision]);
    assert.equal((await facts()).composition_provenance_present,false);
  });
  await isolated('current permission digest rejects changed source metadata and uses latest rejected/revoked events', async () => {
    await client.query("UPDATE nutrasa.food_sources SET reference='SYNTHETIC changed' WHERE id=$1",[ids.source]);
    assert.equal((await facts()).sources[0]?.source_digest_matches,false);
    for (const decision of ['REJECTED','REVOKED']) {
      const latest=await permission(ids.source,decision); const value=await facts();
      assert.equal(value.sources[0]?.permission_review_id,latest); assert.equal(value.sources[0]?.latest_decision_accepted,false);
      assert.equal(value.nutrition_sources_match_latest,false); assert.equal(value.nutrition_digest_matches,false);
    }
  });
  await isolated('scope and expired future or unbounded dates are facts rather than fabricated legal approval', async () => {
    await permission(ids.source,'ACCEPTED',{ scope:{store:true,redistribute:false,offline_cache:false},until:'2001-01-01T00:00:00Z' });
    let source=(await facts()).sources[0]; assert.ok(source);
    assert.deepEqual(source.permission_scope,{store:true,redistribute:false,offline_cache:false}); assert.equal(source.valid_until_strictly_future,false);
    await permission(ids.source,'ACCEPTED',{from:'9999-01-01T00:00:00Z'});
    source=(await facts()).sources[0]; assert.ok(source); assert.equal(source.valid_from_reached,false); assert.equal(source.valid_until_strictly_future,null);
  });
  await isolated('nutrition freshness binds meaningful content and never falls back to accepted before rejection', async () => {
    await client.query("UPDATE nutrasa.food_revision_nutrients SET value=1 WHERE food_revision_id=$1 AND nutrient_code='energy_kcal'",[ids.revision]);
    assert.equal((await facts()).nutrition_digest_matches,false);
    const rejected=await nutrition('REJECTED'); const value=await facts();
    assert.equal(value.nutrition_review_id,rejected); assert.equal(value.latest_nutrition_accepted,false); assert.equal(value.nutrition_digest_matches,true);
    await nutrition('REVOKED'); assert.equal((await facts()).latest_nutrition_accepted,false);
  });
  await isolated('serving sources require exact review links and stale serving provenance changes digest', async () => {
    await client.query(`INSERT INTO nutrasa.serving_definitions
      (id,food_revision_id,label,base_quantity,method,reviewed,sort_order,source_id,source_record_reference,source_reference_snapshot)
      VALUES($1,$2,'SYNTHETIC',1,'SYNTHETIC',false,0,$3,'SYNTHETIC record','SYNTHETIC reference')`,[ids.serving,ids.revision,ids.otherSource]);
    assert.equal((await facts()).all_servings_reviewed,false); assert.equal((await facts()).current_content_digest,null);
    const second=await permission(ids.otherSource); await client.query('UPDATE nutrasa.serving_definitions SET reviewed=true WHERE id=$1',[ids.serving]);
    await nutrition('ACCEPTED',[permissionId,second]); assert.equal((await facts()).nutrition_sources_match_latest,true); assert.equal((await facts()).nutrition_digest_matches,true);
    await client.query("UPDATE nutrasa.serving_definitions SET source_record_reference='SYNTHETIC changed' WHERE id=$1",[ids.serving]);
    assert.equal((await facts()).nutrition_digest_matches,false);
  });
  await isolated('mutability facts reject both child endpoints and historical publication even after privileged downgrade', async () => {
    await publishedFixture();
    for (const revisions of [[ids.revision],[ids.otherRevision,ids.revision],[ids.revision,ids.otherRevision],[randomUUID()],[null],[]]) {
      assert.equal((await client.query('SELECT nutrasa.catalog_revision_content_mutable_v1($1::uuid[]) AS mutable',[revisions])).rows[0]?.mutable,false);
    }
    assert.equal((await facts()).content_mutable,false);
    await client.query("UPDATE nutrasa.foods SET publication_status='ARCHIVED',current_published_revision_id=NULL WHERE id=$1",[ids.food]);
    await client.query("UPDATE nutrasa.food_revisions SET quality_status='DRAFT',published_at=NULL WHERE id=$1",[ids.revision]);
    assert.equal((await facts()).content_mutable,false);
    assert.equal((await client.query('SELECT nutrasa.catalog_revision_content_mutable_v1($1::uuid[]) AS mutable',[[ids.otherRevision]])).rows[0]?.mutable,true);
    // Migrator fixture CAN alter rows: the helper itself is not a trigger or protected writer.
  });
  await scenario('unprivileged service cannot publish mutate published children or audit or escalate privileges', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
      await publishedFixture(); await client.query('COMMIT');
    } catch(error: unknown) { await client.query('ROLLBACK'); throw error; }
    const before=await snapshot();
    for (const sql of [
      `UPDATE nutrasa.food_revisions SET source_record_reference='unsafe' WHERE id='${ids.revision}'`,
      `UPDATE nutrasa.food_revision_nutrients SET value=1 WHERE food_revision_id='${ids.revision}'`,
      `INSERT INTO nutrasa.food_revision_nutrients VALUES('${ids.otherRevision}','energy_kcal',0)`,
      `DELETE FROM nutrasa.food_revision_nutrients WHERE food_revision_id='${ids.revision}'`,
      `UPDATE nutrasa.serving_definitions SET food_revision_id='${ids.revision}' WHERE food_revision_id='${ids.otherRevision}'`,
      'DELETE FROM nutrasa.serving_definitions','UPDATE nutrasa.catalog_reviews SET reason=reason',
      'DELETE FROM nutrasa.catalog_reviews','TRUNCATE nutrasa.catalog_reviews',
      'UPDATE nutrasa.catalog_review_sources SET permission_review_id=permission_review_id',
      "UPDATE nutrasa.foods SET publication_status='PUBLISHED'",'CREATE TEMP TABLE it_forbidden(id integer)',
      `SET ROLE ${config.executorRole}`,`SET ROLE ${config.migrator.role}`,
      "SELECT nutrasa.catalog_publication_preflight_v1(NULL)",
    ]) await assert.rejects(caller.query(sql),{code:'42501'});
    assert.deepEqual(await snapshot(),before);
    // These are broad service ACL denials, not state-aware enforcement for an authorized editorial writer.
  });
  await isolated('category facts reject self missing descendant and already cyclic ancestors', async () => {
    for (const [category,parent,expected] of [[ids.a,ids.c,false],[ids.a,ids.a,false],[ids.c,ids.a,true],[ids.a,null,true],[randomUUID(),null,false],[ids.a,randomUUID(),false]]) {
      assert.equal((await client.query('SELECT nutrasa.catalog_category_parent_valid_v1($1,$2) AS valid',[category,parent])).rows[0]?.valid,expected);
    }
    await client.query('UPDATE nutrasa.categories SET parent_id=$1 WHERE id=$2',[ids.c,ids.a]);
    assert.equal((await client.query('SELECT nutrasa.catalog_category_parent_valid_v1($1,$2) AS valid',[ids.c,ids.a])).rows[0]?.valid,false);
  });
  await scenario('fixture-only locked reparent protocol rechecks after waiting and prevents opposing cycle', async () => {
    const x=randomUUID(),y=randomUUID();
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
    await client.query("INSERT INTO nutrasa.categories(id,slug,name,sort_order,is_active) VALUES($1::uuid,($1::uuid)::text,'SYNTHETIC',0,true),($2::uuid,($2::uuid)::text,'SYNTHETIC',0,true)",[x,y]);await client.query('COMMIT');
    const first=new Client({connectionString:config.migrator.connectionString,ssl:false,statement_timeout:10000});
    const second=new Client({connectionString:config.migrator.connectionString,ssl:false,statement_timeout:10000});
    t.after(()=>first.end());t.after(()=>second.end());await first.connect();await second.connect();
    const pids=[(await first.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,(await second.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid];
    const reparent=async (connection:Client,category:string,parent:string) => {
      await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {
        await connection.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
        const valid=(await connection.query('SELECT nutrasa.catalog_category_parent_valid_v1($1,$2) AS valid',[category,parent])).rows[0]?.valid;
        assert.equal(typeof valid,'boolean');
        if(valid) await connection.query('UPDATE nutrasa.categories SET parent_id=$1 WHERE id=$2',[parent,category]);
        await connection.query('COMMIT');return valid;
      }catch(error:unknown){await connection.query('ROLLBACK');throw error;}
    };
    await observer.query('BEGIN');await observer.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
    const pending=[reparent(first,x,y),reparent(second,y,x)].map(p=>p.then(value=>({value}),(error:unknown)=>({error})));
    let waiting=false;
    for(let i=0;i<100;i++){
      const row=(await observer.query("SELECT count(*)::text AS count FROM pg_locks WHERE pid=ANY($1::integer[]) AND locktype='advisory' AND NOT granted",[pids])).rows[0];
      if(row?.count==='2'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waiting,true);await observer.query('COMMIT');const results=await Promise.all(pending);
    const values=results.map(result=>{if('error' in result)throw result.error;return result.value;});assert.equal(values.filter(Boolean).length,1);
    await observer.query('BEGIN');assert.equal((await observer.query('SELECT pg_try_advisory_xact_lock($1,$2) AS free',[...governanceLock])).rows[0]?.free,true);await observer.query('ROLLBACK');
    // Production taxonomy authority/entrypoint is deliberately absent; this proves only the fixture lock protocol.
  });
  await isolated('unknown revisions return SQL NULL and caller search path cannot redirect facts', async () => {
    assert.equal((await client.query('SELECT nutrasa.catalog_publication_preflight_v1($1) AS facts',[randomUUID()])).rows[0]?.facts,null);
    // Assessment time belongs to each statement, not to the invariant content being compared.
    const compare=async ()=>(await client.query("SELECT nutrasa.catalog_publication_preflight_v1($1) - 'assessed_at' AS facts",[ids.revision])).rows[0]?.facts;
    const before=await compare();await client.query('SET LOCAL search_path=pg_temp, public');const after=await compare();
    assert.deepEqual(after,before);
  });
  await scenario('populated domain and audit survive DOWN and identical UP with ten immutable baselines', async () => {
    const before=await snapshot();await migrate('down');await expectState(history,10);assert.deepEqual(await snapshot(),before);
    await migrate('up');await expectState([...history,name],10);assert.deepEqual(await snapshot(),before);await assertLockReleased(observer);
    assert.equal((await facts()).nutrition_digest_matches,true);
    await assert.rejects(caller.query('SELECT nutrasa.catalog_publication_preflight_v1($1)',[ids.revision]),{code:'42501'});
  });
});
