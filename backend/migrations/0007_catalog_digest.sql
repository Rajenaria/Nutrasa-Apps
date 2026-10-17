-- Up Migration
-- Read-only calculation only. No helper authenticates an actor or authorizes a review.
CREATE FUNCTION nutrasa.catalog_source_permission_payload_v1(
  p_source_id uuid, p_license_status text, p_permission_scope jsonb,
  p_attribution_required boolean, p_attribution_text text,
  p_valid_from timestamptz, p_valid_until timestamptz,
  p_evidence_reference text, p_evidence_sha256 text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $permission$
SELECT pg_catalog.jsonb_build_object(
  'canonical_version', 1, 'payload_kind', 'SOURCE_PERMISSION',
  'source_snapshot', pg_catalog.jsonb_build_object(
    'id', s.id, 'name', s.name, 'source_type', s.source_type, 'edition', s.edition,
    'reference', s.reference, 'license_status', s.license_status,
    'permission_notes', s.permission_notes,
    'accessed_at', pg_catalog.to_char(s.accessed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
  'license_status', p_license_status, 'permission_scope', p_permission_scope,
  'attribution_required', p_attribution_required, 'attribution_text', p_attribution_text,
  'valid_from', pg_catalog.to_char(p_valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'valid_until', pg_catalog.to_char(p_valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'evidence_reference', p_evidence_reference, 'evidence_sha256', p_evidence_sha256)
FROM nutrasa.food_sources s
WHERE s.id = p_source_id
  AND p_license_status IN ('UNVERIFIED', 'ALLOWED', 'RESTRICTED', 'DENIED')
  AND p_evidence_reference ~ '[^[:space:]]'
  AND (p_evidence_sha256 IS NULL OR (char_length(p_evidence_sha256) = 64 AND p_evidence_sha256 COLLATE "C" ~ '^[a-f0-9]{64}$'))
  AND (p_attribution_text IS NULL OR p_attribution_text ~ '[^[:space:]]')
  AND (p_attribution_required IS DISTINCT FROM true OR p_attribution_text IS NOT NULL)
  AND (p_valid_from IS NULL OR pg_catalog.isfinite(p_valid_from))
  AND (p_valid_until IS NULL OR (pg_catalog.isfinite(p_valid_until) AND p_valid_from IS NOT NULL AND p_valid_until > p_valid_from))
  AND (p_permission_scope IS NULL OR (
    pg_catalog.jsonb_typeof(p_permission_scope) = 'object'
    AND p_permission_scope = pg_catalog.jsonb_build_object('store', p_permission_scope -> 'store',
      'redistribute', p_permission_scope -> 'redistribute', 'offline_cache', p_permission_scope -> 'offline_cache')
    AND pg_catalog.jsonb_typeof(p_permission_scope -> 'store') = 'boolean'
    AND pg_catalog.jsonb_typeof(p_permission_scope -> 'redistribute') = 'boolean'
    AND pg_catalog.jsonb_typeof(p_permission_scope -> 'offline_cache') = 'boolean'));
$permission$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_source_permission_payload_v1(uuid,text,jsonb,boolean,text,timestamptz,timestamptz,text,text) FROM PUBLIC;

-- The explicit prior-event list is content, not proof of current permission or reviewer authority.
CREATE FUNCTION nutrasa.catalog_revision_payload_v1(p_revision_id uuid, p_permission_review_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $revision$
SELECT pg_catalog.jsonb_build_object(
  'canonical_version', 1, 'payload_kind', 'REVISION_CONTENT',
  'revision', pg_catalog.jsonb_build_object('id', r.id, 'food_id', r.food_id,
    'revision_number', r.revision_number, 'basis_quantity', r.basis_quantity::text,
    'basis_unit', r.basis_unit, 'composition_definition', r.composition_definition,
    'source_method', r.source_method, 'source_id', r.source_id,
    'source_record_reference', r.source_record_reference,
    'source_reference_snapshot', r.source_reference_snapshot, 'import_batch_id', r.import_batch_id),
  'nutrients', COALESCE((SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('nutrient_code', n.nutrient_code, 'value', n.value::text)
    ORDER BY pg_catalog.array_position(ARRAY['energy_kcal','protein_g','carbohydrate_g','fat_g','fiber_g','sugar_g',
      'saturated_fat_g','trans_fat_g','cholesterol_mg','sodium_mg','potassium_mg']::text[], n.nutrient_code))
    FROM nutrasa.food_revision_nutrients n WHERE n.food_revision_id = r.id), '[]'::jsonb),
  'servings', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', d.id, 'food_revision_id', d.food_revision_id, 'label', d.label,
    'base_quantity', d.base_quantity::text, 'method', d.method, 'reviewed', d.reviewed,
    'sort_order', d.sort_order, 'source_id', d.source_id,
    'source_record_reference', d.source_record_reference,
    'source_reference_snapshot', d.source_reference_snapshot) ORDER BY d.id)
    FROM nutrasa.serving_definitions d WHERE d.food_revision_id = r.id), '[]'::jsonb),
  'sources', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source_id', v.source_id, 'permission_review_id', v.id, 'content_digest', v.content_digest) ORDER BY v.source_id)
    FROM nutrasa.catalog_reviews v WHERE v.id = ANY(p_permission_review_ids)))
FROM nutrasa.food_revisions r
WHERE r.id = p_revision_id AND p_permission_review_ids IS NOT NULL
  AND pg_catalog.cardinality(p_permission_review_ids) =
    (SELECT count(DISTINCT v.source_id) FROM nutrasa.catalog_reviews v WHERE v.id = ANY(p_permission_review_ids))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(p_permission_review_ids) AS chosen(id)
    LEFT JOIN nutrasa.catalog_reviews v ON v.id = chosen.id
    WHERE v.id IS NULL OR v.review_kind <> 'SOURCE_PERMISSION')
  AND NOT EXISTS (SELECT v.source_id FROM nutrasa.catalog_reviews v WHERE v.id = ANY(p_permission_review_ids)
    EXCEPT (SELECT r.source_id UNION SELECT d.source_id FROM nutrasa.serving_definitions d WHERE d.food_revision_id = r.id))
  AND NOT EXISTS ((SELECT r.source_id UNION SELECT d.source_id FROM nutrasa.serving_definitions d WHERE d.food_revision_id = r.id)
    EXCEPT SELECT v.source_id FROM nutrasa.catalog_reviews v WHERE v.id = ANY(p_permission_review_ids));
$revision$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_revision_payload_v1(uuid,uuid[]) FROM PUBLIC;

-- SQL NULL stays NULL. A calculated hash is never a review or publication authorization.
CREATE FUNCTION nutrasa.catalog_payload_digest_v1(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $digest$
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload::text, 'UTF8')), 'hex')
WHERE pg_catalog.jsonb_typeof(p_payload) = 'object'
  AND p_payload -> 'canonical_version' = '1'::jsonb
  AND p_payload ->> 'payload_kind' IN ('SOURCE_PERMISSION', 'REVISION_CONTENT');
$digest$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_payload_digest_v1(jsonb) FROM PUBLIC;

-- Down Migration
DROP FUNCTION nutrasa.catalog_payload_digest_v1(jsonb);
DROP FUNCTION nutrasa.catalog_revision_payload_v1(uuid,uuid[]);
DROP FUNCTION nutrasa.catalog_source_permission_payload_v1(uuid,text,jsonb,boolean,text,timestamptz,timestamptz,text,text);
