# NUTRASA — Development Task Board (Pre-coding)

> **Status: planned only.** No source code, migrations or deployed services produced by this document. Tasks organized as dependency-aware vertical slices, not build-all-frontend-first.

**Baseline:** mobile foundation and placeholder route exist; business/backend/database features remain planned. Decisions 01–10 and O-18 are resolved in [register v2](decision-register-v2.md); implementation/testing gaps remain OPEN. Execution order is **M00 → M01 → M02 → M03 → M04 → M05 → M06 → M07 → M08 → M09 → M10** in [Codex task board](codex-task-board-v1.md). T-IDs below retain the historical slice list and map to those milestones; they are not a competing execution order.

| Stage | Tasks | Deliverable and acceptance checkpoint | Blocker |
|---|---|---|---|
| T-00 Docs closure (M00) | M00-01 audit, M00-02 conflict matrix, M00-03A canonical alignment, M00-03B secondary/index alignment | Product decisions preserved; technical payload/SDK/SQLCipher/OpenAPI gaps tracked, no coding | B01–B11 technical/review gates |
| T-01 Safety/privacy review (M10 gate, throughout) | Clinical eligibility/parameters, food rights, legal/privacy review | Signed evidence before release/activation; planning is not sign-off | B03–B06,B09 |
| T-02 Dev foundation (M01–M02) | Preserve src/app thin routes and src/features; plan local Fastify/Postgres, tooling and checks | Existing mobile foundation preserved; backend smoke tests still planned | Explicit subsequent coding task |
| T-03 Schema/API contracts (M03) | DDL constraints, typed DTOs, semantic OpenAPI validation; sugar_g canonical total sugar | Contract/migration tests pass before freeze; presence of draft YAML is not validation | B07 |
| T-04 Identity slice (M02/M04) | Firebase email/social, backend token/owner checks, logout cleanup | Unverified email retains onboarding/main features; reauth and isolation tests | B06,B08 |
| T-05 Profile/onboarding slice (M05) | Private draft, eligible adults 18+, AUTO target only | Valid/invalid and resume tests; no MANUAL/LOG_ONLY fallback | B02–B04 |
| T-06 Food catalogue slice (M06) | Reviewed/authorized first 100 foods, toward 500; search/category/portions | Provenance, quality, null nutrient and serving tests | B05 |
| T-07 Journal slice (M07) | Create/edit/delete, pinned snapshots, meal dates, partial nutrients | Recording/totals; historical snapshots preserved; no-log is not zero | B02,B07 |
| T-08 Offline sync slice (M08) | Persistent device order, owner-idempotent immutable retries, server-ordered LWW, transactional owner cursor, HTTP 410 CURSOR_EXPIRED | Disconnect/retry/concurrency/tombstone/resync tests | B01,B06,B07 |
| T-09 MVP conveniences (M03/M06/M07); user recipes post-MVP | Simple custom foods, food favorites, recent foods, copy food logs; saved-meal scope remains separate | Owner isolation, independent copied IDs/snapshots; O-18 RESOLVED, recipe tables/endpoints do not imply MVP | B05,B07; future recipe design |
| T-10 Dashboard slice (M09) | Calendar, approved macro circles, journal, pending-target/partial/offline states | Approval visual retained; no fake target percentage or zero for no-log days | M07,M08 |
| T-11 Nutrition goals (M03/M05; review gate throughout) | AUTO-only engine, versioned effective targets and weight history | No manual MVP targets; activate only after clinical approval; preserve history | B02–B04 |
| T-12 Progress/profile (M09; profile in M04/M05) | Weight history, target versions, graphs/settings and optional independent completion | Historical/timezone/partial/no-log tests; edit/delete completion behavior remains OPEN | B02,B10 |
| T-13 Release hardening (M10) | Delete/export, security, observability, backup and beta hosting | Security/privacy/nutrition/license/reliability sign-off | B04–B06,B09,B11 |

## Standard subtask template for Codex
- ID and feature, approved specification path, exact scope/non-scope.
- Database and API fields touched (use canonical NutrientSet).
- UI states, offline behavior, security/ownership rule.
- Acceptance tests including boundary and failure case.
- Changed files, verification commands, rollback considerations.

## Definition of Ready
No unresolved blocking decision for this task, schema/contract synchronized, test cases named, environment reproducible.

## Definition of Done
Focused change, type/lint/tests pass, integration contract validated, offline/security checks relevant to slice pass, docs and decision log updated. **Clinical/legal gating cannot be bypassed by passing tests.**

## Immediate next actions
1. Read active register v2 and the M00–M10 board; use documentation-audit.md as historical context.
2. Keep resolved product decisions and M00-03A contracts; close typed sync payload/hashing, Expo 57 Firebase SDK, SQLCipher test and OpenAPI semantic-validation gaps in scoped subsequent tasks.
3. Obtain review evidence for eligibility, clinical parameters, source rights and privacy; do not reopen email, AUTO-only or O-18 scope.
4. Review technical DTO/DDL/OpenAPI consistency before feature coding. M00-03B stops after documentation verification; M01 is not started automatically.
