# NUTRASA — Sync Protocol Final Design v1.6

**Status:** Engineering design approved as a *proposed implementation baseline*, not yet tested. No production guarantees until concurrency tests pass. **Decision 07:** server-ordered LWW, not wall-clock "last actual action". **Decision 08:** clear private local data on logout, explicitly handle unsynced outbox.

## Invariants

1. Every private item belongs to the verified Firebase UID mapped to internal user ID. Never trust an `owner_user_id` supplied by mobile.
2. Each mutable entity has stable UUID, server revision, `deleted_at` tombstone, and state in SQLite. Client retains pending operations until acknowledged.
3. Changes to one entity have a deterministic server application order. This is **not** a claim about actual action time on offline phones.
4. Replayed operation ID + identical canonical payload returns stored receipt. Same operation ID with different payload returns an explicit idempotency error. Atomic transaction includes mutation, receipt and feed event.
5. Device sequence must be monotonically increasing. Preserve per-device order. Gaps trigger retry/request for missing operations, not silent application out of order. Do not reorder queued updates by network completion.
6. Deletion wins over a delayed UPDATE: reject UPDATE on a tombstoned entity with `ENTITY_DELETED`. Explicit resurrection/new entity is not supported in MVP.
7. Acknowledging a batch envelope does not implicitly acknowledge every item: client handles each item receipt.
8. All local data and outboxes are partitioned by user; logout clears only after successful sync or informed confirmation of loss.

## Commit-ordered cursor: preferred simple implementation

Use a **transactional per-user counter**, not `bigserial`, commit timestamps, or mobile timestamps.

- Create `user_sync_heads(owner_user_id PK FK, last_cursor bigint NOT NULL DEFAULT 0)`.
- Every transaction that publishes user-visible changes locks **that user's** sync head row (`SELECT ... FOR UPDATE`), increments the counter, writes committed change feed rows in the same transaction, and commits. The row lock is held through commit and serializes writers for a single user.
- `change_feed(owner_user_id, cursor, ... PRIMARY KEY(owner_user_id,cursor))` is visible only after transaction commit. A rollback also rolls back the head increment. A multi-entity transaction may allocate successive cursors under the same lock.
- During pull, read a stable watermark from `user_sync_heads.last_cursor` and return visible rows `(cursor > supplied_cursor AND cursor <= watermark)` ordered ascending. Return **last delivered cursor** for additional pages, or watermark when caught up. Use bounded page size.
- Scope cursor strictly to authenticated user, use opaque encoded tokens with version/user-binding and tamper protection; never expose a raw cursor as authorization.
- System or administrative edits that affect private user data must publish through this same mechanism.
- The global food catalog gets a separate commit-ordered feed/cursor (single head is acceptable at MVP volume), never mix private and catalog cursors.

**Why:** ordinary PostgreSQL sequences are assigned before commit. A later transaction can commit with larger sequence first, causing clients to skip the earlier transaction permanently. The row lock and transactional counter prevent that within a user.

## Push and pull contract (API v1.6 design)

- **Push** `/api/v1/me/sync/push`: Firebase bearer, envelope `Idempotency-Key` UUID, `device_id`, ordered `operations[]` (UUID `operation_id`, monotonically increasing `device_sequence`, entity, verb, typed payload). Limit batch to 100; operation receipts have `APPLIED | REPLAYED | REJECTED`, revision and actionable error. Enforce a consistent canonical JSON hashing specification on backend.
- **Pull** `/api/v1/me/sync/pull?cursor=...`: returns ordered upserts and tombstones, opaque `next_cursor`, `has_more`; for expired cursor return HTTP 410 `CURSOR_EXPIRED`.
- **Important limitation:** typed discriminated operation payloads and precise validation for all entity types still must be implemented in OpenAPI before **client code generation**. The `payload: object` in v1.6 is not a final runtime DTO.
- **Bootstrap/full resync:** keep the SQLite outbox; request a consistent server snapshot + watermark; rebuild *server-owned* mirror atomically in SQLite; reapply pending optimistic operations locally in original order; then retry push. Do not clear unsynced draft on a 410.
- **Cursor retention:** default design target 90 days of tombstones/changes **after** last relevant device acknowledgement, with an upper retention cap, but policy must be confirmed against privacy/deletion requirements before release. Client must always support 410/full resync; do not assume permanent feed retention.

## User experience

- Optimistic updates instantly show `Tersimpan di perangkat`; progress to `Menyinkronkan` and `Tersinkron` after receipts.
- Retry failures: nonintrusive pending status and manual `Coba lagi`; do not falsely label failed changes synced.
- Rare cross-device collision: server-ordered LWW, no conflict modal in MVP; after pull, refresh local view. This may override edits from one device: risk accepted and documented.
- Offline goal estimates are provisional; target timeline is finalized by server effective timestamps after sync. Historical food log snapshots remain immutable unless the user edits them.

## Concurrency tests that MUST pass

1. T1 allocates a user cursor, T2 writes same user concurrently; T2 blocks, T1 commits/rolls back, no missed event after pull.
2. Parallel writes by different users do not block each other.
3. Repeated operation ID/payload yields same receipt; mismatch rejected; retries across process restart safe.
4. Reversed device sequence never corrupts final state; dropped batches reprocessed.
5. Tombstoned entity resists delayed update; deleted log absent in diary.
6. Page-boundary pull while new writes arrive never drops/duplicates an event.
7. Cursor expiry followed by full resync preserves outbox and optimistic edits.
8. Logout while pending shows warning and enforces account isolation.
9. Permission tests: user B cannot pull, mutate, or infer user A's data.
10. Kill backend during transaction; partial mutation/feed/receipt never commits.

## Unresolved release gates

- Confirm concrete retention period and deletion obligations with privacy policy.
- Complete per-entity typed mutation schemas and actual Fastify/SQL integration tests.
- Verify SQLCipher and secure key lifecycle in real Android/iOS development builds.
