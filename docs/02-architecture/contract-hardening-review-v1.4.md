# NUTRASA — Contract Hardening Review v1.4

**Status: ENGINEERING DRAFT — NOT final sign-off, NOT suitable for automatic client generation yet.**

## Changes from v1.3

- Registered shared enums for source, meal, onboarding, account, journal completion, sync entities/actions/results and deletion states. Mapped selected existing DTO fields to these enums.
- Replaced loosely defined recipe/custom-food PATCH requests with bounded typed schemas.
- Added typed weight-progress and consistency response envelopes.
- Added shared error-code vocabulary as a candidate (wiring into existing error DTO is pending).
- Preserved all paths from v1.3; no prior endpoint removed.
- Validated YAML parsing, internal component references and method-level operation ID uniqueness. **Not** full OpenAPI semantic validation.

## Technical policies (proposed contract rules)

1. Firebase JWT is verified by Fastify. Email verification is optional; identity/ownership checks always apply.
2. Numeric nutrition fields are decimal strings for authoritative calculation; any optional nutrient unknown must be `null`, not zero. The progress total may be a lower bound (`≥`) if at least one constituent is unknown.
3. All create/update/delete mutations use stable client-generated UUID idempotency keys. A replay with the same payload returns the stored result; reusing the key with different payload must fail. Define consistent account scoping and retention before implementation.
4. Rest updates and offline push use one operation ledger; avoid applying the same change twice via distinct ingress routes. Preserve per-device order, server-applied-order LWW for distinct devices, and DELETE tombstone precedence over stale UPDATEs.
5. A journal day without logs is `NO_LOGS` and not equivalent to a measured zero. Completion is a separate, optional user assertion.
6. Goal history must be versioned and nonretroactive; weight backfills should not retroactively alter the goal effective at historical dates.
7. Native SQLite encryption and secure-key lifecycle are required for private offline data; never send plaintext Firebase tokens to a public HTTP endpoint.
8. Account deletion is a resumable server workflow; first block mutation, then purge account resources from PostgreSQL and Firebase and clear local data after confirmed request. Log outcomes without retaining unnecessary health data.

## Open issues / approval blockers

| Area | Remaining work |
|---|---|
| Endpoint response typing | Make ALL 50 operations explicit, including catalog pagination, detail objects, recipe response revisions, favorites, sync pull; no generic object placeholders |
| Error matrix | Assign real `201/202/204/409/410/422` semantics and typed error codes to every relevant endpoint; 409 only for actual domain/idempotency conflict, not ordinary LWW revision |
| Sync payload | Define discriminated union per entity, valid create/update/delete payload, server sequence, checkpoint handling, outbox preservation on cursor expiry |
| Enums & clinical values | Confirm goal/activity field mappings to business rules; do not finalize unsafe engine parameters without professional review |
| Domain lifecycle | Define revision immutability for recipe/custom foods, serving conversions, and saved-meal copying |
| Access/privacy | Secure account deletion retries, key loss, backup exclusion and refresh behavior; verify on real devices |
| Physical DB | Produce explicit table-by-table columns, PK/FK, numeric precision, uniqueness, checks, indexes, and migration order before generating executable migration |
| Validation | Run semantic OpenAPI lint + example request/response tests before marking client-generation-ready |
| Data rights | Audit licensing and provenance before publishing food data |

## Authority

Decisions 01–10 and latest Decision 03/07/08 technical decisions take precedence. v1.4 is the newest API review draft; database-schema.md and api-contract.md v1.2 remain canonical explanatory references until reconciled into an approved v2.
