# NUTRASA — Dashboard / Home Feature Specification

**Version:** 1.0 planning draft  
**Date:** 13 October 2026  
**Repository path:** `docs/03-features/dashboard-spec.md`  
**Status:** Implementation-ready UX/data contract where marked **AGREED**; unresolved details marked **PROPOSED / REVIEW REQUIRED**. Not clinical approval.

> **Purpose:** Specify the Nutrition Tracker home screen from the user's point of view and as a testable contract for React Native + Expo. Home is a read model of food logs, goal versions and the selected diary date, **not** an independent calculator or authoritative data store.

## 0. Relationship to existing documents

Read together with:
- `docs/00-overview/business-rules.md` (draft; decision status applies)
- `docs/02-architecture/nutrition-engine-spec.md` (calculation candidates, safety guards)
- `docs/01-design/onboarding-spec.md` (authentication, completed onboarding, log-only)
- `docs/02-architecture/food-database-spec.md` (catalog, nutrient provenance and missing values)
- `docs/03-features/food-logging-spec.md` (meal/date IDs, snapshot, partial totals and offline)

**Precedence if documents conflict:** explicit owner decisions recorded in a decision log > approved current feature contract > older drafts. Log any conflict; do not silently choose or have Codex invent a policy.

### 0.1 Confirmed decisions (AGREED)

1. Home/dashboard, Food, Progress, Profile and future AI Tracking are navigation destinations; exact AI placeholder visibility is not final.
2. Core dashboard presents selected day/date, calories, protein, carbohydrates and fat, and meal diary (breakfast/lunch/dinner/snacks).
3. Daily nutritional goals derive from the Nutrition Engine according to adult eligibility and user goal. Eligible computed targets can activate automatically; unsupported users can use **log-only mode** without generated targets.
4. Goal versions change after supported weight updates; historical data and old food-log nutrient snapshots must remain intact.
5. Nutrient facts may be partially missing; unknown values are **not** zero.
6. Users may create, edit and delete logs, favorite foods, copy meals, add custom food/recipes, and write logs while offline with later sync.
7. Progress covers calories, macros, weight and recording consistency; Home gives an overview, not a full analytics screen.
8. Water/sleep/activity trackers, AI and premium are not required for first MVP launch.

### 0.2 Proposed defaults (PROPOSED — confirm before UI lock)

- Header: greeting / selected local day + date-picker entry.
- First-fold priority: calorie summary, macro bars, meal cards, sync banner only when relevant.
- Four meal buckets: breakfast, lunch, dinner, snacks; buckets contain multiple items; add actions on each.
- Nutrient details entry leads to a more complete 11-nutrient view, showing unknown/partial values.
- User may explicitly mark a day `COMPLETE`; a log entry alone does **not** imply the day is complete.
- Bottom tabs: Home, Makanan, Progress, Profil and disabled/coming-soon AI (visibility remains undecided).
- No exercise calorie deduction, calorie burn credit, fasting timer or gamified streak penalties in MVP.

## 1. User stories and success outcomes

| ID | User story | Observable success |
|---|---|---|
| DH-01 | As a first-time user, I can see the day's log and targets (if available) | No misleading numbers on empty dashboard |
| DH-02 | As a logger, I can add food directly to a meal | Food picker receives selected `diaryDate` and `mealType` |
| DH-03 | As a returning user, I can inspect past dates | Switching dates refreshes all date-scoped totals and meals |
| DH-04 | As an offline user, I can view cached data and add items | Local entries appear immediately with sync state |
| DH-05 | As a log-only user, I can track consumption without targets | No invented goal, remaining calories or percent achieved |
| DH-06 | As a user with missing nutrient values, I can recognize incomplete totals | Partial badge and explanation visible |
| DH-07 | As a user who edited yesterday, I can trust history | Correct old date, old goal version, old snapshots |
| DH-08 | As a user with expired credentials, I am not exposed to another user's data | Local view isolated; reauth flow is clear |

## 2. Screen information architecture (ordered top to bottom)

### 2.1 Top header
- Localized Indonesian date format, e.g. `Selasa, 13 Oktober 2026` (display based on chosen diary date, not device clock when viewing history).
- Tapping date opens calendar/date picker; horizontal day strip is optional (avoid building two competing calendar controls without UX testing).
- Notification entry **only if** reminders are approved; otherwise omit.
- User display name is optional: no broken greeting if name is blank.

### 2.2 Daily energy card
- If goal active: show `consumed kcal / target kcal`, numeric remaining or difference labeled accurately (not `maximum` for all goals), and fill ratio.
- If no valid goal: show `calories recorded` with no `/ target`, no remaining and no goal-color judgement.
- Overshoot: display exact number and an over-target indicator; visually cap bar fill at 100%, display excess separately. Never clip numeric value.
- If no logs: show `Belum ada catatan` and add affordance; zero may appear as **recorded known total 0** but is not evidence that day intake is zero.
- If any logged energy missing: label **parsial** and explain what is excluded; avoid misleading % complete.
- Use `kcal`, not `kal` for unit labels. Indonesian formatted numbers, while preserving numeric precision in storage.

### 2.3 Macro overview
- Protein (g), karbohidrat (g), lemak (g) in fixed semantic order; display known sums and targets when available.
- Rendering semantics: `target`, `upper_bound`, `minimum`, `monitor_only` must be visually distinct as needed. No green success state for reaching a nutrient upper bound.
- Progress may exceed target; show overage text, clamp graphical track only.
- Any nutrient incomplete across logs carries `partial` status independently; e.g. protein full but sodium partial.
- Nutrition detail entry opens all 11 nutrients, each with relevant units and availability; UI shouldn't invent target for sugar total, cholesterol, etc.

### 2.4 Meal diary cards
- Four sections, proposed: Sarapan, Makan Siang, Makan Malam, Camilan.
- Each shows: title, aggregated known kcal and completeness if entries exist; empty text otherwise; list/preview of food entries or `Lihat semua` as space permits; primary plus button.
- Add button navigates to Food Picker with explicit `selectedDiaryDate` and `mealType` and a return destination; Food tab opened without context asks destination before saving.
- Tapping an existing item opens detail/edit; removal requires appropriate confirmation or undo per approved UX.
- Multiple entries and multiple snacks allowed; do not hardcode one meal item per bucket.
- Copy meal action can live in meal overflow menu if approved. Should not obscure add.

### 2.5 Secondary controls
- Entry to detailed diary, daily nutrient details and Progress.
- Optional water/sleep/activity should **not** be displayed as fake functional trackers in MVP. They may be omitted or clearly flagged future feature in non-production prototypes.
- AI/premium not responsible for nutrition totals or basic journal workflows.

## 3. Navigation and calendar contract

### 3.1 Date identity
- `selectedDiaryDate` is a **local civil date** string `YYYY-MM-DD`, assigned intentionally; it must not be recalculated from a UTC timestamp after a user changes time zones.
- On first opening Home, default to device-local **today**. On navigation from Progress/calendar, preserve explicit date selection until deliberately reset; restore policy after cold launch is **PROPOSED**: reset to today.
- Month/day navigation updates all displayed nutrient and meal selectors **atomically**; don't show totals for date A and meals for date B.
- Calendar indicator is based on log existence/completion state, not on reaching calorie target.
- Empty day => `NO_DATA`; day with entries => `HAS_LOGS`; optional explicitly completed day => `COMPLETE`. `HAS_LOGS` must not equal complete day.
- Future date editing: **OPEN** (recommend permit future browsing but no completion status, with log entry policy explicitly defined).

### 3.2 Navigation destinations

| From | Action | Destination | Required context |
|---|---|---|---|
| Home | Tap date | Calendar selector | `selectedDiaryDate` |
| Home meal card | Add | Food Picker | `selectedDiaryDate`, `mealType`, `returnTo=home` |
| Home meal item | Tap | Food Log Edit | `logEntryId`, `selectedDiaryDate` |
| Home nutrient details | Tap | Nutrition Detail | `selectedDiaryDate` |
| Home progress teaser | Tap | Progress tab | chosen period / optional date |
| Bottom Food tab | Tap | Food catalog | destination meal/date may be unspecified |

## 4. Data contract: one selected day's dashboard

This is a logical read model, **not** a committed database or API schema.

```ts
type NutrientKey =
  | 'energyKcal' | 'proteinG' | 'carbsG' | 'fatG'
  | 'fiberG' | 'sugarG' | 'saturatedFatG' | 'transFatG'
  | 'cholesterolMg' | 'sodiumMg' | 'potassiumMg';

type NutrientSummary = {
  knownTotal: number | null;
  completeness: 'NO_LOGS' | 'COMPLETE_DATA' | 'PARTIAL_DATA';
  unknownEntryCount: number;
};

type GoalMetric = {
  value: number;
  unit: 'kcal' | 'g' | 'mg';
  intent: 'target' | 'minimum' | 'upper_bound' | 'monitor_only';
};

type DailyDashboard = {
  userId: string;
  diaryDate: string; // YYYY-MM-DD, civil date
  goalMode: 'ACTIVE' | 'LOG_ONLY' | 'NEEDS_REVIEW' | 'UNAVAILABLE';
  goalVersionId: string | null;
  metrics: Record<NutrientKey, NutrientSummary>;
  goals: Partial<Record<NutrientKey, GoalMetric>>;
  meals: Array<{
    mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
    entryIds: string[];
    itemCount: number;
    energy: NutrientSummary;
  }>;
  diaryStatus: 'NO_DATA' | 'HAS_LOGS' | 'COMPLETE';
  sync: { pendingCount: number; failedCount: number; lastConfirmedAt: string | null };
  lastUpdatedAt: string;
};
```

**Contract details:**
1. `knownTotal` sums only known nutrient values from logged nutrient snapshots. If one or more entries lack this nutrient, use `PARTIAL_DATA`, not `COMPLETE_DATA`. For a day with no logs, `NO_LOGS`; a numeric zero alone cannot distinguish no logs.
2. Every food log item should retain nutrient values at time of logging; recipe/catalog updates must not rewrite past snapshots.
3. No entry-level nutrient should be silently inferred as zero from `null`.
4. Goals come from the **effective dated goal version**, not a hardcoded constant or recalculation inside Home. If product policy uses a present-day target for all history instead, this requires explicit approval; recommendation is historical effective goal lookup.
5. Do not add `exerciseCalories` or subtract it from consumed kcal until an activity integration business rule is reviewed.
6. Idempotent reads should distinguish unsynced local overlays from server totals to prevent double counting.
7. Backend authorization enforces user ownership; UI tab guards alone are insufficient.

## 5. Numeric and presentation semantics

| Metric / case | Data rule | Display rule |
|---|---|---|
| Energy goal active | `consumed` versus goal for selected date | `1.480 / 2.100 kcal` (illustrative only) |
| Calorie remaining | goal − consumed *when known total complete* | Label `Sisa estimasi`; if negative say `Melebihi target` |
| Missing energy for some entries | sum known values, `PARTIAL_DATA` | `≥ 1.480 kcal tercatat` or `1.480 kcal (parsial)`; do not imply complete intake |
| Macro goal active | known total, independent completeness flag | `Protein 75 / 120 g`, with partial badge if applicable |
| Log-only | consumed without goal | `Protein tercatat: 75 g`, no percentage |
| Sodium/upper bound | known total, upper-bound policy | `Batas` not achievement / fill-to-win |
| Unknown nutrient | value `null` or partial totals | `Belum tersedia` or `Data parsial`, never default 0 |
| No food logged | `NO_LOGS` | empty-state; don't calculate average intake as zero |
| Past day | log snapshot + dated goal version | honor historical context, not today's target |
| Over target | numeric amount preserved | progress fill capped, surplus shown separately |

**Rounding:** aggregate internal values first then round for UI (proposed kcal integer; macro g to 0–1 decimal; mg integer). Exact display precision to be checked with sources/nutrition reviewers. Never round each item before summing.

## 6. Main screen state matrix

| State | Trigger | Expected UI | User action |
|---|---|---|---|
| `INITIAL_LOADING` | first local hydration | skeleton/placeholders, no fake target | await hydration |
| `NO_DATA` | no log items selected date | empty meals and add prompts | add food |
| `ACTIVE_GOAL` | applicable validated target | totals + target & macro bars | view/edit goal in Profile |
| `LOG_ONLY` | unsupported profile / selected mode | consumption values only | keep logging |
| `GOAL_REVIEW_REQUIRED` | recalculation fails eligibility | don't activate new target; clear notice | review profile/goal |
| `PARTIAL_NUTRIENTS` | any missing field among entries | per-nutrient completeness indicator | food detail / explanation |
| `OFFLINE_CACHED` | network absent, local data exists | last cached + pending operation state | continue logging |
| `SYNC_PENDING` | local changes not confirmed | unobtrusive pending indicator | view sync status |
| `SYNC_FAILED` | retry exhausted / hard error | persistent retry/help affordance | retry or resolve |
| `FETCH_ERROR` | local and server unavailable | no fabricated values; recoverable error | retry |
| `SESSION_EXPIRED` | auth refresh denied | secure session transition, protect local data | sign in |
| `ACCOUNT_SWITCHED` | different authenticated account | clear/isolate previous user's local overlays | load selected account |
| `DATE_CHANGE` | user selects other date | date-scoped loading without stale cross-date UI | navigate safely |

### 6.1 UI messages (Indonesian first; draft copy)
- No logs: `Belum ada makanan yang dicatat pada tanggal ini.`
- Log-only: `Kamu tetap dapat mencatat makanan. Target nutrisi otomatis belum tersedia untuk profil ini.`
- Partial: `Sebagian makanan belum memiliki data nutrisi lengkap. Total yang ditampilkan hanya mencakup nilai yang diketahui.`
- Pending: `Catatan tersimpan di perangkat dan akan disinkronkan.`
- Sync failed: `Sebagian perubahan belum berhasil disinkronkan. Data lokal masih tersimpan.`
- Goal review: `Target terbaru perlu ditinjau sebelum digunakan.`

## 7. Automatic recalculation and effective goal version

1. A valid weight change causes the Nutrition Engine to attempt recalculation using approved current input/profile data, not Home screen math.
2. Engine result statuses include `READY`, `NEEDS_INPUT`, `NEEDS_REVIEW`, `UNSUPPORTED`, `INVALID_INPUT`, `MACRO_ALLOCATION_CONFLICT`.
3. `READY` permits activation per approved rules. Other statuses must not create fabricated or invalid targets; clarify whether the last valid goal is held with warning or goal mode switches to review state (**OPEN: requires owner/clinical policy**).
4. Every activated target has `effectiveFrom` and a version/revision ID; older entries and target versions remain available for history.
5. For an offline weight update, use a deterministic revision/order and server reconciliation; don't show a new target as synced until confirmed. If local result available, it must be clearly labeled locally computed/pending.
6. Backdated weight entries should not silently rewrite all historical target comparisons. Historical recomputation is a separate explicit policy (**OPEN**).
7. Prevent accidental recalc loops, duplicate versions for the same change, and races when weight changes twice quickly.

## 8. Offline data and sync presentation

- Hydrate from user-scoped local persistence quickly; reconcile with authorized server state when online.
- When adding/editing/deleting a food log offline, update the selected day's totals based on local confirmed-or-pending records once; do not count server copy and local queue copy twice.
- Display pending/failed sync count only when relevant; user can open detailed status from Home/Profile.
- Server rejection/conflict must update local state predictably and preserve recoverable edits when possible.
- User log data must not leak when a different user signs in on the device.
- No promise that background sync always runs when app closed; reconcile on launch/resume and network restoration subject to platform behavior.
- Third-party food provider caching obeys license; local curated internal catalog can be packaged/cached within applicable rights.

## 9. Accessibility, interaction, performance

- All progress bars must provide meaningful text label and numeric values; never rely only on color, ring fill or mascot reactions.
- Dynamic text scaling, screen reader order, contrast, tap target sizes and reduced-motion preferences should be considered in UI specifications.
- Pull-to-refresh refreshes authorized data when online; do not wipe pending local edits.
- Loading is scoped: calendar changing should not reset global auth, and sync updates should not blank whole Home.
- Optimize selected day selector and meal list render; avoid recalculating full history on each render. No premature background polling.
- Localization: Bahasa Indonesia labels, `id-ID` formatting, time-zone-safe calendar; unit abbreviations consistent.
- On offline/stale data, indicate freshness rather than pretending data is live.

## 10. Recommended components (conceptual, not mandatory folders)

- `HomeScreen` route composer (Expo Router minimal route file)
- `DateHeader` / `DiaryDateSelector`
- `EnergySummaryCard` and `MacroSummary`
- `NutrientProgressRow` semantics-aware
- `MealSectionCard` and `MealEntryRow`
- `NutrientDataCompletenessNotice`
- `SyncStatusIndicator`
- `DashboardEmptyState` / `DashboardErrorState`

**Implementation boundary:** feature-specific components and selectors within `src/features/dashboard/`; shared UI primitives reused only when necessary; no goal computation business logic in JSX. Adapt directory paths to chosen Expo Router convention.

## 11. Acceptance criteria (release gate)

- [ ] Home loads for a signed-in, completed-onboarding eligible user with valid dated goals.
- [ ] Log-only user sees recorded nutrients without any invented target/remaining.
- [ ] Selecting yesterday updates meal entries, energy and macros consistently.
- [ ] Add button routes correct selected date/meal, including from historical dates.
- [ ] Add/edit/delete/copy meal updates Home exactly once, including when offline.
- [ ] Reopening the app after local save retains pending entries.
- [ ] Repeated sync/retry never duplicates a log or double-counts its nutrients.
- [ ] Missing any nutrient yields corresponding partial display and accurate known sums.
- [ ] No logged day is distinguishable from a logged value of zero.
- [ ] Calorie/macros over-goal are shown numerically and graphically without clipping.
- [ ] Old date uses the effective historical target version per approved date policy.
- [ ] Invalid goal recalculation does not generate a fake number.
- [ ] Auth/session/account switch does not expose another user's saved data.
- [ ] Screen reader announces consumed, unit, target where applicable, and completeness.
- [ ] App handles fetch error, offline cached, sync pending, sync failed and stale values.
- [ ] All user-visible copy is Indonesian (technical identifiers may be English).

## 12. Test matrix

| ID | Scenario | Expected result |
|---|---|---|
| DH-T01 | First login, zero logs | Empty state, not false 0-kcal day completion |
| DH-T02 | Valid target, no logs | Goal displayed; intake has no-log semantics |
| DH-T03 | Log-only mode | No target, no percent/remaining |
| DH-T04 | Add 150 g from food detail | Correct proportional nutrients and selected meal |
| DH-T05 | Change date to yesterday | All cards reflect yesterday's entries |
| DH-T06 | Change date rapidly A→B→C | No stale results from A overwrite C |
| DH-T07 | Duplicate network retry | One log and one aggregate |
| DH-T08 | Offline add + restart | Saved locally and still visible pending |
| DH-T09 | Offline delete + later sync | No ghost log resurrected from server |
| DH-T10 | Recipe revised | Old diary value unchanged |
| DH-T11 | Missing sodium in one logged food | Sodium flagged partial, not 0 |
| DH-T12 | Missing energy in one item | Energy sum flagged partial, no unqualified remaining |
| DH-T13 | Protein exceeds target | Numeric overage displayed, visual fill capped |
| DH-T14 | Change goal due to new weight | New goal effective date correct, old comparison preserved |
| DH-T15 | Invalid recalc outcome | Review state; no auto-activation |
| DH-T16 | User switches accounts | User A data cannot be seen by B |
| DH-T17 | Session expired while offline | Protected/private local data handling follows security policy |
| DH-T18 | Very long food name and larger font | No overlap; accessible layout |
| DH-T19 | Two meal cards show same food | Counts are independent per log entry |
| DH-T20 | Calendar day with some logs | `HAS_LOGS`, not `COMPLETE` unless explicitly marked |
| DH-T21 | Date change over DST/zone travel | Stored civil date does not drift |
| DH-T22 | Sync conflicts on two devices | Deterministic resolution and user feedback |
| DH-T23 | All optional nutrients unknown | Core totals valid; nutrition details mark unavailable |
| DH-T24 | Remote call errors, cached data present | Cached data visible with stale/retry indication |
| DH-T25 | Future date selected | UI follows approved future-date policy, no invented records |
| DH-T26 | Food tab opened without meal context | Destination asked before save |
| DH-T27 | Backdated goal or weight edit | Does not silently rewrite prior goal history |
| DH-T28 | No name in profile | Header renders without placeholder username |

## 13. Decision register — ask owner before UI finalization

| ID | Decision | Recommended default | Status |
|---|---|---|---|
| DHD-01 | Compact week strip vs date-header calendar popover | Date-header picker first; add week strip if usability supports | OPEN (UX) |
| DHD-02 | Completion toggle for diary days | Explicit `Mark Day Complete` | OPEN (product) |
| DHD-03 | Allow logs on future dates | Future browsing yes; disable future log until approved | OPEN (product) |
| DHD-04 | Show 11 nutrients inline or separate details | Macro-first + details screen | OPEN (UX) |
| DHD-05 | Historical target compared to what goal | Goal version effective on diary date | OPEN (product/technical) |
| DHD-06 | What happens to previous goal if recalculation invalid | Hold last valid with clear status vs hide until review | OPEN (nutrition/product) |
| DHD-07 | Reopen behavior of selected date | Reset to today after cold app launch | OPEN (UX) |
| DHD-08 | AI Tracking tab placeholder display | Hide until enabled, or show clearly disabled placeholder | OPEN (product) |
| DHD-09 | Offline status in Home header vs Profile only | Small status badge only when pending/failed | OPEN (UX) |
| DHD-10 | Whether goals compare to logged intake only | Yes, no automatic exercise deduction in MVP | OPEN (product) |
| DHD-11 | Rounding/display precision | kcal integer, macro 0–1 decimals, mg integer | OPEN (nutrition/UX) |

## 14. Cross-domain review gates

**Nutrition / medical review:** eligible users; active goal safe activation and invalid recalculation behavior; macro target semantics; accuracy/labeling of partial nutrient totals; precision and rounding; word choice `target` vs `limit`.

**Privacy / legal review:** notice and processing of body/food information; account-linked cached diary protection, deletion/export retention; third-party data licensing; consent copy and app-store disclosures.

**Technical/security review:** date identity/time zone, immutable food snapshot, goal-version historical lookup, idempotent sync, local encrypted/sensitive storage policy, server-side authorization, two-device conflict treatment, Expo Router compatibility, accessibility and error recovery.

## 15. Implementation handoff: do not code yet

**Prerequisites:** owner resolves at least DHD-01 through DHD-06, Nutrition Engine safeguards are reviewed, food logging's main decision register is resolved, navigation spec defines route structure, and backend/data interfaces are drafted.

**Suggested vertical slices later:**
1. Date picker + empty day local read model.
2. Goal-aware energy and macro overview (log-only supported).
3. Meal cards + food picker context contract.
4. Local live totals and nutrient completeness.
5. Offline pending/failed indicator and reconciliation.
6. Historical goals, day statuses, UI/accessibility QA.

**Definition of done:** user can select a date, understand today's verified-known nutrient intake, add and correct meals, see the effect instantly without misleading partial-data or goal claims, and safely recover from offline or error cases.
