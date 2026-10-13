# NUTRASA — API Error & Idempotency Policy (Review Draft)

## Common response approach
- Prefer 200 for successful retrieval/update and 201 for created resources, 204 for successful delete with no content. Do not emit an empty JSON envelope for 204.
- Public liveness `GET /api/v1/health/live` returns HTTP 200 with exactly `{"status":"ok"}`. This minimal probe is an exception to the domain success envelope (`data`/`meta`); no server details are exposed. Readiness remains planned and currently returns HTTP 404 `NOT_FOUND`.
- 400 `INVALID_REQUEST` for malformed input (including invalid/empty JSON and malformed URL encoding); 400 `VALIDATION_FAILED` for Fastify JSON Schema validation. `VALIDATION_ERROR` is a legacy name, not a wire code.
- 413 `INVALID_REQUEST` for bodies exceeding the server limit and 415 `INVALID_REQUEST` for unsupported body media types: preserve the HTTP status, rather than converting to 400 or 500. OpenAPI declares reusable responses for operations with request bodies.
- 401 missing/invalid Firebase token, 403 unauthorized/unsupported account state, 404 `NOT_FOUND` (avoid IDOR), 409 idempotency-key collision with different payload, HTTP 410 `CURSOR_EXPIRED` requiring safe bootstrap without clearing outbox, 422 domain/serving failure, 429 throttling, 500 `SERVER_ERROR` for unexpected failures. Exact ENTITY_DELETED HTTP mapping remains subject to contract validation.
- LWW normal updates are **not** rejected solely for stale revision. Deleted entities are protected by tombstones: a delayed update cannot resurrect them.
- No raw SQL error, token, Firebase identity claims or health data in error messages/logs. Return stable error code, safe message, trace/request ID.
- Error envelope: `{"error":{"code":"...","message":"..."},"request_id":"..."}`. `error.details` is an optional object containing only safe information. The M02-01 handler omits it and does not forward internal messages or stack traces; request IDs are server-generated strings, not required UUIDs.

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

**Review status:** M02-01 implements the foundation for 400/404/413/415/500 and liveness only. Domain/auth errors and idempotency are NOT implemented. Retention window, full OpenAPI semantic/integration review, and mappings for `NOT_ELIGIBLE`, `ACCOUNT_DELETING`, `NUTRITION_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE` (absent from the OpenAPI enum) remain open.
