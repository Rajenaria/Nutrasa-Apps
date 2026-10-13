# NUTRASA — Rancangan Skema Fisik PostgreSQL v1.5

**Status:** spesifikasi review, belum SQL DDL. Mengikuti Database Schema v1.2 dan Decision 01–10. Tidak boleh digunakan sebagai klaim migration sudah siap.

## Konvensi umum

- PK UUID dengan `gen_random_uuid()`; UUID buatan klien dipertahankan untuk entity offline. `timestamptz` untuk waktu peristiwa server, `date` + `journal_time_zone` IANA untuk jurnal lokal. Nullable mempunyai arti eksplisit.
- Numeric energi/nutrisi `numeric(14,5) CHECK(value >= 0)`; berat `numeric(10,3) CHECK(weight_kg > 0)`; kuantitas `numeric(14,5) CHECK(quantity > 0)`. Pembulatan di UI saja.
- Private FK `owner_user_id → app_users.id`, indeks owner-first. Semua query private mewajibkan `owner_user_id` dari token Firebase tervalidasi.
- Mutable entities use positive revision and deleted_at tombstones; delayed UPDATE returns ENTITY_DELETED. Audit timestamps do not establish sync ordering: use the transactional per-user counter locked through commit.
- JSONB nutrisi harus memenuhi tepat 11 nama kanonis dengan nilai berupa decimal-string atau null; validasi ketat di Fastify dan CHECK/trigger di database bila dipilih. **Jangan menyimpan JSONB tanpa schema validation.**

## Matriks tabel inti (kolom kunci, constraint, indeks wajib)

| Tabel | Kolom inti dan jenis | Constraint dan indeks |
|---|---|---|
| `app_users` | `id uuid`, `firebase_uid text`, `account_status text`, `created_at timestamptz` | PK(id), UNIQUE(firebase_uid), CHECK status; index(status) untuk deletion workflow |
| `user_profiles` | `user_id uuid`, `date_of_birth date`, `height_cm numeric(8,2)`, `activity_level text`, `goal_type text`, `target_weight_kg numeric(10,3) NULL`, `onboarding_status text`, `profile_revision integer` | PK(user_id), FK user CASCADE; CHECK height > 0 dan domain enum, goal target sesuai jenis |
| `user_preferences` | `user_id uuid`, `language_code text`, `time_zone text`, `updated_at timestamptz` | PK/FK user; zona waktu IANA diperiksa aplikasi/server |
| `privacy_acknowledgements` | `id uuid`, `user_id uuid`, `notice_version text`, `ack_type text`, `acknowledged_at timestamptz` | FK user; UNIQUE(user_id,notice_version,ack_type) |
| `food_sources` | `id uuid`, `name text`, `license_status text`, `reference text` | PK; CHECK license; sumber harus ALLOWED sebelum publish |
| `foods` | `id uuid`, `canonical_name text`, `normalized_name text`, `publication_status text`, `current_published_revision_id uuid NULL` | PK; index(normalized_name), partial published; deferred FK current revision bila cycle |
| `food_revisions` | `id uuid`, `food_id uuid`, `revision_number integer`, `source_id uuid`, `basis_quantity numeric(14,5)`, `basis_unit text` | UNIQUE(food_id,revision_number), FK food/source, CHECK positive and unit |
| `food_revision_nutrients` | `food_revision_id uuid`, `nutrient_code text`, `value numeric(14,5) NULL` | PK(revision,nutrient); CHECK 11 allowed and nonnegative; publication validated transactionally |
| `serving_definitions` | `id uuid`, `food_revision_id uuid`, `label text`, `base_quantity numeric(14,5)`, `base_unit text` | FK revision; CHECK positive; index(food_revision_id) |
| `categories` | `id uuid`, `parent_id uuid NULL`, `slug text`, `name text` | UNIQUE(slug), FK parent; prevent hierarchy cycles via service/recursive check |
| `food_categories` | `food_id uuid`, `category_id uuid`, `is_primary bool` | PK(food,category); partial UNIQUE(food_id) WHERE is_primary |
| `food_aliases` | `id uuid`, `food_id uuid`, `normalized_alias text`, `alias text` | UNIQUE(food_id,normalized_alias); trigram index if pg_trgm enabled |
| `custom_foods` | `id uuid`, `owner_user_id uuid`, `current_revision_id uuid NULL`, `revision integer`, `deleted_at timestamptz` | FK owner; index(owner,deleted_at); revisions immutable |
| `custom_food_revisions` | `id uuid`, `custom_food_id uuid`, `revision_number integer`, `nutrient_values jsonb`, `basis_quantity numeric(14,5)` | UNIQUE(custom_food_id,revision_number); validate 11 keys |
| `recipes` — post-MVP | `id uuid`, `owner_user_id uuid`, `current_revision_id uuid NULL`, `revision integer`, `deleted_at timestamptz` | Future user recipe model; not active MVP |
| `recipe_revisions` — post-MVP | `id uuid`, `recipe_id uuid`, `revision_number integer`, `yield_quantity numeric(14,5)`, `nutrient_total_snapshot jsonb` | UNIQUE(recipe_id,revision_number); immutable; future model |
| `recipe_ingredients` — post-MVP | `id uuid`, `recipe_revision_id uuid`, `position integer`, `source_kind text`, `source_revision_id uuid`, `resolved_base_quantity numeric(14,5)`, `ingredient_nutrients_snapshot jsonb` | Future model; FK strategy remains OPEN, no fake polymorphic FK |
| `favorite_foods` | `id uuid`, `owner_user_id uuid`, `source_kind text`, `source_id uuid`, `deleted_at timestamptz` | partial UNIQUE(owner,source_kind,source_id) WHERE deleted_at IS NULL |
| `saved_meals` | `id uuid`, `owner_user_id uuid`, `name text`, `revision integer`, `deleted_at timestamptz` | FK owner, index(owner,deleted_at) |
| `saved_meal_items` | `id uuid`, `saved_meal_id uuid`, `position integer`, `nutrient_snapshot jsonb`, `quantity numeric(14,5)` | FK saved meal; UNIQUE(saved_meal_id,position) |
| `food_log_items` | `id uuid`, `owner_user_id uuid`, `journal_date date`, `journal_time_zone text`, `meal_type text`, `source_kind text`, `source_revision_id uuid NULL`, `nutrient_snapshot jsonb`, `revision integer`, `deleted_at timestamptz` | index(owner,journal_date,deleted_at), FK owner; source typed reference validation |
| `journal_day_states` | `owner_user_id uuid`, `journal_date date`, `completion_status text`, `revision integer` | PK(owner,journal_date); CHECK OPEN/CONFIRMED_COMPLETE |
| `weight_measurements` | `id uuid`, `owner_user_id uuid`, `measured_at timestamptz`, `weight_kg numeric(10,3)`, `deleted_at timestamptz` | index(owner,measured_at DESC) WHERE deleted_at IS NULL |
| `nutrition_goal_versions` | `id uuid`, `owner_user_id uuid`, `effective_from timestamptz`, `effective_to timestamptz NULL`, `goal_mode text`, `formula_version text`, four targets, `source_weight_measurement_id uuid NULL` | CHECK goal_mode=AUTO; CHECK end > start; per-user non-overlap enforced by transaction lock/exclusion constraint |
| `sync_operations` | `operation_id uuid`, `owner_user_id uuid`, `device_id uuid`, `device_sequence bigint`, `payload_digest text`, immutable receipt, `processed_at timestamptz` | UNIQUE(owner_user_id,operation_id), UNIQUE(owner_user_id,device_id,device_sequence); identical retry returns receipt, payload mismatch rejected |
| `change_feed` | `owner_user_id uuid`, `cursor bigint` allocated transactionally from user sync head, `entity_type text`, `entity_id uuid`, snapshot/tombstone payload, `change_type text`, `changed_at timestamptz` | PK(owner_user_id,cursor); row lock held through commit, domain/feed/receipt atomic; no ordinary identity/sequence |
| `user_sync_heads` | `owner_user_id uuid PRIMARY KEY`, `last_cursor bigint NOT NULL DEFAULT 0` | FK app_users; cursor >= 0; serializes feed writers for each owner until commit |
| `account_deletion_requests` | `id uuid`, `user_id uuid`, `status text`, `requested_at timestamptz`, `completed_at timestamptz NULL` | UNIQUE active request per user; workflow retries and audit minimization |

## Migration dependency order (planning only)

1. Enable required database capabilities in local dev, seed controlled enums/check rules.
2. Identity: `app_users`, profiles, preferences, privacy acknowledgements.
3. Catalog base: sources, categories, foods, food_revisions (handle circular published pointer in a later ALTER), nutrients, servings, aliases, joins.
4. Simple custom foods & revisions and food favorites are MVP; recent derives from logs and copying logs uses new IDs/snapshots. User recipes/revisions/ingredients post-MVP (O-18 final); separate saved-meal scope is unchanged.
5. Food logs, journal states, weights, versioned nutrition goals.
6. Sync operation ledger, change feed/cursors, deletion workflow.
7. Add FK for `current_*_revision_id` after both tables exist; add check triggers and indexes; load reviewed seed data only after license audit.
8. Migration smoke-test clean install + forward upgrade + constraints + rollback strategy in disposable local DB.

## Implementation traps / unresolved (must close before executable migration)

1. **Commit-ordered cursor:** use the transactional per-user `user_sync_heads` row lock through commit, with feed/receipt/domain atomic. Rollback also rolls back the counter. Pull uses a stable watermark and last-delivered cursor; ordinary identity/bigserial/phone timestamps are not the canonical mechanism. Concurrency tests remain OPEN; see [sync-protocol-final-design.md](sync-protocol-final-design.md).
2. **Typed foreign keys:** `source_kind + source_revision_id` cannot be enforced by a single FK. Prefer separate nullable typed FKs with exactly-one CHECK in physical DDL or validated triggers; owner checks still enforced in Fastify.
3. **Goal non-overlap:** use serialized user-scoped transaction plus exclusion constraint if acceptable; confirm timezone boundaries in integration tests.
4. **Deletion vs receipt history:** define retention of sync/idempotency receipts and account deletion evidence; cannot promise complete retention or immediate deletion of audit artifacts without policy.
5. **Nutrition**: engine values and eligible profile conditions need professional review; never seed unsupported or asserted medically validated target values.
6. **Source rights**: each imported source must be approved for storage and redistribution.
