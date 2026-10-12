# NUTRASA — Home UI Direction & Wireframe Specification

**Version:** 1.0 (design proposal, owner review pending)  
**Platform:** React Native + Expo, portrait mobile  
**Destination:** `docs/01-design/home-ui-direction.md`  
**Status:** DESIGN DRAFT — not a coded screen, not clinical validation

## 0. Purpose and source-of-truth hierarchy

This document translates NUTRASA's Home functionality into visual layout guidance. It is **not** a replacement for business logic.

Read together with:
- `docs/01-design/design-system.md` — theme, typography, icon, ring tokens.
- `docs/01-design/navigation-spec.md` — routing and tabs.
- `docs/03-features/dashboard-spec.md` — data semantics and dashboard states.
- `docs/03-features/food-logging-spec.md` — adding/editing meals.
- `docs/02-architecture/nutrition-engine-spec.md` — target logic (candidate, not clinically approved).
- `docs/02-architecture/offline-sync-spec.md` — persistence and sync states.

**Visual reference priority:** the user-provided image featuring a large calorie-progress ring and three small macro rings. The image is a **composition reference only**: do not copy the original app's logo, copy, interface assets, or exact pixel layout. Final NUTRASA logo and Bowi mascot files in `assets/branding/` have branding precedence. Other screenshot references are inspirational rather than authoritative.

**Already agreed:** Indonesian-first calorie/nutrition tracker; Home + Makanan + Progress + Profil + AI entry planned; circular progress on Home prioritized; forest/cream brand direction; adult eligible users get estimated goals; unsupported profiles may use log-only; incomplete food data can be logged with a visible partial-data label; offline-tolerant logging.

**Do not silently finalize:** week-strip calendar, AI placeholder versus hidden tab, diary complete toggle, future-date writes, when an invalid auto-recalculation takes effect, manual goal handling, or the ultimate color/size selection. All remain review items.

## 1. Home design goals

1. Within three seconds of looking at the screen, the user can recognize **selected date**, **recorded calories**, **target when available**, and **how to add food**.
2. Calories + the 3 macro rings are the focal point, with generous cream whitespace and soft rounded cards.
3. The screen handles **no data, partial nutrients, log-only, exceeded target, offline pending**, and **historic dates** without misleading numeric visuals.
4. Food logging remains prominent without obstructing navigation or content.
5. Brand identity should feel warm, confident and approachable — forest green, creamy neutral surfaces, limited orange accents, Bowi used purposefully.

## 2. Information hierarchy: top-to-bottom

**Tier 1 (above fold on common devices, where possible):** date/navigation header → calorie hero → 3 macros.  
**Tier 2:** food diary and add-food actions.  
**Tier 3:** detail nutrients, incomplete-data explanation, optional light-weight insights (not MVP-critical).

No mandatory promotional cards, premium upsells or giant mascot graphic above nutrition content. Home should not pretend photo-based AI tracking already works.

## 3. Mobile low-fidelity wireframe

```text
┌──────────────────────────────────────┐
│ NUTRASA                  [calendar]  │
│ Selasa, 13 Okt 2026       [sync?]    │
│ [←]       Hari ini             [→]   │  ← compact date control; week strip optional
│                                      │
│ ┌────────────── CALORIES ──────────┐ │
│ │ Kalori tercatat                  │ │
│ │ 1.450 / 2.100 kcal     ╭──────╮ │ │
│ │ 650 kcal ke target    │  69% │ │ │  ← hero ring
│ │                       ╰──────╯ │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────┬──────────┬───────────┐  │
│ │ Protein  │ Karbo    │ Lemak     │  │
│ │  ◯ 63%   │  ◯ 64%   │  ◯ 64%    │  │  ← three mini rings
│ │ 75/120g  │160/250g  │ 45/70g   │  │
│ └──────────┴──────────┴───────────┘  │
│                                      │
│ Jurnal Makanan        [Tambah +]     │
│ ┌ Sarapan             350 kcal  [+]┐ │
│ ├ Makan Siang         600 kcal  [+]┤ │
│ ├ Makan Malam         500 kcal  [+]┤ │
│ └ Camilan               —      [+]┘ │
│                                      │
│ [Detail nutrisi tambahan →]          │
│                                      │
│  Home  Makanan Progress Profil AI    │  ← anchored safe-area tab bar
└──────────────────────────────────────┘
```

**Illustrative data only.** This is a structural guide, not approved final artwork. Depending on phone width, macro cards may wrap into another arrangement or use a horizontal layout with adequately legible values; never shrink typography below accessibility limits just to preserve 3 columns.

## 4. Layout measurements — provisional design tokens

| Area | Initial candidate | Notes |
|---|---|---|
| Screen horizontal gutter | 16–20 dp | consistent with design tokens |
| Vertical section gap | 16–24 dp | premium whitespace without wasting space |
| Hero card radius | 20–24 dp | brand-soft card language |
| Hero padding | 16–20 dp | keep calorie totals and ring aligned |
| Main calorie ring | 108–124 dp diameter | adjust with font scaling/device width |
| Macro ring | 42–56 dp diameter | labels and numbers remain legible |
| Card spacing | 8–12 dp | three-across only when width permits |
| Minimum interactive touch size | 44×44 dp target; aim 48×48 | ensure hit areas |
| Tab bar | safe-area-aware, no overlap | five equal, clear labels, no hidden add action |

Prefer responsive constraints rather than fixed screenshot pixel positioning. Respect text scaling and orientation constraints. Light theme MVP; dark theme not automatically included.

## 5. Visual tokens and component variants

Reference `design-system.md` rather than hard-coding colors in screens:

- App background: `color.background` (warm cream `#FFF9EF`, candidate).
- Card surfaces: `color.surface` (white) and `color.surfaceSubtle` (`#FFF8EC`).
- Headline/text: `color.textPrimary` (`#06382C`/forest scale).
- Secondary text: `color.textSecondary` (`#52635D` candidate).
- Ring track: `color.progressTrack` (`#E8ECE8` candidate).
- Calorie ring: `color.progressCalories` (`#176B4D`).
- Protein: `color.progressProtein` (`#063B2E`).
- Carbs: `color.progressCarbs` (`#4C9B63`).
- Fat: `color.progressFat` (`#FF8D25`).

Orange is a category accent, **not** a danger indicator. Never equate food intake with virtue or failure. Use Plus Jakarta Sans and Lucide as currently selected candidates, and route them through `AppText`/`AppIcon` wrappers or centralized typography/icon mappings. Accessibility contrast remains unverified pending visual review.

### UI component conceptual contract

| Component | Required data | States |
|---|---|---|
| `HomeHeader` | selected local journal date, user locale, calendar trigger | today, past day, offline status |
| `CalorieHeroCard` | recorded kcal, target or null, completeness, goal version | eligible, exceeded, log-only, partial, loading |
| `NutritionRing` | nutrient, known value, nullable target, type, completeness | normal, full, above target, absent target, partial |
| `MacroSummaryCard` | nutrient label, consumed, target, indicator | same as ring |
| `MealSection` | type, day, logged items, known summary, add handler | empty, partial, pending sync |
| `SyncStatus` | number/status of queued or failed mutations | hidden when fine, pending, error |
| `HomeEmptyState` | reason (no entries; new account; offline catalog missing) | contextual and actionable |
| `FoodDiaryActions` | selected date/meal | add, edit, copy meal, recipe/favorite navigation |

All components read the same daily data selector; **no nutrition formula is implemented in visual components**.

## 6. Ring behavior — the highest-priority visual requirement

### 6.1 Valid target

`displayProgress = clamp(knownConsumed / positiveTarget, 0, 1)`.

- Put an accessible, text-based value next to/on the ring; ring alone must not carry meaning.
- Value and target are explicitly labeled with unit (`kcal` or `g`).
- When over target, cap visual sweep at 100% but show the **actual** recorded amount and excess as neutral text (`+150 kcal dari target`) and an additional cue (text/icon). Never draw a >100% overlapping sweep by accident.
- Remaining amount is clamped only when **displaying remaining**; do not hide a negative difference by calling it 0 without mentioning excess.
- `0 logs` means **not yet recorded**, not proven 0 intake.

### 6.2 No goal / log-only

- Show `1.450 kcal tercatat`, **not** `1.450 / 0 kcal`.
- Replace ring with a restrained decorative neutral circle or omit it; no implied percent achieved.
- Offer a non-coercive link `Atur target` only if the user's profile/eligibility permits.

### 6.3 Incomplete nutrient data

- If any logged food lacks this nutrient value, show known minimum/partial sum alongside `Data sebagian` and a tooltip/detail explaining uncertainty.
- Do not silently substitute missing nutrient values with zero.
- Treat calories/macros and supplementary nutrients separately regarding completeness; missing sodium must not erase a valid known protein total.

### 6.4 Accessibility and motion

- `accessibilityLabel` example: `Protein tercatat 75 dari target 120 gram, 63 persen, data lengkap`.
- Honor reduced-motion preferences; numbers readable before any ring animation finishes.
- Don't use red/orange alone to communicate under/over; labels and icons accompany visual differences.

## 7. Calendar and date interactions

- Show the **currently selected journal date** clearly, localized Indonesian (e.g., `Selasa, 13 Okt 2026`).
- Changing date refreshes all sections using the same date key and the matching historical target version.
- Date selection is a `YYYY-MM-DD` journal-day identifier derived from user-configured timezone; do not use naive UTC truncation.
- `Hari ini` control returns to the current local journal date.
- For date history, don't assume missing entry equals zero; day-completion marker is a separate concept.
- **OPEN UX:** choose compact week strip versus only calendar picker in header; prototype both.
- **OPEN product:** whether future dates can accept logs; visual default is browse-only until approved.

## 8. Meal diary and quick add

- Four initial meal groups: `Sarapan`, `Makan Siang`, `Makan Malam`, `Camilan`.
- Each group exposes a clear add control and opens food discovery pre-filled with `mealType` and `selectedDate`.
- Entries display name, portion/units, and recorded calories when available; detail/edit/delete via clearly named actions.
- After save, preserve selected date and return appropriately to the originating meal on Home; daily totals update from local data immediately.
- Copy meal, favorites and recipe actions use existing Food Logging spec; do not create a duplicate food data source in Home.
- If food is missing from catalog, provide `Buat makanan sendiri` in food discovery flow; do not invent nutrition numbers.

## 9. Bottom navigation and Bowi

**Five planned destinations:** Home, Makanan, Progress, Profil, AI Tracking. Visual design has **two candidates**:

A. Flat/soft pill tab bar with five labeled icons (recommended for clarity).  
B. Floating rounded tab bar inspired by supplied navigation references, with five labels and safe-area containment.

Do not implement a nonworking `AI` CTA as if it is already available; **OPEN decision** between disabled `Coming Soon` placeholder and hiding until launch. A central emphasized action is **not** approved simply because it appeared in a reference: keep accessibility and five-tab navigation coherent.

Bowi may appear in meaningful empty-state, short guidance, or onboarding-related hints; **do not** dominate calorie ring, clutter hero area, or replace nutritional data. Use canonical assets under `assets/branding/mascot/bowi/`.

## 10. Full Home state matrix

| State | User-visible behavior | Primary action |
|---|---|---|
| Loading first visit | Skeleton layout sized like hero/rings/diary; avoid flash of fake zeros | Wait / retry on timeout |
| Day without logs | `Belum ada makanan dicatat` and empty meal groups; no completed-day claim | `Tambah makanan` |
| Valid goal and logs | Numeric calories, three macro rings, meal summaries | Add/edit food |
| Over target | Ring full, numeric excess clearly stated, nonjudgmental language | View log/detail |
| Partial nutrition | Known totals + `Data sebagian` for affected nutrient | See details |
| Log-only | Consumed value without target percentages | Log food |
| Offline pending sync | Local state visible, `Belum tersinkron` badge/status | Retry when possible |
| Sync failed | Persisted logs remain; actionable failure message | Retry / details |
| Offline no catalog cache | Preserve existing log view, explain search limitation | Custom food / retry |
| Goal recalculating | Last valid target identified as current or pending per business rule; never silently assume new one | View status |
| Invalid new goal | Do not silently activate bad value; `Perlu ditinjau` | Review profile |
| Historical date | Historical goal and logs; date stays selected during meal flow | Return to today |
| Deleted/edited offline log | Update local totals, pending state until server confirms | View sync status |
| Session expired | Restrict remote operations, protect cached personal data per auth policy | Log in again |
| UI/font scaling | No clipped numbers, cards reflow/stack, stable navigation | Standard actions |
| Load failure | Error message and safe retry; never replace with all-zero dashboard | Retry |

## 11. Responsiveness and accessibility review

Design and test with at least: small Android width around 320dp, typical 360–393dp, large device 430dp+, text scaling ≥1.3× and preferably 2× in accessibility mode, iOS safe areas, Android gesture navigation, light theme, screen reader labels, reduced motion, and high-contrast scenarios. Numerical values should use tabular alignment if available in typography; Indonesian grouping of thousands (`1.450`) and clear units.

Do not make actions hover-only or rely solely on colors. Labels and touch targets remain visible when the keyboard opens in log-editing flows.

## 12. Interaction test / acceptance criteria

- [ ] The owner approves wireframe hierarchy and priority of the calorie + macro rings.
- [ ] The owner chooses calendar variant and navbar variant.
- [ ] Hero card shows valid target and nullable-target (log-only) correctly.
- [ ] Over-target state shows actual excess and no hidden numeric difference.
- [ ] Missing nutrients show partial badge only for affected metrics.
- [ ] One food add from a historical date returns to the same selected date.
- [ ] Retry sync never creates a duplicate visible log.
- [ ] Four meal sections include appropriate empty and populated states.
- [ ] No target/amount is hardcoded in production UI; sample fixtures isolated.
- [ ] Screen-reader label conveys values without relying on ring visuals.
- [ ] 320dp/small screen and enlarged font remain functional.
- [ ] Bowi/logo are official branded assets only.
- [ ] No unapproved feature (AI, photo recognition, premium) becomes operational as a side effect of UI work.

## 13. Decision register for owner review

| ID | Design/product decision | Recommended default | Status |
|---|---|---|---|
| HOME-01 | Calendar presentation | Header date picker, optional week strip | OPEN |
| HOME-02 | Calorie card composition | Text on left + ring on right | PROPOSED |
| HOME-03 | Macro cards | Three cards with mini ring | PROPOSED, matches user's reference |
| HOME-04 | Bottom tab style | Floating but compact and readable | OPEN, requires mockup |
| HOME-05 | Fifth AI tab | Explicit disabled preview or hide | OPEN |
| HOME-06 | Mark day complete | Separate intentional action | OPEN |
| HOME-07 | Future date logging | Browse only initially | OPEN |
| HOME-08 | Nutrients detail entry | Single `Detail Nutrisi` button | PROPOSED |
| HOME-09 | Bowi placement | Empty/offline/education states | PROPOSED |
| HOME-10 | Macro ring size and token values | Test on actual screen widths | REVIEW VISUAL |
| HOME-11 | Auto goal change invalid case | Pending-review state, preserve history | REVIEW NUTRITION/TECH |
| HOME-12 | Label semantics for kcal/macros | Neutral, nonjudgmental wording | REVIEW PRODUCT/NUTRITION |

## 14. Suggested implementation handoff (only after UI approval)

1. Build reusable, stateless `NutritionRing`, `NutritionSummaryCard`, `MealSection`, `DateSwitcher`, `SyncStatus`.
2. Implement Home shell using shared theme tokens, `AppText`, and `AppIcon` (Lucide via wrapper).
3. Wire components to a single selected-day view model from local/offline-backed store.
4. Derive totals from food-log domain functions, **not inside components**.
5. Add state previews/test fixtures outside production Home route; test normal, empty, log-only, partial, over target, pending sync.
6. Validate screen-reader focus, font scaling and safe-area tab layout.
7. Obtain owner sign-off before pixel polish/animations.

**This document authorizes planning and prototyping only.** It does not authorize Codex to implement features, choose pending product decisions, or claim nutrition safeguards medically validated.
