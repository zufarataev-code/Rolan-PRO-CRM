#!/usr/bin/env bash
# Архитектор не только решает, но и правит файлы.
#
# Прежний мост умел одно: прочитать задачу и написать решение текстом.
# Руки оставались у Claude. Здесь архитектор возвращает конкретные замены
# в файлах, скрипт их применяет, проверяет и открывает пулл-реквест.
#
# Запускается только по прямой команде в задаче — «/codex собери».
# Автоматически не срабатывает никогда: правка файлов без спроса опаснее,
# чем неотвеченная задача.
set -uo pipefail

fail() { echo "СБОРЩИК: $1"; exit 0; }

say() {  # пишем в задачу, чтобы владелец видел ход работы
  gh issue comment "$ISSUE_NUMBER" --body "<!-- codex-builder -->
$1" >/dev/null 2>&1 || true
}

[ -n "${OPENAI_API_KEY:-}" ] || fail "ключ OPENAI_API_KEY не задан"
[ -n "${ISSUE_NUMBER:-}" ]   || fail "событие без номера задачи"

WORK="$(mktemp -d)"

# ── 1. Контекст задачи ────────────────────────────────────────────────────
{
  gh issue view "$ISSUE_NUMBER" --json title,body \
     --template '{{.title}}{{"\n\n"}}{{.body}}' 2>/dev/null || echo "задача не прочиталась"
  echo
  echo "--- переписка ---"
  gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null | tail -n 120 || true
} > "$WORK/issue.md"

# ── 2. Файлы, названные в задаче ──────────────────────────────────────────
# Модель не может прочитать репозиторий сама, а целиком слать нечего:
# legacy-файл больше мегабайта. Поэтому берём только те пути, что упомянуты
# в задаче, и только окрестности упомянутых функций.
grep -oE '`?[a-zA-Z0-9_./-]+\.(ts|tsx|js|html|css|md|yml)`?' "$WORK/issue.md" \
  | tr -d '`' | sort -u > "$WORK/paths.txt"

FUNCS=$(grep -oE '\b(function )?[a-zA-Z_][a-zA-Z0-9_]{4,}\(' "$WORK/issue.md" \
        | sed 's/function //; s/($//; s/(//' | sort -u | head -25)

: > "$WORK/code.md"
while read -r p; do
  [ -f "$p" ] || continue
  SIZE=$(wc -c < "$p")
  if [ "$SIZE" -lt 60000 ]; then
    { echo "=== ФАЙЛ: $p (целиком) ==="; cat "$p"; echo; } >> "$WORK/code.md"
  else
    # Большой файл: только куски вокруг названных функций.
    { echo "=== ФАЙЛ: $p (фрагменты, файл $SIZE байт) ==="; } >> "$WORK/code.md"
    for fn in $FUNCS; do
      grep -n "function $fn\b\|$fn = function\|$fn(" "$p" 2>/dev/null \
        | head -3 | cut -d: -f1 | while read -r ln; do
          FROM=$(( ln > 12 ? ln - 12 : 1 ))
          TO=$(( ln + 90 ))
          { echo "--- $p строки $FROM-$TO ---"
            sed -n "${FROM},${TO}p" "$p"; echo; } >> "$WORK/code.md"
        done
    done
  fi
done < "$WORK/paths.txt"

[ -s "$WORK/code.md" ] || {
  say "Не нашёл в задаче ни одного пути к файлу. Укажи файлы явно — иначе править нечего."
  exit 0
}

# Обрезаем: контекст модели не резиновый.
head -c 260000 "$WORK/code.md" > "$WORK/code.trim" && mv "$WORK/code.trim" "$WORK/code.md"

# ── 3. Запрос архитектору ─────────────────────────────────────────────────
SYSTEM='Ты архитектор и разработчик проекта RolanPRO CRM — система для компании по установке оконных плёнок в Лос-Анджелесе.

Тебе дана задача и фрагменты кода. Верни ТОЛЬКО JSON, без пояснений и без markdown-ограждений:

{
  "summary": "что делаешь и почему, по-русски, 3-6 строк",
  "branch": "codex/<короткий-смысл-задачи>",
  "title": "fix(scope): краткий заголовок по-английски",
  "edits": [
    {"path": "путь/к/файлу", "old": "точный существующий фрагмент", "new": "замена"}
  ]
}

Требования к правкам:
- "old" должен встречаться в файле РОВНО ОДИН раз, посимвольно, с теми же пробелами и переносами. Если не уверен — возьми больше окружающего текста.
- Не переписывай файл целиком. Только точечные замены.
- Комментарии в коде — по-русски, объясняй ПРИЧИНУ, а не пересказывай код.
- Лечи причину, а не место: если та же ошибка в десяти местах, правь все.
- Ничего не выдумывай: если нужного кода нет во фрагментах, верни пустой edits и напиши это в summary.
- Следи за областью видимости: новая функция должна объявляться на верхнем уровне файла, а не внутри другой функции — иначе снаружи она не видна.
- Не ломай существующие проверки. Если в коде уже есть защита, оставь её и добавь свою рядом.'

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
  say "OpenAI ответил $HTTP — $ERR. Правок не делал."
  exit 0
fi

jq -r '.choices[0].message.content' "$WORK/response.json" > "$WORK/plan.json"
jq -e . "$WORK/plan.json" >/dev/null 2>&1 || {
  say "Архитектор вернул не JSON. Правок не делал."
  exit 0
}

COUNT=$(jq '.edits | length' "$WORK/plan.json")
SUMMARY=$(jq -r '.summary // "без описания"' "$WORK/plan.json")

if [ "$COUNT" -eq 0 ]; then
  say "Правок нет.

$SUMMARY"
  exit 0
fi

# ── 4. Применяем замены ───────────────────────────────────────────────────
# Имя ветки всегда уникальное. Архитектор копировал "fix/short-slug"
# прямо из образца в подсказке, и вторая попытка не отправлялась:
# такая ветка уже существовала с прошлого раза.
BRANCH=$(jq -r '.branch // empty' "$WORK/plan.json")
case "$BRANCH" in
  ""|"fix/short-slug"|"branch") BRANCH="codex/issue-$ISSUE_NUMBER" ;;
esac
BRANCH="${BRANCH}-$(date +%m%d%H%M)"
TITLE=$(jq -r '.title // empty' "$WORK/plan.json")
[ -n "$TITLE" ] || TITLE="codex: изменения по задаче #$ISSUE_NUMBER"

git config user.name  "codex-architect"
git config user.email "codex@rolanpro.local"
git checkout -b "$BRANCH" || fail "не удалось создать ветку $BRANCH"

APPLIED=0
FAILED=""
for i in $(seq 0 $((COUNT - 1))); do
  P=$(jq -r ".edits[$i].path" "$WORK/plan.json")
  jq -r ".edits[$i].old" "$WORK/plan.json" > "$WORK/old.txt"
  jq -r ".edits[$i].new" "$WORK/plan.json" > "$WORK/new.txt"

  if [ ! -f "$P" ]; then
    FAILED="$FAILED
- \`$P\` — файла нет"
    continue
  fi

  # Замена через python: sed ломается на многострочных фрагментах.
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
    FAILED="$FAILED
- \`$P\` — фрагмент не найден или встречается несколько раз"
  fi
done

if [ "$APPLIED" -eq 0 ]; then
  say "Ни одна правка не легла на код.$FAILED

Обычная причина — фрагмент \`old\` не совпадает с файлом посимвольно."
  exit 0
fi

# ── 5. Проверка перед отправкой ───────────────────────────────────────────
# Дешёвая, но ловит самое частое: разъехавшиеся скобки в большом файле.
CHECK=""
for p in $(git diff --name-only); do
  case "$p" in
    *.js|*.ts|*.tsx|*.html)
      B=$(python3 -c "
import sys
s=open('$p',encoding='utf-8',errors='replace').read()
print(s.count('{')-s.count('}'))")
      [ "$B" = "0" ] || CHECK="$CHECK
- \`$p\` — баланс фигурных скобок разъехался на $B"
      ;;
  esac
done

if [ -n "$CHECK" ]; then
  say "Правки применились, но проверка не прошла — ветку не отправляю.$CHECK"
  exit 0
fi

# ── 6. Пулл-реквест ───────────────────────────────────────────────────────
git add -A
git commit -m "$TITLE

$SUMMARY

Задача #$ISSUE_NUMBER. Правки сделаны архитектором через мост." >/dev/null

git push -u origin "$BRANCH" >/dev/null 2>&1 || {
  say "Не удалось отправить ветку \`$BRANCH\`. Проверь: есть ли такая ветка уже, и хватает ли токену прав на запись."
  exit 0
}

PR=$(gh pr create --title "$TITLE" --base main --head "$BRANCH" --body "$SUMMARY

Правок применено: $APPLIED из $COUNT.$FAILED

Сделано архитектором через мост по задаче #$ISSUE_NUMBER. Проверен баланс скобок в изменённых файлах; остальное — за CI и проверяющим." 2>&1) || {
  say "Ветка \`$BRANCH\` отправлена, но пулл-реквест не создался: $PR"
  exit 0
}

say "Готово: $PR

Применено правок: $APPLIED из $COUNT.$FAILED

$SUMMARY"
