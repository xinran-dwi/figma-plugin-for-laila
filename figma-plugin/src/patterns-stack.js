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
