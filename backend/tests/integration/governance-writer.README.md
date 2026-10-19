# Restricted capability writer — disposable integration PASS

Offline candidate: [0009](../../migrations/0009_catalog_capability_writer.sql),
[request adapter](../../src/capability-writer.ts),
[suite](governance-writer.integration.ts),
[guard/installer](governance-environment.ts).
Owner approved A/B/C, offline coding and then one separately controlled testing
batch. Owner supplied the local suite result: **17/17 PASS, 0 fail/cancel/skip,
exit code 0**, duration 4400.8131 ms. This is 16 checkpoints plus the parent test,
not 17 independent scenarios. PostgreSQL was not queried again for final review.
Production activation and real bootstrap remain disabled.

## Execution evidence and retained state

The target below was provisioned on authenticated PostgreSQL 18.6, loopback
127.0.0.1:5433, with the pinned cluster/control-data identity. HBA grew from 19 to
22 valid rules, 0 errors, with only the three exact target entries and original
rules preserved. Migrator, reader and writer logins were independently verified;
executor remained NOLOGIN with no password or membership. Database-specific
search_path was set to pg_catalog, nutrasa for the three login roles. Executor
uses the fixed function path instead of a login configuration.

Provisioning first stopped at the role-name confirmation guard, line 87, exit 3,
after database/schema/default-ACL COMMIT. No success marker was supplied for that
attempt. Separately approved recovery verified existing ownership, marker, fresh
schemas and restricted NOLOGIN migrator before password reset/LOGIN. Do not
reinterpret this as a complete original installer exit 0. A later read-only
preflight passed administrator/migrator/reader checks but writer authentication
failed with 28P01; the suite was NOT invoked. Separately approved writer password
recovery and authenticated login succeeded before the successful suite invocation.
These stopped setup/preflight attempts are distinct from a failed or repeated suite.

Passing checkpoints cover DDL/default-ACL rollback, controlled ownership and closed
PUBLIC EXECUTE, all four editorial pairs, administrative/self/unknown denial,
inactive actors/recipients, duplicates, atomic audit/pointer rollback, caller path
override, direct audit/metadata/DDL/sequence/SET ROLE denial, stale pointers,
concurrent expected-pointer serialization, authority revocation after lock wait,
mocked request identity and actual max-one writer Pool, and protected DOWN/UP.
No extra sequence grant was added to obtain PASS.

The final suite assertion checks actual 0001-0009 history, nine matching immutable
checksum baselines and unchanged audit count across DOWN/UP. The function is
recreated migrator-owned and invocation by writer is denied with 42501; test
executor/table and reader ACL remain installed. Four roles, 22 HBA rules and
synthetic domain/authority audit are retained. Row totals and post-suite idle
sessions were not independently inventoried. No database/role cleanup occurred.
Do not rerun this suite or reuse/reset this target; it is no longer fresh.

## Migration bytes reviewed at finalization

These are local SQL byte hashes, not a new database query. The final passing
suite compares its history/ledger against these unchanged actual migration files.

| Migration | SHA-256 |
|---|---|
| 0001_identity | a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af |
| 0002_food_sources | 9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6 |
| 0003_food_catalog | 24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888 |
| 0004_food_taxonomy | d5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542 |
| 0005_food_servings_provenance | 1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218 |
| 0006_catalog_audit | c682c41851dd2932e79b66846b696f6ad5d4f8ed8906c77e355f37350ed89961 |
| 0007_catalog_digest | b6df290443a21652ce28776bbf3b2f86fac085151eb8759b6c0c9d2802930425 |
| 0008_catalog_capabilities | 68ddb8d4af1ed64260863c41b93be3699a81956da1cc7233c5456ffa0d5d2328 |
| 0009_catalog_capability_writer | 6e66bf3c84c192e584e6e7fdb785bf6e24f97b878286a6a0efcf2866f1566ac9 |

## Approved execution package (history, not a rerun instruction)

Names verified unused before provisioning; **now retained and occupied**:

| Resource | Exact retained name |
|---|---|
| Database | nutrasa_it_5ca7bad4722340279d938775731cd4ee |
| Migrator | nutrasa_it_5ca7bad4722340279d938775731cd4ee_migrator |
| Reader | nutrasa_it_5ca7bad4722340279d938775731cd4ee_runtime |
| Writer | nutrasa_it_5ca7bad4722340279d938775731cd4ee_writer |
| Executor | nutrasa_it_5ca7bad4722340279d938775731cd4ee_executor |

Testing only: PostgreSQL 18.6, 127.0.0.1:5433, nutrasa_it_pg18,
system identifier 7697229180258678980,
data directory D:/Rajendra/NUTRASA-Postgres-IT/data, admin nutrasa_it_admin.
Never connect to 5432, permanent databases or retained disposable targets. The
guard denies the eleven previously retained IDs and requires fresh relation AND
function catalogs. No unsafe override or automatic role/database creation.

The separate owner approval covered the following bounded sequence. Keep these
steps for review; rerunning against this occupied target is not authorized:

1. Read-only admin identity/control-data proof and collisions for DB + FOUR roles.
   Preserve existing targets/roles/HBA without opening old databases. Any collision
   means STOP; no reuse, retry, reset or cleanup.
2. Add only the three exact SCRAM loopback rules below before general reject;
   reload testing only. Verify all original entries, loaded configuration and zero
   errors. Do not assume the historical HBA count is still current.
3. Provision once through existing [provision.sql](provision.sql), DB/migrator only.
   Verify exit/marker AND independent postconditions. Do not bootstrap manually.
4. Admin creates reader/writer initially NOLOGIN and executor permanently NOLOGIN,
   all NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION/NOBYPASSRLS;
   no memberships, SET ROLE paths or object/database ownership. Grant CONNECT
   only on this target to reader/writer; no CREATE/TEMP or other-database rights.
   Set passwords via local psql prompts, then enable LOGIN for reader/writer only.
   Render/review actual commands after current preflight and approval; no secret
   belongs in SQL, command arguments, repository, transcript or chat.
5. Independently verify role logins, marker, schema owner, effective/default ACL,
   role attributes, fresh schemas and absence of unrelated sessions. Close manual
   psql/pgAdmin target connections before the suite.
6. Invoke the suite ONCE. This approval must explicitly include candidate DDL,
   function ownership/column grants, synthetic fixtures, default-ACL/pointer-fault
   injection, concurrency and ownership handback/DOWN/UP. No old suite is rerun.

```text
host nutrasa_it_5ca7bad4722340279d938775731cd4ee nutrasa_it_5ca7bad4722340279d938775731cd4ee_migrator 127.0.0.1/32 scram-sha-256
host nutrasa_it_5ca7bad4722340279d938775731cd4ee nutrasa_it_5ca7bad4722340279d938775731cd4ee_runtime 127.0.0.1/32 scram-sha-256
host nutrasa_it_5ca7bad4722340279d938775731cd4ee nutrasa_it_5ca7bad4722340279d938775731cd4ee_writer 127.0.0.1/32 scram-sha-256
```

Executor has no HBA/password/login. The existing administrator rule remains.
This document and an environment confirmation are not owner authorization.

## Environment and invocation after approval

From backend/, only after separately approved provisioning/preflight PASS:

```powershell
npm.cmd run test:integration:governance-writer
if ($LASTEXITCODE -ne 0) { throw 'STOP: preserve partial state; no retry or cleanup.' }
```

Supply credentials through masked local prompts into process-only environment;
never paste password-bearing URLs into commands/source/chat or read .env:

- NUTRASA_IT_DATABASE_URL: target _migrator.
- NUTRASA_IT_READER_URL: same target _runtime.
- NUTRASA_IT_WRITER_URL: same target _writer; separate credential from reader.
- NUTRASA_IT_ADMIN_URL: nutrasa_it_admin on THIS target, not postgres.
- NUTRASA_IT_CONFIRM_DATABASE and NUTRASA_IT_GOVERNANCE_CONFIRM: exact DB name.
- All URLs explicit 127.0.0.1:5433, password required, no query/options/fragment.
- PGOPTIONS/PGREPLICATION/PGHOSTADDR/PGSERVICE/PGSERVICEFILE absent/empty;
  PGPORT absent/empty or 5433. Caller removes only its process variables in finally.

Normal npm test does not discover this opt-in integration file. Production CLI
allowlist is unchanged. The prior target-pinned reader installer remains a
historical eight-migration setup and refuses the nine-file discovery; do not run
it on its retained target or relax its guard for the new writer.

## Closed definition and separate installation

0009 creates one VOLATILE SECURITY DEFINER function with fixed pg_catalog,pg_temp
path and exact signature. PUBLIC EXECUTE is revoked in the creation transaction;
inherited nonowner ACL aborts definition/history/checksum. No role, ownership
transfer or operational EXECUTE grant appears in the migration.

The body requires exact session_user DB_writer AND current_user DB_executor, so
initial migrator-owned definition rejects invocation. The prepared admin installer
transfers only that function to NOLOGIN executor, then grants manifest-derived
SELECT, event INSERT, assignment INSERT/UPDATE(last_event_id), schema USAGE and
exact writer EXECUTE. No table/schema ownership, permanent CREATE or membership.
Identity insertion succeeded in this tested PostgreSQL 18.6 path without adding
sequence privileges; this does not authorize broader sequence access.

Before DOWN close callers and hand ownership back. DOWN drops only the function,
preserving authority rows and immutable baseline. UP recreates a closed definition.
Domain/admin/activation phases are not globally atomic. Failure requires a report
of the last committed stage and effective ACL; do not assume activation is closed
at every intermediate failure, and never recover automatically.

## Lock ordering

Governance uses pg_advisory_xact_lock(1314214994,1), the two-integer lock namespace.
The migration engine's existing bigint lock stays unchanged and separate. Runtime
writers acquire only the governance lock, then read authority/state and append
metadata. Approved maintenance affecting authority must use the same governance
lock and READ COMMITTED post-wait revalidation. If a future maintenance operation
needs both locks, acquire migration lock first, governance second; never invert.
The current installer runs outside runtime transactions with callers closed.
Account-lifecycle paths must join this protocol before concurrent activation;
they are not silently implemented or certified by this writer batch.

## Tested scope and evidence limits

- Fresh guard; bootstrap/actual 0001-0008, 0009 DDL failure rollback, inherited
  default EXECUTE rejection, closed UP and exact owner/path/PUBLIC ACL.
- Synthetic bootstrap fixture rejects absent approval, self-approval/self-recording
  and missing recorder before atomic two admin events/pointers. This models an
  already verified external receipt; it does NOT authenticate real humans or prove
  actual owner approval. There is no production bootstrap API/function.
- Four allowed editorial pairs; administrative/unknown/scope/self/unauthorized
  denial; inactive actor/recipient behavior; duplicate GRANT/REVOKE; revoked rights
  remain revoked after reactivation.
- Stale/missing/expected-pointer mismatch; pointer CHECK fault after event INSERT
  rolls back both. No production test hook/trigger is introduced.
- Two real clients wait on observable pg_locks barriers; one expected-pointer
  winner and lock release. Authority revoked while a caller waits must be reread
  after acquisition. Bounded polling observes locks, not timing guesses.
- Direct audit/projection DML, DDL/TEMP/sequence/metadata and SET ROLE denial;
  caller search_path override against the fixed-path qualified function; actual test-owned max-one Pool, mocked Firebase request identity, failed-query
  discard and successful backend reuse; ownership handback and protected DOWN/UP.

Trusted service credentials can assert another UID by design. SQL proves database
caller/policy, not human identity. Private request provenance tests reject client
actor injection; real SDK/account behavior remains a separate live Firebase gate.
The writer adapter sanitizes failures; endpoint mapping for duplicate/stale state
is future API work. No production route/Pool or real assignment is activated.

Real bootstrap follows the [approved manual contract](../../../docs/02-architecture/authorization-registry-reader-security.md#11-authority-contract-closure-proposal):
two legitimate people, independent owner approval and private evidence. reason/
request_id correlate evidence but do not establish it. No synthetic fixture may
satisfy real bootstrap prerequisites; real approval verification remains manual.

Expected negative tests restore only deliberately injected fixture constraints,
default ACL or projection after checking rejection. Unexpected failure STOPs with
partial state retained. No reset/reuse/role/database cleanup. Final success leaves
synthetic authority audit, nine baselines and a closed unactivated function; all
older targets stay untouched. Crash-at-commit, network failures, production
installation, live Firebase, publication and wider lifecycle remain OPEN.
