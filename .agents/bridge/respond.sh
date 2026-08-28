#!/usr/bin/env bash
# Ответ Codex на задачу или пулл-реквест.
#
# Владелец в цепочке не участвует: Claude ставит задачу, Codex отвечает,
# Claude читает ответ и строит.
set -euo pipefail

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY не задан — мост не настроен. Пропускаем."
  exit 0
fi

if [ -z "${ISSUE_NUMBER:-}" ]; then
  echo "Событие без номера задачи. Пропускаем."
  exit 0
fi

WORKDIR="$(mktemp -d)"
CONTEXT="$WORKDIR/context.md"
ANSWER="$WORKDIR/answer.md"

# Собираем контекст: сама задача и вся переписка по ней.
{
  echo "## Задача #$ISSUE_NUMBER"
  gh issue view "$ISSUE_NUMBER" --json title,body,labels \
    --template '{{.title}}{{"\n\n"}}{{.body}}' 2>/dev/null \
    || gh pr view "$ISSUE_NUMBER" --json title,body \
       --template '{{.title}}{{"\n\n"}}{{.body}}'

  echo
  echo "## Переписка"
  gh issue view "$ISSUE_NUMBER" --comments 2>/dev/null | tail -n 120 || true
} > "$CONTEXT"

PROMPT=$(cat <<'EOF'
Ты архитектор проекта RolanPRO CRM. Роли описаны в .agents/PROTOCOL.md:
решение и путь задаёшь ты, Claude строит по твоему решению.

Прочитай задачу и переписку ниже. Ответь как архитектор:

1. Согласен ли ты с постановкой. Если нет — что не так.
2. Твоё решение: что именно менять и почему. Конкретно, а не общими словами.
3. Порядок действий и что не трогать.
4. Критерий готовности — проверяемое условие.

Если для решения нужно посмотреть код — посмотри, репозиторий рядом.
Если задача поставлена неверно, скажи это прямо и предложи свою.

Пиши по-русски, коротко и по делу. Без вступлений и без пересказа задачи.
EOF
)

echo "$PROMPT" > "$WORKDIR/prompt.md"
cat "$CONTEXT" >> "$WORKDIR/prompt.md"

# Codex в неинтерактивном режиме: читает репозиторий, ничего не меняет.
codex exec --full-auto --skip-git-repo-check \
  "$(cat "$WORKDIR/prompt.md")" > "$ANSWER" 2>"$WORKDIR/err.log" || {
    echo "Codex не ответил:"
    tail -n 40 "$WORKDIR/err.log"
    exit 0
  }

if [ ! -s "$ANSWER" ]; then
  echo "Пустой ответ, комментарий не публикуем."
  exit 0
fi

# Метка нужна, чтобы мост не отвечал на собственные сообщения.
{
  echo "<!-- codex-bridge -->"
  echo "**Решение архитектора**"
  echo
  cat "$ANSWER"
} > "$WORKDIR/comment.md"

gh issue comment "$ISSUE_NUMBER" --body-file "$WORKDIR/comment.md" \
  || gh pr comment "$ISSUE_NUMBER" --body-file "$WORKDIR/comment.md"

echo "Ответ опубликован в #$ISSUE_NUMBER"
