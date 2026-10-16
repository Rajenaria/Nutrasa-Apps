-- Up Migration
CREATE TABLE nutrasa.catalog_reviews (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  review_kind text NOT NULL,
  decision text NOT NULL,
  source_id uuid,
  food_revision_id uuid,
  actor_subject text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  reason text NOT NULL,
  evidence_reference text,
  evidence_sha256 text,
  canonical_version smallint NOT NULL,
  content_digest text NOT NULL,
  approval_review_id uuid,
  source_snapshot jsonb,
  license_status text,
  permission_scope jsonb,
  attribution_required boolean,
  attribution_text text,
  valid_from timestamptz,
  valid_until timestamptz,
  CONSTRAINT catalog_reviews_id_source_key UNIQUE (id, source_id),
  CONSTRAINT catalog_reviews_source_id_fkey FOREIGN KEY (source_id) REFERENCES nutrasa.food_sources (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_reviews_food_revision_id_fkey FOREIGN KEY (food_revision_id) REFERENCES nutrasa.food_revisions (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_reviews_approval_review_id_fkey FOREIGN KEY (approval_review_id) REFERENCES nutrasa.catalog_reviews (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_reviews_event_number_check CHECK (event_number > 0),
  CONSTRAINT catalog_reviews_kind_check CHECK (review_kind IN ('SOURCE_PERMISSION', 'NUTRITION', 'PUBLICATION', 'WITHDRAWAL')),
  CONSTRAINT catalog_reviews_decision_check CHECK (decision IN ('ACCEPTED', 'REJECTED', 'REVOKED')),
  CONSTRAINT catalog_reviews_actor_nonblank_check CHECK (actor_subject ~ '[^[:space:]]'),
  CONSTRAINT catalog_reviews_recorded_at_check CHECK (pg_catalog.isfinite(recorded_at)),
  CONSTRAINT catalog_reviews_reason_nonblank_check CHECK (reason ~ '[^[:space:]]'),
  CONSTRAINT catalog_reviews_evidence_nonblank_check CHECK (evidence_reference IS NULL OR evidence_reference ~ '[^[:space:]]'),
  CONSTRAINT catalog_reviews_evidence_hash_check CHECK (evidence_sha256 IS NULL OR
    (char_length(evidence_sha256) = 64 AND evidence_sha256 COLLATE "C" ~ '^[a-f0-9]{64}$')),
  CONSTRAINT catalog_reviews_canonical_version_check CHECK (canonical_version = 1),
  CONSTRAINT catalog_reviews_content_digest_check CHECK
    (char_length(content_digest) = 64 AND content_digest COLLATE "C" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT catalog_reviews_snapshot_check CHECK (source_snapshot IS NULL OR pg_catalog.jsonb_typeof(source_snapshot) = 'object'),
  CONSTRAINT catalog_reviews_license_status_check CHECK (license_status IS NULL OR
    license_status IN ('UNVERIFIED', 'ALLOWED', 'RESTRICTED', 'DENIED')),
  CONSTRAINT catalog_reviews_scope_check CHECK (permission_scope IS NULL OR (
    pg_catalog.jsonb_typeof(permission_scope) = 'object'
    AND permission_scope = pg_catalog.jsonb_build_object('store', permission_scope -> 'store',
      'redistribute', permission_scope -> 'redistribute', 'offline_cache', permission_scope -> 'offline_cache')
    AND pg_catalog.jsonb_typeof(permission_scope -> 'store') = 'boolean'
    AND pg_catalog.jsonb_typeof(permission_scope -> 'redistribute') = 'boolean'
    AND pg_catalog.jsonb_typeof(permission_scope -> 'offline_cache') = 'boolean')),
  CONSTRAINT catalog_reviews_attribution_nonblank_check CHECK (attribution_text IS NULL OR attribution_text ~ '[^[:space:]]'),
  CONSTRAINT catalog_reviews_valid_from_check CHECK (valid_from IS NULL OR pg_catalog.isfinite(valid_from)),
  CONSTRAINT catalog_reviews_valid_until_check CHECK (valid_until IS NULL OR pg_catalog.isfinite(valid_until)),
  CONSTRAINT catalog_reviews_target_check CHECK (
    (review_kind = 'SOURCE_PERMISSION' AND source_id IS NOT NULL AND food_revision_id IS NULL)
    OR (review_kind <> 'SOURCE_PERMISSION' AND source_id IS NULL AND food_revision_id IS NOT NULL)),
  CONSTRAINT catalog_reviews_kind_decision_check CHECK (
    (review_kind = 'PUBLICATION' AND decision = 'ACCEPTED')
    OR (review_kind = 'WITHDRAWAL' AND decision = 'REVOKED')
    OR review_kind IN ('SOURCE_PERMISSION', 'NUTRITION')),
  CONSTRAINT catalog_reviews_source_evidence_check CHECK (review_kind <> 'SOURCE_PERMISSION' OR
    (source_snapshot IS NOT NULL AND license_status IS NOT NULL AND evidence_reference IS NOT NULL)),
  CONSTRAINT catalog_reviews_source_fields_check CHECK (review_kind = 'SOURCE_PERMISSION' OR
    (source_snapshot IS NULL AND license_status IS NULL AND permission_scope IS NULL
      AND attribution_required IS NULL AND attribution_text IS NULL AND valid_from IS NULL AND valid_until IS NULL)),
  CONSTRAINT catalog_reviews_accepted_permission_check CHECK
    (review_kind <> 'SOURCE_PERMISSION' OR decision <> 'ACCEPTED' OR
      (license_status = 'ALLOWED' AND permission_scope IS NOT NULL AND attribution_required IS NOT NULL AND valid_from IS NOT NULL)),
  CONSTRAINT catalog_reviews_attribution_check CHECK (attribution_required IS DISTINCT FROM true OR attribution_text IS NOT NULL),
  CONSTRAINT catalog_reviews_valid_range_check CHECK (valid_until IS NULL OR (valid_from IS NOT NULL AND valid_until > valid_from)),
  CONSTRAINT catalog_reviews_approval_check CHECK
    ((review_kind IN ('PUBLICATION', 'WITHDRAWAL') AND approval_review_id IS NOT NULL)
      OR (review_kind IN ('SOURCE_PERMISSION', 'NUTRITION') AND approval_review_id IS NULL)),
  CONSTRAINT catalog_reviews_not_self_check CHECK (approval_review_id IS NULL OR approval_review_id <> id),
  CONSTRAINT catalog_reviews_nutrition_evidence_check CHECK (review_kind <> 'NUTRITION' OR evidence_reference IS NOT NULL)
);

CREATE INDEX catalog_reviews_source_event_idx ON nutrasa.catalog_reviews (source_id, event_number);
CREATE INDEX catalog_reviews_revision_kind_event_idx ON nutrasa.catalog_reviews (food_revision_id, review_kind, event_number);
CREATE INDEX catalog_reviews_approval_idx ON nutrasa.catalog_reviews (approval_review_id);

CREATE TABLE nutrasa.catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_id uuid NOT NULL,
  permission_review_id uuid NOT NULL,
  artifact_reference text NOT NULL,
  artifact_sha256 text NOT NULL,
  parser_version text NOT NULL,
  mapping_version text NOT NULL,
  actor_subject text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  outcome text NOT NULL,
  accepted_revision_count integer NOT NULL,
  rejected_record_count integer NOT NULL,
  result_reference text NOT NULL,
  CONSTRAINT catalog_import_batches_id_source_key UNIQUE (id, source_id),
  CONSTRAINT catalog_import_batches_source_id_fkey FOREIGN KEY (source_id) REFERENCES nutrasa.food_sources (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_import_batches_permission_source_fkey FOREIGN KEY (permission_review_id, source_id)
    REFERENCES nutrasa.catalog_reviews (id, source_id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_import_batches_artifact_nonblank_check CHECK (artifact_reference ~ '[^[:space:]]'),
  CONSTRAINT catalog_import_batches_artifact_hash_check CHECK
    (char_length(artifact_sha256) = 64 AND artifact_sha256 COLLATE "C" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT catalog_import_batches_parser_nonblank_check CHECK (parser_version ~ '[^[:space:]]'),
  CONSTRAINT catalog_import_batches_mapping_nonblank_check CHECK (mapping_version ~ '[^[:space:]]'),
  CONSTRAINT catalog_import_batches_actor_nonblank_check CHECK (actor_subject ~ '[^[:space:]]'),
  CONSTRAINT catalog_import_batches_recorded_at_check CHECK (pg_catalog.isfinite(recorded_at)),
  CONSTRAINT catalog_import_batches_outcome_check CHECK (outcome IN ('IMPORTED', 'REJECTED')),
  CONSTRAINT catalog_import_batches_accepted_count_check CHECK (accepted_revision_count >= 0),
  CONSTRAINT catalog_import_batches_rejected_count_check CHECK (rejected_record_count >= 0),
  CONSTRAINT catalog_import_batches_rejected_zero_check CHECK (outcome <> 'REJECTED' OR accepted_revision_count = 0),
  CONSTRAINT catalog_import_batches_result_nonblank_check CHECK (result_reference ~ '[^[:space:]]')
);

CREATE INDEX catalog_import_batches_permission_source_idx ON nutrasa.catalog_import_batches (permission_review_id, source_id);
CREATE INDEX catalog_import_batches_source_artifact_idx ON nutrasa.catalog_import_batches (source_id, artifact_sha256);

CREATE TABLE nutrasa.catalog_review_sources (
  review_id uuid NOT NULL,
  source_id uuid NOT NULL,
  permission_review_id uuid NOT NULL,
  PRIMARY KEY (review_id, source_id),
  CONSTRAINT catalog_review_sources_review_id_fkey FOREIGN KEY (review_id) REFERENCES nutrasa.catalog_reviews (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_review_sources_source_id_fkey FOREIGN KEY (source_id) REFERENCES nutrasa.food_sources (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT catalog_review_sources_permission_source_fkey FOREIGN KEY (permission_review_id, source_id)
    REFERENCES nutrasa.catalog_reviews (id, source_id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE
);

CREATE INDEX catalog_review_sources_permission_source_idx ON nutrasa.catalog_review_sources (permission_review_id, source_id);

ALTER TABLE nutrasa.food_revisions
  ADD COLUMN import_batch_id uuid,
  ADD CONSTRAINT food_revisions_import_batch_source_fkey FOREIGN KEY (import_batch_id, source_id)
    REFERENCES nutrasa.catalog_import_batches (id, source_id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE;
CREATE INDEX food_revisions_import_batch_source_idx ON nutrasa.food_revisions (import_batch_id, source_id);

-- Down Migration
-- Hold locks through the data guard and DDL; concurrent inserts cannot race the guard.
LOCK TABLE nutrasa.catalog_reviews, nutrasa.catalog_import_batches,
  nutrasa.catalog_review_sources, nutrasa.food_revisions IN ACCESS EXCLUSIVE MODE;
-- Division by zero deliberately refuses destructive DOWN on populated audit.
SELECT 1 / ((NOT EXISTS (SELECT 1 FROM nutrasa.catalog_reviews)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_import_batches)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_review_sources)
  AND NOT EXISTS (SELECT 1 FROM nutrasa.food_revisions WHERE import_batch_id IS NOT NULL)
  AND pg_catalog.current_setting('transaction_isolation') = 'read committed')::integer);
DROP INDEX nutrasa.food_revisions_import_batch_source_idx;
ALTER TABLE nutrasa.food_revisions DROP CONSTRAINT food_revisions_import_batch_source_fkey, DROP COLUMN import_batch_id;
DROP TABLE nutrasa.catalog_review_sources;
DROP TABLE nutrasa.catalog_import_batches;
DROP TABLE nutrasa.catalog_reviews;
