import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { readSqlSnapshots, sha256, snapshotSql } from '../src/migrations/checksum.ts';

const migration = (up: string) => `-- Up Migration\n${up}\n-- Down Migration\nSELECT 1;\n`;
const parse = (up: string) => snapshotSql('0001_policy.sql', Buffer.from(migration(up)));
const func = (body: string, delimiter = '$body$') =>
  `CREATE FUNCTION nutrasa.policy_probe(input_value integer) RETURNS integer LANGUAGE plpgsql AS ${delimiter}${body}${delimiter};`;

test('all five approved migrations retain exact snapshot bytes and SHA-256', async () => {
  for (const name of ['0001_identity', '0002_food_sources', '0003_food_catalog', '0004_food_taxonomy', '0005_food_servings_provenance']) {
    const bytes = await readFile(new URL(`../migrations/${name}.sql`, import.meta.url));
    const snapshot = snapshotSql(`${name}.sql`, bytes);
    assert.equal(snapshot.content, bytes.toString('utf8'));
    assert.equal(snapshot.sha256, sha256(bytes));
  }
});

test('supported static PL/pgSQL blocks accept tagged and untagged dollar delimiters', () => {
  for (const delimiter of ['$$', '$body$', '$Body_1$']) {
    assert.doesNotThrow(() => parse(func('BEGIN RETURN input_value; END;', delimiter)));
    assert.doesNotThrow(() => parse(func('BEGIN BEGIN PERFORM 1; END; RETURN input_value; END;', delimiter)));
  }
});

test('strings, doubled identifiers, explicit escapes and nested comments are lexical data', () => {
  assert.doesNotThrow(() => parse(`SELECT 'BEGIN; COMMIT;', 'it''s data', E'escaped\\\'quote', "a""begin";
    /* outer BEGIN; /* inner ROLLBACK; */ END; */ SELECT 2; -- COMMIT;`));
  assert.doesNotThrow(() => parse(func("BEGIN PERFORM 'COMMIT;'; RAISE NOTICE 'BEGIN'; RETURN 1; END;")));
  assert.doesNotThrow(() => parse(func("BEGIN PERFORM ';'; RETURN 1; END;")));
  assert.doesNotThrow(() => parse(func('BEGIN UPDATE nutrasa.policy_data SET value=1; RETURN 1; END;')));
});

test('top-level transaction and session control cannot escape through case or comments', () => {
  for (const sql of ['BEGIN;', 'CoMmIt;', 'END;', 'ROLLBACK;', 'ABORT;', 'START TRANSACTION;',
    'SAVEPOINT x;', 'RELEASE x;', 'PREPARE TRANSACTION \'x\';', 'DISCARD ALL;',
    'SET search_path=public;', 'RESET ALL;', 'ALTER ROLE example SET search_path=public;',
    'ALTER SYSTEM SET log_statement=\'all\';', 'CREATE PROCEDURE nutrasa.x() LANGUAGE sql AS \'COMMIT\';',
    'SELECT 1; /* comment */ COMMIT;']) {
    assert.throws(() => parse(sql), /unsafe migration SQL/);
  }
});

test('executable body statements are inspected instead of hiding behind dollar quotes', () => {
  for (const statement of ['COMMIT;', 'ROLLBACK;', 'SAVEPOINT x;', 'SET search_path=public;',
    'EXECUTE \'SELECT 1\';', 'CALL nutrasa.other();', 'PERFORM pg_catalog.set_config(\'role\',\'x\',false);',
    'PERFORM pg_catalog.pg_advisory_unlock_all();', 'DELETE FROM nutrasa_migrations.migration_checksums;']) {
    assert.throws(() => parse(func(`BEGIN ${statement} RETURN 1; END;`)));
  }
});

test('forbidden metadata and unlock functions are rejected with quoted identifiers too', () => {
  for (const sql of ['SELECT * FROM "nutrasa_migrations"."migration_checksums";',
    'SELECT * FROM public."pgmigrations";', 'SELECT "pg_catalog"."pg_advisory_unlock_all"();',
    'SELECT "set_config"(\'role\',\'x\',false);',
    "SELECT pg_catalog.query_to_xml('SELECT * FROM nutrasa_migrations.pgmigrations',true,false,'');"]) assert.throws(() => parse(sql));
  assert.throws(() => parse(func('BEGIN DELETE FROM "nutrasa_migrations"."migration_checksums"; RETURN 1; END;')));
});

test('unknown function forms, opaque bodies and dynamic entrypoints fail closed', () => {
  for (const sql of ['DO $$ BEGIN RETURN; END; $$;', 'SELECT $$ BEGIN COMMIT; END; $$;',
    func('BEGIN RETURN 1; END;').replace('plpgsql', 'sql'),
    func('BEGIN RETURN 1; END;').replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'),
    func('BEGIN RETURN 1; END;').replace('LANGUAGE plpgsql', 'LANGUAGE plpgsql SECURITY DEFINER'),
    func('DECLARE a integer; BEGIN RETURN 1; END;'), func('BEGIN IF true THEN RETURN 1; END IF; END;'),
    'SELECT U&"nutrasa\\005fmigrations".x;']) assert.throws(() => parse(sql));
});

test('unterminated or malformed lexical structures and unsupported block forms are rejected', () => {
  for (const sql of ["SELECT 'unfinished;", 'SELECT "unfinished;', '/* nested /* open */',
    'SELECT (1;', 'SELECT 1);', 'SELECT 1', func('BEGIN RETURN 1; END;', '$tag$').replace(/\$tag\$;$/, '$other$;'),
    func('BEGIN RETURN 1;'), func('BEGIN RETURN 1; END; COMMIT;'), func('BEGIN unknown_statement; END;'),
    func('BEGIN RETURN (1; END;'), func("'begin' RETURN 1; END;")]) {
    assert.throws(() => parse(sql));
  }
});

test('false loader markers in dollar bodies, literals or nested comments are rejected', () => {
  for (const sql of [func('BEGIN\n-- Down Migration\nRETURN 1; END;'),
    "SELECT 'line\n-- Up Migration\n';", '/* nested\n-- Down Migration\n*/ SELECT 1;']) assert.throws(() => parse(sql));
  assert.throws(() => snapshotSql('0001_policy.sql', Buffer.from('/*\n-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 2;\n*/\n')));
});

const sqlHelper = (body: string) => `CREATE FUNCTION nutrasa.catalog_payload_digest_v1(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $digest$${body}$digest$;`;

test('read-only SQL helpers require a single SELECT, invoker and exact safe path', () => {
  assert.doesNotThrow(() => parse(sqlHelper("SELECT CASE WHEN p_payload IS NULL THEN NULL ELSE 'ok' END;")));
  for (const body of ['SELECT 1; SELECT 2;', 'DELETE FROM nutrasa.foods;',
    'SELECT 1 INTO temporary_result;', 'SELECT 1 FOR UPDATE;',
    "SELECT pg_catalog.set_config('role','x',false);", 'SELECT $$opaque$$;',
    'SELECT 1; COMMIT;', 'SELECT * FROM nutrasa_migrations.pgmigrations;'])
    assert.throws(() => parse(sqlHelper(body)));
  for (const [from, to] of [['SECURITY INVOKER','SECURITY DEFINER'],
    ['pg_catalog, pg_temp','public, pg_catalog'], ['IMMUTABLE','VOLATILE'],
    ['LANGUAGE sql','LANGUAGE c'], [' SET search_path = pg_catalog, pg_temp','']])
    assert.throws(() => parse(sqlHelper('SELECT 1;').replace(from, to)));
});

test('REVOKE is limited to PUBLIC EXECUTE on exact digest helper signatures', () => {
  for (const signature of ['catalog_payload_digest_v1(jsonb)',
    'catalog_revision_payload_v1(uuid,uuid[])',
    'catalog_source_permission_payload_v1(uuid,text,jsonb,boolean,text,timestamptz,timestamptz,text,text)'])
    assert.doesNotThrow(() => parse('REVOKE EXECUTE ON FUNCTION nutrasa.'+signature+' FROM PUBLIC;'));
  for (const sql of ['GRANT EXECUTE ON FUNCTION nutrasa.catalog_payload_digest_v1(jsonb) TO PUBLIC;',
    'REVOKE ALL ON SCHEMA nutrasa FROM PUBLIC;',
    'REVOKE EXECUTE ON FUNCTION nutrasa.catalog_payload_digest_v1(jsonb) FROM operator;',
    'REVOKE EXECUTE ON FUNCTION nutrasa.catalog_payload_digest_v1(text) FROM PUBLIC;',
    'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA nutrasa FROM PUBLIC;',
    'REVOKE EXECUTE ON FUNCTION public.catalog_payload_digest_v1(jsonb) FROM PUBLIC;',
    'REVOKE EXECUTE ON FUNCTION nutrasa.other(jsonb) FROM PUBLIC;']) assert.throws(() => parse(sql));
});

test('directory discovery rejects an unreviewed privileged writer batch instead of returning its valid prefix', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nutrasa-writer-preflight-'));
  t.after(async () => {
    // Cleanup is limited to the OS directory created by this test, never a repository or database.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('nutrasa-writer-preflight-'));
    await rm(directory, { recursive: true, force: true });
  });
  await writeFile(join(directory, '0001_valid.sql'), migration('SELECT 1;'));
  assert.deepEqual((await readSqlSnapshots(directory)).map(file => file.name), ['0001_valid']);

  // These are rejected input strings, not a candidate migration or a PostgreSQL writer test.
  const rejected = [
    func('BEGIN RETURN 1; END;').replace('LANGUAGE plpgsql',
      'LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp'),
    func('BEGIN RETURN 1; END;').replace('LANGUAGE plpgsql',
      'LANGUAGE plpgsql EXTERNAL SECURITY DEFINER'),
    'ALTER FUNCTION nutrasa.policy_probe(integer) SECURITY DEFINER;',
    'ALTER FUNCTION nutrasa.policy_probe(integer) OWNER TO unapproved_executor;',
    'GRANT EXECUTE ON FUNCTION nutrasa.policy_probe(integer) TO PUBLIC;',
    'GRANT unapproved_executor TO unapproved_runtime;',
    func("BEGIN PERFORM pg_catalog.set_config('nutrasa.actor_subject', 'unverified', true); RETURN 1; END;"),
  ];
  for (const up of rejected) {
    await writeFile(join(directory, '0009_unreviewed_writer.sql'), migration(up));
    await assert.rejects(readSqlSnapshots(directory), /Unsupported or unsafe migration SQL\./);
  }
});

test('only the reviewed writer header and structured body grammar admit privileged SQL', async () => {
  const source = await readFile(new URL('../migrations/0009_catalog_capability_writer.sql', import.meta.url), 'utf8');
  assert.doesNotThrow(() => snapshotSql('0009_catalog_capability_writer.sql', Buffer.from(source)));
  const changes = [
    ['catalog_transition_capability', 'unreviewed_writer'], ['p_actor_firebase_uid text', 'p_actor_firebase_uid uuid'],
    ['VOLATILE SECURITY DEFINER', 'STABLE SECURITY DEFINER'], ['pg_catalog, pg_temp', 'public, pg_temp'],
    ['LANGUAGE plpgsql', 'LANGUAGE sql'], ['REVOKE EXECUTE', 'GRANT EXECUTE'],
    ['FROM PUBLIC;', 'FROM unapproved_runtime;'], ['  v_actor_id uuid;', '  v_actor_id uuid := pg_catalog.gen_random_uuid();'],
    ['  RETURN v_event_id;', "  EXECUTE 'SELECT 1'; RETURN v_event_id;"],
    ['  RETURN v_event_id;', "  PERFORM pg_catalog.set_config('role', 'unapproved', true); RETURN v_event_id;"],
    ['  RETURN v_event_id;', '  COMMIT; RETURN v_event_id;'],
    ['  RETURN v_event_id;', '  BEGIN RETURN v_event_id; END;'],
    ['  RETURN v_event_id;', '  DO $$ BEGIN RETURN; END; $$; RETURN v_event_id;'],
    ['  RETURN v_event_id;', '  DELETE FROM nutrasa_migrations.migration_checksums; RETURN v_event_id;'],
  ];
  for (const [from, to] of changes) {
    assert.ok(from && to && source.includes(from));
    assert.throws(() => snapshotSql('0009_catalog_capability_writer.sql', Buffer.from(source.replace(from, to))), /unsafe migration SQL/);
  }
});
