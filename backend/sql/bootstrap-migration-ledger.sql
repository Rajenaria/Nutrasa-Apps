-- REVIEW ONLY: manual bootstrap, never a domain migration or runner input.
-- Run as the matching migrator in the target database after owner approval.
BEGIN;

DO $bootstrap$
DECLARE
  expected_role text;
  has_history boolean;
BEGIN
  expected_role := CASE current_database()
    WHEN 'nutrasa_dev' THEN 'nutrasa_dev_migrator'
    WHEN 'nutrasa_test' THEN 'nutrasa_test_migrator'
    ELSE NULL
  END;
  IF expected_role IS NULL OR current_user <> expected_role OR session_user <> current_user THEN
    RAISE EXCEPTION 'STOP: invalid database or role';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_namespace
      WHERE nspname IN ('nutrasa', 'nutrasa_migrations')
        AND nspowner = current_user::regrole) <> 2 THEN
    RAISE EXCEPTION 'STOP: invalid schema ownership';
  END IF;
  -- Same published lock key as node-pg-migrate 9.0.0; held until COMMIT/ROLLBACK.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(7241865325823964::bigint) THEN
    RAISE EXCEPTION 'STOP: another migration or bootstrap is running';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'pgmigrations' AND n.nspname <> 'nutrasa_migrations') THEN
    RAISE EXCEPTION 'STOP: migration history exists in another schema; explicit review required';
  END IF;
  IF to_regclass('nutrasa_migrations.migration_checksums') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: ledger already exists; review instead of reinitializing';
  END IF;
  IF to_regclass('nutrasa_migrations.pgmigrations') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM nutrasa_migrations.pgmigrations)' INTO has_history;
    IF has_history THEN
      RAISE EXCEPTION 'STOP: existing history requires an explicit checksum baseline review';
    END IF;
  END IF;
END
$bootstrap$;

CREATE TABLE nutrasa_migrations.migration_checksums (
  -- NUTRASA: 0001..9999_lowercase_ascii, at most 251 characters excluding .sql.
  name text PRIMARY KEY CHECK (name COLLATE "C" ~ '^[0-9]{4}_[a-z][a-z0-9_]*$'
                               AND left(name, 4) <> '0000' AND char_length(name) <= 251),
  sha256 text NOT NULL CHECK (sha256 COLLATE "C" ~ '^[a-f0-9]{64}$')
);
REVOKE ALL ON TABLE nutrasa_migrations.migration_checksums FROM PUBLIC,
  nutrasa_dev_app, nutrasa_test_app;

COMMIT;
