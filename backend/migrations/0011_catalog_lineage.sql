-- Up Migration
-- Structural attribution only. These constraints do not authenticate an actor or authorize a writer.
CREATE TABLE nutrasa.catalog_revision_lineage_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_number bigint GENERATED ALWAYS AS IDENTITY,
  food_revision_id uuid NOT NULL,
  actor_subject_id uuid NOT NULL,
  event_kind text COLLATE "C" NOT NULL,
  previous_event_id uuid,
  serving_id uuid,
  nutrient_code text COLLATE "C",
  other_revision_id uuid,
  origin_event_id uuid,
  request_id uuid NOT NULL,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT catalog_lineage_revision_id_key UNIQUE (food_revision_id, id),
  CONSTRAINT catalog_lineage_revision_number_key UNIQUE (food_revision_id, event_number),
  CONSTRAINT catalog_lineage_previous_key UNIQUE (previous_event_id),
  CONSTRAINT catalog_lineage_revision_fkey FOREIGN KEY (food_revision_id)
    REFERENCES nutrasa.food_revisions (id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_lineage_actor_fkey FOREIGN KEY (actor_subject_id)
    REFERENCES nutrasa.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_lineage_previous_fkey FOREIGN KEY (food_revision_id, previous_event_id)
    REFERENCES nutrasa.catalog_revision_lineage_events (food_revision_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_lineage_other_revision_fkey FOREIGN KEY (other_revision_id)
    REFERENCES nutrasa.food_revisions (id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_lineage_origin_fkey FOREIGN KEY (other_revision_id, origin_event_id)
    REFERENCES nutrasa.catalog_revision_lineage_events (food_revision_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_lineage_event_number_check CHECK (event_number > 0),
  CONSTRAINT catalog_lineage_kind_check CHECK (event_kind IN (
    'CREATE_REVISION', 'UPDATE_REVISION', 'INSERT_NUTRIENT', 'UPDATE_NUTRIENT', 'DELETE_NUTRIENT',
    'MOVE_NUTRIENT_OUT', 'MOVE_NUTRIENT_IN', 'INSERT_SERVING', 'UPDATE_SERVING', 'DELETE_SERVING',
    'MOVE_SERVING_OUT', 'MOVE_SERVING_IN')),
  CONSTRAINT catalog_lineage_previous_self_check CHECK (previous_event_id IS NULL OR previous_event_id <> id),
  CONSTRAINT catalog_lineage_other_self_check CHECK (other_revision_id IS NULL OR other_revision_id <> food_revision_id),
  CONSTRAINT catalog_lineage_root_check CHECK ((event_kind = 'CREATE_REVISION') = (previous_event_id IS NULL)),
  CONSTRAINT catalog_lineage_locator_check CHECK (
    (event_kind IN ('CREATE_REVISION', 'UPDATE_REVISION') AND serving_id IS NULL AND nutrient_code IS NULL)
    OR (event_kind IN ('INSERT_NUTRIENT', 'UPDATE_NUTRIENT', 'DELETE_NUTRIENT', 'MOVE_NUTRIENT_OUT', 'MOVE_NUTRIENT_IN')
      AND nutrient_code IS NOT NULL AND serving_id IS NULL)
    OR (event_kind IN ('INSERT_SERVING', 'UPDATE_SERVING', 'DELETE_SERVING', 'MOVE_SERVING_OUT', 'MOVE_SERVING_IN')
      AND serving_id IS NOT NULL AND nutrient_code IS NULL)),
  CONSTRAINT catalog_lineage_move_check CHECK (
    (event_kind IN ('MOVE_NUTRIENT_OUT', 'MOVE_NUTRIENT_IN', 'MOVE_SERVING_OUT', 'MOVE_SERVING_IN'))
      = (other_revision_id IS NOT NULL)),
  CONSTRAINT catalog_lineage_origin_check CHECK (
    (event_kind IN ('MOVE_NUTRIENT_IN', 'MOVE_SERVING_IN')) = (origin_event_id IS NOT NULL)),
  CONSTRAINT catalog_lineage_nutrient_check CHECK (nutrient_code IS NULL OR nutrient_code IN (
    'energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'sugar_g',
    'saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg')),
  CONSTRAINT catalog_lineage_reason_check CHECK (reason ~ '[^[:space:]]'),
  CONSTRAINT catalog_lineage_recorded_at_check CHECK (pg_catalog.isfinite(recorded_at))
);
CREATE UNIQUE INDEX catalog_lineage_root_idx ON nutrasa.catalog_revision_lineage_events (food_revision_id)
  WHERE previous_event_id IS NULL;
CREATE INDEX catalog_lineage_actor_idx ON nutrasa.catalog_revision_lineage_events (actor_subject_id);
CREATE INDEX catalog_lineage_other_revision_idx ON nutrasa.catalog_revision_lineage_events (other_revision_id)
  WHERE other_revision_id IS NOT NULL;

-- Unexpected inherited ACL must not expose new lineage or new bindings on existing audit tables.
SELECT 1 / ((NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault(c.relkind, c.relowner))) a
  WHERE n.nspname = 'nutrasa' AND c.relname IN (
    'catalog_revision_lineage_events', 'catalog_revision_lineage_events_event_number_seq',
    'catalog_reviews', 'catalog_import_batches') AND a.grantee <> c.relowner
))::integer);

ALTER TABLE nutrasa.catalog_reviews
  ADD COLUMN actor_subject_id uuid,
  ADD COLUMN lineage_event_id uuid,
  ADD CONSTRAINT catalog_reviews_actor_fkey FOREIGN KEY (actor_subject_id)
    REFERENCES nutrasa.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  ADD CONSTRAINT catalog_reviews_lineage_fkey FOREIGN KEY (food_revision_id, lineage_event_id)
    REFERENCES nutrasa.catalog_revision_lineage_events (food_revision_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  ADD CONSTRAINT catalog_reviews_actor_binding_check CHECK (actor_subject_id IS NULL
    OR actor_subject COLLATE "C" = 'app_users:' || actor_subject_id::text),
  ADD CONSTRAINT catalog_reviews_lineage_context_check CHECK (lineage_event_id IS NULL
    OR (actor_subject_id IS NOT NULL AND food_revision_id IS NOT NULL)),
  ADD CONSTRAINT catalog_reviews_lineage_required_check CHECK (actor_subject_id IS NULL
    OR NOT ((review_kind = 'NUTRITION' AND decision = 'ACCEPTED') OR review_kind = 'PUBLICATION')
    OR lineage_event_id IS NOT NULL);
CREATE INDEX catalog_reviews_actor_subject_idx ON nutrasa.catalog_reviews (actor_subject_id);
CREATE INDEX catalog_reviews_lineage_event_idx ON nutrasa.catalog_reviews (lineage_event_id);

ALTER TABLE nutrasa.catalog_import_batches
  ADD COLUMN actor_subject_id uuid,
  ADD CONSTRAINT catalog_import_batches_actor_fkey FOREIGN KEY (actor_subject_id)
    REFERENCES nutrasa.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  ADD CONSTRAINT catalog_import_batches_actor_binding_check CHECK (actor_subject_id IS NULL
    OR actor_subject COLLATE "C" = 'app_users:' || actor_subject_id::text);
CREATE INDEX catalog_import_batches_actor_subject_idx ON nutrasa.catalog_import_batches (actor_subject_id);

-- Down Migration
-- Hold all affected tables until the evidence guard and DDL commit or roll back together.
LOCK TABLE nutrasa.catalog_reviews, nutrasa.catalog_import_batches,
  nutrasa.catalog_revision_lineage_events IN ACCESS EXCLUSIVE MODE;
SELECT 1 / ((NOT EXISTS (SELECT 1 FROM nutrasa.catalog_revision_lineage_events)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_reviews WHERE actor_subject_id IS NOT NULL OR lineage_event_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_import_batches WHERE actor_subject_id IS NOT NULL)
  AND pg_catalog.current_setting('transaction_isolation') = 'read committed')::integer);
DROP INDEX nutrasa.catalog_reviews_actor_subject_idx;
DROP INDEX nutrasa.catalog_reviews_lineage_event_idx;
ALTER TABLE nutrasa.catalog_reviews
  DROP CONSTRAINT catalog_reviews_lineage_fkey,
  DROP CONSTRAINT catalog_reviews_actor_fkey,
  DROP CONSTRAINT catalog_reviews_actor_binding_check,
  DROP CONSTRAINT catalog_reviews_lineage_context_check,
  DROP CONSTRAINT catalog_reviews_lineage_required_check,
  DROP COLUMN actor_subject_id,
  DROP COLUMN lineage_event_id;
DROP INDEX nutrasa.catalog_import_batches_actor_subject_idx;
ALTER TABLE nutrasa.catalog_import_batches
  DROP CONSTRAINT catalog_import_batches_actor_fkey,
  DROP CONSTRAINT catalog_import_batches_actor_binding_check,
  DROP COLUMN actor_subject_id;
DROP TABLE nutrasa.catalog_revision_lineage_events;
