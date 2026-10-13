# NUTRASA — PostgreSQL Implementation Decisions v1.6

**State:** physical-design choices for migration authoring, **not executable SQL**, and not authorization to seed or publish clinical nutrition recommendations.

## Tables to add/clarify against v1.5

| Table / column | Physical contract | Key constraints |
|---|---|---|
| `user_sync_heads` | `owner_user_id UUID PRIMARY KEY`, `last_cursor BIGINT NOT NULL DEFAULT 0` | FK app_users, cursor >= 0; transactional per-user row lock |
| `change_feed` | `(owner_user_id, cursor)` composite primary key, `entity_type`, `entity_id`, `change_type`, `revision`, `payload_snapshot`, `changed_at` | cursor allocated while owner sync head locked; include tombstone payload only necessary for deletions |
| `sync_operations` | owner, `operation_id`, `device_id`, `device_sequence`, hash, immutable response receipt | UNIQUE(owner,operation_id), UNIQUE(owner,device_id,device_sequence), response in same transaction |
| `sync_devices` | owner, device_id, last_acked_cursor, last_seen_at, revoked_at | UNIQUE(owner,device_id); support feed cleanup and rebootstrap |
| `food_log_items` | immutable nutrient snapshot, `source_revision_id` typed reference, `journal_date`, timezone, revision, deleted_at | owner-first date index; typed FK or validated owned source reference |
| `nutrition_goal_versions` | effective UTC instant, formula version, result snapshot, source_weight_measurement_id | prevent overlapping active intervals per user; transaction lock per owner |
| `journal_day_states` | user/date key, completion flag, modified timestamp | `Hari Aktif` still determined by >=1 nondeleted food log, not by this flag |
| `account_deletion_requests` | owner, stable request ID, workflow phase, attempts, completed_at | retryable work, block new mutations during deletion; minimal audit data |

## Non-negotiable integrity rules

- PostgreSQL numeric for computed nutrients; API decimal serialization follows canonical schema/API, never float math for authoritative calculations. Exactly 11 nutrients; `sugar_g` means total sugar (`total_sugar_g` is historical only). Unknown remains nullable, not zero.
- Public catalog publication requires reviewed energy/protein/carbohydrate/fat, approved source rights and immutable food revision. Never automatically rewrite historical snapshots.
- For polymorphic food source use typed reference columns and `CHECK exactly one present` or validated triggers; never a fake FK to an arbitrary UUID.
- One user owns each private custom food, favorite, log, weight, progress, recipe and saved-meal record; enforce owner checks even with FKs. User recipes remain post-MVP; saved meals retain their separate scope unchanged (O-18).
- Do not expose Firebase service-account JSON to Expo; only backend reads Admin credentials.
- Never mark `schema ready` until clean migration, forward upgrade, FK, constraint and rollback tests pass on a disposable PostgreSQL database.

## Migration staging (plan only)

1. Identity and user ownership.
2. Reviewed food catalog and revisions.
3. MVP simple custom foods, food favorites and typed references; user recipes post-MVP. Saved meals retain their separate scope; model presence does not approve MVP scheduling.
4. Journal, food log snapshots and weight history.
5. Versioned nutrition goals.
6. Sync heads, devices, operations, change feed and indexes.
7. Account deletion workflow, restriction and audit minimization.
8. Disposable-db verification, seed licensing review, test data; no real users until security tests.

## Risks remaining

- Data deletion retention/legal basis and backups.
- Typed food/log references require a concrete DDL strategy and tests; recipe references remain post-MVP design, not an MVP migration requirement.
- Date/time and target-effective boundary example fixtures still required.
- Nutrition formulas and eligible profiles pending expert review.
