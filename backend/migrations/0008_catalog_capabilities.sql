-- Up Migration
-- Storage only: actor authorization, append-only access and transition policy require future writers.
CREATE TABLE nutrasa.catalog_capability_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  subject_id uuid NOT NULL,
  capability text COLLATE "C" NOT NULL,
  scope text COLLATE "C" NOT NULL,
  action text NOT NULL,
  actor_subject_id uuid NOT NULL,
  reason text NOT NULL,
  request_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT catalog_capability_events_subject_fkey FOREIGN KEY (subject_id) REFERENCES nutrasa.app_users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_capability_events_actor_fkey FOREIGN KEY (actor_subject_id) REFERENCES nutrasa.app_users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_capability_events_subject_capability_scope_id_key UNIQUE (subject_id, capability, scope, id),
  CONSTRAINT catalog_capability_events_number_check CHECK (event_number > 0),
  CONSTRAINT catalog_capability_events_capability_check CHECK (capability ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_events_scope_check CHECK (scope ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_events_action_check CHECK (action IN ('GRANT', 'REVOKE')),
  CONSTRAINT catalog_capability_events_reason_check CHECK (reason ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_events_request_check CHECK (request_id ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_events_time_check CHECK (pg_catalog.isfinite(recorded_at))
);

CREATE TABLE nutrasa.catalog_capability_assignments (
  subject_id uuid NOT NULL,
  capability text COLLATE "C" NOT NULL,
  scope text COLLATE "C" NOT NULL,
  last_event_id uuid NOT NULL,
  PRIMARY KEY (subject_id, capability, scope),
  CONSTRAINT catalog_capability_assignments_capability_check CHECK (capability ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_assignments_scope_check CHECK (scope ~ '[^[:space:]]'),
  CONSTRAINT catalog_capability_assignments_event_fkey FOREIGN KEY (subject_id, capability, scope, last_event_id)
    REFERENCES nutrasa.catalog_capability_events (subject_id, capability, scope, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE
);

-- Down Migration
-- Block inserts while checking: existing authority history must never disappear through DOWN.
LOCK TABLE nutrasa.catalog_capability_events, nutrasa.catalog_capability_assignments IN ACCESS EXCLUSIVE MODE;
SELECT 1 / ((NOT EXISTS (SELECT 1 FROM nutrasa.catalog_capability_events)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_capability_assignments)
  AND pg_catalog.current_setting('transaction_isolation') = 'read committed')::integer);
DROP TABLE nutrasa.catalog_capability_assignments;
DROP TABLE nutrasa.catalog_capability_events;
