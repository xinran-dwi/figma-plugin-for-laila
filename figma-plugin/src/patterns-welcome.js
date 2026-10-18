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
