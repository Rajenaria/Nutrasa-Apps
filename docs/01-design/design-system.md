# NUTRASA — Design System Specification

**Version:** 1.0 — proposed visual baseline (review required)  
**Project:** React Native + Expo + Expo Router / TypeScript  
**Repository destination:** `docs/01-design/design-system.md`  
**Source of truth:** official logo and Bowi assets inside `assets/branding/`; exploratory references inside `docs/01-design/references/`  
**Status:** Ready for UI wireframe/prototype, **not yet approved for production implementation**.

## 0. Purpose and precedence

NUTRASA is an Indonesian-first nutrition tracker. The experience should feel **warm, healthy, friendly, calm, premium-minimal, and exceptionally readable**. The UI must be functional for food logging and not visually compete with numbers.

Priority order when materials conflict:
1. Confirmed product/business rules and accessibility requirements.
2. Canonical final NUTRASA logo and Bowi mascot supplied under `assets/branding/`.
3. Decisions explicitly approved by the product owner.
4. This document's proposed reusable tokens and UI principles.
5. Exploratory screenshots, prior draft layouts, old mascot/logo variants shown inside references.

Screenshots are **directional references, not pixel-perfect implementation specifications**. Designers/agents may improve placement, legibility, interaction, contrast, and information hierarchy without changing approved product behavior. Never redesign or invent a new official logo or Bowi pose.

## 1. Visual language

- **Brand:** Forest green identity, warm cream foundation, fresh leaf accents, limited warm orange emphasis.
- **Shape:** Soft rounded cards; little to no decorative borders; gentle depth only when necessary.
- **Layout:** Spacious, one clear primary action per screen, generous whitespace, dense nutritional values organized into small comprehensible groupings.
- **Charts:** Progress-led, particularly **circular ring indicators** on Home, inspired by the owner's high-priority Cal AI screenshot. Recreate the *layout principle* rather than its exact look.
- **Mascot:** Bowi assists with explanation or states, not a persistent decoration in every card.
- **Language:** Indonesian-first, concise and nonjudgmental: "Belum ada catatan", "Tersimpan di perangkat", "Data nutrisi sebagian".

## 2. Color palette (proposed v1.0)

### 2.1 Primitive tokens

Colors below are a proposed system grounded in the provided SVG brand and warm-neutral references. Review final color assignments on real devices before approval.

| Primitive | HEX | Intended role | Origin |
|---|---|---|---|
| `forest.950` | `#06382C` | deepest brand / dark surface | official logo SVG |
| `forest.900` | `#063B2E` | brand primary / high-emphasis | official logo SVG |
| `forest.700` | `#176B4D` | interactive states | official logo SVG |
| `leaf.500` | `#4C9B63` | supportive positive accent | official logo SVG |
| `leaf.300` | `#94C66A` | subtle accent / progress | official logo SVG |
| `orange.500` | `#FF8D25` | restrained highlights | official logo SVG |
| `yellow.300` | `#FFBB4B` | restrained secondary highlight | official logo SVG |
| `cream.50` | `#FFF8EC` | warm brand cream | official logo SVG |
| `cream.100` | `#FFF9EF` | background candidate | derived neutral |
| `white` | `#FFFFFF` | card surface | conventional neutral |
| `ink.900` | `#073D30` | strong text | official logo SVG |
| `slate.600` | `#52635D` | muted text candidate | proposed |
| `line.200` | `#E5EAE3` | separator candidate | proposed |
| `danger.700` | `#A53030` | accessible error-text candidate | proposed; contrast audit required |
| `warning.800` | `#795011` | warning text candidate | proposed; contrast audit required |

### 2.2 Semantic tokens — Light

| Token | Proposed value |
|---|---|
| `color.background` | `cream.100` |
| `color.surface` | `white` |
| `color.surfaceSubtle` | `cream.50` |
| `color.textPrimary` | `forest.950` |
| `color.textSecondary` | `slate.600` |
| `color.textOnPrimary` | `white` |
| `color.primary` | `forest.900` |
| `color.primaryPressed` | `forest.700` |
| `color.accent` | `orange.500` (not small text on cream) |
| `color.border` | `line.200` |
| `color.progressTrack` | `#E8ECE8` (proposed) |
| `color.progressCalories` | `forest.700` |
| `color.progressProtein` | `forest.900` |
| `color.progressCarbs` | `leaf.500` |
| `color.progressFat` | `orange.500` |
| `color.successText` | `forest.700` |
| `color.warningText` | `warning.800` |
| `color.errorText` | `danger.700` |

Semantic nutrition colors represent **nutrient categories**, not moral evaluation of food. Over-target, unknown, and partial data must have text/icons/patterns, not solely colors. All background/text combinations need measured contrast testing; proposed colors are not certified accessible.

### 2.3 Dark mode

**Not committed for MVP.** Define token architecture that allows a dark theme, but do not fabricate dark palette or implement theme switching until separately approved. Respect platform accessibility contrast settings where practical.

## 3. Typography

**Primary candidate:** Plus Jakarta Sans via `@expo-google-fonts/plus-jakarta-sans` and `expo-font`. Fallback: platform system font until fonts are loaded or if bundling fails. Confirm family files, weight mapping, Indonesian glyph rendering, performance and font license before shipping. Fonts are not supplied with this document.

| Variant | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700 | prominent numeric or success hero |
| `title1` | 24 / 32 | 700 | top-level screen titles |
| `title2` | 20 / 28 | 700 | card headings |
| `title3` | 18 / 26 | 600 | section titles |
| `body` | 16 / 24 | 400 | main explanatory text |
| `bodyMedium` | 16 / 24 | 600 | controls, important labels |
| `secondary` | 14 / 21 | 400 | supporting UI labels |
| `caption` | 12 / 18 | 500 | footnotes, data source notices |
| `micro` | 11 / 16 | 500 | limited metadata; avoid for essential data |

- Provide adaptive font scaling; never hard-disable accessibility text scaling to preserve a mockup.
- Use tabular numerals if supported by selected font/renderer for nutrition values and charts.
- Use localized formats (`1.850 kcal`, `82,5 g`) consistently; use unit labels adjacent to values.
- Heading lengths must wrap gracefully on small phones.

## 4. Iconography

**Candidate library:** `lucide-react-native` and Expo-compatible `react-native-svg`. Use an adapter (`src/components/ui/AppIcon.tsx`) and a *semantic name mapping*, e.g. `home`, `foods`, `progress`, `profile`, `ai`, `search`, `add`, `calendar`, `offline`, `sync`, `warning`.

- Default sizes: 16 secondary / 20 standard / 24 navigation / 28 hero. Stroke width default 2; tune in one adapter.
- Tab icons must have a text label. Never use shape/color alone for active state.
- Do not import Lucide into individual feature screens; import `AppIcon`.
- Provider migration may require semantic mapping updates, but must not require edits to every screen.
- Icons do not replace nutrition numbers or error messages.

## 5. Spacing, sizing, radii, elevation

### 5.1 Spacing scale

`space: {0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48}` (dp). Use multiples and semantic aliases (`screenGutter`, `cardGap`, `sectionGap`) rather than hardcoded constants.

### 5.2 Layout

- Screen horizontal padding: 20 dp baseline, 16 dp on cramped widths when necessary.
- Section gap: 24–32 dp; between related items: 8–16 dp.
- Respect safe area, bottom tab height, keyboard avoidance, Android navigation bar, and system font scaling.
- Responsive layout: width-based adaptation, not absolute pixel-locked mockups; minimum tested compact phone width ~320 dp and large text settings.

### 5.3 Radius and shadows

- `radius.sm=10`, `md=16`, `lg=20`, `xl=24`, `pill=999` dp.
- Hero nutrient card radius 24; macro cards 20.
- Prefer contrast and spacing before shadow; use platform-appropriate lightweight shadow tokens, never scatter arbitrary elevation values through screens.

### 5.4 Touch targets

- Interactive targets at least **44×44 pt on iOS** and preferably **48×48 dp on Android**.
- Keep visual icon size independent of touch area.

## 6. Core component contracts (proposal)

| Component | Variants | Essential states |
|---|---|---|
| `AppText` | display, title, body, caption | adaptive scaling, truncation/line wrapping |
| `AppIcon` | semantic name, size | active, muted, warning |
| `AppButton` | primary, secondary, outline, text, destructive | normal, pressed, disabled, loading |
| `AppCard` | default, hero, subtle | standard, interactive, pressed |
| `AppInput` | text, number, search | idle, focus, invalid, disabled |
| `AppChip` | filter, category | selected, unselected, disabled |
| `AppTabs` | 5 core tabs | active, inactive, badge/placeholder |
| `NutritionRing` | calorieHero, macroSmall | empty, partial, under, at, over, noTarget |
| `NutritionSummary` | grouped macro stats | target available/unavailable |
| `MealSection` | breakfast, lunch, dinner, snack | empty, logging, partial, synced |
| `StatusBanner` | offline, syncing, partialData, error | persistent/dismissible where appropriate |
| `MascotState` | mapped to Bowi PNG state | empty, success, offline, error, syncing |
| `LoadingSkeleton` | card, rows, chart | loading |

Components must separate presentation from nutrition calculations and data fetching. Story/example fixtures may be used in isolated UI test or showcase code but must not masquerade as real user data in production screens.

## 7. Home dashboard — highest-priority visual reference

**Explicit owner preference:** screenshot of a clean calorie-tracking Home with a **large calorie ring**, **three mini macro rings**, restrained typography and whitespace. This reference informs **composition, proportions, and card grammar**, not branding or copy.

### 7.1 Proposed order

1. Header: NUTRASA brand / friendly greeting, selected day/date and calendar affordance.
2. Compact week strip (or calendar entry; exact treatment requires UI review).
3. **Calorie hero card:** large consumed/target/remaining text, one circular progress ring, contextual explanation.
4. **Three macro cards:** Protein, Karbohidrat, Lemak; each with value, target and mini circular ring.
5. Meal diary: Sarapan, Makan Siang, Makan Malam, Camilan; each adds food.
6. Visible notice when some nutrient data is incomplete or a log awaits sync.
7. Bottom navigation: Home, Makanan, Progress, Profil, AI (AI unavailable/placeholder decision remains open).

### 7.2 NutritionRing contract

Inputs (conceptual, not exact API): `value`, `target|null`, `unit`, `label`, `nutrient`, `dataCompleteness`, `isLoading`, `isOfflinePending`.

Rules:
- Ring fraction for valid target > 0: `min(max(value / target, 0), 1)` for track fill; **over-target must have additional explicit indicator** so clipping does not conceal excess.
- With no target (`log-only`), show consumed value and **no misleading target ring**; use neutral visualization or no ring.
- If there are **zero logs**, distinguish "Belum ada makanan dicatat" from a verified 0 nutrient value; do not claim full diary coverage.
- If a logged food is missing a nutrient, aggregate known values but label **"Data sebagian"**; don't imply exact total.
- Avoid claiming exceeding a protein target is inherently bad; use neutral category-specific wording.
- Animate conservatively; respect reduced motion preferences. Never delay availability of values for animation.
- Ring SVG must use accessible textual counterparts; screen-reader label includes nutrient, amount, target and completeness.
- Default calorie ring diameter 104–124 dp and macro ring 40–56 dp are **wireframe starting ranges**, not fixed sizes; refine for actual device widths and typographic scaling.
- SVG rings can use `react-native-svg`; keep logic and presentation separate; do not add animation libraries until necessary.

### 7.3 Reference-specific improvements

- The reference's empty state prioritizes photo upload, but NUTRASA MVP prioritizes **searching and adding Indonesian foods manually**.
- Place the main add-food action where it doesn't obscure a fifth tab or system safe-area.
- Use Bowi for meaningful onboarding, empty, success and offline moments rather than crowding the hero card.
- Use NUTRASA colors and genuine logos/mascot, never copy the reference app's branding.

## 8. Navigation appearance

Five tabs planned: `Home`, `Makanan`, `Progress`, `Profil`, `AI`. Candidate: rounded floating navigation with comfortable safe-area clearance. Confirm five-tab readability with Indonesian labels, compact devices, and screen readers.

- **Do not** treat the prominent center `+` of the reference as a sixth tab. It is a contextual action if used.
- If `AI` is not implemented, decide between a disabled `Segera Hadir` route or hiding it in MVP — **decision still open**.
- Food-logging entry points remain available from Home meal rows and Foods tab.
- Navbar behavior across keyboard, modal, and nested stacks must be documented in `navigation-spec.md` / wireframes.

## 9. Logo and mascot usage

### 9.1 Canonical assets

- `assets/branding/logo/`: eight final PNG/SVG variants (logo-only and logo+text, forest/cream filenames). **Preview on target background before choosing**; filename alone does not guarantee contrast suitability.
- `assets/branding/mascot/bowi/mvp-states/`: Default, Loading, Processing, Success, Error, Empty, Not Found, No Internet, Syncing.
- `assets/branding/mascot/bowi/extended-states/`: secondary pose inventory for later flows.

Do not trace/redraw/distort logos or mascot; maintain aspect ratio and breathing room. Avoid mascot directly behind dense nutrition text. Original images are masters; create optimized transparent derivatives for runtime as separate assets without overwriting originals.

### 9.2 State mapping

| Scenario | Canonical Bowi asset (descriptive) |
|---|---|
| New user / welcome | Default pose |
| No food yet | Empty state pose |
| Food not found | Not Found pose |
| Saving/logging processing | Processing pose |
| Save successful | Success pose |
| Offline | No Internet pose |
| Sync pending | Syncing pose |
| Error | Error pose |

Use smaller inline graphics for simple loading states. Mascot is never a replacement for visible retry/help text.

## 10. UI states and accessibility

Every screen/component that performs data actions needs: initial loading, content, empty, validation error, recoverable error, offline/pending sync, disabled, and success where applicable. Nutrition-specific: log-only (no goal), unknown nutrient, partial-data nutrient, over-target, historical target version.

- Color cannot be the only differentiator: add concise text/icon.
- Contrast: target WCAG AA as a design audit benchmark (normal text 4.5:1; large text 3:1), and test interactive controls/focus states. Native platform accessibility requirements also apply.
- Honor system text sizes, screen-reader labels/hints and reduce-motion settings.
- Large calendar days and macro rings must have accessible non-chart equivalents.
- Use friendly/nonjudgmental feedback: avoid red danger treatment just because someone exceeded an ordinary calorie target.
- Support Indonesian decimal/thousands formatting and readable units; do not truncate error or sync warnings.

## 11. Suggested technical ownership (do not implement yet)

```text
src/
  theme/
    colors.ts         # primitives + semantic light tokens
    typography.ts     # font family, size, weight, line-height
    spacing.ts        # spacing + layout aliases
    radii.ts          # radius tokens
    shadows.ts        # platform shadow tokens
    index.ts          # export public theme API
  components/ui/
    AppIcon.tsx        # Lucide mapping adapter
    AppText.tsx        # semantic text variants
    AppButton.tsx
    AppCard.tsx
    NutritionRing.tsx # SVG presentation only
    StatusBanner.tsx
```

Implementation principles:
- Feature screens use `theme` and shared UI primitives, not raw HEX codes or direct icon imports.
- Home-specific layout stays inside `src/features/dashboard/` and composes shared components.
- Do not add an entire third-party component framework unless shown necessary by wireframe work.
- Use Expo-compatible package versions and test in a development build for native integration where needed.
- Record all implementation choices in architecture decision log.

## 12. Design handoff / acceptance tests

- [ ] Canonical logo and Bowi assets are referenced correctly; references are not bundled into app runtime.
- [ ] Primitive + semantic palette with explicit naming exists in proposed Figma/components spec.
- [ ] Each major foreground/background pair is contrast checked on light theme.
- [ ] Home shows calorie hero circular ring + three macro mini-rings with readable numbers.
- [ ] Progress states handle no-target, empty, partial, over-target, and loading.
- [ ] Home has manual food-add path (not camera-dependent).
- [ ] Five-tab nav is legible on compact screen, with consistent touch targets.
- [ ] Text supports screen readers and large font settings.
- [ ] Font/icon replacement occurs through typography tokens / icon adapter rather than screen rewrites.
- [ ] At least one compact Android and one iPhone layout inspected.
- [ ] Explicit visual approval recorded before mass UI implementation.

## 13. Decision register

| ID | Question | Proposed default | Status |
|---|---|---|---|
| DS-01 | Primary typography | Plus Jakarta Sans | Pending owner approval / license check |
| DS-02 | Icon family | Lucide via adapter | Pending owner approval |
| DS-03 | Primary palette and semantic mapping | Forest + cream + leaf + restrained orange | Pending contrast + owner approval |
| DS-04 | Home progress indicators | Hero ring + 3 macro rings | Preferred by owner; precise dimensions pending |
| DS-05 | Floating vs fixed bottom nav | Floating, if five labels fit accessibly | Pending prototype |
| DS-06 | AI placeholder tab | Visible vs hidden | Pending product owner decision |
| DS-07 | Dark mode | Deferred / architecture prepared | Pending decision |
| DS-08 | Typography licensing / embedding | Review before install | Pending technical verification |
| DS-09 | Splash and app icons | Prepare platform-specific exports | Pending asset production |
| DS-10 | Home calendar form | Week strip + calendar affordance | Pending wireframe review |

## 14. Next work item

Create `docs/01-design/home-ui-direction.md` plus low-fidelity wireframe(s) for Home using the user's circular-ring screenshot as **top-priority compositional reference**. Then review color pairs and navigation on mobile screen widths before finalizing the high-fidelity component variants.

**Do not instruct Codex to generate every screen yet.** This v1.0 document specifies proposed visual rules, not sign-off on all UI details or the medical/nutrition rules.
