# ROLANPRO CRM — Current Project State

This file is the canonical live handoff for every device, chat, agent, and contributor.

## Start here

Before doing any work:

1. Fetch the latest GitHub state.
2. Read this entire file and `DECISIONS.md`.
3. Check open pull requests and active branches.
4. Work from the latest `origin/main` on one dedicated branch.
5. Do not rely on a previous chat's memory or local browser storage.

## Last verified state

- Verified: 2026-08-24
- Canonical repository: `zufarataev-code/Rolan-PRO-CRM`
- Canonical code branch: `main`
- Verified `origin/main` commit: `3506169` (`Merge pull request #16 from zufarataev-code/fix/deploy-marker-tab`)
- Production status: not re-verified during this documentation change
- Current phase: security stabilization, data consolidation, and removal of duplicate CRM workflows

## Active pull requests

| PR | Purpose | Branch | State at last verification |
| --- | --- | --- | --- |
| #19 | Hide project finance from surveyors and installers | `security/hide-project-finance-field-roles` | Open; review and merge still required |
| #18 | Enforce manager record scope | `security/enforce-manager-record-scope` | Open; review and merge still required |
| #17 | Remove embedded customer export | `security/remove-embedded-wiz-data` | Open; review and merge still required |
| #12 | Bootstrap Claude Builder transport | `feature/claude-builder-transport` | Open; completion state must be reviewed before reuse |

Always re-check GitHub before acting; this table is a handoff snapshot, not a substitute for the live PR state.

## Confirmed system state

- `/legacy-crm` is the current operating workspace.
- The legacy workspace stores a large state payload through `LegacyWorkspace.payload`.
- Modern CRM modules use relational Prisma/PostgreSQL models.
- Legacy and modern records do not yet have one complete synchronization path.
- This split can produce different results between modules or devices.
- PostgreSQL must become the only source of CRM business data; browser storage may be used only as a disposable cache.
- GitHub `main` is the only source of released code.

## Confirmed duplication to consolidate

- Proposals currently have a legacy proposal flow and a separate modern `ProposalBuilder` flow, plus unused legacy fragments.
- Measurements currently have multiple legacy entry points, a standalone field HTML module, and a modern shared survey workspace.
- The standalone measurement module uses a local desktop file path and therefore cannot be a reliable cloud workflow.
- Legacy order/project cards and modern Project records are not yet one synchronized entity.

## Canonical target workflow

`Deal -> Consultation / Survey -> Measurement -> Proposal -> Agreement / Deposit -> Project`

Target modules:

- Survey and measurement: modern shared consultation/survey workspace.
- Proposal: one database-backed proposal builder; public proposal page is an output, not a second editor.
- Project: one modern Project record shared by scheduling, installation, finance, and operations.
- Permissions: surveyors and installers must not see project totals, margins, costs, or other financial data.

## Priority order

1. Review and merge or close PRs #17, #18, and #19 without duplicating their work.
2. Verify production deployment from the resulting `main` commit.
3. Define and test migration mapping from legacy workspace data to PostgreSQL records.
4. Make modern modules the only write path, then place legacy flows in read-only mode.
5. Consolidate proposal, measurement, and project-card entry points.
6. Remove dead legacy functions only after migrated records and production behavior are verified.

## Current task ownership

| Task | Branch / PR | Owner | Status | Next action |
| --- | --- | --- | --- | --- |
| Establish cross-device source of truth | `codex/project-source-of-truth` | Codex | In progress | Review and merge this documentation into `main` |

Contributors must add a row before starting substantial work and update or remove it at handoff.

## Latest handoff

- What changed: added the repository-wide synchronization protocol and canonical project-state documents.
- Why: different devices and chats were relying on incomplete local context.
- Verification: documentation links and Git diff checked; no application code or production data changed.
- Branch: `codex/project-source-of-truth`
- Blocker: the branch must be reviewed and merged into `main` before every device automatically receives it.
- Next action: review the pull request, merge it, then require all future work to begin by reading this file.

## Completion rule

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.
