// Desktop Version, Figma plugin. Built from figma-plugin/src by scripts/build-figma-plugin.sh. Edit src/, not this file.

// ---------- common.js: shared helpers (standard Plugin API only, so the engine also runs via use_figma) ----------
const DESKTOP_W = 1728, DESKTOP_H = 1117;
const DAGIGA_RAMP = { 10: 12, 11: 12, 12: 14, 13: 14, 14: 16, 16: 16, 18: 20, 20: 24, 24: 24 };
const GENERIC_RAMP = { 10: 12, 11: 14, 12: 14, 13: 14, 14: 15, 15: 16, 16: 18, 17: 18, 18: 22, 20: 24, 22: 28, 24: 32, 28: 36, 32: 40 };

const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const sameColor = (a, b, tol = 0.02) => Math.abs(a.r - b.r) < tol && Math.abs(a.g - b.g) < tol && Math.abs(a.b - b.b) < tol;
const clonePaints = p => (Array.isArray(p) ? JSON.parse(JSON.stringify(p)) : []);
const firstSolid = n => (Array.isArray(n.fills) ? n.fills.find(f => f.type === 'SOLID' && f.visible !== false) : null);
const colorKey = n => { const f = firstSolid(n); return f ? hex(f.color) : ''; };
const hasImageFill = n => Array.isArray(n.fills) && n.fills.some(f => f.visible !== false && (f.type === 'IMAGE' || f.type.startsWith('GRADIENT')));
const hasVisibleFill = n => Array.isArray(n.fills) && n.fills.some(f => f.visible !== false);
const isAL = n => n && 'layoutMode' in n && n.layoutMode !== 'NONE';
const inAL = n => n.parent && isAL(n.parent) && n.layoutPositioning !== 'ABSOLUTE';
const texts = n => (n.type === 'TEXT' ? [n] : 'findAllWithCriteria' in n ? n.findAllWithCriteria({ types: ['TEXT'] }).filter(t => t.visible) : []);
const fontSizeOf = t => (typeof t.fontSize === 'number' ? t.fontSize : t.getStyledTextSegments(['fontSize'])[0].fontSize);
const absBox = n => n.absoluteBoundingBox || { x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2], width: n.width, height: n.height };
// position of n relative to the top-left of ancestor root
const rel = (n, root) => { const b = absBox(n), r = absBox(root); return { x: b.x - r.x, y: b.y - r.y, w: b.width, h: b.height }; };

// Auto-layout frame built from the standard API (createAutoLayout is not available in plugins).
function autoLayout(dir, props = {}) {
  const f = figma.createFrame();
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.fills = [];
  f.clipsContent = false;
  for (const k of Object.keys(props)) f[k] = props[k];
  return f;
}
function fill(n, axis = 'H') { if (inAL(n)) n[axis === 'H' ? 'layoutSizingHorizontal' : 'layoutSizingVertical'] = 'FILL'; }
function hug(n, axis = 'V') { if (isAL(n) || (n.type === 'TEXT' && inAL(n))) n[axis === 'H' ? 'layoutSizingHorizontal' : 'layoutSizingVertical'] = 'HUG'; }

// Font size change that works whether or not the font is installed: rescale is exact (target / current).
function scaleTextNode(t, target) {
  const cur = fontSizeOf(t);
  if (!target || Math.abs(target - cur) < 0.01) return;
  const h = inAL(t) ? t.layoutSizingHorizontal : null;
  t.rescale(target / cur);
  if (h === 'FILL') t.layoutSizingHorizontal = 'FILL';
}
function rampText(root, ramp) { for (const t of texts(root)) { const c = Math.round(fontSizeOf(t)); if (ramp[c]) scaleTextNode(t, ramp[c]); } }

// Weight / wording / wrap changes: applied when fonts load, otherwise left as a to-do for the plugin's "Text fixes".
const _fontOk = new Map();
async function canLoad(fn) {
  const k = fn.family + '|' + fn.style;
  if (!_fontOk.has(k)) { try { await figma.loadFontAsync(fn); _fontOk.set(k, true); } catch (e) { _fontOk.set(k, false); } }
  return _fontOk.get(k);
}
async function editText(ctx, t, change) {
  const fonts = t.getStyledTextSegments(['fontName']).map(s => s.fontName);
  let ok = true;
  for (const f of fonts) if (!(await canLoad(f))) ok = false;
  const target = { family: change.fontFamily || fonts[0].family, style: change.fontStyle || fonts[0].style };
  if ((change.fontFamily || change.fontStyle) && !(await canLoad(target))) ok = false;
  if (ok) {
    if (change.fontFamily || change.fontStyle) t.fontName = target;
    if (change.characters !== undefined) t.characters = change.characters;
    if (change.textAutoResize) t.textAutoResize = change.textAutoResize;
    if (change.textAlignHorizontal) t.textAlignHorizontal = change.textAlignHorizontal;
    return true;
  }
  t.setSharedPluginData('webversion', 'todo', JSON.stringify(change));
  ctx.report.textTodos.push({ id: t.id, text: t.characters.slice(0, 40), change });
  return false;
}

// Place by VISUAL bounds (rotated nodes' x/y is not their top-left).
function placeVisual(node, frame, x, y) {
  const fb = absBox(frame), b = absBox(node);
  node.x += fb.x + x - b.x; node.y += fb.y + y - b.y;
}
// Narrowest width a container can take without clipping text that can't reflow.
function naturalWidth(container) {
  const cx = absBox(container).x; let need = 0;
  for (const t of texts(container)) {
    if (t.textAutoResize === 'HEIGHT' && t.layoutSizingHorizontal === 'FILL') continue;
    const b = absBox(t); need = Math.max(need, b.x + b.width - cx);
  }
  return Math.ceil(need);
}
// After widening: fixed-width wrapping text follows the container.
function widenWrappingText(root) {
  for (const t of texts(root)) {
    if (t.textAutoResize !== 'HEIGHT' || !inAL(t) || t.layoutSizingHorizontal !== 'FIXED') continue;
    if (t.parent.layoutMode === 'HORIZONTAL') t.layoutGrow = 1; else t.layoutSizingHorizontal = 'FILL';
  }
}
// Clone a mobile block into an auto-layout parent at full width.
function cloneInto(parent, node, { fillWidth = true } = {}) {
  const c = node.clone();
  parent.appendChild(c);
  if (c.layoutPositioning === 'ABSOLUTE') c.layoutPositioning = 'AUTO';
  if (fillWidth && inAL(c)) c.layoutSizingHorizontal = 'FILL';
  return c;
}
function svgNode(svg, size) { const n = figma.createNodeFromSvg(svg); n.resize(size, size); return n; }
const SVG = {
  chevronLeft: c => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronRight: c => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: c => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${c}" stroke-width="1.5"/><path d="M9 9l6 6M15 9l-6 6" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};
// Luminance-based ink color for generated icons and lines on a background.
function inkFor(bg) { const l = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b; return l > 0.5 ? { r: 0.1, g: 0.1, b: 0.12 } : { r: 1, g: 1, b: 1 }; }
function bgColorOf(n) { const f = firstSolid(n); if (f) return f.color; const g = Array.isArray(n.fills) && n.fills.find(p => p.type.startsWith('GRADIENT')); return g ? g.gradientStops[0].color : { r: 1, g: 1, b: 1 }; }

// ---------- normalize.js: make sense of loosely built screens ----------
// Many files are flat: dozens of loose layers, no groups, no auto-layout (a "button" is a shape + a text + an icon).
// For those, work on a hidden copy and group the loose layers into blocks the rules understand:
// Button (auto-layout frame), Text (auto-layout stack), Illustration (group). The original is never touched.
function isFlat(mobile) {
  const kids = mobile.children.filter(c => c.visible);
  if (kids.length < 8) return false;
  const structured = kids.filter(c => isAL(c) || ((c.type === 'GROUP' || c.type === 'FRAME') && 'children' in c && c.children.length >= 2 && texts(c).length));
  return structured.length < kids.length * 0.4;
}

function normalizeMobile(mobile, report) {
  if (!isFlat(mobile)) return { work: mobile, cleanup() {} };
  const work = mobile.clone();
  work.name = mobile.name + ' (desktop version work copy)';
  work.x = mobile.x; work.y = mobile.y;
  work.visible = false;
  const W = work.width, H = work.height;
  const box = n => rel(n, work);
  const area = b => Math.max(0, b.w) * Math.max(0, b.h);
  const inter = (a, b) => area({ w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
  const gapBetween = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  const frameBox = { x: 0, y: 0, w: W, h: H };
  const notes = [];

  let items = work.children.filter(c => c.visible);
  // 1. background stays; layers mostly outside the frame are decoration
  items = items.filter(n => {
    const b = box(n);
    if (b.w >= W * 0.95 && b.h >= H * 0.9) return false;
    if (inter(b, frameBox) < area(b) * 0.4) { notes.push(`"${n.name}" (decoration mostly outside the screen)`); n.remove(); return false; }
    return true;
  });

  // 2. buttons: a wide filled shape + whatever sits on it
  const isShape = n => ['RECTANGLE', 'VECTOR', 'FRAME'].includes(n.type) && !texts(n).length && hasVisibleFill(n);
  for (const s of items.filter(n => isShape(n) && box(n).w >= W * 0.5 && box(n).h >= 36 && box(n).h <= 64)) {
    if (s.removed || s.parent !== work) continue;
    const sb = box(s), pad = 4;
    const on = items.filter(n => n !== s && !n.removed && n.parent === work && (() => { const b = box(n); return b.x >= sb.x - pad && b.y >= sb.y - pad && b.x + b.w <= sb.x + sb.w + pad && b.y + b.h <= sb.y + sb.h + pad; })());
    const label = on.find(n => n.type === 'TEXT');
    if (!label) continue;
    const btn = figma.createFrame();
    work.appendChild(btn);
    btn.name = 'Button';
    btn.setSharedPluginData('webversion', 'button', '1');
    btn.x = sb.x; btn.y = sb.y; btn.resize(sb.w, sb.h);
    btn.fills = clonePaints(s.fills);
    if ('strokes' in s) { btn.strokes = clonePaints(s.strokes); if (typeof s.strokeWeight === 'number') btn.strokeWeight = s.strokeWeight; }
    btn.cornerRadius = shapeRadius(s, sb);
    btn.layoutMode = 'HORIZONTAL';
    btn.primaryAxisAlignItems = 'CENTER'; btn.counterAxisAlignItems = 'CENTER';
    btn.primaryAxisSizingMode = 'FIXED'; btn.counterAxisSizingMode = 'FIXED';
    btn.clipsContent = false;
    btn.appendChild(label);
    for (const n of on.filter(n => n !== label)) {
      const b = box(n);
      if (n.type === 'ELLIPSE' && b.h <= 12) { n.remove(); continue; } // drop shadow under the button
      btn.appendChild(n);
      n.layoutPositioning = 'ABSOLUTE';
      // place by visual bounds: rotated icons (an "arrow left" turned to point right) have x/y at another corner
      const now = box(n), bb = box(btn);
      n.x += (b.x - sb.x) - (now.x - bb.x); n.y += (b.y - sb.y) - (now.y - bb.y);
      const right = b.x + b.w / 2 > sb.x + sb.w / 2;
      n.constraints = { horizontal: right ? 'MAX' : 'MIN', vertical: 'CENTER' };
    }
    s.remove();
    items = items.filter(n => !n.removed && n.parent === work);
    items.push(btn);
    notes.push(`a shape + "${label.characters.trim().slice(0, 24)}" became one button`);
  }
  // shadows right under a button
  for (const btn of items.filter(n => n.getSharedPluginData && n.getSharedPluginData('webversion', 'button'))) {
    const bb = box(btn);
    for (const n of items.filter(n => n.type === 'ELLIPSE' && box(n).h <= 12 && gapBetween(box(n), bb) <= 6)) n.remove();
    items = items.filter(n => !n.removed && n.parent === work);
  }

  // 3. consecutive texts → one text stack
  const textsLoose = items.filter(n => n.type === 'TEXT').sort((a, b) => box(a).y - box(b).y);
  const runs = [];
  for (const t of textsLoose) {
    const run = runs[runs.length - 1], b = box(t);
    const prev = run && run[run.length - 1], pb = prev && box(prev);
    const aligned = pb && (Math.abs((pb.x + pb.w / 2) - (b.x + b.w / 2)) < 24 || Math.abs(pb.x - b.x) < 8);
    if (prev && aligned && b.y - (pb.y + pb.h) <= 28 && b.y >= pb.y + pb.h - 2) run.push(t); else runs.push([t]);
  }
  for (const run of runs.filter(r => r.length >= 2)) {
    const bs = run.map(box);
    const centered = bs.every(b => Math.abs((b.x + b.w / 2) - (bs[0].x + bs[0].w / 2)) < 24) && bs.some(b => Math.abs(b.x - bs[0].x) >= 8);
    const gap = Math.round(Math.max(4, bs[1].y - (bs[0].y + bs[0].h)));
    const stack = autoLayout('VERTICAL', { name: 'Text', itemSpacing: gap, counterAxisAlignItems: centered ? 'CENTER' : 'MIN' });
    work.appendChild(stack);
    stack.x = Math.min(...bs.map(b => b.x)); stack.y = bs[0].y;
    for (const t of run) stack.appendChild(t);
    items = items.filter(n => !n.removed && n.parent === work);
    items.push(stack);
  }

  // 4. remaining visuals → illustration clusters (overlap or ≤24px apart); small shapes join the nearest cluster within 60px
  const visuals = items.filter(n => n.type !== 'TEXT' && !(n.getSharedPluginData && n.getSharedPluginData('webversion', 'button')) && n.name !== 'Text' && !texts(n).length);
  const parent = visuals.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const vb = visuals.map(box);
  for (let i = 0; i < visuals.length; i++) for (let j = i + 1; j < visuals.length; j++) if (gapBetween(vb[i], vb[j]) <= 24) parent[find(i)] = find(j);
  const groups = () => { const g = {}; visuals.forEach((n, i) => { (g[find(i)] = g[find(i)] || []).push(i); }); return Object.values(g); };
  for (let pass = 0; pass < 3; pass++) {
    for (const g of groups().filter(g => g.length === 1)) {
      const i = g[0];
      if (Math.max(vb[i].w, vb[i].h) > 80) continue;
      let best = null, bestD = 61;
      for (const h of groups()) { if (h.includes(i) || h.length < 2) continue; const d = Math.min(...h.map(j => gapBetween(vb[i], vb[j]))); if (d < bestD) { bestD = d; best = h; } }
      if (best) parent[find(i)] = find(best[0]);
    }
  }
  // everything drawn above the first text belongs to one picture (glows, dots, floating icons around the main art)
  const firstTextY = Math.min(H, ...items.filter(n => !n.removed && n.parent === work && texts(n).length).map(n => box(n).y));
  const above = groups().filter(g => g.every(i => vb[i].y + vb[i].h <= firstTextY + 8));
  if (above.length > 1) for (const g of above.slice(1)) parent[find(g[0])] = find(above[0][0]);
  const clusters = groups().sort((a, b) => b.length - a.length);
  clusters.forEach((g, k) => {
    if (g.length === 1) {
      const i = g[0];
      const photo = Array.isArray(visuals[i].fills) && visuals[i].fills.some(f => f.type === 'IMAGE' && f.visible !== false);
      if (Math.max(vb[i].w, vb[i].h) <= 80 && !photo && visuals[i].type !== 'INSTANCE') { notes.push(`"${visuals[i].name}" (loose decoration)`); visuals[i].remove(); }
      return;
    }
    const grp = figma.group(g.map(i => visuals[i]), work);
    grp.name = k === 0 ? 'Illustration' : 'Graphic';
  });
  if (clusters[0] && clusters[0].length > 1) notes.push(`${clusters[0].length} loose layers grouped into one illustration`);

  // reading order
  const ordered = work.children.slice().sort((a, b) => box(a).y - box(b).y || box(a).x - box(b).x);
  ordered.forEach((n, i) => work.insertChild(i, n));

  if (report) report.notes.push('This screen is built from loose layers, so the plugin grouped them first: ' + notes.join('; ') + '.');
  return { work, cleanup() { if (!work.removed) work.remove(); } };
}

// Corner radius of a shape. Vectors drawn as rounded rectangles carry it in their path: "M0 12C0 5.4 …" → 12.
function shapeRadius(s, b) {
  if (typeof s.cornerRadius === 'number' && s.cornerRadius > 0) return s.cornerRadius;
  if (s.type === 'VECTOR' && s.vectorPaths && s.vectorPaths[0]) {
    const mm = s.vectorPaths[0].data.match(/^M\s*([\d.]+)\s+([\d.]+)/);
    if (mm) { const x = +mm[1], y = +mm[2]; const r = Math.min(x, y) < 0.5 ? Math.max(x, y) : 0; if (r > 0 && r <= b.h / 2 + 0.5) return Math.round(r); }
  }
  return Math.round(b.h / 4);
}

// ---------- analyze.js: semantic model of a mobile frame ----------
const COLLAPSE_RE = /^(show|show more|see more|read more|expand|more)$/i;

function analyze(mobile) {
  const W = mobile.width, H = mobile.height;
  const R = n => rel(n, mobile);
  const visibleDesc = mobile.findAll(n => n.visible !== false);
  const isVisibleChain = n => { for (let p = n; p && p !== mobile; p = p.parent) if (p.visible === false) return false; return true; };
  const desc = visibleDesc.filter(isVisibleChain);
  const kids = mobile.children.filter(c => c.visible);
  const m = { mobile, W, H, drop: [], blocks: [], tabBar: null, tabItems: [], activeTab: null, accent: null,
    statusBar: null, back: null, close: null, hero: null, dots: null, cta: null, title: null, subtitle: null,
    topActions: null, logo: null, avatar: null, search: null, band: null, rtl: false };

  // --- chrome
  m.statusBar = kids.find(c => /status ?bar/i.test(c.name) || (R(c).y <= 4 && R(c).h >= 36 && R(c).h <= 72 && texts(c).some(t => /^\d{1,2}:\d{2}$/.test(t.characters.trim())))) || null;
  const homeInd = kids.find(c => R(c).y > H - 30 && R(c).h <= 8 && R(c).w >= 100 && R(c).w <= 180) || null;
  const decor = kids.filter(c => c.opacity < 0.3 || /^(pattern|bg|background)$/i.test(c.name) || (c.type === 'ELLIPSE' && c.width > W * 0.6));

  const tabCand = desc.filter(n => n.type === 'FRAME' && (/tab ?bar|bottom ?nav|navigation ?bar/i.test(n.name) ||
    (R(n).y + R(n).h >= H - 130 && R(n).w >= W * 0.75 && R(n).h >= 48 && R(n).h <= 130)) &&
    n.children.filter(c => c.visible).length >= 3 && n.children.filter(c => c.visible).length <= 6 &&
    n.children.filter(c => c.visible).every(c => texts(c).length >= 1 && texts(c).length <= 2));
  m.tabBar = tabCand.sort((a, b) => (/tab ?bar|nav/i.test(b.name) ? 1 : 0) - (/tab ?bar|nav/i.test(a.name) ? 1 : 0))[0] || null;
  if (m.tabBar) {
    m.tabItems = m.tabBar.children.filter(c => c.visible);
    const keyOf = it => colorKey(texts(it)[0]);
    const counts = {}; for (const it of m.tabItems) counts[keyOf(it)] = (counts[keyOf(it)] || 0) + 1;
    m.activeTab = m.tabItems.find(it => counts[keyOf(it)] === 1) || null;
    if (m.activeTab) m.accent = firstSolid(texts(m.activeTab)[0]).color;
  }
  const inTabBar = n => { for (let p = n; p; p = p.parent) if (p === m.tabBar) return true; return false; };

  // --- top bar: back (left square button) / close (small icon top-right) / title / actions
  const top = desc.filter(n => R(n).y < 170 && n !== m.statusBar && !(m.statusBar && isInside(n, m.statusBar)));
  m.back = top.find(n => /back|chevron.?left|arrow.?left/i.test(n.name) && R(n).x < 80) ||
    top.find(n => n.type === 'FRAME' && R(n).x < 40 && R(n).w >= 32 && R(n).w <= 56 && Math.abs(R(n).w - R(n).h) < 4 && !texts(n).length) || null;
  // ✕ = named like a close icon, or a small group of exactly two square-ish strokes (an X)
  const looksLikeX = n => { if (!('findAll' in n)) return false; const v = n.findAll(x => x.type === 'VECTOR'); return v.length === 2 && v.every(x => Math.abs(x.width - x.height) < 3); };
  m.close = top.find(n => R(n).x > W - 90 && R(n).w <= 32 && R(n).h <= 32 && R(n).w >= 10 && !texts(n).length && n.type !== 'ELLIPSE' && !hasImageFill(n) &&
    (/close|multipl|remove.?circle|xmark|cross|dismiss/i.test(n.name) || looksLikeX(n))) || null;
  m.logo = desc.find(n => /logo/i.test(n.name) && R(n).y < 160 && !inTabBar(n)) ||
    kids.find(c => (c.type === 'GROUP' || c.type === 'VECTOR') && R(c).y < 140 && !texts(c).length && R(c).w < W * 0.5) || null;
  const bigTexts = desc.filter(n => n.type === 'TEXT' && R(n).y < 200 && !inTabBar(n) && !(m.statusBar && isInside(n, m.statusBar)) &&
    n !== m.logo && !(m.logo && isInside(n, m.logo)));
  m.title = bigTexts.filter(t => fontSizeOf(t) >= 20).sort((a, b) => R(a).y - R(b).y)[0] || null;
  if (m.title) m.subtitle = bigTexts.find(t => t !== m.title && Math.abs(R(t).y + R(t).h - (R(m.title).y + R(m.title).h)) < 12 && R(t).x > R(m.title).x) || null;
  m.avatar = top.find(n => (/avatar|profile|user/i.test(n.name) || n.type === 'ELLIPSE') && R(n).w >= 24 && R(n).w <= 56 && R(n).x > W * 0.6 && !inTabBar(n)) || null;
  m.search = desc.find(n => n.type === 'FRAME' && R(n).h >= 36 && R(n).h <= 64 && R(n).w >= W * 0.7 && (/search/i.test(n.name) || texts(n).some(t => /search/i.test(t.characters)))) || null;
  const actionCands = top.filter(n => n.type === 'FRAME' && R(n).x > W * 0.4 && R(n).h >= 32 && R(n).h <= 52 && !texts(n).length && n !== m.close && n !== m.avatar && R(n).w > 40);
  m.topActions = actionCands.filter(a => !actionCands.some(b => b !== a && isInside(a, b))).sort((a, b) => R(b).w - R(a).w)[0] || null;

  // --- media
  m.hero = desc.find(n => (n.type === 'RECTANGLE' || n.type === 'FRAME') && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE' && f.visible !== false) &&
    R(n).w >= W * 0.85 && R(n).h >= 180 && R(n).y < H * 0.5) || null;
  const dotRows = desc.filter(n => n.type === 'FRAME' && n.children && n.children.length > 1 && n.children.every(c => c.type === 'ELLIPSE'));
  m.dots = dotRows.find(r => new Set(r.children.map(colorKey)).size > 1) || null;

  // --- primary CTA: full-width pill near the bottom (outermost same-size wrapper)
  const ctaCand = desc.filter(n => n.type === 'FRAME' && R(n).w >= (W - 40) * 0.8 && R(n).h >= 44 && R(n).h <= 64 && ((typeof n.cornerRadius === 'number' && n.cornerRadius >= 16) || n.getSharedPluginData('webversion', 'button')) &&
    texts(n).length >= 1 && texts(n).length <= 2 && R(n).y + R(n).h >= H - 170 && !inTabBar(n)).sort((a, b) => R(b).y - R(a).y);
  if (ctaCand.length) {
    let c = ctaCand[0];
    while (c.parent && c.parent !== mobile && Math.abs(c.parent.width - c.width) < 2 && Math.abs(c.parent.height - c.height) < 2) c = c.parent;
    m.cta = c;
  }

  // --- illustration: the biggest text-free picture (group / vector art / image) in the upper part of the screen
  const ill = kids.filter(c => !texts(c).length && c !== m.hero && c !== m.statusBar && (c.type === 'GROUP' || c.type === 'FRAME' || c.type === 'VECTOR' || hasImageFill(c)) &&
    R(c).w >= W * 0.4 && R(c).h >= 80 && R(c).y < H * 0.65 && !(R(c).w >= W * 0.95 && R(c).h >= H * 0.9));
  m.illustration = ill.sort((a, b) => R(b).w * R(b).h - R(a).w * R(a).h)[0] || null;

  // --- RTL: mostly Arabic/Hebrew characters
  const allText = desc.filter(n => n.type === 'TEXT').map(t => t.characters).join('');
  const rtlChars = (allText.match(/[֐-ࣿ]/g) || []).length;
  m.rtl = rtlChars > allText.replace(/\s/g, '').length * 0.5;

  // --- content blocks (document order), skipping chrome and things handled above
  const handled = new Set([m.statusBar, homeInd, m.tabBar, m.hero, m.dots, ...decor].filter(Boolean));
  let blocks = kids.filter(c => !handled.has(c));
  // overlays sitting on the hero (e.g. an "Image details" chip) are mobile-only
  if (m.hero) {
    const hb = R(m.hero);
    blocks = blocks.filter(c => { const b = R(c); const over = b.x >= hb.x - 1 && b.y >= hb.y - 1 && b.x + b.w <= hb.x + hb.w + 1 && b.y + b.h <= hb.y + hb.h + 1; if (over && c !== m.hero) m.drop.push(`"${c.name}" overlay on the image`); return !over; });
  }
  // flatten the main scroll container (a tall vertical auto-layout holding most content)
  const expand = [];
  for (const b of blocks) {
    if (b.layoutMode === 'VERTICAL' && b.children.filter(c => c.visible).length >= 3 && R(b).h > H * 0.45) expand.push(...b.children.filter(c => c.visible && !handled.has(c)));
    else expand.push(b);
  }
  blocks = expand.sort((a, b) => R(a).y - R(b).y || R(a).x - R(b).x);
  for (const b of blocks) m.blocks.push(classifyBlock(b, m, R));
  m.band = m.blocks.find(b => b.kind === 'band')?.node || null;
  m.pattern = classifyScreen(m);
  if (homeInd) m.drop.push('home indicator');
  if (m.statusBar) m.drop.push('status bar');
  return m;
}

function isInside(n, ancestor) { for (let p = n.parent; p; p = p.parent) if (p === ancestor) return true; return false; }

function classifyBlock(n, m, R) {
  const b = R(n), W = m.W, cw = W - 40;
  const kids = 'children' in n ? n.children.filter(c => c.visible) : [];
  const ts = texts(n);
  const overflows = x => { const r = R(x); return r.x + r.w > W + 1 || r.w > W; };
  const isPill = c => c.type === 'FRAME' && R(c).h <= 48 && texts(c).length === 1 && (typeof c.cornerRadius === 'number' && c.cornerRadius >= Math.min(12, R(c).h / 2 - 1));
  const holdsCta = m.cta && (n === m.cta || isInside(m.cta, n));
  const holdsTop = (m.back && (n === m.back || isInside(m.back, n))) || (m.close && isInside(m.close, n)) || (m.title && isInside(m.title, n) && b.y < 170 && n.type !== 'TEXT' && !hasVisibleFill(n));

  if (holdsCta) return { kind: 'cta-zone', node: n };
  if (holdsTop) return { kind: 'topbar', node: n };
  if (n === m.title) return { kind: 'title', node: n };
  if (n === m.logo) return { kind: 'logo', node: n };
  if (n === m.search) return { kind: 'search', node: n };
  if (m.search && isInside(m.search, n) && kids.length <= 2) return { kind: 'search', node: m.search };
  if (n.type === 'FRAME' && !isAL(n) && b.y <= 2 && b.w >= W - 2 && b.h < m.H * 0.4 && (hasVisibleFill(n) || kids.some(c => c.type === 'RECTANGLE' && hasVisibleFill(c)))) return { kind: 'band', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && b.y < 170 && (kids.some(c => c === m.logo || /logo/i.test(c.name)) || kids.some(c => c === m.avatar))) return { kind: 'header', node: n };
  if (COLLAPSE_RE.test((ts.find(t => COLLAPSE_RE.test(t.characters.trim())) || { characters: '' }).characters.trim()) && ts.length >= 2 && b.h <= 80) return { kind: 'collapsed', node: n, title: ts.find(t => !COLLAPSE_RE.test(t.characters.trim())) };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 2 && kids.length <= 4 && b.h >= 32 && b.h <= 60 && typeof n.cornerRadius === 'number' && n.cornerRadius >= 16 && ts.length === kids.length) return { kind: 'tabs', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 3 && kids.every(isPill)) return { kind: 'chips', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 2 && overflows(n)) {
    const composite = kids.every(k => isAL(k) && k.layoutMode === 'VERTICAL' && k.children.filter(c => c.visible)[0]?.type === 'TEXT' && k.children.filter(c => c.visible).length === 2);
    return composite ? { kind: 'pair', node: n, items: kids } : { kind: 'scroller', node: n, items: kids };
  }
  if (isAL(n) && n.layoutMode === 'VERTICAL' && kids.length >= 2) {
    const head = kids[0];
    const headIsTitle = head.type === 'TEXT' || (isAL(head) && head.layoutMode === 'HORIZONTAL' && head.children.find(c => c.visible)?.type === 'TEXT' && R(head).h <= 40);
    const row = kids.find(k => k !== head && isAL(k) && k.layoutMode === 'HORIZONTAL' && k.children.filter(c => c.visible).length >= 2);
    if (headIsTitle && row && kids.length === 2) {
      const rowKids = row.children.filter(c => c.visible);
      if (rowKids.length >= 3 && rowKids.every(isPill)) return { kind: 'chips-section', node: n, head, row };
      return { kind: 'section', node: n, head, row, items: rowKids, overflowing: overflows(row) };
    }
    if (kids.every(k => isAL(k) && k.layoutMode === 'HORIZONTAL')) return { kind: 'grid', node: n };
    const sameH = kids.length >= 3 && kids.every(k => Math.abs(k.height - kids[0].height) < 6 && texts(k).length >= 1);
    if (sameH) return { kind: 'list', node: n, items: kids };
  }
  if (hasVisibleFill(n) && typeof n.cornerRadius === 'number' && n.cornerRadius >= 8 && b.w >= cw * 0.75 && ts.length) {
    const btn = n.findOne && n.findOne(c => c.type === 'FRAME' && c !== n && texts(c).length === 1 && typeof c.cornerRadius === 'number' && c.cornerRadius >= 12 && hasVisibleFill(c) && c.height <= 48);
    return { kind: 'card', node: n, button: btn || null };
  }
  if (n.type === 'TEXT') return { kind: 'text', node: n };
  return { kind: 'other', node: n };
}

function classifyScreen(m) {
  const sections = m.blocks.filter(b => ['section', 'scroller', 'pair', 'chips', 'chips-section'].includes(b.kind)).length;
  if (m.hero && (m.back || m.blocks.some(b => b.kind === 'topbar')) && m.cta) return 'detail';
  if (m.close && !m.tabBar && m.cta) return 'popup';
  // welcome / onboarding: a picture, a headline and one main button, nothing list-like
  const listy = m.blocks.some(b => ['section', 'scroller', 'pair', 'chips', 'chips-section', 'list', 'grid', 'tabs'].includes(b.kind));
  const headline = m.blocks.some(b => texts(b.node).some(t => fontSizeOf(t) >= 20));
  if (!m.tabBar && m.cta && !listy && headline && m.blocks.length <= 7 && (m.illustration || m.hero)) return 'welcome';
  if (m.tabBar || sections >= 2) return 'home';
  return 'stack';
}

// ---------- style.js: where the desktop look comes from ----------
// 'file'   = desktop screens already exist in this file → clone their nav, panels, popup style
// 'generic'= build the shell from the mobile screen (tab bar → sidebar, or a top bar)
// Dagiga is detected automatically (navy #000529 background + lime #D3DE00) and switches on its measured type ramp.
const DAGIGA_BG = { r: 0, g: 5 / 255, b: 41 / 255 }, DAGIGA_LIME = { r: 0xd3 / 255, g: 0xde / 255, b: 0 };

function pageOf(n) { let p = n; while (p && p.type !== 'PAGE') p = p.parent; return p; }

function findDesktopParts(d) {
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const kids = d.children.filter(c => c.visible);
  const parts = { frame: d, rail: null, main: null, sidePanel: null, modal: null, dim: null, close: null, arrows: [], line: null, col: null };
  parts.rail = kids.find(c => c.type === 'FRAME' && c.width <= 100 && c.x < 40 && c.height > d.height * 0.8) || null;
  parts.main = kids.find(c => c.type === 'FRAME' && c.x > 40 && c.x < 140 && c.width > d.width * 0.85 && c.height > d.height * 0.85) || null;
  parts.sidePanel = kids.find(c => c.type === 'RECTANGLE' && c.width >= 400 && c.width <= 700 && c.x > d.width * 0.5 && c.height > d.height * 0.9) || null;
  parts.modal = kids.find(c => c.type === 'FRAME' && c.width >= 480 && c.width <= 900 && Array.isArray(c.strokes) && c.strokes.length && c.x > 200) || null;
  parts.dim = kids.find(c => (c.type === 'VECTOR' || c.type === 'RECTANGLE') && c.width >= d.width - 30 && c.opacity < 1) || null;
  parts.close = kids.find(c => /multipl|remove.?circle|close/i.test(c.name) && c.width <= 32) || null;
  parts.arrows = d.findAll(n => n.type === 'FRAME' && n.visible && near(n.width, 56, 2) && near(n.height, 56, 2)).slice(0, 2);
  parts.line = d.findOne(n => n.type === 'LINE' && n.visible) || null;
  if (parts.main) {
    const c = parts.main.children.find(k => k.visible && isAL(k) && k.layoutMode === 'VERTICAL');
    if (c) parts.col = { x: c.x, y: c.y, width: c.width, gap: c.itemSpacing };
  }
  return parts;
}

function detectStyle(mobile, m, forced) {
  const page = pageOf(mobile);
  const desktops = page.children.filter(n => n.type === 'FRAME' && n.visible && n.width >= 1200 && n.width <= 1920 && n.height >= 700 && !/— (Web|Desktop)$/.test(n.name));
  const all = desktops.map(findDesktopParts);
  const dashboard = all.find(p => p.main && !p.modal && !p.sidePanel) || all.find(p => p.rail && !p.modal && !p.sidePanel) || null;
  const detail = all.find(p => p.sidePanel && !p.modal) || null;
  const modal = all.find(p => p.modal) || null;
  const bg = bgColorOf(mobile);
  const dagiga = forced === 'dagiga' || (sameColor(bg, DAGIGA_BG, 0.03) && mobile.findAll(n => n.type === 'TEXT').some(t => { const f = firstSolid(t); return f && sameColor(f.color, DAGIGA_LIME, 0.03); }));
  let kind = forced === 'generic' ? 'generic' : (dashboard ? 'file' : 'generic');
  if (forced === 'file' && !dashboard) kind = 'generic';
  return {
    kind, dagiga, desktops: all, dashboard: kind === 'file' ? dashboard : null, detail: kind === 'file' ? detail : null, modal: kind === 'file' ? modal : null,
    ramp: dagiga ? DAGIGA_RAMP : GENERIC_RAMP,
    rowGap: dagiga ? 16 : 24,
    sectionTitleBold: dagiga,
    label: kind === 'file' ? `copied from "${dashboard.frame.name}"` + (dagiga ? ' (Dagiga rules)' : '') : 'built from the mobile screen' + (dagiga ? ' (Dagiga rules)' : ''),
  };
}

// ---------- shell.js: the new frame, its placement, and the navigation shell ----------
function createDesktopFrame(ctx) {
  const { m, style } = ctx;
  const mobile = m.mobile, page = pageOf(mobile), GAP = 80;
  const F = figma.createFrame();
  F.name = mobile.name + ' — Desktop';
  F.resize(DESKTOP_W, DESKTOP_H);
  const ref = style.dashboard ? style.dashboard.frame : null;
  F.fills = clonePaints(ref ? ref.fills : mobile.fills);
  F.cornerRadius = ref && typeof ref.cornerRadius === 'number' ? ref.cornerRadius : 0;
  F.clipsContent = true;
  // right of the mobile frame; if anything is in the way, below everything on the page
  const spot = { x: mobile.x + mobile.width + GAP, y: mobile.y, width: DESKTOP_W, height: DESKTOP_H };
  const hit = page.children.some(n => n !== mobile && n !== F && n.visible &&
    spot.x < n.x + n.width && spot.x + spot.width > n.x && spot.y < n.y + n.height && spot.y + spot.height > n.y);
  if (hit) {
    const bottom = Math.max(...page.children.filter(n => n !== F).map(n => n.y + n.height));
    spot.x = mobile.x; spot.y = bottom + 200;
    ctx.report.notes.push('The space right of the mobile screen was taken, so the desktop screen is below your other frames.');
  }
  F.x = spot.x; F.y = spot.y;
  ctx.F = F;
  return F;
}

// Recolor a nav item between its "active" and "inactive" colors (labels and icon strokes/fills).
function recolorItem(item, from, to) {
  const swap = paints => Array.isArray(paints) ? paints.map(p => p.type === 'SOLID' && sameColor(p.color, from) ? { ...p, color: to } : p) : paints;
  const nodes = [item, ...('findAll' in item ? item.findAll(() => true) : [])];
  for (const n of nodes) {
    if ('fills' in n && n.type !== 'FRAME') n.fills = swap(n.fills);
    if ('strokes' in n) n.strokes = swap(n.strokes);
  }
}

// Shell for non-overlay screens. Returns the content column (vertical auto-layout).
function buildShell(ctx) {
  const { m, style, F } = ctx;
  const activeLabel = m.activeTab ? texts(m.activeTab)[0].characters.trim().toLowerCase() : null;

  if (style.dashboard) {
    const d = style.dashboard;
    if (d.rail) {
      const rail = d.rail.clone(); F.appendChild(rail); rail.x = d.rail.x; rail.y = d.rail.y; rail.name = 'Rail';
      // active color = the rail's own unique label color (fallback: mobile accent); inactive = the most common one
      const labels = texts(rail);
      const counts = {}; for (const t of labels) counts[colorKey(t)] = (counts[colorKey(t)] || 0) + 1;
      const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      const inactiveT = labels.find(t => colorKey(t) === keys[0]);
      const activeT = labels.find(t => counts[colorKey(t)] === 1 && colorKey(t) !== keys[0]);
      const inactive = inactiveT && firstSolid(inactiveT).color;
      const active = (activeT && firstSolid(activeT).color) || m.accent;
      if (activeLabel && inactive && active) {
        const match = labels.find(t => t.characters.trim().toLowerCase() === activeLabel);
        if (match) for (const t of labels) {
          const item = t.parent && t.parent !== rail ? t.parent : t;
          if (t === match) recolorItem(item, inactive, active); else recolorItem(item, active, inactive);
        }
      }
      ctx.report.reused.push(`left navigation from "${d.frame.name}"` + (activeLabel ? ` (active: ${texts(m.activeTab)[0].characters.trim()})` : ''));
    }
    let col;
    if (d.main) {
      const main = d.main.clone(); for (const c of [...main.children]) c.remove();
      F.appendChild(main); main.x = d.main.x; main.y = d.main.y; main.name = 'Main';
      const spec = d.col || { x: 101, y: 61, width: Math.min(1440, main.width - 200), gap: 31 };
      col = autoLayout('VERTICAL', { name: 'Content', itemSpacing: spec.gap });
      main.appendChild(col); col.x = spec.x; col.y = spec.y;
      col.resize(spec.width, col.height); col.counterAxisSizingMode = 'FIXED';
      ctx.main = main;
    } else {
      const left = d.rail ? d.rail.x + d.rail.width + 48 : 64;
      const w = Math.min(1200, DESKTOP_W - left - 64);
      col = autoLayout('VERTICAL', { name: 'Content', itemSpacing: 32 });
      F.appendChild(col); col.x = left + Math.round((DESKTOP_W - left - w) / 2); col.y = 48;
      col.resize(w, col.height); col.counterAxisSizingMode = 'FIXED';
    }
    ctx.col = col; ctx.colW = col.width;
    return col;
  }

  // ---- generic: sidebar from the tab bar, or a top bar
  const SIDEBAR = 248;
  let left = 0, topY = 48;
  if (m.tabBar) {
    const side = autoLayout('VERTICAL', { name: 'Sidebar', itemSpacing: 32, paddingTop: 32, paddingLeft: 20, paddingRight: 20 });
    F.appendChild(side); side.x = 0; side.y = 0; side.resize(SIDEBAR, DESKTOP_H);
    side.primaryAxisSizingMode = 'FIXED'; side.counterAxisSizingMode = 'FIXED';
    side.fills = hasVisibleFill(m.tabBar) ? clonePaints(m.tabBar.fills) : clonePaints(m.mobile.fills);
    side.strokes = clonePaints(m.tabBar.strokes); side.strokeWeight = 0; side.strokeRightWeight = 1; side.strokeAlign = 'INSIDE';
    if (m.logo) { const l = m.logo.clone(); side.appendChild(l); ctx.report.moved.push('logo → sidebar'); }
    const nav = autoLayout('VERTICAL', { name: 'Nav', itemSpacing: 4 }); side.appendChild(nav); nav.layoutSizingHorizontal = 'FILL';
    for (const it of m.tabItems) {
      const c = it.clone(); nav.appendChild(c);
      if (!isAL(c)) { ctx.report.notes.push('A tab bar item without auto layout was copied as-is.'); continue; }
      c.layoutMode = 'HORIZONTAL'; c.itemSpacing = 12; c.counterAxisAlignItems = 'CENTER'; c.primaryAxisAlignItems = 'MIN';
      c.paddingLeft = c.paddingRight = 12; c.paddingTop = c.paddingBottom = 10; c.cornerRadius = 10;
      c.layoutSizingHorizontal = 'FILL'; c.layoutSizingVertical = 'HUG';
      for (const t of texts(c)) scaleTextNode(t, 15);
      if (it === m.activeTab && m.accent) c.fills = [{ type: 'SOLID', color: m.accent, opacity: 0.1 }];
    }
    ctx.report.moved.push(`tab bar → left sidebar (${m.tabItems.length} items)`);
    left = SIDEBAR;
  } else {
    const bar = autoLayout('HORIZONTAL', { name: 'Top bar', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 32, paddingRight: 32 });
    F.appendChild(bar); bar.x = 0; bar.y = 0; bar.resize(DESKTOP_W, 72); bar.primaryAxisSizingMode = 'FIXED'; bar.counterAxisSizingMode = 'FIXED';
    const ink = inkFor(bgColorOf(m.mobile));
    bar.strokes = [{ type: 'SOLID', color: ink, opacity: 0.08 }]; bar.strokeWeight = 0; bar.strokeBottomWeight = 1; bar.strokeAlign = 'INSIDE';
    if (m.logo) { bar.appendChild(m.logo.clone()); ctx.report.moved.push('logo → top bar'); }
    topY = 72 + 40;
  }
  const w = Math.min(1200, DESKTOP_W - left - 128);
  const col = autoLayout('VERTICAL', { name: 'Content', itemSpacing: 32 });
  F.appendChild(col); col.x = left + Math.round((DESKTOP_W - left - w) / 2); col.y = topY;
  col.resize(w, col.height); col.counterAxisSizingMode = 'FIXED';
  ctx.col = col; ctx.colW = w;
  return col;
}

// Header row: page title (+ subtitle) on the left; search + avatar on the right.
function buildHeaderRow(ctx) {
  const { m, col, style } = ctx;
  if (!m.title && !m.search && !m.avatar) return null;
  const row = autoLayout('HORIZONTAL', { name: 'Header', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' });
  col.appendChild(row); row.layoutSizingHorizontal = 'FILL';
  if (m.title) {
    const left = autoLayout('HORIZONTAL', { name: 'Title', itemSpacing: 8, counterAxisAlignItems: 'BASELINE' }); row.appendChild(left);
    const t = m.title.clone(); left.appendChild(t); scaleTextNode(t, style.ramp[Math.round(fontSizeOf(t))] || fontSizeOf(t));
    if (m.subtitle) left.appendChild(m.subtitle.clone());
  }
  const right = autoLayout('HORIZONTAL', { name: 'Header actions', itemSpacing: 16, counterAxisAlignItems: 'CENTER' }); row.appendChild(right);
  if (m.search) { const s = m.search.clone(); right.appendChild(s); s.resize(420, s.height); ctx.report.moved.push('search → header row'); }
  if (m.avatar && !style.dashboard) { const a = m.avatar.clone(); right.appendChild(a); a.resize(44, 44); }
  if (!right.children.length) right.remove();
  return row;
}

// ---------- patterns-home.js: dashboard / home / feed ----------
// Item sizing for a desktop row: show the real items when they land at 1.25–2.1× their mobile width,
// otherwise pick the count that lands near 1.6× and duplicate items to fill (reported as placeholders).
function planRow(count, itemW, colW, gap) {
  let n = count, w = (colW - (n - 1) * gap) / n;
  if (w > itemW * 2.1 || w < itemW * 1.25) { n = Math.max(1, Math.round((colW + gap) / (itemW * 1.6 + gap))); w = (colW - (n - 1) * gap) / n; }
  return { n, w, k: w / itemW };
}

// Grow one cloned row item by factor k: media grows in height, small overlays/icons grow a little, text follows the ramp.
// Heights are measured BEFORE widening: items with "lock aspect ratio" already grow taller when their width fills.
function pinOverlays(n) {
  // absolute overlays (duration badges, tags) keep their distance to the bottom-left corner while the item grows
  if ('children' in n) for (const ch of n.children) if (ch.layoutPositioning === 'ABSOLUTE' && 'constraints' in ch) ch.constraints = { horizontal: 'MIN', vertical: 'MAX' };
}
// Explicit sizes, no FILL: "fill width" on an item with a locked aspect ratio also changes its height.
function unlock(n) { try { if (typeof n.unlockAspectRatio === 'function') n.unlockAspectRatio(); else if ('constrainProportions' in n) n.constrainProportions = false; } catch (e) {} }
function sizeItem(ctx, c, k, w) {
  const h0 = c.height;
  const grow = Math.min(k, 1.25);
  const kids = 'children' in c ? c.children.filter(x => x.visible) : [];
  unlock(c);
  if (hasImageFill(c) || !kids.length) {
    pinOverlays(c);
    if (inAL(c)) { c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'FIXED'; }
    c.resize(Math.round(w), Math.round(h0 * k));
    for (const ch of kids) if (ch.width < c.width * 0.6) ch.rescale(grow);
  } else {
    if (inAL(c)) c.layoutSizingHorizontal = 'FIXED';
    c.resize(Math.round(w), c.height);
    if (isAL(c)) c.layoutSizingVertical = 'HUG';
    const visual = kids[0];
    if (visual.type !== 'TEXT' && (hasVisibleFill(visual) || hasImageFill(visual)) && h0 > 0 && visual.height >= h0 * 0.4) {
      const v0 = visual.height;
      unlock(visual); pinOverlays(visual);
      if (inAL(visual)) { visual.layoutSizingHorizontal = 'FIXED'; visual.layoutSizingVertical = 'FIXED'; }
      visual.resize(Math.round(w), Math.round(v0 * k));
      if ('children' in visual) for (const ch of visual.children.filter(x => x.visible)) if (ch.width < visual.width * 0.6) ch.rescale(grow);
    }
    for (const ch of kids.slice(1)) if (ch.type === 'TEXT' || isAL(ch)) fill(ch);
  }
  rampText(c, ctx.style.ramp);
}

function buildRow(ctx, parent, items, name) {
  const { style, colW } = ctx;
  const gap = style.rowGap, itemW = items[0].width;
  const { n, k, w } = planRow(items.length, itemW, colW, gap);
  const row = autoLayout('HORIZONTAL', { name, itemSpacing: gap }); parent.appendChild(row); fill(row);
  for (let i = 0; i < n; i++) {
    const s = items[i % items.length], c = s.clone(); row.appendChild(c);
    if (i >= items.length) { c.name = s.name + ' (duplicate)'; ctx.report.duplicates.push({ id: c.id, label: `${name} #${i + 1} (copy of #${(i % items.length) + 1})` }); }
    sizeItem(ctx, c, k, w);
  }
  return row;
}

async function sectionTitle(ctx, node) {
  rampText(node, ctx.style.ramp);
  if (ctx.style.sectionTitleBold) for (const t of texts(node).slice(0, 1)) await editText(ctx, t, { fontStyle: 'Bold', reason: 'section titles are Bold on desktop' });
}

async function buildHome(ctx) {
  const { m, style } = ctx;
  const col = buildShell(ctx);
  buildHeaderRow(ctx);
  const blocks = m.blocks.filter(b => !['title', 'logo', 'header', 'search', 'topbar'].includes(b.kind));
  const heroCard = blocks.find(b => b.kind === 'card');
  const pair = blocks.find(b => b.kind === 'pair');
  const used = new Set();

  for (const b of blocks) {
    if (used.has(b)) continue;
    // primary card + side-scrolling pair → hero row (card left half, pair stacked right half)
    if (b === heroCard && pair) {
      used.add(pair);
      const row = autoLayout('HORIZONTAL', { name: 'Hero row', itemSpacing: 24 }); col.appendChild(row); fill(row);
      const card = b.node.clone(); row.appendChild(card);
      card.layoutSizingHorizontal = 'FILL'; card.layoutSizingVertical = 'FIXED'; card.resize(card.width, 214);
      if (isAL(card)) {
        card.primaryAxisAlignItems = 'SPACE_BETWEEN';
        card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 24;
        const actions = card.findOne(x => x !== card && isAL(x) && x.layoutMode === 'HORIZONTAL' && x.children.some(k => texts(k).length === 1 && hasVisibleFill(k)));
        if (actions) actions.primaryAxisAlignItems = 'MIN';
      }
      rampText(card, style.ramp);
      const side = autoLayout('VERTICAL', { name: 'Side cards', itemSpacing: 24 }); row.appendChild(side);
      side.layoutSizingHorizontal = 'FILL'; side.layoutSizingVertical = 'FIXED'; side.resize(side.width, 214);
      for (const item of pair.items) {
        const parts = item.children.filter(x => x.visible);
        const inner = parts[parts.length - 1].clone(); side.appendChild(inner);
        inner.layoutSizingHorizontal = 'FILL'; inner.layoutSizingVertical = 'FILL';
        if (isAL(inner)) inner.primaryAxisAlignItems = 'CENTER';
        rampText(inner, style.ramp);
        ctx.report.dropped.push(`"${parts[0].characters || parts[0].name}" label above the side card (the card shows its own heading)`);
      }
      widenWrappingText(row);
      continue;
    }
    if (b.kind === 'card') {
      const card = cloneInto(col, b.node);
      if (b.button && isAL(card) && card.layoutMode === 'VERTICAL' && !hasImageFill(b.node)) {
        // stacked promo card → horizontal banner: text left, button right
        const btn = card.findOne(x => x.name === b.button.name && texts(x).length === 1);
        const textKids = card.children.filter(x => x.visible && x !== btn && (x.type === 'TEXT' || texts(x).length));
        const block = autoLayout('VERTICAL', { name: 'Text', itemSpacing: 6 });
        card.insertChild(0, block); for (const t of textKids) block.appendChild(t);
        if (btn && btn.parent !== card) card.appendChild(btn);
        card.layoutMode = 'HORIZONTAL'; card.primaryAxisAlignItems = 'SPACE_BETWEEN'; card.counterAxisAlignItems = 'CENTER';
        card.paddingLeft = card.paddingRight = 32; card.paddingTop = card.paddingBottom = 28;
        card.layoutSizingHorizontal = 'FILL'; card.layoutSizingVertical = 'HUG';
        block.layoutGrow = 1;
        for (const t of texts(block)) if (t.textAutoResize === 'HEIGHT' && inAL(t)) t.layoutSizingHorizontal = 'FILL';
        ctx.report.notes.push(`"${b.node.name}" became a full-width banner.`);
      }
      rampText(card, style.ramp); widenWrappingText(card);
      continue;
    }
    if (b.kind === 'section') {
      const sec = autoLayout('VERTICAL', { name: b.node.name, itemSpacing: style.dagiga ? 13 : 16 }); col.appendChild(sec); fill(sec);
      const head = b.head.clone(); sec.appendChild(head); fill(head); await sectionTitle(ctx, head);
      buildRow(ctx, sec, b.items, texts(b.head)[0] ? texts(b.head)[0].characters.trim() : b.node.name);
      continue;
    }
    if (b.kind === 'scroller') { buildRow(ctx, col, b.items, b.node.name); continue; }
    if (b.kind === 'pair') { buildRow(ctx, col, b.items, b.node.name); continue; }
    if (b.kind === 'chips' || b.kind === 'chips-section') { const c = cloneInto(col, b.node, { fillWidth: false }); rampText(c, style.ramp); continue; }
    if (b.kind === 'collapsed') { await placeCollapsed(ctx, col, b); continue; }
    if (b.kind === 'cta-zone') { const c = cloneInto(col, b.node, { fillWidth: false }); if (c.width > 480) c.resize(480, c.height); continue; }
    if (b.kind === 'list' && b.items.every(it => hasVisibleFill(it))) { buildGrid(ctx, col, b.items, b.node.name); continue; }
    const c = cloneInto(col, b.node); rampText(c, style.ramp); widenWrappingText(c);
  }
}

// List of card-like rows → 2–3 column grid.
function buildGrid(ctx, parent, items, name) {
  const cols = items.length >= 6 ? 3 : 2, gap = ctx.style.rowGap;
  const wrap = autoLayout('VERTICAL', { name, itemSpacing: gap }); parent.appendChild(wrap); fill(wrap);
  for (let i = 0; i < items.length; i += cols) {
    const row = autoLayout('HORIZONTAL', { name: 'Row', itemSpacing: gap }); wrap.appendChild(row); fill(row);
    for (const it of items.slice(i, i + cols)) { const c = it.clone(); row.appendChild(c); fill(c); rampText(c, ctx.style.ramp); widenWrappingText(c); }
  }
  ctx.report.notes.push(`"${name}" list became a ${cols}-column grid.`);
}

// Collapsed "Show / See more" row: reuse the expanded section from an existing desktop screen when one has the same title.
async function placeCollapsed(ctx, parent, b) {
  const title = b.title ? b.title.characters.trim() : '';
  const src = title && findExpandedSection(ctx, title);
  if (src) {
    const c = src.clone(); parent.appendChild(c); fill(c); if (isAL(c)) c.layoutSizingVertical = 'HUG';
    ctx.report.expanded.push(`"${title}" expanded using the section from "${pageFrameOf(src).name}" (check its sample text)`);
    return c;
  }
  const c = cloneInto(parent, b.node);
  ctx.report.notes.push(`"${title || b.node.name}" stays collapsed (no expanded version found in your desktop screens).`);
  return c;
}
function pageFrameOf(n) { let p = n; while (p.parent && p.parent.type !== 'PAGE') p = p.parent; return p; }
function findExpandedSection(ctx, title) {
  for (const d of ctx.style.desktops) {
    const t = d.frame.findAllWithCriteria({ types: ['TEXT'] }).find(x => x.visible && x.characters.trim() === title);
    if (!t) continue;
    let s = t.parent;
    while (s && s !== d.frame && !(isAL(s) && s.layoutMode === 'VERTICAL' && s.children.filter(c => c.visible).length >= 2)) s = s.parent;
    if (s && s !== d.frame && s.height > 60) return s;
  }
  return null;
}

// ---------- patterns-detail.js: detail / editor (canvas + side panel) ----------
const PANEL_X = 1128, PANEL_W = 600, PANEL_COL_X = 1148, PANEL_COL_W = 490, VIEW_X = 87, VIEW_W = 1041;

function backdropAndBase(ctx) {
  const { F, style, m } = ctx;
  const base = style.dashboard || (style.desktops.find(p => p.main || p.rail) || null);
  if (base) {
    const bd = base.frame.clone(); F.appendChild(bd); bd.x = 0; bd.y = 0; bd.name = `Backdrop (${base.frame.name})`;
    ctx.report.reused.push(`backdrop = your desktop "${base.frame.name}"`);
    return bd;
  }
  F.fills = clonePaints(m.mobile.fills);
  return null;
}

async function buildDetail(ctx) {
  const { m, style, F } = ctx;
  const bg = bgColorOf(m.mobile), ink = inkFor(bg), inkHex = hex(ink);
  const det = style.detail;
  const hasBackdrop = !!backdropAndBase(ctx);
  const viewX = hasBackdrop ? VIEW_X : 0, viewW = hasBackdrop ? VIEW_W : PANEL_X;

  // viewer: dim over the backdrop (rail stays crisp) + centered image canvas
  const viewer = figma.createFrame(); viewer.name = 'Viewer'; viewer.fills = []; viewer.clipsContent = false;
  F.appendChild(viewer); viewer.x = viewX; viewer.y = 0; viewer.resize(viewW, DESKTOP_H);
  const dim = figma.createRectangle(); dim.name = 'Dim'; dim.resize(viewW, DESKTOP_H);
  dim.fills = [{ type: 'SOLID', color: bg }]; dim.opacity = hasBackdrop ? 0.97 : 1; viewer.appendChild(dim);
  const img = m.hero.clone(); viewer.appendChild(img); img.name = 'Image';
  const side = Math.min(604, viewW - 2 * 200);
  img.resize(side, side - 2); if ('cornerRadius' in img) img.cornerRadius = 20;
  img.fills = img.fills.map(p => (p.type === 'IMAGE' ? { ...p, scaleMode: 'FILL' } : p));
  img.x = Math.round((viewW - side) / 2); img.y = Math.round((DESKTOP_H - side) / 2);

  // prev / next (only when the mobile is a carousel)
  if (m.dots) {
    const yC = Math.round(DESKTOP_H / 2 - 28);
    let left, right;
    if (det && det.arrows.length === 2) {
      const sorted = det.arrows.slice().sort((a, b) => absBox(a).x - absBox(b).x);
      left = sorted[0].clone(); right = sorted[1].clone();
      viewer.appendChild(left); viewer.appendChild(right);
      if (right.layoutPositioning === 'ABSOLUTE') right.layoutPositioning = 'AUTO';
    } else {
      const mk = svg => { const b = figma.createFrame(); b.resize(56, 56); b.cornerRadius = 28; b.fills = [{ type: 'SOLID', color: ink, opacity: 0.1 }];
        const ic = svgNode(svg, 24); b.appendChild(ic); ic.x = 16; ic.y = 16; return b; };
      left = mk(SVG.chevronLeft(inkHex)); right = mk(SVG.chevronRight(inkHex));
      viewer.appendChild(left); viewer.appendChild(right);
    }
    left.name = 'Prev'; right.name = 'Next';
    placeVisual(left, F, viewX + 88, yC); placeVisual(right, F, viewX + viewW - 88 - 56, yC);
  }
  // close
  const close = det && det.close ? det.close.clone() : svgNode(SVG.close(inkHex), 24);
  F.appendChild(close); close.name = 'Close'; placeVisual(close, F, PANEL_X - 54, 32);
  if (m.back) ctx.report.dropped.push('back button (replaced by ✕ close)');

  // side panel background
  let panelBg;
  if (det && det.sidePanel) { panelBg = det.sidePanel.clone(); F.appendChild(panelBg); }
  else { panelBg = figma.createRectangle(); F.appendChild(panelBg); panelBg.fills = clonePaints(m.mobile.fills); panelBg.resize(PANEL_W, DESKTOP_H); }
  panelBg.name = 'Panel background'; panelBg.x = PANEL_X; panelBg.y = 0;

  // thumbnails from the carousel dots
  if (m.dots) {
    const strip = autoLayout('VERTICAL', { name: 'Thumbnails', itemSpacing: 4, counterAxisAlignItems: 'MAX' });
    F.appendChild(strip); strip.x = 1648; strip.y = 16;
    const activeDot = m.dots.children.find(d => m.dots.children.filter(x => colorKey(x) === colorKey(d)).length === 1);
    const ring = activeDot && firstSolid(activeDot) ? firstSolid(activeDot).color : ink;
    m.dots.children.forEach((d, i) => {
      const t = figma.createRectangle(), s = i === 0 ? 68 : 64;
      t.resize(s, s); t.cornerRadius = 12; t.fills = clonePaints(img.fills);
      t.name = i === 0 ? 'Thumb (active)' : `Thumb ${i + 1} (duplicate)`;
      if (i === 0) { t.strokes = [{ type: 'SOLID', color: ring }]; t.strokeWeight = 1; }
      strip.appendChild(t);
      if (i > 0) ctx.report.duplicates.push({ id: t.id, label: `thumbnail ${i + 1} (copy of the current image)` });
    });
  }

  // panel column: content on top, CTA pinned to the bottom
  const panel = autoLayout('VERTICAL', { name: 'Panel', itemSpacing: 24, primaryAxisAlignItems: 'SPACE_BETWEEN' });
  F.appendChild(panel); panel.x = PANEL_COL_X; panel.y = 37;
  panel.resize(PANEL_COL_W, DESKTOP_H - 61); panel.primaryAxisSizingMode = 'FIXED'; panel.counterAxisSizingMode = 'FIXED';
  const top = autoLayout('VERTICAL', { name: 'Panel content', itemSpacing: 24 }); panel.appendChild(top); fill(top);
  const header = autoLayout('HORIZONTAL', { name: 'Header', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' });
  top.appendChild(header); fill(header);
  if (m.title) {
    const tr = autoLayout('HORIZONTAL', { name: 'Title', itemSpacing: 6, counterAxisAlignItems: 'BASELINE' }); header.appendChild(tr);
    const t = m.title.clone(); tr.appendChild(t); scaleTextNode(t, Math.min(20, fontSizeOf(t)));
    if (m.subtitle) tr.appendChild(m.subtitle.clone());
  }
  if (m.topActions) header.appendChild(m.topActions.clone());
  const line = () => {
    let l;
    if (det && det.line) l = det.line.clone();
    else { l = figma.createRectangle(); l.resize(PANEL_COL_W, 1); l.fills = [{ type: 'SOLID', color: ink, opacity: 0.15 }]; }
    top.appendChild(l); fill(l); l.name = 'Divider';
  };
  line();
  for (const b of m.blocks) {
    if (['topbar', 'cta-zone', 'title', 'logo', 'header', 'band'].includes(b.kind)) continue;
    if (b.kind === 'collapsed') { line(); await placeCollapsed(ctx, top, b); continue; }
    const c = cloneInto(top, b.node);
    // collapsed rows nested inside a cloned block get expanded in place
    const nested = c.findAll ? c.findAll(x => x.type === 'FRAME' && texts(x).some(t => COLLAPSE_RE.test(t.characters.trim())) && texts(x).length >= 2 && x.height <= 80) : [];
    for (const row of nested) {
      const title = texts(row).find(t => !COLLAPSE_RE.test(t.characters.trim()));
      const src = title && findExpandedSection(ctx, title.characters.trim());
      if (!src) { ctx.report.notes.push(`"${title ? title.characters.trim() : row.name}" stays collapsed (no expanded version found).`); continue; }
      const parent = row.parent, idx = parent.children.indexOf(row);
      const exp = src.clone(); parent.insertChild(idx, exp); row.remove();
      if (inAL(exp)) { exp.layoutSizingHorizontal = 'FILL'; if (isAL(exp)) exp.layoutSizingVertical = 'HUG'; }
      ctx.report.expanded.push(`"${title.characters.trim()}" expanded using the section from "${pageFrameOf(src).name}" (check its sample text)`);
    }
  }
  const ctaZone = m.blocks.find(b => b.kind === 'cta-zone');
  if (ctaZone) cloneInto(panel, ctaZone.node);
  if (m.topActions && style.dagiga) ctx.report.notes.push('Top actions copied from the mobile toolbar.');
}

// ---------- patterns-popup.js: full-screen sheet / paywall / dialog → centered modal ----------
async function buildPopup(ctx) {
  const { m, style, F } = ctx;
  const bg = bgColorOf(m.mobile), ink = inkFor(bg);
  const base = style.dashboard || style.desktops.find(p => p.main || p.rail) || null;
  if (base) {
    const bd = base.frame.clone(); F.appendChild(bd); bd.x = 0; bd.y = 0; bd.name = `Backdrop (${base.frame.name})`;
    ctx.report.reused.push(`backdrop = your desktop "${base.frame.name}"`);
  } else F.fills = clonePaints(m.mobile.fills);
  let dim;
  if (style.modal && style.modal.dim) { dim = style.modal.dim.clone(); F.appendChild(dim); dim.x = 0; dim.y = 0; }
  else { dim = figma.createRectangle(); F.appendChild(dim); dim.resize(DESKTOP_W, DESKTOP_H); dim.fills = [{ type: 'SOLID', color: bg }]; dim.opacity = base ? 0.9 : 0.6; }
  dim.name = 'Dim';

  const blocks = m.blocks;
  const body = blocks.filter(b => !['band', 'topbar', 'tabs', 'cta-zone', 'title', 'logo', 'header'].includes(b.kind));
  const ctaZone = blocks.find(b => b.kind === 'cta-zone');
  const twoCol = body.length >= 1 && ctaZone && (ctaZone.node !== m.cta || body.length >= 2);
  const M = twoCol ? 742 : 560, PAD = 32;

  const modal = figma.createFrame(); modal.name = 'Modal'; F.appendChild(modal);
  const ref = style.modal && style.modal.modal;
  modal.fills = clonePaints(ref ? ref.fills : m.mobile.fills);
  modal.strokes = ref ? clonePaints(ref.strokes) : [{ type: 'SOLID', color: ink, opacity: 0.12 }];
  modal.strokeWeight = ref && typeof ref.strokeWeight === 'number' ? ref.strokeWeight : 1;
  modal.cornerRadius = ref && typeof ref.cornerRadius === 'number' ? ref.cornerRadius : 16;
  modal.clipsContent = true; modal.resize(M, 800);
  if (ref) ctx.report.reused.push(`popup style from "${style.modal.frame.name}"`);

  let y = PAD;
  // header band stretched to the modal width
  const band = blocks.find(b => b.kind === 'band');
  if (band) {
    const h = band.node.clone(); modal.appendChild(h); h.x = 0; h.y = 0;
    const k = M / h.width; h.resize(M, h.height);
    for (const ch of h.children) if (ch.type === 'RECTANGLE' && Math.abs(ch.width * k - M) < M * 0.2) ch.resize(M, ch.height);
    y = h.height;
  }
  // title block (the mobile's title container) — title scaled up one step for a dialog
  const titleBlock = blocks.find(b => b.kind === 'topbar' && m.title && isInside(m.title, b.node));
  if (titleBlock) {
    const tb = titleBlock.node.clone(); modal.appendChild(tb); tb.x = PAD;
    if (isAL(tb)) { tb.resize(M - 2 * PAD - 40, tb.height); }
    const t = texts(tb).find(x => x.characters === m.title.characters);
    if (t) { scaleTextNode(t, Math.round(fontSizeOf(t) * 4 / 3)); if (inAL(t)) t.layoutSizingHorizontal = 'FILL'; }
    tb.y = band ? Math.max(PAD, (band ? y : 0) - 25 - 24 - tb.height) : PAD;
    if (!band) y = tb.y + tb.height + 24;
  } else if (m.title) {
    const t = m.title.clone(); modal.appendChild(t); t.x = PAD; t.y = PAD; y = PAD + t.height + 24;
  }
  // close ✕, top-right
  if (m.close) { const c = m.close.clone(); modal.appendChild(c); if (c.width < 20) c.rescale(24 / c.width); placeVisual(c, modal, M - PAD - absBox(c).width, PAD); }
  const otherTop = blocks.filter(b => b.kind === 'topbar' && b !== titleBlock);
  if (otherTop.length) ctx.report.dropped.push('mobile sheet chrome next to the ✕ (handle / indicator)');
  // tabs, centered; straddle the band edge like on mobile
  const tabs = blocks.find(b => b.kind === 'tabs');
  if (tabs) {
    const t = tabs.node.clone(); modal.appendChild(t);
    t.x = Math.round((M - t.width) / 2);
    const straddled = band && rel(tabs.node, m.mobile).y < band.node.height;
    t.y = straddled ? y - Math.round(t.height / 2) : y + 8;
    y = t.y + t.height + 32;
  } else if (band) y += 32;

  // body
  const row = autoLayout('HORIZONTAL', { name: 'Body', itemSpacing: 24 });
  modal.appendChild(row); row.x = PAD; row.y = y;
  row.resize(M - 2 * PAD, row.height); row.primaryAxisSizingMode = 'FIXED'; row.counterAxisSizingMode = 'AUTO';
  const right = autoLayout('VERTICAL', { name: 'Choices', itemSpacing: 16 });
  if (twoCol) {
    const left = autoLayout('VERTICAL', { name: 'Details', itemSpacing: 24 }); row.appendChild(left);
    for (const b of body.filter(b => b.node !== m.cta)) { const c = b.node.clone(); left.appendChild(c); if (c.layoutPositioning === 'ABSOLUTE') c.layoutPositioning = 'AUTO'; }
    left.resize(Math.max(200, naturalWidth(left)), left.height); left.layoutSizingHorizontal = 'FIXED'; left.layoutSizingVertical = 'HUG';
  }
  row.appendChild(right); right.layoutSizingHorizontal = 'FILL';
  if (!twoCol) for (const b of body) { const c = cloneInto(right, b.node); rampText(c, {}); }
  if (ctaZone) {
    // options + CTA: when the CTA lives in a container (bottom sheet), take that container's children
    const zone = ctaZone.node;
    const parts = zone === m.cta ? [zone] : zone.children.filter(c => c.visible && (texts(c).length || hasVisibleFill(c)) && !(c.type === 'RECTANGLE' && c.width >= zone.width - 2));
    for (const p of parts) { const c = p.clone(); right.appendChild(c); fill(c); if (isAL(c)) for (const k of c.children) if (inAL(k)) k.layoutSizingHorizontal = 'FILL'; }
  }
  modal.resize(M, row.y + row.height + PAD);
  modal.x = Math.round((DESKTOP_W - M) / 2); modal.y = Math.max(40, Math.round((DESKTOP_H - modal.height) / 2));
  ctx.modal = modal;
}

// ---------- patterns-stack.js: lists, forms, settings (fallback) ----------
// Centered reading column (max 720) inside the shell. Card lists become grids, form fields pair up 2-up,
// the bottom CTA sits at the end of the column instead of spanning it.
async function buildStack(ctx) {
  const { m, style } = ctx;
  const col = buildShell(ctx);
  const outer = col;
  // narrow reading column inside the content area
  const inner = autoLayout('VERTICAL', { name: 'Column', itemSpacing: 24 }); outer.appendChild(inner);
  const W = Math.min(720, ctx.colW);
  inner.resize(W, inner.height); inner.counterAxisSizingMode = 'FIXED';
  outer.counterAxisAlignItems = 'CENTER';
  ctx.col = inner; ctx.colW = W;
  // header: title + top actions (save / edit) on the right
  const head = autoLayout('HORIZONTAL', { name: 'Header', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' });
  inner.appendChild(head); fill(head);
  if (m.title) { const t = m.title.clone(); head.appendChild(t); scaleTextNode(t, style.ramp[Math.round(fontSizeOf(t))] || fontSizeOf(t)); }
  if (m.topActions) head.appendChild(m.topActions.clone());
  if (m.back) ctx.report.dropped.push('back button (the sidebar handles navigation)');

  const blocks = m.blocks.filter(b => !['title', 'logo', 'header', 'topbar'].includes(b.kind));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'cta-zone') { const c = cloneInto(inner, b.node, { fillWidth: false }); if (c.width > 360) c.resize(360, c.height); continue; }
    if (b.kind === 'collapsed') { await placeCollapsed(ctx, inner, b); continue; }
    if (b.kind === 'list' && b.items.every(it => hasVisibleFill(it) && it.height >= 64)) { buildGrid(ctx, inner, b.items, b.node.name); continue; }
    if (b.kind === 'section' || b.kind === 'scroller' || b.kind === 'pair') {
      if (b.head) { const h = b.head.clone(); inner.appendChild(h); fill(h); await sectionTitle(ctx, h); }
      buildRow(ctx, inner, b.items, b.node.name); continue;
    }
    // form fields: consecutive short, equal-width input-like blocks pair up side by side
    const isField = x => x && x.kind === 'other' || x && x.kind === 'card';
    const fieldLike = n => n.height <= 96 && n.width >= m.W * 0.7 && texts(n).length >= 1 && texts(n).length <= 3;
    const nb = blocks[i + 1];
    if (isField(b) && nb && isField(nb) && fieldLike(b.node) && fieldLike(nb.node) && W >= 640) {
      const row = autoLayout('HORIZONTAL', { name: 'Field row', itemSpacing: 16 }); inner.appendChild(row); fill(row);
      for (const x of [b, nb]) { const c = x.node.clone(); row.appendChild(c); fill(c); rampText(c, style.ramp); widenWrappingText(c); }
      i++; continue;
    }
    const c = cloneInto(inner, b.node); rampText(c, style.ramp); widenWrappingText(c);
  }
}

// ---------- patterns-welcome.js: welcome / onboarding split screen, and the safe centered fallback ----------
// Welcome: picture large on the left half, headline + text + main button on the right half (sign-up page style).
const CTA_W = 360;
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

// Most common solid color inside a picture (to tint the picture's panel).
function dominantColor(n) {
  const counts = {};
  const nodes = 'findAll' in n ? n.findAll(x => x.visible && 'fills' in x) : [n];
  for (const x of nodes) { const f = firstSolid(x); if (!f) continue; const k = hex(f.color); counts[k] = (counts[k] || { c: f.color, a: 0 }); counts[k].a += x.width * x.height; }
  const best = Object.values(counts).sort((a, b) => b.a - a.a)[0];
  return best ? best.c : null;
}

async function leftAlign(ctx, root) {
  for (const t of texts(root)) if (t.textAlignHorizontal === 'CENTER') await editText(ctx, t, { textAlignHorizontal: 'LEFT', reason: 'desktop text column is left-aligned' });
  const stacks = [root, ...('findAll' in root ? root.findAll(x => isAL(x)) : [])].filter(isAL);
  for (const s of stacks) if (s.layoutMode === 'VERTICAL' && s.counterAxisAlignItems === 'CENTER') s.counterAxisAlignItems = 'MIN';
}

async function buildWelcome(ctx) {
  const { m, style, F } = ctx;
  const HALF = DESKTOP_W / 2, H = DESKTOP_H;
  const bg = bgColorOf(m.mobile);
  const vis = m.illustration || m.hero;

  // left: the picture
  const panel = figma.createFrame(); F.appendChild(panel);
  panel.name = 'Visual'; panel.resize(HALF, H); panel.x = 0; panel.y = 0; panel.clipsContent = true;
  const pic = vis.clone(); panel.appendChild(pic);
  if (vis === m.hero && !m.illustration) {
    // photo: cover the whole half
    unlock(pic); pic.resize(HALF, H); pic.x = 0; pic.y = 0;
    panel.fills = [];
  } else {
    // a soft tint of the brand color (the main button), else of the picture's main color
    const brand = m.cta && firstSolid(m.cta) ? firstSolid(m.cta).color : dominantColor(vis);
    panel.fills = [{ type: 'SOLID', color: brand ? mix(bg, brand, 0.07) : mix(bg, inkFor(bg), 0.04) }];
    const k = Math.min((HALF * 0.75) / pic.width, (H * 0.62) / pic.height);
    pic.rescale(k);
    const b = absBox(pic);
    placeVisual(pic, panel, (HALF - b.width) / 2, (H - b.height) / 2);
  }

  // right: headline, text, button, links
  const col = autoLayout('VERTICAL', { name: 'Content', itemSpacing: 24 }); F.appendChild(col);
  col.resize(440, col.height); col.counterAxisSizingMode = 'FIXED';
  const blocks = m.blocks.filter(b => b.node !== vis && !(m.illustration && b.node === m.hero));
  let headlineDone = false;
  for (const b of blocks) {
    if (b.kind === 'cta-zone') {
      const c = cloneInto(col, b.node, { fillWidth: false });
      if (inAL(c)) c.layoutSizingHorizontal = 'FIXED';
      if (isAL(c)) { c.paddingLeft = c.paddingRight = 0; } // mobile side margins aren't needed in the desktop column
      if (isAL(c) || c.type === 'FRAME') c.resize(CTA_W, c.height);
      rampText(c, style.ramp);
      continue;
    }
    const c = cloneInto(col, b.node, { fillWidth: texts(b.node).length > 0 && b.node.width > m.W * 0.5 });
    rampText(c, style.ramp);
    if (!headlineDone) {
      const big = texts(c).filter(t => fontSizeOf(t) >= 20).sort((a, z) => fontSizeOf(z) - fontSizeOf(a))[0];
      if (big) { scaleTextNode(big, Math.round(fontSizeOf(big) * 1.4)); headlineDone = true; }
    }
    widenWrappingText(c);
    await leftAlign(ctx, c);
  }
  // single-line headlines can't wrap: shrink any that ended up wider than the column
  for (const t of texts(col)) if (t.textAutoResize === 'WIDTH_AND_HEIGHT' && t.width > 440) scaleTextNode(t, Math.floor(fontSizeOf(t) * 440 / t.width));
  const cb = col.height;
  col.x = HALF + (HALF - 440) / 2;
  col.y = Math.max(64, Math.round((H - cb) / 2));
  ctx.col = col; ctx.colW = 440;
  if (m.dots) ctx.report.dropped.push('page dots (one desktop page shows it all)');
  ctx.report.moved.push('picture → left half; headline, text and button → right half');
}

// Safe fallback: no invented navigation, one centered column, mobile order kept.
async function buildCentered(ctx) {
  const { m, style, F } = ctx;
  const COL = 640;
  const col = autoLayout('VERTICAL', { name: 'Content', itemSpacing: 24, counterAxisAlignItems: 'CENTER' }); F.appendChild(col);
  col.resize(COL, col.height); col.counterAxisSizingMode = 'FIXED';
  col.x = (DESKTOP_W - COL) / 2; col.y = 80;
  for (const b of m.blocks) {
    if (b.kind === 'cta-zone') { const c = cloneInto(col, b.node, { fillWidth: false }); if (c.width > 360 && (isAL(c) || c.type === 'FRAME')) { if (inAL(c)) c.layoutSizingHorizontal = 'FIXED'; c.resize(360, c.height); } rampText(c, style.ramp); continue; }
    const hasText = texts(b.node).length > 0;
    const c = cloneInto(col, b.node, { fillWidth: hasText && b.node.width >= m.W * 0.8 });
    if (!hasText) {
      // pictures grow with the column, up to 1.6×
      const k = Math.min(1.6, (b.node.width >= m.W * 0.8 ? COL : b.node.width * 1.6) / c.width);
      if (k > 1.01) c.rescale(k);
    } else { rampText(c, style.ramp); widenWrappingText(c); }
  }
  ctx.col = col; ctx.colW = COL;
  ctx.report.notes.push('This screen was hard to read automatically, so it was laid out as one clean centered column.');
}

// ---------- audit.js: structural checks + safe automatic fixes ----------
function audit(F) {
  const fb = absBox(F), issues = [];
  const skip = n => /^(Rail|Backdrop|Sidebar)/.test(n.name);
  (function walk(n, sk0) {
    if (n.visible === false) return;
    const sk = sk0 || skip(n);
    if (!sk && n.type === 'TEXT') {
      let p = n.parent; while (p && p.type !== 'FRAME') p = p.parent;
      const b = absBox(n), pb = absBox(p);
      if (b.x + b.width > pb.x + pb.width + 1 || b.x < pb.x - 1) issues.push({ id: n.id, kind: 'text-overflow', msg: `"${n.characters.slice(0, 30)}" is wider than its container` });
      if (b.y + b.height > fb.y + fb.height + 1 || b.x + b.width > fb.x + fb.width + 1) issues.push({ id: n.id, kind: 'outside', msg: `"${n.characters.slice(0, 30)}" is outside the frame` });
      if (typeof n.fontSize === 'number' && n.fontSize < 9) issues.push({ id: n.id, kind: 'tiny', msg: `"${n.characters.slice(0, 30)}" is too small (${n.fontSize.toFixed(1)}px)` });
    }
    if (!sk && 'children' in n && isAL(n))
      for (const c of n.children.filter(c => c.visible && c.layoutPositioning !== 'ABSOLUTE'))
        if (c.type !== 'LINE' && (c.width < 2 || c.height < 2)) issues.push({ id: c.id, kind: 'collapsed', msg: `"${c.name}" collapsed to ${Math.round(c.width)}×${Math.round(c.height)}` });
    if ('children' in n) for (const c of n.children) walk(c, sk);
  })(F, false);
  return issues;
}

async function autofix(ctx) {
  const { F } = ctx;
  let fixed = 0;
  for (const is of audit(F)) {
    const n = await figma.getNodeByIdAsync(is.id);
    if (!n) continue;
    if (is.kind === 'text-overflow' && n.type === 'TEXT' && inAL(n)) {
      if (n.textAutoResize === 'HEIGHT') { if (n.parent.layoutMode === 'HORIZONTAL') n.layoutGrow = 1; else n.layoutSizingHorizontal = 'FILL'; fixed++; }
      else if (isAL(n.parent) && n.parent.layoutSizingHorizontal === 'FIXED' && inAL(n.parent)) { n.parent.layoutSizingHorizontal = 'HUG'; fixed++; }
    }
    if (is.kind === 'collapsed' && inAL(n) && 'layoutSizingHorizontal' in n) { n.layoutSizingHorizontal = 'FILL'; if (isAL(n)) n.layoutSizingVertical = 'HUG'; fixed++; }
  }
  return fixed;
}

// The page may be taller than one screen: grow the frame (and its full-height panels) instead of clipping content.
function fitHeight(ctx) {
  const { F } = ctx;
  const fb = absBox(F);
  let bottom = 0;
  for (const n of [ctx.col, ctx.modal].filter(Boolean)) { const b = absBox(n); bottom = Math.max(bottom, b.y + b.height - fb.y); }
  if (bottom + 48 <= DESKTOP_H) return;
  const H = Math.ceil(bottom + 64);
  F.resize(DESKTOP_W, H);
  // full-height children (sidebar, main panel, rail, dims) keep their top/bottom margins
  for (const c of F.children) if (c.height >= DESKTOP_H - 60 && ['FRAME', 'RECTANGLE', 'VECTOR'].includes(c.type)) c.resize(c.width, H - 2 * Math.max(0, c.y));
  ctx.report.notes.push(`The page is taller than one screen, so the frame grew to ${H}px. It scrolls on desktop.`);
}

// ---------- engine.js: one call does the whole job ----------
// generateWebVersion(mobileId, { pattern: 'auto'|'home'|'detail'|'popup'|'stack', style: 'auto'|'file'|'generic'|'dagiga' }, onProgress)
// → { frameId, pattern, style, report, issues }
const PATTERN_LABELS = { home: 'Home / feed', detail: 'Detail', popup: 'Popup / sheet', stack: 'List / form', welcome: 'Welcome / onboarding', centered: 'Centered column (screen was hard to read)' };

function inspectMobile(node) {
  // quick read for the UI: is this a mobile screen, and what would we do with it?
  if (!node || node.type !== 'FRAME') return { ok: false, reason: 'Select a frame (a mobile screen).' };
  if (node.width < 320 || node.width > 480) {
    if (/— (Web|Desktop)$/.test(node.name)) return { ok: false, web: true, reason: 'This is a generated desktop version.' };
    return { ok: false, reason: `This frame is ${Math.round(node.width)}px wide. Select a mobile screen (320–480 wide).` };
  }
  return { ok: true, id: node.id, name: node.name };
}

// Rescaled text can land on sizes like 15.99. Where the font is installed, set whole-number sizes.
async function snapFontSizes(F) {
  for (const t of F.findAllWithCriteria({ types: ['TEXT'] })) {
    const segs = t.getStyledTextSegments(['fontSize', 'fontName']);
    if (segs.every(s => Math.abs(s.fontSize - Math.round(s.fontSize)) < 0.01)) continue;
    let ok = true;
    for (const s of segs) if (!(await canLoad(s.fontName))) ok = false;
    if (!ok) continue;
    for (const s of segs) t.setRangeFontSize(s.start, s.end, Math.round(s.fontSize));
  }
}

async function generateWebVersion(mobileId, opts = {}, onProgress = () => {}) {
  const mobile = await figma.getNodeByIdAsync(mobileId);
  if (!mobile || mobile.type !== 'FRAME') throw new Error('The selected layer is not a frame.');
  onProgress('Analyzing the mobile screen…');
  const report = { pattern: '', style: '', duplicates: [], expanded: [], dropped: [], moved: [], reused: [], textTodos: [], notes: [], lowConfidence: false };
  // loosely built screens are grouped on a hidden copy first; the build reads from that copy
  const norm = normalizeMobile(mobile, report);
  const ctx = { m: null, style: null, report, F: null, col: null, colW: 0 };
  try {
    const m = analyze(norm.work);
    m.mobile = mobile; // same position as the copy; placement, name and background come from the original
    let pattern = opts.pattern && opts.pattern !== 'auto' ? opts.pattern : m.pattern;
    // not confident (mostly unrecognized pieces): a clean centered column beats a guessed layout
    const others = m.blocks.filter(b => b.kind === 'other').length;
    if ((!opts.pattern || opts.pattern === 'auto') && pattern === 'stack' && (others > m.blocks.length * 0.5 || m.blocks.length > 14)) {
      pattern = 'centered'; report.lowConfidence = true;
    }
    if (pattern === 'detail' && !m.hero) throw new Error('Detail layout needs a large image near the top.');
    const style = detectStyle(mobile, m, opts.style && opts.style !== 'auto' ? opts.style : null);
    Object.assign(ctx, { m, style });
    report.pattern = PATTERN_LABELS[pattern]; report.style = style.label; report.dropped.push(...m.drop);
    if (m.rtl) report.notes.push('Arabic/Hebrew screen: the layout was not mirrored yet. Check the navigation side.');

    onProgress('Building the desktop layout…');
    createDesktopFrame(ctx);
    try {
      if (pattern === 'home') await buildHome(ctx);
      else if (pattern === 'detail') await buildDetail(ctx);
      else if (pattern === 'popup') await buildPopup(ctx);
      else if (pattern === 'welcome') await buildWelcome(ctx);
      else if (pattern === 'centered') await buildCentered(ctx);
      else await buildStack(ctx);
    } catch (e) {
      ctx.F.remove();
      throw e;
    }
    onProgress('Checking and fixing the layout…');
    const fixed = await autofix(ctx);
    await snapFontSizes(ctx.F);
    fitHeight(ctx);
    const issues = audit(ctx.F);
    if (fixed) report.notes.push(`Auto-fixed ${fixed} layout issue${fixed === 1 ? '' : 's'}.`);
    ctx.F.setSharedPluginData('webversion', 'source', mobile.id);
    ctx.F.setSharedPluginData('webversion', 'report', JSON.stringify(report));
    return { frameId: ctx.F.id, pattern, report, issues: issues.map(i => i.msg) };
  } finally {
    norm.cleanup();
  }
}

// ---------- main.js: plugin UI glue (one button: Create desktop version) ----------
figma.showUI(__html__, { width: 320, height: 200, themeColors: true });

const NS = 'webversion';
const CLAUDE_URLS = { connectors: 'https://claude.ai/settings/connectors', capabilities: 'https://claude.ai/settings/capabilities', new: 'https://claude.ai/new' };

// Node links for the Claude request. figma.fileKey works for private/development plugins; otherwise the file link the user pasted once.
function fileKey() {
  try { if (figma.fileKey) return figma.fileKey; } catch (e) {}
  const url = figma.root.getPluginData('fileUrl');
  const m = url && url.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}
function nodeLink(id) {
  const key = fileKey();
  return key ? `https://www.figma.com/design/${key}/?node-id=${id.replace(/:/g, '-')}` : null;
}

function selectionState() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return { ok: false, reason: sel.length ? 'Select just one screen.' : '' };
  const n = sel[0];
  if (n.type === 'FRAME' && n.getSharedPluginData(NS, 'source')) return { ok: false, reason: 'This is a desktop version already. Click its mobile screen instead.' };
  try { return inspectMobile(n); } catch (e) { return { ok: false, reason: 'Could not read this frame: ' + e.message }; }
}

let lastSource = null; // { id, name } of the mobile screen behind the last result

// Ready-made request for Claude, so the panel can copy it right on click.
function claudeRequest(sel) {
  const src = sel.ok ? { id: sel.id, name: sel.name } : lastSource;
  if (!src) return { error: 'Click a mobile screen first.' };
  const link = nodeLink(src.id);
  if (!link) return { needLink: true };
  return { text: `Make the desktop version of this mobile screen: ${link}\nIf there is a frame named "${src.name} — Desktop" (or "${src.name} — Web") next to it, replace it.` };
}

async function postState() {
  const setupDone = !!(await figma.clientStorage.getAsync('claudeSetupDone'));
  const selection = selectionState();
  figma.ui.postMessage({ type: 'state', selection, setupDone, claude: claudeRequest(selection) });
}

async function applyTodo(t) {
  let c; try { c = JSON.parse(t.getSharedPluginData(NS, 'todo')); } catch (e) { return { ok: false, error: 'Unreadable fix' }; }
  try {
    const current = t.getStyledTextSegments(['fontName']).map(s => s.fontName);
    for (const f of current) await figma.loadFontAsync(f);
    const target = { family: c.fontFamily || current[0].family, style: c.fontStyle || current[0].style };
    if (c.fontFamily || c.fontStyle) { await figma.loadFontAsync(target); t.fontName = target; }
    if (c.characters !== undefined) t.characters = String(c.characters);
    if (c.textAutoResize) t.textAutoResize = c.textAutoResize;
    if (c.textAlignHorizontal) t.textAlignHorizontal = c.textAlignHorizontal;
    t.setSharedPluginData(NS, 'todo', '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).replace(/Please call.*$/, '').trim() };
  }
}

async function generate() {
  const sel = selectionState();
  if (!sel.ok) throw new Error(sel.reason || 'Click a mobile screen first.');
  const sourceId = sel.id;
  const mobile = await figma.getNodeByIdAsync(sourceId);
  if (!mobile) throw new Error('The mobile screen no longer exists.');
  const res = await generateWebVersion(sourceId, {}, text => figma.ui.postMessage({ type: 'progress', text }));
  const F = await figma.getNodeByIdAsync(res.frameId);
  lastSource = { id: sourceId, name: mobile.name };
  figma.currentPage.selection = [F];
  figma.viewport.scrollAndZoomIntoView([F]);
  figma.ui.postMessage({ type: 'result', result: { frameId: res.frameId, name: F.name, sourceId, lowConfidence: !!res.report.lowConfidence } });
}

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'refresh') return postState();
    if (msg.type === 'generate') { await generate(); return postState(); }
    if (msg.type === 'resize') { figma.ui.resize(320, Math.max(140, Math.min(720, Math.ceil(msg.height)))); return; }
    if (msg.type === 'open') { if (CLAUDE_URLS[msg.page]) figma.openExternal(CLAUDE_URLS[msg.page]); return; }
    if (msg.type === 'setup-done') { await figma.clientStorage.setAsync('claudeSetupDone', !!msg.done); return postState(); }
    if (msg.type === 'set-file-url') {
      const ok = /figma\.com\/(?:design|file)\/[A-Za-z0-9]+/.test(msg.url || '');
      if (ok) figma.root.setPluginData('fileUrl', msg.url.trim());
      figma.ui.postMessage({ type: 'file-url', ok });
      return postState();
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};

// Text fixes Claude couldn't apply (missing font in its environment): finish them quietly here, where the fonts exist.
async function applyPendingTodos() {
  const nodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'], sharedPluginData: { namespace: NS, keys: ['todo'] } })
    .filter(t => t.getSharedPluginData(NS, 'todo'));
  for (const t of nodes) await applyTodo(t);
}

figma.on('selectionchange', postState);
figma.on('currentpagechange', () => { postState(); applyPendingTodos(); });
postState();
applyPendingTodos();
