-- Up Migration
CREATE TABLE nutrasa.foods (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  food_type text NOT NULL,
  region text,
  publication_status text NOT NULL,
  current_published_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT foods_canonical_name_nonblank_check CHECK (canonical_name ~ '[^[:space:]]'),
  CONSTRAINT foods_normalized_name_nonblank_check CHECK (normalized_name ~ '[^[:space:]]'),
  CONSTRAINT foods_food_type_nonblank_check CHECK (food_type ~ '[^[:space:]]'),
  CONSTRAINT foods_region_nonblank_check CHECK (region IS NULL OR region ~ '[^[:space:]]'),
  CONSTRAINT foods_publication_status_check CHECK (publication_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT foods_published_pointer_check CHECK (publication_status <> 'PUBLISHED' OR current_published_revision_id IS NOT NULL),
  CONSTRAINT foods_created_at_finite_check CHECK (pg_catalog.isfinite(created_at)),
  CONSTRAINT foods_updated_at_finite_check CHECK (pg_catalog.isfinite(updated_at))
);

CREATE INDEX foods_normalized_name_idx ON nutrasa.foods USING btree (normalized_name);

CREATE TABLE nutrasa.food_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  food_id uuid NOT NULL,
  revision_number integer NOT NULL,
  source_id uuid NOT NULL,
  basis_quantity numeric(14,5) NOT NULL,
  basis_unit text NOT NULL,
  composition_definition text NOT NULL,
  source_method text NOT NULL,
  quality_status text NOT NULL,
  published_at timestamptz,
  CONSTRAINT food_revisions_food_revision_key UNIQUE (food_id, revision_number),
  CONSTRAINT food_revisions_food_id_id_key UNIQUE (food_id, id),
  CONSTRAINT food_revisions_food_id_fkey FOREIGN KEY (food_id) REFERENCES nutrasa.foods (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT food_revisions_source_id_fkey FOREIGN KEY (source_id) REFERENCES nutrasa.food_sources (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT food_revisions_revision_number_check CHECK (revision_number > 0),
  CONSTRAINT food_revisions_basis_quantity_check CHECK (
    basis_quantity > 0 AND basis_quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  CONSTRAINT food_revisions_basis_unit_check CHECK (basis_unit IN ('g', 'ml')),
  CONSTRAINT food_revisions_composition_definition_nonblank_check CHECK (composition_definition ~ '[^[:space:]]'),
  CONSTRAINT food_revisions_source_method_nonblank_check CHECK (source_method ~ '[^[:space:]]'),
  CONSTRAINT food_revisions_quality_status_check CHECK (quality_status IN ('DRAFT', 'REVIEWED', 'PUBLISHED')),
  CONSTRAINT food_revisions_published_at_finite_check CHECK (published_at IS NULL OR pg_catalog.isfinite(published_at)),
  CONSTRAINT food_revisions_published_at_status_check CHECK ((quality_status = 'PUBLISHED') = (published_at IS NOT NULL))
);

CREATE TABLE nutrasa.food_revision_nutrients (
  food_revision_id uuid NOT NULL,
  nutrient_code text NOT NULL,
  value numeric(14,5),
  PRIMARY KEY (food_revision_id, nutrient_code),
  CONSTRAINT food_revision_nutrients_revision_fkey FOREIGN KEY (food_revision_id) REFERENCES nutrasa.food_revisions (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT food_revision_nutrients_code_check CHECK (nutrient_code IN (
    'energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'sugar_g',
    'saturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg')),
  CONSTRAINT food_revision_nutrients_value_check CHECK (
    value IS NULL OR (value >= 0 AND value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)))
);

ALTER TABLE nutrasa.foods ADD CONSTRAINT foods_current_published_revision_fkey
  FOREIGN KEY (id, current_published_revision_id) REFERENCES nutrasa.food_revisions (food_id, id)
  MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE;

-- Down Migration
ALTER TABLE nutrasa.foods DROP CONSTRAINT foods_current_published_revision_fkey;
DROP TABLE nutrasa.food_revision_nutrients;
DROP TABLE nutrasa.food_revisions;
DROP TABLE nutrasa.foods;
