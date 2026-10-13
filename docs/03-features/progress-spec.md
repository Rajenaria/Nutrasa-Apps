# NUTRASA — Progress & Insights Feature Specification

**Version:** 1.1 (planning draft)  
**Date:** 13 October 2026  
**Repository path:** [docs/03-features/progress-spec.md](progress-spec.md)\
**Status:** Product decisions marked **AGREED**; implementation defaults **PROPOSED**; clinical and data-governance rules **REVIEW REQUIRED**. Not approved for production without gates below.

> **Purpose:** Define what Progress measures, how it derives reliable trends from food logs, body-weight records, and goal history, and what the user sees when information is missing, partial, offline or revised. Progress is a *read model*, not an alternative Nutrition Engine.

## 0. Dependencies and decision authority

Read alongside:
- [docs/00-overview/business-rules.md](../00-overview/business-rules.md)
- [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md)
- [docs/02-architecture/food-database-spec.md](../02-architecture/food-database-spec.md)
- [docs/03-features/food-logging-spec.md](food-logging-spec.md)
- [docs/03-features/dashboard-spec.md](dashboard-spec.md)
- [docs/01-design/onboarding-spec.md](../01-design/onboarding-spec.md)

When a conflict exists, explicit owner-approved decisions and documented newer contracts take priority. Record discrepancies in [decision-register.md](../04-development/decision-register.md); do not silently invent behavior.

**Approved visual baseline:** use three concentric semicircular macro arcs in Progress, distinct from Home's three separate circular macro rings. See [ui-approval-summary.md](../01-design/ui-approval-summary.md); this is provisional visual approval, not an implemented chart.

### AGREED product boundaries

1. Progress MVP includes **calorie intake, protein/carbs/fat, weight trend, and logging consistency**.
2. Users can inspect daily, weekly and monthly periods, including past dates.
3. Nutrition values come from *saved food-log nutrient snapshots* and selected portion amounts; unknown nutrients remain unknown, never zero by assumption.
4. MVP serves supported adults 18+ with automatic targets only; no active LOG_ONLY/manual mode. Missing historical or pending targets never become numeric zeros.
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
| PR-05 | Historical target is missing or pending | Intake data stays distinguishable from unavailable target; no fabricated percentage |
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
   - **Konsistensi**: Hari Aktif (>=1 nondeleted log), optional Selesai Mencatat, and no-data days as separate measures.
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

- Distinguish NO_LOG, HAS_LOGS, and optional USER_MARKED_COMPLETE (Selesai Mencatat); completion is separate from nutrient completeness.
- A day with `NO_LOG` means **no data**, never `0 kcal consumed`.
- Logging frequency = number of distinct diary dates with >=1 non-deleted food log / eligible dates in selected range (if denominator policy approved).
- Optional diary completion rate is distinct from Hari Aktif/log frequency and nutrient coverage; no inference of unhealthy behavior from missing completion.
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

UNKNOWN displays —, not zero. PARTIAL nonnegative totals display >= knownSum with Data parsial. COMPLETE_KNOWN is relative to logged items, not proof the entire diet/day was recorded; Selesai Mencatat does not change nutrient coverage.

### 4.2 Range summaries

- `daysWithLogs`: number of days with >=1 active item.
- `daysWithKnownMetric`: number of days with at least one known value for chosen metric.
- `daysWithFullyKnownMetric`: days with logs where selected metric known for **all logged items**.
- Daily means must state denominator explicitly: `averageKnownPerObservedDay` includes only dates with known values; include completeness indicator, never present it as estimated true average intake.
- For a goal-comparison average, optionally restrict to explicitly complete diary days with fully known metric; if insufficient, display unavailable rather than a confident average.
- Historic weekly/monthly summaries are recomputed after edits/deletes, even if offline, without mutating original catalog references.
- No blanket interpretation that consistent logs equal medical adherence.

### 4.3 Historical goals

- Activated automatic goal versions retain effective UTC intervals; compare each diary date using the version effective at local day end per database-schema/Decision 03 final. Boundary fixtures and timezone tests remain OPEN.
- Comparison of each diary day uses goal version effective **for that date**. Historical snapshots do not recalculate from current weight.
- Missing historical or pending/review targets have no percent-to-goal or remaining value; not a LOG_ONLY mode.
- MVP uses AUTO targets only; manual override is post-MVP and must not be shown as an active option.
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
  syncState: LOCAL_ONLY | PENDING | SYNCING | SYNCED | FAILED
  revision: integer | opaque version
}
```

- Weight input must be finite, positive, measured in canonical kg. **Sensible range thresholds require medical/product review**; implausible values trigger confirmation or review without pretending to diagnose.
- Weight ID remains stable across edits; deduplicate retries by UNIQUE(owner_user_id, operation_id) plus identical identity/payload, not by entity ID alone. Deletion yields a tombstone; delayed UPDATE returns ENTITY_DELETED.
- D03: latest valid measured_at determines the current weight source. Backdated records do not replace a newer source; edit/delete of the reference triggers reevaluation. Historical target versions remain unchanged; fixtures/tests OPEN.
- Two-device edits follow server-ordered LWW, with persistent device sequence and receipts. Keep independent weight records; newest valid measured_at determines the weight source, not phone edit-arrival assumptions.

## 6. Auto-recalculation and safety handling

1. Save validated weight entry locally and mark sync state.
2. Determine if it is eligible to be the effective current weight for goal evaluation.
3. Invoke approved Nutrition Engine with complete current user profile, goal configuration, eligibility status and explicit engine version.
4. Activate a reviewed READY target only through server validation/commit, forward-effective with immutable history per Decision 03/schema. Offline values remain provisional; fixtures/integration tests OPEN.
5. For `NEEDS_REVIEW`, `UNSUPPORTED`, `NEEDS_INPUT`, `INVALID_INPUT`, or `MACRO_ALLOCATION_CONFLICT`, **do not activate** a newly calculated target. Display status and guidance; do not manufacture fallback values.
6. Manual target/override is post-MVP; latest valid weight triggers automatic reevaluation in MVP while preserving historical target versions.
7. Offline edits converge by server-ordered LWW; server activates a single valid forward-effective target version under per-user locking. No normal stale-edit conflict modal.
8. The computation algorithm's parameters remain **clinical-review pending**; this feature spec does not approve them.

## 7. Offline sync, queries, and cache

- Progress reads a *single coherent local view* of entries, dates, goal versions and sync states; do not mix cached goal data with newer unsynced food logs without a visible status.
- Display pending/failed sync banner only when relevant, without hiding local progress.
- Weight writes and food-log edits are saved locally first; use operation IDs / revisions for idempotent server upserts.
- Reconcile server changes then reapply pending operations in device order using sync-protocol-final-design.md; retain outbox through CURSOR_EXPIRED resync.
- Distinguish SYNCED, PARTIALLY_SYNCED, LOCAL_ONLY and SYNC_FAILED; actionable rejection is separate from normal LWW reconciliation.
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
| Missing historical/pending target | Recorded intake, no fabricated target or percentage | Explain state; not LOG_ONLY access |
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
- [ ] Pending/missing historical targets have no fabricated percentage; LOG_ONLY/manual mode not active MVP.
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
| PR-T17 | Coverage | Optional Selesai Mencatat | Distinct from Hari Aktif and nutrient coverage; no unknown-to-zero conversion |
| PR-T18 | Exception | Missing historical/pending target | No fabricated recommendation or percent-to-goal |
| PR-T19 | Exception | Goal changes midrange | Targets dated correctly; no retroactive re-targeting |
| PR-T20 | Exception | Auto engine `NEEDS_REVIEW` | Prior safe goal behavior per policy; no unsafe new activation |
| PR-T21 | Offline | Add log with airplane mode | Local chart updates; pending sync visible |
| PR-T22 | Offline | Retry same weight operation | Exactly one server record |
| PR-T23 | Offline | Two-device weight edit | Server-ordered LWW; independent measurements retained; tombstone/receipts enforced |
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
| PG-D03 | Selesai Mencatat | APPROVED D10: optional explicit confirmation, separate from >=1-log Hari Aktif and coverage | Edit/delete marker behavior OPEN |
| PG-D04 | Frequency denominator | elapsed eligible days in range | Product/UX |
| PG-D05 | Multiple weigh-ins/day chart value | latest timestamp on day; retain all raw events | Product/UX |
| PG-D06 | Backdated weight recalc | D03: only reevaluate latest valid reference; backdated cannot arbitrarily replace it or rewrite history | Boundary fixtures/clinical review OPEN |
| PG-D07 | Auto goal effective time | Design: server activation forward only; daily comparison at local day end per schema/Decision 03; fixtures/tests OPEN | Engineering + clinical review |
| PG-D08 | Manual goal + weight update | RESOLVED MVP scope: manual post-MVP; automatic reevaluation preserves history | Future manual safety policy OPEN |
| PG-D09 | Safety thresholds / reference weights | external expert validation pending | Clinical review |
| PG-D10 | Data export/share chart | out of MVP until privacy policy approved | Product/legal |
| PG-D11 | Timezone reconfiguration policy | preserve original diary dates unless explicit migration | Product/engineering |
| PG-D12 | Cross-device resolution | RESOLVED design: server-ordered LWW, per-owner idempotency and transactional per-user cursor | Concurrency verification OPEN |

## 14. Review gates and handoff

**Product/UX:** Period semantics, weigh-in graph representation and summary presentation remain review items. D10 optional completion and >=1-log Hari Aktif are settled; edit/delete marker details remain OPEN.
**Clinical/nutrition:** Review all goal comparisons, recalc triggers, safety guardrails and restrictions for unsupported users; no clinical approval asserted here.  
**Legal/privacy:** Confirm collection, storage, export/deletion and retention requirements for body and nutrition logs under applicable Indonesian law.  
**Engineering:** Validate timezone identifiers, idempotent offline sync, conflict and historical effective-date policy, query performance and accessibility.

### Recommended implementation slices (only after the above dependencies are resolved)

1. Canonical daily nutrition aggregation with missingness metadata and unit tests.
2. Progress skeleton with no-data, partial and pending/unavailable target states; no active LOG_ONLY/manual mode.
3. 7/30/90-day calorie & macro graphs with accessible alternatives.
4. Weight-entry CRUD with offline store, verification and history chart.
5. Consistency summary with explicit denominator and complete-day semantics.
6. Goal-version overlays and automatic-recalculation event integration.
7. Full sync edge-case, accessibility and performance QA.

**No code or database SQL should be generated from this draft as though unresolved decisions were final.**
