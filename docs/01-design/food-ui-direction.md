# NUTRASA — Food Discovery & Logging UI Direction

**Version:** 1.0 — planning draft  
**Status:** FOR OWNER REVIEW; not approved as final UI  
**Destination:** [docs/01-design/food-ui-direction.md](food-ui-direction.md)\
**Platform:** React Native + Expo / Expo Router / TypeScript  
**Prepared:** 13 October 2026

## 0. Context and decision hierarchy

This document translates the approved *provisional* Home visual style to the Food tab and food-logging screens. It does not change the functional decisions in [docs/03-features/food-logging-spec.md](../03-features/food-logging-spec.md), nutrient integrity rules in [docs/02-architecture/food-database-spec.md](../02-architecture/food-database-spec.md), or route rules in [docs/01-design/navigation-spec.md](navigation-spec.md).

**Confirmed visual baseline from owner:** Home design is approved **temporarily and revisable**. Forest green + cream, lots of breathing room, soft rounded cards, and minimalist rings. For macro progress, show `Protein`, `Karbo`, `Lemak` labels, percentages inside rings, and logged/target grams below; **no macro icons**. Do not mistake this provisional approval for a locked final design system.

**Asset priority:** Official NUTRASA logo and Bowi assets in `assets/branding/` take precedence over old reference images. No invented mascot or copied competitor branding.

**MVP scope (O-18 RESOLVED):** search, Indonesian food categories, food detail, portion/date selection, food logs, food favorites, recent foods, simple custom foods, copy food logs, local save and sync status. User recipes, AI photo recognition and barcode scanning are post-MVP.

## 1. Design objectives

1. A frequent food should be loggable with very few meaningful steps.
2. Food-name and portion selection remain more prominent than illustrations or decoration.
3. Food list, food detail, and confirmation share the restrained Home visual language, but need not repeat circular rings everywhere.
4. Nutrient numbers and servings are unambiguous, especially for cooked dishes and Indonesian household units.
5. No silent assignment of a meal, date, grams-per-centong, or unknown nutrient = zero.
6. Safe under offline, stale data, incomplete nutrient source, edit/delete and navigation back.

## 2. Screen inventory & route intent

| UI surface | Purpose | Navigation expectation | Status |
|---|---|---|---|
| Food landing / picker | Fast search, recent, favorites, browse by category | Entry via Food tab or meal `+`; preserve origin date/meal | Candidate design |
| Search results | Find dishes by name and aliases | Search stays visible, clear button, return to previous query | Candidate design |
| Category browsing | Indonesian dishes grouped by ingredient/preparation | Category -> food list -> detail | Candidate design |
| Food detail | Source, food basis, nutrients and portions | Back restores search context | Candidate design |
| Add food / portion editor | Quantity, unit, date, meal, preview and save | Accessible from detail; successful save returns to origin | Candidate design |
| Recent & favorites | Quick selection of frequent foods | Reuse picker and portion editor | Confirmed feature, UI candidate |
| Custom food form | Private food creation | Draft-preserving edit, validation and save | Confirmed feature, UI candidate |
| Recipe builder | Ingredients, weights, finished yield and portions | Validation before publish to user's recipes | Post-MVP concept; not MVP approval |
| Copy meal sheet | Source and target dates/meals, preview items | Explicit confirmation and reversible result | Confirmed feature, UI candidate |
| Daily diary | Inspect/edit/delete selected day items | Return to same selected date | Confirmed feature, UI candidate |

**Routing constraint:** Expo Router path and modal boundaries are implementation choices. Draft route intent must align with [navigation-spec.md](navigation-spec.md); don't invent file paths prematurely.

## 3. Proposed Food landing layout

```text
┌───────────────────────────────────┐
│ Makanan                           │
│ [🔍 Cari nasi, rendang, ayam ...] │
│                                   │
│ Baru dicatat           Lihat semua│
│  [Nasi putih] [Ayam bakar]        │
│                                   │
│ [Favorit]    [Buat makanan]       │
│                                   │
│ Kategori                          │
│ [Nasi]       [Ayam]               │
│ [Daging]     [Ikan]               │
│ [Tahu/Tempe] [Sayuran]            │
│ [Buah]       [Camilan]            │
│ ...kategori lainnya               │
│                                   │
│         Bottom tabs               │
└───────────────────────────────────┘
```

**Layout decisions proposed:** single-column header/search, simple recent items, compact 2-column category tiles with text-first icons optional, mostly cream background and very light cards, consistent horizontal padding and typography tokens. No oversized food photography above the search. Data and layout should work with a compact screen and dynamic text size; a long category list scrolls.

## 4. Search UX and content

- Search is the visually dominant interaction and receives focus when opened from meal `+` (subject to platform keyboard behavior).
- Show query text, clear action, and results by name/alias; never require category drilldown to find a known food.
- Prefer exact/strong matches; ensure duplicates are distinguishable by preparation (`ayam goreng`, `ayam goreng tepung`, `ayam bakar`), edible portion and source where relevant.
- Result row: **food name** primary; descriptor/subtitle such as `Masakan jadi • per 100 g` secondary; optionally concise calories where data and basis permit. Avoid cluttered nutrient badges and unnecessary pictures.
- Search is debounced if querying remotely; results and previously cached catalog remain usable offline according to approved offline scope.
- No results: concise Bowi only if helpful; offer `Buat makanan sendiri` and optionally `Laporkan makanan belum ada` (reporting awaits product approval).
- States: idle prompt, searching, results, empty, offline-cache-only, request failure with retry, stale result notification, no valid food in selected category.

## 5. Food detail and portion selection

### Food detail information order
1. Food name + preparation/version distinction.
2. Source and basis (`per 100 g makanan matang` etc.) with provenance disclosure.
3. Portion picker: unit dropdown / stepper or numeric input / quantity; **only documented conversions**.
4. Nutrition preview: calories + protein, carbs, fat. `Lihat semua nutrisi` expands secondary nutrients with unavailable markers.
5. Select target date/meal if not already inherited. Visible confirmation even when inherited.
6. Primary CTA `Tambahkan ke [waktu makan]` or `Simpan catatan`.

### Portion behavior
- Editable numeric quantity with decimal support (locale-aware), positive, sensible technical bounds; error on impossible unit/empty input.
- `100 g` is a basis convention for solid foods only when relevant to the source. Be explicit about raw/cooked and edible portion.
- `1 potong`, `1 centong`, `1 porsi`, `1 mangkuk` only when backed by a food-specific conversion. Do not claim one centong has a universal gram conversion.
- Preview recalculates without mutating an already saved log. Unknown nutrients remain unknown, not `0`.
- If nutrition is partial, show a concise `Data nutrisi sebagian` affordance with optional detail.
- Missing/pending automatic targets must not produce invented rings or remaining calories. MVP accepts eligible adults 18+ only and has no LOG_ONLY mode.

### Minimal wireframe
```text
┌───────────────────────────────────┐
│ ‹  Ayam bakar kecap              │
│    Masakan jadi · per 100 g       │
│                                   │
│ Porsi                             │
│ [ 150 ]   [ gram  v ]            │
│                                   │
│  315 kcal  (illustrative only)    │
│ [Protein] [Karbo] [Lemak]         │
│ [Lihat semua nutrisi]             │
│ Sumber & kelengkapan ›            │
│                                   │
│ Untuk: [Makan Siang v]            │
│ Tanggal: [dipilih dari Home]      │
│                                   │
│ [      Tambah Makanan       ]     │
└───────────────────────────────────┘
```
**Note:** `315 kcal` above is placeholder UI content, not an approved nutrient value for ayam bakar. Never use it for seed data.

## 6. Card / chip / button style

| Pattern | Suggested treatment | Avoid |
|---|---|---|
| Search bar | Soft cream/white field; clear input and placeholder | Decorative pill shadows that conceal input affordance |
| Category | Small rounded tile, text-first, optional restrained Lucide icon | Heavy illustrations and excessive badges |
| Food result | Minimal single row + faint divider, optional nutrient subtitle | 11 nutrients in each row |
| Nutrition facts | One calorie emphasis, three aligned macro readings | Unnecessary percent rings on every result |
| CTA | Forest green, descriptive label, visible disabled/loading states | AI/camera icon for manual logging |
| Snackbar | `Tersimpan di perangkat` / `Tersinkron` as appropriate | Calling pending offline logs `Synced` |

Use `Plus Jakarta Sans` and `lucide-react-native` through centralized wrappers **as candidates** from [design-system.md](design-system.md); final library and token selection requires review before installation. Use semantic colors and focus/contrast/accessibility tests, not arbitrary hex values in individual screens.

## 7. App states & copy rules

| State | UI behavior |
|---|---|
| Empty search | `Makanan tidak ditemukan` → `Buat makanan sendiri` |
| Initial no recent foods | `Belum ada makanan yang dicatat` |
| Partial nutrition | `Sebagian informasi nutrisi belum tersedia` without 0 substitution |
| Offline | Cached search/foods available; show `Offline` if live search unavailable |
| Save pending | Show `Tersimpan di perangkat` and eventual sync result |
| Failed/rejected sync | Preserve pending work and show retry/error; concurrent valid changes follow server-ordered LWW, not manual conflict selection |
| Duplicate add tap | Disable/guard save in-flight; retries idempotent |
| Back from editor | Unsaved changes confirmation when substantive |
| Item unavailable | Show fallback, source status and safe navigation |
| Invalid serving conversion | Hide unsupported unit or ask for grams/ml |
| Long name/large font | Wrap/truncate intentionally, preserve nutritional amount and CTA |

## 8. Cross-screen consistency & implementation guidance

- Preserve `selectedLocalDate`, `mealType`, and `origin` across picker/detail/editor and back navigation. Do not convert a local diary day to UTC without policy.
- Logging must immediately update local diary and Home progress, then sync asynchronously; expose lifecycle clearly.
- Edit/delete/copy preserve nutrient snapshots and histories, as in existing functional spec.
- Simple custom foods are private in MVP; user recipes are private by default in post-MVP design. Enforce owner isolation and logout cleanup per Decision 08.
- Reusable primitives should be feature-owned first; promote to shared UI only when more than one feature has a true need.
- Do not create screens, state stores, database migrations or dependencies from this draft until UI and technical contracts are approved.

## 9. Review checklist / acceptance criteria for this DESIGN stage

- [ ] Food-tab and meal-origin flows can be walked end to end.
- [ ] Search input and primary CTA remain visible/accessible on small screens with keyboard.
- [ ] Food and serving source distinctions are readable; units are not misleading.
- [ ] All 11 nutrients are available through detail disclosure, unknown values visible as unavailable.
- [ ] Design remains lighter than Home; minimum necessary UI per screen.
- [ ] Food without image remains attractive and identifiable.
- [ ] Offline, empty, error, loading, partial, and unsaved-changes states have explicit UI treatments.
- [ ] No AI/photo tracking is shown as already functional.
- [ ] Home date/meal context is preserved after successful logging.
- [ ] Accessibility review on text scaling, screen reader labels, tap target and contrast.

## 10. Open decisions for the product owner

| Code | Choice still open | Initial recommendation |
|---|---|---|
| FOOD-UI-01 | Search results photo vs text-first | Text-first; small image only if genuine food asset exists |
| FOOD-UI-02 | Food detail portion editor embedded or bottom sheet | Embedded for clarity; evaluate prototype |
| FOOD-UI-03 | Add from food tab with no meal context | Ask selected date/meal before save |
| FOOD-UI-04 | Category tiles style | Lightweight labels with limited iconography |
| FOOD-UI-05 | Nutrient source in basic or expanded detail | Expanded section + summary completeness notice |
| FOOD-UI-06 | Favorite quick action shown in results? | In detail or swipe-safe row action, not oversized buttons |
| FOOD-UI-07 | Recipe builder layout (post-MVP only) | Separate focused screen, not forced into picker |
| FOOD-UI-08 | Copy meal flow | Preview confirmation before committing |
| FOOD-UI-09 | Dashboard `Tambah Makanan` icon | Manual-entry icon; avoid camera until AI exists |

## 11. Next deliverables

1. Product owner review of the above visual direction and open decisions.
2. Low-fidelity wireframes for MVP Food landing, Search, Detail/Portion and Copy Food Log, including states; Recipe Builder remains post-MVP.
3. High-fidelity mockups using **real official brand assets** and approved design tokens.
4. UX prototype test covering an Indonesian dish, an unavailable dish, a simple custom food and an offline save.
5. Screen-specification handoff and implementation tasks for Codex.

**Sign-off status:** Home = provisionally approved and may change. Food UI = proposed, awaiting review. Clinical/safety/food-source/licensing decisions remain subject to separate reviews.
