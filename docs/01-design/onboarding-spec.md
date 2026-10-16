# NUTRASA — Onboarding Specification

**Version:** 1.0 (product decisions consolidated; gated technical/clinical/legal dependencies)  
**Date:** 2026-10-13  
**Path:** [docs/01-design/onboarding-spec.md](onboarding-spec.md)\
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
- If [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md) has different numerical candidates, treat them as **unapproved**, not as an overriding rule. Nutrition engine owns formulas; this document owns onboarding orchestration.
- [business-rules.md](../00-overview/business-rules.md) is the source for global food and nutrition principles. Document conflicts should be logged; no silent assumption by Codex.

## 1. Product decisions (approved)

| ID | Decision | Status |
|---|---|---|
| OB-001 | Authentication precedes personalized onboarding | APPROVED |
| OB-002 | Initial sign-in: email, Google, Apple; username optional (not an auth method by itself) | APPROVED product scope; TECH REVIEW |
| OB-003 | Email verification optional; onboarding, final profile, Home and sync available with valid authentication | APPROVED D01; sensitive actions may require Firebase reauthentication |
| OB-004 | One overall activity-level question; do not double-count exercise | APPROVED |
| OB-005 | Interactive visual onboarding, back navigation, progress shown | APPROVED principle |
| OB-006 | Body-type illustrations optional after body measurements and cannot affect calculations | APPROVED |
| OB-007 | Goal weight required for cutting and bulking; optional for maintenance/muscle_gain, but valid whenever supplied | APPROVED M03-01A |
| OB-008 | Name/display name/username optional later in Profile | APPROVED |
| OB-009 | Draft encrypted locally per authenticated account; no partial profile in PostgreSQL; complete profile and preferences created together after server validation | APPROVED M03-01A; storage/security tests OPEN |
| OB-010 | One privacy approval action in registration/onboarding; additional explanatory body-data notices do not repeat approval of the same purpose | APPROVED UX M03-01A; legal basis/validity of combined approval OPEN |
| OB-011 | Eligible nutrition target activates automatically once fully validated, no mandatory plan-confirmation screen | APPROVED; CLINICAL REVIEW of thresholds |
| OB-012 | MVP only for eligible adults 18+; unsupported profiles cannot complete onboarding or enter LOG_ONLY | APPROVED D04; no numeric target for ineligible profiles |
| OB-013 | MVP accepts eligible adults 18+ only; detailed special-condition screening remains subject to clinical/legal review | APPROVED scope; review gates remain OPEN |
| OB-014 | Nutrition target presets determined by profile; fat 25–30% adaptive; protein uses reference weight and goal; carbohydrates remainder | APPROVED approach; CLINICAL REVIEW for numeric rules |
| OB-015 | Automatic recalculation on changed weight, gated by safety checks and target history | APPROVED; SPECIFIED activation safeguards |
| OB-016 | Offline-tolerant food logging, partial nutrient data permitted and marked | APPROVED global product scope |

## 2. Goals, non-goals, and key UX principles

**Goals:** First-time eligible adult can authenticate, understand data processing, obtain a validated automatic target, interrupt/resume onboarding, and reach Home. Explain ineligibility without numeric targets or a LOG_ONLY completion path.

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
   ├─ Onboarding complete, eligible profile, valid server account → Home
   ├─ Partial onboarding (local draft for same user) → Resume onboarding
   └─ No onboarded profile → Begin onboarding

Onboarding:
Goal → Age/eligibility → Body metrics → Optional visual body type
→ Overall activity → Goal weight (cut/bulk only)
→ Eligibility/special-condition disclosure/check
→ [eligible] Calculate → auto-activate safe plan → save complete profile → Home
→ [unsupported] explain ineligibility → no completion or numeric target in MVP
→ [needs review / invalid] correction/help state; never invent targets
```

**Critical clarification:** Server must know account onboarding completion before a second device can enter Home. A draft exists **only locally** until completion. Therefore, an authenticated session without a completed server profile should return to onboarding, even if the device has no local draft. Do not mark complete remotely while offline and silently assume it synced.

**APPROVED M03-01A persistence:** no `user_profiles.onboarding_status` column. Server derives `NOT_STARTED` when no completed profile exists and `COMPLETED` from a validated completed profile; `IN_PROGRESS` is local draft state. Create profile and preferences in one backend transaction only after complete validation. A completed profile alone is not proof of an active nutrition recommendation: initial weight, goal persistence and reviewed engine dependencies must also be satisfied. Their exact completion transaction boundary is **OPEN / BLOCKED for completion implementation**; do not bypass it with placeholder targets.

### 3.1 Route map (conceptual, Expo Router)

- `(auth)/welcome`, `(auth)/sign-in`, `(auth)/register`, `(auth)/email-verification`.
- `(onboarding)/goal`, `/age`, `/measurements`, `/body-type`, `/activity`, `/goal-weight`, `/eligibility`, `/result`, `/sync-pending`.
- `(tabs)/index` (Home) requires session and server-confirmed completion for an eligible adult; LOG_ONLY is not an MVP completion mode.
- Protected routes are **navigation UX**, never a substitute for server-side authorization.
- Implementation may change route files to fit chosen Expo SDK; keep screen logic under `src/features/onboarding/` and route wrappers lightweight.

## 4. Screen-by-screen specification

| Step | Screen | UI / Inputs | Required? | Next / branches |
|---|---|---|---|---|
| S00 | Splash & session gate | Brand splash, brief loading only while restoring state | Automatic | Login / Resume / Home |
| S01 | Welcome/auth | Sign in, register, password recovery, provider errors | Authentication required | Account created / session loaded |
| S02 | Notice of data use | One privacy approval action; concise purposes, policy link and additional explanatory body-data notice | UX APPROVED; legal validity and transport OPEN | Goal |
| S03 | Primary goal | maintenance / cutting / bulking / muscle_gain | Yes; structural codes approved, clinical preset mapping OPEN | Age |
| S04 | Age | Full date of birth; persisted as DATE with privacy protections; server calculates age | Required for MVP eligibility | Under 18 → ineligible; no numeric target or LOG_ONLY |
| S05 | Body measurements | Current weight kg, height cm, and required formula parameter with transparent explanation | Required only for automatic plan | Body type |
| S06 | Visual body type | Illustrated options and “Lewati”; no engine effect | Optional | Activity |
| S07 | Overall activity | One overall activity level, plain descriptions with work/exercise examples | Required for automatic plan | Goal weight |
| S08 | Goal weight | Target kg for cutting/bulking; explicit intended goal direction | Conditional required | Eligibility |
| S09 | Eligibility | Clear questions/notice for unsupported conditions, opt-out path | Required eligibility resolution | Calculate only when eligible; otherwise explain ineligibility |
| S10 | Calculation state | Deterministic engine, loading only if actually running | Eligible users | Result / invalid / needs review |
| S11 | Auto-activation/result | Show target kcal and P/C/F, “estimasi”, method/version, edit later, explanatory notice | Automatic if engine returns READY | Persistence |
| S12 | Ineligibility explanation | Explain unsupported MVP profile without numeric targets or logging fallback | Unsupported | Correct answers where appropriate; no completion |
| S13 | Save/sync completion | Persist server profile once; retry on errors, show pending state | Successful server acknowledgement | Home |

**Age and special-condition path:** MVP requires age 18+ and a supported profile. If outside scope, explain ineligibility and avoid collecting unnecessary measurements; do not offer LOG_ONLY or fallback targets. Unknown eligibility requires resolution before completion; clinical/legal screening details remain OPEN.

**Auth UI nuance:** username is a profile/display handle later, not a substitute for email/Google/Apple login in MVP. Email verification is applicable to email/password; provider token validation and trust are backend responsibilities. Apple provider availability and store requirements need TECH REVIEW.

## 5. Form fields & normalized contract (conceptual)

| Field | Example type | Purpose | Condition |
|---|---|---|---|
| `user_id` | opaque account ID | Scope local draft | Required after authentication |
| `flow_version` | string | Resume/migrate draft | Required |
| `goal_type` | maintenance/cutting/bulking/muscle_gain | Preset selection | Required; clinical mapping OPEN |
| `date_of_birth` | full date, PostgreSQL DATE | Adult eligibility and calculation | Required; backend validates age 18+ |
| `height_cm` | decimal string, numeric(8,2) | RMR estimate | Required; positive finite, at most 2 fractional digits |
| `weight_kg` | decimal string, numeric(10,3) | RMR + weight-measurement domain | Required; positive finite, at most 3 fractional digits; not a profile column |
| `calculation_parameter` | nonempty structured code | RMR suitability | Required; clinical code set/compatibility OPEN, reject unapproved values |
| `body_type_visual` | nullable visual code | Cosmetic preference | Optional; no engine effect |
| `activity_level` | very_low/light/moderate/high/very_high | One factor class | Required; structural codes only, factors OPEN |
| `target_weight_kg` | nullable decimal | Cutting/bulking goal | Conditionally required |
| `eligibility_answers` | minimal flags | Unsupported routing | Minimize collection; LEGAL review |
| `notice_version` / `consent_record` | conceptual evidence, not a finalized request shape | Versioned acknowledgement with trusted server timestamp | Transport/vocabulary/legal review OPEN; identical retry preserves first record |
| `draft_updated_at` | timestamp | Resume ordering | Local required |
| `calculation_version` | string | Calculation reproducibility | Upon auto plan |
| `plan_status` | enum | READY / NEEDS_REVIEW / etc | Upon calculation |
| `onboarding_mode` | `AUTO_PLAN` only in MVP | Home configuration | Eligible completion |
| `onboarding_completed_at` | timestamp | Authoritative completion | On server ack |

Avoid embedding credentials, access tokens, or comprehensive medical information in a draft. Full DOB storage is APPROVED; privacy protections, lawful basis and retention still require review. Each numeric entry normalizes to canonical units without silent rounding of authoritative input. The field list includes local/conceptual fields: it is not permission to add fields to the OpenAPI request. Preferences, eligibility and acknowledgement transport at completion remain OPEN. Persisted preferences require language, validated IANA timezone and kg/lb; never infer Asia/Jakarta from country or confuse initial display settings with saved preferences.

## 6. State machines (do not merge into one boolean)

### 6.1 Authentication state

`RESTORING_SESSION`, `SIGNED_OUT`, `SIGNED_IN_UNVERIFIED_EMAIL`, `SIGNED_IN_VERIFIED`, `AUTH_ERROR`.

Do not infer verified email from local cache; source is the trusted auth provider/backend. Invalid/revoked sessions transition to signed out after handling draft safely.

### 6.2 Onboarding state

`NOT_STARTED`, `IN_PROGRESS`, `CHECKING_ELIGIBILITY`, `CALCULATING`, `NEEDS_CORRECTION`, `NEEDS_REVIEW`, `UNSUPPORTED`, `COMPLETION_PENDING_SYNC`, `COMPLETED_AUTO_PLAN`.

`UNSUPPORTED` explains ineligibility without an MVP completion path or numeric target. `COMPLETION_PENDING_SYNC` is **not** completed. Persist draft after meaningful changes and on app lifecycle transitions as feasible, without assuming lifecycle hooks always fire.

These are UI orchestration states, not database columns. Server-derived completion and independent nutrition-result state follow §3; a local `IN_PROGRESS` must not become a server fact.

### 6.3 Nutrition result states

`READY`, `NEEDS_INPUT`, `NEEDS_REVIEW`, `UNSUPPORTED`, `INVALID_INPUT`, `MACRO_ALLOCATION_CONFLICT`.

Only `READY` (from a clinically approved engine configuration) can activate an automatic plan. `NEEDS_REVIEW` is not auto-approved. For a numeric engine version not yet clinically cleared, use dummy/test profiles only; production targeting must be disabled.

## 7. Validation and safety gates

### 7.1 Technical validation (implementation-ready principles)

- Numeric fields parse Indonesian-style decimal input if supported, with clear standardized decimal handling. Empty, NaN, Infinity, zero/negative for anthropometrics are invalid.
- Reject excess precision before PostgreSQL coerces/rounds the value: height 2 fractional digits, weight/target weight 3. API values use precise decimal strings; server also rejects overflow. Age/eligibility uses server evaluation, not a CURRENT_DATE-based database CHECK.
- Show inline, accessible error message; preserve prior valid values on back/forward.
- A malformed DOB, future date, impossible age, and broken goal-direction relations block auto calculation.
- Do not infer an RMR constant from cosmetic body type or gender identity; explain what parameter is needed.
- Goal weight for cutting/bulking cannot be skipped; for maintenance/muscle_gain it may be omitted, but any supplied value must be valid.
- For strongly implausible anthropometric values, ask re-entry or flag `NEEDS_REVIEW`; do not label clinically unsafe solely from a guessed threshold.
- Formula results must be finite, positive, consistent, reproducible and versioned; no arbitrary fallback target.
- User can edit earlier answer; invalidate stale calculated result and recompute before completion.

### 7.2 Clinical gate (CLINICAL REVIEW / BLOCKED FOR PRODUCTION)

- MVP scope minimum age 18+ is settled; clinical review remains OPEN for special-population exclusions, anthropometric ranges, target-weight direction, calorie presets, activity mapping, protein reference/coefficients, adaptive fat rule and contraindications.
- Assess underweight or potentially unsafe goal changes via reviewed rules, not BMI alone as a simplistic diagnosis.
- No automatically produced target for unsupported, declined eligibility, inconsistent physiological parameters, or failed review.
- Auto-plan after onboarding and future auto-recalculations use **the same reviewed safety gate**, not separate looser implementations.

### 7.3 Legal gate (LEGAL REVIEW / BLOCKED UNTIL COMPLIANT)

- One user-facing privacy approval action in registration/onboarding is the approved UX. Additional explanatory notices may appear without repetitive approval of the same purpose. **One action is not proof of legally valid combined consent or unrestricted permission**; processing basis and body-data scope require legal review.
- Determine whether express, specific, separate consent is necessary for health-related body data; record version, timestamp, withdrawal process and retention policy, subject to Indonesian PDP law review.
- MVP does not admit under-18 profiles. Age screening, notices, data minimization and legal handling remain OPEN; any future child access/guardian consent is outside current MVP and requires separate legal/product review.
- Define deletion/export/access rights, security incidents, hosting/data transfer and privacy policy before release.
- Store versioned acknowledgement by user/notice/type with trusted server recording time (DEFAULT now()) and UNIQUE(user_id, notice_version, ack_type); identical retries preserve the original evidence. This is not proof of precise device interaction time. `ONBOARDING_PRIVACY` is only PROPOSED. Intended final account deletion removes this evidence unless legal review establishes justified retention. Withdrawal/backups/legal retention remain OPEN; structural deletion FKs are approved in the [identity contract](../02-architecture/postgres-physical-schema-v1.5.md#kontrak-identity-m03-01a). PENDING_DELETION is logical; physical account deletion must explicitly resolve acknowledgements under RESTRICT. Retaining evidence after account removal requires prior architecture/legal review; CASCADE alone is not a deletion workflow.

## 8. Optional email verification and sensitive actions (D01)

| Capability | Email unverified | Verified email / trusted social auth |
|---|---|---|
| Sign in & recover session | Allowed with valid authentication | Allowed |
| Fill/resume local onboarding | Allowed | Allowed |
| Calculate provisional plan after review | Allowed **locally** after eligibility checks | Allowed |
| Commit final profile to server | Allowed with valid authentication and eligible profile | Allowed on the same conditions |
| Reach synced Home | Allowed after eligible server completion; email verification not required | Allowed on the same conditions |
| Resend verification and change email | Allowed with rate limiting | As applicable |
| Cross-device sync | Allowed with valid authentication/authorization | Allowed on the same conditions |
| Account-sensitive changes | Firebase reauthentication where required | Firebase reauthentication where required |

**RESOLVED D01:** Pending email verification does not block onboarding, final server save, Home or sync. Verification status, verify and resend actions are available at Profil > Pengaturan > Data Diri. Sensitive actions retain Firebase reauthentication and authorization; detailed SDK/platform behavior remains TECH REVIEW.

## 9. Local draft & completion protocol

1. After auth, obtain stable `user_id`; create namespace `onboarding:<user_id>:<flow_version>` in encrypted account-scoped on-device storage suitable for sensitive data. Avoid plain, unprotected caches for body metrics. Exact secure storage design and tests remain TECH REVIEW.
2. Store draft locally on step completion/change; persist only minimum information; no draft synced during onboarding.
3. On relaunch, resolve authenticated identity first, then access **only** that user's draft. If account differs, do not show the previous draft.
4. Before completion, rerun validation + eligibility + engine using latest inputs; do not trust previously cached READY output.
5. Show a provisional automatic candidate only when status `READY`; activate only after server validation/acknowledgement. Ineligible profiles receive no numeric target or completed onboarding.
6. Completion must be idempotent. OpenAPI currently uses `Idempotency-Key`; the older conceptual `completion_request_id` and flow/notice/consent payload are not a finalized transport. Preference/acknowledgement/eligibility fields and server-owned target handling remain **OPEN**; do not invent request fields or send client targets as authority.
7. Backend validates session, consent/legal predicates, eligibility and numerical rules, and recomputes or verifies the authoritative engine result. Email verification is not a completion prerequisite; client calculation is not security authority.
8. Create completed profile and preferences together in one transaction after validation; no partial profile row. The API contract also plans atomic initial weight and active AUTO goal, whose tables arrive later: exact persistence dependencies are **OPEN/BLOCKED**. Do not equate profile existence with active recommendation or route to an allegedly ready target before dependencies succeed.
9. On timeout, retry with same request ID; fetch remote status to avoid duplicate profile/plan creation.
10. Once acknowledged, delete local sensitive draft (or retain only minimal state by approved retention policy). Any remaining local caches must be user scoped.

**Offline rules:** Onboarding draft can be filled/resumed offline **after an authenticated session has been established**. First-time authentication and final commit require connectivity. If connectivity fails at final step, show `COMPLETION_PENDING_SYNC` and retry; do not claim complete until server confirms. If auth expires offline, preserve draft securely, then reauthenticate prior to sync.

**Multi-device rule:** No cross-device partial draft sync by product decision. A different device sees server completion or starts a fresh draft. If device A has draft and B completes onboarding, device A must detect server completion on reconnect and ask before discarding local edits.

## 10. Auto-activation and automatic recalculation policy

- First eligible plan is automatically activated **after** server acknowledgement, with a brief result summary. No confirmation button required. Do not imply a medical prescription.
- Ineligible profiles cannot complete MVP onboarding; explain the reason without fake numeric targets or LOG_ONLY. Pending/review states must not be presented as active targets.
- When weight changes later, recalculate automatically using latest valid weight and current reviewed rules. Existing plan remains active until the new candidate passes safety validation and server commit.
- Never overwrite target history: retain version, effective time, automatic source `AUTO_INITIAL` / `AUTO_WEIGHT_UPDATE`, engine version, input reference and reason. Manual targets are post-MVP.
- Multiple rapid/offline weight edits: use versioned ordering and idempotency; stale calculation results must not overwrite newer approved results.
- Manual target/override is post-MVP and not exposed in this onboarding flow.
- Daily diary history must retain the target version effective on that day so graphs don't retroactively change.

## 11. UX screen states and user-facing copy examples

| State | Example copy (Indonesia) | Action |
|---|---|---|
| Draft resumed | `Lanjutkan pengaturan dari langkah terakhir.` | Lanjut / Ubah |
| Unsupported | `Profil ini belum didukung untuk onboarding NUTRASA. Periksa kembali jawabanmu atau lihat informasi cakupan MVP.` | Tinjau jawaban / Informasi; tidak ada mode catatan |
| Invalid weight | `Masukkan berat badan dalam kilogram dengan angka lebih dari nol.` | Perbaiki input |
| Missing goal weight | `Isi target berat untuk tujuan ini.` | Isi target |
| Eligibility unknown | `Kami belum bisa memastikan kelayakan profil ini untuk MVP.` | Tinjau / Ubah jawaban |
| Email pending | `Verifikasi email opsional. Status dan aksi tersedia di Profil > Pengaturan > Data Diri.` | Lanjutkan / Verifikasi |
| Offline completion | `Jawaban tersimpan di perangkat. Sambungkan internet untuk menyelesaikan pengaturan.` | Coba lagi |
| Engine needs review | `Target otomatis belum tersedia untuk data ini.` | Perbaiki data / Informasi |
| Save failed | `Pengaturan belum berhasil disinkronkan. Jawabanmu masih tersimpan di perangkat.` | Coba lagi |
| Auto-plan ready | `Berikut estimasi kebutuhan nutrisi harianmu. Kamu bisa meninjaunya kapan saja di Profil.` | Lanjut ke Beranda |

Visual guidance: progress bar measured by applicable steps, avoid flickering steps on conditional branching; minimum touch target and screen-reader labels; in-app explanation of purpose; optional skip clearly labeled; don't request notifications during mandatory onboarding.

## 12. Dependency and ownership map

| Dependency | Owner/spec | Onboarding integration | Gate |
|---|---|---|---|
| Authentication & account linking | [auth-spec.md](../03-features/auth-spec.md) (draft available) | Identity, verification, provider errors, session restoration | TECH |
| Nutrition Engine | [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md) | Eligibility, inputs, states, targets | CLINICAL |
| Product rules | [docs/00-overview/business-rules.md](../00-overview/business-rules.md) | Goals, unsupported populations, target history | PRODUCT |
| Database | [database-schema.md](../02-architecture/database-schema.md) (draft available) | Profile, versioned targets, consent record, completion IDs | TECH/LEGAL |
| API contract | [api-contract.md](../02-architecture/api-contract.md) (draft available) | Idempotent complete/status/retry, server validation | TECH |
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
| OB-T07 | Account unverified email | Eligible onboarding, final save, Home and sync allowed; sensitive Firebase reauth tested |
| OB-T08 | Google/Apple sign-in success | No email/password verification step imposed incorrectly |
| OB-T09 | Provider auth failed/cancelled | Preserve safe state, no phantom session |
| OB-T10 | Logged-out user deep links Home | Auth gate works; backend still enforces authorization |
| OB-T11 | Existing completed profile relaunches | Skip onboarding |
| OB-T12 | Draft interrupted then resume same account | Restore progress without loss |
| OB-T13 | Logout / switch account during draft | No cross-account draft exposure |
| OB-T14 | Offline mid-onboarding | Edits saved locally; flow can proceed to pending-sync |
| OB-T15 | Offline during completion | No false COMPLETED; retry preserved |
| OB-T16 | Two completion retries | Exactly one server completion / plan version |
| OB-T17 | Under 18 / unsupported group | Ineligible; no standard target, completed onboarding or LOG_ONLY fallback |
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

- [ ] D01 optional verification flow and Firebase sensitive-action reauthentication are tested; main features remain available.
- [ ] Clinical reviewer signs off eligibility, preset and nutrition engine parameters (production automated targeting blocked until then).
- [ ] Legal reviewer approves notice, lawful basis, processing and retention for body/health-related data, including age/account policy.
- [ ] Auth provider and backend approach decided, including Apple platform handling and account linking.
- [ ] Local encryption/draft storage and user isolation design reviewed; logout/uninstall rules documented.
- [ ] API shapes and server-side idempotency/validation planned.
- [ ] UI visual specification and accessible copy approved.
- [ ] Test fixtures cover READY, INVALID_INPUT, UNSUPPORTED, NEEDS_REVIEW, and offline pending-sync; no active LOG_ONLY/manual target.

**Codex instruction:** Until readiness gates are passed, it may implement route scaffolding, forms, draft UX, and engine adapters behind feature flags with mock values; do not present unreviewed numerical targets as real nutrition advice, do not invent security or legal policy, and do not mark production-ready.

## 15. Open decision register (not silently finalized)

| ID | Decision still pending | Responsible | Priority |
|---|---|---|---|
| OD-01 | D01 RESOLVED: email optional, including Home/final save/sync; Firebase sensitive-action implementation still OPEN | Product/Auth | SDK/security verification |
| OD-02 | RESOLVED age minimum 18+; treatment/minimization for minors' accounts remains OPEN | Legal/Product | HIGH |
| OD-03 | Clinical exclusions and intake guardrails / approved engine version | Nutrition professional | BLOCKING |
| OD-04 | One approval action UX APPROVED; legal validity, vocabulary/transport, withdrawal and retention OPEN | Legal/Engineering | BLOCKING |
| OD-05 | RESOLVED full DOB DATE; privacy protections and storage/backup retention OPEN | Privacy/Product | HIGH |
| OD-06 | RESOLVED four goal_type codes (§5); mapping to clinically reviewed presets OPEN | Product/Clinical | HIGH |
| OD-07 | RESOLVED five activity_level codes (§5); descriptions and validated factors OPEN | Clinical/Product | HIGH |
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
- NUTRASA [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md) v0.5 and [business-rules.md](../00-overview/business-rules.md) v0.4 — **internal drafts, not independent clinical validation**.

---

**Document conclusion:** Product flow is consolidated. Development is permitted for non-production scaffolding and UI only until clinical, legal, and authentication/security gates are reviewed. This prevents apparently finished onboarding from making unsupported automatic nutritional recommendations.
