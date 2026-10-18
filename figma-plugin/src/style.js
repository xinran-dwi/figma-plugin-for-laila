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
