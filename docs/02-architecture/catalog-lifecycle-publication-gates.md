# Catalog lifecycle and publication gates - M03-01

Status: 0010 owner-reported disposable retest **17/17 PASS, exit 0**;
review/publication policy and physical actor/lineage delta APPROVED; structural
0011 candidate and suite prepared, PostgreSQL NOT RUN.
**M03-01 PARTIAL / ACTIVE**, frontend DEFERRED.
Writer 0009 integration remains owner-confirmed 17/17 PASS. Its real bootstrap,
live Firebase and production activation were not exercised. A/B/C stay APPROVED;
the decisions below concern review/publication, not a reopening of grant/revoke.

## Implemented independently

Candidate [0010_catalog_preflight.sql](../../backend/migrations/0010_catalog_preflight.sql)
adds three internal SQL functions. All are STABLE SECURITY INVOKER, fixed
pg_catalog,pg_temp, schema-qualified, PUBLIC EXECUTE revoked. Inherited nonowner
function ACL aborts migration. No new role, ownership, table, trigger, grant,
writer route or automatic transition. The initial coding batch did not access
PostgreSQL; subsequent separately approved owner execution is recorded below.

| Function | Actual contract | Limit |
|---|---|---|
| catalog_revision_content_mutable_v1(uuid[]) | False for NULL/empty list, NULL/missing member, PUBLISHED status, publication time, published pointer or any prior PUBLICATION event. Both old/new revision IDs must be passed for child reparenting. | A conservative fact, not permission to mutate. Pointer existence protects even structurally inconsistent draft pointers. A future trusted writer must load old/new IDs itself; caller-supplied omissions are not authoritative. |
| catalog_category_parent_valid_v1(uuid,uuid) | Existing category reparenting only: reject absent category/parent, self/descendant parent and repeated ancestor; NULL parent permits a root. Visited UUID path terminates cyclic walks. | Does not authorize category creation/edit or serialize calls. Must be read AFTER the shared lock in a future writer. |
| catalog_publication_preflight_v1(uuid) | One authoritative snapshot of revision/food state, eleven-row completeness, four known core values, composition provenance, serving review flags, latest source/review links and native 0007 digest comparisons. Unknown revision returns SQL NULL. | Returns facts, not eligible/authorized/ALLOW. No legal clearance, reviewer authentication, qualification or clinical recommendation. Internal result can contain private source evidence metadata and is not a public DTO. |

Core fields are energy_kcal/protein_g/carbohydrate_g/fat_g; known zero is valid,
unknown is NULL. The seven other fields may stay NULL but all eleven rows must
exist before publication. Existing numeric/FK/text constraints remain authoritative;
no nutrient values or categories are seeded by migration. Tests use synthetic data.

Preflight picks the latest relevant SOURCE_PERMISSION and NUTRITION event by
event_number, regardless of decision, never an older ACCEPTED fallback. It compares
current source snapshot/hash with that decision and computes revision content via
the existing PostgreSQL 18 payload/digest functions. Nutrition must reference the
exact latest source decisions to match; changed nutrients, servings, source data
or provenance invalidate relevant facts. No second serializer/float conversion.

Permission scope is returned exactly, not silently widened. Temporal facts compare
valid_from <= statement time and valid_until > statement time, returning NULL for
unknown bounds; these comparisons do not authorize NULL/unbounded validity or
decide distribution rights. assessed_at is diagnostic and excluded from content
digest; no overall publication eligibility is calculated.

## Enforcement deliberately still blocked

The helpers DO NOT prevent direct writes by migrator/administrator. No trigger or
privileged content writer exists in this batch. An unprivileged service's blanket
DML denial is an ACL boundary, not state-aware immutability for an authorized
editor. Source bibliography immutability, review/batch/junction append-only,
publication/withdrawal atomicity and lifecycle races need controlled writers and
reviewed privilege manifests. Do not activate draft/import/taxonomy/publication
entrypoints based on these helpers or on 0009 capability presence alone.

Any future writer must acquire governance lock (1314214994,1), then issue a separate
statement to reread authority and content under READ COMMITTED. If maintenance
also needs the migration engine lock: migration lock first, governance second.
Functions never commit, unlock, set actor GUC or accept client authority. They do
not acquire the lock themselves: STABLE helpers see the calling statement snapshot,
so combining a wait and validation into one statement is insufficient.

## Historical policy proposal - superseded by owner approval below

| Area | Recommendation and reason | Alternative / consequence |
|---|---|---|
| Review identity and lineage | Persist authoritative internal app_users ID in a defined review actor encoding, resolved from private verified Firebase request. Before claiming author-based self-review prevention, approve how draft/import authors and subsequent editors are recorded; existing 13 revision columns do not give complete author lineage. Never infer it from executor/current_user or reason. | Storing Firebase UID in actor_subject needs a different explicit binding/lifecycle contract. No new typed column or backfill is approved here. Unknown historical actors must fail closed for new publication. |
| Separation and qualifications | Owner must define who can record qualified nutrition review, evidence/validity and required reviewer count. Recommend distinct verified nutrition-review and publication actors; creator/editor self-review rules require the lineage decision above. Qualification is not proven by holding two capability labels. | A different separation/count requires explicit approval. No agent-selected clinical credential criteria, staff account or blanket review exemption. Source-legal review and nutritional review remain separate responsibilities. |
| Permission lifetime and distribution | Recommend rejecting new publication/distribution unless the latest accepted evidence covers each intended use; full store/redistribute/offline_cache usage requires all three. Propose inclusive valid_from/exclusive valid_until, with unknown lifetime denied until owner/legal defines unbounded permission. Reject stale/revoked/rejected decisions. | Do not fabricate expiry dates or treat NULL as eternal permission. Revocation handling for existing caches, historical log snapshots and retention needs owner/legal direction before runtime distribution. Metadata ALLOWED/hash is not legal proof. |
| Transitions, lifecycle and authoring authority | Approve exact publication/withdrawal state transitions and expected-review/digest comparisons. All capability, account, permission and content writers must share the lock; inactive identities deny and reactivation must not resurrect revoked authority. Keep authoring/taxonomy/import closed until their exact capabilities are approved; no new registry names here. | Manual approved maintenance can remain the only authoring path. Current six capabilities do not confer generic draft/category edit or account-lifecycle rights. Publication/withdrawal concurrency cannot be certified using a synthetic reparent fixture. |

This table preserves the previous decision gate. The later owner baseline below
supersedes its unresolved policy alternatives, not operational safety gates.

## Approved review and publication policy baseline

Owner approved the review identity/contributor lineage/audit documentation batch
after the successful 0010 retest. This is policy approval, not approval of the
then-PROPOSED physical matrix, privileged SQL, actual staff or source licensing.
The physical matrix and offline structural coding were subsequently approved;
this does not approve privileged writers or operational activation.

- Trusted Firebase request provenance selects the actor; new audit uses a typed
  internal app_users FK. Historical actor_subject is preserved without invented
  bindings or backfill. All revision content writes, nutrient/serving changes and
  child moves require append-only contributor lineage. Incomplete lineage or
  unverified identity DENY an ACCEPTED nutrition review and new publication.
- At least one authorized nutrition reviewer must not be a contributor to that
  revision. Publisher must differ from that reviewer. Multiple capabilities do
  not waive record-level separation or prove professional qualification/person
  uniqueness. No additional contributor/publisher prohibition is silently added;
  earlier proposed blanket self-publication rules are not the approved baseline.
- Full-app publication requires the latest accepted, evidence-backed, fresh source
  decisions covering store, redistribute and offline_cache, with attribution met.
  valid_from is inclusive and valid_until exclusive. Unknown NULL expiry is denied
  for new publication; never invent evidence or expiry. Unbounded legal permission
  representation remains an activation decision, not an implicit forever grant.
- APPROVED food + REVIEWED revision may first become PUBLISHED. A PUBLISHED food
  may replace its active revision only after all gates pass again. Old published
  revision content is immutable. ARCHIVED republishing remains deferred. Require
  expected state/review/digest values, not a pre-lock boolean authorization.
- Withdraw uses its separate capability and need not wait for valid source rights.
  WITHDRAWAL links the relevant PUBLICATION event, food becomes ARCHIVED, and the
  historical pointer/revision/nutrients/publication timestamp remain intact.
- Reuse exactly six existing CATALOG capability pairs and the shared governance
  lock/post-lock READ COMMITTED revalidation. Authoring/import/taxonomy remain closed
  until their own authority contract is approved. Backend is the trusted identity
  boundary; SQL does not independently authenticate a Firebase human.

Actual reviewer qualification/appointments, source legal clearance, unique-person
verification, retention/anonymization, distributed caches/history after revocation,
live Firebase and real publication remain OPEN. Append-only is not permission for
indefinite retention. Existing A/B/C authority/bootstrap approval is unchanged.

The single proposed [physical matrix](postgres-physical-schema-v1.5.md#review-identity-and-contributor-lineage---approved-physical-contract)
owns column/constraint/index definitions; the [logical delta](database-schema.md#review-identity-and-contributor-lineage)
and [verification plan](sql-migration-plan.md#review-identity-and-lineage---next-offline-batch)
link to it rather than duplicating DDL. Candidate 0011 now implements only the
approved structure. Its PostgreSQL suite is prepared, not executed; writer SQL
and all operational grants remain closed. See the [lineage execution plan](../../backend/tests/integration/README.md#catalog-lineage-0011---prepared-not-executed).

## Verification and PostgreSQL execution history

Actual offline results: focused SQL policy/scanner 15/15 PASS, one final full
backend unit regression 146/146 PASS (0 fail/cancel/skip), typecheck PASS and lint
PASS. Loader/builder tests construct transactional UP/DOWN/checksum statements
without invoking the migration runner or connecting a database. No mobile checks
were repeated because frontend/dependencies were not changed.

[Executable suite](../../backend/tests/integration/catalog-preflight.integration.ts)
is opt-in only; [guard](../../backend/tests/integration/catalog-preflight-guard.ts)
reuses existing local disposable/multi-role checks and additionally rejects retained
writer target 5ca7bad4722340279d938775731cd4ee. It requires an exact extra
NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM. The later retest is owner-reported
**17/17 PASS, 0 fail/cancel/skip, exit 0**, duration 1735.0272 ms. This counts
16 checkpoints plus parent; Codex did not rerun PostgreSQL during final review.

Prepared checks cover DDL/default-ACL rollback, exact closed invoker functions,
NULL/zero/missing rows, stale or rejected/revoked decisions, scope/time facts,
serving evidence, both child endpoints, historical publication, direct service
audit/content/privilege denial, cycles, fixed path and preserved DOWN/UP. Locked
opposing reparent fixtures use real independent clients and observable lock waits,
but demonstrate only the fixture protocol, not a production taxonomy writer.
No skipped/placeholder tests claim publication/withdrawal or clinical enforcement.

Retained first target: nutrasa_it_6643ae844e614d2fa430c6e48953f5be. Four checkpoints
passed before category fixture failed with SQLSTATE 42P08, text versus uuid, at the
shared id/slug parameter: 4 pass / 2 fail including parent, exit 1. Fixture transaction
rolls back on error; sequence advancement may survive. Migration 0010 had committed.
The same type pattern in an unexecuted concurrency query was found statically;
both fixtures now cast UUID explicitly before text. Assertions and 0001-0010 bytes
are unchanged. Repair checks: unit 146/146, typecheck, lint and diff check PASS.

Separately approved retained successful target:
nutrasa_it_e4c65951b6bf42c2b310b5924372b20d, with matching _migrator,
_runtime, _writer and permanently NOLOGIN _executor. Only dedicated PG 18.6
127.0.0.1:5433, nutrasa_it_pg18, system identifier 7697229180258678980 and
D:/Rajendra/NUTRASA-Postgres-IT/data. No old database is opened or modified.

The owner-approved execution covered authenticated collision/HBA/cluster preflight,
three exact DB/role 127.0.0.1/32 SCRAM entries and testing-only reload (25 -> 28
valid rules, zero errors), provision.sql success marker/exit 0, restricted auxiliary
roles/passwords, per-database search_path and fresh ACL/membership/session checks.
One invocation of npm.cmd run test:integration:catalog-preflight produced PASS.
Executor never logs in. The suite grants only target writer schema USAGE for negative ACL checks,
not any helper EXECUTE, table DML, operational ownership or real assignment.
Synthetic default-ACL fault injection, fixture domain/audit mutations,
category protocol concurrency and DOWN/UP were included. STOP on unexpected
failure; no automatic retry/reset/drop/cleanup. Keep all previous evidence targets.

This passing suite validates facts/ACL/fixture protocol only. Final assertions
preserve ten history/checksum entries and synthetic domains with closed helpers;
no independent post-suite row inventory was supplied. Detailed setup/authentication
failures and recovery are retained in the [execution evidence](../../backend/tests/integration/README.md#catalog-preflight-0010---execution-evidence).
Remaining
publication and withdrawal concurrency, actor qualifications, live Firebase,
production privileges, network failure and crash-at-commit require their own
implementation/evidence; M03-01 is not DONE and M03-02/M03-03 do not start here.

## Manual checkpoint file manifest

At HEAD e588f2d, the previous validated writer and the new offline candidate share
scanner/discovery/documentation files. Full-file staging of only the earlier writer
list would omit 0010 dependencies. For one coherent current checkpoint, review the
following 36 files together. This is the historical offline checkpoint list;
0010 subsequently passed the owner-run retest recorded above. The later actor/
lineage documentation batch also changes logical/physical schema and Food DB spec,
so this is not an exhaustive new staging instruction. Owner alone stages and
commits. The sixteen protected prototype/gitignore files are excluded.

```text
backend/README.md
backend/migrations/0009_catalog_capability_writer.sql
backend/migrations/0010_catalog_preflight.sql
backend/package.json
backend/src/capability-writer.ts
backend/src/governance-contract.ts
backend/src/identity.ts
backend/src/migrations/sql-policy.ts
backend/tests/capability-writer.test.ts
backend/tests/catalog-audit-migration.test.ts
backend/tests/catalog-capabilities-migration.test.ts
backend/tests/catalog-digest-migration.test.ts
backend/tests/catalog-foundation-migrations.test.ts
backend/tests/catalog-preflight-migration.test.ts
backend/tests/catalog-preflight-policy.test.ts
backend/tests/food-catalog-migration.test.ts
backend/tests/food-sources-migration.test.ts
backend/tests/governance-environment.test.ts
backend/tests/governance-migration.test.ts
backend/tests/integration/README.md
backend/tests/integration/catalog-preflight-guard.ts
backend/tests/integration/catalog-preflight.integration.ts
backend/tests/integration/fixtures/catalog-preflight/0011_failure.sql
backend/tests/integration/fixtures/governance/0010_failure.sql
backend/tests/integration/governance-environment.ts
backend/tests/integration/governance-writer.README.md
backend/tests/integration/governance-writer.integration.ts
backend/tests/integration/reader-setup.ts
backend/tests/integration/setup-reader.ts
backend/tests/migration-sql-policy.test.ts
backend/tests/reader-setup.test.ts
docs/02-architecture/authorization-registry-reader-security.md
docs/02-architecture/catalog-lifecycle-publication-gates.md
docs/02-architecture/sql-migration-plan.md
docs/02-architecture/system-architecture.md
docs/04-development/codex-task-board-v1.md
```

Technical basis: PostgreSQL 18 [function snapshots](https://www.postgresql.org/docs/18/xfunc-volatility.html),
[recursive traversal](https://www.postgresql.org/docs/18/queries-with.html) and
[function security](https://www.postgresql.org/docs/18/sql-createfunction.html).
