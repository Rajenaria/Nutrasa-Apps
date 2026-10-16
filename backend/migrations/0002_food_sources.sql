-- Up Migration
CREATE TABLE nutrasa.food_sources (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL,
  edition text,
  reference text NOT NULL,
  license_status text NOT NULL,
  permission_notes text,
  accessed_at timestamptz,
  CONSTRAINT food_sources_name_nonblank_check CHECK (name ~ '[^[:space:]]'),
  CONSTRAINT food_sources_source_type_nonblank_check CHECK (source_type ~ '[^[:space:]]'),
  CONSTRAINT food_sources_edition_nonblank_check CHECK (edition IS NULL OR edition ~ '[^[:space:]]'),
  CONSTRAINT food_sources_reference_nonblank_check CHECK (reference ~ '[^[:space:]]'),
  CONSTRAINT food_sources_license_status_check CHECK (license_status IN ('UNVERIFIED', 'ALLOWED', 'RESTRICTED', 'DENIED')),
  CONSTRAINT food_sources_permission_notes_nonblank_check CHECK (permission_notes IS NULL OR permission_notes ~ '[^[:space:]]'),
  CONSTRAINT food_sources_accessed_at_finite_check CHECK (accessed_at IS NULL OR pg_catalog.isfinite(accessed_at))
);

-- Down Migration
DROP TABLE nutrasa.food_sources;
