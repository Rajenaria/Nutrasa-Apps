-- Up Migration
CREATE TABLE nutrasa.integration_pending (id integer PRIMARY KEY);
-- Down Migration
DROP TABLE nutrasa.integration_pending;
