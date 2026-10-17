# Web Version for Figma

Turns a mobile screen into a 1728×1117 desktop screen, right next to it in your Figma file. 

## Install (once)

1. Open [`dist/web-version-figma-plugin.zip`](dist/web-version-figma-plugin.zip) → click **↓ Download raw file** → unzip it.
2. In the **Figma desktop app**: **Plugins → Development → Import plugin from manifest…** → pick `figma-plugin/manifest.json`.

## Use

**Plugins → Development → Web Version** → click a mobile screen → **Create web version**.

- Your mobile screen is never changed. To undo, delete the new frame.
- Layers ending in "(duplicate)" are copies added to fill rows. Swap in real content.
- If Figma offers to upgrade you to a **Full seat**, click Cancel and use a file in your Drafts.

<details>
<summary><b>Result not good? Try with Claude (AI)</b></summary>

<br>

Needs a Claude Pro, Max, Team or Enterprise plan.

**First time:**
1. In Claude: **Settings → Connectors → Figma → Connect**.
2. **Settings → Capabilities** → turn on **Code execution and file creation**.
3. **Customize → Skills → + → Upload a skill** → pick `figma-plugin/claude-skill/web-version.zip` from your download.

**Then:** in the plugin, click **Try with Claude → Copy message for Claude**, paste it into a new Claude chat and send.

</details>

