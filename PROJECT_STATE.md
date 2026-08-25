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
- Verified `origin/main` commit: `3086998` (`Merge pull request #23 from zufarataev-code/codex/rotate-owner-temp-password`)
- Production status: deploy run #16 succeeded for `3086998`; login page and owner access were verified
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
| Unify CRM navigation and create one polished proposal/PDF output | `codex/unify-crm-proposal-pdf` / pending | Codex | Ready for PR | Review the scoped navigation and print-layout change, then merge after CI passes |

Contributors must add a row before starting substantial work and update or remove it at handoff.

## Latest handoff

- What changed: mail now returns owners to `/owner` and managers to `/manager` instead of opening `/legacy-crm`; the canonical public proposal has a dedicated Letter-size PDF layout with whole service cards, a protected total/closing block, signatures, and a one-click print/PDF action.
- Why: the mail-to-legacy link looked like a second CRM, while the modern proposal needed a polished client PDF without individual sections splitting across pages.
- Verification: 64 automated tests passed; TypeScript passed; production build passed; a representative 8-line proposal rendered to a two-page PDF and both pages were visually inspected with no clipped, overlapping, or split content.
- Branch / PR: `codex/unify-crm-proposal-pdf` / pending.
- Blocker: the old `/legacy-crm` route must remain available until its business records are fully migrated; this change removes the confusing mail entry point but does not delete legacy data.
- Next action: open the PR, let GitHub CI pass, merge and verify production; then begin the separate system-services/API-control module.

## Completion rule

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.
