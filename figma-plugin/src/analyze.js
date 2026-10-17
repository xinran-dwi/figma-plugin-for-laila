// ---------- analyze.js: semantic model of a mobile frame ----------
const COLLAPSE_RE = /^(show|show more|see more|read more|expand|more)$/i;

function analyze(mobile) {
  const W = mobile.width, H = mobile.height;
  const R = n => rel(n, mobile);
  const visibleDesc = mobile.findAll(n => n.visible !== false);
  const isVisibleChain = n => { for (let p = n; p && p !== mobile; p = p.parent) if (p.visible === false) return false; return true; };
  const desc = visibleDesc.filter(isVisibleChain);
  const kids = mobile.children.filter(c => c.visible);
  const m = { mobile, W, H, drop: [], blocks: [], tabBar: null, tabItems: [], activeTab: null, accent: null,
    statusBar: null, back: null, close: null, hero: null, dots: null, cta: null, title: null, subtitle: null,
    topActions: null, logo: null, avatar: null, search: null, band: null, rtl: false };

  // --- chrome
  m.statusBar = kids.find(c => /status ?bar/i.test(c.name) || (R(c).y <= 4 && R(c).h >= 36 && R(c).h <= 72 && texts(c).some(t => /^\d{1,2}:\d{2}$/.test(t.characters.trim())))) || null;
  const homeInd = kids.find(c => R(c).y > H - 30 && R(c).h <= 8 && R(c).w >= 100 && R(c).w <= 180) || null;
  const decor = kids.filter(c => c.opacity < 0.3 || /^(pattern|bg|background)$/i.test(c.name) || (c.type === 'ELLIPSE' && c.width > W * 0.6));

  const tabCand = desc.filter(n => n.type === 'FRAME' && (/tab ?bar|bottom ?nav|navigation ?bar/i.test(n.name) ||
    (R(n).y + R(n).h >= H - 130 && R(n).w >= W * 0.75 && R(n).h >= 48 && R(n).h <= 130)) &&
    n.children.filter(c => c.visible).length >= 3 && n.children.filter(c => c.visible).length <= 6 &&
    n.children.filter(c => c.visible).every(c => texts(c).length >= 1 && texts(c).length <= 2));
  m.tabBar = tabCand.sort((a, b) => (/tab ?bar|nav/i.test(b.name) ? 1 : 0) - (/tab ?bar|nav/i.test(a.name) ? 1 : 0))[0] || null;
  if (m.tabBar) {
    m.tabItems = m.tabBar.children.filter(c => c.visible);
    const keyOf = it => colorKey(texts(it)[0]);
    const counts = {}; for (const it of m.tabItems) counts[keyOf(it)] = (counts[keyOf(it)] || 0) + 1;
    m.activeTab = m.tabItems.find(it => counts[keyOf(it)] === 1) || null;
    if (m.activeTab) m.accent = firstSolid(texts(m.activeTab)[0]).color;
  }
  const inTabBar = n => { for (let p = n; p; p = p.parent) if (p === m.tabBar) return true; return false; };

  // --- top bar: back (left square button) / close (small icon top-right) / title / actions
  const top = desc.filter(n => R(n).y < 170 && n !== m.statusBar && !(m.statusBar && isInside(n, m.statusBar)));
  m.back = top.find(n => /back|chevron.?left|arrow.?left/i.test(n.name) && R(n).x < 80) ||
    top.find(n => n.type === 'FRAME' && R(n).x < 40 && R(n).w >= 32 && R(n).w <= 56 && Math.abs(R(n).w - R(n).h) < 4 && !texts(n).length) || null;
  // ✕ = named like a close icon, or a small group of exactly two square-ish strokes (an X)
  const looksLikeX = n => { if (!('findAll' in n)) return false; const v = n.findAll(x => x.type === 'VECTOR'); return v.length === 2 && v.every(x => Math.abs(x.width - x.height) < 3); };
  m.close = top.find(n => R(n).x > W - 90 && R(n).w <= 32 && R(n).h <= 32 && R(n).w >= 10 && !texts(n).length && n.type !== 'ELLIPSE' && !hasImageFill(n) &&
    (/close|multipl|remove.?circle|xmark|cross|dismiss/i.test(n.name) || looksLikeX(n))) || null;
  m.logo = desc.find(n => /logo/i.test(n.name) && R(n).y < 160 && !inTabBar(n)) ||
    kids.find(c => (c.type === 'GROUP' || c.type === 'VECTOR') && R(c).y < 140 && !texts(c).length && R(c).w < W * 0.5) || null;
  const bigTexts = desc.filter(n => n.type === 'TEXT' && R(n).y < 200 && !inTabBar(n) && !(m.statusBar && isInside(n, m.statusBar)) &&
    n !== m.logo && !(m.logo && isInside(n, m.logo)));
  m.title = bigTexts.filter(t => fontSizeOf(t) >= 20).sort((a, b) => R(a).y - R(b).y)[0] || null;
  if (m.title) m.subtitle = bigTexts.find(t => t !== m.title && Math.abs(R(t).y + R(t).h - (R(m.title).y + R(m.title).h)) < 12 && R(t).x > R(m.title).x) || null;
  m.avatar = top.find(n => (/avatar|profile|user/i.test(n.name) || n.type === 'ELLIPSE') && R(n).w >= 24 && R(n).w <= 56 && R(n).x > W * 0.6 && !inTabBar(n)) || null;
  m.search = desc.find(n => n.type === 'FRAME' && R(n).h >= 36 && R(n).h <= 64 && R(n).w >= W * 0.7 && (/search/i.test(n.name) || texts(n).some(t => /search/i.test(t.characters)))) || null;
  const actionCands = top.filter(n => n.type === 'FRAME' && R(n).x > W * 0.4 && R(n).h >= 32 && R(n).h <= 52 && !texts(n).length && n !== m.close && n !== m.avatar && R(n).w > 40);
  m.topActions = actionCands.filter(a => !actionCands.some(b => b !== a && isInside(a, b))).sort((a, b) => R(b).w - R(a).w)[0] || null;

  // --- media
  m.hero = desc.find(n => (n.type === 'RECTANGLE' || n.type === 'FRAME') && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE' && f.visible !== false) &&
    R(n).w >= W * 0.85 && R(n).h >= 180 && R(n).y < H * 0.5) || null;
  const dotRows = desc.filter(n => n.type === 'FRAME' && n.children && n.children.length > 1 && n.children.every(c => c.type === 'ELLIPSE'));
  m.dots = dotRows.find(r => new Set(r.children.map(colorKey)).size > 1) || null;

  // --- primary CTA: full-width pill near the bottom (outermost same-size wrapper)
  const ctaCand = desc.filter(n => n.type === 'FRAME' && R(n).w >= (W - 40) * 0.8 && R(n).h >= 44 && R(n).h <= 64 && ((typeof n.cornerRadius === 'number' && n.cornerRadius >= 16) || n.getSharedPluginData('webversion', 'button')) &&
    texts(n).length >= 1 && texts(n).length <= 2 && R(n).y + R(n).h >= H - 170 && !inTabBar(n)).sort((a, b) => R(b).y - R(a).y);
  if (ctaCand.length) {
    let c = ctaCand[0];
    while (c.parent && c.parent !== mobile && Math.abs(c.parent.width - c.width) < 2 && Math.abs(c.parent.height - c.height) < 2) c = c.parent;
    m.cta = c;
  }

  // --- illustration: the biggest text-free picture (group / vector art / image) in the upper part of the screen
  const ill = kids.filter(c => !texts(c).length && c !== m.hero && c !== m.statusBar && (c.type === 'GROUP' || c.type === 'FRAME' || c.type === 'VECTOR' || hasImageFill(c)) &&
    R(c).w >= W * 0.4 && R(c).h >= 80 && R(c).y < H * 0.65 && !(R(c).w >= W * 0.95 && R(c).h >= H * 0.9));
  m.illustration = ill.sort((a, b) => R(b).w * R(b).h - R(a).w * R(a).h)[0] || null;

  // --- RTL: mostly Arabic/Hebrew characters
  const allText = desc.filter(n => n.type === 'TEXT').map(t => t.characters).join('');
  const rtlChars = (allText.match(/[֐-ࣿ]/g) || []).length;
  m.rtl = rtlChars > allText.replace(/\s/g, '').length * 0.5;

  // --- content blocks (document order), skipping chrome and things handled above
  const handled = new Set([m.statusBar, homeInd, m.tabBar, m.hero, m.dots, ...decor].filter(Boolean));
  let blocks = kids.filter(c => !handled.has(c));
  // overlays sitting on the hero (e.g. an "Image details" chip) are mobile-only
  if (m.hero) {
    const hb = R(m.hero);
    blocks = blocks.filter(c => { const b = R(c); const over = b.x >= hb.x - 1 && b.y >= hb.y - 1 && b.x + b.w <= hb.x + hb.w + 1 && b.y + b.h <= hb.y + hb.h + 1; if (over && c !== m.hero) m.drop.push(`"${c.name}" overlay on the image`); return !over; });
  }
  // flatten the main scroll container (a tall vertical auto-layout holding most content)
  const expand = [];
  for (const b of blocks) {
    if (b.layoutMode === 'VERTICAL' && b.children.filter(c => c.visible).length >= 3 && R(b).h > H * 0.45) expand.push(...b.children.filter(c => c.visible && !handled.has(c)));
    else expand.push(b);
  }
  blocks = expand.sort((a, b) => R(a).y - R(b).y || R(a).x - R(b).x);
  for (const b of blocks) m.blocks.push(classifyBlock(b, m, R));
  m.band = m.blocks.find(b => b.kind === 'band')?.node || null;
  m.pattern = classifyScreen(m);
  if (homeInd) m.drop.push('home indicator');
  if (m.statusBar) m.drop.push('status bar');
  return m;
}

function isInside(n, ancestor) { for (let p = n.parent; p; p = p.parent) if (p === ancestor) return true; return false; }

function classifyBlock(n, m, R) {
  const b = R(n), W = m.W, cw = W - 40;
  const kids = 'children' in n ? n.children.filter(c => c.visible) : [];
  const ts = texts(n);
  const overflows = x => { const r = R(x); return r.x + r.w > W + 1 || r.w > W; };
  const isPill = c => c.type === 'FRAME' && R(c).h <= 48 && texts(c).length === 1 && (typeof c.cornerRadius === 'number' && c.cornerRadius >= Math.min(12, R(c).h / 2 - 1));
  const holdsCta = m.cta && (n === m.cta || isInside(m.cta, n));
  const holdsTop = (m.back && (n === m.back || isInside(m.back, n))) || (m.close && isInside(m.close, n)) || (m.title && isInside(m.title, n) && b.y < 170 && n.type !== 'TEXT' && !hasVisibleFill(n));

  if (holdsCta) return { kind: 'cta-zone', node: n };
  if (holdsTop) return { kind: 'topbar', node: n };
  if (n === m.title) return { kind: 'title', node: n };
  if (n === m.logo) return { kind: 'logo', node: n };
  if (n === m.search) return { kind: 'search', node: n };
  if (m.search && isInside(m.search, n) && kids.length <= 2) return { kind: 'search', node: m.search };
  if (n.type === 'FRAME' && !isAL(n) && b.y <= 2 && b.w >= W - 2 && b.h < m.H * 0.4 && (hasVisibleFill(n) || kids.some(c => c.type === 'RECTANGLE' && hasVisibleFill(c)))) return { kind: 'band', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && b.y < 170 && (kids.some(c => c === m.logo || /logo/i.test(c.name)) || kids.some(c => c === m.avatar))) return { kind: 'header', node: n };
  if (COLLAPSE_RE.test((ts.find(t => COLLAPSE_RE.test(t.characters.trim())) || { characters: '' }).characters.trim()) && ts.length >= 2 && b.h <= 80) return { kind: 'collapsed', node: n, title: ts.find(t => !COLLAPSE_RE.test(t.characters.trim())) };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 2 && kids.length <= 4 && b.h >= 32 && b.h <= 60 && typeof n.cornerRadius === 'number' && n.cornerRadius >= 16 && ts.length === kids.length) return { kind: 'tabs', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 3 && kids.every(isPill)) return { kind: 'chips', node: n };
  if (isAL(n) && n.layoutMode === 'HORIZONTAL' && kids.length >= 2 && overflows(n)) {
    const composite = kids.every(k => isAL(k) && k.layoutMode === 'VERTICAL' && k.children.filter(c => c.visible)[0]?.type === 'TEXT' && k.children.filter(c => c.visible).length === 2);
    return composite ? { kind: 'pair', node: n, items: kids } : { kind: 'scroller', node: n, items: kids };
  }
  if (isAL(n) && n.layoutMode === 'VERTICAL' && kids.length >= 2) {
    const head = kids[0];
    const headIsTitle = head.type === 'TEXT' || (isAL(head) && head.layoutMode === 'HORIZONTAL' && head.children.find(c => c.visible)?.type === 'TEXT' && R(head).h <= 40);
    const row = kids.find(k => k !== head && isAL(k) && k.layoutMode === 'HORIZONTAL' && k.children.filter(c => c.visible).length >= 2);
    if (headIsTitle && row && kids.length === 2) {
      const rowKids = row.children.filter(c => c.visible);
      if (rowKids.length >= 3 && rowKids.every(isPill)) return { kind: 'chips-section', node: n, head, row };
      return { kind: 'section', node: n, head, row, items: rowKids, overflowing: overflows(row) };
    }
    if (kids.every(k => isAL(k) && k.layoutMode === 'HORIZONTAL')) return { kind: 'grid', node: n };
    const sameH = kids.length >= 3 && kids.every(k => Math.abs(k.height - kids[0].height) < 6 && texts(k).length >= 1);
    if (sameH) return { kind: 'list', node: n, items: kids };
  }
  if (hasVisibleFill(n) && typeof n.cornerRadius === 'number' && n.cornerRadius >= 8 && b.w >= cw * 0.75 && ts.length) {
    const btn = n.findOne && n.findOne(c => c.type === 'FRAME' && c !== n && texts(c).length === 1 && typeof c.cornerRadius === 'number' && c.cornerRadius >= 12 && hasVisibleFill(c) && c.height <= 48);
    return { kind: 'card', node: n, button: btn || null };
  }
  if (n.type === 'TEXT') return { kind: 'text', node: n };
  return { kind: 'other', node: n };
}

function classifyScreen(m) {
  const sections = m.blocks.filter(b => ['section', 'scroller', 'pair', 'chips', 'chips-section'].includes(b.kind)).length;
  if (m.hero && (m.back || m.blocks.some(b => b.kind === 'topbar')) && m.cta) return 'detail';
  if (m.close && !m.tabBar && m.cta) return 'popup';
  // welcome / onboarding: a picture, a headline and one main button, nothing list-like
  const listy = m.blocks.some(b => ['section', 'scroller', 'pair', 'chips', 'chips-section', 'list', 'grid', 'tabs'].includes(b.kind));
  const headline = m.blocks.some(b => texts(b.node).some(t => fontSizeOf(t) >= 20));
  if (!m.tabBar && m.cta && !listy && headline && m.blocks.length <= 7 && (m.illustration || m.hero)) return 'welcome';
  if (m.tabBar || sections >= 2) return 'home';
  return 'stack';
}
