# ROLANPRO CRM collaboration rules

This repository is the single source of truth for ROLANPRO CRM. Codex, Claude, and human contributors work in this same codebase.

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
