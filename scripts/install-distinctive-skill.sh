#!/usr/bin/env bash
# 安裝第三方 distinctive-ai-design skill 至本機（不提交進 git，原 repo 無 LICENSE）。
# 審閱紀錄：docs/REFERENCES.md
set -euo pipefail
REPO="https://github.com/houxin0010/distinctive-ai-design.git"
COMMIT="92c68366767b98924fe2719c16659e7f1e93c7af"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.claude/skills/distinctive-ai-design"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone --quiet "$REPO" "$TMP/src"
git -C "$TMP/src" checkout --quiet "$COMMIT"
rm -rf "$DEST"
mkdir -p "$DEST/references"
cp "$TMP/src/SKILL.md" "$DEST/SKILL.md"
cp "$TMP/src/references/"*.md "$DEST/references/"
echo "$COMMIT" > "$DEST/SOURCE_COMMIT"
echo "Installed distinctive-ai-design@$COMMIT -> $DEST"
