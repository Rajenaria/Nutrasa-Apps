# NUTRASA — System Architecture & Database Decision

**Version:** 1.0-draft\
**Status:** Historical architecture analysis, updated with selected local-development stack; technical implementation remains draft\
**Platform:** React Native + Expo + TypeScript\
**Confirmed:** Firebase Authentication, Indonesian food catalog, offline-tolerant sync, personal nutrition diary.

**Selected stack, 2026-10-13:** Firebase Authentication + Fastify local + PostgreSQL local + Expo SQLite, with React Native/Expo/TypeScript and Expo Router. ADR-001 is authoritative. Managed database/Firestore comparisons below are historical alternatives and future context, not a request to reopen the chosen development stack. Hosting/scaling decisions remain open for a later phase.

## 1. Executive decision

- **Confirmed:** Firebase Authentication remains the single identity provider.
- **Selected:** PostgreSQL local as the server source of truth, Fastify local as backend API, and Expo SQLite for offline data.
- **Historical alternative, not selected:** Cloud Firestore. Retained below for comparison, not an approved replacement.
- **Still open:** future hosting/budget, Firebase SDK compatibility with Expo 57 and security/integration tests. Sync design is server-ordered LWW per final v1.6; SQLCipher protection is selected in Decision 08 but untested. Development service-cost target is Rp0.
- No production nutrition calculation policy is approved merely by selecting this architecture; clinical and legal reviews remain required.

## 2. Requirements / non-functional goals

1. Support 100 curated food items expanding to 500 and beyond with category/alias/region and provenance.
2. Support 11 nutrient fields; unknown values must be `null`, not `0`.
3. Support food-specific serving units and catalogue composition; user recipe/version functionality is post-MVP (O-18).
4. Snapshot logged nutrients so catalog changes do not rewrite users' histories.
5. Support date-aware day journals, nutrition targets, goal history, weight measurements, and trends.
6. Allow basic logging offline, with user-visible local/pending/synced states.
7. Keep food logs, health data and preferences isolated by authenticated user.
8. Avoid unnecessary infrastructure for the first 100–500 foods and early user base.

## 3. Firestore vs PostgreSQL

| Criteria | Cloud Firestore | PostgreSQL |
|---|---|---|
| Initial app setup | Fast with Firebase SDK, fewer services | Needs managed DB + API |
| Food catalog 100–500 | Good | Good |
| Recipes and ingredients | Nested/denormalized documents, extra reads for relationships | Normalized join tables, FK constraints |
| Multi-category foods & alias search | Possible, query/index planning; sophisticated full-text often needs other service | Joins, indexes, full-text/trigram search available |
| Daily journal | Good with per-user/date document modeling | Good with indexed records and aggregations |
| Historical analytics | Aggregates/materialized summaries required for some workloads | Flexible SQL window/aggregate queries |
| Offline | Native Firestore mobile SDK attractive; validate SDK/runtime behavior in Expo | Implement with SQLite + custom sync protocol |
| Cost | Operations + index reads + bandwidth + storage | Provider/compute/storage/bandwidth; often baseline monthly fee |
| Authorization | Firestore Security Rules | Backend verifies Firebase token, authorizes each request |
| Migration and reporting | Document exports/custom transformations | SQL tooling, migrations, well-established analytics |

**Historical rationale:** this comparison informed the PostgreSQL decision. PostgreSQL local is now selected; choosing another data source would require a separate owner-approved architecture change.

## 4. Proposed architecture

```text
Expo mobile app (Expo Router + feature modules)
  ├── Firebase Auth SDK (identity and session)
  ├── local SQLite database (catalog cache, food logs, sync outbox)
  ├── nutrition engine (pure versioned calculations, no made-up presets)
  ├── UI / state selectors (Home, Food, Progress, Profile)
  └── API client + sync coordinator
         │ HTTPS + Firebase ID token
         ▼
  Authenticated Backend API
  ├── Firebase Admin verifyIdToken + revocation/session policy
  ├── authorize user ownership for every operation
  ├── request schema and numeric validation
  ├── owner-scoped idempotency + server-ordered LWW
  ├── food publishing and curation admin boundary
  └── transactional persistence
         │
         ▼
  PostgreSQL local (managed hosting considered later)
  ├── identity mapping / user profiles / consents
  ├── catalog foods/categories/aliases/nutrients/sources/servings
  ├── recipes, ingredients, immutable versions (post-MVP user recipes)
  ├── food logs + nutrient snapshots
  ├── weight entries + goal versions
  └── sync bookkeeping and audit events
```

### Auth boundary
- Client obtains Firebase ID token after authentication and sends it as Bearer token over HTTPS.
- Backend verifies token signature, issuer, audience, expiration and required account state using Firebase Admin SDK; derive user UID from verified token only.
- On all user-specific writes/reads, derive owner identity from token; never trust owner UID supplied as a free-form client field.
- PostgreSQL credentials and Firebase Admin service-account secrets never ship to mobile app.
- Email verification is optional: authenticated eligible users retain onboarding, profile persistence, sync and main features. Sensitive actions follow Firebase controls/reauthentication (Decision 01).

### Local/offline boundary
- Local SQLite is for durable app data; secure credential storage uses platform-appropriate secure storage instead.
- SQLite is not automatically encrypted. Decision 08 selects SQLCipher protection; native development-build, key/backup and encryption tests remain OPEN.
- Outbox operations use the final v1.6 envelope: immutable operation identity/payload and persistent device sequence. Typed mutation DTOs and canonical hashing remain OPEN; follow [sync protocol](sync-protocol-final-design.md).
- Save record + outbox event in one local transaction. Render local state immediately.
- Sync when app is active and network is available. Authenticate, upload bounded batches, confirm IDs/revisions, then acknowledge local queue.
- Deduplicate retries with UNIQUE(owner_user_id, operation_id); retry identity/payload must match and return the stored receipt. Connectivity is not server persistence.
- Server-ordered LWW follows the last valid transactional server application; device time is not authority. Allocate change cursor through the locked per-owner transactional counter. HTTP 410 `CURSOR_EXPIRED` triggers rebootstrap while preserving outbox; account data stays isolated and private local data is cleaned on logout per Decision 08.
- Catalog updates must be versioned; logged nutrient snapshots immutable unless user explicitly edits that log.

## 5. Suggested data domains (NOT final SQL schema)

Historical conceptual names below are not physical table contracts. Current [database schema](database-schema.md), [database decisions v1.6](database-implementation-decisions-v1.6.md) and [sync protocol v1.6](sync-protocol-final-design.md) override old names; table/model presence does not establish MVP scope.

**Catalog (managed/admin-published):** foods, food_aliases, categories, food_categories, nutrient_values, food_sources, serving_units, food_servings, catalog_versions.

**User recipes (post-MVP conceptual model):** recipes, recipe_versions, recipe_ingredients, recipe_servings; ownership, source method and cooked yield require explicit future design.

**Users:** users (Firebase UID), user_profiles, onboarding_status, consent_records, nutrition_goal_versions, weight_measurements, preferences.

**Diary:** food_log_entries, log_nutrient_snapshots, day_statuses, favorites, saved_meals, meal_copy_operations.

**Offline:** sync_operations, device_state, entity_revisions; soft deletion/tombstones where needed to sync deletes safely.

**Curation:** candidate_food_imports, data_review_records and provenance; no API harvesting or copyrighted bulk imports without rights verification.

## 6. Business invariants

- Food nutritional reference basis and portion weight/volume must be explicit, with units.
- Unknown nutrient values remain null. Daily aggregation must carry known/partial status per nutrient.
- Every log stores a nutrient snapshot, source/version, serving and journal date/timezone context.
- Historical goal comparisons use the goal version effective on that day; auto recalculation must not retroactively rewrite days.
- All mutations are validated server-side; calculations requiring clinical signoff remain tagged experimental/disabled until approved.
- MVP accepts eligible adults 18+ with AUTO targets only; no MANUAL or LOG_ONLY active mode. Screening and clinical validation remain required.
- Data deletion, consent and retention require legal review before launch.

## 7. Implementation alternatives / decision table

The following alternatives are retained as historical analysis. Option B with local PostgreSQL/Fastify is selected for development; cloud hosting is deferred.

### Option A — Firestore + Firebase Auth
Simple service topology. Firestore's document-centric model and native SDK can support offline functionality, but Expo integration and actual persistence semantics need a tested choice of Firebase JS SDK vs React Native Firebase native SDK. Do not assume identical mobile offline behavior across SDKs. Query aggregation and relational search may need precomputed documents. Apply rules per user, test permissions in emulator; Security Rules are not query filters.

### Option B — PostgreSQL + Firebase Auth + API + SQLite (recommended)
Relational model, strong integrity, analytics and controlled food curation. Requires running API service, migration pipeline, backups, monitoring, and maintaining an offline sync algorithm. Hosting provider may be Supabase Postgres-only, Neon, Cloud SQL, or another managed PostgreSQL; shortlist based on regions, quotas, uptime, migration, backups, and cost. Do not enable a second auth system by accident.

### Option C — Mixed Firestore and PostgreSQL
Not recommended in MVP: duplicates user data sources and adds cross-store consistency complexity. Reconsider only when a specific use-case justifies it.

## 8. Cost plan

Historical cost examples below are not verified current quotes or development obligations. Selected development services run locally with a target service spend of Rp0; reassess provider terms when cloud deployment is explicitly requested.

Firestore free tier (Standard, subject to region and billing plan): 1 GiB stored, 50k reads/day, 20k writes/day, 20k deletes/day, 10 GiB network outbound/month. Beyond quota: reads/writes/deletes, indexed reads, storage and bandwidth are billed.

Postgres hosted options vary. Example Supabase Pro starts around USD $25 per month, but resource and egress usage may increase bill; free tier can pause and has limits. PostgreSQL does not charge per SQL row read in that model, but CPU, storage, memory and traffic are finite.

Estimate cost before deciding: daily active users; logs/user/day; screen opens/day; searchable food reads; average recipe ingredients; sync frequency; retained history; backups, expected region, and caching efficiency.

## 9. Security and privacy gate

- Protect authorization at backend for each user-owned resource.
- Firebase ID token verification required; do not trust arbitrary UID from request.
- Backups, incident response, rate limiting, abuse protection and audit logging for admin food changes.
- Encrypt transport; review protection at rest on device and server, secret management and access least privilege.
- Consent and privacy notices for body/health-related data; confirm retention and erase/export semantics under applicable regulations.
- Security tests: cross-user access, replay/retry, account switching, offline queue, revoked accounts, unverified email, deletion race.

## 10. Sequence for developers

1. Use the selected local Fastify/PostgreSQL stack; defer cloud provider, budget and region selection until beta/cloud planning.
2. Decide Firebase Auth SDK configuration and OAuth build requirements (Google/Apple) in Expo.
3. Follow approved Decisions 01–10/O-18 and M00–M10 task order; close task-specific typed payload, eligibility, SDK, security and contract-test gaps without reopening settled product choices.
4. Draw normalized schema and indexes with example queries; freeze minimum catalog/log invariants.
5. Specify API contracts with versions, idempotency, pagination, errors and auth rules.
6. Implement Firebase Auth session + backend token verification and a narrow health-check/auth endpoint.
7. Implement SQLite local schema and one food-log vertical slice with outbox, remote sync and tests.
8. Curate the first 100 foods with source rights and QA, then expand toward 500; no automatic unlicensed import.
9. Expand remaining feature slices; instrument logging, database migrations, monitoring and backup/restore rehearsal.
10. Run security, nutrition-domain and legal reviews before release.

## 11. Acceptance tests / architecture checks

| ID | Scenario | Pass condition |
|---|---|---|
| ARC-01 | User A reads User B's diary | Forbidden server-side |
| ARC-02 | Expired/forged ID token | Rejected |
| ARC-03 | Offline log + app restart | Log and pending outbox survive |
| ARC-04 | Same sync request sent twice | Exactly one logical mutation |
| ARC-05 | Offline delete | Deletion eventually reconciles without resurrection |
| ARC-06 | Catalog recipe changed | Previous log snapshot unaffected |
| ARC-07 | Nutrient sodium unknown | Daily sodium shows partial, not zero-as-known |
| ARC-08 | User switches accounts | Local user data isolated |
| ARC-09 | New weight generates target revision | Historic goals preserved; unsafe result not activated |
| ARC-10 | Two-device edit same log | Last valid server-applied mutation wins transactionally; ordered owner feed and replay/concurrency tests pass |
| ARC-11 | Old app schema + new server | Version compatibility or actionable migration failure |
| ARC-12 | Backup restore test | Verified restore with access permissions intact |

## 12. Open decision register

| Decision | Recommendation | Status |
|---|---|---|
| DB choice | PostgreSQL local | SELECTED — ADR-001 |
| PostgreSQL host | Local during development; future managed host undecided | CLOUD PHASE OPEN |
| Backend runtime | Node.js + Fastify local | SELECTED — ADR-001; hosting later |
| Offline architecture | Expo SQLite/outbox + server-ordered LWW, owner idempotency and transactional cursor | DESIGN SELECTED; IMPLEMENTATION/TESTS OPEN |
| Local encryption | SQLCipher with development build per Decision 08; key/backup/logout testing required | DESIGN SELECTED; SECURITY TESTS OPEN |
| Auth SDK | Expo-compatible Firebase JS vs native modules | TECHNICAL REVIEW |
| Email verification | Optional for onboarding and main features; sensitive Firebase actions retain controls | RESOLVED — Decision 01; security tests OPEN |
| Collision handling | Server-ordered LWW per final sync v1.6, not device timestamps | DESIGN RESOLVED; concurrency/recovery tests OPEN |
| Nutrition preset values | No production automation until clinical approval | CLINICAL REVIEW |
| Data source license | Import only after verifying rights | LEGAL REVIEW |
| Health/body data consent & deletion | Review locally applicable law | LEGAL REVIEW |

## 13. Official references (checked October 2026)

The source document supplied these references and claimed a check date; this documentation merge does not independently verify external prices, quotas, or vendor terms.

- Firebase Firestore pricing: https://firebase.google.com/docs/firestore/pricing
- Firebase data model: https://firebase.google.com/docs/firestore/data-model
- Firebase aggregation: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Firestore offline: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firestore Rules & queries: https://firebase.google.com/docs/firestore/security/rules-query
- Firebase Admin ID tokens: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Expo + Firebase: https://docs.expo.dev/guides/using-firebase/
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Hosted PostgreSQL overview: https://supabase.com/solutions/hosted-postgres

**This document is planning guidance, not a command to install all tools or deploy resources.**
