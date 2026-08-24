# ROLANPRO CRM collaboration rules

This repository is the single source of truth for ROLANPRO CRM. Codex, Claude, and human contributors work in this same codebase.

## Mandatory synchronization protocol

Every agent and contributor must do this before starting work:

1. Fetch GitHub and start from the latest `origin/main`.
2. Read `PROJECT_STATE.md` completely.
3. Read `DECISIONS.md` completely before making an architectural or workflow decision.
4. Check open pull requests and the current branch status so work is not duplicated.
5. State which task is being worked on and which branch owns it.

Before handing work to another device, chat, or contributor:

1. Commit and push the work to a dedicated branch.
2. Update `PROJECT_STATE.md` with the exact result, verification, branch/PR, blocker, and next action.
3. Add a dated entry to `DECISIONS.md` only when a durable product or architecture decision changed.
4. Never describe local-only work as shared, merged, deployed, or complete.

`PROJECT_STATE.md` is the canonical live handoff. Chat history, local files, browser state, and an agent's memory are not sources of truth.

## Workflow

1. Start from the latest `main`.
2. Create a short-lived branch for each change (`codex/...`, `claude/...`, or `feature/...`).
3. Keep changes scoped and preserve unrelated work.
4. Run tests, TypeScript checks, and a production build before merging.
5. Merge through a pull request or a reviewed fast-forward into `main`.
6. Production deploys only from `main`.

## Safety

- Never commit `.env` files, API keys, OAuth tokens, passwords, database dumps, uploads, or production customer data.
- Keep secrets in server environment variables.
- Keep production records in PostgreSQL, not in Git.
- Do not rewrite `main` history after public collaboration begins.
- Back up the legacy CRM HTML before large edits.

## CRM architecture

- `/legacy-crm` is the active operating workspace.
- `private/legacy/rolanpro-crm-cloud.html` is the legacy CRM UI served by Next.js.
- `app/api/v1` contains authenticated server APIs.
- Prisma/PostgreSQL is the system of record for server data.
- Google Workspace is only for one-to-one client correspondence.
- Marketing broadcasts use a separate provider and sending subdomain.

Before editing the legacy CRM, search for existing functions and UI patterns. Preserve existing orders and client records, and verify the changed desktop and mobile flows.
