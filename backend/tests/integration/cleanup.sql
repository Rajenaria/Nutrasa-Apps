-- REVIEW ONLY. Manual cleanup after separate owner approval. Never called by test harness.
\set ON_ERROR_STOP on
\prompt 'Integration run ID to remove (32 lowercase hex): ' run_id
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
SELECT count(*) = 1 AND bool_and(
         pg_catalog.shobj_description(d.oid, 'pg_database') =
           'NUTRASA migration integration:' || :'run_id'
         AND d.datdba = current_user::regrole) AS matching_database
FROM pg_catalog.pg_database d WHERE d.datname = :'it_database' \gset
\if :matching_database
\else
  \echo STOP: missing database, wrong owner, or marker mismatch
  \quit
\endif
SELECT count(*) = 1 AND bool_and(NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
       OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid OR m.roleid = r.oid))
       AS matching_role
FROM pg_catalog.pg_roles r WHERE r.rolname = :'it_role' \gset
\if :matching_role
\else
  \echo STOP: dedicated role does not match expected privileges
  \quit
\endif
\connect :it_database
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
SELECT count(*) = 2 AND bool_and(nspowner = :'it_role'::regrole) AS matching_schemas
FROM pg_catalog.pg_namespace WHERE nspname IN ('nutrasa', 'nutrasa_migrations') \gset
\if :matching_schemas
\else
  \echo STOP: schema ownership mismatch
  \quit
\endif
\connect postgres
SELECT current_database() = 'postgres' AND r.rolsuper
       AND current_user = 'nutrasa_it_admin' AND session_user = current_user
       AND host(inet_server_addr()) IN ('127.0.0.1', '::1') AND inet_server_port() = 5433
       AND current_setting('server_version_num')::integer >= 180000
       AND current_setting('server_version_num')::integer < 190000
       AND current_setting('cluster_name') = 'nutrasa_it_pg18' AS valid_admin
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user \gset
\if :valid_admin
\else
  \echo STOP: wrong cleanup maintenance connection
  \quit
\endif
\prompt 'Confirm permanent removal by typing the exact integration database name: ' confirm_database
SELECT :'confirm_database' = :'it_database' AS confirmed \gset
\if :confirmed
\else
  \echo STOP: cleanup not confirmed
  \quit
\endif
SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datname = :'it_database')
       AS no_sessions \gset
\if :no_sessions
\else
  \echo STOP: close all integration/pgAdmin connections before cleanup; no sessions will be terminated
  \quit
\endif
-- No FORCE, no REASSIGN/DROP OWNED, no cleanup of any other database.
SELECT format('DROP DATABASE %I', :'it_database') \gexec
-- PostgreSQL refuses DROP ROLE if dependencies remain elsewhere. STOP and review if that happens.
SELECT format('DROP ROLE %I', :'it_role') \gexec
