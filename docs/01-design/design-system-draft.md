# NUTRASA — Design System Draft (Proposal, not approved)

See `ASSET_PLACEMENT_GUIDE.md` for source palette, fonts and icon choices.

## Visual intent
Warm cream surfaces, forest green identity, leaf-green positive accents, orange used sparingly; rounded UI with readable hierarchy. Bowi is the canonical mascot.

## Architecture
Single entrypoint: `src/theme/index.ts` exports colors, typography, spacing, radii and shadows. `src/components/ui/AppIcon.tsx` is the only icon-provider adapter. `AppText` renders typography variants; buttons, inputs, meal cards, nav tabs and nutrition charts depend on semantic tokens, not direct hex values.

## Pending approval
Font candidate (Plus Jakarta Sans), semantic color tokens and accessibility contrast, dark-mode scope, five-tab navbar with AI placeholder, tab bar floating vs fixed, responsive behavior, icon stroke width, mascot usage.

## Do not conflate
Nutrition chart semantics (under goal, above goal, unknown) must not be encoded using color alone.
