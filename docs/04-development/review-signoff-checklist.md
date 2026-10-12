# NUTRASA — Documentation Review Sign-off Checklist

> Mark only when evidence is available; unchecked boxes do **not** block planning but may block implementation or release.

## Completed documentation work
- [x] Core scope and preliminary architecture identified.
- [x] Firebase Auth + local Fastify/Postgres + Expo SQLite selected for development.
- [x] Database logical draft and API textual draft available.
- [x] UI approval summarized as **provisional**.
- [x] Cross-document audit, consolidated decisions and task board created.

## Before schema/API implementation
- [ ] Owner resolves recipe/favorite release priority O-18; presence of draft endpoints/models does not establish P0.
- [ ] Owner approves operation matrix for unverified email.
- [ ] Owner approves AUTO versus MANUAL target precedence and effective-date policy.
- [ ] Owner approves exact MVP offline feature behavior and conflict UX.
- [ ] Technical lead confirms schema constraints, ID strategy, nullable nutrients, revisions, indexes.
- [x] Documentation merge reconciles nutrient aliases in food logging and Nutrition Engine with schema/API; technical contract sign-off remains pending.
- [ ] Technical lead signs off request/response envelope, decimal representation, idempotency and error codes.
- [ ] Draft machine-readable OpenAPI matches signed textual contract.

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
| Product | TBD | — | — | Pending |
| Backend architecture | TBD | — | — | Pending |
| Security | TBD | — | — | Pending |
| Nutrition/clinical | TBD | — | — | Pending |
| Legal/privacy | TBD | — | — | Pending |
| Catalog data/license | TBD | — | — | Pending |
