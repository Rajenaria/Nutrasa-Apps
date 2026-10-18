# NUTRASA - Authorization Registry and Reader Security

Status: APPROVED technical vocabulary and 13-column manifest; disposable reader integration **8/8 PASS, exit 0**, including effective ACL and actual max=1 Pool reuse. Production installation, real assignments and runtime activation remain disabled. Prepared after checkpoint 38295b4 with the Authorization Foundation working changes preserved. This is the single documentation matrix for approved identifier/scope vocabulary, not approval of any reviewer, publisher or grantor. [Existing trust boundary and writer design](system-architecture.md#authorization-read-boundary-dan-restricted-writer-plan) remain authoritative for behavior; [future integration plan](sql-migration-plan.md#registry-and-reader-privilege-integration-plan) separates implementation from execution.

## 1. APPROVED behavior and technical vocabulary

APPROVED behavior: verified Firebase identity via Fastify, app_users internal subject binding, default DENY, exact case-sensitive capability/scope, no client actor/claims authority, no cache, no automatic first-user admin. Migration 0006 already defines review kinds SOURCE_PERMISSION/NUTRITION/PUBLICATION/WITHDRAWAL; 0008 defines technical event actions GRANT/REVOKE. Those SQL labels are not capability identifiers and cannot be supplied as substitutes for an authorization pair.

The owner approved exactly the following six technical pairs, with one exact scope literal CATALOG. No actor has been assigned these rights. This proposes an explicit catalog-wide boundary, not wildcard matching, a schema CHECK, a scope hierarchy or permission over arbitrary user data. Resource ownership, content state and legal/publication gates remain separate. Approval of this vocabulary does not authorize granting it to anyone or wiring the reader into server.ts.

| Capability identifier (APPROVED) | Scope (APPROVED) | Existing operation / reason for a separate pair |
|---|---|---|
| catalog.source_permission.review | CATALOG | Record SOURCE_PERMISSION decisions and associated evidence; does not confer nutrition review or legal clearance. |
| catalog.nutrition.review | CATALOG | Record NUTRITION review against approved content/digest; reviewer qualifications remain OPEN. |
| catalog.publication.publish | CATALOG | PUBLICATION entrypoint only after all source/nutrition/content gates; no implicit review right. |
| catalog.publication.withdraw | CATALOG | WITHDRAWAL entrypoint with preserved history; distinct from publish and does not reopen published content for editing. |
| catalog.capability.grant | CATALOG | Restricted administrative GRANT transition, subject to separate approved delegation/target policy; no blanket right to grant any pair. |
| catalog.capability.revoke | CATALOG | Restricted administrative REVOKE transition; does not imply grant/publish/review rights. |

Dots are identifier spelling only: no prefix, glob, regex, inheritance or administrative bypass. Grant/revoke permissions cannot authorize self-grant, delegation of themselves or bootstrap by their mere presence. Who may issue them, to whom and for which pairs must be decided by owner first. Draft/import/taxonomy operations exist conceptually in the older matrix but are excluded from this minimum registry proposal: neither these six pairs nor login alone authorize them. Their future vocabulary requires a separate coherent contract when consumers are approved.

Alternative considered: combine publish/withdraw or grant/revoke into one management permission. Recommendation is six independent pairs to avoid silently coupling revocation/removal with power to confer or publish. This adds only configuration entries, not tables, role hierarchies or new runtime components.

Implementation: [capability-registry.ts](../../backend/src/capability-registry.ts) is the single typed definition. Both requireCapability and the read adapter reject unknown pairs before querying. createCapabilityAuthority retains an empty activation allowlist by default; a trusted supplied subset must also belong to the registry. Recognition is not assignment. server.ts still installs no authority or reader Pool. No SQL registry/seed or wildcard/hierarchy is introduced. Changing case/whitespace changes the pair; no normalization is introduced.

## 2. Reader review against immutable schema

Inspected sources: [adapter](../../backend/src/capabilities.ts), [identity hook](../../backend/src/identity.ts), [Firebase adapter](../../backend/src/firebase.ts), [0008](../../backend/migrations/0008_catalog_capabilities.sql) and app_users in immutable 0001. The approved query and manifest continue to match the immutable schema; historical migrations are unchanged.

| Check | Evidence / limitation |
|---|---|
| UID origin | requireCapability authenticates first using verifyIdToken(token,true); only verified firebaseUid reaches allows. Scope/capability are server route closure values. Body/header/actor_subject/GUC/custom claims do not select the lookup. The adapter itself is a trusted DI boundary, not an authenticator callable by untrusted clients. |
| Subject binding | Exact u.firebase_uid lookup in app_users, then JOIN assignments on u.id; no new principal or profile requirement. Missing subject cannot match. |
| Account lifecycle | SQL requires ACTIVE, so PENDING_DELETION/DELETED cannot allow. DISABLED is not an app_users enum: Firebase disabled/deleted/revoked errors are handled at token verification. Reactivation/retention policy remains OPEN; no automatic restore of authority. |
| Effective state | Full composite event match on subject/capability/scope/id plus action GRANT; missing/revoked assignments deny. A later-numbered event for that same key conservatively makes the pointer stale and denies. Sequence order is not proof of commit order; a controlled writer is still required. |
| Input safety | One SELECT EXISTS with $1/$2/$3, C collation and no interpolated input. Registry membership is checked before SQL; unknown values stored in 0008 never make themselves known. |
| Snapshot/revocation | A single statement observes account/pointer/event/history together. No cached rights. Commit before the next clean READ COMMITTED statement must be visible; revoke during an in-flight snapshot may be observed by the next read. This does not authorize a later write transaction. |
| Failure | Explicit false is DENY/403; query failure or malformed result is authority failure/safe 500. No client sees SQL, credential or raw database error. Public health does not call the authority. |
| Current readiness | SQL can work with 0008 using the exact column rights below, without migrator/administrator bypass. Disposable reader privileges and PostgreSQL evaluation now have owner-confirmed 8/8 PASS, including the test-owned max=1 Pool scenarios. Production Pool lifecycle remains OPEN. Existing 0008 structural 16/16 PASS is separate evidence. |

## 3. Least-privilege manifest (APPROVED; verified on disposable target only)

Reuse the existing proposed role names, avoiding another role family. Development/testing runtime names are nutrasa_dev_app/nutrasa_test_app; their effective database privileges have not been inspected in this batch. The disposable installation below was verified on nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc; this does not install privileges on permanent databases.

| Principal | Existing/proposed identity | Database/schema | Tables, functions and ownership boundary |
|---|---|---|---|
| Runtime reader | Existing app service names (not activated) or disposable nutrasa_it_<id>_runtime | CONNECT its database, USAGE nutrasa; no database CREATE/TEMP or schema CREATE. No SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS, ownership, grant option or membership/SET ROLE path to privileged roles. | Only the 13 column SELECT rights below. No direct INSERT/UPDATE/DELETE/TRUNCATE, REFERENCES/TRIGGER/MAINTAIN, migration metadata access, application writer/helper EXECUTE or sequence access. |
| Migrator | Existing matching _migrator | Owns nutrasa/nutrasa_migrations and schema objects as required by runner; installation/DDL only. | Existing migration/history/checksum behavior retained. Never an HTTP/runtime connection. Its ability to bypass operational table policy is an administrative trust boundary. |
| Controlled installer | Existing authorized test administrator nutrasa_it_admin; permanent administrator not selected by this proposal | Approved maintenance target and phases only, no application pool. | Can provision/transfer exact future function ownership in reviewed phases. No human editorial capability inferred from administrator credentials. No action here. |
| NOLOGIN executor | PROPOSED _executor names in existing privilege manifest | NOLOGIN, no schema/database CREATE, no schema/table ownership, no runtime membership/SET ROLE path. No direct connection required. | No new grant/signature now. Future writer-only SELECT prerequisites, INSERT events, INSERT/UPDATE projection, exact helper EXECUTE if justified. No event UPDATE/DELETE/TRUNCATE or metadata access; sequence rights only if tested necessary. Future functions owned via controlled installer; never tables. |

Reader column manifest, derived directly from all outer and nested references in effectiveCapabilitySql:

| Object | Exact SELECT columns | Needed by |
|---|---|---|
| nutrasa.app_users | id, firebase_uid, account_status | Verified UID/internal subject and ACTIVE filter. |
| nutrasa.catalog_capability_assignments | subject_id, capability, scope, last_event_id | Exact pair and authoritative event pointer. |
| nutrasa.catalog_capability_events | id, subject_id, capability, scope, action, event_number | Composite event binding, GRANT predicate and correlated stale-event check. |

These are 3+4+6 = 13 column privileges, not table-wide SELECT. No app_users email/cache/timestamps or events actor_subject_id/reason/request_id/recorded_at is needed. SELECT * on app_users/events should therefore fail. Assignments currently has only the four required columns, so selecting its current full row can legitimately succeed; do not write a false negative assertion that it must fail. Column grants avoid silently authorizing future added columns. Reading event_number needs no access to the identity sequence.

This is an approved narrow reader design in addition to the older public-projection-only runtime manifest, not a production access grant. Other app-domain permissions are outside this package. The original offline batch generated no installation; the later owner-approved disposable installation and recovery are documented in the execution evidence below.

Effective privileges must be checked across direct ACL, column ACL, PUBLIC, transitive INHERIT and SET ROLE paths, role attributes and ownership. NOINHERIT alone does not block a SET-enabled membership. A nonowner reader with zero privileged memberships is the minimum disposable test design. Schema USAGE permits name lookup, not table read; catalog object names can remain visible without data access. No metadata confidentiality claim is made merely by denying schema USAGE.

Granting CONNECT only on the target does not erase PUBLIC CONNECT/TEMP inherited on other databases such as maintenance/template databases. Do not claim cross-database ACL isolation from the target grant alone. Audit catalog privileges without connecting to old databases; restrict actual authentication with exact target database/reader pairs in the dedicated test HBA and keep client allowlists. Do not change other databases to satisfy a test. A positive CONNECT catalog result and a rejected HBA connection are different evidence.

Default database PUBLIC CONNECT/TEMP and function PUBLIC EXECUTE need explicit review on the approved target. Table/column/sequence PUBLIC rights must not be introduced by global or per-schema default ACL. Future functions need closed EXECUTE in the same creation transaction; no blanket future reader table/function grant. Do not revoke built-in pg_catalog functions globally: ordinary operators/information functions may be public and needed. This manifest prohibits extra application functions, not all PostgreSQL execution.

References: [PostgreSQL 18 privileges](https://www.postgresql.org/docs/18/ddl-priv.html), [membership](https://www.postgresql.org/docs/18/role-membership.html), [privilege inquiry functions](https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).

## 4. Read-only inspection queries for the future guarded reader session

Review-only query examples; no claim that these exact manual statements were executed. Effective privileges were checked by the executed guarded suite. Run examples only after separately approved test provisioning and authenticated instance/database/role/schema-owner/marker guard. No password/hash/secret column is read. Results describe effective privileges; automated assertions must also compare object ownership, direct/default ACL, membership paths and the exact 13-column manifest.

```sql
SELECT c.relname, a.attname,
       pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS can_read,
       pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'INSERT') AS can_insert,
       pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS can_update,
       pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'REFERENCES') AS can_reference
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='nutrasa'
  AND c.relname IN ('app_users','catalog_capability_assignments','catalog_capability_events')
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum;

SELECT c.relname,
       pg_catalog.has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
       pg_catalog.has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
       pg_catalog.has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
       pg_catalog.has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
       pg_catalog.has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
       pg_catalog.has_table_privilege(current_user,c.oid,'MAINTAIN') AS can_maintain
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='nutrasa'
  AND c.relname IN ('app_users','catalog_capability_assignments','catalog_capability_events');

SELECT r.rolname,
       pg_catalog.pg_has_role(current_user,r.oid,'USAGE') AS inherited_now,
       pg_catalog.pg_has_role(current_user,r.oid,'SET') AS can_set_role
FROM pg_catalog.pg_roles r
WHERE r.rolname<>current_user
  AND (pg_catalog.pg_has_role(current_user,r.oid,'USAGE')
       OR pg_catalog.pg_has_role(current_user,r.oid,'SET'));
```

Expected disposable reader results: exactly the listed columns can_read=true; all write/reference flags false; membership result empty. Check table privileges and column privileges together because table-level false does not exclude a column write grant. Runtime must not own these objects. These checks complement actual forbidden DML attempts that passed in the approved disposable security suite.

## 5. Pool and transaction contract

No production Pool is created. The test-owned max=1 Pool passed real PostgreSQL backend reuse and sequential/concurrent identity isolation; checkout/release failure branches also have mock coverage. Production Pool composition remains deferred. Future composition owns one bounded reader pool per server process, using runtime credentials only, explicit host/port/database/user validation before construction and an approved role/target guard. Do not silently use MIGRATION_DATABASE_URL. Core buildApp stays DI-only and tests use mocks; close the owned pool with the app's onClose lifecycle. Handle pool error events without logging connection strings, token or user health data.

The reader uses one pool.query statement with autocommit READ COMMITTED, no explicit BEGIN, per-user SET ROLE, session GUC, mutable shared actor or permission cache. The reader pool must not be borrowed by code that can leave an open transaction; current_user/session_user remain the service, not a Firebase human. A read-only GUC is defense-in-depth and can be changed by a session; it is not a substitute for ACL.

A future writer uses one checked-out client for BEGIN/lock/revalidation/event+pointer/COMMIT and guaranteed rollback/release. Never send transaction commands through independent pool.query calls. Failed rollback means discard the owned connection instead of returning a poisoned session. Do not reset or terminate unrelated backends. Snapshot freshness, revocation-in-flight and Firebase verification-to-DB races remain explicit limitations, not atomic external revocation guarantees. [node-postgres pooling](https://node-postgres.com/features/pooling).

## 6. Dependency order and remaining approval gates

1. COMPLETE: six approved exact technical pairs and the 13-column manifest; no actor assignment or production server authority.
2. Disposable installation/recovery and reader suite completed under owner approval: 8/8 PASS, exit 0. Do not rerun setup or reuse the retained target. Any future installation needs fresh-target review and approval.
3. Owner must decide grant authority/bootstrap, delegation limits, self-grant/self-review/self-publication, separation, reviewer qualifications and legal retention/reactivation. Dependent operations stay disabled.
4. Only after those prerequisites, design and approve a restricted writer with atomic event/pointer transitions, append-only privileges, duplicate-transition rejection, expected-pointer checks and shared locking. Approve isolated writer rollback/concurrency/security execution separately.

Production Pool lifecycle, multiple-backend tests and live Firebase remain OPEN.
M03-01 remains PARTIAL. See [bukti reader 8/8 PASS, exit 0](../../backend/tests/integration/README.md#reader-security-execution-evidence) for setup collision, approved recovery and
the exact boundary of the completed suite; this is not approval of a new execution.

## 7. Evidence boundaries for the executed disposable harness

[reader-guard.ts](../../backend/tests/integration/reader-guard.ts) validates dedicated _runtime credentials before Client construction, loopback with explicit 5433, confirmation and startup override rejection. Authenticated checks enforce database/current_user/session_user, PostgreSQL 18, cluster name, owner/marker and schema ownership by the matching _migrator. It checks effective column/object/default ACL, PUBLIC, direct/transitive memberships and SET ROLE paths. Exact 13 SELECT columns are required; no table-wide read, DML, metadata, application function, sequence, grant option or runtime ownership is accepted. Unsafe role paths fail before fixture DML.

Only the authorized administrator's separate read-only preflight can establish system identifier 7697229180258678980 and the absolute testing data directory. The reader is deliberately not granted pg_control_system or superuser access to prove these. The suite does not independently prove the system identifier; that administrator checkpoint is mandatory before its invocation. Catalog CONNECT on other databases is not proof of actual HBA access and is reviewed without connecting to them.

Executed PostgreSQL scenarios cover strict lookup, missing/revoked/stale assignments, inactive accounts, denied writes/DDL/sequence/metadata/SET ROLE, sequential/concurrent Fastify requests over a test-owned max=1 Pool with backend PID reuse assertions, retained synthetic audit, and safe failure after closing that owned connection. Synthetic migrator fixture DML does not prove a privileged writer, duplicate-transition rejection, atomic revoke/write, production pool management or network-outage behavior. Those remain deferred. Owner-reported reader suite results are 8/8 PASS, 0 fail/skip, exit 0. Offline mock/static results remain separate from that actual ACL evidence. Crash recovery during commit remains OPEN.

Offline verification of this approved implementation batch: focused identity/capability/reader security tests 33/33 PASS; one full backend unit regression 119/119 PASS, 0 fail/skip; backend typecheck and lint PASS. At that historical offline checkpoint, PostgreSQL reader integration was still PREPARED; the later execution is recorded below. No dependency or mobile source change.

Disposable setup is now implemented offline: [installer and execution contract](../../backend/tests/integration/README.md#disposable-reader-installer---offline-coding-complete-execution-not-authorized). Exact candidate, authenticated admin control-data proof, collision/HBA guards, reused bootstrap/core, explicit provisioning marker plus independent postconditions and 13-column reader installation precede the suite. That describes the historical offline batch, not the later approved disposable execution.

## 8. Final reader checkpoint

[bukti reader 8/8 PASS, exit 0](../../backend/tests/integration/README.md#reader-security-execution-evidence). PostgreSQL 18.6 on 127.0.0.1:5433;
19 valid HBA rules, 0 parsing errors after two exact-role rules. The setup retry
failed at collision preflight (exit 1) after earlier partial setup. Owner-approved
targeted recovery enabled authenticated reader verification; the suite then passed.
No original full-install success marker, activation marker or numeric activation
exit was supplied. Do not claim full-installer end-to-end PASS.

Exactly 13 column SELECT rights, effective ACL and negative privileges passed.
Actual max=1 Pool backend reuse and request isolation passed only for the tested
sequential/concurrent scenarios. No production Pool, operational assignment,
SECURITY DEFINER writer or editorial activation was introduced. Synthetic audit,
eight immutable migrations and prior targets remain retained; no reuse/reset or
cleanup without explicit approval. Crash-at-commit and the authority gates above
remain OPEN.

## 9. Authority and restricted grant/revoke foundation

Status: **DESIGN PREPARED; WRITER BLOCKED ON OWNER POLICY**. Reviewed from clean
checkpoint e9e8e82 on feat/database-foundation. The Reader & Pool 8/8 PASS evidence
above is retained; it is not evidence of a privileged writer. No migration 0009,
writer signature, role, operational grant or activation is introduced here.

### Baseline and unresolved trust boundary

The current task requires manual owner-approved bootstrap, no first-user admin,
no automatic authority from UID/email/custom claims, no self-grant or self-revoke,
exact approved registry pairs, no wildcard/inheritance, atomic audit and
fail-closed authorization. These are constraints on the future implementation;
they do not designate a grantor or approve delegation.

Two blocking choices cannot be supplied by SQL defaults:

| Gate | Existing evidence / gap | Minimal proposal, still PROPOSED |
|---|---|---|
| Service-to-actor binding | identity.ts exposes only the UID from verified Firebase tokens; capabilities.ts is a read-only boolean evaluator. Neither establishes a database writer identity. session_user of a pooled login is a service, not a human. | Accept the dedicated backend service as the trusted identity-assertion boundary: only trusted server composition passes its verified request UID; SQL resolves the internal actor and revalidates ACTIVE/authority after locking. Actor UUID, GUC, body/header/custom claim or a prior boolean ALLOW cannot select the actor. A compromised service credential can impersonate an asserted UID: this model does not cryptographically prove the human to PostgreSQL. If that residual trust is unacceptable, STOP and design a separately reviewed assertion protocol; do not introduce signing keys, context setters or new tables silently. |
| Delegation and first authority | Six registry pairs exist, including grant/revoke, but no rule says which target pairs each grantor can grant/revoke. Recognition alone cannot authorize self-delegation or bootstrap. | Owner approves an explicit finite delegation matrix and bootstrap actors before use. Recommended conservative starting boundary: no ordinary administrative transition grants/revokes the grant/revoke capabilities themselves; such delegation remains manual maintenance until separately approved. This recommendation is not an approved authority rule. |

An always-denying SQL function would add unused schema and scanner surface without
proving a writer. A function accepting arbitrary actor UUID plus a generic
catalog.capability.grant check would instead invent delegation policy. Neither is
introduced as a substitute for the missing decisions. No external-user access or
new authentication scheme is inferred from this planning batch.

### Manual bootstrap contract, not an executable procedure

1. Owner records explicit approval of the environment, exact verified Firebase UID
   and existing ACTIVE internal subject of the recipient, exact registry pairs,
   reason, request correlation and the separate person recording the bootstrap.
   No actual UID, subject, credential or assignment is selected in this document.
2. Resolve the bootstrap recording actor before any SQL is generated.
   0008 requires actor_subject_id to reference app_users and the task prohibits
   self-grant. A PostgreSQL administrator is not automatically an app_users actor.
   PROPOSED: a distinct owner-approved ACTIVE internal recording subject, with
   manual maintenance authorization for this one bootstrap only. Do not invent a
   system account, fabricate an actor or bootstrap by calling an ordinary writer
   that presupposes existing authority. This exception needs owner approval.
3. A separately approved maintenance procedure verifies cluster/target, schema,
   immutable history, exact registry and actor/recipient bindings. It takes the
   same catalog transaction lock as future writers, rechecks absence of conflicting
   capability history and denies duplicate/already-initialized bootstrap. The
   precise initial pairs and definition of already initialized require the owner
   decision; absence of an arbitrary row is not a first-user rule.
4. Append the event and matching effective pointer in one transaction; verify
   audit fields and postconditions before commit. Any failure rolls back both,
   with no automatic retry, replacement of history or silent idempotent success.
   Sequence gaps after rollback are acceptable and not evidence of lost audit.
5. Close the one-off maintenance path. No reusable bootstrap endpoint, credential,
   caller EXECUTE, role membership or standing escalation privilege remains.
   Report a partial phase and STOP if an installation step fails; do not recover
   through reset/DROP/reassignment or run bootstrap again without owner review.

This contract is review material only. No bootstrap SQL or integration fixture
that assigns real authority is generated. Retention/deletion and reactivation of
subjects referenced by authority history remain separate owner decisions.

### Candidate writer transaction and lifecycle

The following is an implementation plan, not installed enforcement. Function
signature, error mapping, lock reservation and delegation rules remain subject to
the coherent approval below; no new API error code is assigned.

1. Validate the trusted caller and server-derived actor UID, exact target/pair,
   action, nonblank audit reason/correlation and expected effective event. Reject
   unknown pairs and NULL/blank inputs; reject actor=target for either action.
   UID/scope/capability matching stays exact without normalization.
2. Require READ COMMITTED. Acquire the existing PROPOSED catalog transaction-lock
   pair (1314214994,1), separately reserved from the migration bigint lock; then
   reread identity, delegation and authoritative event/pointer state in subsequent
   statements. Never combine waiting and all authorization reads into one stale
   pre-lock snapshot. No row locks before the catalog lock; all participating
   writer/lifecycle paths must follow the same protocol.
3. Check actor ACTIVE and authorized for this exact transition and target pair
   under the owner-approved matrix, including that administrative capabilities
   are not implicitly delegable. Unknown/missing policy denies. Grant requires an
   eligible ACTIVE recipient. Whether an authorized actor may revoke an inactive
   recipient is an explicit lifecycle decision, not a reason to permit a grant.
4. Validate the full composite pointer and absence of a newer conflicting event.
   An expected-pointer mismatch or history/projection disagreement fails closed;
   do not silently repair missing/stale projection. Initial no-history GRANT is
   distinct from a missing projection that already has history.
5. Apply the transition matrix below. Generate event id/number/time using the
   existing database defaults and bind actor from the trusted resolved subject.
   Append one event, then insert/update the exact assignment to that event in the
   same transaction. Leave prior events unchanged. Any audit/pointer error aborts
   the operation, with no partial commit or automatic retry. request_id is audit
   correlation, not an approved unique idempotency key.
6. Caller commits/rolls back on the same held client; the function does not commit
   itself. The transaction advisory lock releases on transaction end. After error,
   rollback before release; discard a connection if rollback/cleanup fails.
   Do not infer writer safety from the max=1 read-only Pool test.

| Current authoritative state | GRANT | REVOKE |
|---|---|---|
| No event and no assignment | One event + pointer, if all authority gates pass | Reject inactive/missing REVOKE |
| Effective GRANT | Reject duplicate active GRANT | One REVOKE event + pointer, subject to approved recipient lifecycle rule |
| Effective REVOKE | Regrant with new event + pointer, if recipient eligible | Reject duplicate inactive REVOKE |
| Missing/stale/mismatched pointer with history | Reject and preserve state | Reject and preserve state |

No assignment remains DENY to the reader. A revoked projection is retained and
points to its REVOKE event; it is not deleted to erase prior authority. Duplicate
rejection is writer policy, not a claim that 0008 DDL enforces transitions.
Event numbers may have gaps and are not commit ordering without the shared writer
protocol. Account lifecycle and protected writers also need compatible locking;
a standalone grant writer cannot promise atomic Firebase revocation or future
publication safety.

### Ownership, scanner and rollback boundary

Retain the existing two-phase installer design: domain engine creates closed
function definitions with schema/tables still migrator-owned; separately approved
administrator maintenance transfers only reviewed writer signatures to an
executor NOLOGIN. Do not give CREATE permanently or SET ROLE membership to
runtime, executor or migrator as an installation shortcut. No actual role or
signature is selected or installed by this document.

Future writer functions must be VOLATILE, have fixed search_path pg_catalog,pg_temp,
qualify application objects and contain no dynamic SQL, role changes or transaction
control. Revoke PUBLIC EXECUTE in the creation transaction and audit inherited
function/default ACL; ownership transfer is not itself permission to activate.
Executor gets only reviewed prerequisites plus event INSERT and assignment
INSERT/UPDATE. No event UPDATE/DELETE/TRUNCATE, metadata access, table/schema
ownership or runtime direct DML. Sequence USAGE, if needed for event_number, must
be explicitly justified/tested rather than granted wholesale. Administrative
owners remain trusted bypasses; append-only is an operational privilege boundary.

The actual sql-policy.ts currently accepts SQL digest SELECT helpers with
SECURITY INVOKER and STABLE/IMMUTABLE; its restricted PL/pgSQL header/block grammar
and REVOKE signature allowlist do not accept the proposed privileged writer.
A future change must add only exact reviewed header/signature/control-flow forms
with negative regression cases. Do not broadly allow SECURITY DEFINER, arbitrary
function EXECUTE, IF/dynamic SQL or transaction statements merely to accept a draft.
No scanner expansion is made before a concrete approved function body exists.

Maintenance DOWN/upgrade requires reviewed ownership handback and closed callers,
not edits to 0001-0008 or loosening runner owner checks. Removing a future writer
must preserve capability events/projection and immutable migration baselines; no
CASCADE or deletion of authority history. Domain/admin/activation phases are not
one globally atomic deployment. On any failure leave activation closed and report
exact partial state; no automatic recovery or cleanup.

### Security test specification and execution gates

No executable writer integration suite exists yet: without the approved trust and
delegation contract it could only test an assumed policy. The existing Reader
8/8 suite remains unchanged and is not rerun. This specification is the acceptance
input for one later executable suite, not skipped tests or PostgreSQL PASS.

| Test group | Required deterministic evidence once implementation is approved |
|---|---|
| Actor/delegation | Missing/forged client UID/actor/header/claim rejected at server boundary; exact verified UID binding only. Inactive/deleted actor, missing/revoked authority, unknown pair, prohibited delegation and self-grant/self-revoke reject before audit DML. Test the explicitly accepted service-credential trust boundary rather than claiming SQL proves Firebase tokens. |
| Bootstrap | Wrong environment/target/recipient/recorder, self-recording, existing conflicting history and a second bootstrap rejected; ordinary runtime cannot bootstrap. Approved synthetic maintenance success leaves exactly the intended event/pointer, without a standing bypass. |
| State and audit | Initial GRANT, duplicate GRANT, REVOKE, duplicate/missing REVOKE, regrant, stale/absent projection with history, wrong composite binding and expected-pointer mismatch. Counts and unchanged historical rows verified after each rejection. |
| Atomic failure | Inject failure after event append and before pointer update; also fail audit INSERT. Neither event nor pointer change commits. No use of manual cleanup to make assertions pass; sequence gaps permitted. |
| Real concurrency | Separate clients and explicit barriers: grant/grant, grant/revoke, stale pointer, authority revoke versus protected transition. Verify one shared advisory-lock protocol, post-wait revalidation, finite failure behavior and release after commit/rollback; no timing-only sleeps or inferred commit order from sequence. |
| Least privilege | Actual nonowner caller, executor attributes, exact ownership/path/body/ACL/default ACL, PUBLIC EXECUTE and membership/SET ROLE denial; forbidden audit UPDATE/DELETE/TRUNCATE, direct assignment writes, metadata and DDL all fail. Temporary shadow objects cannot redirect qualified function lookups. |
| Connection cleanup | Same checked-out client for transaction; rollback after negative tests; owned connection discarded if cleanup fails; no context leaks between verified request identities. Test infrastructure outage separately from an intentionally closed Pool. |
| Deployment lifecycle | Atomic closed definition/ACL installation, reviewed ownership-transfer boundary, failed installer leaves no caller access, DOWN removes only future functions, preserves authority history and cannot silently change immutable checksums. |

Focused offline tests will cover the approved scanner grammar and unsafe variants,
server-to-writer binding and fail-closed error mapping. One full non-database
regression, typecheck/lint and diff checks follow a stable code batch. PostgreSQL
concurrency/privilege/rollback and crash-at-commit remain unproven until separately
authorized real tests; mocks do not certify them.

### One coherent owner gate before writer coding

Decide together: (1) accept or replace the trusted service UID assertion model and
its credential-compromise limitation; (2) approve the finite grant/revoke delegation
matrix, especially administrative capability delegation; (3) designate the manual
bootstrap recording model and initial-authority selection rules without self-grant;
(4) decide inactive-recipient revocation/reactivation behavior; (5) approve the
reserved catalog lock protocol across future writers. Then approve one offline
batch for closed writer migration, minimal scanner changes, unit/static tests and
prepared isolated integration harness. No operational staff assignment or SQL
execution follows from that coding approval. Installation, operational grants and
PostgreSQL tests retain their own explicit approval boundaries. M03-01 PARTIAL.

Technical references: [PostgreSQL 18 function security](https://www.postgresql.org/docs/18/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
and [transaction advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS).
