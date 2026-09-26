#!/usr/bin/env bash
# Runtime wrapper for the existing builder.
# Keeps the proven builder logic intact while enforcing a request-size budget
# so large issues do not hit provider TPM limits before they can build a PR.
set -euo pipefail

SOURCE=".agents/bridge/build.sh"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

python3 - "$SOURCE" "$TMP" <<'PY'
import sys

source, target = sys.argv[1:3]
text = open(source, encoding="utf-8").read()

replacements = {
    "gh issue view \"$ISSUE_NUMBER\" --comments 2>/dev/null | tail -n 180 || true":
        "gh issue view \"$ISSUE_NUMBER\" --comments 2>/dev/null | tail -n 60 || true",
    "if len(raw) > 420000:\n    raw = raw[:420000]":
        "if len(raw) > 120000:\n    raw = raw[:120000]",
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"builder wrapper expected exactly one match, got {count}: {old[:80]}")
    text = text.replace(old, new, 1)

with open(target, "w", encoding="utf-8") as handle:
    handle.write(text)
PY

exec bash "$TMP"
