# Claude Builder transport for ROLANPRO CRM

Status: CONNECTING until the workflow is merged, authentication is configured, and an R0 smoke task passes independent review.

## Purpose

This directory contains repository-local authority for the GitHub-native Claude Builder transport. The model job is repository-read-only. A separate deterministic publisher may apply only the captured R0-R2 patch to a generated task branch, open a pull request, and post the structured handoff.

## Trigger

Only the repository owner may create the exact issue comment:

`@claude build TASK-<numeric-id>`

The matching canonical record must exist at `.claude-builder/tasks/active/TASK-<numeric-id>.md`, use status `READY_FOR_BUILD` only (v1 rejects `FIX_REQUIRED` until existing-branch continuation is implemented), risk level R0-R2, and builder `Claude Builder`.

## Safety boundaries

- No autonomous merge, deployment, production database access, customer communication, credential changes, payments, or destructive actions.
- The model job receives no repository-write credentials.
- The deterministic publisher rejects changes to workflow, authority, instruction, secret, dump, and upload paths.
- Claude Builder v1 rejects all CSV files and `rolanpro-backup-*` artifacts to prevent customer and order exports from being published.
- Claude Builder v1 rejects changes under `private/legacy/` and `app/legacy-crm/` until deterministic desktop and mobile browser validation is available.
- Every implementation pull request requires independent Codex review and Owner merge approval under repository policy.
- Secrets must never be committed.

## Authentication and test environment

The workflow requires the repository Actions secret `ANTHROPIC_API_KEY`. Its value is configured separately in GitHub Settings and is never stored in source.

Reserve a GitHub Environment named `crm-stage1-test` for future Prisma validation. Only a disposable non-production PostgreSQL `DATABASE_URL` may be stored there. The Builder transport added by this change does not read that database, run migrations, deploy, or access production.

## Task records

Create active records from `.claude-builder/tasks/TASK-template.md`. Move accepted tasks out of `active` only in a separately reviewed change.
