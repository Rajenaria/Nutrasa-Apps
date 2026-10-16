import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256, snapshotSql } from '../src/migrations/checksum.ts';

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
