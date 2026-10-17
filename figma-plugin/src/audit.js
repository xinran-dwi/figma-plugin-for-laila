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
