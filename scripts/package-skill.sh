#!/usr/bin/env bash
# Builds dist/desktop-version.zip for uploading to the Claude app (Settings → Capabilities → Skills).
# Run after editing anything in plugins/figma-responsive/skills/desktop-version/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
skills="$root/plugins/figma-responsive/skills"
mkdir -p "$root/dist"
rm -f "$root/dist/desktop-version.zip"
(cd "$skills" && zip -qr "$root/dist/desktop-version.zip" desktop-version -x '*.DS_Store')
echo "Built $root/dist/desktop-version.zip"
unzip -l "$root/dist/desktop-version.zip"
