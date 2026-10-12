# NUTRASA — Architecture Decision Records (Consolidated)

> **Authoritative for selected stack**. Supersedes *suggestions* in older [system-architecture.md](system-architecture.md) and [zero-cost-architecture.md](zero-cost-architecture.md); original documents remain historical context.

## ADR-001 — Stack (APPROVED, 2026-10-13)
- Mobile: React Native, Expo, TypeScript, Expo Router.
- Identity: **Firebase Authentication** using existing Firebase project; no Supabase Auth.
- Backend: Node.js + **Fastify local** during development.
- Source of truth: **PostgreSQL local** during development.
- On-device: **Expo SQLite** for cache, offline mutations and journal reads.
- Target: **Rp0 biaya layanan development**, excluding devices, connectivity, time, developer store registrations, and future hosting.
- Future path: deploy the same API contract and database migrations to managed production environments; do not assume local backend is usable remotely.

## ADR-002 — Trust boundaries (APPROVED IN PRINCIPLE; TECH REVIEW)
- Mobile never connects directly to PostgreSQL.
- Mobile Firebase ID token is verified on Fastify backend with Firebase Admin SDK.
- All private data requests are authorized by backend owner mapping, regardless of client route protection.
- Firebase UID is immutable identity link; email not primary key.
- Client public configuration is separate from server secrets; service-account keys never shipped in app.

## ADR-003 — Persistence (AGREED CONCEPT; SYNC DETAILS PENDING)
- Server is authoritative after confirmation; local is authoritative for **pending user input on that device** until acknowledged.
- Food logs retain nutrient snapshots, recipe and catalog revisions; unknown nutrients remain null.
- Outbox idempotency, per-account isolation, tombstones, server conflict revision and recovery must be specified/tested before syncing multiple devices.
- SQLite encryption approach and risk model are not yet signed off.

## ADR-004 — Data contracts (CANONICAL)
All source, snapshot and API `NutrientSet`s use exactly: `energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fiber_g`, `total_sugar_g`, `saturated_fat_g`, `trans_fat_g`, `cholesterol_mg`, `sodium_mg`, `potassium_mg`.
Missing/unknown = `null`; true measured/computed zero = `0`. Basis-specific source amount and actual log amount must be distinguished.

## ADR-005 — UI (PROVISIONAL APPROVAL)
Refer to [docs/01-design/ui-approval-summary.md](../01-design/ui-approval-summary.md) and original final logo/Bowi assets. Compact/clean visual direction and six screen groups approved provisionally. Mockups are not functional specifications or permissions to add AI/camera/features.

## Pending design choices (NOT APPROVED)
- Database migrations/ORM, API validation library, Firebase native/JS integration, password/account linking UX, local encryption.
- Detail operations for unverified email access (especially whether dashboard/server commit is blocked).
- Time semantics for automatic nutrition target activation and manual overrides.
- Conflict merge/versioning and cursor expiry.
- Hosting, backup and secrets for public beta.

## Change control
Every future decision must record ID, owner, date, reason, alternatives, security/privacy effects, dependent files and migration implications in [docs/04-development/decision-register.md](../04-development/decision-register.md).
