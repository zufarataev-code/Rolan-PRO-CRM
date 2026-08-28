#!/usr/bin/env bash
# Ответ архитектора на задачу или пулл-реквест.
#
# Запрос идёт прямо в OpenAI, без Codex CLI: у инструмента командной
# строки свои настройки и режимы одобрения, из-за которых он молча
# завершался успехом, ничего не опубликовав.
set -uo pipefail

fail() { echo "МОСТ: $1"; exit 0; }

[ -n "${OPENAI_API_KEY:-}" ] || fail "ключ OPENAI_API_KEY не задан"
[ -n "${ISSUE_NUMBER:-}" ]   || fail "событие без номера задачи"

WORK="$(mktemp -d)"

# Контекст: сама задача и переписка по ней.
{
  gh issue view "$ISSUE_NUMBER" --json title,body \
     --template '{{.title}}{{"\n\n"}}{{.body}}' 2>/dev/null \
  || gh pr view "$ISSUE_NUMBER" --json title,body \
     --template '{{.title}}{{"\n\n"}}{{.body}}' 2>/dev/null \
  || echo "не удалось прочитать задачу"

  echo
  echo "--- переписка ---"
  gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null | tail -n 100 || true
} > "$WORK/context.md"

SYSTEM='Ты архитектор проекта RolanPRO CRM — система для компании по установке оконных плёнок в Лос-Анджелесе.

Роли: решение и путь задаёшь ты, Claude строит по твоему решению.

Отвечай на задачу как архитектор:
1. Согласен ли с постановкой. Если нет — что не так.
2. Решение: что менять и почему. Конкретно.
3. Порядок действий и что не трогать.
4. Критерий готовности — проверяемое условие.

Если задача поставлена неверно, скажи прямо и предложи свою.
По-русски, коротко, без вступлений и пересказа задачи.'

# Собираем запрос через jq, чтобы не сломаться на кавычках в тексте.
jq -n --arg s "$SYSTEM" --arg u "$(cat "$WORK/context.md")" '{
  model: "gpt-4o",
  messages: [
    {role: "system", content: $s},
    {role: "user", content: $u}
  ]
}' > "$WORK/request.json"

HTTP=$(curl -sS -o "$WORK/response.json" -w '%{http_code}' \
  https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$WORK/request.json")

if [ "$HTTP" != "200" ]; then
  ERR=$(jq -r '.error.message // "неизвестная ошибка"' "$WORK/response.json" 2>/dev/null)
  echo "МОСТ: OpenAI ответил $HTTP — $ERR"
  # Нехватка средств — частая причина, пишем об этом в задачу,
  # иначе владелец видит зелёную галочку и пустую задачу.
  if echo "$ERR" | grep -qiE 'quota|billing|insufficient'; then
    gh issue comment "$ISSUE_NUMBER" --body \
"<!-- codex-bridge -->
**Мост не смог ответить**

OpenAI отклонил запрос: $ERR

Нужно пополнить баланс API на platform.openai.com — это отдельная оплата от подписки ChatGPT." 2>/dev/null || true
  fi
  exit 0
fi

jq -r '.choices[0].message.content // ""' "$WORK/response.json" > "$WORK/answer.md"
[ -s "$WORK/answer.md" ] || fail "пустой ответ модели"

{
  echo "<!-- codex-bridge -->"
  echo "**Решение архитектора**"
  echo
  cat "$WORK/answer.md"
} > "$WORK/comment.md"

gh issue comment "$ISSUE_NUMBER" --body-file "$WORK/comment.md" 2>/dev/null \
  || gh pr comment "$ISSUE_NUMBER" --body-file "$WORK/comment.md" 2>/dev/null \
  || fail "не удалось опубликовать комментарий"

echo "МОСТ: ответ опубликован в #$ISSUE_NUMBER"
