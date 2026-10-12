# NUTRASA — API Contract Specification

**Version:** 1.0 — Architecture review draft  
**Date:** 2026-10-13  
**Repository path:** [docs/02-architecture/api-contract.md](api-contract.md)\
**Status:** CONTRACT DESIGN ONLY — do not implement endpoints, migrations, generated clients, or production medical recommendations until review gates are resolved.

## 0. Decisions and source of truth

**Approved stack:** React Native + Expo + TypeScript (mobile), Expo Router, Firebase Authentication (already has a project), local Node.js/Fastify backend, local PostgreSQL source of truth, Expo SQLite device cache/outbox. Development aims for Rp0 service cost. The mobile app never connects to PostgreSQL directly. This document supplements [database-schema.md](database-schema.md), [offline-sync-spec.md](offline-sync-spec.md), [food-database-spec.md](food-database-spec.md), [food-logging-spec.md](../03-features/food-logging-spec.md), [onboarding-spec.md](../01-design/onboarding-spec.md), [auth-spec.md](../03-features/auth-spec.md), [profile-spec.md](../03-features/profile-spec.md), [progress-spec.md](../03-features/progress-spec.md), [dashboard-spec.md](../03-features/dashboard-spec.md) and the nutrition-engine specification. If a field name differs, use the canonical nutrient names from [database-schema.md](database-schema.md); file a documentation correction, not a silent conversion.

**Approved business requirements:** Auth before onboarding; unverified email may complete local onboarding with restricted server operations (precise gates pending); unsupported profile goes to log-only, not fabricated calorie targets; automatic calorie presets by eligible profile (clinical parameters pending); manual goal adjustments validated; automatically reconsider targets after weight updates without silently overwriting manual goals; 100 initially curated foods, growing to 500; private custom foods, recipes, favorite foods, saved meals/copy meal, recent foods; partial nutrients allowed with explicit coverage; offline-tolerant journal and sync; historical food and target versions retained.

**Draft implementation choices:** REST JSON over HTTPS in production (`http://localhost` / LAN only during development); `/api/v1`; short-lived Firebase ID token in `Authorization` header; RFC 3339 UTC event timestamps; ISO `YYYY-MM-DD` journal date plus IANA timezone; UUIDs for client-created mutable records; optimistic revisions; explicit error/status enums. Proposed choices require technical signoff before coding.

## 1. Boundary and ownership

```text
Expo UI / feature hooks
  -> local SQLite repositories + offline outbox
  -> typed API client (one module; no raw fetch scattered in screens)
  -> Fastify /api/v1 (verify Firebase ID token, authorize, validate)
  -> PostgreSQL transactional domain services

Firebase Auth SDK <-> Firebase Auth service
Fastify verifies Firebase ID tokens using Firebase Admin (server only).
```

- Identity comes from a verified token, **never** from `userId` or `ownerUserId` in request JSON. Resolve `app_users.id` from `app_users.firebase_uid` server-side.
- Catalog **read** endpoints are authorized to users under the selected access policy; writes to published catalog are only through a trusted admin/import workflow, not regular mobile users.
- A **server-authoritative Nutrition Engine** validates target creation/activation. A mobile preview may calculate provisionally but cannot activate unreviewed recommendations.
- SQLite is the local source for UI pending changes; PostgreSQL is the cloud/server authority. Idempotency receipts and a change feed support sync.
- Firebase password, Google/Apple credentials and password-reset tokens **never** pass through NUTRASA Fastify routes. Use Firebase SDK/provider flows and server verification only.

## 2. HTTP conventions

| Aspect | Proposed contract |
|---|---|
| API base | `/api/v1` |
| Transport | HTTPS in production; development local HTTP restricted to trusted development network |
| JSON | UTF-8 `application/json`; snake_case API fields to match database; TS API adapter may map to camelCase |
| Authentication | `Authorization: Bearer <Firebase ID token>`; reject expired, invalid, revoked or unauthorized tokens |
| Resource ID | UUID; server assigns owner from token; client generates UUID for offline entities |
| Journal date | `YYYY-MM-DD` interpreted as chosen **journal date**, not inferred from server UTC |
| Journal timezone | IANA name, e.g. `Asia/Jakarta`, stored with journal entry |
| Time instant | RFC 3339 timestamp with offset or `Z`; normalized to UTC on server |
| Pagination | Cursor-based for collection endpoints; bounded `limit`, stable ordering |
| Concurrency | `base_revision` on updates/deletes, conflict on stale revisions |
| Idempotency | `operation_id` for any offline-origin mutation, stored durably per owner and operation digest |
| Network retry | Same `operation_id` on retries; new ID for a genuinely new intended action |
| Strict validation | Reject unexpected privileged/owner fields and unsupported enum values |
| Data minimization | No sensitive raw profile input in logs, traces, URL query parameters or error payloads |

**Number transport:** nutrients and measurements may be serialized as decimal strings (e.g. `"82.50"`) to preserve PostgreSQL `numeric` precision. **Proposed recommendation:** use decimal strings for stored/returned quantity and nutrient values; validate scale and range in one shared schema, display rounding only in UI. Do not mix string/number by endpoint. Define precision definitively before OpenAPI generation.

### 2.1 Envelope examples (illustrative only)

Successful single resource:

```json
{
  "data": { "id": "550e8400-e29b-41d4-a716-446655440000", "revision": 2 },
  "meta": { "request_id": "req_example" }
}
```

Validation error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Periksa data yang dimasukkan.",
    "details": [{"field": "entered_quantity", "reason": "MUST_BE_POSITIVE"}],
    "request_id": "req_example",
    "retryable": false
  }
}
```

The client **must not** parse Indonesian message text to determine program state; use stable `code`/`reason` values. Never expose stack traces or internal SQL details.

### 2.2 Response status and error taxonomy

| HTTP | `error.code` | Meaning / client action |
|---|---|---|
| 400 | `INVALID_REQUEST` | Malformed JSON, unsupported filter, invalid cursor |
| 401 | `AUTH_REQUIRED` / `TOKEN_INVALID` | Refresh Firebase ID token or reauthenticate; never sync to another account |
| 403 | `EMAIL_VERIFICATION_REQUIRED` / `FORBIDDEN` | Follow policy gate or deny access |
| 404 | `NOT_FOUND` | Missing or inaccessible resource; do not disclose another user's ownership |
| 409 | `REVISION_CONFLICT` / `IDEMPOTENCY_MISMATCH` | Preserve local intent; fetch canonical data; do not overwrite blindly |
| 410 | `SYNC_CURSOR_EXPIRED` | Controlled rebootstrap of change feed, preserving local outbox |
| 412 | `PRECONDITION_FAILED` | Conditional update no longer matches |
| 422 | `VALIDATION_ERROR` / `UNSUPPORTED_PROFILE` / `GOAL_NEEDS_REVIEW` / `NUTRIENT_DATA_INSUFFICIENT` | User fix, log-only or review; never fabricate targets |
| 429 | `RATE_LIMITED` | Backoff; obey `Retry-After` where provided |
| 500/503 | `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | Retry boundedly; do not lose local queued changes |

**Additional rules:** `not found` includes foreign private IDs to avoid enumeration; rate-limit account-adjacent and expensive queries; cap body sizes and array lengths; server records stable request ID without sensitive payload dumps.

## 3. Canonical contracts and important types

### 3.1 Nutrients: exact 11 keys, units fixed

| Field | Unit | Public-food publication |
|---|---|---|
| `energy_kcal` | kcal | Required |
| `protein_g` | g | Required |
| `carbohydrate_g` | g | Required |
| `fat_g` | g | Required |
| `fiber_g` | g | Optional |
| `total_sugar_g` | g | Optional |
| `saturated_fat_g` | g | Optional |
| `trans_fat_g` | g | Optional |
| `cholesterol_mg` | mg | Optional |
| `sodium_mg` | mg | Optional |
| `potassium_mg` | mg | Optional |

`NutrientSet` always contains each field, as a nonnegative decimal string or `null` where unknown. `null` **must never** be replaced with `"0"` as a convenience. Ingredient source energy may differ from `4/4/9`; do not overwrite trusted source energy. A **logged** nutrient snapshot represents entered quantity, not per-100g source basis.

Suggested aggregate shape:

```json
{
  "totals_known": {
    "energy_kcal": "1450.0", "protein_g": "82.0", "carbohydrate_g": "150.0",
    "fat_g": "44.0", "fiber_g": null, "total_sugar_g": null,
    "saturated_fat_g": null, "trans_fat_g": null, "cholesterol_mg": null,
    "sodium_mg": null, "potassium_mg": null
  },
  "coverage": {
    "energy_kcal": { "known_items": 3, "total_items": 3, "complete": true },
    "fiber_g": { "known_items": 1, "total_items": 3, "complete": false }
  },
  "has_any_logs": true,
  "journal_completion_status": "OPEN"
}
```

**Clarification:** `totals_known` may sum known values for a partially known nutrient; if all items unknown, return `null`, not zero. `complete=false` always accompanies any partial sum. The example omits other coverage members for brevity; real response includes every nutrient key.

### 3.2 Serving resolution and food references

- A food has stable `food_id` and immutable `food_revision_id` for a published version.
- Input portion is `{ "quantity": "1.5", "unit_code": "portion", "serving_definition_id": "..." }`, or a direct `{ "quantity": "150", "unit_code": "g" }` when appropriate.
- Food-specific unit conversion must resolve to a defined basis amount and `g`/`ml`. Unrecognized conversion returns `PORTION_CONVERSION_UNAVAILABLE`, **never** a guessed conversion.
- `source_kind`: `PUBLIC_FOOD`, `CUSTOM_FOOD`, `RECIPE` (`QUICK_ADD` is **not approved**). Appropriate source revision ID required.
- Log `display_name_snapshot`, source version, resolved amount and `nutrient_snapshot` are immutable historical values at creation; a conscious edit may yield a revised log snapshot, never an automatic rewrite due to catalog update.

### 3.3 Offline mutation payload conventions

```json
{
  "operation_id": "550e8400-e29b-41d4-a716-446655440001",
  "device_id": "550e8400-e29b-41d4-a716-446655440002",
  "entity_type": "FOOD_LOG_ITEM",
  "entity_id": "550e8400-e29b-41d4-a716-446655440003",
  "operation_kind": "CREATE",
  "base_revision": null,
  "payload": {
    "journal_date": "2026-10-13", "journal_time_zone": "Asia/Jakarta",
    "meal_type": "LUNCH", "source_kind": "PUBLIC_FOOD",
    "source_revision_id": "550e8400-e29b-41d4-a716-446655440004",
    "entered_quantity": "150", "entered_unit": "g"
  }
}
```

On the server, validate the published food revision and resolve nutrients atomically. **Offline snapshot reconciliation remains an open contract**: if a device cached a prior valid published revision that is now archived, select a deterministic accept/reject behavior and protect local historical intent. Never blindly trust client-supplied nutrient totals for public foods. For custom foods/recipes, use immutable owner-controlled version and validate ownership. If offline payload and calculated values differ, return a clear reconciliation result.

## 4. Endpoint inventory (proposed)

All routes below are relative to `/api/v1` and require verified Firebase Auth except health checks and explicitly permitted discovery endpoints. P0 indicates essential initial MVP; P1 is later MVP slice or can be deferred until the related feature is developed. Exact paths may change at signoff, but **semantic responsibilities must not**.

**Recipe/favorite priority is OPEN (O-18):** the P1 labels retained on those draft endpoints describe the source proposal, not an owner-approved release decision. The review scope proposed P0 and the older roadmap post-MVP; do not resolve that discrepancy by implementing either schedule. API availability is not implied by this inventory.

| Group | Method + endpoint | Priority | Purpose |
|---|---|---|---|
| System | `GET /health/live` | P0 | Server process liveness, no secrets |
| System | `GET /health/ready` | P0 | DB readiness, restricted diagnostics |
| Session | `GET /me` | P0 | Resolve verified Firebase identity to app account & server gates |
| Session | `POST /me/bootstrap` | P0 | Create/get app user idempotently from verified UID |
| Onboarding | `PUT /me/onboarding` | P0 | Commit locally drafted answers on allowed account state |
| Onboarding | `GET /me/onboarding` | P0 | Read committed status, never read another user's draft |
| Profile | `GET /me/profile` | P0 | Profile and eligibility-relevant fields |
| Profile | `PATCH /me/profile` | P0 | Update, validate and revise profile |
| Preferences | `GET /me/preferences` | P1 | Language, units, timezone |
| Preferences | `PATCH /me/preferences` | P1 | Update preferences |
| Catalog | `GET /foods` | P0 | Search/list published foods, filters & cursor |
| Catalog | `GET /foods/{food_id}` | P0 | Details and current published revision |
| Catalog | `GET /foods/{food_id}/servings` | P0 | Applicable portion definitions |
| Catalog | `GET /categories` | P0 | Hierarchical categories |
| Catalog | `GET /catalog/changes` | P1 | Cache delta/version information |
| Custom foods | `GET /me/custom-foods` | P1 | Owner's private foods |
| Custom foods | `POST /me/custom-foods` | P1 | Create with owner-only immutable revision |
| Custom foods | `PATCH /me/custom-foods/{id}` | P1 | New revision, validated |
| Custom foods | `DELETE /me/custom-foods/{id}` | P1 | Soft delete/archive |
| Recipes | `GET /me/recipes` | P1 | Owner's recipes |
| Recipes | `POST /me/recipes` | P1 | Create recipe & ingredient snapshot |
| Recipes | `GET /me/recipes/{id}` | P1 | Ingredient list and nutrition method |
| Recipes | `PATCH /me/recipes/{id}` | P1 | Create revision |
| Recipes | `DELETE /me/recipes/{id}` | P1 | Archive private recipe |
| Favorites | `GET /me/favorites` | P1 | Favorite foods |
| Favorites | `PUT /me/favorites/{type}/{id}` | P1 | Explicit favorite on, idempotent |
| Favorites | `DELETE /me/favorites/{type}/{id}` | P1 | Explicit favorite off |
| Saved meals | `GET /me/saved-meals` | P1 | Templates |
| Saved meals | `POST /me/saved-meals` | P1 | Save meal template |
| Saved meals | `POST /me/saved-meals/{id}/copy` | P1 | Idempotently create selected-day log items |
| Log | `GET /me/food-logs?date=YYYY-MM-DD` | P0 | Entries for selected journal day |
| Log | `POST /me/food-logs` | P0 | Online equivalent of CREATE mutation |
| Log | `PATCH /me/food-logs/{id}` | P0 | Edit item with base revision |
| Log | `DELETE /me/food-logs/{id}` | P0 | Soft-delete with base revision |
| Journal | `PUT /me/journal-days/{date}/completion` | P1 | Set OPEN or CONFIRMED_COMPLETE |
| Weight | `GET /me/weights` | P0 | Timestamped weights |
| Weight | `POST /me/weights` | P0 | Add measurement, schedule goal reevaluation |
| Weight | `PATCH /me/weights/{id}` | P1 | Correct measurement; goal reevaluation |
| Weight | `DELETE /me/weights/{id}` | P1 | Soft delete; goal reevaluation if applicable |
| Goals | `GET /me/goals/active` | P0 | Active approved target or LOG_ONLY/needs-review state |
| Goals | `GET /me/goals/history` | P0 | Versioned targets for date comparisons |
| Goals | `POST /me/goals/recalculate` | P0 | Server evaluation of current eligible profile |
| Goals | `POST /me/goals/manual-proposal` | P1 | Validate manual target; approval policy pending |
| Dashboard | `GET /me/dashboard?date=YYYY-MM-DD` | P0 | Assembled journal/goal/coverage response |
| Progress | `GET /me/progress/nutrition` | P0 | Daily trend/aggregates with coverage |
| Progress | `GET /me/progress/weight` | P0 | Actual weigh-ins and trend data |
| Progress | `GET /me/progress/consistency` | P1 | Diary completion/recording statistics |
| Sync | `POST /me/sync/push` | P0 | Batch authenticated offline operations |
| Sync | `GET /me/sync/pull?cursor=...` | P0 | Server deltas, tombstones, scoped by owner |
| Account | `POST /me/account/deletion-request` | Required before public release | Start reviewed deletion workflow |
| Account | `GET /me/account/deletion-status` | Required before public release | Track deletion state |

**Important:** No `/auth/login`, `/auth/register` or `/auth/password-reset` is exposed by Fastify; those are Firebase flows. No client `POST /foods` for public catalog; a separate privileged import/review process publishes those items.

## 5. Key request/response contracts

### 5.1 Account bootstrap and verification gates

`POST /me/bootstrap` idempotently maps verified `firebase_uid` to one `app_users` record. Input may carry a limited app/device metadata set but **not** a claimed UID. Return `app_user_id`, `email_verified`, `onboarding_status`, and `account_capabilities` from trusted server policy. No password/token response. Exact capability matrix for unverified email is **pending explicit approval**; the onboarding spec proposes allowing draft entry while restricting server finalization, which is not yet approved.

`PUT /me/onboarding`: request contains validated profile fields, goal, target weight where required and an `onboarding_submission_id` for idempotency. Server rechecks eligibility and target policy. Response is one of:

- `COMPLETED` plus an `active_goal` only if calculation returned approved `READY`;
- `LOG_ONLY` if unsupported; no invented goal numbers;
- `NEEDS_REVIEW` with explanation and no new unsafe active target;
- `VERIFICATION_REQUIRED` if the selected verification policy blocks final commit.

Client's persisted local draft is retained until server confirms commit. For eligible profiles, "automatic activation" means no extra user confirmation **after** a successful server-safe calculation, not activation on invalid input.

### 5.2 Food search and detail

`GET /foods?q=ayam%20bakar&category_id=<uuid>&limit=20&cursor=<opaque>` returns authorized published food identities, active revisions, display names, aliases/category breadcrumbs, optional source/quality labels, and a next cursor. Enforce query length, bounded limit, indexed normalized search and stable ordering. **No guessed nutrition facts from search text.**

`GET /foods/{food_id}` returns stable `food_id`, `food_revision_id`, `display_name`, `description`, `basis_quantity`, `basis_unit`, `nutrients_per_basis` (11 nullable fields), `serving_definitions`, `provenance_summary`, `data_quality`, and `published_at`. Source/license restrictions may limit exposed fields; agree before production. Do not expose unpublished food revisions to regular clients.

### 5.3 Food log creation and edit

`POST /me/food-logs` accepts `operation_id`, `id` (client UUID), journal date/timezone, meal type, source kind/revision ID, and chosen quantity/serving. Server derives `owner_user_id`, resolves food/serving, saves the quantity-specific 11-key snapshot and returns the canonical item plus `revision`, `sync_state` ack metadata. **Do not allow clients to set trusted source nutrient totals as a shortcut.** For a user-owned custom food, ensure revision belongs to requester.

`PATCH /me/food-logs/{id}` accepts `operation_id`, `base_revision`, and explicit changed fields. Changing quantity causes fresh nutrient resolution against the item's pinned source revision; historic unrelated entries unaffected. Server returns updated snapshot and incremented revision. `DELETE` requires base revision and returns a durable tombstone/ack; repeating the same operation must not delete another version inadvertently.

### 5.4 Recipes and copy meal

`POST /me/recipes`: validated, bounded ingredient list of pinned source revisions, quantities, preparation details and **known final cooked weight or defined servings**. Calculate from source data and documented retention/yield method, track missing nutrients and uncertainty; do not silently invent cooked weight. Published public-food revisions are immutable; private recipe revisions are owner-only. When inputs are insufficient, return structured error rather than fake nutrition.

`POST /me/saved-meals/{id}/copy`: choose target `journal_date`, timezone and meal type. One `operation_id` owns the entire copy command; server writes children atomically, returns created item IDs and their nutrient snapshots. Replayed operation returns original result. Do not mutate original meal/template.

### 5.5 Dashboard, progress, calendar

- `GET /me/dashboard?date=...`: include journal date/timezone, entries grouped by meal, `totals_known`, all `coverage` flags, `has_any_logs`, journal completion, active/effective goal state and sync-related server watermark. A **no-log day** is not presented as a validated 0-kcal consumption day.
- Progress API accepts `from=YYYY-MM-DD&to=YYYY-MM-DD` subject to maximum interval cap; includes **day-level data quality**, target version applicable to each day, missing-day markers, and a reason for excluded days in averages.
- Weight progress returns actual measurements with timestamps; chart selection rule for multiple same-day weigh-ins remains open. Never generate a predicted weight as a measured value.
- Source of daily aggregation on device can include pending local entries. Server cannot claim to know unsent offline logs; UI must distinguish provisional local aggregates from server aggregates.

### 5.6 Goals and auto-recalculation

When a weight event is accepted, server runs or schedules a deterministic nutrition evaluation using approved formula/policy version. Reply with `{ "weight": ..., "goal_recalculation": {"status":"ACTIVATED|NEEDS_REVIEW|SKIPPED|PENDING", "goal_version_id": ...} }`. If reevaluation is asynchronous, `PENDING` must not be represented as active. Never activate invalid/unsupported targets or silently overwrite manual targets. Preserve effective-date history and canonical chronological ordering under racing submissions. **Pending:** precise policy for handling manual target on new weight, effective date/time and medical guards.

### 5.7 Sync protocol — proposed shape

`POST /me/sync/push`

```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440002",
  "operations": [
    {
      "operation_id": "550e8400-e29b-41d4-a716-446655440001",
      "entity_type": "FOOD_LOG_ITEM",
      "entity_id": "550e8400-e29b-41d4-a716-446655440003",
      "operation_kind": "CREATE",
      "base_revision": null,
      "payload": {"journal_date":"2026-10-13","journal_time_zone":"Asia/Jakarta","meal_type":"LUNCH","source_kind":"PUBLIC_FOOD","source_revision_id":"550e8400-e29b-41d4-a716-446655440004","entered_quantity":"150","entered_unit":"g"}
    }
  ]
}
```

Response records an outcome **per operation** in a bounded batch: `APPLIED`, `REPLAYED`, `CONFLICT`, or `REJECTED`, canonical revision, resource snapshot or conflict metadata, `server_cursor`, `retryable` and stable error reason. Ordering dependencies: custom food/recipe must exist before its referenced log; if a prerequisite fails, dependent operations stay pending. Atomicity scope for a batch needs approval; recommend atomic **per operation** with explicit dependencies, with copy-meal atomic internally. Duplicate operation ID + different digest is rejected.

`GET /me/sync/pull?cursor=<opaque>&limit=...`: owner-scoped ordered change events, tombstones, `next_cursor`, `has_more`, server watermark, `cursor_expires_at` if applicable. On stale cursor return 410 `SYNC_CURSOR_EXPIRED` and bootstrap strategy; **never erase unsynced outbox**. Decide cursor retention, full-resync semantics, catalog feed separation and conflicting edit handling before coding.

**Sync restriction for unverified accounts:** needs explicit capability matrix. Preserve queued operations until allowed; do not pretend `SYNCED` while gated.

## 6. Authorization and security matrix

| Entity / action | User | Admin import process |
|---|---|---|
| Own profile, targets, logs, weights | Read/write according to validation/verification gates | Not by default; exceptional support access audited |
| Another user's private data | Denied even if ID is guessed | Denied unless separately authorized support procedure |
| Published food catalog | Read | Read/write through controlled process |
| Draft catalog/review history | Denied | Restricted |
| Private custom foods / recipes / saved meals | Owner only | No routine access |
| Sync change feed | Own account only | Not public |
| Account deletion request | Authenticated user after required sensitive-action checks | Reviewed operational process |

- Verify Firebase project/audience/issuer, signature and expiry with Admin SDK; handle revoked sessions where policy requires. Admin credentials **server-only**, never in Expo app. No reliance on a client-provided verification flag.
- Secure storage for mobile auth tokens, never database connection strings or service credentials. Use typed request schemas for Fastify routes and explicit output projections.
- Restrict CORS (where applicable), request limits, SQL injection via parameterized queries, least privilege DB role, read-only mobile catalog access through service layer.
- Avoid sending birth date, physiological attributes or nutrition snapshots to analytics without a separately approved privacy policy and consent analysis.
- Account deletion, retention, verifications, regional privacy and consent are **LEGAL REVIEW REQUIRED** prior to release.

## 7. Backend module separation

```text
backend/                         # Proposal; final repo structure after architecture signoff
  src/
    app.ts
    plugins/
      firebase-auth.ts           # Verify token and attach verified identity
      database.ts                # Connection pool + transaction helper
      errors.ts                  # Canonical response errors
    modules/
      accounts/
      onboarding/
      profiles/
      foods/
      recipes/
      food-logs/
      weights/
      nutrition-goals/
      progress/
      sync/
    shared/
      contracts/                 # JSON Schema / validator / DTO types
  tests/
mobile/                          # Existing Expo source; path subject to repo structure
  src/
    lib/api/                     # Typed client; no ad hoc fetch in screens
    features/...
```

This structure is **illustrative**, not permission to move the existing Expo app or create a monorepo immediately. One reusable DTO schema package is optional after stable contracts; avoid overengineering.

## 8. Testing and contract acceptance matrix

| ID | Test case | Expected |
|---|---|---|
| API-01 | Valid Firebase ID token | Resolved server-owned account, no client UID trust |
| API-02 | Missing/expired/wrong-project token | 401; private data denied |
| API-03 | Guessed resource ID from another user | 404/403 without private data leak |
| API-04 | Email not verified | Allowed/denied by documented capability matrix, never arbitrary |
| API-05 | Bootstrap invoked repeatedly | Exactly one app user |
| API-06 | Onboarding restarted after app close | Local draft preserved; idempotent server submission |
| API-07 | Unsupported profile | LOG_ONLY, no fabricated goal |
| API-08 | Engine returns NEEDS_REVIEW | No unsafe active target |
| API-09 | Food search with Indonesian aliases | Stable paginated matching results |
| API-10 | Published food lacks potassium | `potassium_mg: null`, not `0` |
| API-11 | Serving without conversion | Structured error; no guessing |
| API-12 | 150g food with valid basis | Correct computed snapshot with defined rounding |
| API-13 | Old food catalog revision archived | Historic log unchanged |
| API-14 | Duplicate create operation same digest | Single write, same response |
| API-15 | Same operation ID different payload | 409 idempotency mismatch |
| API-16 | Two devices edit same log revision | 409; local intent preserved |
| API-17 | Delete offline and retry | Single tombstone, no resurrection |
| API-18 | Copy meal request retried | Exactly one copied batch |
| API-19 | Recipe incomplete cooked yield | Explicit validation error |
| API-20 | No food logs on selected day | `has_any_logs=false`; not a complete 0-kcal day |
| API-21 | Some nutrients unknown | Partial sums with coverage, no falsely full status |
| API-22 | Journal switches timezones | Entries remain on selected journal date |
| API-23 | Weight changes with automatic goal | Eligible new version only; old version preserved |
| API-24 | Manual goal then weight changes | No silent overwrite pending agreed precedence |
| API-25 | Stale goal computation races with new input | Stale target not activated |
| API-26 | Sync call timeout after server commit | Replayed operation returns ack, no duplicate |
| API-27 | Sync cursor expired | Controlled rebootstrap with outbox preserved |
| API-28 | Logout/account switch with pending writes | Strict account isolation, no wrong-user sync |
| API-29 | Dashboard device has unsent logs | UI labels local provisional total |
| API-30 | Sensitive request/error logging | No secrets, DOB, or raw personal nutrition in logs |
| API-31 | 100-food initial catalog imports | Reviewed, searchable, versioned, licensing check |
| API-32 | Export/delete requested | Documented privacy workflow; no silent deletion loss |

Automated checks when implementation begins: OpenAPI schema validation, DTO contract tests, authorization tests, property tests for decimal portions/coverage, DB transaction tests, sync retry/fault injection, Expo local SQLite-to-API integration and manual UX review.

## 9. Open decision register — blocking before implementation

| Decision ID | Outstanding decision | Reviewer / priority |
|---|---|---|
| A-01 | Firebase provider configuration (email, Google, Apple), exact session/persistence library and development build requirements | Technical, P0 |
| A-02 | Exact operations restricted for unverified email; local onboarding vs server commit policy | Product + security + legal, P0 |
| A-03 | Eligible profiles, safety guardrails, per-profile preset percentages, activity mapping, protein coefficients and reference weight selection | Nutrition/clinical, P0 before auto target release |
| A-04 | Behavior and representation when calculation is NEEDS_REVIEW; fallback UX | Product + clinical, P0 |
| A-05 | AUTO vs MANUAL precedence on weight change; target effective-date semantics | Product + clinical, P0 |
| A-06 | Decimal precision/serialization, serving conversions and recipe yield treatment | Data + technical + nutrition, P0 |
| A-07 | Offline log against archived/unavailable source revision and trustworthy snapshot reconciliation | Technical + product, P0 |
| A-08 | Revision conflict UX, sync event retention, cursor expiry/full-resync | Technical + product, P0 |
| A-09 | Exact MVP scope for offline custom food/recipes, save/copy meal and day-complete state | Product + technical, P0 |
| A-10 | API operation-level atomicity and cross-operation dependencies | Technical, P0 |
| A-11 | Data-source license/attribution and published provenance projection | Legal + editorial, P0 before catalog production |
| A-12 | Privacy consent, retention/deletion, account export, support tools | Legal/security, release blocker |
| A-13 | Rate limit budgets, page size and maximum date range based on performance tests | Technical, P1 |
| A-14 | Progress same-day weigh-in display and consistency definitions | Product, P1 |
| A-15 | Deployment topology, domain, HTTPS, secrets and backups for public testers | Ops/security, before public beta |

**Do not claim these are approved** simply because an example exists above. Approved means product owner/qualified reviewer signed off.

## 10. Suggested implementation sequence AFTER contract signoff

1. Freeze canonical names, approved business policies and API schemas; optionally generate OpenAPI 3.1 as the machine-readable contract.
2. Review PostgreSQL migration design with foreign keys, indexes, uniqueness and transaction invariants; no production data yet.
3. Create Fastify skeleton, Firebase token verification and owner authorization tests.
4. Add catalog read/query path and publish a **small licensed test subset**; verify units and nullable nutrients.
5. Implement local SQLite journal + outbox, food log server mutations and read-back, then sync failure/retry tests.
6. Add onboarding/profile/weight and **server-validated** nutrition goal versioning under reviewed policies.
7. Add custom food/recipe/favorite/copy meal in feature slices, then progress and privacy workflows.
8. Profile performance with realistic 100→500 food dataset, test on Android/iOS development builds, add deployment only when required.

## 11. API contract acceptance checklist

- [ ] Architecture decisions match approved stack; no Supabase/Firebase Firestore dependency accidentally introduced.
- [ ] All endpoints have defined owner authorization and verification capabilities.
- [ ] Nutrient fields exactly match [database-schema.md](database-schema.md) and `null` semantics.
- [ ] Time/date, portion, source revisions, manual/automatic goals and historical snapshots are consistent.
- [ ] Offline mutation IDs, revisions, retries, tombstones and cursor expiration are specified and tested.
- [ ] Contract examples never bypass server validation, clinical rules or source licensing.
- [ ] P0 decisions in register have explicit reviewers/outcomes; no unresolved blockers hidden.
- [ ] No backend implementation or SQL migration was done as part of this planning task.

**Next deliverable:** resolve P0 decisions, then produce machine-readable `openapi.yaml` (not hand-written API controllers first), PostgreSQL migration plan and a milestone-by-milestone Codex task board.
