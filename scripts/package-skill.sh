#!/usr/bin/env bash
# Builds dist/web-version.zip for uploading to the Claude app (Settings → Capabilities → Skills).
# Run after editing anything in plugins/figma-responsive/skills/web-version/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
skills="$root/plugins/figma-responsive/skills"
mkdir -p "$root/dist"
rm -f "$root/dist/web-version.zip"
(cd "$skills" && zip -qr "$root/dist/web-version.zip" web-version -x '*.DS_Store')
echo "Built $root/dist/web-version.zip"
unzip -l "$root/dist/web-version.zip"
