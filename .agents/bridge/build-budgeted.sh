#!/usr/bin/env bash
# Runtime wrapper for the existing builder.
# Keeps the proven builder logic intact while enforcing a complete request budget
# so large issues do not hit provider TPM limits before they can build a PR.
set -euo pipefail

SOURCE=".agents/bridge/build.sh"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

python3 - "$SOURCE" "$TMP" <<'PY'
import sys

source, target = sys.argv[1:3]
text = open(source, encoding="utf-8").read()

comment_marker = '# 1. Контекст задачи.\n{'
if text.count(comment_marker) != 1:
    raise SystemExit("builder wrapper could not locate issue-context marker")
text = text.replace(
    comment_marker,
    '# 1. Контекст задачи.\n'
    'gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null > "$WORK/comments.full" || true\n'
    '{',
    1,
)

old_comments = 'gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null | tail -n 180 || true'
new_comments = 'tail -n 60 "$WORK/comments.full" 2>/dev/null || true'
if text.count(old_comments) != 1:
    raise SystemExit("builder wrapper could not locate comments command")
text = text.replace(old_comments, new_comments, 1)

old_branch = r'''REQUESTED_BRANCH=$(grep -oE 'WORK_BRANCH:[[:space:]]*[A-Za-z0-9._/-]+' "$WORK/issue.md" \
  | tail -1 | sed -E 's/^WORK_BRANCH:[[:space:]]*//' || true)'''
new_branch = r'''REQUESTED_BRANCH=$(cat "$WORK/issue.md" "$WORK/comments.full" 2>/dev/null \
  | grep -oE 'WORK_BRANCH:[[:space:]]*[A-Za-z0-9._/-]+' \
  | tail -1 | sed -E 's/^WORK_BRANCH:[[:space:]]*//' || true)'''
if text.count(old_branch) != 1:
    raise SystemExit("builder wrapper could not locate WORK_BRANCH extraction")
text = text.replace(old_branch, new_branch, 1)

old_limit = '''if len(raw) > 420000:
    raw = raw[:420000]'''
new_limit = '''if len(raw) > 70000:
    raw = raw[:70000]'''
if text.count(old_limit) != 1:
    raise SystemExit("builder wrapper could not locate code byte cap")
text = text.replace(old_limit, new_limit, 1)

budget_anchor = 'mv "$WORK/code.trim" "$WORK/code.md"\n\n# 3. Запрос архитектору.'
budget_block = '''mv "$WORK/code.trim" "$WORK/code.md"

# Budget the complete model-facing input conservatively. The previous failures
# were 38k-42k TPM against a 30k limit. We estimate UTF-8 bytes at 2 bytes/token
# (intentionally conservative for mixed Russian/English), reserve system-prompt
# headroom, and separately cap completion tokens below.
python3 - "$WORK/issue.md" "$WORK/code.md" <<'PY_BUDGET'
import sys

issue_path, code_path = sys.argv[1:3]
MAX_INPUT_TOKENS = 18000
SYSTEM_RESERVE_TOKENS = 2500
BYTES_PER_TOKEN = 2
BODY_MAX_BYTES = 9000
COMMENTS_MAX_BYTES = 6000
MARKER = "\n--- переписка ---\n"

def trim_head_utf8(raw: bytes, limit: int) -> str:
    return raw[:max(0, limit)].decode("utf-8", errors="ignore")

def trim_tail_utf8(raw: bytes, limit: int) -> str:
    return raw[-max(0, limit):].decode("utf-8", errors="ignore")

issue_text_full = open(issue_path, encoding="utf-8", errors="ignore").read()
if MARKER in issue_text_full:
    body_text, comments_text = issue_text_full.split(MARKER, 1)
    body_text = trim_head_utf8(body_text.encode("utf-8"), BODY_MAX_BYTES)
    # Preserve the newest constraints/corrections even when the original issue body is large.
    comments_text = trim_tail_utf8(comments_text.encode("utf-8"), COMMENTS_MAX_BYTES)
    issue_text = body_text + MARKER + comments_text
else:
    issue_text = trim_head_utf8(issue_text_full.encode("utf-8"), BODY_MAX_BYTES + COMMENTS_MAX_BYTES)
open(issue_path, "w", encoding="utf-8").write(issue_text)

input_budget_bytes = max(
    12000,
    (MAX_INPUT_TOKENS - SYSTEM_RESERVE_TOKENS) * BYTES_PER_TOKEN,
)
remaining = max(8000, input_budget_bytes - len(issue_text.encode("utf-8")))
code_raw = open(code_path, "rb").read()
open(code_path, "w", encoding="utf-8").write(trim_head_utf8(code_raw, remaining))
PY_BUDGET

# 3. Запрос архитектору.'''
if text.count(budget_anchor) != 1:
    raise SystemExit("builder wrapper could not locate request-budget anchor")
text = text.replace(budget_anchor, budget_block, 1)

request_anchor = '{\n  model: "gpt-4o",\n  response_format: {type: "json_object"},'
request_new = '{\n  model: "gpt-4o",\n  max_tokens: 6000,\n  response_format: {type: "json_object"},'
if text.count(request_anchor) != 1:
    raise SystemExit("builder wrapper could not locate request JSON")
text = text.replace(request_anchor, request_new, 1)

with open(target, "w", encoding="utf-8") as handle:
    handle.write(text)
PY

exec bash "$TMP"
