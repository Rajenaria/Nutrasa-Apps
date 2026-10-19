-- Up Migration
-- Internal read-only facts, never editorial authorization or automatic enforcement.
CREATE FUNCTION nutrasa.catalog_revision_content_mutable_v1(p_revision_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $mutable$
SELECT COALESCE(pg_catalog.cardinality(p_revision_ids) > 0, false)
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_revision_ids) AS requested(id)
    LEFT JOIN nutrasa.food_revisions r ON r.id = requested.id
    WHERE r.id IS NULL OR r.quality_status = 'PUBLISHED' OR r.published_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM nutrasa.foods f WHERE f.current_published_revision_id = r.id)
      OR EXISTS (SELECT 1 FROM nutrasa.catalog_reviews v
        WHERE v.food_revision_id = r.id AND v.review_kind = 'PUBLICATION'));
$mutable$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_revision_content_mutable_v1(uuid[]) FROM PUBLIC;

-- Checks reparenting of an existing category. A future writer must lock BEFORE this snapshot.
CREATE FUNCTION nutrasa.catalog_category_parent_valid_v1(p_category_id uuid, p_parent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $category$
SELECT EXISTS (SELECT 1 FROM nutrasa.categories c WHERE c.id = p_category_id)
  AND (p_parent_id IS NULL OR (
    EXISTS (SELECT 1 FROM nutrasa.categories c WHERE c.id = p_parent_id)
    AND NOT EXISTS (
      SELECT 1 FROM (
        WITH RECURSIVE ancestors(id, parent_id, visited, repeated) AS (
          SELECT c.id, c.parent_id, ARRAY[c.id]::uuid[], false
          FROM nutrasa.categories c WHERE c.id = p_parent_id
          UNION ALL
          SELECT c.id, c.parent_id, a.visited || c.id, c.id = ANY(a.visited)
          FROM nutrasa.categories c JOIN ancestors a ON c.id = a.parent_id
          WHERE NOT a.repeated
        )
        SELECT id, repeated FROM ancestors
      ) ancestry WHERE ancestry.id = p_category_id OR ancestry.repeated
    )));
$category$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_category_parent_valid_v1(uuid,uuid) FROM PUBLIC;

-- No overall eligible/ALLOW flag. Clinical authority, identity and distribution policy are NOT evaluated.
CREATE FUNCTION nutrasa.catalog_publication_preflight_v1(p_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $preflight$
SELECT assessment.facts FROM (
  WITH target AS (
    SELECT r.*, f.publication_status, f.current_published_revision_id
    FROM nutrasa.food_revisions r JOIN nutrasa.foods f ON f.id = r.food_id
    WHERE r.id = p_revision_id
  ), source_ids AS (
    SELECT source_id FROM target
    UNION SELECT s.source_id FROM nutrasa.serving_definitions s WHERE s.food_revision_id = p_revision_id
  ), permissions AS (
    SELECT s.source_id, v.id AS permission_id, v.decision, v.license_status,
      v.permission_scope, v.attribution_required, v.attribution_text, v.valid_from, v.valid_until,
      v.evidence_reference, v.source_snapshot, v.content_digest, payload.value AS payload
    FROM source_ids s
    LEFT JOIN LATERAL (
      SELECT review.* FROM nutrasa.catalog_reviews review
      WHERE review.source_id = s.source_id AND review.review_kind = 'SOURCE_PERMISSION'
      ORDER BY review.event_number DESC LIMIT 1
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT nutrasa.catalog_source_permission_payload_v1(s.source_id, v.license_status,
        v.permission_scope, v.attribution_required, v.attribution_text, v.valid_from,
        v.valid_until, v.evidence_reference, v.evidence_sha256) AS value
    ) payload ON true
  ), current_content AS (
    SELECT nutrasa.catalog_payload_digest_v1(nutrasa.catalog_revision_payload_v1(p_revision_id,
      ARRAY(SELECT permission_id FROM permissions WHERE permission_id IS NOT NULL ORDER BY permission_id))) AS digest
  ), nutrition AS (
    SELECT v.* FROM nutrasa.catalog_reviews v
    WHERE v.food_revision_id = p_revision_id AND v.review_kind = 'NUTRITION'
    ORDER BY v.event_number DESC LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'assessment_kind', 'CATALOG_STRUCTURAL_PREFLIGHT_V1',
    'assessed_at', pg_catalog.statement_timestamp(),
    'revision_id', t.id, 'food_id', t.food_id,
    'quality_status', t.quality_status, 'publication_status', t.publication_status,
    'current_published_revision_id', t.current_published_revision_id,
    'content_mutable', nutrasa.catalog_revision_content_mutable_v1(ARRAY[t.id]),
    'all_nutrient_rows_present', (SELECT count(*) = 11 FROM nutrasa.food_revision_nutrients n WHERE n.food_revision_id = t.id),
    'core_nutrients_known', (SELECT count(*) = 4 FROM nutrasa.food_revision_nutrients n
      WHERE n.food_revision_id = t.id AND n.nutrient_code IN ('energy_kcal','protein_g','carbohydrate_g','fat_g')
        AND n.value IS NOT NULL),
    'composition_provenance_present', t.source_record_reference IS NOT NULL AND t.source_reference_snapshot IS NOT NULL,
    'all_servings_reviewed', NOT EXISTS (SELECT 1 FROM nutrasa.serving_definitions s WHERE s.food_revision_id = t.id AND NOT s.reviewed),
    'current_content_digest', content.digest,
    'sources', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source_id', p.source_id, 'permission_review_id', p.permission_id,
      'latest_decision_accepted', COALESCE(p.decision = 'ACCEPTED', false),
      'license_allowed', COALESCE(p.license_status = 'ALLOWED', false),
      'permission_scope', p.permission_scope,
      'evidence_reference_present', p.evidence_reference IS NOT NULL,
      'attribution_required', p.attribution_required,
      'attribution_text_present', p.attribution_text IS NOT NULL,
      'valid_from', p.valid_from, 'valid_until', p.valid_until,
      'valid_from_reached', CASE WHEN p.valid_from IS NULL THEN NULL ELSE p.valid_from <= pg_catalog.statement_timestamp() END,
      'valid_until_strictly_future', CASE WHEN p.valid_until IS NULL THEN NULL ELSE p.valid_until > pg_catalog.statement_timestamp() END,
      'source_digest_matches', COALESCE(nutrasa.catalog_payload_digest_v1(p.payload) = p.content_digest
        AND p.payload -> 'source_snapshot' = p.source_snapshot, false)
    ) ORDER BY p.source_id) FROM permissions p),
    'nutrition_review_id', n.id,
    'latest_nutrition_accepted', COALESCE(n.decision = 'ACCEPTED', false),
    'nutrition_digest_matches', COALESCE(content.digest = n.content_digest AND n.canonical_version = 1, false),
    'nutrition_sources_match_latest', n.id IS NOT NULL
      AND (SELECT count(*) FROM permissions WHERE permission_id IS NOT NULL) = (SELECT count(*) FROM source_ids)
      AND ARRAY(SELECT links.permission_review_id FROM nutrasa.catalog_review_sources links WHERE links.review_id = n.id ORDER BY links.permission_review_id)
        = ARRAY(SELECT permission_id FROM permissions WHERE permission_id IS NOT NULL ORDER BY permission_id)
  ) AS facts
  FROM target t CROSS JOIN current_content content LEFT JOIN nutrition n ON true
) assessment;
$preflight$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_publication_preflight_v1(uuid) FROM PUBLIC;

-- Reject inherited nonowner EXECUTE, including schema-specific default grants.
SELECT 1 / ((NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace,
    LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
  WHERE n.nspname = 'nutrasa'
    AND p.proname IN ('catalog_revision_content_mutable_v1', 'catalog_category_parent_valid_v1', 'catalog_publication_preflight_v1')
    AND a.grantee <> p.proowner
))::integer);

-- Down Migration
DROP FUNCTION nutrasa.catalog_publication_preflight_v1(uuid);
DROP FUNCTION nutrasa.catalog_category_parent_valid_v1(uuid,uuid);
DROP FUNCTION nutrasa.catalog_revision_content_mutable_v1(uuid[]);
