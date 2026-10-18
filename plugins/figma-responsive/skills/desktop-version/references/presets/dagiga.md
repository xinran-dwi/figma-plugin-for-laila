# Preset: Dagiga (measured from the hand-made pairs)

Use this preset when the screen is Dagiga AI. Signs: dark navy `#000529` background, lime `#D3DE00` accent,
Gotham text, Dagiga logo, a Tab Bar with AI Studio / Digital Writer / Explore. The user can also ask for it by name.
It **adds to** `generic.md`: where they disagree, this file wins.

All values come straight from the Figma source (layer fills and geometry), not from screenshots.
Reference file: `TDpKgJOoKW0Sch2iAUoNLa` ("Responsive Plugin (Copy)"), page "App Vs Web".
Node IDs below are valid **only in that file**. In any other file, find the same parts by
structure (see `snippets.md` → "Discover the desktop shell").

## Reference pairs

| Pattern | Desktop (1728×1117) | Mobile (402 wide) |
|---|---|---|
| Dashboard / home | `0:802` "Home Screen - Business" | `0:1757` "Home Screen - Business" |
| Detail / editor | `0:261` "Image-info-custom-description-added" | `0:134` "All actions visible with focus of content generation" |
| Sheet → modal (paywall) | `0:1070` "try for free" | `0:1639` "Subscriptions" |

Convention in the file: desktop at x=0 and mobile to its right (x≈1768–1782), with pairs stacked vertically.
The paywall desktop uses **different content** from its mobile (Monthly/Yearly plus 3 plan cards vs. tabs, features and 1 month/1 year).
Treat it as a style reference, not a layout target.

## Tokens

| Token | Value | Where |
|---|---|---|
| Desktop outer bg | `#08113C` | 1728 frame fill |
| Content panel / mobile bg | `#000529` + linear gradient | "Main" panel, mobile frames, side panel |
| Lime (active, CTA) | `#D3DE00` | active rail item, CTA pills, highlights |
| Blue | `#5070E2` | action chips at 15% fill, promo card, modal border (1px) |
| Purple | `#4F008C` | qitaf card |
| Lilac | `#E2AEFF` | "Advanced" badge |
| Text | `#FFFFFF`; ink on lime `#000529`; muted `#B3B4BF` | |
| Divider lines | stroke `#B3B4BF` (thin) | panel section separators |
| Dim overlay | `#000529` at 90% (modal) / 97% (detail viewer) | |

Fonts: **Gotham** (Book / Medium / Bold / Light) for Latin text, **Cairo** for Arabic, SF Pro in the iOS status bar.
Radii: 12 (cards and tiles on mobile), 16–18 (desktop cards), 20 (desktop image canvas), 1000 (pills).
Spacing: auto-layout gaps of 4 / 8 / 12 / 16 / 24 / 32. Card padding is 16–24.

## Desktop shell (every desktop screen)

- **Frame**: 1728×1117, fill `#08113C`, corner radius copied from an existing desktop frame, clip content.
- **Rail** (e.g. `0:804`): x23 y24, 41×1069, vertical auto-layout.
  - Logo on top.
  - Nav items: Content, AI Studio, Digital Writer, Explore, Subscriptions. Each is a 16px stroke icon plus a Gotham Book 10 label, with gap 32.
  - Bottom group: qitaf tile, Support, Settings, عربي, avatar.
  - **Active item**: label fill and icon strokes in lime `#D3DE00`. Every other item is white.
- **Main panel** (e.g. `0:897`): x87 y0, 1641×1117, fill `#000529` + gradient, radius 14, clips content.
- **Content column**: 1440 wide, centered in Main (x101), top 61. Sections are a vertical auto-layout with gap 31.
  Section = title (Gotham Bold 16 on desktop) + 13 gap + content. Bottom of content ≈ y1058.

## Mobile → desktop mapping (measured)

| Mobile | Desktop |
|---|---|
| Status bar, home indicator, bottom **Tab Bar** | dropped; the Tab Bar's lime item becomes the active rail item |
| "Hello, Name" 24 | header, same size (24) |
| Hero plan card 362×114 (r12, pad 20) | half of the 1440 row: 708×214 (r18, pad 24), actions bottom-left |
| Side-scrolling pair of small cards (qitaf, promo) | stacked in the other half, gap 24, each ≈708×95 |
| Quick-access tile 100×126 (box 100×100, icon 40) | 192×222 (box 192×194, icon 48), **7 per row**, gap 16 |
| Video card 132×171 | 275×371, **5 per row**, gap 16 |
| Section title Medium 16 | Bold 16 (weight change = text to-do, see font limits) |

Type ramp for content in the 1440 column (`TYPE_MAP` in snippets): 10→12, 11→12, 12→14, 13→14, 14→16, 16→16, 18→20, 20→24, 24→24.
Content moved into a **side panel or modal** (about phone width) keeps its mobile size.
Exceptions: the panel header title is about 20, and the modal title is 32.

## Detail / editor layout (desktop `0:261`)

- Backdrop: an existing desktop screen, left as-is (the rail stays crisp).
- Viewer: x87, 1041×1117. Dim rect `#000529` at 97%.
  - Image canvas 604×602 r20, centered in the viewer.
  - Round 56px prev/next arrows (fill `#D9D9D9` at 10%), centered vertically, 88px in from the viewer edges.
- Close ✕ (24px): x1074 y32.
- Side panel bg: x1128, 600×1118, fill `#000529` + gradient.
- Panel column: x1148 y37, 490×1056, vertical, `SPACE_BETWEEN`.
  - Top group: header row (title + actions), line, 2-column action grid (239 + 12 + 239), line, expanded sections.
  - Bottom: primary CTA (lime pill, full width).
- Thumbnail strip: x1648 y16, vertical gap 4. Active thumbnail 68×68 r12 with 1px lime stroke; others 64×64.

## Modal layout (desktop `0:1070`)

- Backdrop: an existing desktop screen. Dim layer covers all 1728×1118 at 90%, rail included.
- Modal: 742 wide, centered both ways, padding 32, r16, fill `#000529` + gradient, 1px `#5070E2` stroke.
  Content column 678.
- Title Gotham Bold 32. A close ✕ (24) sits 32px in from the top-right corner.
