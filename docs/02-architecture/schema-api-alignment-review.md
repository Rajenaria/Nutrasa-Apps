# NUTRASA — Schema & API Contract Alignment Review v1.1

**Status:** reviewed and revised drafts; not signed off for SQL migrations, OpenAPI final, or production deployment.  
**Date:** 2026-10-13  
**Chosen stack:** Expo + TypeScript; Firebase Auth; Fastify local; PostgreSQL local; Expo SQLite + SQLCipher (native build for real sensitive data); Rp0 hosted service cost during local development.

## Source of truth & precedence

1. Latest approved Decision 01–10 from conversation.
2. `decision-03-weight-history-final.md`, `decision-07-offline-sync-final.md`, `decision-08-security-privacy-final.md`; Decision 07's later approved **server-ordered LWW** overrules earlier real-world-action latest proposal.
3. These revised v1.1 schema/API documents, including normative appendices.
4. Earlier v1.0 materials only where consistent.

## Review matrix

| Decision | Schema alignment | API alignment | Status |
|---|---|---|---|
| D01 optional verification | email cache informational | no unverified gate | Aligned in v1.1 appendix |
| D02 automatic goals | AUTO only MVP | read current/history, remove manual endpoints | Aligned in v1.1 appendix |
| D03 weight history | deterministic current weight, non-retroactive goal versions | weight changes trigger evaluation | Aligned; midnight/timezone tests pending |
| D04 adults supported only | eligibility must pass | reject unsupported onboarding | Aligned; clinical rule pending |
| D05 curated catalog | provenance and immutable revisions | published/authorized catalog only | Aligned; each source license pending |
| D06 nullable micronutrients | core 4 required at publication | per-nutrient coverage semantics | Aligned; numeric precision pending |
| D07 offline LWW | serial mutation, op receipts, tombstones | no stale-revision 409 for ordinary updates | Aligned; sync retention policy pending |
| D08 strict privacy | personal local encryption, deletion state | auth guards, reauth and deletion workflow | Aligned; privacy policy pending |
| D09 immutable log history | pinned snapshot source revisions | edit/copy/delete contracts | Aligned |
| D10 Progress | daily completion, goal effective versions | no-log != zero; active/finished separate | Aligned; date boundary tests pending |

## Blocking issues before implementation / production

**Must settle before database/API code:** data-type precision and units, detailed DTO/error enums, sync cursor retention and full resync, tie-break timezone contract, schema for delete receipts, Firebase SDK session persistence behavior, SQLite encryption configuration and purge tests. These are engineering-owned; no additional UX choices required.

**Must settle before shipping real numeric targets:** clinical review of Mifflin-St Jeor applicability, activity multipliers, goal deficits/surpluses, protein/fat thresholds, eligibility safety limits. Do not present draft formula as clinically approved.

**Must settle before publishing 100-food catalog or production:** verify per-source reuse/storage/redistribution rights, licensing, nutrition verification protocol, data/privacy policies, account deletion retention/backup behavior, secure hosting/HTTPS, Android/iOS acceptance tests.

## Important architectural caveats

- Server-ordered LWW prioritizes **last operation successfully applied by server**, not necessarily user's most recent real-world action. Offline edits may overtake later online edits. Product accepts this MVP tradeoff.
- A stale offline UPDATE **cannot revive** a deleted entity: tombstone protection overrides LWW.
- Encryption at rest is required for real personal data in development/production builds; SQLCipher availability/Expo version must be verified when implementing.
- Zero-cost development is local; deploying remote public beta may require budget.

## Deliverable scope

- `database-schema.md`: original comprehensive schema preserved with v1.1 normative correction appendix.
- `api-contract.md`: original comprehensive API preserved with v1.1 normative correction appendix.
- `schema-api-alignment-review.md`: this audit and open sign-off list.
- `INSTALL.md`: safe Git merge process.

**Caution:** appendices take priority over conflicting old paragraphs. Before generating OpenAPI and SQL, integrate normative appendices directly into relevant definitions and remove obsolete clauses, then run a line-by-line acceptance audit. This package is a strong review draft, **not** a fully line-by-line reconciled final spec.
