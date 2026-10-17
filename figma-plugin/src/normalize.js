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
  work.name = mobile.name + ' (web version work copy)';
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
