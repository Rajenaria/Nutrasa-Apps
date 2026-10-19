import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { Client, Pool } from 'pg';
import { buildApp } from '../../src/app.ts';
import { createCapabilityAuthority } from '../../src/capabilities.ts';
import { createCapabilityWriter } from '../../src/capability-writer.ts';
import { catalogPermissions } from '../../src/capability-registry.ts';
import { delegatedCapabilities, governanceLock, governanceSignature } from '../../src/governance-contract.ts';
import { createMigrationHarness } from './harness.ts';
import { connectReader } from './reader-guard.ts';
import { governanceInstallStatements, readGovernanceEnvironment, verifyGovernanceAdmin } from './governance-environment.ts';

// Opt-in only: all DB/roles/HBA must already have separately approved provisioning.
// Synthetic maintenance fixtures are NOT evidence of actual owner/human approval verification.
test('closed governance writer and trusted service boundary on a new isolated PostgreSQL target', { timeout: 180_000 }, async t => {
  const config = readGovernanceEnvironment(process.env); // Reject retained/permanent targets before connecting.
  const { client, observer, directory, migrate, bootstrap, expectState, scenario } = await createMigrationHarness(t);
  const admin = new Client({ connectionString: config.adminUrl, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  admin.on('error', () => {}); t.after(() => admin.end());
  await admin.connect(); await verifyGovernanceAdmin(admin, config);
  const pool = new Pool({ connectionString: config.writerUrl, ssl: false, max: 1, idleTimeoutMillis: 0,
    connectionTimeoutMillis: 5000, statement_timeout: 15000, application_name: 'nutrasa_it_writer' });
  pool.on('error', () => {}); t.after(() => pool.end());
  const name = '0009_catalog_capability_writer';
  const baseline = ['0001_identity','0002_food_sources','0003_food_catalog','0004_food_taxonomy',
    '0005_food_servings_provenance','0006_catalog_audit','0007_catalog_digest','0008_catalog_capabilities'];
  const signature = `nutrasa.${governanceSignature}`;
  const capability = delegatedCapabilities[0]; assert.ok(capability);
  const subjects = { owner: randomUUID(), recorder: randomUUID(), manager: randomUUID(), recipient: randomUUID(), stranger: randomUUID() };
  const uid = (id: string) => 'SYNTHETIC_GOVERNANCE_' + id;
  const pointer = async (id = subjects.recipient, cap = capability) => (await client.query<{ id: string }>(
    'SELECT last_event_id AS id FROM nutrasa.catalog_capability_assignments WHERE subject_id=$1 AND capability=$2 AND scope=$3', [id,cap,'CATALOG'])).rows[0]?.id ?? null;
  const count = async () => (await client.query<{ count: string }>('SELECT count(*)::text AS count FROM nutrasa.catalog_capability_events')).rows[0]?.count;
  const call = async (actor = subjects.manager, recipient = subjects.recipient, cap = capability,
    action = 'GRANT', expected: string | null = null, scope = 'CATALOG') => pool.query(
      'SELECT nutrasa.catalog_transition_capability($1,$2,$3,$4,$5,$6,$7,$8) AS event_id',
      [uid(actor),recipient,cap,scope,action,expected,'Synthetic integration only',randomUUID()]);

  await scenario('fresh guarded target applies exactly immutable 0001-0008 without authority', async () => {
    const objects=await admin.query(`SELECT
      NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations'))
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('nutrasa','nutrasa_migrations')) AS empty`);
    assert.equal(objects.rows[0]?.empty,true,'STOP: a genuinely fresh schema pair is required.');
    await bootstrap();
    for (const file of baseline) await writeFile(join(directory,file+'.sql'), await readFile(new URL('../../migrations/'+file+'.sql',import.meta.url)));
    await migrate('up'); await expectState(baseline,8);
    assert.equal(await count(),'0');
    assert.equal((await client.query("SELECT count(*)::text AS count FROM nutrasa.app_users")).rows[0]?.count,'0');
  });
  await scenario('failure after actual writer DDL rolls back definition ACL history and checksum', async () => {
    await writeFile(join(directory,name+'.sql'),await readFile(new URL('../../migrations/'+name+'.sql',import.meta.url)));
    await writeFile(join(directory,'0010_failure.sql'),await readFile(new URL('./fixtures/governance/0010_failure.sql',import.meta.url)));
    await assert.rejects(migrate('up')); await expectState(baseline,8);
    assert.equal((await client.query('SELECT to_regprocedure($1) IS NULL AS absent',[signature])).rows[0]?.absent,true);
    await rm(join(directory,'0010_failure.sql'));
  });
  await scenario('inherited nonowner default EXECUTE aborts candidate installation atomically', async () => {
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa GRANT EXECUTE ON FUNCTIONS TO ${config.writerRole}`);
    await assert.rejects(migrate('up')); await expectState(baseline,8);
    assert.equal((await client.query('SELECT to_regprocedure($1) IS NULL AS absent',[signature])).rows[0]?.absent,true);
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${config.migrator.role} IN SCHEMA nutrasa REVOKE EXECUTE ON FUNCTIONS FROM ${config.writerRole}`);
  });
  await scenario('actual UP remains closed until reviewed ownership and exact ACL installation', async () => {
    await migrate('up'); await expectState([...baseline,name],9);
    await assert.rejects(call(), { code:'42501' });
    await admin.query('BEGIN');
    try { for (const sql of governanceInstallStatements(config)) await admin.query(sql); await admin.query('COMMIT'); }
    catch (error: unknown) { await admin.query('ROLLBACK'); throw error; }
    const fact = (await admin.query(`SELECT p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
      NOT EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) AS public_closed
      FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature])).rows[0];
    assert.equal(fact?.owner,config.executorRole); assert.equal(fact?.prosecdef,true);
    assert.equal(fact?.provolatile,'v'); assert.deepEqual(fact?.proconfig,['search_path=pg_catalog, pg_temp']); assert.equal(fact?.public_closed,true);
    await verifyGovernanceAdmin(admin,config);
  });
  await scenario('synthetic bootstrap has explicit distinct owner recorder recipient and atomic event pointers', async () => {
    for (const id of Object.values(subjects)) await client.query('INSERT INTO nutrasa.app_users(id,firebase_uid,account_status) VALUES($1,$2,$3)',[id,uid(id),'ACTIVE']);
    await assert.rejects(call(),{ code:'42501' }); assert.equal(await count(),'0');
    const syntheticBootstrap = async (approved: boolean, owner: string, recorder: string, recipient: string) => {
      // Fixture models a separately verified private maintenance approval, not user-controlled runtime input.
      assert.equal(approved,true); assert.notEqual(owner,recipient); assert.notEqual(recorder,recipient);
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
        const present = await client.query('SELECT id FROM nutrasa.app_users WHERE id=ANY($1::uuid[]) AND account_status=$2',[[...new Set([owner,recorder,recipient])],'ACTIVE']);
        assert.equal(present.rows.length,new Set([owner,recorder,recipient]).size);
        assert.equal(await count(),'0');
        for (const cap of ['catalog.capability.grant','catalog.capability.revoke']) {
          const event = await client.query<{ id: string }>(`INSERT INTO nutrasa.catalog_capability_events
            (subject_id,capability,scope,action,actor_subject_id,reason,request_id) VALUES($1,$2,'CATALOG','GRANT',$3,$4,$5) RETURNING id`,
          [recipient,cap,recorder,'Synthetic maintenance approval fixture; no real authority',randomUUID()]);
          await client.query('INSERT INTO nutrasa.catalog_capability_assignments VALUES($1,$2,$3,$4)',[recipient,cap,'CATALOG',event.rows[0]?.id]);
        }
        await client.query('COMMIT');
      } catch(error: unknown) { await client.query('ROLLBACK'); throw error; }
    };
    await assert.rejects(syntheticBootstrap(false,subjects.owner,subjects.recorder,subjects.manager));
    await assert.rejects(syntheticBootstrap(true,subjects.manager,subjects.recorder,subjects.manager));
    await assert.rejects(syntheticBootstrap(true,subjects.owner,subjects.manager,subjects.manager));
    await assert.rejects(syntheticBootstrap(true,subjects.owner,randomUUID(),subjects.manager));
    assert.equal(await count(),'0');
    await syntheticBootstrap(true,subjects.owner,subjects.recorder,subjects.manager); assert.equal(await count(),'2');
  });
  await scenario('all four finite editorial pairs grant revoke and regrant with duplicate rejection', async () => {
    for (const cap of delegatedCapabilities) {
      await assert.rejects(call(subjects.manager,subjects.recipient,cap,'REVOKE'),{ code:'55000' });
      await call(subjects.manager,subjects.recipient,cap); const grant = await pointer(subjects.recipient,cap); assert.ok(grant);
      await assert.rejects(call(subjects.manager,subjects.recipient,cap,'GRANT',grant),{ code:'55000' });
      await call(subjects.manager,subjects.recipient,cap,'REVOKE',grant); const revoke = await pointer(subjects.recipient,cap); assert.ok(revoke);
      await assert.rejects(call(subjects.manager,subjects.recipient,cap,'REVOKE',revoke),{ code:'55000' });
    }
  });
  await scenario('unknown administrative self and unauthorized transitions do not append audit', async () => {
    const before = await count();
    for (const cap of ['catalog.capability.grant','catalog.capability.revoke','catalog.*','catalog.unknown']) await assert.rejects(call(subjects.manager,subjects.recipient,cap),{ code:'42501' });
    await assert.rejects(call(subjects.manager,subjects.recipient,capability,'GRANT',null,'catalog'),{ code:'42501' });
    for (const action of ['GRANT','REVOKE']) await assert.rejects(call(subjects.manager,subjects.manager,capability,action),{ code:'42501' });
    await assert.rejects(call(subjects.stranger),{ code:'42501' }); assert.equal(await count(),before);
    await assert.rejects(call(randomUUID()),{ code:'42501' }); assert.equal(await count(),before);
  });
  await scenario('inactive actors deny; inactive recipients can revoke and reactivation does not restore REVOKE', async () => {
    for (const status of ['PENDING_DELETION','DELETED']) {
      await client.query('UPDATE nutrasa.app_users SET account_status=$1 WHERE id=$2',[status,subjects.manager]);
      await assert.rejects(call(),{ code:'42501' });
    }
    await client.query("UPDATE nutrasa.app_users SET account_status='ACTIVE' WHERE id=$1",[subjects.manager]);
    await call(subjects.manager,subjects.recipient,capability,'GRANT',await pointer());
    await client.query("UPDATE nutrasa.app_users SET account_status='PENDING_DELETION' WHERE id=$1",[subjects.recipient]);
    await assert.rejects(call(subjects.manager,subjects.recipient,capability,'GRANT',await pointer()),{ code:'42501' });
    await call(subjects.manager,subjects.recipient,capability,'REVOKE',await pointer());
    await client.query("UPDATE nutrasa.app_users SET account_status='ACTIVE' WHERE id=$1",[subjects.recipient]);
    const reader = await connectReader(config.reader); t.after(()=>reader.end());
    const authority = createCapabilityAuthority(reader,catalogPermissions);
    assert.equal(await authority.allows(uid(subjects.recipient),capability,'CATALOG'),false);
  });
  await scenario('pointer failure rolls back the preceding audit insert without deleting any history', async () => {
    const before = await count(); const expected = await pointer();
    await admin.query('ALTER TABLE nutrasa.catalog_capability_assignments ADD CONSTRAINT it_reject_pointer CHECK(false) NOT VALID');
    await assert.rejects(call(subjects.manager,subjects.recipient,capability,'GRANT',expected),{ code:'23514' });
    assert.equal(await count(),before); assert.equal(await pointer(),expected);
    await admin.query('ALTER TABLE nutrasa.catalog_capability_assignments DROP CONSTRAINT it_reject_pointer');
  });
  await scenario('caller search_path cannot redirect the fixed-path schema-qualified writer', async () => {
    const caller = new Client({ connectionString: config.writerUrl, ssl: false, statement_timeout: 10000 });
    t.after(() => caller.end()); await caller.connect();
    await caller.query('BEGIN');
    try {
      await caller.query('SET LOCAL search_path = pg_temp, public');
      const granted = await caller.query<{ event_id: string }>(
        'SELECT nutrasa.catalog_transition_capability($1,$2,$3,$4,$5,$6,$7,$8) AS event_id',
        [uid(subjects.manager), subjects.recipient, capability, 'CATALOG', 'GRANT', await pointer(),
          'Synthetic caller search path', randomUUID()]);
      const eventId = granted.rows[0]?.event_id; assert.ok(eventId);
      await caller.query('SELECT nutrasa.catalog_transition_capability($1,$2,$3,$4,$5,$6,$7,$8)',
        [uid(subjects.manager), subjects.recipient, capability, 'CATALOG', 'REVOKE', eventId,
          'Synthetic caller search path', randomUUID()]);
      await caller.query('COMMIT');
    } catch (error: unknown) { await caller.query('ROLLBACK'); throw error; }
    assert.equal((await client.query('SELECT action FROM nutrasa.catalog_capability_events WHERE id=$1',
      [await pointer()])).rows[0]?.action, 'REVOKE');
  });
  await scenario('runtime cannot mutate audit projection metadata DDL sequences or SET ROLE', async () => {
    for (const sql of ['UPDATE nutrasa.catalog_capability_events SET reason=reason WHERE false',
      'DELETE FROM nutrasa.catalog_capability_events WHERE false','TRUNCATE nutrasa.catalog_capability_events',
      'UPDATE nutrasa.catalog_capability_assignments SET last_event_id=last_event_id WHERE false',
      'CREATE TABLE nutrasa.it_forbidden(id integer)','CREATE TEMP TABLE it_forbidden(id integer)',
      "SELECT nextval('nutrasa.catalog_capability_events_event_number_seq')",'SELECT * FROM nutrasa_migrations.migration_checksums',
      `SET ROLE ${config.executorRole}`,`SET ROLE ${config.migrator.role}`]) await assert.rejects(pool.query(sql),{ code:'42501' });
  });
  await scenario('stale missing and wrong expected pointers fail closed without repairing history', async () => {
    const before=await count();const latest=await pointer();assert.ok(latest);
    const old=(await client.query<{id:string}>('SELECT id FROM nutrasa.catalog_capability_events WHERE subject_id=$1 AND capability=$2 AND scope=$3 AND id<>$4 ORDER BY event_number LIMIT 1',
      [subjects.recipient,capability,'CATALOG',latest])).rows[0]?.id;assert.ok(old);
    await client.query('UPDATE nutrasa.catalog_capability_assignments SET last_event_id=$1 WHERE subject_id=$2 AND capability=$3 AND scope=$4',[old,subjects.recipient,capability,'CATALOG']);
    await assert.rejects(call(subjects.manager,subjects.recipient,capability,'GRANT',old),{code:'55000'});
    await client.query('DELETE FROM nutrasa.catalog_capability_assignments WHERE subject_id=$1 AND capability=$2 AND scope=$3',[subjects.recipient,capability,'CATALOG']);
    await assert.rejects(call(),{code:'55000'});
    await client.query('INSERT INTO nutrasa.catalog_capability_assignments VALUES($1,$2,$3,$4)',[subjects.recipient,capability,'CATALOG',latest]);
    await assert.rejects(call(subjects.manager,subjects.recipient,capability,'GRANT',old),{code:'55000'});
    assert.equal(await count(),before);assert.equal(await pointer(),latest);
  });
  await scenario('two concurrent expected-pointer transitions serialize with one winner and lock release', async () => {
    const expected = await pointer();
    const first = new Client({connectionString:config.writerUrl,ssl:false,statement_timeout:10000});
    const second = new Client({connectionString:config.writerUrl,ssl:false,statement_timeout:10000});
    t.after(()=>first.end()); t.after(()=>second.end()); await first.connect();await second.connect();
    const pids = [(await first.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,(await second.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid];
    await observer.query('BEGIN');await observer.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
    const invoke = (c:Client) => c.query('SELECT nutrasa.catalog_transition_capability($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid(subjects.manager),subjects.recipient,capability,'CATALOG','GRANT',expected,'Synthetic concurrency',randomUUID()])
      .then(()=>({ok:true,code:''}), (error:unknown)=>({ok:false,code:typeof error==='object' && error!==null && 'code' in error ? error.code : ''}));
    const a=invoke(first);const b=invoke(second);let waiting=false;
    for(let i=0;i<100;i++) {
      const locks=await observer.query("SELECT count(*)::text AS count FROM pg_locks WHERE pid=ANY($1::integer[]) AND locktype='advisory' AND NOT granted",[pids]);
      if(locks.rows[0]?.count==='2'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waiting,true);await observer.query('COMMIT');
    const results=await Promise.all([a,b]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok)?.code,'55000');
    await observer.query('BEGIN');assert.equal((await observer.query('SELECT pg_try_advisory_xact_lock($1,$2) AS free',[...governanceLock])).rows[0]?.free,true);await observer.query('ROLLBACK');
  });
  await scenario('authority committed while a caller waits on the lock is revalidated after acquisition', async () => {
    const waitingClient=new Client({connectionString:config.writerUrl,ssl:false,statement_timeout:10000});
    t.after(()=>waitingClient.end());await waitingClient.connect();
    const pid=(await waitingClient.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
    const before=Number(await count());const expected=await pointer();
    await observer.query('BEGIN');await observer.query('SELECT pg_advisory_xact_lock($1,$2)',[...governanceLock]);
    const result=waitingClient.query('SELECT nutrasa.catalog_transition_capability($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid(subjects.manager),subjects.recipient,capability,'CATALOG','GRANT',expected,'Synthetic wait',randomUUID()])
      .then(()=>({ok:true,code:''}),(error:unknown)=>({ok:false,code:typeof error==='object'&&error!==null&&'code'in error?error.code:''}));
    let waiting=false;for(let i=0;i<100;i++){
      const locks=await observer.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting",[pid]);
      if(locks.rows[0]?.waiting===true){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waiting,true);
    const event=(await observer.query<{id:string}>(`INSERT INTO nutrasa.catalog_capability_events
      (subject_id,capability,scope,action,actor_subject_id,reason,request_id)
      VALUES($1,'catalog.capability.grant','CATALOG','REVOKE',$2,$3,$4) RETURNING id`,
    [subjects.manager,subjects.recorder,'Synthetic maintenance revocation under the shared lock',randomUUID()])).rows[0]?.id;assert.ok(event);
    await observer.query("UPDATE nutrasa.catalog_capability_assignments SET last_event_id=$1 WHERE subject_id=$2 AND capability='catalog.capability.grant' AND scope='CATALOG'",[event,subjects.manager]);
    await observer.query('COMMIT');assert.deepEqual(await result,{ok:false,code:'42501'});
    assert.equal(Number(await count()),before+1);assert.equal(await pointer(),expected);
  });
  await scenario('actual max-one writer Pool handles verified request identities and rejects client actor spoofing', async () => {
    const writer=createCapabilityWriter(pool);
    const app=buildApp({verifier:{async verifyIdToken(token){return {uid:uid(token.endsWith('manager')?subjects.manager:subjects.stranger)};}}});t.after(()=>app.close());
    let expected=await pointer();
    app.post('/test/transition',{onRequest:app.authenticate},request=>writer(request,{subjectId:subjects.recipient,
      capability,scope:'CATALOG',action:'REVOKE',expectedEventId:expected,reason:'Synthetic verified request'}));
    const denied=await app.inject({method:'POST',url:'/test/transition',headers:{authorization:'Bearer e30.e30.stranger'},payload:{uid:uid(subjects.manager)}});
    assert.equal(denied.statusCode,500);assert.equal(await pointer(),expected);
    const before=(await pool.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
    const accepted=await app.inject({method:'POST',url:'/test/transition',headers:{authorization:'Bearer e30.e30.manager'},payload:{actor_subject:subjects.stranger}});
    assert.equal(accepted.statusCode,200);expected=await pointer();assert.ok(expected);
    assert.equal((await pool.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid,before);
  });
  await scenario('DOWN preserves authority audit and immutable baseline; UP restores a closed writer only', async () => {
    const before=await count();
    await admin.query('BEGIN');try{
      await admin.query(`REVOKE ALL ON FUNCTION ${signature} FROM ${config.writerRole}`);
      await admin.query(`ALTER FUNCTION ${signature} OWNER TO ${config.migrator.role}`);await admin.query('COMMIT');
    }catch(error:unknown){await admin.query('ROLLBACK');throw error;}
    await migrate('down');await expectState(baseline,9);assert.equal(await count(),before);
    await migrate('up');await expectState([...baseline,name],9);assert.equal(await count(),before);
    await assert.rejects(call(),{code:'42501'});
  });
});
