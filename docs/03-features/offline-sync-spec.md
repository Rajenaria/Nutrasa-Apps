# NUTRASA — Offline Sync Specification

**Version:** v1.4 (draft implementation-ready, conditional approval)  
**Status:** Product decisions incorporated; technical/security/legal gates still open  
**Platform:** React Native + Expo + TypeScript  
**Proposed repository path:** `docs/02-architecture/offline-sync-spec.md`  
**Related specs:** `auth-spec.md`, `onboarding-spec.md`, `food-database-spec.md`, `food-logging-spec.md`, `dashboard-spec.md`, `progress-spec.md`, `profile-spec.md`, `nutrition-engine-spec.md`.

> **Document rule:** `AGREED` means previously approved product behavior. `PROPOSED` is a design recommendation that must not be mistaken for final approval. `GATE` blocks production until verification. Examples below are interface contracts, not vendor-specific production code.

## 1. Objectives and non-objectives

### 1.1 Objectives
- `[AGREED]` NUTRASA operates **offline-tolerant**: a signed-in user with previously available local data can keep reading cached food data and recording food without connectivity.
- `[AGREED]` Local food-log updates immediately affect dashboard and progress; changes sync when network and authorization allow.
- `[AGREED]` Do not lose locally committed records, silently duplicate retry requests, leak data across accounts, or rewrite historic nutrition snapshots.
- `[PROPOSED]` Extend the same mechanism to weight entries, favorites, user-created foods/recipes, and certain profile fields in carefully staged releases.
- `[PROPOSED]` Explain what is stored **on this device** versus **backed up to the account**.

### 1.2 Non-objectives for MVP
- Not full offline-first, real-time collaboration, peer-to-peer sync, multi-master CRDT, guaranteed OS background syncing, or unlimited offline catalog downloads.
- New sign-in, sign-up, email verification, account recovery, account deletion, and server-only privileged operations require connectivity.
- No promise that data not yet synced will survive uninstall, factory reset, device loss, or a device-side storage failure.

## 2. Core data ownership and synchronization policy

| Domain | Offline read | Offline write | Authority / conflict rule | MVP recommendation |
|---|---|---|---|---|
| Public food catalog | Bundled/cached revision | No public editing | Server-published immutable versions | Yes |
| Food logs | Yes | Add/edit/delete | Per-record revision check + conflict resolution | Yes |
| Nutrition snapshots in logs | Yes | Created during add/edit | Immutable log snapshot of selected food, portion, nutrient values | Yes |
| Weight measurements | Yes | Add/edit/delete | Record revision; newest measurement ≠ overwrite older history | Yes |
| Recent foods | Derived locally | Derived locally | Recompute; not critical server data | Yes |
| Favorites | Cached | Toggle | Last known server version + revision handling | Proposed MVP |
| Custom foods | Cached | Create/edit locally | User-owned objects, revisions, dependencies tracked | Proposed MVP |
| Custom recipes | Cached | Create/edit locally | Ingredient snapshots + recipe version / resolved dependencies | Proposed MVP |
| Goal history | Cached | **No direct offline activation** | Server-validated/versioned canonical targets | Yes (read) |
| Weight-triggered target recalculation | Cached | Local **preview only** | Recalculate automatically, validate on server before activation | Yes (preview) |
| Profile demographics / activity | Cached | Local draft only until validated | Server validates and publishes revision | Proposed |
| Onboarding draft | Yes, scoped locally | Yes | Local until completion, then authorized one-time submit | Agreed |
| Auth tokens / account security | Secure local secrets only | Provider-managed | Auth provider/server | Yes |
| Account deletion | No offline execution | Request only when online | Server-managed with deletion lock | Yes |

**Important product reconciliation:** We agreed that target recalculation happens automatically after weight changes. *Automatic calculation* is separate from *automatic activation*. In MVP, a valid result may activate automatically after authenticated server validation (without another user confirmation), while an invalid/unsupported/review-needed result must **never** activate automatically. Offline, show target preview pending verification, and retain last verified active target. This is a **PROPOSED resolution** of the two requirements and should be approved before coding.

## 3. System architecture

```text
User action → Feature service → Local DB transaction → UI selectors
                                  │
                                  └─ Atomic mutation + Outbox operation
                                        │
                            Sync orchestrator (app foreground / reconnect)
                                        │
                            Auth/session check + HTTP transport
                                        │
                            Server authorization + idempotency + revisions
                                        │
                            Ack / server delta → local reconciliation
                                        │
                                 UI sync state update
```

- `[PROPOSED]` Use SQLite locally through `expo-sqlite` for relational records and durable outbox. Choose encryption strategy separately based on threat model and build constraints.
- Store tokens/keys using OS-backed secure facilities; **not** plaintext AsyncStorage, source code, or an unprotected SQLite table.
- Canonical personal records live server-side after successful sync, subject to authorization per immutable `user_id`.
- Client caches are not the authority for permission, account ownership, or safety-critical target approval.
- UI subscribes to local durable state rather than requiring successful network calls to render a just-added meal.
- Background tasks may provide best-effort opportunities only; foreground/open/reconnect sync is the MVP reliability baseline.

## 4. Local storage logical entities

| Entity | Required properties / purpose |
|---|---|
| `local_accounts` | `user_id`, last-verified identity marker, storage namespace, access state |
| `food_cache` | `food_id`, `catalog_revision`, provenance, nutrient fields, units; null means unknown |
| `meal_logs` | `id`, `user_id`, `meal_type`, `journal_local_date`, `timezone_id`, `nutrient_snapshot`, `portion_snapshot`, `revision`, `sync_status`, `deleted_at` |
| `weight_entries` | `id`, `user_id`, `measured_at`, `weight_kg`, `revision`, tombstone |
| `custom_foods` / `recipes` | Local stable IDs, `owner_id`, versions, dependencies, nutrient provenance |
| `goal_versions` | Immutable period/version, effective date, calculation config version, approval status |
| `sync_outbox` | `operation_id`, `user_id`, `entity`, `entity_id`, action, payload, base_revision, created_at, attempts, last_error, state |
| `sync_checkpoint` | Server cursor and last successful sync per account/data domain |
| `sync_conflicts` | Local proposal, server revision, resolution state, non-sensitive audit metadata |

Data model is conceptual; exact SQL definitions belong in `database-schema.md`. Store local drafts atomically with outbox entries. Add database migrations and migration tests.

### 4.1 Stable IDs and deletion
- Generate a stable globally unique `entity_id` on device for offline-created records, plus a separate `operation_id` per queued action.
- For update/delete, send `base_revision` (optimistic concurrency) and an idempotency key.
- Deletion becomes a **tombstone** until server acknowledgment; do not delete the outbox operation before ack.
- Replays must return the same logical outcome for the same operation key, even after timeouts.
- Keep deleted IDs/metadata long enough to prevent resurrection from stale devices; retention policy TBD.

### 4.2 Food log snapshot and data precision
- Store the exact food reference/version, entered amount/unit, conversion to grams/ml, meal/date/timezone, numeric nutrient snapshot and nutrient-coverage metadata.
- Unknown nutrient = `null`, not zero. Offline totals expose known-value sum **and** partial-data warnings.
- Preserve historic snapshots even after a food, portion conversion, or recipe definition changes.
- Avoid floats for equality checks; define canonical decimal precision and rounding rules in schema/business rules.

## 5. Sync operation state machine

| State | Meaning | UI treatment |
|---|---|---|
| `LOCAL_SAVED` | Durable local transaction committed | "Tersimpan di perangkat" |
| `QUEUED` | Awaiting sync | "Menunggu sinkronisasi" |
| `SYNCING` | Request in flight | "Menyinkronkan…" |
| `SYNCED` | Ack and canonical data reconciled | "Tersinkron" |
| `RETRYABLE_ERROR` | Timeout, connection or transient 5xx | Retry automatically; show optional detail |
| `AUTH_REQUIRED` | Session not authorized; no upload | Ask user to sign in/reverify |
| `CONFLICT` | Revision conflict / incompatible edits | Show review/restore resolution path |
| `BLOCKED` | Validation, unsupported data, version mismatch, or permanent error | User must correct or contact support |

`LOCAL_SAVED` must mean a committed on-device write, never only an optimistic in-memory update. "Synced" is displayed **only after server acknowledgment**.

### 5.1 Minimum sequencing algorithm
1. Verify user/session identity and local storage namespace match.
2. Load due outbox operations; order causally (e.g., custom recipe creation before log referring to it).
3. Mark operation in-flight without deleting payload.
4. Send authenticated, idempotent request with base revision.
5. On success, atomically reconcile server state, revision and sync cursor; mark/remove acknowledged operation.
6. On transient failure, reschedule using exponential backoff with jitter and bounded retries per foreground session.
7. On conflict, stop dependent operations, preserve local intent, fetch canonical server version, then resolve by entity rules.
8. Download deltas after uploads and reconcile without replacing unsynced local state.
9. Update aggregates and UI based on reconciled local records.

Never assume a timed-out request failed server-side. Replay with **the same operation ID**.

## 6. Conflicts: explicit rules

| Situation | Policy proposal |
|---|---|
| Same log edited on two devices | Reject stale revision; preserve both versions for review; do not silently choose last-write-wins |
| Offline edit of log later deleted on server | Tombstone wins by default; offer safe recovery as a *new record* with user consent |
| Two independent new logs | Both retained; deduplicate only repeated operation IDs, not same food/quantity |
| Copy meal retried | One copy batch per idempotent command, all child logs created once |
| Favorite toggled on two devices | Server revision arbitration; latest accepted explicit toggle wins (proposal) |
| Weight entered twice same day | Preserve two measurements; display rule for chart chosen in progress spec |
| Weight changes generate competing goal recalculations | Use server's latest valid weight event and monotonic goal version; stale calculation cannot activate |
| Local recipe changed while server has newer recipe | Require version merge/review for ingredient changes; don't rewrite existing food-log snapshots |
| Food catalog version changed | Refresh cache separately; do not change previous log snapshots |
| Sync cursor expired | Controlled re-bootstrap per domain; preserve local outbox and tombstones |

**Conflict UX:** Show "Perubahan di perangkat ini belum tersinkron" with retry/review actions, including side-by-side value where user choice is needed. The system must not discard local work merely to clear an error badge.

## 7. Authentication, verification and account isolation

- `[AGREED]` Authentication precedes onboarding; onboarding progress is locally saved and submitted only after completion, subject to server rules.
- `[AGREED]` An unverified email account can continue onboarding with certain server actions restricted. **Which exact server writes are restricted remains an open auth decision**; sync respects server policy rather than inventing bypasses.
- On app resume offline with previously verified session: allow scoped local reads/writes per approved security policy, label session **not currently reverified**; forbid privileged operations.
- First sign-in on a device needs network; expired/revoked tokens do not authorize server writes.
- Namespace all local personal records/outbox by immutable `user_id`. Cache and memory selectors must reset on account switch.
- On logout with pending writes: warn user and offer cancel/retry; do not upload under another account. User can choose to abandon unsynced local data only through an explicit destructive action.
- On account deletion, server-issued deletion state blocks queued uploads and invalidates local personal caches before any future sync (prevents deleted records reappearing).
- Security review must decide whether encrypted-at-rest SQLite/SQLCipher is required. `expo-sqlite` encryption via SQLCipher involves native config/development builds and is not supported by Expo Go; validate against actual Expo SDK. Never ship plaintext sensitive health/profile records without accepted threat model.
- Review iOS/Android backup exclusions, local-key lifecycle, device sharing, app logs and analytics. Avoid logging food journals or body metrics.

## 8. Calendar and time semantics

- `journal_local_date` is the user's selected **calendar day**, independent of upload time.
- Persist `timezone_id` (IANA) and event timestamps separately; changing timezone must not silently move a historical meal to another journal date.
- User can add to yesterday while currently offline; sync must preserve selected journal day.
- Define whether future journal dates are editable in Dashboard decision register.
- Date-scoped totals should not use `created_at` as journal date.
- For goal history compare records against applicable **effective target version**, not today's latest target.

## 9. Aggregation and data quality

- Dashboard reads locally computed daily totals; every write recomputes/increments safely from canonical local entries.
- Missing nutrient fields do not become zeros; surface `PARTIAL_DATA` for any total containing unknown values.
- A day with no logs is `NO_DATA`, not a confirmed 0 kcal consumption day.
- Partial meals, incomplete day and user-confirmed completed day remain separate states.
- Following a sync conflict, UI may show a provisional local total with a clear `PENDING_SYNC/CONFLICT` badge, not claim server consistency.
- Nutrition engine automatic recalculation after weight changes generates **candidate goal version** and only activates on valid server-side approval. Unsupported cases are log-only / review; no fabricated target.

## 10. Failure, recovery and edge cases

| ID | Scenario | Expected behavior |
|---|---|---|
| OS-01 | Network disappears before local save | Commit local transaction; show device-saved state |
| OS-02 | Device/app crashes after local save before upload | Outbox reloaded after restart; no lost committed item |
| OS-03 | Server stores mutation but response times out | Retry same operation ID; no duplicate |
| OS-04 | App backgrounded during sync | Resume safely; no dependency on uninterrupted job |
| OS-05 | Network toggles on/off rapidly | Only one active sync per namespace; safe cancellation/retry |
| OS-06 | Token expires mid-sync | Pause uploads; refresh/re-auth safely; no cross-user submit |
| OS-07 | Email account still unverified | Preserve data; apply server's verification policy; no silent drop |
| OS-08 | Logout with 3 pending logs | Warning, local isolation, no upload as next account |
| OS-09 | Switch user A → B | B sees zero of A's journal/cache/outbox; B's sync independent |
| OS-10 | Same log edited on 2 devices | Conflict flagged; both proposals preserved for recovery |
| OS-11 | Delete log offline | Tombstone applied locally; server delete later; no resurrection |
| OS-12 | Offline add same meal twice intentionally | Two distinct IDs => two logs |
| OS-13 | Double tap Save / copy meal retry | One user command ID => no duplicate |
| OS-14 | Catalog revised | Existing nutrition snapshot unchanged |
| OS-15 | Missing potassium | Daily potassium partial, not 0 or falsely complete |
| OS-16 | Wrong conversion for portion | Validation blocks record and requests grams/ml |
| OS-17 | Weight edited offline | Local history updated; new goal preview only until validated |
| OS-18 | Old goal recomputation returns late | Cannot override newer goal version |
| OS-19 | DST/timezone changes | Journal date remains stable per selected date and policy |
| OS-20 | Sync cursor invalidated | Safe rehydrate while outbox retained |
| OS-21 | Database migration fails | Do not clear local user records; present recoverable error |
| OS-22 | App update with pending outbox | Compatible migration preserves pending operations |
| OS-23 | Server rejects invalid custom food | Operation blocked with actionable error; user draft retained |
| OS-24 | Recipe ingredients sync out of order | Dependency ordering prevents orphan references |
| OS-25 | Device storage full | No false success toast; show storage error and recovery guidance |
| OS-26 | Account deleted on another device | On reconnect, reject uploads and clean local personal data |
| OS-27 | Uninstall while changes unsynced | Data loss risk clearly communicated before optional destructive actions; cannot promise survival |
| OS-28 | App runs offline for many days | Cache still readable; queue persists; warn about storage/unsynced count |
| OS-29 | Pull receives old server revision | Never overwrite more recent local intent |
| OS-30 | Server returns 429 | Honor Retry-After/backoff; no infinite rapid retry |
| OS-31 | HTTP 4xx permanent validation error | Stop automatic retry, show actionable resolution |
| OS-32 | DB file or key missing/corrupt | Safe error state; no resetting silently or bypassing encryption |
| OS-33 | Offline onboarding finished | Completion stays local; remote finalization pending permitted auth |
| OS-34 | Network restored after manual goal edit | Validate against engine and account rules; conflicting goals not silently auto-activated |
| OS-35 | Concurrent sync triggers | Single-flight lock prevents duplicate workers |
| OS-36 | Expired retained tombstone on stale device | Full reconciliation prevents deleted record from returning |

## 11. Product UI states and suggested copy (Bahasa Indonesia)

| State | Copy |
|---|---|
| Online, all synced | `Semua perubahan tersinkron` |
| Saved locally | `Tersimpan di perangkat. Akan disinkronkan saat online.` |
| Pending count | `3 perubahan menunggu sinkronisasi` |
| Sync in progress | `Menyinkronkan perubahan…` |
| Temporary connection error | `Belum bisa tersambung. Catatanmu tetap tersimpan di perangkat ini.` |
| Auth required | `Masuk kembali untuk menyinkronkan catatan.` |
| Conflict | `Ada perubahan dari perangkat lain. Tinjau sebelum melanjutkan.` |
| Storage failure | `Catatan belum berhasil disimpan. Periksa ruang penyimpanan lalu coba lagi.` |
| Recalculation pending | `Target baru sedang menunggu validasi. Target sebelumnya masih digunakan.` |

Do not block the whole dashboard on a transient network spinner. Make the per-record and global sync states accessible (screen reader labels, not only colored dots).

## 12. Boundaries and suggested TypeScript contracts (illustrative)

```ts
type SyncState =
  | 'LOCAL_SAVED' | 'QUEUED' | 'SYNCING' | 'SYNCED'
  | 'RETRYABLE_ERROR' | 'AUTH_REQUIRED' | 'CONFLICT' | 'BLOCKED';

type MutationAction = 'CREATE' | 'UPDATE' | 'DELETE';

type OutboxOperation = {
  operationId: string;
  userId: string;
  entityType: 'meal_log' | 'weight_entry' | 'favorite' | 'custom_food' | 'recipe' | 'profile_draft';
  entityId: string;
  action: MutationAction;
  baseRevision: string | null;
  payload: unknown; // validated and versioned per entity schema
  createdAt: string;
  state: SyncState;
};

type SyncCommandResult =
  | { status: 'APPLIED'; entityId: string; serverRevision: string }
  | { status: 'ALREADY_APPLIED'; entityId: string; serverRevision: string }
  | { status: 'CONFLICT'; entityId: string; serverRevision: string }
  | { status: 'REJECTED'; entityId: string; reasonCode: string };
```

Backend must verify identity, ownership, schema version and entity revision. Payload type `unknown` in this **illustration** must be decoded by strict entity-specific schemas at runtime.

## 13. Acceptance criteria (release gate)

- [ ] App works with cached catalog and local food logs during airplane mode after prior authorized sign-in.
- [ ] Local mutation + durable outbox are atomic; simulated crash recovers queue intact.
- [ ] Server retries are idempotent; timeout-after-commit test creates exactly one record.
- [ ] Add/edit/delete work offline, sync later, and converge across two devices.
- [ ] User switch, logout and deletion do not leak or resurrect personal data.
- [ ] Offline dashboard and progress use local data with partial-nutrient flags.
- [ ] Target recalculation follows eligibility/safety rule and preserves previous versions.
- [ ] Schema migrations preserve queued operations and snapshots.
- [ ] State labels correctly distinguish local vs remotely backed-up records.
- [ ] Security review passes local-at-rest, token, backup, logging and key-management checks.
- [ ] Manual QA validates all OS-01 through OS-36 plus connectivity stress tests on iOS and Android.
- [ ] Privacy/legal review confirms local retention, consent, deletion and user-rights behaviors.

## 14. Decision register — MUST resolve before implementation / launch

| ID | Open item | Suggested default | Owner / gate |
|---|---|---|---|
| SD-01 | Backend and auth provider | Pick after tech-stack decision | Technical |
| SD-02 | Is encryption-at-rest required for all locally cached personal records? | Yes for sensitive personal data; determine supported build route | Security / technical |
| SD-03 | Sync coverage in first release: favorites, recipes, custom foods and profile? | Logs + weight first; recipe dependencies before enabling offline recipe saves | Product / technical |
| SD-04 | Offline activation vs server approval for goal recalculation | Local preview; server validates then auto-activates safe result | Product / nutrition / technical |
| SD-05 | Email-unverified write permissions | Server-defined operation allowlist | Product / security |
| SD-06 | Manual conflict policy for food log | Preserve both; review UI | Product |
| SD-07 | Limits of cache, outbox retention, tombstones, cursor validity | Measure storage and define operational windows | Technical |
| SD-08 | Backup exclusion and secure deletion | Test per-platform | Security / legal |
| SD-09 | Account switch with unsynced operations | Warn and isolate, with explicit discard option only | Product |
| SD-10 | Future date edit and day completion semantics | Defer to dashboard spec decision | Product |
| SD-11 | Canonical decimal precision and server timestamp model | Specify in database contract | Technical |
| SD-12 | Conflict/disaster recovery observability without exposing journal content | Redacted metrics and event codes | Technical / privacy |

## 15. Implementation tasks in recommended order

1. Decide backend/auth provider, data ownership and encryption/build strategy.
2. Define SQL schema, revisions, tombstones, operations and sync cursor.
3. Define server mutation and pull-delta APIs; write authorization and idempotency tests.
4. Build local DB migration, account namespacing and outbox transaction helper.
5. Build food log offline CRUD and reactive dashboard totals.
6. Build single-flight sync orchestrator with backoff and idempotent retry.
7. Add weight tracking, custom-food/recipe dependency sync and versioned goal preview.
8. Build conflict states, account switch, recovery and deletion flows.
9. Run airplane-mode, process-kill, double-device, migration and security tests.
10. Ship behind staged rollout/feature flags if the backend supports it.

## 16. References for validation

- Expo SQLite SDK docs: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo Network SDK docs: https://docs.expo.dev/versions/latest/sdk/network/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- OWASP MASVS Storage: https://mas.owasp.org/MASVS/05-MASVS-STORAGE/
- OWASP MASVS overview: https://mas.owasp.org/MASVS/

**Implementation status:** specification complete as planning artifact, **not approved for production** until decision register and security / legal / nutrition gates are resolved.
