#!/usr/bin/env bash
# Builds figma-plugin/code.js from figma-plugin/src/*.js (plain concatenation, no npm needed).
#   scripts/build-figma-plugin.sh                      → figma-plugin/code.js + dist/web-version-figma-plugin.zip
#   scripts/build-figma-plugin.sh test <footer.js>     → dist/test-bundle.js (engine only + footer, comments stripped)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/figma-plugin/src"
ENGINE=(common.js normalize.js analyze.js style.js shell.js patterns-home.js patterns-detail.js patterns-popup.js patterns-stack.js patterns-welcome.js audit.js engine.js)
mkdir -p "$root/dist"

if [[ "${1:-}" == "test" ]]; then
  footer="$2"
  out="$root/dist/test-bundle.js"
  files=()
  # EXCLUDE="patterns-popup.js patterns-stack.js" keeps a test bundle under use_figma's 50k-char limit
  for f in "${ENGINE[@]}"; do [[ -f "$src/$f" && " ${EXCLUDE:-} " != *" $f "* ]] && files+=("$src/$f"); done
  cat "${files[@]}" "$footer" | python3 -c '
import sys, re
out = []
for line in sys.stdin.read().split("\n"):
    s = line.strip()
    if not s or s.startswith("//"):
        continue
    out.append(s)
sys.stdout.write("\n".join(out))
' > "$out"
  echo "Built $out ($(wc -c < "$out" | tr -d " ") chars)"
  exit 0
fi

{
  echo "// Web Version, Figma plugin. Built from figma-plugin/src by scripts/build-figma-plugin.sh. Edit src/, not this file."
  for f in "${ENGINE[@]}" main.js; do echo; cat "$src/$f"; done
} > "$root/figma-plugin/code.js"
node --check "$root/figma-plugin/code.js"
echo "Built figma-plugin/code.js ($(wc -c < "$root/figma-plugin/code.js" | tr -d " ") chars)"
# the Claude skill ships in the same download (Claude app → Customize → Skills → Upload)
"$root/scripts/package-skill.sh" >/dev/null
mkdir -p "$root/figma-plugin/claude-skill" && cp "$root/dist/web-version.zip" "$root/figma-plugin/claude-skill/web-version.zip"
rm -f "$root/dist/web-version-figma-plugin.zip"
(cd "$root" && zip -qr dist/web-version-figma-plugin.zip figma-plugin -x 'figma-plugin/src/*' '*.DS_Store')
echo "Built dist/web-version-figma-plugin.zip"
