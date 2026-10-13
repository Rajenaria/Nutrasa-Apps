# NUTRASA — Contract Closure Review v1.3

**Status:** review increment, **NOT sign-off**. No backend app code or SQL migration included. This iteration improves machine-readable types and records remaining blockers without falsely claiming 10/10 gap closure.

## Change log against v1.2 OpenAPI

- Added strict `CustomFoodWrite`, `RecipeWrite`, `RecipeIngredientInput`, `SavedMealWrite`, `SourceReference`, `NutritionDayPoint`, `ProgressNutritionResponse`, `NutrientDayValue`, `SyncReceipt`, `DeletionProgress` schemas.
- Replaced three generic POST payloads (custom foods, recipes, saved meals) with typed inputs.
- Added mandatory `Idempotency-Key: UUID` parameter to state-changing endpoints in the OpenAPI draft. **Still requires semantic alignment** with sync push receipts and scope/retention.
- Typed the nutrition progress GET response with journal status, history goal, coverage and timezone. Protein/carb/fat and energy are represented here; the remaining seven nutrient series must be added before contract approval.
- Updated OpenAPI version to `1.3.0-review` and documented caveat against code generation.
- Added physical PostgreSQL constraint and index review (no executable migration).

## Gap disposition (prior review items 1–10)

| Gap | Status | Required closure |
|---|---|---|
| 1 generic DTO | PARTIAL | Typed PATCH for recipes/custom foods, saved-meal detail/list, all analytics and sync feed envelopes |
| 2 domain enums | OPEN | Derive from latest business rules, decide canonical enum values and migration constraints |
| 3 REST/sync idempotency | PARTIAL | Standard operation envelope, payload canonicalization, replay window and duplicated operation behavior |
| 4 status code/error matrix | OPEN | Per-endpoint 201/202/204/409/410/422 and safe standardized errors |
| 5 typed ownership/sources | PARTIAL | Final DB FK strategy and source kind mapping; server validates ownership |
| 6 onboarding/consent | OPEN | State machine and explicit notice/consent model reflecting 18+ and optional email verification |
| 7 progress/weights series | PARTIAL | All 11 nutrient series, weight series, consistency counts, timezone edge cases |
| 8 sync result/recovery | PARTIAL | Wire `SyncReceipt` to push/pull, cursor invalidation and full-resync preservation of outbox |
| 9 deletion lifecycle | PARTIAL | Exact Firebase/Postgres retry state machine, retention, credential revocation |
| 10 local endpoint URL | OPEN | Android emulator, iOS simulator, device LAN, HTTPS remote rules documented in environment guide |

## Product rules confirmed (no reopening decisions)

01 email optional; 02 automatic targets only; 03 newest valid weight, no retroactive target changes; 04 eligible adults 18+ only; 05 curated/licensed catalog; 06 nullable supplementary nutrients and completeness per nutrient; 07 **server-applied-order LWW** with idempotency and tombstones, not globally provable physical action order; 08 strict logout, isolation, resumable deletion; 09 immutable snapshots, independent copies; 10 NO_LOGS != zero, target history and optional completion mark.

## Sign-off gate

- Run OpenAPI structural validation and semantic contract test against actual Fastify implementation **later**; YAML parse is not full validation.
- Resolve remaining OPEN/PARTIAL items, finalize external validation of nutrition rules and food licenses before release.
- Verify native SQLCipher development builds on Android and iOS, including key loss/reinstall and logout flows.
- Do not instruct Codex to build full REST API from this review draft without module-specific DTO approval.
