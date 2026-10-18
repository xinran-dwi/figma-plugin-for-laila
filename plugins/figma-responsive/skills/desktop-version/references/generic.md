# Generic desktop rules (any product)

The desktop style always comes from the user's own file, in this order:

1. **A preset**, when the screen matches one (`presets/*.md`, e.g. Dagiga). The preset's measured values win.
2. **Desktop screens already in the file.** Run "Discover the desktop shell" (`snippets.md`).
   If a 1200–1920-wide frame with a side nav, top bar or content panel exists, **clone those parts**
   (nav, panels, modal style, dim layer) instead of building new ones. Match its column width and spacing by measuring it.
3. **The mobile screen alone** (no desktop screen anywhere). Build the shell from the mobile parts with the rules below.
   These were tested on a light recipe app (Inter, coral accent, tab bar, scrollers).

Default output frame: **1728×1117** (MacBook Pro 16"). Use a different size only if the user asks or the file's existing desktop frames use one.

## Shell from the mobile screen (no desktop reference)

| Mobile | Desktop |
|---|---|
| Bottom tab bar (3–5 items) | **Left sidebar, 248 wide**, full height. Fill = the tab bar's fill, 1px right border = its stroke. Padding 32 top / 20 sides, gap 32. Logo on top if the mobile header has one (moved, not copied). Each tab item becomes a horizontal row: icon + label, gap 12, padding 10/12, radius 10, FILL width, label 15. **Active item** = the label whose color differs from the others. It gets a background in its own color at 10% opacity. |
| No tab bar, only a top app bar | **Top bar, 72 tall**, full width: logo or title left, actions right, padding 0/32, bottom border like the app bar. |
| Mobile background | Frame fill (clone the mobile frame's fills). |
| Status bar, home indicator | dropped |

Content area: everything right of the sidebar (or below the top bar). **Content column = min(1200, area − 128)**, centered,
top padding 48, section gap 32 (or the mobile gap × 1.33, rounded to 8).

## Content rules

- **Header row**: the page title or greeting on the left (24 → 32). The search field (fixed 420) and avatar move into the same
  row on the right. Never keep a full-width mobile search bar on its own line.
- **Chips, filters, tabs, segmented controls**: keep all of them in one row at about the same size. **Never duplicate them.**
- **Content scrollers** (cards, tiles, media):
  1. Show exactly the real items when they fit at **1.25–2× their mobile width** (`w = (column − gaps) / count`).
  2. Otherwise pick the count that lands about 1.6× and **duplicate to fill** (report each copy).
  3. Gap = 24. Image areas scale their height by the same factor; text areas keep their height.
- **Promo or summary card** (title + text + button stacked) → **full-width horizontal banner**: text block left (fill),
  button right, padding 28/32.
- **Vertical list of similar rows** → a 2–3 column grid when the rows are cards, or a table-like list when the rows are dense.
- **Long single column of form fields** → centered card max 720, paired fields side by side.
- Detail screens, sheets, dialogs, maps and editors: see `patterns.md`.

## Type ramp (generic)

`10→12, 11→14, 12→14, 13→14, 14→15, 15→16, 16→18, 17→18, 18→22, 20→24, 22→28, 24→32, 28→36, 32→40`.
Nav labels become 15. Content placed in a side panel or modal (about phone width) keeps its mobile size.

## Font handling (all products)

Try `figma.loadFontAsync` for every font on a text node first (`setSize` helper in `snippets.md`).
If every font loads, set `fontSize`, `fontName` and `characters` directly. When a font can't load (e.g. Gotham in the
plugin runtime), fall back to `rescale()` for size and record weight and wording changes as text to-dos.

## Auto-layout gotchas confirmed in testing

- Changing a frame's `layoutMode` (vertical ↔ horizontal) resets its sizing. **Re-apply `layoutSizingHorizontal = 'FILL'`**
  (and `HUG` vertically) after the switch.
- When moving texts into a new auto-layout wrapper, set `layoutGrow = 1` on the wrapper and `FILL` on wrapping (auto-height) texts.
- Single-line text never wraps by itself. Measure `naturalWidth()` before narrowing anything that contains it.
- It's fine for a desktop page to end above the fold when the mobile has little content. **Don't stretch** items to fill
  the height. Note it in the report instead.
