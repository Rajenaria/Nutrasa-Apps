import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import { assertLockReleased, createMigrationHarness } from './harness.ts';
import { readCatalogLineageEnvironment } from './catalog-lineage-guard.ts';
import { verifyGovernanceAdmin } from './governance-environment.ts';

const history = ['0001_identity','0002_food_sources','0003_food_catalog','0004_food_taxonomy',
  '0005_food_servings_provenance','0006_catalog_audit','0007_catalog_digest','0008_catalog_capabilities',
  '0009_catalog_capability_writer','0010_catalog_preflight'];
const name = '0011_catalog_lineage';
const table = 'catalog_revision_lineage_events';
const columns = ['id','event_number','food_revision_id','actor_subject_id','event_kind','previous_event_id',
  'serving_id','nutrient_code','other_revision_id','origin_event_id','request_id','reason','recorded_at'];

// Migrator fixtures prove structural constraints only; there is no privileged content/review writer here.
test('catalog lineage structure and guarded lifecycle on a separately approved fresh target', { timeout: 180000 }, async t => {
  const config = readCatalogLineageEnvironment(process.env);
  const { client, observer, directory, bootstrap, migrate, scenario, expectState, tableExists } = await createMigrationHarness(t);
  const admin = new Client({ connectionString: config.adminUrl, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  admin.on('error', () => {}); t.after(() => admin.end()); await admin.connect();
  await verifyGovernanceAdmin(admin, config);
  const copy = async (file: string) => writeFile(join(directory,file+'.sql'), await readFile(new URL('../../migrations/'+file+'.sql',import.meta.url)));
  const ids = { actor: randomUUID(), reviewer: randomUUID(), source: randomUUID(), food: randomUUID(), otherFood: randomUUID(),
    revision: randomUUID(), otherRevision: randomUUID(), crossFoodRevision: randomUUID(), serving: randomUUID(),
    permission: randomUUID(), review: randomUUID(), batch: randomUUID() };
  const actorText = 'app_users:' + ids.actor;
  const root = async (changes: Record<string, unknown> = {}) => {
    const values = { food_revision_id: ids.revision, actor_subject_id: ids.actor,
      event_kind: 'CREATE_REVISION', request_id: randomUUID(), reason: 'SYNTHETIC lineage only', ...changes };
    const keys = Object.keys(values);
    const row = (await client.query<{ id: string; event_number: string }>(
      `INSERT INTO nutrasa.${table} (${keys.join(',')}) ` + (keys.includes('event_number') ? 'OVERRIDING SYSTEM VALUE ' : '') +
      'VALUES (' + keys.map((_,i)=>'$'+(i+1)).join(',') + ') RETURNING id,event_number', Object.values(values))).rows[0];
    assert.ok(row); return row;
  };
  const next = (previous: string, changes: Record<string, unknown> = {}) => root({ event_kind: 'UPDATE_REVISION', previous_event_id: previous, ...changes });
  const rejected = async (execute: () => Promise<unknown>, code: string) => {
    await client.query('SAVEPOINT expected_failure');
    try { await assert.rejects(execute, { code }); }
    finally { await client.query('ROLLBACK TO SAVEPOINT expected_failure'); await client.query('RELEASE SAVEPOINT expected_failure'); }
  };
  const isolated = (label: string, execute: () => Promise<void>) => scenario(label, async () => {
    await client.query('BEGIN');
    try { await execute(); } finally { await client.query('ROLLBACK'); }
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM nutrasa.${table}`)).rows[0]?.count,'0');
  });
  const snapshot = async () => {
    const rows: Record<string, unknown> = {};
    const names = (await client.query<{ name: string }>("SELECT tablename::text AS name FROM pg_catalog.pg_tables WHERE schemaname='nutrasa' AND tablename<>$1 ORDER BY tablename",[table])).rows;
    for (const { name } of names) {
      const expression = name === 'catalog_reviews' ? "to_jsonb(t)-'actor_subject_id'-'lineage_event_id'" :
        name === 'catalog_import_batches' ? "to_jsonb(t)-'actor_subject_id'" : 'to_jsonb(t)';
      rows[name] = (await client.query(`SELECT (${expression})::text AS row FROM nutrasa.${name} t ORDER BY 1`)).rows;
    }
    const functions = (await admin.query("SELECT p.oid::text,pg_get_functiondef(p.oid) AS definition,p.proowner::text,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='nutrasa' ORDER BY p.oid")).rows;
    return { rows, functions };
  };
  const digest = async () => (await client.query('SELECT nutrasa.catalog_revision_payload_v1($1,$2::uuid[]) AS payload, nutrasa.catalog_payload_digest_v1(nutrasa.catalog_revision_payload_v1($1,$2::uuid[])) AS hash', [ids.revision,[ids.permission]])).rows[0];

  await scenario('fresh guard bootstrap actual 0001-0010 and retain unbound historical audit before upgrade', async () => {
    assert.equal((await admin.query(`SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AND NOT EXISTS(SELECT 1 FROM pg_type y JOIN pg_namespace n ON n.oid=y.typnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AS fresh`)).rows[0]?.fresh,true);
    await bootstrap(); for (const file of history) await copy(file); await migrate('up'); await expectState(history,10);
    await client.query('BEGIN');
    try {
      for (const id of [ids.actor,ids.reviewer]) await client.query("INSERT INTO nutrasa.app_users(id,firebase_uid,account_status) VALUES($1,$2,'ACTIVE')",[id,'SYNTHETIC_'+id]);
      await client.query("INSERT INTO nutrasa.food_sources(id,name,source_type,reference,license_status) VALUES($1,'SYNTHETIC','SYNTHETIC','SYNTHETIC','UNVERIFIED')",[ids.source]);
      for (const id of [ids.food,ids.otherFood]) await client.query("INSERT INTO nutrasa.foods(id,canonical_name,normalized_name,food_type,publication_status) VALUES($1,'SYNTHETIC','synthetic','SYNTHETIC','DRAFT')",[id]);
      for (const [id,food,number] of [[ids.revision,ids.food,1],[ids.otherRevision,ids.food,2],[ids.crossFoodRevision,ids.otherFood,1]]) {
        await client.query(`INSERT INTO nutrasa.food_revisions(id,food_id,revision_number,source_id,basis_quantity,basis_unit,composition_definition,source_method,quality_status)
          VALUES($1,$2,$3,$4,100,'g','SYNTHETIC','SYNTHETIC','DRAFT')`,[id,food,number,ids.source]);
      }
      await client.query("INSERT INTO nutrasa.food_revision_nutrients VALUES($1,'energy_kcal',0),($1,'sugar_g',NULL)",[ids.revision]);
      await client.query(`INSERT INTO nutrasa.serving_definitions(id,food_revision_id,label,base_quantity,method,reviewed,sort_order,source_id,source_record_reference,source_reference_snapshot)
        VALUES($1,$2,'SYNTHETIC',1,'SYNTHETIC',false,0,$3,'SYNTHETIC','SYNTHETIC')`,[ids.serving,ids.revision,ids.source]);
      await client.query(`INSERT INTO nutrasa.catalog_reviews(id,review_kind,decision,source_id,actor_subject,reason,canonical_version,content_digest,source_snapshot,license_status,evidence_reference)
        VALUES($1,'SOURCE_PERMISSION','REJECTED',$2,'HISTORICAL_SYNTHETIC_UNBOUND','SYNTHETIC',1,$3,'{}'::jsonb,'UNVERIFIED','SYNTHETIC')`,[ids.permission,ids.source,'0'.repeat(64)]);
      await client.query(`INSERT INTO nutrasa.catalog_reviews(id,review_kind,decision,food_revision_id,actor_subject,reason,canonical_version,content_digest,evidence_reference)
        VALUES($1,'NUTRITION','REJECTED',$2,'HISTORICAL_SYNTHETIC_UNBOUND','SYNTHETIC',1,$3,'SYNTHETIC')`,[ids.review,ids.revision,'0'.repeat(64)]);
      await client.query(`INSERT INTO nutrasa.catalog_import_batches(id,source_id,permission_review_id,artifact_reference,artifact_sha256,parser_version,mapping_version,actor_subject,outcome,accepted_revision_count,rejected_record_count,result_reference)
        VALUES($1,$2,$3,'SYNTHETIC',$4,'SYNTHETIC','SYNTHETIC','HISTORICAL_SYNTHETIC_UNBOUND','REJECTED',0,0,'SYNTHETIC')`,[ids.batch,ids.source,ids.permission,'0'.repeat(64)]);
      await client.query('COMMIT');
    } catch (error: unknown) { await client.query('ROLLBACK'); throw error; }
  });
  const before = await snapshot(); const beforeDigest = await digest(); assert.ok(beforeDigest?.hash);
  const preserved = async () => { assert.deepEqual(await snapshot(),before); assert.deepEqual(await digest(),beforeDigest); };

  await scenario('failure after actual lineage DDL rolls back table sequence audit columns history and checksum', async () => {
    await copy(name); const failure=join(directory,'0012_failure.sql');
    await writeFile(failure,await readFile(new URL('./fixtures/catalog-lineage/0012_failure.sql',import.meta.url)));
    await assert.rejects(migrate('up'),{code:'22012'});
    assert.equal(await tableExists(table),false); assert.equal(await tableExists(table+'_event_number_seq'),false);
    assert.equal((await client.query("SELECT count(*)::text AS count FROM pg_attribute WHERE attrelid='nutrasa.catalog_reviews'::regclass AND attname IN ('actor_subject_id','lineage_event_id') AND NOT attisdropped")).rows[0]?.count,'0');
    await expectState(history,10); await preserved(); await assertLockReleased(observer); await rm(failure);
  });
  await scenario('unexpected inherited table ACL fails closed and rolls back candidate history and bindings',async()=>{
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa GRANT SELECT ON TABLES TO ${config.writerRole}`);
    await assert.rejects(migrate('up'),{code:'22012'});assert.equal(await tableExists(table),false);await expectState(history,10);await preserved();
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa REVOKE SELECT ON TABLES FROM ${config.writerRole}`);
    await assertLockReleased(observer);
  });
  await scenario('actual UP adds empty lineage and NULL audit bindings without backfill or native digest changes', async () => {
    await migrate('up'); await expectState([...history,name],11); await preserved();
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM nutrasa.${table}`)).rows[0]?.count,'0');
    assert.equal((await client.query('SELECT count(*)::text AS count FROM nutrasa.catalog_reviews WHERE actor_subject_id IS NOT NULL OR lineage_event_id IS NOT NULL')).rows[0]?.count,'0');
    assert.equal((await client.query('SELECT count(*)::text AS count FROM nutrasa.catalog_import_batches WHERE actor_subject_id IS NOT NULL')).rows[0]?.count,'0');
  });
  await scenario('exact thirteen columns defaults identity collations and three nullable audit columns match', async () => {
    const fields = (await client.query<{ name: string; type: string; required: boolean; identity: string; expression: string | null; collation: string | null }>(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity::text AS identity,pg_get_expr(d.adbin,d.adrelid) AS expression,c.collname::text AS collation FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation c ON c.oid=a.attcollation WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,['nutrasa.'+table])).rows;
    assert.deepEqual(fields.map(f=>f.name),columns);
    for (const f of fields) {
      assert.equal(f.type,f.name==='event_number'?'bigint':f.name==='recorded_at'?'timestamp with time zone':['event_kind','nutrient_code','reason'].includes(f.name)?'text':'uuid');
      assert.equal(f.required,!['previous_event_id','serving_id','nutrient_code','other_revision_id','origin_event_id'].includes(f.name));
      assert.equal(f.identity,f.name==='event_number'?'a':'');
      if(f.name==='id')assert.match(f.expression??'',/gen_random_uuid\(\)/);
      else if(f.name==='recorded_at')assert.match(f.expression??'',/clock_timestamp\(\)/);
      else assert.equal(f.expression,null);
      if(['event_kind','nutrient_code'].includes(f.name))assert.equal(f.collation,'C');
    }
    for(const [relation,names,count] of [['catalog_reviews',['actor_subject_id','lineage_event_id'],23],['catalog_import_batches',['actor_subject_id'],14]] as const){
      const all=(await client.query<{ name:string; type:string; required:boolean; expression:string|null }>(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS expression FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped`,['nutrasa.'+relation])).rows;
      assert.equal(all.length,count);
      for(const column of names){const field=all.find(f=>f.name===column);assert.ok(field);assert.equal(field.type,'uuid');assert.equal(field.required,false);assert.equal(field.expression,null);}
    }
  });
  await scenario('eight exact ordered RESTRICT foreign keys seven lineage indexes three audit indexes and fifteen CHECKs', async () => {
    const foreign=(await client.query<{ table_name:string; cols:string[]; parent:string; refs:string[]; del:string; upd:string; deferred:boolean; match:string }>(`SELECT c.conrelid::regclass::text AS table_name,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS cols,
      c.confrelid::regclass::text AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS refs,
      c.confdeltype::text AS del,c.confupdtype::text AS upd,c.condeferrable AS deferred,c.confmatchtype::text AS match
      FROM pg_constraint c WHERE c.contype='f' AND (c.conrelid=$1::regclass OR c.conname=ANY($2::text[]))`,['nutrasa.'+table,['catalog_reviews_actor_fkey','catalog_reviews_lineage_fkey','catalog_import_batches_actor_fkey']])).rows;
    assert.equal(foreign.length,8);
    const expected=[
      [table,['food_revision_id'],'food_revisions',['id']],[table,['actor_subject_id'],'app_users',['id']],
      [table,['food_revision_id','previous_event_id'],table,['food_revision_id','id']],
      [table,['other_revision_id'],'food_revisions',['id']],
      [table,['other_revision_id','origin_event_id'],table,['food_revision_id','id']],
      ['catalog_reviews',['actor_subject_id'],'app_users',['id']],
      ['catalog_reviews',['food_revision_id','lineage_event_id'],table,['food_revision_id','id']],
      ['catalog_import_batches',['actor_subject_id'],'app_users',['id']],
    ] as const;
    // regclass rendering depends on search_path; use suffix identity only after guarded schema proof.
    for(const [relation,cols,parent,refs] of expected)assert.ok(foreign.some(f=>f.table_name.replace(/^nutrasa\./,'')===relation&&f.parent.replace(/^nutrasa\./,'')===parent&&JSON.stringify(f.cols)===JSON.stringify(cols)&&JSON.stringify(f.refs)===JSON.stringify(refs)));
    for(const f of foreign){assert.equal(f.del,'r');assert.equal(f.upd,'r');assert.equal(f.deferred,false);assert.equal(f.match,'s');}
    const indexes=(await client.query<{ name:string; method:string; unique:boolean; cols:string[]; predicate:string|null }>(`SELECT c.relname::text AS name,am.amname::text AS method,i.indisunique AS unique,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS cols,pg_get_expr(i.indpred,i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam WHERE i.indrelid=$1::regclass OR c.relname=ANY($2::text[])`,['nutrasa.'+table,['catalog_reviews_actor_subject_idx','catalog_reviews_lineage_event_idx','catalog_import_batches_actor_subject_idx']])).rows;
    assert.equal(indexes.length,10);assert.ok(indexes.every(i=>i.method==='btree'));
    const expectedIndexes={
      catalog_revision_lineage_events_pkey:['id'],catalog_lineage_revision_id_key:['food_revision_id','id'],
      catalog_lineage_revision_number_key:['food_revision_id','event_number'],catalog_lineage_previous_key:['previous_event_id'],
      catalog_lineage_root_idx:['food_revision_id'],catalog_lineage_actor_idx:['actor_subject_id'],
      catalog_lineage_other_revision_idx:['other_revision_id'],catalog_reviews_actor_subject_idx:['actor_subject_id'],
      catalog_reviews_lineage_event_idx:['lineage_event_id'],catalog_import_batches_actor_subject_idx:['actor_subject_id'],
    };
    assert.deepEqual(indexes.map(i=>i.name).sort(),Object.keys(expectedIndexes).sort());
    for(const [indexName,cols] of Object.entries(expectedIndexes))assert.deepEqual(indexes.find(i=>i.name===indexName)?.cols,cols);
    assert.equal(indexes.filter(i=>i.unique).length,5);assert.equal(indexes.filter(i=>i.predicate!==null).length,2);
    assert.match(indexes.find(i=>i.name==='catalog_lineage_root_idx')?.predicate??'',/previous_event_id IS NULL/);
    assert.match(indexes.find(i=>i.name==='catalog_lineage_other_revision_idx')?.predicate??'',/other_revision_id IS NOT NULL/);
    assert.equal((await client.query("SELECT count(*)::text AS count FROM pg_constraint WHERE contype='c' AND (conrelid=$1::regclass OR conname=ANY($2::text[]))",['nutrasa.'+table,['catalog_reviews_actor_binding_check','catalog_reviews_lineage_context_check','catalog_reviews_lineage_required_check','catalog_import_batches_actor_binding_check']])).rows[0]?.count,'15');
    assert.equal((await client.query('SELECT count(*)::text AS count FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal',['nutrasa.'+table])).rows[0]?.count,'0');
  });
  await isolated('root uniqueness sequence defaults branching and same-revision predecessor are enforced',async()=>{
    const a=await root();const b=await root({food_revision_id:ids.otherRevision});
    assert.notEqual(a.id,b.id);assert.ok(BigInt(a.event_number)>0n);assert.ok(BigInt(b.event_number)>BigInt(a.event_number));
    await rejected(()=>root(),'23505');await rejected(()=>root({id:a.id,food_revision_id:ids.crossFoodRevision}),'23505');
    const edit=await next(a.id);await rejected(()=>next(a.id),'23505');
    await rejected(()=>next(b.id),'23503');await rejected(()=>next(randomUUID()),'23503');
    const self=randomUUID();await rejected(()=>next(self,{id:self}),'23514');
    await rejected(()=>next(edit.id,{event_number:a.event_number}),'23505');
    await rejected(()=>next(edit.id,{event_number:0}),'23514');
  });
  await isolated('required values event vocabulary locators and root shapes reject invalid combinations',async()=>{
    for(const column of ['id','event_number','food_revision_id','actor_subject_id','event_kind','request_id','reason','recorded_at'])await rejected(()=>root({[column]:null}),'23502');
    for(const reason of ['', ' \t\n'])await rejected(()=>root({reason}),'23514');
    for(const recorded_at of ['infinity','-infinity'])await rejected(()=>root({recorded_at}),'23514');
    await rejected(()=>root({event_kind:'create_revision'}),'23514');
    await rejected(()=>root({event_kind:'UPDATE_REVISION'}),'23514');
    await rejected(()=>root({serving_id:ids.serving}),'23514');
    const a=await root();
    for(const changes of [{event_kind:'INSERT_NUTRIENT'},{event_kind:'INSERT_SERVING'},
      {event_kind:'UPDATE_REVISION',nutrient_code:'energy_kcal'},
      {event_kind:'INSERT_NUTRIENT',nutrient_code:'invented'},
      {event_kind:'INSERT_SERVING',serving_id:ids.serving,nutrient_code:'energy_kcal'}])await rejected(()=>next(a.id,changes),'23514');
    // Each valid kind is exercised in its own transaction by the following matrix scenario.
  });
  await isolated('all ordinary child kinds retain locators even after serving deletion',async()=>{
    let event=await root();
    for(const event_kind of ['INSERT_NUTRIENT','UPDATE_NUTRIENT','DELETE_NUTRIENT'])event=await next(event.id,{event_kind,nutrient_code:'energy_kcal'});
    for(const event_kind of ['INSERT_SERVING','UPDATE_SERVING','DELETE_SERVING'])event=await next(event.id,{event_kind,serving_id:ids.serving});
    await client.query('DELETE FROM nutrasa.serving_definitions WHERE id=$1',[ids.serving]);
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM nutrasa.${table} WHERE serving_id=$1`,[ids.serving])).rows[0]?.count,'3');
  });
  await isolated('OUT IN origin binds source revision and NULL shapes cannot bypass composite foreign keys',async()=>{
    let a=await root();let b=await root({food_revision_id:ids.otherRevision});const c=await root({food_revision_id:ids.crossFoodRevision});
    for(const kind of ['NUTRIENT','SERVING']){
      const locator=kind==='NUTRIENT'?{nutrient_code:'energy_kcal'}:{serving_id:ids.serving};const request_id=randomUUID();
      const out=await next(a.id,{event_kind:'MOVE_'+kind+'_OUT',other_revision_id:ids.otherRevision,request_id,...locator});
      const incoming={event_kind:'MOVE_'+kind+'_IN',food_revision_id:ids.otherRevision,other_revision_id:ids.revision,origin_event_id:out.id,request_id,...locator};
      await rejected(()=>next(b.id,{...incoming,other_revision_id:null}),'23514');
      await rejected(()=>next(b.id,{...incoming,origin_event_id:null}),'23514');
      await rejected(()=>next(b.id,{...incoming,origin_event_id:c.id}),'23503');
      await rejected(()=>next(b.id,{...incoming,origin_event_id:randomUUID()}),'23503');
      await rejected(()=>next(b.id,{...incoming,other_revision_id:ids.otherRevision}),'23514');
      b=await next(b.id,incoming);a=out;
      assert.equal((await client.query(`SELECT origin_event_id FROM nutrasa.${table} WHERE id=$1`,[b.id])).rows[0]?.origin_event_id,out.id);
    }
  });
  await isolated('typed audit binding rejects fake subjects wrong actors revision mismatch and nullable context bypasses',async()=>{
    const a=await root();const b=await root({food_revision_id:ids.otherRevision});
    const bind=(actor:string|null,head:string|null,text=actorText)=>client.query('UPDATE nutrasa.catalog_reviews SET actor_subject_id=$1,lineage_event_id=$2,actor_subject=$3 WHERE id=$4',[actor,head,text,ids.review]);
    await rejected(()=>bind(randomUUID(),a.id,'app_users:'+randomUUID()),'23514');
    const missing=randomUUID();await rejected(()=>bind(missing,a.id,'app_users:'+missing),'23503');
    await rejected(()=>bind(ids.actor,b.id),'23503');await rejected(()=>bind(ids.actor,randomUUID()),'23503');await rejected(()=>bind(null,a.id),'23514');
    await rejected(()=>bind(ids.actor,a.id,'forged'),'23514');
    await rejected(()=>client.query("UPDATE nutrasa.catalog_reviews SET decision='ACCEPTED',actor_subject_id=$1,actor_subject=$2 WHERE id=$3",[ids.actor,actorText,ids.review]),'23514');
    await rejected(()=>client.query('UPDATE nutrasa.catalog_reviews SET actor_subject_id=$1,actor_subject=$2,lineage_event_id=$3 WHERE id=$4',[ids.actor,actorText,a.id,ids.permission]),'23514');
    await bind(ids.actor,a.id);await client.query("UPDATE nutrasa.catalog_reviews SET decision='ACCEPTED' WHERE id=$1",[ids.review]);
    // Migrator can bind the contributor itself: no independent-review or qualification enforcement exists yet.
    await rejected(()=>client.query(`INSERT INTO nutrasa.catalog_reviews(id,review_kind,decision,food_revision_id,actor_subject,reason,canonical_version,content_digest,evidence_reference,actor_subject_id,lineage_event_id)
      SELECT id,review_kind,decision,food_revision_id,actor_subject,reason,canonical_version,content_digest,evidence_reference,actor_subject_id,lineage_event_id FROM nutrasa.catalog_reviews WHERE id=$1`,[ids.review]),'23505');
    await client.query('UPDATE nutrasa.catalog_import_batches SET actor_subject_id=$1,actor_subject=$2 WHERE id=$3',[ids.actor,actorText,ids.batch]);
    await rejected(()=>client.query("UPDATE nutrasa.catalog_import_batches SET actor_subject='forged' WHERE id=$1",[ids.batch]),'23514');
    const other=randomUUID();await rejected(()=>client.query('UPDATE nutrasa.catalog_import_batches SET actor_subject_id=$1,actor_subject=$2 WHERE id=$3',[other,'app_users:'+other,ids.batch]),'23503');
    await preservedDigestOnly();
  });
  async function preservedDigestOnly(){assert.deepEqual(await digest(),beforeDigest);}
  await isolated('structural FK limits do not pretend to authenticate roots pair moves or reject cross-food movement',async()=>{
    const a=await root();const c=await root({food_revision_id:ids.crossFoodRevision});
    // Both revision FKs are valid even across foods. Only a future trusted writer can DENY this policy violation.
    const out=await next(a.id,{event_kind:'MOVE_SERVING_OUT',serving_id:ids.serving,other_revision_id:ids.crossFoodRevision});
    await next(c.id,{food_revision_id:ids.crossFoodRevision,event_kind:'MOVE_SERVING_IN',serving_id:ids.serving,
      other_revision_id:ids.revision,origin_event_id:out.id});
    // A structurally valid origin can even reference a root, not OUT; semantic pairing is NOT a FK guarantee.
    await next(out.id,{event_kind:'MOVE_SERVING_IN',serving_id:ids.serving,other_revision_id:ids.crossFoodRevision,origin_event_id:c.id});
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM nutrasa.${table}`)).rows[0]?.count,'5');
  });
  await isolated('referential RESTRICT protects actor revision predecessor origin and reviewed event history',async()=>{
    const a=await root();const b=await root({food_revision_id:ids.otherRevision});
    const out=await next(a.id,{event_kind:'MOVE_SERVING_OUT',serving_id:ids.serving,other_revision_id:ids.otherRevision});
    const incoming=await next(b.id,{food_revision_id:ids.otherRevision,event_kind:'MOVE_SERVING_IN',serving_id:ids.serving,other_revision_id:ids.revision,origin_event_id:out.id});
    await client.query('UPDATE nutrasa.catalog_reviews SET actor_subject_id=$1,actor_subject=$2,lineage_event_id=$3 WHERE id=$4',[ids.reviewer,'app_users:'+ids.reviewer,out.id,ids.review]);
    for(const id of [a.id,b.id,out.id]){
      await rejected(()=>client.query(`DELETE FROM nutrasa.${table} WHERE id=$1`,[id]),'23001');
      await rejected(()=>client.query(`UPDATE nutrasa.${table} SET id=$1 WHERE id=$2`,[randomUUID(),id]),'23001');
    }
    for(const id of [ids.actor,ids.reviewer]){
      await rejected(()=>client.query('DELETE FROM nutrasa.app_users WHERE id=$1',[id]),'23001');
      await rejected(()=>client.query('UPDATE nutrasa.app_users SET id=$1 WHERE id=$2',[randomUUID(),id]),'23001');
    }
    for(const id of [ids.revision,ids.otherRevision])await rejected(()=>client.query('DELETE FROM nutrasa.food_revisions WHERE id=$1',[id]),'23001');
    assert.equal((await client.query(`SELECT origin_event_id FROM nutrasa.${table} WHERE id=$1`,[incoming.id])).rows[0]?.origin_event_id,out.id);
  });
  await scenario('nonowner roles cannot mutate lineage audit or sequence and PUBLIC receives no object privileges',async()=>{
    const relations=['nutrasa.'+table,'nutrasa.'+table+'_event_number_seq'];
    assert.equal((await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault(c.relkind,c.relowner))) a WHERE c.oid=ANY($1::regclass[]) AND a.grantee<>c.relowner) AS extra`,[relations])).rows[0]?.extra,false);
    for(const url of [config.reader.connectionString,config.writerUrl]){
      const caller=new Client({connectionString:url,ssl:false,connectionTimeoutMillis:5000,statement_timeout:5000});caller.on('error',()=>{});
      try{await caller.connect();for(const sql of [`SELECT * FROM nutrasa.${table}`,`INSERT INTO nutrasa.${table}(reason) VALUES('unsafe')`,
        `UPDATE nutrasa.${table} SET reason=reason`,`DELETE FROM nutrasa.${table}`,`TRUNCATE nutrasa.${table}`,
        'UPDATE nutrasa.catalog_reviews SET actor_subject_id=actor_subject_id','DELETE FROM nutrasa.catalog_import_batches',
        `SELECT nextval('nutrasa.${table}_event_number_seq')`,'CREATE TEMP TABLE it_forbidden(id integer)',
        `SET ROLE ${config.migrator.role}`,`SET ROLE ${config.executorRole}`])await assert.rejects(caller.query(sql),{code:'42501'});
      }finally{await caller.end();}
    }
    await preserved();
  });
  await scenario('fault between OUT and IN rolls back fixture movement lineage and digest without a writer claim',async()=>{
    await client.query('BEGIN');
    try{
      const a=await root();await root({food_revision_id:ids.otherRevision});
      await client.query('UPDATE nutrasa.serving_definitions SET food_revision_id=$1 WHERE id=$2',[ids.otherRevision,ids.serving]);
      await next(a.id,{event_kind:'MOVE_SERVING_OUT',serving_id:ids.serving,other_revision_id:ids.otherRevision});
      await assert.rejects(client.query('SELECT 1 / 0'),{code:'22012'});
    }finally{await client.query('ROLLBACK');}
    await preserved();assert.equal((await client.query(`SELECT count(*)::text AS count FROM nutrasa.${table}`)).rows[0]?.count,'0');
  });
  await scenario('empty DOWN then identical UP preserves historical rows native digest and eleven baselines',async()=>{
    await preserved();await migrate('down');await expectState(history,11);assert.equal(await tableExists(table),false);await preserved();
    await migrate('up');assert.deepEqual(await migrate('up'),[]);await expectState([...history,name],11);await preserved();await assertLockReleased(observer);
  });
  await scenario('typed historical source audit alone blocks downgrade before any lineage row exists',async()=>{
    await client.query('UPDATE nutrasa.catalog_reviews SET actor_subject_id=$1,actor_subject=$2 WHERE id=$3',[ids.actor,actorText,ids.permission]);
    await assert.rejects(migrate('down'),{code:'22012'});await expectState([...history,name],11);assert.equal(await tableExists(table),true);
    assert.equal((await client.query('SELECT actor_subject_id FROM nutrasa.catalog_reviews WHERE id=$1',[ids.permission])).rows[0]?.actor_subject_id,ids.actor);
    await assertLockReleased(observer);
  });
  await scenario('populated lineage binding retains source-prefix links and refuses DOWN atomically',async()=>{
    const a=await root();const b=await root({food_revision_id:ids.otherRevision});const request_id=randomUUID();
    const out=await next(a.id,{event_kind:'MOVE_SERVING_OUT',serving_id:ids.serving,other_revision_id:ids.otherRevision,request_id});
    const incoming=await next(b.id,{food_revision_id:ids.otherRevision,event_kind:'MOVE_SERVING_IN',serving_id:ids.serving,other_revision_id:ids.revision,origin_event_id:out.id,request_id});
    await client.query('UPDATE nutrasa.catalog_reviews SET actor_subject_id=$1,actor_subject=$2,lineage_event_id=$3 WHERE id=$4',[ids.reviewer,'app_users:'+ids.reviewer,out.id,ids.review]);
    await client.query('UPDATE nutrasa.catalog_import_batches SET actor_subject_id=$1,actor_subject=$2 WHERE id=$3',[ids.actor,actorText,ids.batch]);
    const retained=(await client.query(`SELECT to_jsonb(t)::text AS row FROM nutrasa.${table} t ORDER BY event_number`)).rows;
    assert.equal(retained.length,4);assert.equal((await client.query(`SELECT origin_event_id FROM nutrasa.${table} WHERE id=$1`,[incoming.id])).rows[0]?.origin_event_id,out.id);
    await assert.rejects(migrate('down'),{code:'22012'});await expectState([...history,name],11);
    assert.deepEqual((await client.query(`SELECT to_jsonb(t)::text AS row FROM nutrasa.${table} t ORDER BY event_number`)).rows,retained);
    await preservedDigestOnly();await assertLockReleased(observer);
    // Writer-only tests (not implemented/skipped here): honest root completeness, source-prefix traversal,
    // cross-food DENY, actor authentication, independent reviewer, stale A->B->A heads and locked concurrency.
  });
});
