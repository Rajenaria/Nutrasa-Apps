# NUTRASA — Documentation Review Sign-off Checklist

> Mark only when evidence is available; unchecked boxes do **not** block planning but may block implementation or release.

## Completed documentation work
- [x] Core scope and preliminary architecture identified.
- [x] Firebase Auth + local Fastify/Postgres + Expo SQLite selected for development.
- [x] Database logical draft and API textual draft available.
- [x] UI approval summarized as **provisional**.
- [x] Cross-document audit, consolidated decisions and task board created.

## Before schema/API implementation
- [x] O-18 resolved: food favorites, recent foods, simple custom food and copy food logs MVP; user recipes post-MVP. Draft endpoints/models do not establish MVP scope.
- [x] D01: email verification optional for onboarding and all main features; sensitive Firebase actions retain reauthentication controls. Integration/security tests remain unchecked.
- [x] D02–D04: AUTO-only targets for supported eligible adults 18+; no MANUAL/LOG_ONLY in MVP. D03 target history policy approved; fixtures and clinical validation remain unchecked.
- [x] D07 design: server-ordered LWW, owner-scoped immutable idempotent retries, per-device ordering and transactional owner cursor; HTTP 410 CURSOR_EXPIRED. Implementation/recovery tests remain unchecked.
- [ ] Technical lead confirms schema constraints, ID strategy, nullable nutrients, revisions, indexes.
- [x] M00-03A contracts aligned: sugar_g is canonical total sugar; total_sugar_g is historical only. Eleven nutrients, null semantics, target history and snapshots preserved; technical sign-off still pending.
- [ ] Typed request/response and sync DTOs, canonical hashing, decimal/coverage validation, ownership and error wiring verified with contract tests (B01/B07).
- [ ] Semantic OpenAPI 3.1 validation including examples/responses and DTO/DDL consistency passes; draft YAML/ref checks alone do not close B07.
- [ ] Firebase SDK persistence/social/reauth compatibility with Expo 57 verified (B08).
- [ ] SQLCipher development-build encryption, key/backup and logout/isolation tests pass (B06).

## Before public beta / auto nutrition target release
- [ ] Qualified nutrition reviewer approves formula applicability, presets, protein coefficients, activity mapping and guards.
- [ ] Legal/privacy reviewer approves onboarding/health-data notice, eligibility, consent/legal basis, deletion and retention.
- [ ] Data/license reviewer approves use, attribution and storage restrictions for each catalog source.
- [ ] Security reviewer approves Firebase provider configuration, account isolation, device-local protection, access rules.
- [ ] Multi-device synchronization and data-loss recovery tests pass.
- [ ] HTTPS, backups, secrets rotation, audit logging and incident response validated on beta infrastructure.

## Sign-off record
| Area | Reviewer | Date | Evidence/Link | Decision |
|---|---|---|---|---|
| Product scope | Product owner (M00-03A approval) | — | [Decisions 01–10/O-18](decision-register-v2.md) | Product decisions approved; technical/clinical/legal sign-off remains pending |
| Backend architecture | TBD | — | — | Pending |
| Security | TBD | — | — | Pending |
| Nutrition/clinical | TBD | — | — | Pending |
| Legal/privacy | TBD | — | — | Pending |
| Catalog data/license | TBD | — | — | Pending |
