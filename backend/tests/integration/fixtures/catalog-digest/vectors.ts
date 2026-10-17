// Frozen candidate PostgreSQL 18 bytes. Not PostgreSQL-verified until the approved integration run.
// No serializer is executed here; assertions compare actual SQL output with these literal bytes.
export const ids = {
  "source": "00000000-0000-0000-0000-000000000001",
  "otherSource": "00000000-0000-0000-0000-000000000002",
  "food": "00000000-0000-0000-0000-000000000003",
  "revision": "00000000-0000-0000-0000-000000000004",
  "serving": "00000000-0000-0000-0000-000000000005",
  "otherServing": "00000000-0000-0000-0000-000000000006",
  "permission": "00000000-0000-0000-0000-000000000007",
  "otherPermission": "00000000-0000-0000-0000-000000000008",
  "user": "00000000-0000-0000-0000-000000000009"
} as const;

export const vectors = [
  {
    "name": "permission_nulls",
    "text": "{\"valid_from\": null, \"valid_until\": null, \"payload_kind\": \"SOURCE_PERMISSION\", \"license_status\": \"UNVERIFIED\", \"evidence_sha256\": null, \"source_snapshot\": {\"id\": \"00000000-0000-0000-0000-000000000001\", \"name\": \"SYNTHETIC\", \"edition\": null, \"reference\": \"Synthetic bibliography\", \"accessed_at\": null, \"source_type\": \"SYNTHETIC\", \"license_status\": \"UNVERIFIED\", \"permission_notes\": null}, \"attribution_text\": null, \"permission_scope\": null, \"canonical_version\": 1, \"evidence_reference\": \"Synthetic locator\", \"attribution_required\": null}",
    "sha256": "626a006405f49f5d47b86dd1cde0ff14321cc24e566f714b0fd575c4b6013a58"
  },
  {
    "name": "permission_unicode",
    "text": "{\"valid_from\": \"2026-01-02T03:04:05.123456Z\", \"valid_until\": \"2027-01-02T03:04:05.000000Z\", \"payload_kind\": \"SOURCE_PERMISSION\", \"license_status\": \"ALLOWED\", \"evidence_sha256\": \"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\", \"source_snapshot\": {\"id\": \"00000000-0000-0000-0000-000000000001\", \"name\": \" Café é \", \"edition\": null, \"reference\": \"Synthetic bibliography\", \"accessed_at\": \"2026-01-02T03:04:05.123456Z\", \"source_type\": \"SYNTHETIC\", \"license_status\": \"UNVERIFIED\", \"permission_notes\": null}, \"attribution_text\": \" Synthetic attribution \", \"permission_scope\": {\"store\": true, \"redistribute\": false, \"offline_cache\": true}, \"canonical_version\": 1, \"evidence_reference\": \"Synthetic locator\", \"attribution_required\": true}",
    "sha256": "df2e7469e3f272044ce0ff08112130f2885a0b52047db10df7d5ecf14a2bab36"
  },
  {
    "name": "revision_null",
    "text": "{\"sources\": [{\"source_id\": \"00000000-0000-0000-0000-000000000001\", \"content_digest\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\", \"permission_review_id\": \"00000000-0000-0000-0000-000000000007\"}], \"revision\": {\"id\": \"00000000-0000-0000-0000-000000000004\", \"food_id\": \"00000000-0000-0000-0000-000000000003\", \"source_id\": \"00000000-0000-0000-0000-000000000001\", \"basis_unit\": \"g\", \"source_method\": \"SYNTHETIC\", \"basis_quantity\": \"100.00000\", \"import_batch_id\": null, \"revision_number\": 1, \"composition_definition\": \"SYNTHETIC\", \"source_record_reference\": null, \"source_reference_snapshot\": null}, \"servings\": [], \"nutrients\": [{\"value\": \"0.00000\", \"nutrient_code\": \"energy_kcal\"}, {\"value\": null, \"nutrient_code\": \"sugar_g\"}], \"payload_kind\": \"REVISION_CONTENT\", \"canonical_version\": 1}",
    "sha256": "5fbc18223c91d9969ecee2efec48e6533168fa5cd5a6b9b0fb3013bb3bbd27ec"
  },
  {
    "name": "revision_missing",
    "text": "{\"sources\": [{\"source_id\": \"00000000-0000-0000-0000-000000000001\", \"content_digest\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\", \"permission_review_id\": \"00000000-0000-0000-0000-000000000007\"}], \"revision\": {\"id\": \"00000000-0000-0000-0000-000000000004\", \"food_id\": \"00000000-0000-0000-0000-000000000003\", \"source_id\": \"00000000-0000-0000-0000-000000000001\", \"basis_unit\": \"g\", \"source_method\": \"SYNTHETIC\", \"basis_quantity\": \"100.00000\", \"import_batch_id\": null, \"revision_number\": 1, \"composition_definition\": \"SYNTHETIC\", \"source_record_reference\": null, \"source_reference_snapshot\": null}, \"servings\": [], \"nutrients\": [{\"value\": \"0.00000\", \"nutrient_code\": \"energy_kcal\"}], \"payload_kind\": \"REVISION_CONTENT\", \"canonical_version\": 1}",
    "sha256": "a5bcd5212770201a6563373ec07520a2a49cc39e063722de01dfc99139554306"
  },
  {
    "name": "revision_zero",
    "text": "{\"sources\": [{\"source_id\": \"00000000-0000-0000-0000-000000000001\", \"content_digest\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\", \"permission_review_id\": \"00000000-0000-0000-0000-000000000007\"}], \"revision\": {\"id\": \"00000000-0000-0000-0000-000000000004\", \"food_id\": \"00000000-0000-0000-0000-000000000003\", \"source_id\": \"00000000-0000-0000-0000-000000000001\", \"basis_unit\": \"g\", \"source_method\": \"SYNTHETIC\", \"basis_quantity\": \"100.00000\", \"import_batch_id\": null, \"revision_number\": 1, \"composition_definition\": \"SYNTHETIC\", \"source_record_reference\": null, \"source_reference_snapshot\": null}, \"servings\": [], \"nutrients\": [{\"value\": \"0.00000\", \"nutrient_code\": \"energy_kcal\"}, {\"value\": \"0.00000\", \"nutrient_code\": \"sugar_g\"}], \"payload_kind\": \"REVISION_CONTENT\", \"canonical_version\": 1}",
    "sha256": "58f170f694a66bfc36fcc4c14661b256e3d7cb7d717f53be5ae42d67cb0e8ddd"
  },
  {
    "name": "revision_servings",
    "text": "{\"sources\": [{\"source_id\": \"00000000-0000-0000-0000-000000000001\", \"content_digest\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\", \"permission_review_id\": \"00000000-0000-0000-0000-000000000007\"}, {\"source_id\": \"00000000-0000-0000-0000-000000000002\", \"content_digest\": \"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\", \"permission_review_id\": \"00000000-0000-0000-0000-000000000008\"}], \"revision\": {\"id\": \"00000000-0000-0000-0000-000000000004\", \"food_id\": \"00000000-0000-0000-0000-000000000003\", \"source_id\": \"00000000-0000-0000-0000-000000000001\", \"basis_unit\": \"g\", \"source_method\": \"SYNTHETIC\", \"basis_quantity\": \"100.00000\", \"import_batch_id\": null, \"revision_number\": 1, \"composition_definition\": \"SYNTHETIC\", \"source_record_reference\": null, \"source_reference_snapshot\": null}, \"servings\": [{\"id\": \"00000000-0000-0000-0000-000000000005\", \"label\": \" Porsi é \", \"method\": \"SYNTHETIC\", \"reviewed\": false, \"source_id\": \"00000000-0000-0000-0000-000000000002\", \"sort_order\": 2, \"base_quantity\": \"1.25000\", \"food_revision_id\": \"00000000-0000-0000-0000-000000000004\", \"source_record_reference\": \"SYNTHETIC-2\", \"source_reference_snapshot\": \"Synthetic source 2\"}, {\"id\": \"00000000-0000-0000-0000-000000000006\", \"label\": \"Other\", \"method\": \"SYNTHETIC\", \"reviewed\": false, \"source_id\": \"00000000-0000-0000-0000-000000000001\", \"sort_order\": 0, \"base_quantity\": \"2.00000\", \"food_revision_id\": \"00000000-0000-0000-0000-000000000004\", \"source_record_reference\": \"SYNTHETIC-1\", \"source_reference_snapshot\": \"Synthetic source 1\"}], \"nutrients\": [{\"value\": \"0.00000\", \"nutrient_code\": \"energy_kcal\"}, {\"value\": null, \"nutrient_code\": \"sugar_g\"}], \"payload_kind\": \"REVISION_CONTENT\", \"canonical_version\": 1}",
    "sha256": "cca4abf94719aa37b7debc210505167d060a4f7827f340546165ac09b46c53fd"
  }
] as const;
