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
