# NUTRASA — Architecture Decision Records (Consolidated)

> **Authoritative for selected stack**. Supersedes *suggestions* in older [system-architecture.md](system-architecture.md) and [zero-cost-architecture.md](zero-cost-architecture.md); original documents remain historical context.

## ADR-001 — Stack (APPROVED, 2026-10-13)
- Mobile: React Native, Expo, TypeScript, Expo Router.
- Identity: **Firebase Authentication** using existing Firebase project; no Supabase Auth.
- Backend: Node.js + **Fastify local** during development.
- Source of truth: **PostgreSQL local** during development.
- On-device: **Expo SQLite**; SQLCipher development-build design protects private data under Decision 08. Encryption/key/device tests remain OPEN.
- Target: **Rp0 biaya layanan development**, excluding devices, connectivity, time, developer store registrations, and future hosting.
- Future path: deploy the same API contract and database migrations to managed production environments; do not assume local backend is usable remotely.

## ADR-002 — Trust boundaries (APPROVED IN PRINCIPLE; TECH REVIEW)
- Mobile never connects directly to PostgreSQL.
- Mobile Firebase ID token is verified on Fastify backend with Firebase Admin SDK.
- All private data requests are authorized by backend owner mapping, regardless of client route protection.
- Firebase UID is immutable identity link; email not primary key.
- Client public configuration is separate from server secrets; service-account keys never shipped in app.

## ADR-003 — Persistence (DESIGN SET; IMPLEMENTATION/TESTS OPEN)
- Server is authoritative after confirmation; local is authoritative for **pending user input on that device** until acknowledged.
- Food logs retain nutrient snapshots, recipe and catalog revisions; unknown nutrients remain null.
- Server-ordered LWW, persistent per-device sequence, UNIQUE(owner_user_id, operation_id) with identical retry identity/payload, tombstone rejection ENTITY_DELETED and transactional per-user cursor follow sync-protocol-final-design.md. Implementation/concurrency tests remain OPEN.
- Decision 08 sets private-data encryption and logout cleanup after sync/cancel/confirmed discard choices. SQLCipher/key lifecycle, account isolation and coordinated deletion must be tested; no security validation claimed.

## ADR-004 — Data contracts (CANONICAL)
All source, snapshot and API `NutrientSet`s use exactly: `energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `trans_fat_g`, `cholesterol_mg`, `sodium_mg`, `potassium_mg`. `sugar_g` means total sugar; `total_sugar_g` is a historical name, not an active API/DB field.
Missing/unknown = `null`; true measured/computed zero = `0`. Basis-specific source amount and actual log amount must be distinguished.

## ADR-005 — UI (PROVISIONAL APPROVAL)
Refer to [docs/01-design/ui-approval-summary.md](../01-design/ui-approval-summary.md) and original final logo/Bowi assets. Compact/clean visual direction and six screen groups approved provisionally. Mockups are not functional specifications or permissions to add AI/camera/features.

## Pending design choices (NOT APPROVED)
- Database migration/ORM and API validation tooling, Firebase native/JS SDK/persistence on Expo 57, account linking UX and encryption/device QA remain OPEN.
- Firebase SDK/platform compatibility, persistence and sensitive-action reauthentication remain OPEN. Email verification is optional; onboarding, Home and sync are not email-gated.
- Automatic targets only in MVP; manual override post-MVP. Latest valid weight triggers recalculation with forward-effective target versions; historical logs/targets remain preserved. Boundary fixtures and clinical review remain OPEN.
- Typed sync payloads, canonical hashing, retention and full OpenAPI validation remain OPEN. Cursor expiry uses HTTP 410 CURSOR_EXPIRED; normal stale edits do not use revision conflict/merge.
- Hosting, backup and secrets for public beta.

## Change control
Every future decision must record ID, owner, date, reason, alternatives, security/privacy effects, dependent files and migration implications in [docs/04-development/decision-register.md](../04-development/decision-register.md).
