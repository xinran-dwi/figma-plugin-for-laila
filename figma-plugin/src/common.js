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
