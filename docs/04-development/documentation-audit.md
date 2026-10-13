# NUTRASA — Architecture & Documentation Review

**Audit date:** 2026-10-13\
**Result:** DOCUMENTATION BASELINE ASSEMBLED; **NOT** implementation/production sign-off.\
**Method (source review):** The incoming package reviewed Markdown supplied in conversation; it did not inspect the live repository or run migrations. **Repository merge review, 2026-10-13:** inspected the workspace, compared all 20 local Markdown documents against 28 package documents, inspected placeholder routes, and merged documentation with explicit owner approval. No migrations or application changes performed.

**Provenance:** inventory filenames below are historical package labels, not current links. Sections 1–9 preserve the FASE 2 audit and its then-current findings/evidence; they do not describe present repository readiness. See [docs index](../README.md).

## 1. Inventory and disposition

| Source file | Disposition |
|---|---|
| `NUTRASA_MASTER_DEVELOPMENT_ROADMAP.md` | Keep under [docs/00-overview/master-roadmap.md](../00-overview/master-roadmap.md); milestone sequence remains directional |
| `NUTRASA_BUSINESS_RULES_DRAFT_v0.4.md` | Keep as draft [docs/00-overview/business-rules.md](../00-overview/business-rules.md); clinical params blocked |
| `NUTRASA_NUTRITION_ENGINE_SPEC_v0.5.md` | Keep [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md); needs qualified review |
| [onboarding-spec.md](../01-design/onboarding-spec.md) | Use v1.0 baseline, not v0.6 |
| [food-database-spec.md](../02-architecture/food-database-spec.md), [food-logging-spec.md](../03-features/food-logging-spec.md), [dashboard-spec.md](../03-features/dashboard-spec.md) | Keep as feature/data drafts, see conflicts below |
| [progress-spec.md](../03-features/progress-spec.md), [profile-spec.md](../03-features/profile-spec.md), [auth-spec.md](../03-features/auth-spec.md) | Keep, with open decisions tracked |
| [offline-sync-spec.md](../02-architecture/offline-sync-spec.md), [navigation-spec.md](../01-design/navigation-spec.md) | Keep, sync and UX questions pending |
| [design-system.md](../01-design/design-system.md), [home-ui-direction.md](../01-design/home-ui-direction.md), [food-ui-direction.md](../01-design/food-ui-direction.md), [ui-approval-summary.md](../01-design/ui-approval-summary.md) | Keep; [ui-approval-summary.md](../01-design/ui-approval-summary.md) governs provisional visual choices |
| [system-architecture.md](../02-architecture/system-architecture.md) | Historical recommendation; stack superseded by selected ADR |
| `nutrasa-zero-cost-architecture.md` | Selected Rp0 local-development approach |
| [database-schema.md](../02-architecture/database-schema.md), [api-contract.md](../02-architecture/api-contract.md) | Logical draft complete; NOT executable schema/OpenAPI sign-off |
| [product-brief.md](../00-overview/product-brief.md), [feature-list.md](../00-overview/feature-list.md) | Created in this review package |
| [decision-register.md](decision-register.md), [architecture-decisions.md](../02-architecture/architecture-decisions.md), [development-task-board.md](development-task-board.md) | Created in this review package |

## 2. Historical findings requiring reconciliation (FASE 2)

**Superseded:** old email gates, MANUAL/LOG_ONLY modes, sugar alias, unresolved LWW and O-18 scope below are historical. Current [register v2](decision-register-v2.md), [register O-18](decision-register.md), [schema](../02-architecture/database-schema.md), [API](../02-architecture/api-contract.md) and [sync v1.6](../02-architecture/sync-protocol-final-design.md) govern. Product decisions are resolved; implementation, clinical/legal review and technical tests remain OPEN.

| ID | Historical finding | Handling at FASE 2 | Severity at FASE 2 |
|---|---|---|---|
| C-01 | Older system architecture describes managed Postgres and leaves Fastify undecided | ADR-001 overrides: PostgreSQL + Fastify **local** approved | Resolved via decision |
| C-02 | Historical Food Logging aliases differed from schema/API | Four aliases corrected in the merged pseudotype; canonical `fat_g`, `total_sugar_g`, `saturated_fat_g`, `trans_fat_g` | Resolved in documentation; implementation/types not generated |
| C-03 | Onboarding allows proceeding while email unverified, but draft spec proposes blocking final server commit and dashboard | Access policy **open**; do not silently enforce suggested matrix | Product/security P0 |
| C-04 | Auto-recalculation on weight change vs user manual goal overrides | Define deterministic precedence, effective dates and stale-calculation handling | Product/clinical P0 |
| C-05 | Auto targets requested but numerical presets, reference weight and safety thresholds are not validated | Do not ship automatic advice until qualified review/test approval | Clinical P0 |
| C-06 | Log-only available to unsupported users, but legal eligibility for minors and sensitive users is unresolved | Do not infer broad eligibility from log-only mode | Legal P0 |
| C-07 | Offline draft locally and sensitive body measurements | Select secure storage/encryption and logout handling with threat model | Security P0 |
| C-08 | Multi-device collisions, delete tombstones and sync cursor expiry are not signed off | Sync design draft; block multi-device production release | Tech P0 |
| C-09 | 100-food source quality and third-party API storage permissions | Require source-specific rights/attribution review before import/publication | Legal/data P0 |
| C-10 | Meal copy, recipe/edit historical snapshot and incomplete nutrients need cross-endpoint invariants | Add shared contract tests | Tech P0 |
| C-11 | Approved UI mockups sometimes show icons/AI/non-final mascot and dummy values | UI approval summary + authentic assets take precedence | Tracked |
| C-12 | Provider implementation assumptions for Google/Apple in Expo not validated against development build and Firebase flow | Integration spike and platform acceptance tests required | Tech P0 |
| C-13 | Current material uses words “final” or “approved” differently | Distinguish *product-approved*, *design provisional*, *technical draft*, *external-review blocked* | Resolved in documentation |
| C-14 | No versioned executable SQL or machine-readable OpenAPI contract yet | Defer until contract decisions are signed; tasks defined | Next stage |
| C-15 | Nutrition Engine used plural sugar alias while schema/API use singular | Corrected field references to `total_sugar_g`; sugar meaning and all formulas unchanged | Resolved in documentation |
| C-16 | Roadmap claimed food logging/progress already worked | Current source contains only Expo layouts and a placeholder route; separated PLANNED, DESIGN, SELECTED STACK and IMPLEMENTED statuses | Resolved in documentation |
| C-17 | Recipe/favorite priority differs: roadmap post-MVP, review scope P0, API P1 | O-18 remains OPEN; no release priority chosen during merge | Owner decision required |
| C-18 | Engine/business rules call goal weight optional despite approved onboarding | Conditionally required for cutting/bulking per OB-007; not mandatory for maintenance/general tracking | Resolved from documented approval |
| C-19 | Snapshot/history invariant still labelled only proposed in some drafts | Owner merge constraints require snapshot and preserved history; technical versioning/effective-date choices remain open | Invariant approved; implementation details open |

## 3. Historical precedence rules (FASE 2)

For current work use root [AGENTS.md](../../AGENTS.md), Decisions 01–10/O-18 and final v1.6 rules as indexed in [docs/README.md](../README.md). The precedence record below is preserved as history.

1. Explicit user-approved product decisions in chat > suggestions in old drafts.
2. [architecture-decisions.md](../02-architecture/architecture-decisions.md) for chosen stack and trust boundary.
3. [database-schema.md](../02-architecture/database-schema.md) + [api-contract.md](../02-architecture/api-contract.md) for canonical field naming; update conflicting pseudotypes.
4. [ui-approval-summary.md](../01-design/ui-approval-summary.md) for approved provisional visual direction; genuine branding files outrank generated mockups.
5. [decision-register.md](decision-register.md) for unresolved issues; an example number or UI placeholder is NOT approval.
6. For clinical, legal, and security-critical rules, external qualified approval gates override implementation convenience.

## 4. Completeness check
- Covered: identity, onboarding, catalogue, recipe, logging, dashboard, progress, profile, local database, API, sync, navigation, UI styling.
- Added: product brief, feature priority map, approved architecture ADR, cross-document issue inventory, decision register, implementation task board, docs index and review gate checklist.
- Not yet delivered as implemented artifacts: SQL migrations, OpenAPI YAML, API server, mobile screens, seed dataset, tests, permissions matrix signed off, approved nutrition parameter set, legal source clearance.
- **Important:** Architecture & Documentation Review is closed as an **audit deliverable**, not as authorization to begin all features or launch.

## 5. Minimum sign-off before coding each vertical slice
1. No open P0 conflict for that slice.
2. Typed API contract and model fields are identical.
3. Explicit failure/offline and state policy.
4. Acceptance tests and owners known.
5. Security, legal, nutrition gates identified; unsafe calculations are feature-flagged or not implemented until reviewed.

## 6. Review completion criteria
- This package is present in repository and read by developer/agent.
- Owner resolves open product choices from decision register.
- Source docs C-02 and C-15 corrected during documentation merge; technical sign-off remains pending before generating implementation types.
- Database schema and endpoint contracts receive technical sign-off before migration/OpenAPI generation.

## 7. Repository merge disposition (2026-10-13)

- Added 11 genuinely new documents; established three canonical paths for identical existing source documents.
- Preserved the three legacy paths as short relative-link redirect notes; normalized business-rules and food-database filename capitalization.
- Retained local asset-placement, visual-reference guidelines and design-system draft. UI approvals and all branding/mockup/reference files retained.
- Reconciled nutrient names, conditional goal weight, selected local stack, snapshot/history status, and roadmap implementation claims. Equations, example clinical coefficients and their review status were not changed.
- O-01–O-17 remain open; added O-18 rather than choosing recipe/favorite priority.
- Existing document references become relative links where a target exists. Future deliverables are marked planned; historical source labels remain labelled provenance rather than pretending those files exist.
- Updated the final docs index without listing the extraction folder as a canonical documentation section.
- No app source, dependencies, Firebase configuration, production configuration or Git history modified. No commit or staging performed by this task.
- Merge output is ready for owner documentation review, not coding/production sign-off.

## 8. Verification evidence (2026-10-13)

| Check | Result |
|---|---|
| Final hierarchy | 34 Markdown documents: 31 canonical documents including index, and 3 legacy redirect notes |
| Relative references | All final Markdown relative links, directory links and heading anchors resolve with the correct filename capitalization; no canonical link targets the extraction folder |
| Remaining inline `.md` names | Only explicitly planned optional deliverables or labelled historical source names; not presented as existing files |
| Nutrient contract | Schema/API tables and Food Logging pseudotype contain the same 11 keys in the same order; no obsolete nutrient alias remains in final documentation |
| Nutrition semantics | Engine and Business Rules formula lines unchanged from pre-merge originals; unknown remains null and historical snapshots/goals remain protected |
| Open decisions | O-01–O-17 retained, O-18 added; recipe/favorite priority not selected |
| UI approval | Approval content preserved; only document-link formatting and the nonexistent Home approval-note reference corrected |
| Branding / mockups / visual references | SHA-256 unchanged: 29 branding files, 6 approved mockups, 14 visual reference files |
| Extraction package | All 29 source files unchanged; folder retained |
| Change scope | SHA-256 comparison confirms 120 protected files unchanged, including app source, config, lockfile, source package and assets; additions/edits are Markdown only |
| Content preservation | All 20 original docs mapped to final counterparts; 35 intentionally replaced original lines reviewed against authorized corrections. Original drafts also backed up outside repository before edits |
| Git whitespace | `git diff --check` passes; new/changed Markdown hard breaks use backslashes instead of trailing spaces |
| Git history / index | Branch remains docs/architecture-review; staged diff empty; no commit, push, merge, reset or clean performed |
| Runtime / external services | Not tested or changed in this documentation-only task; external prices, legal policies and clinical parameters not newly validated |

**Git interpretation:** normal `git diff --stat` omits untracked canonical additions, so large deletion counts in the three legacy files represent content moved to canonical paths, not dropped specs. `git -c core.ignorecase=false status --short` exposes the two case-only filename changes on Windows as old paths removed/new paths untracked until staging. No Git configuration was changed. Owner should include the intended canonical/legacy documents and review case-only renames when preparing Commit 02; the incoming source folder is not a final documentation section.

## 9. Final per-file disposition

All paths below are under the final docs directory. New documentation and canonical relocation are distinguished from implementation work.

| Final document | Disposition / reason |
|---|---|
| [README.md](../README.md) | New complete index, reading order, status legend and canonical/legacy distinction |
| [product-brief.md](../00-overview/product-brief.md) | New; recipe/favorite timing OPEN, log-only eligibility not unconditional |
| [feature-list.md](../00-overview/feature-list.md) | New; recipe/favorite P0 claim removed in favor of O-18 |
| [business-rules.md](../00-overview/business-rules.md) | Case normalized; conditional goal weight, required history/snapshot, relative reference |
| [master-roadmap.md](../00-overview/master-roadmap.md) | Canonical relocation; corrected placeholder/plan/design status and OPEN release scope |
| [MasterDevelopment-Roadmap.md](../00-overview/MasterDevelopment-Roadmap.md) | Preserved legacy path, relative redirect to canonical roadmap |
| [asset-placement-guide.md](../01-design/asset-placement-guide.md) | Local-only guidance retained; reference formatting only |
| [design-system-draft.md](../01-design/design-system-draft.md) | Local-only proposal retained; fixed asset guide reference |
| [visual-reference-guidelines.md](../01-design/visual-reference-guidelines.md) | Local-only guidelines retained; reference formatting only |
| [design-system.md](../01-design/design-system.md) | Existing content retained; reference formatting only |
| [food-ui-direction.md](../01-design/food-ui-direction.md) | Existing content retained; reference formatting only |
| [home-ui-direction.md](../01-design/home-ui-direction.md) | Relative links and explicit pointer to latest Home approval; no new design approval |
| [navigation-spec.md](../01-design/navigation-spec.md) | Existing behavior retained; reference formatting only |
| [onboarding-spec.md](../01-design/onboarding-spec.md) | Existing behavior/open matrix retained; available drafts no longer marked to-create; relative links |
| [ui-approval-summary.md](../01-design/ui-approval-summary.md) | Approval retained; relative links and nonexistent historical note reference corrected |
| [architecture-decisions.md](../02-architecture/architecture-decisions.md) | New ADR baseline; relative links |
| [system-architecture.md](../02-architecture/system-architecture.md) | New historical analysis with selected stack explicit; cloud alternatives deferred |
| [zero-cost-architecture.md](../02-architecture/zero-cost-architecture.md) | New; chosen local stack and current route location clarified; hosting/integration details open |
| [database-schema.md](../02-architecture/database-schema.md) | Canonical nutrient reconciliation note, OPEN recipe/favorite timing, existing API draft referenced |
| [api-contract.md](../02-architecture/api-contract.md) | Existing field/endpoint contracts retained; recipe/favorite P1 labels explicitly historical draft; relative links |
| [food-database-spec.md](../02-architecture/food-database-spec.md) | Case normalized; selected stack, OPEN recipe/favorite priority, relative links |
| [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md) | Canonical relocation; singular sugar field and conditional goal weight, formulas unchanged |
| [Apps-Engine-spec.md](../02-architecture/Apps-Engine-spec.md) | Preserved legacy path, relative redirect to canonical engine |
| [offline-sync-spec.md](../02-architecture/offline-sync-spec.md) | Canonical relocation; full rules/open decisions retained, relative links only |
| [legacy offline-sync-spec.md](../03-features/offline-sync-spec.md) | Preserved legacy path, relative redirect across directories |
| [auth-spec.md](../03-features/auth-spec.md) | Firebase selected, SDK/session/provider details still open; relative links |
| [dashboard-spec.md](../03-features/dashboard-spec.md) | Existing behavior retained; reference formatting only |
| [food-logging-spec.md](../03-features/food-logging-spec.md) | Four nutrient aliases corrected, OPEN recipe/favorite timing, relative links |
| [progress-spec.md](../03-features/progress-spec.md) | Decision register reference fixed; approved arc pattern referenced, data behavior retained |
| [profile-spec.md](../03-features/profile-spec.md) | New; history invariant owner-approved, auth/sync drafts available, relative links |
| [documentation-audit.md](documentation-audit.md) | New; source audit retained and repository merge findings/evidence added |
| [decision-register.md](decision-register.md) | New; O-01–O-17 retained, O-18 OPEN and owner merge constraints recorded |
| [development-task-board.md](development-task-board.md) | New; existing foundation separated from planned integrations, recipe/favorite scheduling blocked on O-18 |
| [review-signoff-checklist.md](review-signoff-checklist.md) | New; alias documentation fix recorded complete, technical/product/release approvals still unchecked |
