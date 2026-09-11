#!/usr/bin/env bash
# Архитектор не только решает, но и правит файлы.
#
# Прежний мост умел одно: прочитать задачу и написать решение текстом.
# Этот сборщик получает явно названные файлы, может продолжить существующую
# рабочую ветку и умеет как точечно менять файлы, так и создавать новые.
#
# Запускается только по прямой команде в задаче - "/codex собери".
set -uo pipefail

fail() { echo "СБОРЩИК: $1"; exit 0; }

say() {
  gh issue comment "$ISSUE_NUMBER" --body "<!-- codex-builder -->
$1" >/dev/null 2>&1 || true
}

[ -n "${OPENAI_API_KEY:-}" ] || fail "ключ OPENAI_API_KEY не задан"
[ -n "${ISSUE_NUMBER:-}" ]   || fail "событие без номера задачи"

WORK="$(mktemp -d)"

# 1. Контекст задачи.
{
  gh issue view "$ISSUE_NUMBER" --json title,body \
     --template '{{.title}}{{"\n\n"}}{{.body}}' 2>/dev/null || echo "задача не прочиталась"
  echo
  echo "--- переписка ---"
  gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null | tail -n 180 || true
} > "$WORK/issue.md"

# Если в задаче явно указан WORK_BRANCH, продолжаем именно эту ветку.
# Это нужно для больших задач, которые строятся несколькими безопасными фазами.
REQUESTED_BRANCH=$(grep -oE 'WORK_BRANCH:[[:space:]]*[A-Za-z0-9._/-]+' "$WORK/issue.md" \
  | tail -1 | sed -E 's/^WORK_BRANCH:[[:space:]]*//' || true)

if [ -n "$REQUESTED_BRANCH" ]; then
  case "$REQUESTED_BRANCH" in
    -*|*..*|*~*|*^*|*:*|*\?*|*\**|*\[*|*\\*)
      say "Некорректный WORK_BRANCH: \`$REQUESTED_BRANCH\`. Правок не делал."
      exit 0
      ;;
  esac
  git fetch origin "$REQUESTED_BRANCH" >/dev/null 2>&1 || {
    say "Ветка WORK_BRANCH \`$REQUESTED_BRANCH\` не найдена в origin. Правок не делал."
    exit 0
  }
  git checkout -B "$REQUESTED_BRANCH" "origin/$REQUESTED_BRANCH" >/dev/null 2>&1 || {
    say "Не удалось открыть WORK_BRANCH \`$REQUESTED_BRANCH\`. Правок не делал."
    exit 0
  }
fi

# 2. Файлы, явно названные в задаче.
# Берём backtick-пути любых нужных типов, включая Prisma, SQL и .env.example.
# Если назван каталог, раскрываем ограниченный набор исходников внутри него.
python3 - "$WORK/issue.md" <<'PY' > "$WORK/candidates.txt"
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
items = set(re.findall(r"`([^`\n]+)`", text))
for m in re.finditer(r"(?<![A-Za-z0-9_.-])(?:[A-Za-z0-9_.\[\]-]+/)+[A-Za-z0-9_.\[\]-]+", text):
    items.add(m.group(0))
for item in sorted(items):
    item = item.strip().strip('.,;:()')
    if item and len(item) < 240:
        print(item)
PY

: > "$WORK/paths.txt"
while read -r p; do
  if [ -f "$p" ]; then
    echo "$p" >> "$WORK/paths.txt"
  elif [ -d "$p" ]; then
    find "$p" -maxdepth 4 -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.prisma' -o -name '*.sql' -o -name '*.json' -o -name '*.md' -o -name '*.yml' -o -name '*.yaml' \) \
      | head -80 >> "$WORK/paths.txt"
  fi
done < "$WORK/candidates.txt"
sort -u "$WORK/paths.txt" -o "$WORK/paths.txt"

FUNCS=$(grep -oE '\b(function )?[a-zA-Z_][a-zA-Z0-9_]{4,}\(' "$WORK/issue.md" \
        | sed 's/function //; s/($//; s/(//' | sort -u | head -25)

: > "$WORK/code.md"
while read -r p; do
  [ -f "$p" ] || continue
  SIZE=$(wc -c < "$p")
  case "$p" in
    *.prisma|*.sql|.env.example)
      LIMIT=140000
      ;;
    *)
      LIMIT=70000
      ;;
  esac

  if [ "$SIZE" -lt "$LIMIT" ]; then
    { echo "=== ФАЙЛ: $p (целиком) ==="; cat "$p"; echo; } >> "$WORK/code.md"
  else
    { echo "=== ФАЙЛ: $p (фрагменты, файл $SIZE байт) ==="; } >> "$WORK/code.md"
    for fn in $FUNCS; do
      grep -n "function $fn\b\|$fn = function\|$fn(" "$p" 2>/dev/null \
        | head -3 | cut -d: -f1 | while read -r ln; do
          FROM=$(( ln > 12 ? ln - 12 : 1 ))
          TO=$(( ln + 90 ))
          { echo "--- $p строки $FROM-$TO ---"; sed -n "${FROM},${TO}p" "$p"; echo; } >> "$WORK/code.md"
        done
    done
  fi
done < "$WORK/paths.txt"

[ -s "$WORK/code.md" ] || {
  say "Не нашёл ни одного существующего файла по путям из задачи. Назови точные файлы или каталоги в backticks."
  exit 0
}

# Не даём одному огромному legacy-файлу вытеснить весь полезный контекст.
head -c 420000 "$WORK/code.md" > "$WORK/code.trim" && mv "$WORK/code.trim" "$WORK/code.md"

# 3. Запрос архитектору.
SYSTEM='Ты архитектор и разработчик проекта RolanPRO CRM - системы для компании по установке оконных плёнок в Лос-Анджелесе.

Тебе дана задача и реальные файлы из репозитория. Верни ТОЛЬКО JSON, без пояснений и markdown-ограждений:

{
  "summary": "что делаешь и почему, по-русски, 3-8 строк",
  "branch": "codex/<короткий-смысл-задачи>",
  "title": "fix(scope): краткий заголовок по-английски",
  "edits": [
    {"path": "существующий/файл", "old": "точный существующий фрагмент", "new": "замена"}
  ],
  "creates": [
    {"path": "новый/файл", "content": "полное содержимое нового файла"}
  ]
}

Требования:
- Для существующего файла используй edits. old должен встречаться РОВНО ОДИН раз, посимвольно. Если не уверен - возьми больше окружающего текста.
- Для реально нового файла используй creates. Не создавай дубль существующего файла или второго workflow.
- Разрешены новые .ts/.tsx/.js/.mjs/.prisma/.sql/.json/.md/.yml/.yaml файлы. Никогда не создавай .env с секретами; .env.example меняй только через edits.
- Не переписывай большие существующие файлы целиком, делай точечные замены.
- Комментарии в коде объясняют причину, а не пересказывают код.
- Лечи причину, не ломай существующие проверки и права доступа.
- Если задача требует атомарности, идемпотентности или сохранения истории, реализуй это на уровне БД/сервиса, а не только UI.
- Ничего не выдумывай: опирайся на предоставленные файлы и правила задачи.
- Если для части работы действительно не хватает конкретного кода, сделай всё безопасно возможное из имеющегося контекста и укажи блокер в summary вместо пустого ответа на всю задачу.'

jq -n --arg s "$SYSTEM" \
      --arg task "$(cat "$WORK/issue.md")" \
      --arg code "$(cat "$WORK/code.md")" '{
  model: "gpt-4o",
  response_format: {type: "json_object"},
  messages: [
    {role: "system", content: $s},
    {role: "user", content: ("ЗАДАЧА:\n" + $task + "\n\nКОД:\n" + $code)}
  ]
}' > "$WORK/request.json"

HTTP=$(curl -sS -o "$WORK/response.json" -w '%{http_code}' \
  https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$WORK/request.json")

if [ "$HTTP" != "200" ]; then
  ERR=$(jq -r '.error.message // "неизвестная ошибка"' "$WORK/response.json" 2>/dev/null)
  say "OpenAI ответил $HTTP - $ERR. Правок не делал."
  exit 0
fi

jq -r '.choices[0].message.content' "$WORK/response.json" > "$WORK/plan.json"
jq -e . "$WORK/plan.json" >/dev/null 2>&1 || {
  say "Архитектор вернул не JSON. Правок не делал."
  exit 0
}

EDIT_COUNT=$(jq '.edits // [] | length' "$WORK/plan.json")
CREATE_COUNT=$(jq '.creates // [] | length' "$WORK/plan.json")
COUNT=$((EDIT_COUNT + CREATE_COUNT))
SUMMARY=$(jq -r '.summary // "без описания"' "$WORK/plan.json")

if [ "$COUNT" -eq 0 ]; then
  say "Правок нет.\n\n$SUMMARY"
  exit 0
fi

# 4. Выбираем ветку.
git config user.name  "codex-architect"
git config user.email "codex@rolanpro.local"

if [ -n "$REQUESTED_BRANCH" ]; then
  BRANCH="$REQUESTED_BRANCH"
else
  BRANCH=$(jq -r '.branch // empty' "$WORK/plan.json")
  case "$BRANCH" in
    ""|"fix/short-slug"|"branch") BRANCH="codex/issue-$ISSUE_NUMBER" ;;
  esac
  BRANCH="${BRANCH}-$(date +%m%d%H%M)"
  git checkout -b "$BRANCH" >/dev/null 2>&1 || fail "не удалось создать ветку $BRANCH"
fi

TITLE=$(jq -r '.title // empty' "$WORK/plan.json")
[ -n "$TITLE" ] || TITLE="codex: изменения по задаче #$ISSUE_NUMBER"

# 5. Применяем точечные замены существующих файлов.
APPLIED=0
FAILED=""
for i in $(seq 0 $((EDIT_COUNT - 1))); do
  [ "$EDIT_COUNT" -gt 0 ] || break
  P=$(jq -r ".edits[$i].path" "$WORK/plan.json")
  jq -r ".edits[$i].old" "$WORK/plan.json" > "$WORK/old.txt"
  jq -r ".edits[$i].new" "$WORK/plan.json" > "$WORK/new.txt"

  if [ ! -f "$P" ]; then
    FAILED="$FAILED\n- \`$P\` - существующего файла нет"
    continue
  fi

  python3 - "$P" "$WORK/old.txt" "$WORK/new.txt" <<'PY'
import sys
path, old_f, new_f = sys.argv[1:4]
src = open(path, encoding="utf-8").read()
old = open(old_f, encoding="utf-8").read().rstrip("\n")
new = open(new_f, encoding="utf-8").read().rstrip("\n")
n = src.count(old)
if n != 1:
    print(f"MATCH:{n}")
    sys.exit(1)
open(path, "w", encoding="utf-8").write(src.replace(old, new, 1))
print("OK")
PY
  if [ $? -eq 0 ]; then
    APPLIED=$((APPLIED + 1))
  else
    FAILED="$FAILED\n- \`$P\` - фрагмент не найден или встречается несколько раз"
  fi
done

# 6. Создаём только действительно новые файлы.
for i in $(seq 0 $((CREATE_COUNT - 1))); do
  [ "$CREATE_COUNT" -gt 0 ] || break
  P=$(jq -r ".creates[$i].path" "$WORK/plan.json")
  case "$P" in
    *.ts|*.tsx|*.js|*.mjs|*.prisma|*.sql|*.json|*.md|*.yml|*.yaml) ;;
    *)
      FAILED="$FAILED\n- \`$P\` - тип нового файла не разрешён"
      continue
      ;;
  esac
  if [ -e "$P" ]; then
    FAILED="$FAILED\n- \`$P\` - файл уже существует, нужен edits"
    continue
  fi
  mkdir -p "$(dirname "$P")"
  jq -r ".creates[$i].content" "$WORK/plan.json" > "$P"
  APPLIED=$((APPLIED + 1))
done

if [ "$APPLIED" -eq 0 ]; then
  say "Ни одна правка не легла на код.$FAILED"
  exit 0
fi

# 7. Быстрые проверки до CI.
CHECK=""
for p in $(git diff --name-only); do
  case "$p" in
    *.js|*.ts|*.tsx|*.mjs|*.html)
      B=$(python3 - "$p" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
print(s.count('{')-s.count('}'))
PY
)
      [ "$B" = "0" ] || CHECK="$CHECK\n- \`$p\` - баланс фигурных скобок разъехался на $B"
      ;;
  esac
done

if [ -n "$CHECK" ]; then
  say "Правки применились, но быстрая проверка не прошла - ветку не отправляю.$CHECK"
  exit 0
fi

# 8. Коммит, push, PR.
git add -A
git commit -m "$TITLE

$SUMMARY

Задача #$ISSUE_NUMBER. Правки сделаны архитектором через мост." >/dev/null || {
  say "После применения плана git не видит изменений. Правок не отправляю.$FAILED"
  exit 0
}

git push -u origin "$BRANCH" >/dev/null 2>&1 || {
  say "Не удалось отправить ветку \`$BRANCH\`."
  exit 0
}

EXISTING_PR=$(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // empty' 2>/dev/null || true)
if [ -n "$EXISTING_PR" ]; then
  say "Обновил существующий PR: $EXISTING_PR

Применено правок: $APPLIED из $COUNT.$FAILED

$SUMMARY"
  exit 0
fi

PR=$(gh pr create --title "$TITLE" --base main --head "$BRANCH" --body "$SUMMARY

Правок применено: $APPLIED из $COUNT.$FAILED

Сделано архитектором через мост по задаче #$ISSUE_NUMBER. Остальное проверяет CI и ревью." 2>&1) || {
  say "Ветка \`$BRANCH\` отправлена, но пулл-реквест не создался: $PR"
  exit 0
}

say "Готово: $PR

Применено правок: $APPLIED из $COUNT.$FAILED

$SUMMARY"
