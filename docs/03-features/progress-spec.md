# NUTRASA — Progress & Insights Feature Specification

**Version:** 1.1 (planning draft)  
**Date:** 13 October 2026  
**Repository path:** `docs/03-features/progress-spec.md`  
**Status:** Product decisions marked **AGREED**; implementation defaults **PROPOSED**; clinical and data-governance rules **REVIEW REQUIRED**. Not approved for production without gates below.

> **Purpose:** Define what Progress measures, how it derives reliable trends from food logs, body-weight records, and goal history, and what the user sees when information is missing, partial, offline or revised. Progress is a *read model*, not an alternative Nutrition Engine.

## 0. Dependencies and decision authority

Read alongside:
- `docs/00-overview/business-rules.md`
- `docs/02-architecture/nutrition-engine-spec.md`
- `docs/02-architecture/food-database-spec.md`
- `docs/03-features/food-logging-spec.md`
- `docs/03-features/dashboard-spec.md`
- `docs/01-design/onboarding-spec.md`

When a conflict exists, explicit owner-approved decisions and documented newer contracts take priority. Record discrepancies in `decision-log.md`; do not silently invent behavior.

### AGREED product boundaries

1. Progress MVP includes **calorie intake, protein/carbs/fat, weight trend, and logging consistency**.
2. Users can inspect daily, weekly and monthly periods, including past dates.
3. Nutrition values come from *saved food-log nutrient snapshots* and selected portion amounts; unknown nutrients remain unknown, never zero by assumption.
4. Log-only users can see intake and weight trends without automated nutrient targets.
5. Weight changes trigger automated reevaluation of goals **when eligible and when review/safety checks pass**; goal history remains versioned.
6. Offline-tolerant operation: local writes appear immediately and sync later; sync failures must not be disguised.
7. Other trackers (sleep, water, activity), AI recommendations, premium analytics, progress photos, and circumference tracking are **out of MVP** unless later approved.

### PROPOSED defaults needing owner approval

- Progress top-level sections: **Nutrisi**, **Berat Badan**, **Konsistensi**.
- Period switcher: **7 hari / 30 hari / 90 hari** with a date range selector for history; the daily view is optional.
- Marking a diary day `COMPLETE` is an **explicit user action** (not inferred from a food entry).
- Trends reflect *consumed food energy only*; do not subtract exercise calories or infer energy burned.
- Show data coverage beside aggregate charts; avoid ranking/penalizing missing days.

## 1. User stories

| ID | User story | Observable outcome |
|---|---|---|
| PR-01 | I want to see how my logged calories vary over time. | Chart by diary date with known/partial/missing status. |
| PR-02 | I want to compare logged macros with goals. | Relevant goal version and context are visible. |
| PR-03 | I want to record my weight and see its trend. | Date-stamped records can be added/edited/deleted. |
| PR-04 | I want to see logging consistency. | Counting rules and coverage are transparent. |
| PR-05 | I am log-only. | Intake and weight are displayed without made-up targets. |
| PR-06 | I record while offline. | My latest local entries display with sync indicators. |
| PR-07 | I corrected an old log. | Historical aggregate is recalculated from updated snapshots. |
| PR-08 | I changed weight or targets. | Historical goals remain attributable to their effective periods. |

## 2. Information architecture & navigation

### 2.1 Progress landing

1. Page title `Progress`, optional selected date range (not automatically constrained to today).
2. Period selector and coverage summary: e.g. `5 dari 7 hari memiliki catatan` rather than a misleading dietary score.
3. Tabs or in-page sections:
   - **Nutrisi**: energy intake + protein/carbs/fat, total/average with coverage indicators.
   - **Berat badan**: weight graph, list of weigh-ins, add/edit/delete.
   - **Konsistensi**: diary days with data, explicit complete days if feature approved, empty days.
4. Optional drill-down from a chart point to the diary on that date.
5. Navigation bottom tabs remain part of app shell; do not build duplicate navigation.

### 2.2 Nutrition section

- Chart default: bar chart energy consumed per day; macro selector supports separate protein/carbohydrate/fat visualization (avoid squeezing four incompatible units into one scale).
- Show selected metric name and unit (`kcal` or `g`).
- Numeric summary for the range: **known total**, **average per day with observed data**, **number of days with logs**, **number of fully known days**. Do not label the observed-day average as an all-days average.
- If goals exist, optional target reference/line must use appropriate **historical goal version per date**; avoid treating today's target as historical fact.
- If day has energy unknown for one or more logged foods, mark `PARTIAL`; sum known contributions but flag incomplete.
- Values above target are not inherently failures, and the app must not offer unsupported weight predictions.

### 2.3 Weight section

- Display weight in kg by default; user setting may convert presentation to other units while persisting canonical kg.
- Add measurement: decimal positive value and **measurement date**, optionally measurement time and note (proposal); no need for progress photographs.
- Weigh-ins can be edited/deleted with undo or explicit confirmation; changes must sync.
- If multiple weigh-ins occur on one day, retain all actual events (do not silently overwrite). A daily representative value for the graph is a **decision still open** (latest recorded that day proposed).
- Graph points use recorded dates, with **no interpolation asserted as fact**; connecting dots is visual only. Do not make day-to-day weight fluctuation a failure state.
- Starting weight, latest recorded weight and target weight can be shown if available; distinguish historical current value vs selected period endpoint.
- If auto-recalculation changes a goal, log an effective-dated goal version; rejected or needs-review calculations must not become active.

### 2.4 Consistency section

- Distinguish `NO_LOG`, `HAS_LOGS`, and `USER_MARKED_COMPLETE` (if completion feature approved).
- A day with `NO_LOG` means **no data**, never `0 kcal consumed`.
- Logging frequency = number of distinct diary dates with >=1 non-deleted food log / eligible dates in selected range (if denominator policy approved).
- Diary completion rate, if supported, is distinct from food log frequency; zero complete days should not be interpreted as unhealthy behavior.
- Avoid punitive streak design, score-shaming, or guilt-inducing notification language.
- Show brief explanation for all percentages.

## 3. Time and date semantics

- Canonical diary identifier: **`YYYY-MM-DD` in the user's configured diary timezone** (IANA timezone ID), not UTC date derived blindly from event timestamps.
- Store server event timestamps separately in UTC; local diary date and timezone context are explicit data.
- Date range filters include both start and end local diary dates.
- Define 7/30/90 days as rolling calendar-day windows ending at selected end date (PROPOSED), not calendar weeks/months unless approved.
- Future dates should not be counted as missing in consistency denominators; historical future-date logging policy inherited from Food Logging.
- Crossing midnight or changing timezone should not silently shift existing diary entries across days. Changing diary timezone prompts user to select a migration policy; policy decision required.
- A day with no entry inside the queried range is `NO_DATA`, not a zero-valued observation.

## 4. Nutrient aggregation contract

### 4.1 Per nutrient per day

Take active, non-deleted food-log snapshots assigned to the diary day:

```
knownSum(nutrient) = sum(snapshot.nutrient for entries where nutrient != null)
missingCount(nutrient) = count(entries where nutrient == null)
recordCount = number of active logged items
status =
  NO_DATA         if recordCount == 0
  UNKNOWN         if recordCount > 0 and missingCount == recordCount
  PARTIAL         if 0 < missingCount < recordCount
  COMPLETE_KNOWN  if missingCount == 0
```

`UNKNOWN` may display as "Tidak tersedia", **not** 0. `PARTIAL` may show `≥ knownSum` *only if* the nutrient values are nonnegative and semantic lower-bound usage is approved; safer default: `X g tercatat (parsial)` with tooltip explaining omitted items. `COMPLETE_KNOWN` means complete relative to **logged items**, not proof that the person's daily diet was completely reported.

### 4.2 Range summaries

- `daysWithLogs`: number of days with >=1 active item.
- `daysWithKnownMetric`: number of days with at least one known value for chosen metric.
- `daysWithFullyKnownMetric`: days with logs where selected metric known for **all logged items**.
- Daily means must state denominator explicitly: `averageKnownPerObservedDay` includes only dates with known values; include completeness indicator, never present it as estimated true average intake.
- For a goal-comparison average, optionally restrict to explicitly complete diary days with fully known metric; if insufficient, display unavailable rather than a confident average.
- Historic weekly/monthly summaries are recomputed after edits/deletes, even if offline, without mutating original catalog references.
- No blanket interpretation that consistent logs equal medical adherence.

### 4.3 Historical goals

- Each activated goal has `goalVersionId`, `effectiveFromDiaryDate` and (when superseded) an effective end boundary; exact same-day updates require deterministic tie-break/version semantics.
- Comparison of each diary day uses goal version effective **for that date**. Historical snapshots do not recalculate from current weight.
- If no goal for a date (log-only/needs-review), do not show percent toward goal or remaining.
- If a manual override exists, show its source `manual` and validation state; do not mislabel it as an automatic recommendation.
- Do not average goals with distinct sources without showing that targets changed during period.

## 5. Weight-event domain contract (conceptual, not SQL)

```
WeightEntry {
  id: UUID
  userId: UUID
  measurementAt: ISO timestamp | null
  diaryDate: YYYY-MM-DD
  diaryTimezone: IANA timezone
  weightKg: positive decimal
  note?: string
  createdAt: ISO timestamp
  updatedAt: ISO timestamp
  deletedAt?: ISO timestamp
  syncState: LOCAL_ONLY | PENDING | SYNCING | SYNCED | FAILED | CONFLICT
  revision: integer | opaque version
}
```

- Weight input must be finite, positive, measured in canonical kg. **Sensible range thresholds require medical/product review**; implausible values trigger confirmation or review without pretending to diagnose.
- Unique `id` ensures retries are idempotent. Editing preserves identity and revision; deletion is a tombstone until synced.
- The product must choose whether backdated weight edits trigger recalculation of **current** active goals. PROPOSED: only a new or corrected current/latest effective weight triggers reevaluation; historical weigh-in changes never retroactively rewrite prior goal versions.
- On simultaneous writes from two devices, resolve by documented conflict policy; never silently drop a measurement.

## 6. Auto-recalculation and safety handling

1. Save validated weight entry locally and mark sync state.
2. Determine if it is eligible to be the effective current weight for goal evaluation.
3. Invoke approved Nutrition Engine with complete current user profile, goal configuration, eligibility status and explicit engine version.
4. If engine returns `READY` with approved clinical guardrails, activate a new goal version following effective-date policy (TBD) and sync it idempotently.
5. For `NEEDS_REVIEW`, `UNSUPPORTED`, `NEEDS_INPUT`, `INVALID_INPUT`, or `MACRO_ALLOCATION_CONFLICT`, **do not activate** a newly calculated target. Display status and guidance; do not manufacture fallback values.
6. If user is on manual target, changing weight does not silently erase manual choice; policy for prompting vs auto-overriding manual targets is **OPEN**.
7. Concurrent offline changes must converge to a single documented effective goal version upon sync, with conflicts surfaced.
8. The computation algorithm's parameters remain **clinical-review pending**; this feature spec does not approve them.

## 7. Offline sync, queries, and cache

- Progress reads a *single coherent local view* of entries, dates, goal versions and sync states; do not mix cached goal data with newer unsynced food logs without a visible status.
- Display pending/failed sync banner only when relevant, without hiding local progress.
- Weight writes and food-log edits are saved locally first; use operation IDs / revisions for idempotent server upserts.
- Online reconciliation merges server-authoritative changes with local pending operations; conflict resolution must be specified in `offline-sync-spec.md`.
- Distinguish `SYNCED`, `PARTIALLY_SYNCED`, `LOCAL_ONLY`, `SYNC_FAILED`, `CONFLICT` at feature summary level if needed.
- Cache must be partitioned by authenticated user; logout/account switch must not expose previous user's data.
- No sensitive analytics payloads in error telemetry by default; metrics should be privacy-minimized.
- Ensure offline range queries do not silently omit uncached days: show `data belum dimuat` separate from `no data`.

## 8. View states and user feedback

| State | Display rule | Available action |
|---|---|---|
| First visit, no food logs | Empty chart; explanatory copy | Tambah makanan |
| No weight entries | Empty weight chart | Catat berat badan |
| Logged food with all energy unknown | `Tidak tersedia` | View food details |
| Day with partial nutrient | Known sum + `parsial` | Inspect item data |
| Log-only user | Recorded amounts only, no targets | Open profile goals where allowed |
| Selected range entirely uncached offline | `Data belum tersedia di perangkat` | Retry when online |
| Sync pending | Pending marker | Continue using local data |
| Sync failed | Persistent warning, retry | Retry sync |
| Invalid weight | Inline field error; no save | Correct value |
| Profile no longer eligible | Current target safety status explained | View status / seek appropriate guidance |
| Service failure | Preserve cached views with freshness note | Retry |
| Goal changed during period | Historical change marker / explanation | View goal history |

## 9. Accessibility, performance, and localization

- Graphs require accessible text alternatives: metric, interval, exact observed points, and completeness per point; color must not be the only signal.
- Touch targets and font scaling follow platform accessibility patterns; charts remain usable with screen readers.
- Indonesian number and date formats; units always visible; weight storage remains kg regardless of display setting.
- Avoid dozens of chart renders per keystroke; memoize aggregate selectors and paginate long history as needed.
- Index/query by user + diaryDate; do not download all lifetime logs merely to show the last 7 days.
- Range filters must be consistent with local timezone and accessibility labels.
- Use skeleton/loading only when actually loading; cached content with a refresh status is preferable to a blank loading screen.

## 10. Suggested reusable domain selectors (not implementation mandate)

- `getDailyNutrientSummary(userId, diaryDate)`
- `getRangeNutrientSeries(userId, dateStart, dateEnd, metric)`
- `getWeightSeries(userId, dateStart, dateEnd)`
- `getDiaryCoverage(userId, dateStart, dateEnd)`
- `getGoalVersionForDate(userId, diaryDate)`
- `getPendingSyncSummary(userId)`

All derived data must come from shared canonical models/services, not duplicate calculation code inside chart components. UI components receive view models instead of performing arithmetic on raw database rows.

## 11. Acceptance criteria

- [ ] Food log add/edit/delete updates affected date charts correctly both offline and after sync.
- [ ] `NO_DATA`, `UNKNOWN`, `PARTIAL` and `COMPLETE_KNOWN` display differently and never equate missing with zero.
- [ ] Per-day and range totals use the canonical snapshot and units; energy/macros do not accidentally use a different source than Home.
- [ ] Known-day averages expose their denominator and partial coverage; no fictitious zero-filled daily average.
- [ ] Weight entries support create/edit/delete, dates, proper units, validation, idempotent sync.
- [ ] Automatic goal recalculation preserves historical goal versions; unapproved or failed calculations cannot overwrite active target.
- [ ] Log-only has no target chart percentage.
- [ ] Date range boundaries and timezone changes are tested; day selection routes to the correct diary date.
- [ ] Offline data remains visible, with reliable sync state and per-user isolation.
- [ ] Chart text alternatives pass accessibility checks.
- [ ] Open product and clinical safety items are resolved before production approval.

## 12. Minimum test matrix

| ID | Type | Input / scenario | Expected behavior |
|---|---|---|---|
| PR-T01 | Normal | 7 days with complete energy logs | Correct 7 daily bars and coverage |
| PR-T02 | Normal | Selected range 30 days | Exactly date range requested; no UTC off-by-one |
| PR-T03 | Normal | 90-day range with many food items | Efficient query and deterministic aggregate |
| PR-T04 | Normal | Different protein targets across weeks | Historic date-specific goal context |
| PR-T05 | Normal | Multiple food entries in one day | Totals sum snapshots once each |
| PR-T06 | Normal | View past date from chart | Diary opens selected date |
| PR-T07 | Weight | First weigh-in | Single point visible; no fake trend |
| PR-T08 | Weight | Two weigh-ins same day | Both retained; graph rule applied consistently once approved |
| PR-T09 | Weight | Edit older measurement | Recomputed visualization; no retroactive target corruption |
| PR-T10 | Weight | Delete measurement offline | Tombstone pending, point disappears locally and syncs |
| PR-T11 | Weight | Weight set to zero | Rejected with inline validation |
| PR-T12 | Weight | Extreme but finite weight | Confirm/review path, not silent acceptance or diagnosis |
| PR-T13 | Coverage | All days no logs | `NO_DATA`, no average 0 kcal |
| PR-T14 | Coverage | One logged day in 7 days | One observed day; denominator disclosed |
| PR-T15 | Coverage | Day with partial energy | Partial label; known sum not presented as exact daily total |
| PR-T16 | Coverage | All items missing sodium | Sodium unavailable; not 0 mg |
| PR-T17 | Coverage | User marks day complete (if approved) | Distinct completion vs presence-of-log flag |
| PR-T18 | Exception | Log-only user | No recommendation or percent-to-goal |
| PR-T19 | Exception | Goal changes midrange | Targets dated correctly; no retroactive re-targeting |
| PR-T20 | Exception | Auto engine `NEEDS_REVIEW` | Prior safe goal behavior per policy; no unsafe new activation |
| PR-T21 | Offline | Add log with airplane mode | Local chart updates; pending sync visible |
| PR-T22 | Offline | Retry same weight operation | Exactly one server record |
| PR-T23 | Offline | Sync conflict on weight edit | Conflict surfaced, nothing silently lost |
| PR-T24 | Offline | Switch accounts with local cache | No cross-account data shown |
| PR-T25 | Offline | Older dates not cached | Distinguish unavailable cache vs true no logs |
| PR-T26 | Timezone | Entry near midnight in Indonesia | Stays on correct diary date |
| PR-T27 | Timezone | DST-capable timezone while traveling | Date range and event time still correct |
| PR-T28 | Accessibility | Screen reader on chart | Textual point data and completeness announced |
| PR-T29 | Boundary | Empty goal version for chosen day | No denominator or percent target |
| PR-T30 | Boundary | Nutrient value 0 explicitly known | Show 0, distinguish unknown/null |
| PR-T31 | Performance | Lifetime logs large, last 7 days requested | Bounded query; responsive UI |
| PR-T32 | Data correction | Change a recorded serving | Affected old day recalculates, no catalog overwrite |

## 13. Decision register (do not treat as approved)

| ID | Open decision | Proposed default | Approval needed |
|---|---|---|---|
| PG-D01 | Time presets | rolling 7/30/90 days | Product/UX |
| PG-D02 | Section navigation | Nutrisi / Berat / Konsistensi | Product/UX |
| PG-D03 | Definition of completed day | explicit user confirmation | Product/UX |
| PG-D04 | Frequency denominator | elapsed eligible days in range | Product/UX |
| PG-D05 | Multiple weigh-ins/day chart value | latest timestamp on day; retain all raw events | Product/UX |
| PG-D06 | Backdated weigh-in triggers recalc? | only effective current weight triggers | Product + clinical review |
| PG-D07 | Auto goal activation effective date | start next diary day proposed to avoid mid-day changes | Product + clinical review |
| PG-D08 | Manual goal + weight update | retain manual goal and ask user to review | Product + clinical review |
| PG-D09 | Safety thresholds / reference weights | external expert validation pending | Clinical review |
| PG-D10 | Data export/share chart | out of MVP until privacy policy approved | Product/legal |
| PG-D11 | Timezone reconfiguration policy | preserve original diary dates unless explicit migration | Product/engineering |
| PG-D12 | Conflict resolution across devices | define in offline-sync-spec | Engineering/security |

## 14. Review gates and handoff

**Product/UX:** Approve period semantics, completion definition, weigh-in representation, and what qualifies as a meaningful summary.  
**Clinical/nutrition:** Review all goal comparisons, recalc triggers, safety guardrails and restrictions for unsupported users; no clinical approval asserted here.  
**Legal/privacy:** Confirm collection, storage, export/deletion and retention requirements for body and nutrition logs under applicable Indonesian law.  
**Engineering:** Validate timezone identifiers, idempotent offline sync, conflict and historical effective-date policy, query performance and accessibility.

### Recommended implementation slices (only after the above dependencies are resolved)

1. Canonical daily nutrition aggregation with missingness metadata and unit tests.
2. Progress page skeleton with no-data / partial / log-only states.
3. 7/30/90-day calorie & macro graphs with accessible alternatives.
4. Weight-entry CRUD with offline store, verification and history chart.
5. Consistency summary with explicit denominator and complete-day semantics.
6. Goal-version overlays and automatic-recalculation event integration.
7. Full sync edge-case, accessibility and performance QA.

**No code or database SQL should be generated from this draft as though unresolved decisions were final.**
