# NUTRASA — Endpoint & Physical Schema Review v1.5

**Status:** Engineering review draft; NOT signed off. No application code or executable migrations created.

## Scope
- Base: OpenAPI v1.4 + Database Schema/API Contract v1.2.
- Retains **36 paths** and **50 operations**.
- Introduces named response models for catalog pages, custom foods, recipes, saved meals, favorites, weights, completion state, catalog change feed, and sync pull.
- Adds actual HTTP 409 response to mutable operations for a **true idempotency payload mismatch** (not ordinary LWW stale revision).
- Health endpoints no longer erroneously require Firebase Bearer.
- Aligns error-code property with the shared `ErrorCode` component.

## Validation performed
- YAML parsed via PyYAML.
- Internal `$ref` pointers resolved; operation IDs unique.
- Contract still needs full OpenAPI semantic validator, example-based tests and source-to-implementation mapping.

## Explicit non-final matters
1. Several endpoints have response shapes that **still need real DTO examples and test fixtures** (especially copy operations, delete receipts, pagination query parameters).
2. Verify all request DTO fields and enum maps against domain spec before client generation.
3. Sync push needs per-entity discriminated unions, per-device sequences, retention policy and safe full re-sync flow.
4. Physical `source_kind` references require typed foreign keys/triggers, not generic UUID assumptions.
5. Concurrent transaction ordering for sync feed cursor requires a protocol; identity sequence alone does not guarantee commit order.
6. Required mutation headers for all mutation routes need audit; mutation idempotency shared across sync and REST.
7. Account deletion and auth token handling need cross-service failure injection tests.
8. Nutrition Engine clinical parameters and food-source rights remain external release blockers.

**Guidance:** treat as v1.5 incremental improvement, **not finished engineering sign-off**. Do not start auto-generating clients solely from this file.
