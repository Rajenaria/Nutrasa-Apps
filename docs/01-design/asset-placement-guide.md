# NUTRASA — Asset Placement Guide

This ZIP contains a **proposed file arrangement**, not an Expo application. Extract into the project root `nutrasa/`, merging only the included `assets/` and `docs/` folders. Preserve existing `README.md`, `AGENTS.md` and app configuration.

## Canonical assets
- `assets/branding/logo/`: the **eight supplied final logo variants** (4 PNG + 4 SVG). Use the Forest/Dark version on cream/light backgrounds and the Cream/Light version on dark forest backgrounds **after visual contrast review**. Do not confuse the descriptive file suffix with its background purpose; preview before applying.
- `assets/branding/mascot/bowi/mvp-states/`: **nine** core pose PNGs (default, loading, processing, success, error, empty, not-found, no-internet, syncing).
- `assets/branding/mascot/bowi/extended-states/`: **eleven** optional pose PNGs; use only when the associated UX actually exists.
- `docs/01-design/references/`: exploratory UI screenshots and moodboards, **not runtime assets**.
- `docs/01-design/visual-reference-guidelines.md`: original guidelines supplied in the ZIP; these should govern interpretation of reference material.

## Typography / icons (proposals; approval required)
- Primary text font: **Plus Jakarta Sans** (Google Fonts; package `@expo-google-fonts/plus-jakarta-sans`) for friendly, modern Indonesian UI. Alternative: Nunito Sans. Check rendering, coverage and license before final adoption.
- Icon library: **lucide-react-native** with compatible `react-native-svg`, installed using Expo-compatible versions (`npx expo install react-native-svg`, then compatible `lucide-react-native`). Centralize icon names in `src/components/ui/AppIcon.tsx` and never import icons independently across screens.
- Centralize fonts in `src/theme/typography.ts`, color in `src/theme/colors.ts`, spacing in `src/theme/spacing.ts`, and visual component variants in shared UI primitives. Do not hardcode font families or hex colors throughout screens.
- Expo docs recommend `expo-font`; for development with Expo Go, runtime font loading is possible; for native builds, config-plugin embedding is preferred. Keep all font licensing and version choices documented.

## Proposed palette (NOT APPROVED)
These are candidate design tokens based on the supplied logo SVG colors and overall moodboards, not necessarily literal color values from every moodboard.
| token | candidate |
|---|---|
| forest/900 | `#063B2E` |
| forest/700 | `#176B4D` |
| leaf/500 | `#4C9B63` |
| leaf/300 | `#94C66A` |
| orange/500 | `#FF8D25` |
| orange/300 | `#FFBB4B` |
| text/primary | `#073D30` |
| background/cream | `#FFF9EF` (provisional derived neutral) |
| surface | `#FFFFFF` (provisional) |

Do not use `#FF8D25` for small body text on cream without checking contrast. Define accessible semantic text and state colors separately and verify on device.

## Operational guidance
1. Do **not** copy reference screenshots into app runtime assets.
2. Keep original PNG + SVG master logo files; for React Native SVG use `react-native-svg` plus conversion strategy after verifying SVG support. PNG is sufficient for initial displays.
3. Mascot PNG files are fairly large (~1 MB each). Before production create optimized derivatives **without overwriting masters**, and test transparency and rendering.
4. `assets/fonts/` can be created after picking font and reviewing its license; **do not include font binaries until adopted**.
5. Expo `icon` / `adaptiveIcon` / splash assets need platform-specific dimensions and transparency/background review; do not point to an arbitrary logo PNG without preparing these deliverables.
6. Document all component mapping and palette decisions in `docs/01-design/design-system.md` once approved.

## Agent rule
Official logo and Bowi pose files are canonical. Screenshots are directional references: improve layout, accessibility, card hierarchy, tab navigation, font size and spacing freely, but do not redraw logo or mascot or change agreed product behavior.
