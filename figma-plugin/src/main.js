// ---------- main.js: plugin UI glue (one button: Create web version) ----------
figma.showUI(__html__, { width: 320, height: 200, themeColors: true });

const NS = 'webversion';
const CLAUDE_URLS = { connectors: 'https://claude.ai/settings/connectors', capabilities: 'https://claude.ai/settings/capabilities', new: 'https://claude.ai/new' };

// Node links for the Claude request. figma.fileKey works for private/development plugins; otherwise the file link the user pasted once.
function fileKey() {
  try { if (figma.fileKey) return figma.fileKey; } catch (e) {}
  const url = figma.root.getPluginData('fileUrl');
  const m = url && url.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}
function nodeLink(id) {
  const key = fileKey();
  return key ? `https://www.figma.com/design/${key}/?node-id=${id.replace(/:/g, '-')}` : null;
}

function selectionState() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return { ok: false, reason: sel.length ? 'Select just one screen.' : '' };
  const n = sel[0];
  if (n.type === 'FRAME' && n.getSharedPluginData(NS, 'source')) return { ok: false, reason: 'This is a web version already. Click its mobile screen instead.' };
  try { return inspectMobile(n); } catch (e) { return { ok: false, reason: 'Could not read this frame: ' + e.message }; }
}

let lastSource = null; // { id, name } of the mobile screen behind the last result

// Ready-made request for Claude, so the panel can copy it right on click.
function claudeRequest(sel) {
  const src = sel.ok ? { id: sel.id, name: sel.name } : lastSource;
  if (!src) return { error: 'Click a mobile screen first.' };
  const link = nodeLink(src.id);
  if (!link) return { needLink: true };
  return { text: `Make the desktop web version of this mobile screen: ${link}\nIf there is a frame named "${src.name} — Web" next to it, replace it.` };
}

async function postState() {
  const setupDone = !!(await figma.clientStorage.getAsync('claudeSetupDone'));
  const selection = selectionState();
  figma.ui.postMessage({ type: 'state', selection, setupDone, claude: claudeRequest(selection) });
}

async function applyTodo(t) {
  let c; try { c = JSON.parse(t.getSharedPluginData(NS, 'todo')); } catch (e) { return { ok: false, error: 'Unreadable fix' }; }
  try {
    const current = t.getStyledTextSegments(['fontName']).map(s => s.fontName);
    for (const f of current) await figma.loadFontAsync(f);
    const target = { family: c.fontFamily || current[0].family, style: c.fontStyle || current[0].style };
    if (c.fontFamily || c.fontStyle) { await figma.loadFontAsync(target); t.fontName = target; }
    if (c.characters !== undefined) t.characters = String(c.characters);
    if (c.textAutoResize) t.textAutoResize = c.textAutoResize;
    if (c.textAlignHorizontal) t.textAlignHorizontal = c.textAlignHorizontal;
    t.setSharedPluginData(NS, 'todo', '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).replace(/Please call.*$/, '').trim() };
  }
}

async function generate() {
  const sel = selectionState();
  if (!sel.ok) throw new Error(sel.reason || 'Click a mobile screen first.');
  const sourceId = sel.id;
  const mobile = await figma.getNodeByIdAsync(sourceId);
  if (!mobile) throw new Error('The mobile screen no longer exists.');
  const res = await generateWebVersion(sourceId, {}, text => figma.ui.postMessage({ type: 'progress', text }));
  const F = await figma.getNodeByIdAsync(res.frameId);
  lastSource = { id: sourceId, name: mobile.name };
  figma.currentPage.selection = [F];
  figma.viewport.scrollAndZoomIntoView([F]);
  figma.ui.postMessage({ type: 'result', result: { frameId: res.frameId, name: F.name, sourceId, lowConfidence: !!res.report.lowConfidence } });
}

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'refresh') return postState();
    if (msg.type === 'generate') { await generate(); return postState(); }
    if (msg.type === 'resize') { figma.ui.resize(320, Math.max(140, Math.min(720, Math.ceil(msg.height)))); return; }
    if (msg.type === 'open') { if (CLAUDE_URLS[msg.page]) figma.openExternal(CLAUDE_URLS[msg.page]); return; }
    if (msg.type === 'setup-done') { await figma.clientStorage.setAsync('claudeSetupDone', !!msg.done); return postState(); }
    if (msg.type === 'set-file-url') {
      const ok = /figma\.com\/(?:design|file)\/[A-Za-z0-9]+/.test(msg.url || '');
      if (ok) figma.root.setPluginData('fileUrl', msg.url.trim());
      figma.ui.postMessage({ type: 'file-url', ok });
      return postState();
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};

// Text fixes Claude couldn't apply (missing font in its environment): finish them quietly here, where the fonts exist.
async function applyPendingTodos() {
  const nodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'], sharedPluginData: { namespace: NS, keys: ['todo'] } })
    .filter(t => t.getSharedPluginData(NS, 'todo'));
  for (const t of nodes) await applyTodo(t);
}

figma.on('selectionchange', postState);
figma.on('currentpagechange', () => { postState(); applyPendingTodos(); });
postState();
applyPendingTodos();
