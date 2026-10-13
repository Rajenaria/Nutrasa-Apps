-- Up Migration
CREATE TABLE nutrasa.integration_probe (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO nutrasa.integration_probe (id, value) VALUES (1, 'original');
-- Down Migration
DROP TABLE nutrasa.integration_probe;
