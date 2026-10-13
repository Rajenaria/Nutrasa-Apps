-- Up Migration
CREATE TABLE nutrasa.integration_failed (id integer PRIMARY KEY);
INSERT INTO nutrasa.integration_probe (id, value) VALUES (2, 'must_rollback');
SELECT 1 / 0;
-- Down Migration
DROP TABLE nutrasa.integration_failed;
