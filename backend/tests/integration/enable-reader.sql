-- Manual password step only. Called after guarded role/column-privilege installation.
\set ON_ERROR_STOP on
SELECT current_database()='nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc'
  AND current_user='nutrasa_it_admin' AND session_user=current_user
  AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
  AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5433
  AND current_setting('cluster_name')='nutrasa_it_pg18'
  AND current_setting('server_version_num')::integer=180006
  AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())='7697229180258678980'
  AND (SELECT count(*)=1 AND bool_and(NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
    OR rolinherit OR rolreplication OR rolbypassrls)) FROM pg_catalog.pg_roles
    WHERE rolname='nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc_runtime') AS safe_target \gset
\if :safe_target
\else
  \echo STOP: reader activation target rejected
  SELECT 1 / 0 AS activation_stopped;
  \quit
\endif
SET password_encryption='scram-sha-256';
\password nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc_runtime
\prompt 'Type the exact reader role after successful password setup: ' confirmed_reader
SELECT :'confirmed_reader'='nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc_runtime' AS confirmed \gset
\if :confirmed
  ALTER ROLE nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc_runtime LOGIN;
\else
  \echo STOP: reader remains NOLOGIN
  SELECT 1 / 0 AS activation_stopped;
  \quit
\endif
\echo NUTRASA_IT_READER_ENABLED nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc_runtime
