// ---------- engine.js: one call does the whole job ----------
// generateWebVersion(mobileId, { pattern: 'auto'|'home'|'detail'|'popup'|'stack', style: 'auto'|'file'|'generic'|'dagiga' }, onProgress)
// → { frameId, pattern, style, report, issues }
const PATTERN_LABELS = { home: 'Home / feed', detail: 'Detail', popup: 'Popup / sheet', stack: 'List / form', welcome: 'Welcome / onboarding', centered: 'Centered column (screen was hard to read)' };

function inspectMobile(node) {
  // quick read for the UI: is this a mobile screen, and what would we do with it?
  if (!node || node.type !== 'FRAME') return { ok: false, reason: 'Select a frame (a mobile screen).' };
  if (node.width < 320 || node.width > 480) {
    if (/— Web$/.test(node.name)) return { ok: false, web: true, reason: 'This is a generated web version.' };
    return { ok: false, reason: `This frame is ${Math.round(node.width)}px wide. Select a mobile screen (320–480 wide).` };
  }
  return { ok: true, id: node.id, name: node.name };
}

// Rescaled text can land on sizes like 15.99. Where the font is installed, set whole-number sizes.
async function snapFontSizes(F) {
  for (const t of F.findAllWithCriteria({ types: ['TEXT'] })) {
    const segs = t.getStyledTextSegments(['fontSize', 'fontName']);
    if (segs.every(s => Math.abs(s.fontSize - Math.round(s.fontSize)) < 0.01)) continue;
    let ok = true;
    for (const s of segs) if (!(await canLoad(s.fontName))) ok = false;
    if (!ok) continue;
    for (const s of segs) t.setRangeFontSize(s.start, s.end, Math.round(s.fontSize));
  }
}

async function generateWebVersion(mobileId, opts = {}, onProgress = () => {}) {
  const mobile = await figma.getNodeByIdAsync(mobileId);
  if (!mobile || mobile.type !== 'FRAME') throw new Error('The selected layer is not a frame.');
  onProgress('Analyzing the mobile screen…');
  const report = { pattern: '', style: '', duplicates: [], expanded: [], dropped: [], moved: [], reused: [], textTodos: [], notes: [], lowConfidence: false };
  // loosely built screens are grouped on a hidden copy first; the build reads from that copy
  const norm = normalizeMobile(mobile, report);
  const ctx = { m: null, style: null, report, F: null, col: null, colW: 0 };
  try {
    const m = analyze(norm.work);
    m.mobile = mobile; // same position as the copy; placement, name and background come from the original
    let pattern = opts.pattern && opts.pattern !== 'auto' ? opts.pattern : m.pattern;
    // not confident (mostly unrecognized pieces): a clean centered column beats a guessed layout
    const others = m.blocks.filter(b => b.kind === 'other').length;
    if ((!opts.pattern || opts.pattern === 'auto') && pattern === 'stack' && (others > m.blocks.length * 0.5 || m.blocks.length > 14)) {
      pattern = 'centered'; report.lowConfidence = true;
    }
    if (pattern === 'detail' && !m.hero) throw new Error('Detail layout needs a large image near the top.');
    const style = detectStyle(mobile, m, opts.style && opts.style !== 'auto' ? opts.style : null);
    Object.assign(ctx, { m, style });
    report.pattern = PATTERN_LABELS[pattern]; report.style = style.label; report.dropped.push(...m.drop);
    if (m.rtl) report.notes.push('Arabic/Hebrew screen: the layout was not mirrored yet. Check the navigation side.');

    onProgress('Building the desktop layout…');
    createDesktopFrame(ctx);
    try {
      if (pattern === 'home') await buildHome(ctx);
      else if (pattern === 'detail') await buildDetail(ctx);
      else if (pattern === 'popup') await buildPopup(ctx);
      else if (pattern === 'welcome') await buildWelcome(ctx);
      else if (pattern === 'centered') await buildCentered(ctx);
      else await buildStack(ctx);
    } catch (e) {
      ctx.F.remove();
      throw e;
    }
    onProgress('Checking and fixing the layout…');
    const fixed = await autofix(ctx);
    await snapFontSizes(ctx.F);
    fitHeight(ctx);
    const issues = audit(ctx.F);
    if (fixed) report.notes.push(`Auto-fixed ${fixed} layout issue${fixed === 1 ? '' : 's'}.`);
    ctx.F.setSharedPluginData('webversion', 'source', mobile.id);
    ctx.F.setSharedPluginData('webversion', 'report', JSON.stringify(report));
    return { frameId: ctx.F.id, pattern, report, issues: issues.map(i => i.msg) };
  } finally {
    norm.cleanup();
  }
}
