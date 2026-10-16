-- Up Migration
ALTER TABLE nutrasa.food_revisions
  ADD COLUMN source_record_reference text,
  ADD COLUMN source_reference_snapshot text,
  ADD CONSTRAINT food_revisions_source_record_reference_nonblank_check
    CHECK (source_record_reference IS NULL OR source_record_reference ~ '[^[:space:]]'),
  ADD CONSTRAINT food_revisions_source_reference_snapshot_nonblank_check
    CHECK (source_reference_snapshot IS NULL OR source_reference_snapshot ~ '[^[:space:]]'),
  ADD CONSTRAINT food_revisions_source_provenance_pair_check
    CHECK ((source_record_reference IS NULL) = (source_reference_snapshot IS NULL));

CREATE TABLE nutrasa.serving_definitions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  food_revision_id uuid NOT NULL,
  label text NOT NULL,
  base_quantity numeric(14,5) NOT NULL,
  method text NOT NULL,
  reviewed boolean NOT NULL,
  sort_order integer NOT NULL,
  source_id uuid NOT NULL,
  source_record_reference text NOT NULL,
  source_reference_snapshot text NOT NULL,
  CONSTRAINT serving_definitions_food_revision_id_fkey FOREIGN KEY (food_revision_id) REFERENCES nutrasa.food_revisions (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT serving_definitions_source_id_fkey FOREIGN KEY (source_id) REFERENCES nutrasa.food_sources (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT serving_definitions_label_nonblank_check CHECK (label ~ '[^[:space:]]'),
  CONSTRAINT serving_definitions_base_quantity_check CHECK (
    base_quantity > 0 AND base_quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  CONSTRAINT serving_definitions_method_nonblank_check CHECK (method ~ '[^[:space:]]'),
  CONSTRAINT serving_definitions_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT serving_definitions_source_record_reference_nonblank_check CHECK (source_record_reference ~ '[^[:space:]]'),
  CONSTRAINT serving_definitions_source_reference_snapshot_nonblank_check CHECK (source_reference_snapshot ~ '[^[:space:]]')
);

CREATE INDEX serving_definitions_revision_sort_idx ON nutrasa.serving_definitions (food_revision_id, sort_order);

-- Down Migration
DROP TABLE nutrasa.serving_definitions;
ALTER TABLE nutrasa.food_revisions
  DROP CONSTRAINT food_revisions_source_record_reference_nonblank_check,
  DROP CONSTRAINT food_revisions_source_reference_snapshot_nonblank_check,
  DROP CONSTRAINT food_revisions_source_provenance_pair_check,
  DROP COLUMN source_record_reference,
  DROP COLUMN source_reference_snapshot;
