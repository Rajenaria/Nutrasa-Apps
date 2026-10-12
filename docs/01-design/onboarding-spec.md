# NUTRASA — Onboarding Specification

**Version:** 1.0 (product decisions consolidated; gated technical/clinical/legal dependencies)  
**Date:** 2026-10-13  
**Path:** `docs/01-design/onboarding-spec.md`  
**Platform:** React Native + Expo + Expo Router  
**Status:** FINAL FOR PRODUCT FLOW / NOT CLEARED FOR PRODUCTION (see gates)

> This document is the developer reference for onboarding. 'Final' means the agreed product decisions have been consolidated. It does **not** imply nutrition parameters, legal disclosures, authentication provider configuration, or security controls have passed external reviews. Do not fabricate missing values.

## 0. Status legend and precedence

- **APPROVED:** explicit product decision by owner in discussion.
- **SPECIFIED:** design/engineering decision recommended here for coherent implementation; confirm in technical review.
- **CLINICAL REVIEW:** nutrition/medical professional must review before automated targets reach real users.
- **LEGAL REVIEW:** Indonesia privacy and store compliance legal review needed.
- **TECH REVIEW:** dependent on actual auth/backend/Expo SDK selection or security testing.
- **BLOCKED:** do not ship/infer defaults until prerequisite is satisfied.
- If `nutrition-engine-spec.md` has different numerical candidates, treat them as **unapproved**, not as an overriding rule. Nutrition engine owns formulas; this document owns onboarding orchestration.
- `business-rules.md` is the source for global food and nutrition principles. Document conflicts should be logged; no silent assumption by Codex.

## 1. Product decisions (approved)

| ID | Decision | Status |
|---|---|---|
| OB-001 | Authentication precedes personalized onboarding | APPROVED |
| OB-002 | Initial sign-in: email, Google, Apple; username optional (not an auth method by itself) | APPROVED product scope; TECH REVIEW |
| OB-003 | Email/password accounts may continue onboarding unverified; selected account operations restricted until verified | APPROVED; restriction matrix SPECIFIED below |
| OB-004 | One overall activity-level question; do not double-count exercise | APPROVED |
| OB-005 | Interactive visual onboarding, back navigation, progress shown | APPROVED principle |
| OB-006 | Body-type illustrations optional after body measurements and cannot affect calculations | APPROVED |
| OB-007 | Goal weight required for cutting and bulking; not mandatory for maintenance/general tracking | APPROVED |
| OB-008 | Name/display name/username optional later in Profile | APPROVED |
| OB-009 | Draft saved locally during onboarding; sync/send to server only after completion | APPROVED |
| OB-010 | Consent information at registration with additional data-use notice before body measurements | APPROVED product timing; LEGAL REVIEW for valid consent mechanism |
| OB-011 | Eligible nutrition target activates automatically once fully validated, no mandatory plan-confirmation screen | APPROVED; CLINICAL REVIEW of thresholds |
| OB-012 | Unsupported profiles use log-only without automatic recommendation | APPROVED |
| OB-013 | Calculator for eligible adults only at MVP; special medical/physiological groups unsupported | APPROVED |
| OB-014 | Nutrition target presets determined by profile; fat 25–30% adaptive; protein uses reference weight and goal; carbohydrates remainder | APPROVED approach; CLINICAL REVIEW for numeric rules |
| OB-015 | Automatic recalculation on changed weight, gated by safety checks and target history | APPROVED; SPECIFIED activation safeguards |
| OB-016 | Offline-tolerant food logging, partial nutrient data permitted and marked | APPROVED global product scope |

## 2. Goals, non-goals, and key UX principles

**Goals:** First-time user can authenticate, understand data processing, enter enough data for an eligible nutrition estimate, or safely start log-only; interrupt/resume onboarding; reach usable home screen with clear target provenance.

**Non-goals for this onboarding module:** full food search/logging UI, dietary diagnosis, pediatric/pregnancy/lactation/condition-specific calculation, AI features, premium purchase, notification permission, mandatory photo/body-type selection.

**Principles:** show one actionable question per step or small related group; explain units and why data is requested; nonjudgmental microcopy; no simulated calculation progress; accessibility labels; no dark patterns; instant skips only for explicitly optional fields.

## 3. Canonical routing and gates

```text
Launch / native splash → restore auth session + local state
├─ No valid session → Welcome → Login/Register
│  ├─ Email/password (verification may be pending)
│  ├─ Continue with Google
│  └─ Continue with Apple (platform-specific availability)
└─ Valid session
   ├─ Onboarding complete, valid server account → Home (normal or log-only)
   ├─ Partial onboarding (local draft for same user) → Resume onboarding
   └─ No onboarded profile → Begin onboarding

Onboarding:
Goal → Age/eligibility → Body metrics → Optional visual body type
→ Overall activity → Goal weight (cut/bulk only)
→ Eligibility/special-condition disclosure/check
→ [eligible] Calculate → auto-activate safe plan → save complete profile → Home
→ [unsupported] log-only setup → save complete profile → Home (no suggested targets)
→ [needs review / invalid] correction/help state; never invent targets
```

**Critical clarification:** Server must know account onboarding completion before a second device can enter Home. A draft exists **only locally** until completion. Therefore, an authenticated session without a completed server profile should return to onboarding, even if the device has no local draft. Do not mark complete remotely while offline and silently assume it synced.

### 3.1 Route map (conceptual, Expo Router)

- `(auth)/welcome`, `(auth)/sign-in`, `(auth)/register`, `(auth)/email-verification`.
- `(onboarding)/goal`, `/age`, `/measurements`, `/body-type`, `/activity`, `/goal-weight`, `/eligibility`, `/result`, `/sync-pending`.
- `(tabs)/index` (Home) only if session and confirmed completed profile are present; `LOG_ONLY` is a valid completion mode.
- Protected routes are **navigation UX**, never a substitute for server-side authorization.
- Implementation may change route files to fit chosen Expo SDK; keep screen logic under `src/features/onboarding/` and route wrappers lightweight.

## 4. Screen-by-screen specification

| Step | Screen | UI / Inputs | Required? | Next / branches |
|---|---|---|---|---|
| S00 | Splash & session gate | Brand splash, brief loading only while restoring state | Automatic | Login / Resume / Home |
| S01 | Welcome/auth | Sign in, register, password recovery, provider errors | Authentication required | Account created / session loaded |
| S02 | Notice of data use | Concise purposes, privacy policy link, additional notice before body metrics | Required acknowledgement/consent mechanism TBD LEGAL | Goal |
| S03 | Primary goal | Cutting / maintenance / bulking / muscle gain / general tracking; define mapping to engine | Yes | Age |
| S04 | Age | Date of birth or age; age policy, timezone and precision | Yes for calculator | Under 18 → log-only eligibility branch |
| S05 | Body measurements | Current weight kg, height cm, and required formula parameter with transparent explanation | Required only for automatic plan | Body type |
| S06 | Visual body type | Illustrated options and “Lewati”; no engine effect | Optional | Activity |
| S07 | Overall activity | One overall activity level, plain descriptions with work/exercise examples | Required for automatic plan | Goal weight |
| S08 | Goal weight | Target kg for cutting/bulking; explicit intended goal direction | Conditional required | Eligibility |
| S09 | Eligibility | Clear questions/notice for unsupported conditions, opt-out path | Required eligibility resolution for automatic plan | Calculate / Log-only |
| S10 | Calculation state | Deterministic engine, loading only if actually running | Eligible users | Result / invalid / needs review |
| S11 | Auto-activation/result | Show target kcal and P/C/F, “estimasi”, method/version, edit later, explanatory notice | Automatic if engine returns READY | Persistence |
| S12 | Log-only explanation | No automatic calorie/macro goal; can log food; how to access supported plan later | Unsupported | Persistence |
| S13 | Save/sync completion | Persist server profile once; retry on errors, show pending state | Successful server acknowledgement | Home |

**Age and special-condition path:** If outside calculator scope, avoid collecting unnecessary measurements and goal weight; offer log-only mode early. General tracking must not accidentally create a cutting/bulking target. Where a disclosure is declined or eligibility unknown, no automatic plan.

**Auth UI nuance:** username is a profile/display handle later, not a substitute for email/Google/Apple login in MVP. Email verification is applicable to email/password; provider token validation and trust are backend responsibilities. Apple provider availability and store requirements need TECH REVIEW.

## 5. Form fields & normalized contract (conceptual)

| Field | Example type | Purpose | Condition |
|---|---|---|---|
| `user_id` | opaque account ID | Scope local draft | Required after authentication |
| `flow_version` | string | Resume/migrate draft | Required |
| `primary_goal` | enum | Preset selection | Required |
| `date_of_birth` or `age` | validated date/int | Adult eligibility and calculation | Required for auto |
| `height_cm` | decimal | RMR estimate | Auto only |
| `weight_kg` | decimal | RMR + goal tracking | Auto only |
| `formula_parameter` | explicit enum / supported alternative | RMR suitability | Auto only; not inferred from gender identity |
| `visual_body_type` | nullable enum | Cosmetic preference | Optional |
| `activity_level` | enum | One factor class | Auto only |
| `target_weight_kg` | nullable decimal | Cutting/bulking goal | Conditionally required |
| `eligibility_answers` | minimal flags | Unsupported routing | Minimize collection; LEGAL review |
| `notice_version` / `consent_record` | version, timestamp, evidence | Compliance audit | LEGAL REVIEW |
| `draft_updated_at` | timestamp | Resume ordering | Local required |
| `calculation_version` | string | Calculation reproducibility | Upon auto plan |
| `plan_status` | enum | READY / NEEDS_REVIEW / etc | Upon calculation |
| `onboarding_mode` | `AUTO_PLAN` / `LOG_ONLY` | Home configuration | Completion |
| `onboarding_completed_at` | timestamp | Authoritative completion | On server ack |

Avoid embedding credentials, access tokens, or comprehensive medical information in a draft. Birth date vs age-only and retention must be minimized in legal review. Each numeric entry retains typed value in the input component but normalizes to canonical units prior to evaluation.

## 6. State machines (do not merge into one boolean)

### 6.1 Authentication state

`RESTORING_SESSION`, `SIGNED_OUT`, `SIGNED_IN_UNVERIFIED_EMAIL`, `SIGNED_IN_VERIFIED`, `AUTH_ERROR`.

Do not infer verified email from local cache; source is the trusted auth provider/backend. Invalid/revoked sessions transition to signed out after handling draft safely.

### 6.2 Onboarding state

`NOT_STARTED`, `IN_PROGRESS`, `CHECKING_ELIGIBILITY`, `CALCULATING`, `NEEDS_CORRECTION`, `NEEDS_REVIEW`, `UNSUPPORTED`, `COMPLETION_PENDING_SYNC`, `COMPLETED_AUTO_PLAN`, `COMPLETED_LOG_ONLY`.

`UNSUPPORTED` is a branch to log-only explanation, not a permanent dead end. `COMPLETION_PENDING_SYNC` is **not** completed. Persist draft after meaningful changes and on app lifecycle transitions as technically feasible, without assuming lifecycle hooks always fire.

### 6.3 Nutrition result states

`READY`, `NEEDS_INPUT`, `NEEDS_REVIEW`, `UNSUPPORTED`, `INVALID_INPUT`, `MACRO_ALLOCATION_CONFLICT`.

Only `READY` (from a clinically approved engine configuration) can activate an automatic plan. `NEEDS_REVIEW` is not auto-approved. For a numeric engine version not yet clinically cleared, use dummy/test profiles only; production targeting must be disabled.

## 7. Validation and safety gates

### 7.1 Technical validation (implementation-ready principles)

- Numeric fields parse Indonesian-style decimal input if supported, with clear standardized decimal handling. Empty, NaN, Infinity, zero/negative for anthropometrics are invalid.
- Show inline, accessible error message; preserve prior valid values on back/forward.
- A malformed DOB, future date, impossible age, and broken goal-direction relations block auto calculation.
- Do not infer an RMR constant from cosmetic body type or gender identity; explain what parameter is needed.
- Goal weight for cut/bulk cannot be skipped; for maintenance or general tracking it can be omitted.
- For strongly implausible anthropometric values, ask re-entry or flag `NEEDS_REVIEW`; do not label clinically unsafe solely from a guessed threshold.
- Formula results must be finite, positive, consistent, reproducible and versioned; no arbitrary fallback target.
- User can edit earlier answer; invalidate stale calculated result and recompute before completion.

### 7.2 Clinical gate (CLINICAL REVIEW / BLOCKED FOR PRODUCTION)

- Minimum supported adult age, special-population exclusions, anthropometric ranges, target-weight direction thresholds, safe calorie adjustment presets, activity mapping, protein reference weight/coefficients, adaptive 25–30% fat rule, macro minimums, pregnancy/lactation and other contraindications.
- Assess underweight or potentially unsafe goal changes via reviewed rules, not BMI alone as a simplistic diagnosis.
- No automatically produced target for unsupported, declined eligibility, inconsistent physiological parameters, or failed review.
- Auto-plan after onboarding and future auto-recalculations use **the same reviewed safety gate**, not separate looser implementations.

### 7.3 Legal gate (LEGAL REVIEW / BLOCKED UNTIL COMPLIANT)

- Registration includes appropriate privacy disclosure and lawful processing basis; the owner elected registration-time consent/notice with specific additional notice before body measurements. **UI timing is not proof of legally valid consent**.
- Determine whether express, specific, separate consent is necessary for health-related body data; record version, timestamp, withdrawal process and retention policy, subject to Indonesian PDP law review.
- Support children responsibly even though calculator is adults-only: child account eligibility and parental/guardian consent rules are separately unresolved; do not silently open ordinary accounts to minors.
- Define deletion/export/access rights, security incidents, hosting/data transfer and privacy policy before release.

## 8. Email verification restriction matrix (SPECIFIED pending auth review)

| Capability | Email unverified | Verified email / trusted social auth |
|---|---|---|
| Sign in & recover session | Allowed with valid authentication | Allowed |
| Fill/resume local onboarding | Allowed | Allowed |
| Calculate provisional plan after review | Allowed **locally** after eligibility checks | Allowed |
| Commit final profile to server | **Blocked** until verified (proposed restriction; TECH REVIEW) | Allowed |
| Reach synced Home | Blocked until final server commit (proposed) | Allowed |
| Resend verification and change email | Allowed with rate limiting | As applicable |
| Cross-device sync/account-sensitive changes | Restricted | Allowed subject to authorization |

**Conflict resolution:** Product decision says onboarding can continue unverified. This matrix allows answering onboarding offline/local while verification is pending, but restricts final server activation, which means Home is not reached until verification succeeds for email/password accounts. This is a **proposed** restriction, not independently user-approved. If product owner prefers unverified Home, revise matrix and threat model explicitly before implementation.

## 9. Local draft & completion protocol

1. After auth, obtain stable `user_id`; create namespace `onboarding:<user_id>:<flow_version>` in protected on-device storage suitable for sensitive data. Avoid plain, unprotected caches for body metrics. Exact secure storage design requires TECH REVIEW.
2. Store draft locally on step completion/change; persist only minimum information; no draft synced during onboarding.
3. On relaunch, resolve authenticated identity first, then access **only** that user's draft. If account differs, do not show the previous draft.
4. Before completion, rerun validation + eligibility + engine using latest inputs; do not trust previously cached READY output.
5. Auto-plan: activate candidate locally only when status `READY`; log-only: no numeric target and do not display 0 as a recommended target.
6. Send a single idempotent completion operation with stable `completion_request_id`, flow schema version, accepted notice/consent metadata, profile, and reviewed target data.
7. Backend validates session, verification restrictions, consent/legal predicates, eligibility and numerical rules, and either recomputes authoritative target or verifies deterministic engine version. Client calculation is not security authority.
8. Server returns authoritative `COMPLETED_AUTO_PLAN` or `COMPLETED_LOG_ONLY`, target version, and account/profile revision. Only then route to Home.
9. On timeout, retry with same request ID; fetch remote status to avoid duplicate profile/plan creation.
10. Once acknowledged, delete local sensitive draft (or retain only minimal state by approved retention policy). Any remaining local caches must be user scoped.

**Offline rules:** Onboarding draft can be filled/resumed offline **after an authenticated session has been established**. First-time authentication and final commit require connectivity. If connectivity fails at final step, show `COMPLETION_PENDING_SYNC` and retry; do not claim complete until server confirms. If auth expires offline, preserve draft securely, then reauthenticate prior to sync.

**Multi-device rule:** No cross-device partial draft sync by product decision. A different device sees server completion or starts a fresh draft. If device A has draft and B completes onboarding, device A must detect server completion on reconnect and ask before discarding local edits.

## 10. Auto-activation and automatic recalculation policy

- First eligible plan is automatically activated **after** server acknowledgement, with a brief result summary. No confirmation button required. Do not imply a medical prescription.
- For log-only completion, show `Target belum tersedia` instead of fake 0 or suggested macro values; users can still record nutritional intake.
- When weight changes later, recalculate automatically using latest valid weight and current reviewed rules. Existing plan remains active until the new candidate passes safety validation and server commit.
- Never overwrite target history: store version, effective date/time, source `AUTO_INITIAL` / `AUTO_WEIGHT_UPDATE` / `MANUAL`, engine version, input reference and reason.
- Multiple rapid/offline weight edits: use versioned ordering and idempotency; stale calculation results must not overwrite newer approved results.
- Manual target override interactions are governed by Nutrition Engine specification and must be settled before implementation.
- Daily diary history must retain the target version effective on that day so graphs don't retroactively change.

## 11. UX screen states and user-facing copy examples

| State | Example copy (Indonesia) | Action |
|---|---|---|
| Draft resumed | `Lanjutkan pengaturan dari langkah terakhir.` | Lanjut / Ubah |
| Unsupported | `Kami belum dapat menghitung rekomendasi otomatis untuk profil ini. Kamu tetap bisa mencatat makanan.` | Gunakan mode catatan |
| Invalid weight | `Masukkan berat badan dalam kilogram dengan angka lebih dari nol.` | Perbaiki input |
| Missing goal weight | `Isi target berat untuk tujuan ini.` | Isi target |
| Eligibility unknown | `Kami belum bisa memberikan target otomatis berdasarkan jawaban ini.` | Ubah jawaban / Log-only |
| Email pending | `Selesaikan verifikasi email untuk menyimpan profil ke akunmu.` | Kirim ulang / Ganti email |
| Offline completion | `Jawaban tersimpan di perangkat. Sambungkan internet untuk menyelesaikan pengaturan.` | Coba lagi |
| Engine needs review | `Target otomatis belum tersedia untuk data ini.` | Perbaiki data / Informasi |
| Save failed | `Pengaturan belum berhasil disinkronkan. Jawabanmu masih tersimpan di perangkat.` | Coba lagi |
| Auto-plan ready | `Berikut estimasi kebutuhan nutrisi harianmu. Kamu bisa meninjaunya kapan saja di Profil.` | Lanjut ke Beranda |

Visual guidance: progress bar measured by applicable steps, avoid flickering steps on conditional branching; minimum touch target and screen-reader labels; in-app explanation of purpose; optional skip clearly labeled; don't request notifications during mandatory onboarding.

## 12. Dependency and ownership map

| Dependency | Owner/spec | Onboarding integration | Gate |
|---|---|---|---|
| Authentication & account linking | `auth-spec.md` (to create) | Identity, verification, provider errors, session restoration | TECH |
| Nutrition Engine | `docs/02-architecture/nutrition-engine-spec.md` | Eligibility, inputs, states, targets | CLINICAL |
| Product rules | `docs/00-overview/business-rules.md` | Goals, unsupported populations, target history | PRODUCT |
| Database | `database-schema.md` (to create) | Profile, versioned targets, consent record, completion IDs | TECH/LEGAL |
| API contract | `api-contract.md` (to create) | Idempotent complete/status/retry, server validation | TECH |
| Privacy notice & ToS | `privacy-policy` / legal deliverables | Registration notice and additional body-data notice | LEGAL |
| Expo Router | Expo SDK-specific navigation conventions | Route groups and protected layouts | TECH |
| Secure local persistence | Security architecture | Account-scoped draft, cleanup, logout | TECH |
| Analytics | Future analytics policy | Aggregate drop-off counts only if lawful/consented | LEGAL/TECH |

## 13. Test matrix — QA acceptance cases

| ID | Case | Expected outcome |
|---|---|---|
| OB-T01 | New verified user, eligible maintenance | Auto READY target saved; Home accessible |
| OB-T02 | New eligible cutting user, goal weight missing | Inline error; no auto-plan |
| OB-T03 | Eligible bulking, goal weight supplied | Correct goal branch, candidate tested |
| OB-T04 | Maintenance user, no goal weight | Allowed |
| OB-T05 | Body type skipped | Same nutrition result as when body type filled |
| OB-T06 | Activity choice changed before finish | Recompute; no stale target |
| OB-T07 | Account unverified email | Continue local steps; restrictions per approved matrix |
| OB-T08 | Google/Apple sign-in success | No email/password verification step imposed incorrectly |
| OB-T09 | Provider auth failed/cancelled | Preserve safe state, no phantom session |
| OB-T10 | Logged-out user deep links Home | Auth gate works; backend still enforces authorization |
| OB-T11 | Existing completed profile relaunches | Skip onboarding |
| OB-T12 | Draft interrupted then resume same account | Restore progress without loss |
| OB-T13 | Logout / switch account during draft | No cross-account draft exposure |
| OB-T14 | Offline mid-onboarding | Edits saved locally; flow can proceed to pending-sync |
| OB-T15 | Offline during completion | No false COMPLETED; retry preserved |
| OB-T16 | Two completion retries | Exactly one server completion / plan version |
| OB-T17 | Under 18 / unsupported group | No standard calorie/macro recommendation; log-only branch |
| OB-T18 | Eligibility declined/unknown | No target auto-activation |
| OB-T19 | Nonnumeric, zero, negative weight | Validation; engine not called |
| OB-T20 | Extreme measurements | Confirm/review as applicable, never invented safe number |
| OB-T21 | Formula parameter unsupported | No arbitrary substitution; appropriate alternate route |
| OB-T22 | Engine macro conflict | No auto activation; explanatory state |
| OB-T23 | Server rejects plan after client READY | No completion; show correction/retry; server authoritative |
| OB-T24 | Reopen after server commit but local cleanup failed | Remote completion wins; sensitive draft cleaned |
| OB-T25 | Two devices, same account, one onboarding completes | No duplicate plan; refresh other device state |
| OB-T26 | Change weight later | Recalculate; only valid newest target active; history retained |
| OB-T27 | Screen reader / dynamic text / back gesture | Accessible controls and stable answers |
| OB-T28 | Consent withdrawn before commit | Don't process/commit disallowed data; legal-designated path |
| OB-T29 | App reinstalled with no server completion | Local draft unavailable; restart safely (expected limitation) |
| OB-T30 | Auth token expires during pending sync | Draft preserved securely; reauth required before submit |

## 14. Definition of Ready for Codex

- [ ] Product owner accepts the **email-unverified restriction matrix** (currently proposed).
- [ ] Clinical reviewer signs off eligibility, preset and nutrition engine parameters (production automated targeting blocked until then).
- [ ] Legal reviewer approves notice, lawful basis, processing and retention for body/health-related data, including age/account policy.
- [ ] Auth provider and backend approach decided, including Apple platform handling and account linking.
- [ ] Local encryption/draft storage and user isolation design reviewed; logout/uninstall rules documented.
- [ ] API shapes and server-side idempotency/validation planned.
- [ ] UI visual specification and accessible copy approved.
- [ ] Test fixtures cover READY, LOG_ONLY, INVALID_INPUT, UNSUPPORTED, NEEDS_REVIEW, and offline pending-sync.

**Codex instruction:** Until readiness gates are passed, it may implement route scaffolding, forms, draft UX, and engine adapters behind feature flags with mock values; do not present unreviewed numerical targets as real nutrition advice, do not invent security or legal policy, and do not mark production-ready.

## 15. Open decision register (not silently finalized)

| ID | Decision still pending | Responsible | Priority |
|---|---|---|---|
| OD-01 | Exact unverified-email restricted actions; Home access policy | Product/Auth | HIGH |
| OD-02 | Minimum supported age, treatment of minors' accounts | Legal/Product | HIGH |
| OD-03 | Clinical exclusions and intake guardrails / approved engine version | Nutrition professional | BLOCKING |
| OD-04 | Specific notice/consent language and recordkeeping | Legal | BLOCKING |
| OD-05 | DOB vs age-only, storage retention | Privacy/Product | HIGH |
| OD-06 | Choice/mapping of goal types to clinically reviewed engine presets | Product/Clinical | HIGH |
| OD-07 | Exact activity-level descriptions and validated factors | Clinical/Product | HIGH |
| OD-08 | Formula input for physiology outside binary coefficients | Clinical/Product | HIGH |
| OD-09 | Auth backend/provider and Apple sign-in configuration | Engineering | HIGH |
| OD-10 | Encrypted local draft storage design and threat model | Engineering/Security | HIGH |
| OD-11 | Onboarding result screen timing (informational only, no confirm) | Design/Product | MEDIUM |
| OD-12 | Behavior if remote completed profile conflicts with older local draft | Product/Engineering | MEDIUM |

## 16. Reference checkpoints (review before implementation)

- Expo Router protected routes: https://docs.expo.dev/router/advanced/protected/ — client-side route UX; **not server authorization**.
- Expo authentication: https://docs.expo.dev/develop/authentication/ — version-dependent patterns.
- Expo provider auth: https://docs.expo.dev/guides/authentication/ — OAuth/OpenID considerations.
- Indonesia UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi — verify operative obligations and implementing regulations with counsel.
- Apple Sign in guidelines: https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/ — platform-specific developer requirements.
- NUTRASA `nutrition-engine-spec.md` v0.5 and `business-rules.md` v0.4 — **internal drafts, not independent clinical validation**.

---

**Document conclusion:** Product flow is consolidated. Development is permitted for non-production scaffolding and UI only until clinical, legal, and authentication/security gates are reviewed. This prevents apparently finished onboarding from making unsupported automatic nutritional recommendations.
