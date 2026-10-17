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
