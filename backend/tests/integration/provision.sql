-- REVIEW ONLY. Run manually with psql as the authorized local administrator.
-- Never execute automatically from npm tests. No bootstrap/fixtures are applied here.
\set ON_ERROR_STOP on
\prompt 'Integration run ID (32 lowercase hex characters): ' run_id
SELECT :'run_id' ~ '^[a-f0-9]{32}$' COLLATE "C"
       AND char_length(:'run_id') = 32 AS valid_id \gset
\if :valid_id
\else
  \echo STOP: invalid integration run ID
  \quit
\endif
SELECT 'nutrasa_it_' || :'run_id' AS it_database,
       'nutrasa_it_' || :'run_id' || '_migrator' AS it_role \gset
SELECT current_database() = 'postgres' AND r.rolsuper
       AND current_user = 'nutrasa_it_admin' AND session_user = current_user
       AND host(inet_server_addr()) IN ('127.0.0.1', '::1') AND inet_server_port() = 5433
       AND current_setting('server_version_num')::integer >= 180000
       AND current_setting('server_version_num')::integer < 190000
       AND current_setting('cluster_name') = 'nutrasa_it_pg18'
       AS valid_admin
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user \gset
\if :valid_admin
\else
  \echo STOP: require nutrasa_it_admin on the dedicated PostgreSQL 18 test cluster
  \quit
\endif
SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'it_database')
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'it_role')
       AS fresh_target \gset
\if :fresh_target
\else
  \echo STOP: target database or role already exists; review partial provisioning
  \quit
\endif
-- Database creation must remain outside a transaction. A partial run leaves a NOLOGIN role.
SELECT format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
              :'it_role') \gexec
SELECT format('CREATE DATABASE %I TEMPLATE template0', :'it_database') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'it_database') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'it_database', :'it_role') \gexec
SELECT format('COMMENT ON DATABASE %I IS %L', :'it_database',
              'NUTRASA migration integration:' || :'run_id') \gexec

\connect :it_database
BEGIN;
SELECT current_database() = :'it_database' AND r.rolsuper
       AND current_user = 'nutrasa_it_admin' AND session_user = current_user
       AND host(inet_server_addr()) IN ('127.0.0.1', '::1') AND inet_server_port() = 5433
       AND current_setting('server_version_num')::integer >= 180000
       AND current_setting('server_version_num')::integer < 190000
       AND current_setting('cluster_name') = 'nutrasa_it_pg18' AS correct_database
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user \gset
\if :correct_database
\else
  \echo STOP: wrong target connection
  \quit
\endif
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('CREATE SCHEMA nutrasa AUTHORIZATION %I', :'it_role') \gexec
SELECT format('CREATE SCHEMA nutrasa_migrations AUTHORIZATION %I', :'it_role') \gexec
SELECT format('ALTER ROLE %I IN DATABASE %I SET search_path TO pg_catalog, nutrasa',
              :'it_role', :'it_database') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM PUBLIC', :'it_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM PUBLIC', :'it_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM PUBLIC', :'it_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TYPES FROM PUBLIC', :'it_role') \gexec
COMMIT;

SET password_encryption = 'scram-sha-256';
\password :it_role
\prompt 'Password setup succeeded? Type the exact dedicated role name to enable LOGIN: ' confirm_role
SELECT :'confirm_role' = :'it_role' AS enable_login \gset
\if :enable_login
  SELECT format('ALTER ROLE %I LOGIN', :'it_role') \gexec
\else
  \echo STOP: dedicated role remains NOLOGIN
  \quit
\endif
\echo Provisioning complete. Verify login separately; integration tests still require approval.
