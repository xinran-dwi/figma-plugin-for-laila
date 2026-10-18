# Tested `use_figma` snippets

All of these ran successfully against the reference file. No state persists between `use_figma` calls: paste the
**prelude** at the top of every write script and pass node IDs between calls as string literals.

## Hard limits found while testing (read first)

| Operation on Gotham text (font not available to the plugin runtime) | Works? |
|---|---|
| `clone()`, `appendChild`, move, `remove()` | ✅ |
| `layoutSizingHorizontal = 'FILL'`, `layoutGrow = 1`, `resize()` of a fixed-width box | ✅ |
| Recolor `fills` (e.g. rail active state) | ✅ |
| **`rescale(factor)`**: changes the font size (16 → 24 with `rescale(1.5)`) | ✅ use this for every size change |
| `fontSize =`, `setRangeFontSize`, `fontName =` (weight), `characters =` | ❌ "unloaded font" |
| `textAutoResize =` (e.g. single-line → wrapping) | ❌ |
| `figma.loadFontAsync({family:'Gotham'})` | ❌ font doesn't exist in this runtime |

Which fonts load depends on the file. In the Dagiga file Cairo and SF Pro loaded, Gotham did not. In the generic test
file Inter loaded. Never assume: `editText()` below tries to load and falls back.

Consequences:
- **Change sizes with `rescale()` on each TEXT node, one at a time** (`scaleTextNode`). It works for every font, loaded or
  not, and gives exact sizes (`rescale(target / current)`). Never rescale a non-auto-layout group that contains
  several texts. Its children's positions scale too, and nested text ends up tiny or misplaced.
- **Weight, wording and wrap mode go through `editText()`.** It applies the change when the fonts load. Otherwise it
  records a **text to-do** in shared plugin data (namespace `webversion`, key `todo`). The companion Figma plugin
  The Desktop Version Figma plugin applies those to-dos automatically when it opens with the user's local fonts. Format:
  `{ "fontFamily"?: string, "fontStyle"?: string, "characters"?: string, "textAutoResize"?: "HEIGHT"|"WIDTH_AND_HEIGHT", "reason": string }`
- **Single-line text can't be made to wrap.** Before narrowing a column, measure its natural width (`naturalWidth`
  below) and size the column to at least that.
- Other facts:
  - A `use_figma` script that throws is **rolled back completely**, so retrying is safe.
  - `figma.currentPage.selection` is empty inside `use_figma`. Use the link's node-id or `get_metadata`'s selection block.

## Prelude (paste at the top of every write script)

```js
// Pick the ramp for this run: the preset's when one applies, otherwise generic.
const DAGIGA_RAMP = { 10: 12, 11: 12, 12: 14, 13: 14, 14: 16, 16: 16, 18: 20, 20: 24, 24: 24 };
const GENERIC_RAMP = { 10: 12, 11: 14, 12: 14, 13: 14, 14: 15, 15: 16, 16: 18, 17: 18, 18: 22, 20: 24, 22: 28, 24: 32, 28: 36, 32: 40 };
const TYPE_MAP = GENERIC_RAMP; // or DAGIGA_RAMP
const LIME = { r: 0xd3 / 255, g: 0xde / 255, b: 0 };
const WHITE = { r: 1, g: 1, b: 1 };
const sameColor = (a, b) => Math.abs(a.r - b.r) < 0.02 && Math.abs(a.g - b.g) < 0.02 && Math.abs(a.b - b.b) < 0.02;
const clonePaints = p => JSON.parse(JSON.stringify(p));
const inAutoLayout = n => n.parent && 'layoutMode' in n.parent && n.parent.layoutMode !== 'NONE' && n.layoutPositioning !== 'ABSOLUTE';

// Font size change that works without the font loaded. target = explicit size, or TYPE_MAP lookup.
function scaleTextNode(t, target) {
  let cur = t.fontSize;
  if (typeof cur !== 'number') cur = t.getStyledTextSegments(['fontSize'])[0].fontSize;
  const to = target ?? TYPE_MAP[cur] ?? cur;
  if (to === cur) return;
  const h = inAutoLayout(t) ? t.layoutSizingHorizontal : null;
  t.rescale(to / cur);
  if (h === 'FILL') t.layoutSizingHorizontal = 'FILL';
}
const scaleAllText = root => { for (const t of root.findAllWithCriteria({ types: ['TEXT'] })) scaleTextNode(t); };

// After widening a container: wrapping text with a FIXED mobile width must follow the new width.
function widenWrappingText(root) {
  for (const t of root.findAllWithCriteria({ types: ['TEXT'] })) {
    if (t.textAutoResize !== 'HEIGHT' || !inAutoLayout(t) || t.layoutSizingHorizontal !== 'FIXED') continue;
    if (t.parent.layoutMode === 'HORIZONTAL') t.layoutGrow = 1; else t.layoutSizingHorizontal = 'FILL';
  }
}

// Position by VISUAL bounds. Required for rotated nodes (arrow buttons, ✕ icons), whose x/y is not their top-left.
function placeVisual(node, frame, x, y) {
  const fb = frame.absoluteBoundingBox, b = node.absoluteBoundingBox;
  node.x += (fb.x + x) - b.x; node.y += (fb.y + y) - b.y;
}

// Narrowest width a container can take without clipping its non-reflowing text.
function naturalWidth(container) {
  const cx = container.absoluteBoundingBox.x; let need = 0;
  for (const t of container.findAllWithCriteria({ types: ['TEXT'] })) {
    if (!t.visible || (t.textAutoResize === 'HEIGHT' && t.layoutSizingHorizontal === 'FILL')) continue;
    const b = t.absoluteBoundingBox; need = Math.max(need, b.x + b.width - cx);
  }
  return Math.ceil(need);
}

const recolorPaints = (paints, from, to) => Array.isArray(paints)
  ? paints.map(p => p.type === 'SOLID' && sameColor(p.color, from) ? { ...p, color: to } : p) : paints;

const report = { pattern: '', style: '', dropped: [], duplicates: [], reused: [], expanded: [], textTodos: [], notes: [] };

// Font-aware text edit: applies directly when every font on the node loads, else leaves a to-do for the helper plugin.
const fontOk = new Map();
async function canLoad(fn) {
  const k = fn.family + '|' + fn.style;
  if (!fontOk.has(k)) { try { await figma.loadFontAsync(fn); fontOk.set(k, true); } catch (e) { fontOk.set(k, false); } }
  return fontOk.get(k);
}
async function editText(t, change /* { fontFamily?, fontStyle?, characters?, textAutoResize?, reason } */) {
  const fonts = t.getStyledTextSegments(['fontName']).map(s => s.fontName);
  let ok = true;
  for (const f of fonts) if (!(await canLoad(f))) ok = false;
  const target = { family: change.fontFamily || fonts[0].family, style: change.fontStyle || fonts[0].style };
  if ((change.fontFamily || change.fontStyle) && !(await canLoad(target))) ok = false;
  if (ok) {
    if (change.fontFamily || change.fontStyle) t.fontName = target;
    if (change.characters !== undefined) t.characters = change.characters;
    if (change.textAutoResize) t.textAutoResize = change.textAutoResize;
    return true;
  }
  t.setSharedPluginData('webversion', 'todo', JSON.stringify(change));
  report.textTodos.push({ id: t.id, text: t.characters.slice(0, 40), change });
  return false;
}
```

## Inspect the mobile frame (read-only)

```js
const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const paints = arr => Array.isArray(arr) ? arr.filter(f => f.visible !== false).map(f => f.type === 'SOLID' ? hex(f.color) + ((f.opacity ?? 1) < 1 ? '@' + f.opacity.toFixed(2) : '') : f.type).join(',') : 'mixed';
function dump(n, depth, maxDepth, lines) {
  if (!n.visible) return;
  let s = `${'  '.repeat(depth)}${n.type} "${n.name}" ${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.width)}x${Math.round(n.height)}`;
  if (n.rotation) s += ` rot${Math.round(n.rotation)}`;
  if ('layoutMode' in n && n.layoutMode !== 'NONE') s += ` AL:${n.layoutMode[0]} gap${n.itemSpacing} pad${[n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join('/')} align:${n.primaryAxisAlignItems}/${n.counterAxisAlignItems}`;
  if (inAL(n)) s += ` child:${n.layoutSizingHorizontal}/${n.layoutSizingVertical}`;
  if ('fills' in n) { const p = paints(n.fills); if (p) s += ` fill[${p}]`; }
  if ('strokes' in n) { const p = paints(n.strokes); if (p) s += ` stroke[${p}]`; }
  if ('cornerRadius' in n && typeof n.cornerRadius === 'number' && n.cornerRadius) s += ` r${n.cornerRadius}`;
  if (n.type === 'TEXT') s += ` "${n.characters.slice(0, 45).replace(/\n/g, '⏎')}" ${typeof n.fontName === 'symbol' ? 'mixed' : n.fontName.family + ' ' + n.fontName.style} ${typeof n.fontSize === 'number' ? n.fontSize : 'mixed'} auto:${n.textAutoResize}`;
  lines.push(s);
  if ('children' in n && depth < maxDepth) for (const c of n.children) dump(c, depth + 1, maxDepth, lines);
}
function inAL(n) { return n.parent && 'layoutMode' in n.parent && n.parent.layoutMode !== 'NONE'; }
const m = await figma.getNodeByIdAsync('MOBILE_ID');
const lines = []; dump(m, 0, 4, lines);
return lines.join('\n');
```

Signals to note: the Tab Bar's lime label (active tab), any row wider than the frame (scroller), "Show"/"See more" rows, a dot row of ellipses (carousel), ✕ vs. back, Arabic-dominant text (RTL), and rotated nodes.

## Discover the desktop shell in the current file (read-only, no IDs needed)

```js
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const desktops = figma.currentPage.children.filter(n => n.type === 'FRAME' && near(n.width, 1728, 2) && near(n.height, 1117, 2) && !/— (Web|Desktop)/.test(n.name));
return desktops.map(d => {
  const kids = d.children.filter(c => c.visible);
  const pick = f => { const k = kids.find(f); return k ? k.id : null; };
  const modal = pick(c => c.type === 'FRAME' && c.width >= 500 && c.width <= 900 && Array.isArray(c.strokes) && c.strokes.length && c.x > 300);
  const sidePanel = pick(c => c.type === 'RECTANGLE' && near(c.width, 600, 40) && c.x > 1000 && c.height > 1000);
  const main = pick(c => c.type === 'FRAME' && c.x > 60 && c.x < 120 && c.width > 1500 && c.height > 1000);
  return { name: d.name, id: d.id,
    rail: pick(c => c.type === 'FRAME' && c.width <= 80 && c.x < 40 && c.height > 900),
    main, modal, sidePanel,
    dim: pick(c => (c.type === 'VECTOR' || c.type === 'RECTANGLE') && c.width >= 1700 && c.opacity < 1),
    close: pick(c => /Multiplication|Remove-Circle|close/i.test(c.name) && c.width <= 32),
    kind: modal ? 'modal-over-backdrop' : sidePanel ? 'detail-panel' : main ? 'shell-dashboard' : 'unknown' };
});
```

Use a `shell-dashboard` frame as the default **backdrop** for overlays and as the source of `rail` + `main`.
Detail-specific parts (arrow buttons, thumbnails, side panel bg) come from a `detail-panel` frame. Modal style comes from a `modal-over-backdrop` frame.
If the file has **no** desktop frame, build the shell from the mobile screen: see "Sidebar from the tab bar" below and
`generic.md`. Detection also covers other desktop sizes: widen the width check to 1200–1920 when 1728 finds nothing.

## Place the new frame (right of the mobile, else a free spot)

```js
const mobile = await figma.getNodeByIdAsync('MOBILE_ID');
const W = 1728, H = 1117, GAP = 80;
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const others = figma.currentPage.children.filter(n => n.id !== mobile.id);
let spot = { x: mobile.x + mobile.width + GAP, y: mobile.y, width: W, height: H };
if (others.some(n => overlaps(spot, n))) {
  const bottom = Math.max(...figma.currentPage.children.map(n => n.y + n.height));
  spot = { x: 0, y: bottom + 400, width: W, height: H };
  report.notes.push('the space right of the mobile frame was taken; placed below the existing content');
}
```

## Shell cloned from an existing desktop frame: frame + rail with the active item + main panel + content column

```js
const ref = await figma.getNodeByIdAsync('DASHBOARD_DESKTOP_ID');
const F = figma.createFrame();
F.name = mobile.name + ' — Desktop';
F.resize(1728, 1117); F.x = spot.x; F.y = spot.y;
F.fills = clonePaints(ref.fills);
F.cornerRadius = typeof ref.cornerRadius === 'number' ? ref.cornerRadius : 0;
F.clipsContent = true;

const rail = (await figma.getNodeByIdAsync('RAIL_ID')).clone();
F.appendChild(rail); rail.x = 23; rail.y = 24; rail.name = 'Rail';
// Active item = Tab Bar label filled lime (null when the mobile has no tab bar → keep the rail as cloned)
const tabBar = mobile.findOne(n => /tab ?bar/i.test(n.name));
const activeTab = tabBar && tabBar.findAllWithCriteria({ types: ['TEXT'] }).find(t => Array.isArray(t.fills) && t.fills.some(f => f.type === 'SOLID' && sameColor(f.color, LIME)));
if (activeTab) {
  const label = activeTab.characters.trim().toLowerCase();
  for (const t of rail.findAllWithCriteria({ types: ['TEXT'] })) {
    const on = t.characters.trim().toLowerCase() === label;
    const [from, to] = on ? [WHITE, LIME] : [LIME, WHITE];
    t.fills = recolorPaints(t.fills, from, to);
    for (const v of t.parent.findAll(n => n !== t)) {
      if ('strokes' in v) v.strokes = recolorPaints(v.strokes, from, to);
      if ('fills' in v && v.type !== 'FRAME') v.fills = recolorPaints(v.fills, from, to);
    }
  }
}
const main = (await figma.getNodeByIdAsync('MAIN_ID')).clone();
for (const c of [...main.children]) c.remove();
F.appendChild(main); main.x = 87; main.y = 0; main.name = 'Main';
const col = figma.createAutoLayout('VERTICAL', { name: 'Content', itemSpacing: 31 });
col.fills = [];
main.appendChild(col); col.x = 101; col.y = 61;
col.resize(1440, col.height); col.counterAxisSizingMode = 'FIXED';
```

The rail's labels are wider than the 41px rail in the source design itself. That is not an overflow to fix.

## Sidebar from the tab bar (no desktop reference in the file; tested on the generic test file)

```js
const tabBar = mobile.findOne(n => /tab ?bar|bottom ?nav|navigation bar/i.test(n.name));
const tabItems = tabBar.children.filter(c => c.visible);
// active tab = the item whose label color is unique
const colorKey = it => { const t = it.findOne(n => n.type === 'TEXT'); const c = t.fills[0].color; return [c.r, c.g, c.b].map(v => v.toFixed(2)).join(); };
const counts = {}; for (const it of tabItems) counts[colorKey(it)] = (counts[colorKey(it)] || 0) + 1;
const active = tabItems.find(it => counts[colorKey(it)] === 1);
const accent = active ? active.findOne(n => n.type === 'TEXT').fills[0].color : null;

const W = 1728, H = 1117, SIDEBAR = 248;
const F = figma.createFrame(); F.name = mobile.name + ' — Desktop'; F.resize(W, H);
F.x = spot.x; F.y = spot.y; F.fills = clonePaints(mobile.fills); F.clipsContent = true;
const side = figma.createAutoLayout('VERTICAL', { name: 'Sidebar', itemSpacing: 32, paddingTop: 32, paddingLeft: 20, paddingRight: 20 });
F.appendChild(side); side.x = 0; side.y = 0; side.resize(SIDEBAR, H);
side.primaryAxisSizingMode = 'FIXED'; side.counterAxisSizingMode = 'FIXED';
side.fills = clonePaints(tabBar.fills); side.strokes = clonePaints(tabBar.strokes);
side.strokeWeight = 0; side.strokeRightWeight = 1; side.strokeAlign = 'INSIDE';
const logo = mobile.findOne(n => /logo/i.test(n.name));
if (logo) { side.appendChild(logo.clone()); report.dropped.push('header logo (moved to the sidebar)'); }
const nav = figma.createAutoLayout('VERTICAL', { name: 'Nav', itemSpacing: 4 });
nav.fills = []; side.appendChild(nav); nav.layoutSizingHorizontal = 'FILL';
for (const it of tabItems) {
  const c = it.clone(); nav.appendChild(c);
  c.layoutMode = 'HORIZONTAL'; c.itemSpacing = 12; c.counterAxisAlignItems = 'CENTER'; c.primaryAxisAlignItems = 'MIN';
  c.paddingLeft = c.paddingRight = 12; c.paddingTop = c.paddingBottom = 10; c.cornerRadius = 10;
  c.layoutSizingHorizontal = 'FILL';                     // re-apply AFTER the layoutMode change
  for (const t of c.findAllWithCriteria({ types: ['TEXT'] })) scaleTextNode(t, 15);
  if (it === active) c.fills = [{ type: 'SOLID', color: accent, opacity: 0.1 }];
}
const COL = Math.min(1200, W - SIDEBAR - 128);
const col = figma.createAutoLayout('VERTICAL', { name: 'Content', itemSpacing: 32 }); col.fills = [];
F.appendChild(col); col.resize(COL, col.height); col.counterAxisSizingMode = 'FIXED';
col.x = SIDEBAR + Math.round((W - SIDEBAR - COL) / 2); col.y = 48;
```

## Header row: title left, search + avatar right

```js
const headerRow = figma.createAutoLayout('HORIZONTAL', { name: 'Header', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' });
headerRow.fills = []; col.appendChild(headerRow); headerRow.layoutSizingHorizontal = 'FILL';
const title = TITLE_NODE.clone(); headerRow.appendChild(title); scaleTextNode(title);           // 24 → 32 generic
const actions = figma.createAutoLayout('HORIZONTAL', { name: 'Header actions', itemSpacing: 16, counterAxisAlignItems: 'CENTER' });
actions.fills = []; headerRow.appendChild(actions);
const search = SEARCH_NODE.clone(); actions.appendChild(search); search.resize(420, search.height);
const avatar = AVATAR_NODE.clone(); actions.appendChild(avatar); avatar.resize(44, 44);
```

## Content scroller: real items when they fit, else duplicate-fill (generic)

```js
const items = srcRow.children.filter(c => c.visible);
const GAP = 24, mw = items[0].width;
let n = items.length, w = (COL - (n - 1) * GAP) / n;
if (w > mw * 2 || w < mw * 1.25) { n = Math.max(1, Math.round((COL + GAP) / (mw * 1.6 + GAP))); w = (COL - (n - 1) * GAP) / n; }
const k = w / mw;
const row = figma.createAutoLayout('HORIZONTAL', { name: srcRow.name, itemSpacing: GAP }); row.fills = [];
section.appendChild(row); row.layoutSizingHorizontal = 'FILL';
for (let i = 0; i < n; i++) {
  const s = items[i % items.length], c = s.clone(); row.appendChild(c);
  if (i >= items.length) { c.name = s.name + ' (duplicate)'; report.duplicates.push(`${srcRow.name} #${i + 1} = copy of #${i % items.length + 1}`); }
  c.layoutSizingHorizontal = 'FILL';
  for (const ch of c.children) {
    const isMedia = ch.type === 'RECTANGLE' || (ch.type === 'FRAME' && !ch.findOne(x => x.type === 'TEXT'));
    if (isMedia) { ch.layoutSizingHorizontal = 'FILL'; ch.resize(ch.width, Math.round(ch.height * k)); }
    else if (inAutoLayout(ch)) ch.layoutSizingHorizontal = 'FILL';
  }
  scaleAllText(c);
}
```

## Stacked promo card → full-width horizontal banner

```js
const card = CARD_NODE.clone(); col.appendChild(card);
const btn = card.children.find(c => /button|cta/i.test(c.name));
const texts = card.children.filter(c => c.type === 'TEXT');
const textBlock = figma.createAutoLayout('VERTICAL', { name: 'Text', itemSpacing: 6 }); textBlock.fills = [];
card.insertChild(0, textBlock); for (const t of texts) textBlock.appendChild(t);
card.layoutMode = 'HORIZONTAL'; card.primaryAxisAlignItems = 'SPACE_BETWEEN'; card.counterAxisAlignItems = 'CENTER';
card.paddingLeft = card.paddingRight = 32; card.paddingTop = card.paddingBottom = 28;
card.layoutSizingHorizontal = 'FILL'; card.layoutSizingVertical = 'HUG';   // after the layoutMode switch
textBlock.layoutGrow = 1;
for (const t of texts) if (t.textAutoResize === 'HEIGHT') t.layoutSizingHorizontal = 'FILL';
scaleAllText(card);
```

## Hero row: primary card left half + stacked secondary cards right half

```js
const heroRow = figma.createAutoLayout('HORIZONTAL', { name: 'Hero row', itemSpacing: 24 });
heroRow.fills = [];
col.appendChild(heroRow); heroRow.layoutSizingHorizontal = 'FILL';
const primary = mobile.findOne(n => n.id === 'PRIMARY_CARD_ID').clone();
heroRow.appendChild(primary);
primary.layoutSizingHorizontal = 'FILL'; primary.resize(primary.width, 214); primary.layoutSizingVertical = 'FIXED';
primary.primaryAxisAlignItems = 'SPACE_BETWEEN';
primary.paddingTop = primary.paddingBottom = primary.paddingLeft = primary.paddingRight = 24;
scaleAllText(primary);
// mobile right-aligned action rows read better left-aligned on a wide card:
// actionsRow.primaryAxisAlignItems = 'MIN';
const side = figma.createAutoLayout('VERTICAL', { name: 'Side cards', itemSpacing: 24 });
side.fills = [];
heroRow.appendChild(side); side.layoutSizingHorizontal = 'FILL'; side.resize(side.width, 214); side.layoutSizingVertical = 'FIXED';
for (const id of ['SECONDARY_CARD_IDS']) {
  const c = (await figma.getNodeByIdAsync(id)).clone();
  side.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.layoutSizingVertical = 'FILL';
  c.primaryAxisAlignItems = 'CENTER'; scaleAllText(c);
}
widenWrappingText(heroRow);
```

If a side-scrolling pair had titles above each card ("Qitaf Points", "Promotional Code") and each card already shows
its own heading or logo, drop the outer titles (the desktop reference does). Report it.

## Scroller → full row with duplicate-fill

```js
function buildRowSection(col, titleNode, srcRow, itemW, itemH, gap, sizeItem) {
  const sec = figma.createAutoLayout('VERTICAL', { name: titleNode.characters, itemSpacing: 13 });
  sec.fills = [];
  col.appendChild(sec); sec.layoutSizingHorizontal = 'FILL';
  const title = titleNode.clone(); sec.appendChild(title); title.layoutSizingHorizontal = 'FILL'; scaleTextNode(title);
  const row = figma.createAutoLayout('HORIZONTAL', { name: titleNode.characters + ' row', itemSpacing: gap });
  row.fills = [];
  sec.appendChild(row); row.layoutSizingHorizontal = 'FILL';
  const fit = Math.floor((1440 + gap) / (itemW + gap));
  const srcs = srcRow.children.filter(c => c.visible);
  for (let i = 0; i < fit; i++) {
    const s = srcs[i % srcs.length], c = s.clone();
    row.appendChild(c);
    if (i >= srcs.length) { c.name = s.name + ' (duplicate)'; report.duplicates.push(`${titleNode.characters} #${i + 1} = copy of #${(i % srcs.length) + 1}`); }
    sizeItem(c, itemW, itemH);
  }
  return sec;
}
// Tiles (box + label): 192×222, box 192×194, icon/badge ×1.2
const sizeTile = (tile, w) => {
  tile.resize(w, tile.height);
  const box = tile.children[0]; box.resize(w, 194);
  for (const ch of box.children) ch.rescale(1.2);
  for (const t of tile.children.filter(n => n.type === 'TEXT')) { scaleTextNode(t); t.layoutSizingHorizontal = 'FILL'; }
};
// Media cards: 275×371, overlay children ×1.2, absolute badges re-pinned bottom-left
const sizeCard = (card, w, h) => {
  card.resize(w, h);
  for (const ch of card.children) {
    ch.rescale(1.2);
    if (ch.layoutPositioning === 'ABSOLUTE') { ch.x = 12; ch.y = h - 12 - ch.height; }
  }
};
```

## Overlay base: backdrop + dim

```js
const backdrop = (await figma.getNodeByIdAsync('DASHBOARD_DESKTOP_ID')).clone();
F.appendChild(backdrop); backdrop.x = 0; backdrop.y = 0; backdrop.name = 'Backdrop (' + backdrop.name + ')';
// Modal: full dim over everything (clone the existing dim layer when one exists)
const dim = (await figma.getNodeByIdAsync('DIM_ID')).clone(); F.appendChild(dim); dim.x = 0; dim.y = 0; dim.name = 'Dim';
// Detail: dim only the viewer area instead, so the rail stays crisp:
// const v = figma.createFrame(); v.name = 'Viewer'; v.resize(1041, 1117); v.fills = []; F.appendChild(v); v.x = 87; v.y = 0;
// const r = figma.createRectangle(); r.resize(1041, 1117); r.fills = [{ type: 'SOLID', color: { r: 0, g: 5 / 255, b: 41 / 255 } }]; r.opacity = 0.97; v.appendChild(r);
```

## Detail: canvas, arrows, side panel, thumbnails, pinned CTA

```js
const img = mobile.findOne(n => n.id === 'HERO_IMAGE_ID').clone();
viewer.appendChild(img); img.resize(604, 602); img.cornerRadius = 20;
img.fills = img.fills.map(p => p.type === 'IMAGE' ? { ...p, scaleMode: 'FILL' } : p);
img.x = Math.round((1041 - 604) / 2); img.y = Math.round((1117 - 602) / 2);
// arrows cloned from a detail-panel desktop frame (they are ROTATED → placeVisual)
const yC = Math.round(1117 / 2 - 28);
placeVisual(leftArrow, F, 87 + 88, yC); placeVisual(rightArrow, F, 87 + 1041 - 88 - 56, yC);
// close ✕ at x1074 y32; side panel bg clone at x1128
// Carousel dots: a row of ellipses where ONE dot has a different (active) fill. Icons like "⋯" are also ellipse rows,
// so never take the first match: require a unique-colored dot (or pick the longest row).
const dotRows = mobile.findAll(n => n.type === 'FRAME' && n.children && n.children.length > 1 && n.children.every(c => c.type === 'ELLIPSE'));
const fillKey = c => Array.isArray(c.fills) && c.fills[0] && c.fills[0].type === 'SOLID' ? [c.fills[0].color.r, c.fills[0].color.g, c.fills[0].color.b].map(v => v.toFixed(2)).join() : '';
const carousel = dotRows.find(r => new Set(r.children.map(fillKey)).size > 1) || dotRows.sort((a, b) => b.children.length - a.children.length)[0];
const dotCount = carousel ? carousel.children.length : 1;
const strip = figma.createAutoLayout('VERTICAL', { name: 'Thumbnails', itemSpacing: 4, counterAxisAlignItems: 'MAX' });
strip.fills = []; F.appendChild(strip); strip.x = 1648; strip.y = 16;
for (let i = 0; i < dotCount; i++) {
  const t = figma.createRectangle(), s = i === 0 ? 68 : 64;
  t.resize(s, s); t.cornerRadius = 12; t.fills = clonePaints(img.fills);
  t.name = i === 0 ? 'Thumb (active)' : `Thumb ${i + 1} (duplicate)`;
  if (i === 0) { t.strokes = [{ type: 'SOLID', color: LIME }]; t.strokeWeight = 1; } else report.duplicates.push(`thumbnail ${i + 1} = copy of current image`);
  strip.appendChild(t);
}
const panel = figma.createAutoLayout('VERTICAL', { name: 'Panel', itemSpacing: 24, primaryAxisAlignItems: 'SPACE_BETWEEN' });
panel.fills = []; F.appendChild(panel); panel.x = 1148; panel.y = 37;
panel.resize(490, 1056); panel.primaryAxisSizingMode = 'FIXED'; panel.counterAxisSizingMode = 'FIXED';
const top = figma.createAutoLayout('VERTICAL', { name: 'Panel content', itemSpacing: 24 });
top.fills = []; panel.appendChild(top); top.layoutSizingHorizontal = 'FILL';
// header: AL row of individually-scaled title + subtitle texts (never rescale the mobile title GROUP)
// then: line (clone a LINE from the detail desktop, FILL), action grid clone (FILL), expanded sections
// last: panel.appendChild(ctaClone); ctaClone.layoutSizingHorizontal = 'FILL';  → pinned to bottom by SPACE_BETWEEN
```

Expanded section lookup: find a visible TEXT in any desktop frame whose characters equal the collapsed row's title,
walk up to the section container, and clone it with `layoutSizingVertical = 'HUG'`.

## Modal shell (style cloned from the existing desktop modal)

```js
const refModal = await figma.getNodeByIdAsync('MODAL_ID');
const M = 742, PAD = 32;
const modal = figma.createFrame(); modal.name = 'Modal'; F.appendChild(modal);
modal.fills = clonePaints(refModal.fills); modal.strokes = clonePaints(refModal.strokes);
modal.strokeWeight = refModal.strokeWeight; modal.cornerRadius = refModal.cornerRadius; modal.clipsContent = true;
modal.resize(M, 800);
// header band: clone, resize band + its background rect to M wide
// two-column body:
const body = figma.createAutoLayout('HORIZONTAL', { name: 'Body', itemSpacing: 24 });
body.fills = []; modal.appendChild(body); body.x = PAD; body.y = BODY_Y;
body.resize(M - 2 * PAD, body.height); body.primaryAxisSizingMode = 'FIXED'; body.counterAxisSizingMode = 'AUTO';
const left = LEFT_CLONE; body.appendChild(left);
left.resize(naturalWidth(left), left.height); left.layoutSizingHorizontal = 'FIXED'; left.layoutSizingVertical = 'HUG';
const right = figma.createAutoLayout('VERTICAL', { name: 'Choices', itemSpacing: 16 });
right.fills = []; body.appendChild(right); right.layoutSizingHorizontal = 'FILL';
// append option cards + CTA to `right`, each layoutSizingHorizontal = 'FILL'
modal.resize(M, body.y + body.height + PAD);
modal.x = Math.round((1728 - M) / 2); modal.y = Math.round((1117 - modal.height) / 2);
```

## Audit (run after every build or fix, read-only)

```js
const F = await figma.getNodeByIdAsync('NEW_FRAME_ID');
const fb = F.absoluteBoundingBox, issues = [];
const skip = n => /^(Rail|Backdrop)/.test(n.name);
function walk(n, inSkipped) {
  if (!n.visible) return;
  const sk = inSkipped || skip(n);
  if (!sk && n.type === 'TEXT') {
    let p = n.parent; while (p && p.type !== 'FRAME') p = p.parent;
    const b = n.absoluteBoundingBox, pb = p.absoluteBoundingBox;
    if (b.x + b.width > pb.x + pb.width + 1 || b.x < pb.x - 1) issues.push(`text wider than its frame: "${n.characters.slice(0, 30)}" in ${p.name}`);
    if (b.y + b.height > fb.y + fb.height || b.x + b.width > fb.x + fb.width) issues.push(`text outside the 1728×1117 frame: "${n.characters.slice(0, 30)}"`);
  }
  if (!sk && 'children' in n && n.layoutMode && n.layoutMode !== 'NONE') {
    const kids = n.children.filter(c => c.visible && c.layoutPositioning !== 'ABSOLUTE');
    for (const c of kids) if (c.type !== 'LINE' && (c.width < 2 || c.height < 2)) issues.push(`collapsed: ${c.name} (${Math.round(c.width)}×${Math.round(c.height)}) in ${n.name}`);
  }
  if (!sk && n.type === 'TEXT' && typeof n.fontSize === 'number' && n.fontSize < 9) issues.push(`text too small (${n.fontSize.toFixed(1)}px): "${n.characters.slice(0, 30)}"`);
  if ('children' in n) for (const c of n.children) walk(c, sk);
}
walk(F, false);
return { issues };
```

The audit catches structure only. Always follow it with one screenshot and check by eye: alignment to the 1440 column,
equal gaps, nothing hidden behind the overlay, nothing visually tiny.
