# Web Version for Figma

Turn a **mobile screen into a polished 1728×1117 desktop screen**, right next to it in your Figma file.
It works for any product. It copies your real layers (images, icons, text), so the result is editable and on-brand.
It's free and needs no account or API key.

> **Invited to this repo?** Accept the invite first: use the link in the GitHub email, or go to
> [github.com/xinran-dwi/figma-plugin-for-laila/invitations](https://github.com/xinran-dwi/figma-plugin-for-laila/invitations).

## Quick start (5 minutes)

1. **Download:** open [`dist/web-version-figma-plugin.zip`](dist/web-version-figma-plugin.zip), click the **↓ Download raw file** button
   (top right of the file view), and unzip it. You get a folder called `figma-plugin`.
2. **Install:** in the **Figma desktop app**, open a file you can edit, then **Plugins → Development → Import plugin from manifest…** →
   pick `figma-plugin/manifest.json`.
3. **Use:** **Plugins → Development → Web Version** → click a mobile screen → **Create web version**.

The sections below explain each step in more detail.

## 1. Install (once, about 1 minute)

1. Download **[`dist/web-version-figma-plugin.zip`](dist/web-version-figma-plugin.zip)** (↓ **Download raw file**) and unzip it.
2. Open the **Figma desktop app** (importing doesn't work in the browser), then open any file **you can edit**.
3. Main menu → **Plugins → Development → Import plugin from manifest…** → choose `figma-plugin/manifest.json`.

> If Figma asks to upgrade you to a **Full seat**, click Cancel. You're in a file you can only view.
> Use a file in your Drafts instead (**File → Duplicate to your drafts**).

## 2. Use

1. **Plugins → Development → Web Version**.
2. Click a **mobile screen** on the canvas.
3. Click **Create web version**. The desktop screen appears **to the right** of your mobile screen.

The plugin works out the screen type and style on its own:
- It matches desktop screens already in your file, if there are any.
- Otherwise it builds the layout from the mobile screen.

When rows need more items than your mobile screen has, it **copies items** to fill them. In the layers panel, those copies end in
"(duplicate)", so you can find them and swap in real content.

Your mobile screen is never changed. To undo, delete the new frame.

## Screen types

| Type | What the desktop looks like |
|---|---|
| **Home / feed** | Side navigation, header row (title + search), full-width rows of cards, wide banners |
| **Detail** | Big image in the middle, actions in a right-side panel, thumbnails for carousels |
| **Popup / sheet / paywall** | Centered dialog over a dimmed desktop screen, two columns |
| **List / form / settings** | Centered column, card lists as grids, short fields side by side |
| **Welcome / onboarding** | Split screen: picture on the left, headline, text and button on the right |
| **Hard to read** | One clean centered column, and the panel suggests trying Claude |

Loosely built screens (lots of loose layers, no groups or auto-layout) are tidied first on a hidden copy. A shape plus its label
becomes one button, stacked texts become one block, and scattered picture pieces become one illustration.

## Known limits

- **Built-in rules, not AI.** The plugin follows tested layout rules. For unusual screens, use **Try with Claude** (below).
- **Placeholders are copies** of your real items. Swap them for real content.
- **Arabic/RTL screens** are not mirrored yet. The plugin tells you when it detects one.

## When the result isn't good: try with Claude (AI)

The plugin follows fixed rules. For unusual screens, Claude usually does better. After each result, the panel shows
**✨ Not quite right? Try with Claude (AI) →**, which walks you through the same steps as below.

**What you need**
- A Claude subscription (Pro, Max, Team or Enterprise).
- Edit access to the Figma file: a Full seat in that team, or the file in your Drafts.
- Note: Figma limits how often Claude can work in your files. Free and View seats only get a few runs a month.

**One-time setup (about 5 min)**
1. In Claude: **Settings → Connectors → Figma → Connect**.
2. **Settings → Capabilities**: turn on **Code execution and file creation**.
3. **Customize → Skills → + → Upload a skill**: choose `figma-plugin/claude-skill/web-version.zip` (inside the plugin download).

**Each time**
1. In the plugin, click **Copy message for Claude**. Claude can't see what you clicked in Figma, so this message includes a link to your screen.
2. Open Claude, paste the message into a new chat and send. Claude builds the web version in your file and replaces the plugin's attempt.

Claude Code users can install the skill as a plugin instead: `/plugin marketplace add xinran-dwi/figma-plugin-for-laila`, then
`/plugin install figma-responsive@figma-responsive-tools`.

## For maintainers

```
figma-plugin/                     the Figma plugin (manifest.json, ui.html, code.js)
  src/                            engine source: analyze, style, shell, patterns-*, audit, engine, main
scripts/build-figma-plugin.sh     src/ → code.js + dist/web-version-figma-plugin.zip
plugins/figma-responsive/         the Claude skill (Claude Code plugin)
  skills/web-version/             SKILL.md + references (generic rules, patterns, snippets, Dagiga preset)
scripts/package-skill.sh          skill → dist/web-version.zip (for the Claude app)
.claude-plugin/marketplace.json   makes this repo installable in Claude Code
```

Edit `figma-plugin/src/*.js`, then run `scripts/build-figma-plugin.sh`. Never edit `code.js` directly.
To test engine changes without the UI, `scripts/build-figma-plugin.sh test <footer.js>` builds a bundle you can run
through Claude's Figma connection.
