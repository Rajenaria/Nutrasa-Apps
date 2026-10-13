-- Up Migration
SELECT pg_advisory_xact_lock(714390);
CREATE TABLE nutrasa.integration_concurrent (id integer PRIMARY KEY);
-- Down Migration
DROP TABLE nutrasa.integration_concurrent;
