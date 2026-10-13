# NUTRASA — API Error & Idempotency Policy (Review Draft)

## Common response approach
- Prefer 200 for successful retrieval/update and 201 for created resources, 204 for successful delete with no content. Do not emit an empty JSON envelope for 204.
- 400 malformed input, 401 missing/invalid Firebase token, 403 unauthorized/unsupported account state, 404 not found (avoid IDOR), 409 idempotency-key collision with different payload, HTTP 410 `CURSOR_EXPIRED` requiring safe bootstrap without clearing outbox, 422 domain/serving failure, 429 throttling, 500 unexpected. Exact ENTITY_DELETED HTTP mapping remains subject to contract validation.
- LWW normal updates are **not** rejected solely for stale revision. Deleted entities are protected by tombstones: a delayed update cannot resurrect them.
- No raw SQL error, token, Firebase identity claims or health data in error messages/logs. Return stable error code, safe message, trace/request ID.

## Deduplication rules
- Identity key: UNIQUE(owner_user_id, operation_id), where owner is the internal user mapped from verified Firebase UID. The operation UUID and canonical identity/payload stay stable across retries. REST operation Idempotency-Key and per-operation sync ID share the logical ledger when representing the same mutation; batch-envelope deduplication remains separate.
- Store canonical payload hash and original outcome in a PostgreSQL transaction together with the actual mutation.
- Exact retry returns original receipt, never a second write. A different payload with same key => explicit `409 IDEMPOTENCY_KEY_REUSED`.
- Mutations have revision/tombstone metadata and monotonic server sequence; updates from one device are sent FIFO.
- Retention must cover offline retry horizon and be documented, not silently chosen; tombstones must outlive supported stale-device sync period or force full bootstrap.

## Safety scenarios
- Server processes mutation but client times out => safe retry with same key.
- Two devices edit same log => latest *server-applied* valid mutation wins (not provable actual action time).
- Offline UPDATE arrives after DELETE => reject with `ENTITY_DELETED`; never no-op as success or recreate.
- Wrong-account operation => deny; do not leak owner or entity metadata.
- Logout with pending outbox => explicit sync or destructive confirmation; wipe per-account key and private cache.

**Review status:** Policy only, NOT implemented, retention window and full OpenAPI error wiring remain open.
