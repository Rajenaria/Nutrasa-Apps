import assert from 'node:assert/strict';
import test from 'node:test';
import { governanceInstallStatements, readGovernanceEnvironment } from './integration/governance-environment.ts';

const database = 'nutrasa_it_10000000000040008000000000000009';
const environment = {
  NUTRASA_IT_DATABASE_URL: `postgresql://${database}_migrator:synthetic@127.0.0.1:5433/${database}`,
  NUTRASA_IT_READER_URL: `postgresql://${database}_runtime:synthetic@127.0.0.1:5433/${database}`,
  NUTRASA_IT_WRITER_URL: `postgresql://${database}_writer:synthetic@127.0.0.1:5433/${database}`,
  NUTRASA_IT_ADMIN_URL: `postgresql://nutrasa_it_admin:synthetic@127.0.0.1:5433/${database}`,
  NUTRASA_IT_CONFIRM_DATABASE: database, NUTRASA_IT_GOVERNANCE_CONFIRM: database,
};

test('governance preparation accepts only a separately confirmed new disposable target and four explicit local logins', () => {
  const config = readGovernanceEnvironment(environment);
  assert.equal(config.writerRole, database + '_writer');
  for (const changes of [ { NUTRASA_IT_GOVERNANCE_CONFIRM: '' }, { PGPORT: '5432' }, { PGOPTIONS: 'private' },
    { PGREPLICATION: '1' }, { NUTRASA_IT_WRITER_URL: environment.NUTRASA_IT_WRITER_URL.replace('5433','5432') },
    { NUTRASA_IT_ADMIN_URL: environment.NUTRASA_IT_ADMIN_URL.replace('/'+database,'/postgres') },
    { NUTRASA_IT_WRITER_URL: environment.NUTRASA_IT_DATABASE_URL },
    { NUTRASA_IT_READER_URL: environment.NUTRASA_IT_READER_URL.replace('127.0.0.1','localhost') } ]) {
    assert.throws(() => readGovernanceEnvironment({ ...environment, ...changes }));
  }
  const retained = 'nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc';
  assert.throws(() => readGovernanceEnvironment(Object.fromEntries(Object.entries(environment).map(([key,value]) =>
    [key,value.replaceAll(database, retained)]))));
});

test('review-only installer targets exact roles/signature without CREATE ownership of tables or audit mutation', () => {
  const config = readGovernanceEnvironment(environment);
  const sql = governanceInstallStatements(config).join('\n');
  assert.doesNotMatch(sql, /CREATE ROLE|CREATE SCHEMA|GRANT ALL|WITH GRANT OPTION|SET ROLE|TRUNCATE|DELETE|UPDATE ON|OWNER TO.*_writer|ALTER TABLE/);
  assert.ok(sql.includes('UPDATE (last_event_id)'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION'));
  assert.equal((sql.match(/GRANT EXECUTE/g) ?? []).length, 1);
  assert.throws(() => governanceInstallStatements({ ...config, writerRole: 'unsafe; GRANT ALL' }));
  assert.throws(() => governanceInstallStatements({ ...config, migrator: { ...config.migrator, id: 'bad' } }));
});
