# NUTRASA — Engineering Readiness Review v1.6

**Review scope:** contract v1.5, technical Decisions 03/07/08, Decision 01–10. No app code, executable migrations, or production release. **Result: CONDITIONAL — ready to plan implementation tasks, NOT ready for uncontrolled Codex generation or public release.**

## Verified in this package

- Parsed OpenAPI YAML with PyYAML; resolved all local `$ref` paths; confirmed unique `operationId`; checked operation count and auth on health routes.
- Added clarity to OpenAPI sync semantics but intentionally did not claim all DTOs are final.
- Specified per-user transactional commit-ordered sync cursor, queue recovery, tombstones and receipt tests.
- Proposed tables and invariants to guide SQL migrations.

## Gate matrix

| Gate | State | Required closure |
|---|---|---|
| Decisions 01–10 | Approved product baseline | Keep consistent in repo docs |
| OpenAPI syntax/local refs | Basic checks passed | Run real OpenAPI 3 validator; validate examples and operation responses |
| All mutation DTOs | OPEN | Replace generic payloads with entity-specific discriminated types |
| Sync ordering/cursor | DESIGN SET | Implement transactional locks and concurrency tests |
| Postgres DDL | OPEN | Write reversible staged migrations, clean-db test, constraints |
| Auth/ownership | DESIGN SET | Verify Firebase tokens; test IDOR, revoked session, cross-account |
| SQLite encryption/logout | DESIGN SET | Device testing, key invalidation and crash handling |
| Account deletion | OPEN | Test retry/partial failures and documented retention |
| Nutrition Engine | RELEASE BLOCKER | Qualified review of parameters and unsupported profiles |
| Food licenses | RELEASE BLOCKER | Document explicit rights before importing/publishing foods |

## Prioritized remaining work

1. **Implementation planning can start now** for safe scaffolding: repository setup, Firebase emulator / test-auth, Fastify skeleton, testing harness, app shell with mocked data. Do not publish automatic nutrition targets.
2. Before integrating real offline writes: finish typed sync DTO and migrate `user_sync_heads`, `change_feed`, operations ledger; test concurrent transactions.
3. Before user account flows: implement and validate Firebase ownership, SQLCipher key handling and logout pending-data branches.
4. Before building food catalog import: obtain license approvals and validation workflow.
5. Before shipping target calculator: review nutrition model and safety limits with qualified expert; do not hardcode unvalidated numbers as safe recommendations.

## Explicit not-done list

- No semantic OpenAPI linting by a dedicated validator.
- No SQL code or migration execution.
- No backend or mobile code.
- No expert nutrient formula sign-off, food-data redistribution clearance or production privacy compliance audit.

## Next package

Create `docs/04-development/codex-implementation-pack.md` with small milestones, acceptance criteria, prohibited shortcuts, and first scaffold prompt. Keep migrations/code gated by tests rather than endless document revisions.
