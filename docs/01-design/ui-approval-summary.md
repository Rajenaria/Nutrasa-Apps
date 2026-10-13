# NUTRASA — UI/UX Approval Summary & Visual Handoff

**Document ID:** NUTRASA-UI-APPROVAL-001  
**Version:** 1.0  
**Date:** 13 October 2026  
**Status:** **PROVISIONALLY APPROVED VISUAL BASELINE**, not a pixel-perfect implementation sign-off  
**Platform:** React Native + Expo + TypeScript / Expo Router  
**Owner review:** Six screen groups approved during discussion; revisions are explicitly allowed.

> **AI AGENT / CODEX — READ FIRST.** This file records UI/UX decisions accepted by the product owner. Treat it as the **approved visual direction**, not an instruction to implement placeholder content or to ignore functional specs. Use official assets. Build according to existing product rules. When a screenshot conflicts with approved behavior, the behavior spec wins. Do not infer that a feature is production-ready just because it appears in a mockup.

## 1. Decisions and authority

Priority when references conflict:

1. Product safety, user privacy, validated nutrition/business rules, accessibility requirements.
2. Official final logo and Bowi artwork in `assets/branding/`.
3. Explicit owner-approved choices in this document.
4. [docs/01-design/design-system.md](design-system.md) and the feature/navigation specs, except where amended here.
5. Approved mockups as **visual guidance**, not literal layouts.
6. Experimental screenshots, older assets and draft references.

An **approved visual direction** does not mean the underlying product feature, nutrition number, illustration or action in the image is approved. Any changes to workflows, calculation rules, or MVP scope require a separate decision.

### 1.1 Screens approved as *provisional* visual references

| Screen group | Status | Canonical reference in this package | Scope of approval |
|---|---|---|---|
| Home / Dashboard | Approved, provisional | `approved-mockups/home-approved.png` | Large calorie card and ring, concise calendar row, three small circular macro progress cards without pictogram icons, compact food journal |
| Food Search / Detail / Logging | Approved, provisional | `approved-mockups/food-flow-approved.png` | Search-led discovery, categories, recent results, simple food detail/portion flow, meal selection, journal |
| Progress | Approved, provisional | `approved-mockups/progress-approved.png` | Calorie trend, **three concentric semicircular macro arcs** with text underneath, weight trend, consistency block |
| Profile & Settings | Approved, provisional | `approved-mockups/profile-approved.png` | Minimal settings lists, data/goal cards, visual grouping, limited Bowi guidance |
| Welcome / Authentication | Approved, provisional | `approved-mockups/auth-approved.png` | Warm minimal welcome and auth visuals, simple forms, limited copy, strategically placed Bowi |
| Personalization Onboarding | Approved, provisional | `approved-mockups/onboarding-approved.png` | One primary question per step, very short labels, small controls, progress dots, selective Bowi illustration |

**Clarification:** The Home macro visualization and Progress macro visualization are deliberately **different**: Home uses **3 separate circular rings**; Progress uses **3 concentric semicircular arcs**. Do not collapse these into one global pattern.

## 2. Global design direction — APPROVED

- Keywords: **modern, clean, minimal, natural, friendly, premium-soft, calm**.
- Branding: forest green + warm cream, subtle leaf green accents and sparing warm orange; official assets always take precedence.
- Flat/light white cards on warm neutral background, subtle low-contrast borders or soft shadows. Avoid heavy gradients, loud decorations, excessive outlines and a card nested inside several other cards.
- Emphasize nutritional values and next user action. Limit labels and helper text. One screen should have one clear visual focal point.
- **Compact size adjustment (latest explicit request):** overall UI components, mascot and cards should be **slightly smaller than the first mockups**. The intent is to reclaim breathing room, not to make text illegible or buttons difficult to tap.
- Iconography: minimal and purposeful; not every heading/card needs an icon. Use consistent line-style iconography via one semantic wrapper.
- Mascot Bowi: use official provided poses, as a supporting accent at welcome/onboarding/empty/success/help states; no obligatory Bowi on each screen/card.
- Keep Indonesian copy short and straightforward. Avoid long explanatory paragraphs in the main app UI; put optional explanations behind info/help affordances.
- Preserve clarity if target or food data is unknown, partial or pending sync. A missing/pending target does not enable LOG_ONLY mode in MVP.

## 3. Compact, accessible component guidance — PROPOSED TOKENS / REVIEW ON DEVICE

Numbers below are **implementation starting points**, not fixed pixel-perfect decisions; validate on small and large devices and with accessibility text scaling.

| Component | Candidate default | Notes |
|---|---|---|
| Content horizontal padding | 16–20 dp | Keep safe-area insets independent |
| Spacing scale | 4 / 8 / 12 / 16 / 20 / 24 / 32 dp | Prefer 8–16 dp between related elements |
| Card corner radius | 16–20 dp | Consistent, not excessive |
| Card padding | 12–16 dp | Hero cards can use 16–20 dp |
| Standard icon | 18–20 dp | Tab icon ~20–24 dp |
| Small illustration / Bowi state | ~80–140 dp as appropriate | Do not crowd controls |
| Compact single-line control visual height | ~44–48 dp | Accessible touch target **at least 44x44 pt on iOS, ideally 48x48 dp on Android**; expand hit area if needed |
| Body text | 14–16 sp | Do not shrink essential content just to match screenshot |
| Secondary text | 12–14 sp | Important units must remain legible |
| Card titles | 16–18 sp | Use hierarchy, not large text everywhere |
| Nutrition hero value | 28–36 sp | Scale relative to width, not a giant hardcoded heading |
| Microcopy | Keep to one short sentence | Longer explanation on details/help screen |

On compact phones, favor vertical scrolling, responsive grids and dynamic text wrapping. Support screen-reader labeling for icons, graphs, rings and radio/select choices. Color alone may not indicate state. Avoid disabling text scaling and avoid hiding controls behind the system gesture bar.

## 4. Colors, fonts and icons — CENTRALIZED, NOT HARD-CODED

**Visual choices are candidate choices pending device contrast review:**

| Token | Candidate color |
|---|---|
| `brand.forest` | `#063B2E` |
| `brand.green` | `#176B4D` |
| `brand.leaf` | `#4C9B63` |
| `brand.orange` | `#FF8D25` |
| `surface.base` | `#FFF9EF` or reviewed warm cream |
| `surface.card` | `#FFFFFF` |
| `text.primary` | `#073D30` |
| `border.subtle` | `#E5EAE3` |
| `chart.track` | `#E8ECE8` |

All variants must be tested for WCAG-relevant contrast and visible disabled/error/focus states. Define semantic colors in `src/theme/colors.ts` rather than hard-coding screen-specific values.

- **Font candidate:** Plus Jakarta Sans, using Expo-compatible font loading. Use semantic text variants through `AppText` / `typography.ts` so the family can be replaced centrally.
- **Icon candidate:** `lucide-react-native` through one `AppIcon` adapter with semantic names. Changing provider may require remapping names, but should not require redesigning every screen.
- **Charts / rings:** consistent reusable visual components, not one-off duplicated SVGs per screen. Use `react-native-svg` if needed and Expo-compatible, but confirm actual packages when tech-stack decisions are finalized.
- Official logo files: `assets/branding/logo/`; official Bowi poses: `assets/branding/mascot/bowi/`.
- Do not replace logo or Bowi with AI-generated approximations seen in mockups. Do not place font files into generated documentation or share font binaries.

## 5. Per-screen rules

### 5.1 Home / Dashboard

**Approved:** brand/header and slim week-date strip; large calorie summary card with circular progress; below it, three equally-weighted compact cards labelled **Protein, Karbo, Lemak**, each using a circular ring with **percentage at the center** and the consumed/target quantity beneath, e.g. `75 / 120 g`; no food icons in these three cards. Food journal with clean rows/empty card. The last specific macro approval supersedes earlier mockups showing icons or grams in the center.

**Details:** calorie card should not repeat identical numbers needlessly; in development, rationalize duplication while preserving approved layout proportions. The four meal types are Sarapan, Makan Siang, Makan Malam, Camilan. The home data must follow selected diary date and applicable target version. Empty diary ≠ zero intake; incomplete micronutrients must indicate partial data.

**Not approved for functionality:** flame streak counter, photographing food, automatic AI logging, unverified nutritional data or calorie budgets for unsupported profiles. MVP eligibility is 18+ supported profiles only; no LOG_ONLY mode. Unavailable AI actions must not appear functional.

### 5.2 Food Search / Detail / Logging

Search prominent at top, category tiles compact, recent foods and common foods discoverable. Food detail shows item, clear per-serving basis and units, quantity and nutrient totals. Add flow selects meal/date, updates diary locally, then syncs. Layout is approved conceptually, not in exact screenshot ordering.

**MVP product support (O-18 RESOLVED):** simple custom food, food favorites, recent foods, copy food logs, edit/delete, offline queue and partial data. User recipes are post-MVP; draft recipe models/endpoints do not establish MVP scope. Existing Food Logging/Food Database specs govern behavior; mockups do not authorize unlicensed photos or scan features. See [Food Logging](../03-features/food-logging-spec.md) and [Food Database](../02-architecture/food-database-spec.md).

### 5.3 Progress

Compact period selector (e.g. 7/30/90 days pending final period decision); calorie bar chart; **macro panel with three stacked concentric semicircular arcs** (3 distinct colors) and clean labels plus actual/target values below; simple weight line chart; concise consistency display with Bowi only if space permits.

**Data integrity:** unknown days excluded from consumption averages or explicitly marked; not treated as zero. Partial nutrient values are flagged. Historic target comparisons use target version effective for that date. Streak/badge wording must not shame users or imply clinical conclusions.

### 5.4 Profile / Settings

Small profile card/avatar; optional single Bowi motivational accent; brief target and body summaries; settings presented as familiar rows with icons and chevrons. Profile may link to nutrition goals, body data, weight logs, preferences, security, privacy, help, and future premium. Avoid simultaneously duplicating complete progress screens inside Profile.

**Actual behavior:** account deletion, data export, privacy and pending-sync warning must follow approved functional/technical spec rather than mockup placeholders.

### 5.5 Welcome / Authentication

Welcome should feel inviting, with official Bowi artwork and one primary CTA. Login/register forms are compact, accessible, and include email/password plus provider options according to [auth-spec.md](../03-features/auth-spec.md) and platform support. Recovery/verification are separate functional states; concise copy but keep necessary error, consent and security explanations. **Authentication takes place before personal profile onboarding.**

The previously generated storyboard accidentally placed a goal-selection screen among marketing/auth screens. Treat that as visual inspiration only: **personal goal selection belongs after successful auth**. Use actual supported provider setup and never simulate successful sign-in.

### 5.6 Personalization Onboarding

**Latest approved visual:** minimal text, compact inputs, one dominant question per step, understated progress dots, selected cards and optional Bowi illustration. Avoid lengthy subtitles and multiple informational cards on every screen.

**Agreed behavior:** supported adults 18+ only; age/body measures, optional body-type illustration after measures, one activity question, required weight goal for cutting/bulking. Targets are AUTO only; invalid results remain pending/review without false targets or LOG_ONLY fallback. Email verification is optional, including onboarding and main features. Name/username optional in Profile; private draft and server completion follow canonical specs. Notification permission remains optional.

**Caution:** body types must not be used to calculate nutrition needs. Labels like ectomorph/mesomorph/endomorph in concept art are neither a validated metabolic model nor a reason to present idealized bodies. Inclusive physiological-parameter handling and unsupported-user paths must follow onboarding and nutrition-engine specs. The mockup's 2,100 kcal, macro values, ages and weights are only illustrations.

## 6. Bottom navigation / route behavior

Provisional visual structure: **Home / Makanan / Progress / Profil / AI**. Use a compact rounded navigation treatment and a clearly indicated active tab. A floating plus affordance may be considered where it performs a real **manual Add Food** action. **Do not make the prominent plus button synonymous with a currently unavailable AI feature.** If AI tab is displayed before launch, it must be an honest, non-deceptive placeholder, with behavior approved separately. Don't infer that AI premium or camera scanning works from artwork.

Account/route gating follows [navigation-spec.md](navigation-spec.md) and [auth-spec.md](../03-features/auth-spec.md); buttons and tabs must have functional destinations, accessible labels and appropriate back behavior. Consider keyboard, safe areas and bottom gesture inset.

## 7. Global visual and data states

Every screen specification should include at least relevant variants:

- `INITIAL_LOADING`, `READY`, `EMPTY`, `ERROR`, `RETRY`.
- `OFFLINE_LOCAL`, `SYNC_PENDING`, `SYNCING`, `SYNCED`, `SYNC_FAILED` where private data changes are involved.
- `PARTIAL_NUTRITION` and `UNKNOWN_VALUE` vs measured zero.
- `NO_TARGET`, `TARGET_PENDING_REVIEW`, `TARGET_OVER/UNDER` where applicable for eligible profiles/history; no active `LOG_ONLY` state in MVP.
- `NOT_AUTHENTICATED`, `ONBOARDING_IN_PROGRESS`, `EMAIL_UNVERIFIED`; unverified email is informational and does not block onboarding or main features. Sensitive operations still follow Firebase reauthentication rules.
- Accessibility: long localized text, dynamic font scaling, screen reader, reduced motion, small screens, dark mode only if later approved.

**Design constraint:** communicate errors, uncertainty and unsynced changes with short text + icon/indicator; do not depend on color or purely decorative rings.

## 8. Approval vs outstanding review register

### Approved visual principles

- Six named screen groups and their referenced mockups are the current reference baseline.
- Home three circular macro indicators **have no food icons**, center percentages, quantity below.
- Progress uses three compact **concentric semicircular arcs** for macro summary.
- Onboarding has short copy and compact inputs.
- Global compact sizing and more negative space.
- Official logo and Bowi; icons/mascot used selectively.

### Proposals / still open (DO NOT IMPLEMENT AS FINAL WITHOUT OWNER REVIEW)

- Exact token shades, font weight/size scale, ring diameters/stroke, shadow/radius values, all needing device/contrast review.
- Bottom navigation: placement of AI vs central plus; whether AI tab is visible at all; icon assets and touch targets.
- Food photography assets, image source rights, camera/barcode and AI feature availability.
- Calendar exact shape and target overrun visuals; optional daily completion is approved, but placement and changes after edit/delete remain OPEN (D10/B10).
- Full screen-by-screen wireframes and high-fidelity interaction states; confirmation dialogs and unsaved-form behavior.
- Eligibility screening details and nutrition coefficients; legal/privacy approval and sensitive-operation security tests. Email verification is already optional.
- Offline integration tests: server-ordered LWW design is settled; typed sync payload, owner idempotency/cursor concurrency and SQLCipher security verification remain OPEN.

## 9. Implementation acceptance checklist for Codex

- [ ] Uses **official** logo and mascot assets, not generated approximations.
- [ ] Implements semantic theme tokens and `AppText` / `AppIcon` wrappers; no repeated literal palette/font choices in feature screens.
- [ ] Home and Progress use **their separately approved ring patterns**.
- [ ] All layouts reviewed on at least one compact phone and one large phone with safe areas.
- [ ] Interactive touch areas remain accessible even with compact visual controls.
- [ ] Screens use concise Indonesian labels and preserve necessary legal/health/accessibility content.
- [ ] Functional state display matches data semantics for empty, partial, offline and unsupported profiles.
- [ ] No mockup values, fake clinical targets, or unimplemented AI/camera features appear as live capabilities.
- [ ] Layout uses approved pattern; differences are documented with rationale rather than arbitrarily copying older designs.
- [ ] Visual changes do not rewrite [business-rules.md](../00-overview/business-rules.md), [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), or feature specs without explicit approval.
- [ ] Screenshot review and user approval are requested before marking final UI implementation complete.

## 10. Related documentation and next steps

Existing documents to **retain**, not overwrite:

- [docs/01-design/design-system.md](design-system.md) — design tokens, typography/icon proposals.
- [docs/01-design/home-ui-direction.md](home-ui-direction.md) — Home specification; the approved Home amendments are recorded in sections 5.1 and 8 of this summary (no separate Home approval-note file is present).
- [docs/01-design/food-ui-direction.md](food-ui-direction.md) — food screens.
- [docs/01-design/navigation-spec.md](navigation-spec.md) — screen inventory and routing.
- [docs/01-design/onboarding-spec.md](onboarding-spec.md) — onboarding flow/state.
- [docs/03-features/dashboard-spec.md](../03-features/dashboard-spec.md), [food-logging-spec.md](../03-features/food-logging-spec.md), [progress-spec.md](../03-features/progress-spec.md), [profile-spec.md](../03-features/profile-spec.md), [auth-spec.md](../03-features/auth-spec.md) — behaviors.
- [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), [food-database-spec.md](../02-architecture/food-database-spec.md), [offline-sync-spec.md](../02-architecture/offline-sync-spec.md) — supporting data rules.

**Recommended next:** review this register and assets in the repository; make an explicit decision about the fifth AI tab / primary Add Food action; produce small-screen and normal-screen wireframes with empty/filled/offline cases, then build a reusable theme/component foundation in Expo. Document missing/blocked architecture, privacy and medical decisions separately; do not treat visual approval as permission to ship unreviewed clinical functionality.

**Change control:** any future UI revision should record: screen, old behavior, requested change, reason, impact on shared components, revised mockup/reference, owner approval date. Avoid rewriting historic approvals silently.
