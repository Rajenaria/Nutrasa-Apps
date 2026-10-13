# NUTRASA — PostgreSQL Physical Schema Review v1.3

**Status:** engineering design, no executable SQL. **Normative precedence:** Decisions 01–10 > clean `database-schema.md` v1.2 > this review > OpenAPI draft. Review constraints before generating migrations.

## Physical design conventions

- PostgreSQL `uuid` identifiers generated client-side for offline entities; `app_users.id` generated server-side with Firebase UID unique. Timestamp `timestamptz` for instants and `date` + IANA timezone for journal grouping.
- `numeric(14,5)` nutrients, `numeric(10,3)` kilogram measurements, CHECK nonnegative/positive where applicable. API decimals as strings; do not round intermediate calculations.
- Owner-bound tables include `owner_user_id uuid NOT NULL REFERENCES app_users(id)`. Foreign keys to user-owned objects MUST enforce same-owner access at service layer and, where possible, composite FK (`owner_user_id`, `id`) against a unique index. Do not trust owner ID in request bodies.
- Soft-delete rows keep `deleted_at timestamptz`; query filters active rows. Tombstone retention and cursor compaction require measured policy, not infinite retention by default.
- Revision records (`food_revisions`, `custom_food_revisions`, `recipe_revisions`) are immutable after publishing/use. Publish updates pointer on parent in a transaction.

## Table families, integrity and index blueprint

| Family | Physical integrity requirement | Priority index |
|---|---|---|
| `app_users`, `user_profiles`, `user_preferences` | Unique firebase UID, one-to-one user FKs, state checks | `app_users(firebase_uid)` unique |
| `privacy_acknowledgements` | Notice version, acknowledgement timestamp, no silent overwrites | `(user_id, acknowledged_at DESC)` |
| `foods`, `food_revisions`, `food_revision_nutrients` | Unique `(food_id,revision_number)`; unique `(revision_id,nutrient_code)`; published four mandatory nutrients checked transactionally | `(food_id, revision_number DESC)` |
| `food_sources`, `catalog_reviews` | Publication blocked when permission status is not explicitly allowed | `(source_id, review_date)` |
| `categories`, `food_categories`, `food_aliases` | Unique slug/normalized alias; prevent category cycles in server validation | `food_aliases(normalized_alias)`; full text/trigram after benchmark |
| `serving_definitions` | Positive quantity, compatible unit, revision FK | `(food_revision_id,sort_order)` |
| `custom_foods`, `custom_food_revisions` | Same-owner guard; snapshot changes create revision | `(owner_user_id,deleted_at)` |
| `recipes`, `recipe_revisions`, `recipe_ingredients` | Ingredients typed revision refs; no nested recipe in MVP; validate owner | `(recipe_revision_id,position)` |
| `favorite_foods`, `saved_meals`, `saved_meal_items` | Unique active favorite per owner/source; stable item order; soft delete | `(owner_user_id,deleted_at)` |
| `food_log_items` | Positive portion, immutable snapshot of 11 fields; unique UUID; deleted tombstone | `(owner_user_id,journal_date) WHERE deleted_at IS NULL` |
| `journal_day_states` | PK `(owner_user_id,journal_date)`; independent of nutrient completeness | PK |
| `weight_measurements` | CHECK `weight_kg > 0`; deterministic sort `(measured_at,id)` | `(owner_user_id,measured_at DESC) WHERE deleted_at IS NULL` |
| `nutrition_goal_versions` | AUTO only; nonoverlapping active goal intervals per owner; immutable historical targets | `(owner_user_id,effective_from DESC)` |
| `sync_operations` | Unique `(owner_user_id,operation_id)` + canonical payload hash; atomic transaction with mutation and feed | unique `(owner_user_id,operation_id)` |
| `change_feed` | Monotonic cursor; owner-only visibility; no secret payload | `(owner_user_id,cursor)` |
| `account_deletion_requests` | Retry-safe state transitions; block mutations for pending deletion | `(user_id,status)` |

## Critical invariants for migration author

1. At least the four mandatory nutrients must be non-null **upon publication**, not necessarily at initial draft. Enforce by service transactional publication procedure or validated database trigger; single-row CHECK cannot assert existence across child rows.
2. Defining `source_kind + source_revision_id` is not a real polymorphic FK. Use nullable typed FK columns with exactly one non-null, or a validated mapping table, and document chosen design before SQL DDL.
3. Server-order LWW update must be atomic with idempotency receipt and change feed insert. Reject update on tombstoned entity; duplicate requests return stored result, not a new write.
4. Use transactional per-user lock for recalculating goals after weight changes. On day-based Progress query, select last effective version before local day end; daylight-saving timezone behavior tested.
5. Account deletion across Firebase and PostgreSQL cannot be one database transaction. Track resumable job stages and redact personal error payloads; finalize legal retention policy before public release.
6. Cursor gaps from rolled-back transactions are valid; clients must not assume sequential contiguous cursor integers.
7. Keep private tables inaccessible to mobile database credentials. Fastify validates Firebase token, authorization scope, payload size and rate limits.

## Migration sequence, not SQL

1. Extensions and common types (only necessary extensions, pinned version); 2. identity and profile; 3. catalog provenance and taxonomy; 4. immutable catalog revisions and portions; 5. personal foods and recipes; 6. favorites and saved meals; 7. journal logs and completion; 8. weights and goal history; 9. sync receipts and change feed; 10. deletion workflow; 11. indexes and publication guards; 12. seed catalog review dataset; 13. validation and rollback rehearsal.

**Gate:** No executable migrations until typed references, retention, and endpoint DTOs are reconciled with OpenAPI.
