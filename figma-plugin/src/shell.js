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
