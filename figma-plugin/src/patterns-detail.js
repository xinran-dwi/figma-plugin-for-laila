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
