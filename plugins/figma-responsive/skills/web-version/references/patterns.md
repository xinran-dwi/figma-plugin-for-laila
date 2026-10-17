# Screen-type playbook: mobile → desktop

Classify the mobile screen first, then apply one pattern. Pattern geometry below uses the Dagiga numbers (1440 column,
41px rail) where it was measured. For other products, take the shell and column sizes from `generic.md` (or from the file's
own desktop screens) and keep the pattern's **structure**.

Testing status:
- Patterns 1–3 were tested in Figma against the Dagiga hand-made pairs. Pattern 1 was also tested on a non-Dagiga app (generic mode).
- Patterns 4–7 come from the external reference pairs (Canva, Tripadvisor, Shopify, Meetup, Base). They are sound defaults, but
  they are untested, so screenshot-check them harder.

## Global rules (all patterns)

- **Keep the shell**: side nav on the left (mirrored to the right for Arabic/RTL screens), and content on the main area or
  overlay as the pattern says. Drop the status bar, home indicator and bottom tab bar. The tab bar's active item sets the
  active nav item.
- **Never redraw. Clone** the mobile layers (and existing desktop layers) and re-lay them out. Never touch the original mobile frame.
- **Use desktop width; don't stretch.** Horizontal scrollers become full rows of items at desktop size. Single columns become 2-up
  layouts. Don't scale one card to 1440 wide.
- **Short rows → duplicate to fill.** If a row holds fewer items than fit, repeat existing items in order. Name each copy
  `<name> (duplicate)` and list it in the report.
- **Collapsed → expanded.** "Show / See more" rows, accordions and carousels open up on desktop.
  - Expanded content: first look for a section with the same title in an existing desktop frame and clone it.
  - If none exists, keep the collapsed row and report it. Never invent copy.
  - Carousel dots become prev/next arrows plus a thumbnail strip.
- **Mobile-only chrome goes.** That covers back buttons (replaced by ✕ on overlays), sheet grabbers, "details" toggles for content
  the desktop always shows, buttons duplicated by the side nav (Support, Settings, Profile), and iOS keyboards and keypads.
  Every dropped element goes in the report.
- **Hierarchy grows a step** in the main content column (`TYPE_MAP`). Content inside a side panel or modal keeps its mobile size.

## 1. Dashboard / home / feed (tested: Dagiga `0:1757` → `0:802`, and the generic recipe-app test)

**Signals**: a greeting or header, a stack of sections with titles, horizontal scrollers (row wider than the frame), and a Tab Bar.

**Desktop**: shell + Main panel + 1440 content column.
- Header text.
- Hero row: the primary card on the left half, secondary cards stacked on the right half.
- One full-width row per scroller, using the scaling table in `presets/dagiga.md` (Dagiga) or the scroller rule in `generic.md`.
- If the column is too tall for 1117, reduce item heights before dropping a section.

## 2. Detail / editor (tested: `0:134` → `0:261`)

**Signals**: one large image or media item near the top, a title with a toolbar (back, pin, like, more), an action grid,
collapsed info sections, and a sticky primary CTA at the bottom.

**Desktop**: backdrop (existing desktop screen) + viewer + side panel.
- Viewer: dim + centered image canvas (604×602, image scale mode FILL so it re-crops) + arrows.
- Close ✕ at the panel edge.
- Panel (490 column): header (title about 20 + mobile action pill), line, action grid at mobile size, line, expanded sections.
- CTA pinned at the bottom (`SPACE_BETWEEN`).
- Thumbnail strip on the far right, one per carousel dot.

## 3. Sheet / paywall / dialog → modal (tested: `0:1639` → `0:1070`-style)

**Signals**: full-screen screen with a close ✕ (not back), a colored header band, segmented tabs, an option list
(radio cards), and one big CTA. Also: confirmation dialogs, pickers, and forms reached from another screen.

**Desktop**: backdrop + 90% dim over everything + a centered modal 742 wide (style cloned from the existing desktop modal).
- Header band stretched to the modal width, with the title scaled to 32.
- Tabs stay, centered. If they straddled the band edge on mobile, keep that.
- Body in **two columns**: explanatory content (feature list) on the left at its natural width, and choices + CTA on the right
  (fill). Modal height hugs the content and is centered vertically.
- Short dialogs (no long list) use one column, width 480–560.

## 4. List ↔ map / search results (untested; Tripadvisor, Meetup)

**Signals**: a search bar, filter chips, a list of result cards or a map with a "List" toggle.

**Desktop**: filters row at the top of the column, with a **split view** below it.
- Result list on the left (about 55%; cards become horizontal: image left, info right).
- Map or preview on the right (about 45%, sticky).
- Without a map: a 3–4 column card grid.
- Chips stay as chips in one row.

## 5. Form / settings / create (untested; Shopify)

**Signals**: stacked inputs, labels, toggles, a Save/Cancel pair in the header or at the bottom.

**Desktop**: shell + a centered card (max 720) on the main panel.
- Two columns when there are paired fields (first/last name, price/compare-at).
- A side column (about 320) for status or meta sections, as Shopify does with product status and publishing.
- Header actions move to the card's top-right.

## 6. Tool editor / canvas (untested; Canva)

**Signals**: a full-bleed canvas or image, and a bottom tray of tools (Crop, Adjust, Filters…) or a tool sheet.

**Desktop**: canvas centered in the main area.
- The bottom tool tray becomes a **left tool panel** next to the rail (about 320 wide; the open tool's options show as a list).
- Undo/redo and export move to a top toolbar.
- Pages or variants become a thumbnail strip under the canvas.

## 7. Numeric / transaction (untested; Base)

**Signals**: big number inputs, an on-screen keypad, percent chips, and a confirm button.

**Desktop**: modal (pattern 3, one column, about 480 wide) over the backdrop.
- **Drop the keypad**; desktop types with a keyboard.
- Inputs become wide fields, and percent chips stay in one row.

## 8. Welcome / onboarding / sign-in (tested: "let's start", generic test file `7:1551`)

**Signals**: a big illustration or photo, one headline, a short description, one main button (maybe a secondary link), and no
tab bar or lists.

**Desktop**: a split screen.
- **Left half** (864 wide): the picture, scaled to about 75% of the half's width or 62% of its height, centered on a soft tint of the
  brand color (the main button's color at about 7%). A full-bleed photo covers the whole half instead.
- **Right half**: a 440-wide column, vertically centered and left-aligned: headline at about 1.4× its desktop ramp size,
  description, then the main button at 360 wide. Secondary links go under the button.
- Drop page dots, the status bar and loose decoration below the content.

## Choosing when unsure

- Has a bottom Tab Bar and several titled sections → **1**.
- Has back + one hero media item + actions → **2**.
- Has ✕ close + colored band or options + one CTA → **3**.
- Has a big picture + headline + one button, nothing list-like → **8**.
- Can't tell what most pieces are → one clean centered column (about 640 wide, mobile order kept). Don't guess a complex layout.
- If two patterns fit, pick the one whose tested example looks closest, and say so in the report.
