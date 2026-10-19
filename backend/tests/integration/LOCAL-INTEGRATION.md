# Local integration runner: existing-target recovery

The current approval profile is only
`nutrasa_it_419e5962579e4d22a83a8ff1ecea417f`, on PostgreSQL 18.6,
127.0.0.1:5433, cluster `nutrasa_it_pg18`, system identifier
7697229180258678980, data directory
`D:/Rajendra/NUTRASA-Postgres-IT/data`.

The owner reported administrator fresh preflight, migrator and runtime login PASS,
and writer authentication failure 28P01. Integration 0011 was NOT invoked on this
target. The exact cause of the writer credential mismatch is unproven. The earlier
0011 target `cc04120d7d674370ad4e6a0e03afd9de` failed fixture preparation and remains
retained. Neither target may be replaced, reset, reprovisioned or cleaned here.

## Diagnose and one approved writer recovery

Close target psql/pgAdmin sessions first. In an interactive local PowerShell, from
the repository root:

```powershell
& .\backend\tests\integration\run-local-integration.ps1 -Phase Diagnose -RecoverWriter
```

This requires the owner's explicit password-reset approval. Without `-RecoverWriter`,
Diagnose performs administrator read-only preflight only. The script rejects
different targets and inherited credential/connection overrides before prompting.

1. Enter the administrator password at a masked prompt. Node reuses existing
   administrator identity and exact HBA guards and checks all four roles, password
   validity dates, memberships/SET ROLE paths, ownership, PUBLIC/default/effective
   ACL, fresh schemas and absence of other sessions. No password verifier is read.
2. The native psql session repeats cluster/freshness checks before one `\password`
   operation on the exact writer role, with SCRAM-SHA-256. Enter the new writer
   password twice at its native prompts. LOGIN, privileges and other roles are not
   changed. The reset is not retried if any guard or psql command fails.
3. Repeat that new writer password once at the masked runner prompt. This captured
   credential supplies exactly one native psql read-only login check. Only if it
   passes does the same captured credential supply one Node read-only login check.
4. STOP after either failure, or after both checks pass. Diagnose never executes
   migrations or the integration suite. Report safe stage statuses and exit codes,
   not credentials or native error detail.

psql uses an explicit loopback host/hostaddr, port, database and user. Its credential
is passed through temporary process/child environment, never command arguments or
SQL literals. New passwords are entered using native `\password`, not interpolated
ALTER ROLE statements. Node exceptions and native login stderr are not forwarded.
Process variables are removed in `finally`; this does not promise secure erasure
of immutable strings or protection from a privileged local process inspecting
memory/environment. Run only on the approved trusted Windows workstation. Do not
enable PowerShell tracing or capture credential prompts in diagnostic logs.

## Setup and Run are separate

Setup is intentionally refused for this existing-target profile. The existing
[provision.sql](provision.sql) remains the single provisioning implementation;
there is no alternate database/role installer in this runner. A future fresh-target
setup requires a separately reviewed profile and owner approval.

Run is a distinct, future-approved invocation, never a continuation of Diagnose.
It collects matching credentials, repeats fresh-target/identity checks, and delegates
to the existing `test:integration:catalog-lineage` package script and
[harness](harness.ts). It does not create another migration engine or install
editorial grants. Do not invoke Run under the limited authentication-recovery
approval. A failed or previously used target must not be reused for Run.

The current recovery approval does not authorize HBA changes/reload, provisioning,
migrations, integration execution, cleanup, new roles, editorial grants or port 5432.
Existing objects and previous targets remain untouched. M03-01 stays PARTIAL / ACTIVE.
Offline parser/encoding/order tests are not proof of PostgreSQL authentication or
integration success; record actual local recovery output before marking it ready.
