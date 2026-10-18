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
