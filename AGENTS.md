# ROLANPRO CRM collaboration rules

This repository is the single source of truth for ROLANPRO CRM. Codex, Claude, and human contributors work in this same codebase.

## Mandatory synchronization protocol

Every agent and contributor must do this before starting work:

1. Fetch GitHub and start from the latest `origin/main`.
2. Read `PROJECT_STATE.md` completely.
3. Read `DECISIONS.md` completely before making an architectural or workflow decision.
4. Read `CORE_GUARDRAILS.md` and explicitly identify which invariants the task touches.
5. Check open pull requests and the current branch status so work is not duplicated.
6. Inspect the actual files/routes/functions/models that currently own the requested behavior before proposing implementation.
7. State the Owner-visible outcome, the task being worked on, and which branch owns it.

Before handing work to another device, chat, or contributor:

1. Commit and push the work to a dedicated branch.
2. Update `PROJECT_STATE.md` with the exact result, verification, branch/PR, blocker, and next action.
3. Add a dated entry to `DECISIONS.md` only when a durable product or architecture decision changed.
4. Never describe local-only work as shared, merged, deployed, or complete.

`PROJECT_STATE.md` is the canonical live handoff. Chat history, local files, browser state, and an agent's memory are not sources of truth.

## Owner-intent rule

The Owner may describe work in informal Russian/English or by voice dictation. Treat that as business intent, not as a ready implementation specification.

Before implementation:

1. Translate the request into a concrete Owner-visible result: what the user should see, click, or be able to complete after the change.
2. Verify the current behavior in this repository rather than inferring it from chat memory.
3. Reuse the canonical workflow/data model and preserve the invariants in `CORE_GUARDRAILS.md`.
4. Define observable acceptance tests, including mobile behavior when the affected CRM flow is used on phones.
5. If a required business rule is missing or conflicts with `DECISIONS.md`, stop and ask only for that decision; do not invent it.

If the Owner says a result missed the point, repair only the failed acceptance criteria after inspecting the latest diff. Preserve parts that are already correct instead of broadly rebuilding the feature.

## Workflow

1. Start from the latest `main`.
2. Create a short-lived branch for each change (`codex/...`, `claude/...`, `chatgpt/...`, or `feature/...`).
3. Keep changes scoped and preserve unrelated work.
4. Run tests, TypeScript checks, and a production build before merging.
5. Verify the requested user-visible flow and relevant regression paths on desktop/mobile as applicable.
6. Merge through a pull request or a reviewed fast-forward into `main`.
7. Production deploys only from `main`.

## Safety

- Never commit `.env` files, API keys, OAuth tokens, passwords, database dumps, uploads, or production customer data.
- Keep secrets in server environment variables.
- Keep production records in PostgreSQL, not in Git.
- Do not rewrite `main` history after public collaboration begins.
- Back up the legacy CRM HTML before large edits.
- Never create a second authoritative CRM data store or duplicate business workflow merely to simplify one task.

## CRM architecture

- `/legacy-crm` is the active operating workspace and single visible CRM shell during migration.
- `private/legacy/rolanpro-crm-cloud.html` is the legacy CRM UI served by Next.js.
- `app/api/v1` contains authenticated server APIs.
- Prisma/PostgreSQL is the system of record for server data and the target authoritative CRM business-data store.
- Google Workspace is only for one-to-one client correspondence.
- Marketing broadcasts use a separate provider and sending subdomain.

Before editing the legacy CRM, search for existing functions and UI patterns. Preserve existing orders and client records, verify the changed desktop and mobile flows, and do not create another editor or data store for a concept already owned by a canonical module.
