---
name: desktop-version
description: Generate a polished, editable 1728×1117 desktop version of a mobile screen in Figma, for any product. Learns the style from the file's own desktop screens, a preset (e.g. Dagiga), or the mobile screen itself. Use whenever the user shares a Figma link to a mobile frame (or has one selected) and asks for a web, desktop, responsive or large-screen version, e.g. "make the desktop version of this screen", "make the web version", "generate desktop for this mobile design", "do the responsive version", or runs /figma-responsive:desktop-version with a frame link.
---

# Desktop version: mobile screen → desktop screen in Figma

Builds the desktop version **inside the same Figma file**, next to the mobile frame. It clones the real layers
(never redrawn) and re-lays them out. The result should be close to final, not a wireframe.

Works in **Claude Code** (plugin) and the **Claude app** (uploaded skill). Both need the Figma connector/MCP.

Read before building:
- `references/generic.md`: where the desktop style comes from, shell and content rules for any product, font handling
- `references/patterns.md`: which layout to use for which kind of screen
- `references/snippets.md`: tested `use_figma` code and hard limits (read the limits table first)
- `references/presets/dagiga.md`: only when the screen is Dagiga AI (dark navy, lime, Gotham, Dagiga logo)

**Figma tooling:** before the first `use_figma` call, load the `figma-use` guidance. In Claude Code, use the
`figma:figma-use` skill (from `figma@claude-plugins-official`). Elsewhere, read the MCP resource
`skill://figma/figma-use/SKILL.md`. Pass `skillNames: "figma-use"` (or `"resource:figma-use"`) on every call.

## Workflow

### 1. Resolve the target
- Find the Figma link in the request or arguments (`$ARGUMENTS` in Claude Code). Parse `fileKey` from `/design/<fileKey>/`,
  and `node-id=12-34` → `12:34`. The user gets this link with right-click on the frame → **Copy link to selection**.
- No link: if a fileKey is known, call `get_metadata` with it; its "Currently selected nodes" block shows the selection
  (`use_figma` can't see the selection). Otherwise ask for the link and stop.
- Verify the target is a FRAME 320–480 wide. If it's a component or a group, say so and stop.
- **Replace request** (sent from the Desktop Version plugin's "Try with Claude" panel): "Make the desktop version of this mobile
  screen: <link>. If there is a frame named "<name> — Desktop" (or "<name> — Web") next to it, replace it." Build the new frame as usual. After it passes
  the polish loop, put it at the old frame's x/y and delete the old frame. Only delete that exact `— Desktop` / `— Web` frame.
- **Refine mode:** if the target is a desktop frame whose name ends in `— Desktop` or `— Web` (made by this skill or the Desktop Version
  Figma plugin), don't build a new one. Find its mobile source: the frame
  with the same name minus that ending, usually just left of it. Then improve the existing frame in place:
  1. Apply the user's requested changes, if any.
  2. Re-check the layout map against `patterns.md` and fix anything the rules got wrong (wrong pattern, awkward sizing, missing content).
  3. Run the polish loop (step 5).
  4. Report as in step 6.

  Never delete it and start over unless the user asks.
- Any other desktop-sized frame: say it's already a desktop screen and stop.

### 2. Understand the screen and pick the style source
- `get_screenshot` of the mobile frame, plus the **Inspect** snippet (read-only) to dump its structure.
- **Loosely built screens** (many loose layers, no groups or auto-layout): group them in your head first. A filled shape with a
  text on it is one button. Stacked texts are one text block. Overlapping pictures, glows and floating icons above the first text
  are one illustration. Build from those groups: clone the pieces into new auto-layout frames, never edit the original.
- Note these signals:
  - the tab bar and its active item
  - horizontal scrollers (rows wider than the frame)
  - collapsed rows ("Show", "See more")
  - carousel dots
  - ✕ vs. back
  - Arabic or Hebrew-dominant text (→ mirror the shell, nav on the right)
  - rotated nodes
- **Style source**, in priority order (`generic.md`):
  1. **A preset** matches → load it (e.g. `presets/dagiga.md`).
  2. **Desktop frames exist in the file** → run the **Discover the desktop shell** snippet and clone their nav, panels,
     modal style and dim layer. Screenshot the closest one for grounding.
  3. **Neither** → build the shell from the mobile screen (tab bar → sidebar, and so on).
- Classify the screen with `patterns.md`.

### 3. Write the layout map (in your reply, before building)
A short table: each mobile block → desktop region, size, and treatment (keep / scale / duplicate-fill / expand / drop / move).
State the style source and pattern. This is the plan the build follows.

### 4. Build
- Use 1–3 `use_figma` write calls. Each starts with the **prelude**, returns every created ID, and fills `report`.
  Order: place the frame → shell (or backdrop + dim for overlays) → content.
- Name the new frame `<mobile name> — Desktop`. Place it **to the right of** the mobile frame (80px gap), or below the content if that spot is taken.
- Only clone. **Never modify, move or delete** the original mobile frame or any existing desktop frame.
- Change text sizes with `scaleTextNode` (rescale; works for every font). Change weight, wording or wrap only with `editText()`.
  It applies the change when the font loads, otherwise it leaves a to-do for the helper plugin.
- A failed script is rolled back automatically. Fix the cause and re-run the whole call.

### 5. Polish loop (at most 3 passes)
1. Run the **Audit** snippet. Fix every issue it lists with a targeted script; never rebuild from scratch.
2. Take one `get_screenshot` of the new frame (maxDimension 1400) and check:
   - left edges on the content column, equal gaps
   - nothing tiny, clipped or overlapping
   - rotated icons where they look right (use `placeVisual`)
   - no mobile chrome left behind
   - with a style reference: it looks like it belongs next to the reference
3. Fix and re-check. Stop when the audit is clean and the screenshot passes, or after 3 passes. Then report what is still off.

Measure; don't eyeball. A layout can look right in a downscaled screenshot while being wrong. Trust the audit numbers, and zoom
(screenshot a sub-node) when unsure.

### 6. Report
Reply with:
- **Link**: `https://www.figma.com/design/<fileKey>/?node-id=<id with : → ->`
- **Style source and pattern**, one line each
- **Duplicated items** (placeholders to replace with real content; layer names end in "(duplicate)")
- **Expanded sections** and where their content came from
- **Dropped or moved mobile elements**
- **Text to-dos**, if any. These are changes that need fonts this environment couldn't load. Tell the user to run the
  **Desktop Version** Figma plugin once in that file (it applies them automatically), or to apply them by hand (list layer + change).
- Anything guessed or still imperfect.
