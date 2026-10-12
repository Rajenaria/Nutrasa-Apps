# NUTRASA — Food Database Specification

**Version:** 0.8 (developer-ready design draft)  
**Date:** 13 October 2026  
**Target repository path:** `docs/02-architecture/food-database-spec.md`  
**Status:** PRODUCT AGREEMENTS + IMPLEMENTATION PROPOSALS; NOT APPROVED FOR DATA IMPORT OR PRODUCTION

> **Purpose:** Define an Indonesian-first nutrition food catalog from 100 quality-controlled food entries, scalable to 500 and beyond; make food search, portions, food logs, recipes, offline caching, and progress calculations reliable. This is a product/data specification, not a populated database. No nutrition values are invented.

## 0. Decision register: agreed vs proposed

### Already agreed (from product discussions)
- Primary focus: Indonesian foods and regional Indonesian preparations.
- Internal controlled food catalog plus evaluation of external sources/APIs.
- Initial release target: **100 reviewed foods**, then expand toward **500**.
- Minimum reviewed nutrition: calories, protein, carbohydrate, total fat. Additional seven nutrients may be unknown.
- Track 11 fields: energy, protein, carbohydrate, total fat, fiber, total sugar, saturated fat, trans fat, cholesterol, sodium, potassium.
- Permit incomplete nutrient records to be logged; visibly identify partial coverage. Never equate unknown with zero.
- Allow manual portion quantity and food-specific units (g, ml, piece, spoon, ladle, serving where supported).
- Support custom foods, user-defined recipes, favorites, recent foods, and copying meals.
- Offline-tolerant food logging with subsequent synchronization.
- Nutrition logs feed date-based dashboard, progress, and history.

### Architectural proposals awaiting explicit approval
- Ingredient/food/recipe distinctions, versioned nutrient snapshots and provenance at nutrient-field level.
- Public curated foods versus account-private custom foods and recipes.
- Admin import/review/publish flow and moderation policy.
- User-facing source and incomplete-data labels.
- Search ranking, category taxonomy, and initial 100-food category quotas.
- Offline catalog packaging, sync conflict rules, and deletion behavior.

### External review required
- **LEGAL/LICENSING:** redistribution, derived records, retention and use of TKPI, Panganku, third-party API data and food images; attribution requirements.
- **NUTRITION/QUALITY:** nutrient definition compatibility, recipe/yield/retention calculations, release thresholds, portion measurements and outlier thresholds.
- **TECHNICAL/SECURITY:** backend choice, local database encryption/storage policy, authorization, account isolation, conflict handling, sync protocol.

## 1. Goals, exclusions, measurable success

**Goals**
1. A user can find recognizable Indonesian meals quickly using name, nickname, spelling variations, ingredient/category and dish name.
2. A food's nutrients are traceable to a permitted source or documented calculation.
3. A user can choose portions without silently converting unknown household measures into grams.
4. Daily totals distinguish known values from missing coverage.
5. Offline log edits preserve data and sync idempotently.
6. Historic logs remain stable when catalog entries or custom recipes change.

**Not in initial data-release scope**: AI image identification; barcode-driven crowdsourced food ingestion; public user submissions without moderation; guaranteed coverage of all local variants; medical-grade nutrition recommendations; claiming every dish has all 11 values.

**Proposed acceptance measures (nonclinical)**: all 100 published foods satisfy the release gate; zero unsourced published core-nutrient entries; all aliases map consistently; tested gram/piece/serving conversions; offline create/edit/delete tests pass; no user-private foods leak across accounts; coverage display distinguishes unknown versus zero. Search relevance latency benchmarks determined after choosing backend/device targets.

## 2. Source strategy and restrictions

| Source | Intended use | Gate before ingest |
|---|---|---|
| TKPI — Indonesia Ministry of Health, 2020 revised publication | Primary reference for locally relevant ingredient and food composition | Confirm full fields, food identity, unit definitions, revision/code, permissible reuse/redistribution and attribution |
| Panganku / alternative Indonesian datasets | Supplemental discovery and gap analysis | Verify operator, source lineage, completeness, licensing and API/export permission; do **not** assume third-party mirrors confer rights |
| FAO/INFOODS guidance | Methodology for recipes, yield, edible portions, data types and imputation | Apply appropriate factors and label estimates, review by competent expert |
| FatSecret Platform API | Optional live search/lookup extension under applicable agreement | Assess plan/region, attribution, per-field storable rules, caching/retention, privacy and API availability |
| Product packaging / producer label | Branded products | Capture label revision, serving/100g conversion, dated evidence and permission to reproduce any artwork |
| NUTRASA documented standard recipes | Indonesian composite dishes missing direct references | Ingredient traceability; cooked yield, edible weights, added oil and uncertainties reviewed before publication |

**Critical separation**: internal catalog rows may only use data NUTRASA is permitted to persist and distribute. External API results remain a separate origin class subject to provider-specific storage/display/deletion and offline restrictions. No bulk-copying FatSecret responses into the internal database unless separately licensed. FatSecret's documented storable identifiers do not establish unlimited rights to store nutrient content.

**Source selection rules (proposed):** choose food match quality and legally usable evidence before convenience; keep competing values in review staging rather than silently averaging; never mix raw and cooked states; do not transfer nutrition from a vaguely similar dish without explicit estimation metadata.

## 3. Catalog domain model

### 3.1 Entity overview

- **Food**: stable logical food identity (e.g. *Ayam bakar kecap*), name, region, state, preparation, owner/scope, status.
- **FoodRevision**: immutable published version of a food's composition, base quantity and provenance. Changes make a new revision.
- **NutrientValue**: nutrient code, number/null, unit, measurement/calculation/estimate method, source detail and review state (one may embed a compact nutrient object in revision if persistence scheme favors it).
- **FoodSource**: bibliography/provider, source food code, link/reference, date accessed, edition, terms/permission record.
- **Category** and **FoodCategory**: many-to-many taxonomy; primary classification plus discoverable tags.
- **FoodAlias**: synonyms, regional names, spelling variations, normalized searchable form.
- **ServingDefinition**: per-food household unit and grams/ml conversion, measurement method, confidence, revision association.
- **Recipe** / **RecipeIngredient** / **RecipeRevision**: ingredient quantities, edible fraction where applicable, cooked final yield, calculation assumptions; account-private or curated.
- **FoodLog** / **FoodLogItem**: local and server IDs, account, meal type, journal local date and time zone, chosen food revision/recipe revision, amount, immutable nutrition snapshot, sync metadata.
- **FavoriteFood**, **RecentFood**, **SavedMeal**: user-specific convenience records; favorites reference food identity, while saved/copy meals generate new log IDs and snapshots.
- **CatalogImportBatch** / **CatalogReview**: reviewer, import source, validation failures, approval and publication audit.

### 3.2 Scope and status

| Dimension | Allowed conceptual values |
|---|---|
| Ownership | `CURATED_PUBLIC`, `USER_PRIVATE`, `THIRD_PARTY_LIVE` |
| Food type | `INGREDIENT_RAW`, `INGREDIENT_COOKED`, `COMPOSITE_DISH`, `PACKAGED`, `BEVERAGE`, `SUPPLEMENT` |
| Publish status | `DRAFT`, `IN_REVIEW`, `APPROVED`, `PUBLISHED`, `ARCHIVED` |
| Source method | `DIRECT_REFERENCE`, `RECIPE_CALCULATED`, `LABEL_REPORTED`, `ESTIMATED` |
| Completeness | `CORE_COMPLETE_EXTRA_PARTIAL`, `ALL_AVAILABLE`, `CORE_INCOMPLETE` (core-incomplete cannot be public published by default) |

Never allow account-private foods to be returned via public search API, external account, or improperly partitioned offline cache.

## 4. Nutrient contract

### 4.1 Standard nutrient keys and units

| Key | UI label | Unit | Core |
|---|---|---|---|
| `energy_kcal` | Kalori | kcal | Yes |
| `protein_g` | Protein | g | Yes |
| `carbohydrate_g` | Karbohidrat | g | Yes |
| `fat_g` | Lemak total | g | Yes |
| `fiber_g` | Serat | g | No |
| `total_sugar_g` | Gula total | g | No |
| `saturated_fat_g` | Lemak jenuh | g | No |
| `trans_fat_g` | Lemak trans | g | No |
| `cholesterol_mg` | Kolesterol | mg | No |
| `sodium_mg` | Natrium | mg | No |
| `potassium_mg` | Kalium | mg | No |

**Definitions matter**: carbohydrate by difference vs available carbohydrate must not be conflated; total sugar is not added/free sugar; sodium is not salt; kcal derived by macros may differ from reference energy because of nutrient definitions, fiber, conversion factors and rounding. For each imported source, document mapping and conversions, not just field names.

### 4.2 Null/zero semantics and calculation

- Store **null** if nutrient is not reported/usable; `0` only when supported as a true zero.
- A reported '< detection threshold' is *not* silently converted to zero; preserve qualifier/method if schema supports it.
- For amount in grams where reference is per 100 g, `amount_nutrient = reference_nutrient * edible_grams / 100` (same principle for compatible 100 ml values).
- When a nutrient value is null for any logged item, show **sum of known values with partial-coverage warning**, not a falsely complete total. Distinguish food count coverage from mass/energy coverage; avoid claiming false precision.
- Do not use the 4/4/9 check to overwrite a trusted source's reported energy. Flag large inconsistencies for manual review and consider carbohydrate definition and fiber first.
- Precision: store decimal values with adequate precision; display rounding at UI boundary. Avoid cumulative rounding between servings, recipes and daily totals.
- Nonnegative numeric nutrients are expected; outliers and logical consistency (`saturated_fat <= total_fat`, etc.) go to review, with exceptions/rounding handled explicitly.

### 4.3 Coverage examples

- Food A: energy 180 kcal, protein 7 g, potassium null → can publish if core complete; UI shows potassium unavailable.
- Day contains A and B, B potassium 250 mg → known potassium sum 250 mg **(partial)**, not a complete daily intake of 250 mg.
- Day contains zero food logs → `NO_LOGS`, not evidence of a zero-intake day.
- Day log has foods, user marks day complete → `COMPLETE_LOG` separately from `NUTRIENT_DATA_COMPLETE`.

## 5. Food taxonomy and retrieval

### 5.1 Proposed browse categories (review with Indonesian users)

1. Nasi, beras dan olahannya
2. Ayam dan unggas
3. Daging sapi, kambing, jeroan
4. Ikan dan makanan laut
5. Telur
6. Tahu, tempe, kacang dan olahannya
7. Sayur dan masakan sayur
8. Buah-buahan
9. Soto, sup, dan hidangan berkuah
10. Mie, bihun, dan olahannya
11. Kue, jajanan pasar dan camilan
12. Minuman
13. Produk kemasan
14. Suplemen nutrisi (not categorized as vitamins by default)

**Design rule:** many-to-many categorization; e.g. `opor ayam` belongs to `ayam` and `hidangan berkuah`; regional cuisine is a tag/metadata. Search first, categories as alternative; alias normalization supports Bahasa Indonesia, common misspellings, synonyms. Avoid silently merging `ayam goreng tepung` and `ayam goreng lengkuas`.

### 5.2 Search sequence

1. Exact food name / alias and normalized query.
2. Prefix and spelling-tolerant matching.
3. Relevant categories, dish preparation, region, favorite/recent indicators.
4. Show core data completeness and serving options before confirmation.
5. If no result: propose custom food or request a catalog addition; no fabricated nutrition estimate.

Never rank an unreliable food above an appropriately reviewed match solely because of a more attractive photo.

## 6. Portions, household measures and recipes

### 6.1 Portion definitions

Store *food-specific* conversions. Example: for a particular food entry `1 potong = X g edible portion`, measured and sourced. Do not define one global `centong = 100 g`, or globally equate volume and mass. Measurements distinguish edible flesh vs bone/shell, sauce included or excluded, and raw vs cooked.

- Direct manual weight: numeric grams; for liquids volume ml only when a supported basis or density conversion exists.
- User can input fraction/decimals of verified servings; disallow zero/negative additions.
- A serving label must specify exact interpretation and source.
- When conversion absent, offer supported gram/ml measure instead of guessing.
- For packaged food, preserve label's serving size and reference base.

### 6.2 User recipes and batch yield

1. User selects ingredients and quantities (with source revisions).
2. System calculates total known nutrients across edible quantities.
3. User specifies prepared/cooked batch weight when relevant; if no reliable final weight, restrict gram-based cooked portions and communicate limitation.
4. Apply documented oil absorption, weight-yield and nutrient-retention method only where justified; never assume loss of weight equals nutrient loss.
5. Save recipe revision with calculation provenance, unknown nutrient propagation, and editable servings.
6. Log a meal using a snapshot of recipe nutrients and revision. Editing the recipe creates a new revision; existing logs remain unchanged unless user explicitly replaces them.

**Important:** recipes assembled from already-cooked components are different from recipes calculated from raw ingredients. Do not apply cooking yield twice. FAO/INFOODS methodology should inform the rules and expert review.

## 7. Logging, dashboard, dates and historical accuracy

- `meal_type`: breakfast, lunch, dinner, snack (custom meal types postponed).
- Each log belongs to a stable journal calendar date in the chosen time zone. Store both a local-date representation and source timestamp/zone metadata so travel does not unexpectedly move past meals.
- Serving selection generates an immutable per-entry macro/nutrient snapshot with values *and missingness flags*, source revision and amount.
- `edit quantity` recalculates based on the originally selected revision unless user explicitly chooses a new current revision.
- `copy meal` generates new entries, not references to mutable older journal entries. Keep source provenance.
- Changes to catalogs, sources, goals, or recipes do not retroactively recalculate historical consumption without an explicit migration and user-facing explanation.
- Daily dashboard and charts aggregate locally available log snapshots, with transparent provisional sync and incomplete-nutrient labels.

## 8. Offline-tolerant strategy

**Suggested scope:** include the published 100-food internal catalog in a versioned offline package/cache; public catalog updates are fetched when online. User-private food/recipe ownership and saved logs are scoped per authenticated account.

- Locally assign immutable UUIDs for log operations and entries; queue create/update/delete and sync idempotently.
- `LOCAL_SAVED`, `SYNC_PENDING`, `SYNCING`, `SYNCED`, `SYNC_FAILED`, `CONFLICT` are meaningful *persistence* states; separate loading/error/empty states.
- A failed request does not remove local data; retry with backoff. Never equate network connectivity to successful server commit.
- Offline deletes use tombstones/operations; do not resurrect deleted entries after a sync.
- Cross-device conflicts: need agreed precedence/version checks; do not silently discard a second device's change. No provisional simple 'last-write-wins' without business approval.
- Prevent mixing offline drafts and caches between accounts; choose secure storage/encryption controls after threat-model review.
- Third-party live data must not be included in the offline bundle unless contract expressly allows it.

## 9. Editorial governance and 100-food launch plan

### 9.1 Publication workflow

`SOURCE REVIEW → STAGING IMPORT → NORMALIZE → VALIDATE → NUTRITION REVIEW → APPROVE → PUBLISH REVISION → DISTRIBUTE CATALOG VERSION`

**CSV/import schema must be documented** and reject unexpected columns/units, duplicate IDs, ambiguous raw/cooked entries, missing core nutrients, missing provenance, invalid units, and unsupported serving conversions. An approved batch is immutable or tracked by revision. Use deterministic migration and rollback capability.

### 9.2 Candidate first-100 distribution (proposed, not finalized names)

| Category group | Proposed count |
|---|---:|
| Staple foods and rice-based meals | 15 |
| Chicken and poultry preparations | 12 |
| Meat and offal dishes | 9 |
| Fish and seafood | 10 |
| Eggs, tofu, tempe, beans | 14 |
| Vegetables and soups | 14 |
| Fruit | 8 |
| Snacks, traditional cakes, beverages | 18 |
| **Total** | **100** |

Use regional breadth and actual search demand to refine quotas. The list should include commonly eaten multi-ingredient dishes, not merely raw ingredients. Add 400 in staged, measured batches rather than importing unverified data to meet a count.

### 9.3 Review gates

- Identity, language, aliases, category and prepared state precise.
- Legitimate and documented source/permission to store/distribute.
- Base unit and edible portion interpretation explicit.
- Calories, protein, carbohydrates and fat reviewed and non-null.
- Yield/retention assumptions documented for calculated recipes.
- Serving conversions tested and source annotated.
- Implausible energy/macro mismatches investigated, not blindly corrected.
- Additional 7 nutrients may be null and correctly labeled.
- Reviewer, timestamp, revision and traceable approval present.

## 10. Permissions and data ownership

- Public catalog read-only to regular users; editorial write operations limited to authorized reviewers with audit logs.
- Custom foods, recipes, favorites, saved meals and diary entries: account-scoped access in the backend and local store.
- Treat reporting wrong nutrition as a moderation request, never a direct public edit.
- No permanent retention of provider-restricted API payloads unless authorized.
- Sensitive user diet/body data: minimize collection; define deletion, exports, retention and backup restoration according to verified legal/policy requirements.

## 11. State & exception matrix

| ID | Trigger | Expected behavior |
|---|---|---|
| FD-01 | Food not found | Explain no results; offer custom food / request-food |
| FD-02 | Nutrient missing | Show unavailable, not zero; daily sum partial |
| FD-03 | No conversion for household unit | Ask grams/ml; do not guess |
| FD-04 | Food shown twice via categories | Single identity across categories; no duplicate catalog record |
| FD-05 | Same name, different recipe | Distinguish preparation/revision/source |
| FD-06 | Zero, negative, NaN amount | Block save and explain |
| FD-07 | Rounding on fractional serving | Calculate precise value, round presentation only |
| FD-08 | Recipe cooked yield missing | Block unsupported gram-based cooked inference; seek user input |
| FD-09 | Reference energy differs from 4/4/9 | Flag review, do not overwrite automatically |
| FD-10 | Catalog updated after log | Historic snapshot remains unchanged |
| FD-11 | Offline add then edit then delete | Final synced state correct, no ghost entry |
| FD-12 | Sync retry/duplicate request | Exactly one logical operation effect |
| FD-13 | Cross-device concurrent edits | Conflict policy invoked; no silent overwrite |
| FD-14 | Logout with pending ops | Warn; secure account-isolated local data |
| FD-15 | Provider API unavailable | Local catalog remains usable; optional provider section shows unavailable |
| FD-16 | Provider license/cache expires | Purge restricted stored content per terms |
| FD-17 | Empty day | Display no log, not reported 0 intake |
| FD-18 | Two foods, one missing potassium | Known subtotal explicitly marked partial |
| FD-19 | Archived food in favorite | Explain archived and offer replacement; old logs remain |
| FD-20 | Imported data includes unverified macro | Quarantine entry; prevent publishing |
| FD-21 | User deletes custom food referenced in log | Protect historic snapshot; hide from new selections |
| FD-22 | Time zone changes or past-date logging | Preserve selected journal local date |
| FD-23 | Unauthorized access to private food | Reject at API/DB level, not only frontend |
| FD-24 | Source with unclear redistribution rights | Block ingestion/publication pending license check |

## 12. QA & acceptance criteria

**Calculation tests:** 100 g, 25 g, 175 g, half verified serving, fractional servings, ml basis, unknown field propagation, recipe ingredient summation, cooked yield, source energy mismatch.

**Data tests:** schema validation, type/unit conversion, category mapping, alias search, collision handling, revision durability, provenance, invalid imports, zero-vs-null semantics.

**Integration tests:** add/edit/delete/recent/favorite/copy meal; updates to dashboard, history and selected-day totals; offline queue; multi-account cache isolation; save and log custom foods; permissions.

**Release criterion:** no unreviewed food published; no silent unknown-to-zero conversions; user log history survives catalog changes; no known cross-account leaks; all critical offline test cases green; license review completed; nutrition review sign-off on reference sources and calculated recipes.

## 13. Implementation sequencing for Codex (no coding yet)

1. Approve this data contract and licensing decision register.
2. Build a **20-food pilot dataset** in a review spreadsheet with source proof, varied food types and both complete/partial nutrients.
3. Review pilot conversions and recipe calculations with a qualified nutrition reviewer.
4. Create database schema and migration rules based on actual pilot field requirements.
5. Create import validator, staging and publication commands.
6. Implement a minimal read-only internal catalog API + local caching.
7. Implement search, categories, food detail and serving conversion end-to-end.
8. Implement food logging snapshots and daily aggregate calculation.
9. Add custom food, user recipes, recent, favorites and copy meal.
10. Add offline mutations, sync conflict handling and account isolation.
11. Expand reviewed dataset to 100 and perform launch acceptance suite.
12. Expand toward 500 in release batches driven by data demand and coverage.

## 14. Open decision register (requires user approval)

| Code | Decision | Default recommendation | Review |
|---|---|---|---|
| FD-D01 | How to structure source public data | Internal licensed/verified catalog, API as optional live layer | Legal |
| FD-D02 | Whether food entries should show source/method | Show expandable source + completeness | Product |
| FD-D03 | Whether to allow user food publication | Private only in MVP; submissions via moderation | Security/product |
| FD-D04 | Whether gram entry mandatory for each food | Yes for solids; ml only where sourced | Nutrition |
| FD-D05 | Recipe with unknown final cooked mass | Require final mass to calculate reliable cooked gram portions | Nutrition/UX |
| FD-D06 | How to resolve multi-device edit conflicts | Explicit version checking and recoverable conflicts | Technical/product |
| FD-D07 | What constitutes enough coverage at launch | 100 reviewed entries, 4 core nutrients, field provenance | Nutrition |
| FD-D08 | Food categories and 100-food quotas | Use draft taxonomy, validate with Indonesian search tests | Product |
| FD-D09 | External branded food/API visibility in MVP | Defer until licensing + API evaluation complete | Legal/technical |
| FD-D10 | Whether to build admin GUI | Start CSV + validation CLI and approval record; GUI later | Product/operations |

## 15. References (verify license independently)

1. Kemenkes RI, **Tabel Komposisi Pangan Indonesia**, revised printing (2020): https://repository.kemkes.go.id/book/668
2. FAO, *Calculation of the composition of dishes prepared from recipes*: https://www.fao.org/4/y4705e/y4705e23.htm
3. FAO/INFOODS, *Recipes*: https://www.fao.org/infoods/infoods/recipes/en/
4. FAO, *Food Composition Data*, classification and limits of calculated values: https://www.fao.org/4/y4705e/y4705e06.htm
5. FatSecret Platform, *Storable Data*: https://platform.fatsecret.com/docs/guides/storable-data
6. FatSecret Platform, *Terms of Use*: https://platform.fatsecret.com/terms
7. FatSecret Platform, *REST/API guides*: https://platform.fatsecret.com/docs/guides

**Change control:** This specification should not be labeled production-approved until the open decision register is closed and required legal, nutrition and technical reviews have documented outcomes. Version any changed formulas, source mapping and serving rules; synchronize `business-rules.md`, `nutrition-engine-spec.md`, `onboarding-spec.md` and feature specs as applicable.
