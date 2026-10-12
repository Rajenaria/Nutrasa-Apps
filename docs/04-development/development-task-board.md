# NUTRASA — Development Task Board (Pre-coding)

> **Status: planned only.** No source code, migrations or deployed services produced by this document. Tasks organized as dependency-aware vertical slices, not build-all-frontend-first.

**Repository baseline, 2026-10-13:** mobile foundation and one placeholder route already exist. Business features and backend/database integrations remain planned. UI approval is a provisional visual baseline, not implemented screens. Recipe/favorite release priority remains OPEN (O-18); the table is a dependency plan, not a final release order.

| Stage | Tasks | Deliverable and acceptance checkpoint | Blocker |
|---|---|---|---|
| T-00 Docs closure | Review merged docs; resolve O-01,O-05,O-11,O-18; technical sign-off | Canonical nutrient aliases corrected during merge; product/technical decisions still pending | Product/tech |
| T-01 Safety/privacy review | Review nutrition parameter candidates, unsupported accounts, permissions on food sources, privacy/legal | Signed review records or disabled risky capability | Clinical/legal |
| T-02 Dev foundation | Preserve existing Expo foundation; plan Fastify/Postgres/SQLite/Auth integration, env templates, tests and emulators where practical | Mobile structure exists; backend/database integration and local smoke tests for those services not delivered | Selected stack; later explicit coding task |
| T-03 Schema/API contracts | Confirm DDL entities + constraints; OpenAPI spec; generated types if appropriate | Schema/contract tests pass | O-13,O-14 |
| T-04 Identity slice | Firebase email/social integration, Fastify token verification, server-user mapping, route protection | End-to-end login/logout and security tests | O-01,O-08 |
| T-05 Profile/onboarding slice | Protected draft, form steps, age/eligibility, server completion, log-only | Resume/unsupported/verification test suite | O-04,O-07,O-12 |
| T-06 Food catalogue slice | Source review and curated 20-food pilot → first 100, search, category, portions | Data quality and search tests | O-09,O-10 |
| T-07 Journal slice | create/edit/delete, snapshots, meal dates, partial nutrients | End-to-end meal recording and totals | O-11 |
| T-08 Offline sync slice | SQLite outbox, retry, idempotency, delete, conflict handling | Disconnect/retry/multi-device tests | O-06,O-07 |
| T-09 Recipe/favorites/copy | Custom foods, recipes, saved meals, favorites, recent; recipe/favorite timing OPEN | Portion/yield and copied-log invariants; schedule after O-18 owner decision | O-10,O-11,O-18 |
| T-10 Dashboard slice | Calendar, calorie/macro circles, journal list, log-only/partial/offline | Approved UI baseline and accessibility | T-07,T-08 |
| T-11 Nutrition goal slice | Engine candidate test harness, reviewed config, manual/auto, history | Only enable production recommendation after clinical signoff | O-02–O-05 |
| T-12 Progress/profile slice | Weight history, goal revisions, graphs, user settings | Historical-accuracy and partial-data tests | T-07,T-11 |
| T-13 Release hardening | Delete/export, observability, security, backup, beta hosting | Security/privacy/reliability sign-off | O-12,O-15 |

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
1. Review [documentation-audit.md](documentation-audit.md) and [decision-register.md](decision-register.md) with product owner.
2. Review the canonical nutrient corrections recorded in the audit; do not treat them as generated implementation types.
3. Confirm manual vs auto target behavior, unverified email operation matrix, and recipe/favorite release priority O-18.
4. Approve technical DDL/API modeling; then prepare machine-readable OpenAPI and migration plan, **before coding feature screens**.
