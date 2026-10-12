# NUTRASA — Food Logging Feature Specification

**Version:** 0.9 | **Date:** 13 October 2026  
**Repository path:** `docs/03-features/food-logging-spec.md`  
**Status:** Developer planning draft — agreed functional scope, proposed detailed behaviors. NOT production approval.

> **Scope:** the user-facing workflow from discovering Indonesian food to adding, editing, deleting, copying, favoriting and tracking foods/recipes across selected dates, including offline-tolerant operation. This is a functional contract, not an instruction to start coding or an approved clinical nutrition model.

## 0. Source of truth & decision status

### 0.1 Agreed product requirements
- React Native + Expo; Indonesian-first food discovery and food diary.
- Curated internal catalog of 100 reviewed foods at launch, growing toward 500, plus evaluated external sources as permitted.
- Eleven nutrients: energy, protein, carbs, total fat, fiber, total sugar, saturated fat, trans fat, cholesterol, sodium, potassium.
- Core public-food data reviewed: energy, protein, carbohydrate, total fat. Unknown extras are allowed and **must not be turned into zero**.
- User-facing search, food category browsing, food detail, variable quantity and food-specific units including grams, milliliters and verified household portions.
- Food log with breakfast, lunch, dinner, snacks, editable history, custom foods, custom recipes, favorite foods, recently used foods and copy meal.
- Date-based diary, dashboard and progress; offline-tolerant local writes with subsequent sync.
- Personalized targets come from the Nutrition Engine; unsupported profiles may use log-only mode.

### 0.2 Implementation proposals — pending owner approval
- Search-first food picker, with browse categories as an alternative.
- Four meal types (`BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`) and multiple snacks per date.
- Food picker remembers the origin meal/date and never silently changes it.
- Copying a meal duplicates its **items into a new meal/date** without rewriting original entries.
- Recipe logging uses a versioned recipe and captured nutrient snapshot; custom foods and recipes are private to their owner by default.
- Recent foods are derived from actual logs; favorites are explicit user actions.
- Local-first writes with queued operations, idempotency keys and explicit sync status.
- Adding an item with unknown optional nutrients is allowed; public catalog entries missing *all* core nutrients are not published by default.

### 0.3 External review required
- **Nutrition:** food-specific serving conversions; macro/energy consistency; recipe yield/retention; displayed nutrient precision and data completeness notices.
- **Legal:** food data licensing, rights to store/cache/provider data, privacy and consent, user-data export/deletion.
- **Technical/security:** local persistence protection, backend authorization, conflict handling, schema/data migrations, date/time-zone policy and sync guarantees.

## 1. Goals and explicit non-goals

**Goals:** A user can log a familiar Indonesian dish with the least reasonable interaction; correct the entry; see daily nutrients update immediately; revisit or copy prior meals; retain logs while offline; and understand nutrient uncertainty.

**Non-goals for first implementation:** photo AI logging, automatic estimation from pictures, barcode scanning, sharing private recipes publicly, unreviewed crowdsourced publication, background-sync guarantees, clinical interpretation of meals, automatic exercise calorie deductions.

## 2. Navigation, screens and entry points

| Screen / surface | Purpose | Entry | Exit / action |
|---|---|---|---|
| Home > journal card | Selected day and meal summary | Main tab | Tap add on specific meal → Food Picker |
| Food tab / Food Picker | Search, recent, favorites, categories | Tab or journal add | Select Food Detail; return preserves context |
| Food Detail / Portion Editor | See provenance, nutrients, units and quantity | Search / category / recent | Add to selected meal/date |
| Day Diary | Review all logged items for selected day | Home/calendar | Edit, delete, copy, change meal |
| Custom Food Editor | Enter owned food and core nutrients | Food Picker no result / add | Save to private catalog, optionally log |
| Recipe List + Builder | Compose reusable dish from ingredients | Food tab | Save recipe revision, log portions |
| Favorites & Recent | Fast re-logging | Food tab | Choose amount and meal |
| Copy Meal | Choose source and destination day/meal | Diary item/group | Preview, confirm, create copies |
| Sync Status | Pending/failed operations and recovery | Diary/header/settings | Retry/resolution |

**Navigation contract:** provide `selectedLocalDate` (`YYYY-MM-DD`), `mealType`, and origin; don't rely on a stale globally mutable meal context. A tab-driven Food Picker must ask which meal to log into if no context exists. The AI tab remains a future feature and is not a food logging dependency.

## 3. Core logging sequence

1. User selects date and meal, or opens Food tab and chooses destination.
2. User searches by dish/alias or browses a category; show loading, empty, error and offline states.
3. User selects a food identity and an available food/recipe revision.
4. Display its base basis (e.g., per 100 g) and portion units **only where conversions are documented**.
5. User chooses unit and numeric quantity; app derives effective grams/ml when convertible.
6. App previews energy and nutrient totals plus data completeness/sources; unknown remains unknown.
7. User taps Add once; app creates stable client ID and saves locally in a transaction; UI updates immediately from local authoritative data.
8. App syncs when permitted; result becomes `SYNCED` after server acknowledgment, or `PENDING/FAILED` with recovery controls.
9. Return to diary or picker as appropriate; verify destination date/meal, not today's date by default.

**Time-to-log objective (proposal):** returning users should be able to re-log a recent food without navigating categories. Set measurable targets after usability tests, not arbitrary claims.

## 4. Meal and date rules

- Exactly four user-visible meal buckets initially. Multiple items per bucket; snacks not limited to one occurrence.
- Every log item stores `journal_local_date` and `journal_timezone` (IANA zone) as explicit journal attribution, plus `created_at_utc` and `updated_at_utc`.
- Selected journal date controls all meal entries and summaries; editing a past day must not move items to today.
- The **journal date is a civil calendar date**, not recomputed from UTC on every read; time-zone travel must not silently shift existing diary records.
- Day with no entries → `NO_DATA`, not assumed zero intake; a day with entries can remain `PARTIAL` unless user explicitly marks complete (if day completion is approved).
- DST/date-boundary/time-zone migrations require tests; no implied morning/noon timestamps used to derive diary day.
- Food logs count as consumed intake; calorie target is a separate goal. Do not subtract exercise calories unless a separate approved feature does so.

## 5. Nutrient calculations and display

### 5.1 Calculation contract
For a nutrient `n` with a known base quantity:

`logged_n = base_n × (effective_quantity / base_quantity)`

- Keep `base_quantity`, basis unit, measurement source and conversion revision with the item.
- For a food whose supported basis is 100 g, 125 g yields a 1.25 multiplier. For a liquid based on 100 ml, do not treat ml as grams without a validated density.
- Use numeric precision adequate for intermediate calculations and round only for display. Reject `NaN`, infinity, negative quantity, zero quantity and overflow.
- Use the source's declared energy rather than silently overwriting it with the 4/4/9 macro formula; discrepancies are review signals, not reasons to mutate historic snapshots.

### 5.2 Unknown values and daily aggregation
- Known `0` means measured/reported zero; `null` means missing. Both must persist distinctly.
- For a nutrient, sum known contributions and carry `is_complete=false` if *any* included item has unknown value for that nutrient.
- A daily total showing `600 mg sodium (partial)` means **at least 600 mg from known entries**, not necessarily the full amount consumed.
- Distinguish `NO_LOG`, `KNOWN_ZERO` and `PARTIAL_DATA` in APIs/UI; do not show a green “target achieved” indicator on incomplete data.
- Core published foods must have reviewed calories/protein/carbs/fat; private custom foods may be saved as drafts when not complete, but must not contribute fictitious zeros on logging.
- For user-added entries, require core numeric values or an explicit log-only/unknown path approved later. MVP proposed rule: cannot log a private food until all four core fields are present and validated.

### 5.3 Progress indicators
- Calorie & macro consumed values should refresh from the same diary aggregate, not from duplicated component state.
- `remaining = goal - consumed` only when goal is active. In log-only mode show consumed values without target divisions (no `0/0` bars).
- Nutrients with maxima (such as sodium) use a **limit indicator**, not a “fill to 100%” success convention.
- Cross-day progress respects the goal version active on the relevant diary date; changes to today's goal do not rewrite past goal snapshots.

## 6. Portion selection and validation

| Scenario | Behavior |
|---|---|
| Supported 100 g basis, user enters 150 g | Multiply by 1.5 |
| 1 piece mapped to 75 g for this food revision | Use the documented 75 g conversion |
| 0.5 serving with an approved conversion | Accept and scale proportionally |
| 1 ladle without conversion for this food | Do not estimate; offer grams/other verified unit |
| `ml` selected for a mass-only food | Do not convert without food-specific density |
| `0`, negative, text, infinite or absurd precision | Reject with localized inline error |
| Unusually large but finite portion | Ask for confirmation or configurable review; threshold TBD |
| Unit availability changes with revision | Old logs retain old conversion snapshot; new entries use new revision |

**Precision proposal:** support decimal quantities and localized comma/dot input normalization; store normalized numeric values. Exact max quantity and display decimal places are pending UX/nutrition review.

## 7. Search, category and absent-food states

- Search Indonesian names, aliases, spelling variants and common preparation terms; offer category browsing without forcing category-first navigation.
- Result shows differentiators: name, preparation, unit, curated/private badge (if approved) and source/completeness indicator; don't show invented kcal before a valid match.
- Empty query → recent, favorite and category shortcuts; no results → `Buat Makanan Sendiri` plus suggested alternative queries.
- Offline → use permitted cached/internal catalog; clearly indicate an external-provider result may require connectivity. **Do not cache or copy a third-party response unless its terms permit it**.
- Duplicate display names require source/preparation distinctions; prevent users accidentally logging raw vs cooked foods.
- Private foods are visible only to the owner in their own account-scoped results.

## 8. Custom foods

**Fields:** name, type/preparation, base amount and unit, energy/protein/carbs/fat, optional other seven nutrients, optional notes/source, serving definitions (if known).

**States:** `DRAFT`, `ACTIVE`, `ARCHIVED` (proposed). Drafts can be incomplete; only active eligible foods can be logged under the initial rule.

**Rules:**
- Users may edit their own foods; edits create revisioned nutrition data or otherwise preserve immutable log snapshots.
- Private custom foods never become public by default. Future submission needs separate consent and moderation.
- Deleting a custom food must not delete existing historical diary entries; archive or soft-delete with clear UX.
- No cross-account reading, mutation, cache or search leakage.
- Show whether each value is manually entered/estimated; **do not claim verified** solely because fields are filled.

## 9. Recipe builder

1. Enter recipe name and optionally category, notes and number of servings.
2. Add one or more ingredients from permitted catalog/private foods with known quantities.
3. Show calculated known totals and nutrient completeness; do not silently substitute unknown ingredient values.
4. Require **final cooked yield weight** for weight-based per-100 g nutrition, or verified per-serving yield definition. If missing, keep as draft and do not publish calculated per-100 g values.
5. Apply reviewed processing, edible portion, yield and retention factors only when available; otherwise mark estimates and explicitly disclose assumptions.
6. Save private recipe revision with ingredient IDs/versions, inputs, calculation-method version and resulting nutrient snapshot.
7. Logging 1 serving or grams produces an immutable diary snapshot. Later changes to recipe do not alter prior diary entries.
8. Editing a recipe creates a new revision; warn if previously favorited/saved meal links should point to latest for **future** logs.

**Pending nutrition review:** handling oil absorption, cooked yield, evaporated water, salt contribution, ingredient state, and defaults for missing yield factors. No universal cooked-weight ratio is assumed.

## 10. Favorites, recents and copy meal

**Favorites:** user explicitly marks/unmarks a food or recipe; unique per user+food identity. A favorite's next log uses the current approved revision, with portion preview before adding.

**Recents:** derived from most recent successful local diary entries (including pending sync); deduplicated by food identity for presentation, while all log items remain intact. Do not turn a recent list into an additional source of truth.

**Copy meal:**
- User chooses source date/meal, destination date/meal (may be same meal type on another day) and previews item count, quantities and estimated nutrients.
- Confirm copy; generate new log-item IDs and independent operation IDs; source remains unchanged.
- Preserve user-selected portion quantities. Proposed: copy stored nutrient snapshots to retain what was originally logged; if re-evaluating against current food revision is desired, that must be a separate explicit UX action.
- For duplicates, the app warns if very similar items already exist in destination and allows user confirmation; never silently merge food entries.
- Execute as a transactional logical operation with partial-failure recovery; failures must not create half a meal without clear status.

## 11. Edit, move and delete

- Edit quantity/unit, food, destination meal or journal date with preview; new nutrient snapshot is captured at edit time as appropriate.
- Delete with reversible undo affordance where practical; use a deletion tombstone for offline synchronization, not immediate disappearance from the sync ledger.
- Repeated edits before sync should collapse safely into final intent while retaining idempotent operation history.
- Editing a copy never affects the source; changing a favorite does not mutate existing entries.
- If there is a server rejection or cross-device conflict, show what was accepted and a user recovery path; never discard the only surviving local change silently.

## 12. Offline-tolerant design and synchronization

### 12.1 Ownership and storage
- Local database provides diary read model and mutation queue; backend is the durable multi-device record once sync succeeds.
- Partition data by authenticated account; account switch must clear/hide or securely partition prior private caches and pending operations.
- Store authentication credentials in secure facilities; avoid storing tokens in the general diary SQLite tables.
- App update and migration must preserve pending operations, diary items and snapshots; migrations tested against older local databases.

### 12.2 Operation model (proposal)
- Each create/edit/delete/copy uses `operation_id`, `client_entity_id`, `account_id`, `device_id` (privacy-reviewed), entity version/base revision, timestamp, payload and status.
- Operation statuses: `QUEUED`, `SENDING`, `ACKNOWLEDGED`, `RETRYABLE_ERROR`, `CONFLICT`, `PERMANENT_ERROR`.
- Retry with exponential backoff and jitter when appropriate; no assumption of always-on background execution.
- Server enforces account authorization, validates nutrition snapshots/provenance as relevant, and deduplicates `operation_id`.
- Tombstones avoid resurrecting an offline-deleted item after fetching remote state.
- Last-write-wins should **not** be applied indiscriminately to conflicting diary edits. Proposed policy: detect divergent versions and present actionable resolution / preserve both versions in recoverable history. Exact policy requires technical approval.
- Offline custom food/recipe creation must sync before or atomically alongside logs referencing it, using dependency ordering.
- No external provider data is cached offline unless license authorizes it.

### 12.3 Visible states

| State | UX copy/feedback |
|---|---|
| Saved locally | “Tersimpan di perangkat — menunggu sinkronisasi” |
| Syncing | “Menyinkronkan…” |
| Synced | No intrusive notice; status accessible |
| Retryable error | “Belum tersinkron. Coba lagi” |
| Conflict | “Ada perubahan dari perangkat lain. Tinjau” |
| Permanent error | “Perubahan perlu diperbaiki sebelum disimpan ke akun” |

## 13. View state / accessibility matrix

| View state | Required behavior |
|---|---|
| Initial loading | Skeleton/spinner with meaningful accessible description |
| No foods yet | Useful empty state, category suggestions or custom food |
| No logs on selected date | “Belum ada catatan”; no fabricated zero-consumption claim |
| Missing optional nutrient | `Data belum tersedia` and partial indicator |
| Network lost | Offline badge and cached results; add still writes locally |
| Catalog not cached | Explain why search needs internet; retry when online |
| Invalid portion | Keep input visible, inline validation, disable Add |
| Save in progress | Prevent duplicate taps, provide visible feedback |
| Save failed locally | Do **not** claim success; preserve form for retry |
| Sync failed remotely | Retain local record and explicit pending state |
| Unauthorized | Re-authenticate; don't expose another account's data |
| Unsupported nutrition-goal profile | Log-only diary; no fake calorie target |
| Screen reader / large text | Semantically labeled portions/buttons; no information conveyed by color alone |

## 14. Data contracts (conceptual, not database SQL)

```ts
// Pseudotypes: finalize with schema and API design after product approval.
type NutrientKey =
  | 'energy_kcal' | 'protein_g' | 'carbohydrate_g' | 'fat_total_g'
  | 'fiber_g' | 'sugar_total_g' | 'fat_saturated_g' | 'fat_trans_g'
  | 'cholesterol_mg' | 'sodium_mg' | 'potassium_mg';

type NutrientVector = Record<NutrientKey, number | null>;
type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
type LogSyncStatus = 'QUEUED' | 'SENDING' | 'ACKNOWLEDGED' |
  'RETRYABLE_ERROR' | 'CONFLICT' | 'PERMANENT_ERROR';

type FoodLogItem = {
  clientId: string;
  accountId: string;
  journalLocalDate: string; // YYYY-MM-DD
  journalTimeZone: string;  // e.g., Asia/Jakarta
  mealType: MealType;
  foodId: string;
  foodRevisionId: string;
  quantity: number;
  unitId: string;
  effectiveBaseQuantity: number;
  snapshot: NutrientVector;
  completeness: Partial<Record<NutrientKey, boolean>>;
  sourceDescriptor: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  syncStatus: LogSyncStatus;
};
```

**Contract caveats:** serving conversion must be revision-bound; recipe identity can replace food identity where needed; aggregated state and server IDs are specified at schema phase. These pseudotypes deliberately avoid false implementation precision.

## 15. QA test matrix (minimum cases)

| ID | Scenario | Expected |
|---|---|---|
| FL-01 | Add 100 g known food | Exact base snapshot, correct meal/date |
| FL-02 | Add 150 g from 100 g basis | Scale by 1.5, round display only |
| FL-03 | Add 0.5 verified portion | Correct verified conversion |
| FL-04 | Select unsupported “centong” | Offer grams; no invented conversion |
| FL-05 | Enter zero/negative/NaN quantity | Reject with message |
| FL-06 | Search typo/alias Indonesian dish | Consistent match/ranking |
| FL-07 | No results offline | Explain cache limitation; custom food available |
| FL-08 | Add item with unknown sodium | Sodium partial, not 0 |
| FL-09 | Log-only account | Show consumed without numeric target |
| FL-10 | Add on yesterday | Yesterday only updated |
| FL-11 | Edit logged portion | Preview and day total update |
| FL-12 | Move to another meal/day | Remove from source and add to destination atomically |
| FL-13 | Delete while offline | Local removal plus sync tombstone |
| FL-14 | Repeated tap/retry create | Single item persisted |
| FL-15 | Copy full meal | New IDs, source unchanged, no silent merging |
| FL-16 | Copy to already-populated meal | Confirmation; no accidental duplicates |
| FL-17 | Favorite/unfavorite | Correct user-specific behavior |
| FL-18 | Recent after offline log | Appears once in recents, correct chronology |
| FL-19 | Save incomplete private food draft | Allowed as draft, logging restricted under proposed MVP rule |
| FL-20 | Edit private food after logging | Old log nutrient snapshot unchanged |
| FL-21 | Recipe cooked yield missing | Keep draft, block false per-100 g output |
| FL-22 | Recipe ingredient optional nutrient null | Recipe/day optional nutrient marked partial |
| FL-23 | Create custom recipe offline and log | Dependency-ordered synchronization |
| FL-24 | Sync interrupted on send | Retry idempotently |
| FL-25 | Remote and local edit diverge | Detect conflict, retain recoverable versions |
| FL-26 | Switch account with pending operations | No cross-account data leakage |
| FL-27 | Change device timezone | Existing journalLocalDate unchanged |
| FL-28 | Catalog revision changes | Previously logged snapshot unchanged |
| FL-29 | Day has no logs | NO_DATA rather than 0 intake |
| FL-30 | Partial day and chart aggregation | Partial/coverage status propagated |
| FL-31 | App restart with pending logs | Restore local items and queue |
| FL-32 | Local storage write fails | Form retained; no false “saved” toast |
| FL-33 | Corrupted serving conversion | Reject log until valid unit available |
| FL-34 | Provider data offline/cache restriction | Do not persist disallowed response |
| FL-35 | High font scaling + screen reader | All controls operable and correctly labeled |
| FL-36 | Sync accepted, UI restarts | No duplicate and status restored |

## 16. Acceptance criteria / Definition of Done

- Users can search/browse and log any of the initial curated foods using valid units, correct selected diary date/meal and reversible edits/deletes.
- Custom foods, recipes, recents, favorites and copy meal each have tested basic and exceptional flows.
- Every saved log has a stable identity and immutable nutrient snapshot; historical records don't silently change after catalog revisions.
- `null` nutrient propagation, partial labels and log-only dashboard all work correctly.
- Offline create/edit/delete/copy and dependent custom-recipe logs survive restart and reconcile without duplicates.
- Server access checks and local account isolation prevent cross-user data exposure.
- No misleading successful-save indicator is shown after failed local writes.
- Accessibility, Indonesian localization, date/time-zone behavior, and critical tests pass.
- Nutrition, legal and technical release gates are signed off separately. **A passed automated test does not equal clinical validation or data-rights approval.**

## 17. Implementation order — after approval (Codex task slicing)

1. Approve flow decisions and fields; reconcile contracts with Food Database Spec v0.8 and Nutrition Engine.
2. Finalize domain models, sync behavior, database schema and API contracts.
3. Implement local diary repository and pure nutrient scaling/aggregation with tests.
4. Implement Food Picker + Food Detail + Portion Editor using a small approved seed subset.
5. Implement basic diary add/edit/delete and dashboard derived totals.
6. Implement private custom foods and versioned recipe builder.
7. Implement recents, favorites and copy meal.
8. Implement mutation queue, synchronization, idempotency and conflict recovery.
9. Validate performance on lower-end Android, offline transitions, accessibility, and security.
10. Expand the reviewed catalog from pilot to 100 and finalize launch gates.

## 18. Decisions required before marking spec final

| Decision | Suggested default | Why it matters |
|---|---|---|
| FL-D01: Meal categories | Breakfast/lunch/dinner/snack; unlimited entries | UI and schema |
| FL-D02: Food tab destination | Ask for meal/date if not launched from Home | Prevents wrong logging |
| FL-D03: Required custom-food fields | Energy and three macros for loggable entry; incomplete drafts allowed | Avoid bogus totals |
| FL-D04: Recipe yield | Require known cooked weight or verified portion yield before logging | Prevents fabricated values |
| FL-D05: Copy-meal semantics | Duplicate logged quantities and snapshots, never auto-merge | Historical integrity |
| FL-D06: Source visibility | Show source, method and partial-data labels on Food Detail | Trust and transparency |
| FL-D07: Favorites/recents | Favorites explicit; recents generated from diary | Reduces duplicate state |
| FL-D08: Day completeness | Optional “Tandai hari selesai”, separate from presence of logs | Honest analytics |
| FL-D09: Account-private catalog | Private by default; no direct public contribution | Privacy/moderation |
| FL-D10: Offline failure/conflicts | Persist queue, retry, make conflicts visible | Data integrity |
| FL-D11: Catalog admin | Start with validated CSV import/review pipeline rather than full admin UI | Scope control |
| FL-D12: Third-party integrations | Defer live third-party food search until licensing verified | Compliance |

**Status of FL-D01–D12:** proposals, **not silently approved**. Confirm with product owner before turning these into “MUST” implementation directives. Technical/legal/nutrition validation gates remain open.

## 19. Dependencies and consistency check

- `docs/02-architecture/food-database-spec.md`: nutrient keys, provenance, servings, food revisions and catalog rights. If mismatched, update both docs together through decision log.
- `docs/02-architecture/nutrition-engine-spec.md`: targets and log-only. Logging totals must not recalculate nutritional targets independently.
- `docs/01-design/onboarding-spec.md`: authentication, supported profile status and goals.
- Future `docs/03-features/dashboard-spec.md`: diary display, partial coverage, selected date and calorie/macro progress.
- Future `docs/02-architecture/offline-sync-spec.md`: authoritative conflict/idempotency/security design.
- Future `docs/02-architecture/database-schema.md` and `api-contract.md`: persistence and transport contracts.

**Change control:** Product decisions belong in the decision log. Do not let generated code or visual mockups override explicit business rules.
