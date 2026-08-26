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

- Verified: 2026-08-25
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
| Unify CRM navigation, employee entry points, and one public proposal/PDF output | `codex/unify-crm-proposal-pdf` / pending | Codex | Ready for PR | Review, merge after CI passes, deploy from `main`, then smoke-test Gmail delivery and the no-login client link |

Contributors must add a row before starting substantial work and update or remove it at handoff.

## Latest handoff

- What changed: mail returns owners to `/owner` and managers to `/manager`; login and password-change flows now send every employee to the correct role workspace; legacy KP publishing creates or refreshes a canonical PostgreSQL proposal, produces a public `/proposal/<token>` link that does not require CRM login, and sends it through the connected corporate Gmail instead of opening `mailto`; the canonical public proposal keeps its dedicated Letter-size PDF layout and one-click PDF action.
- Why: the old KP button exposed an authenticated `/legacy-crm/#/proposal/...` address and the Email button only opened a local mail composer, so clients could receive an inaccessible link and no server-confirmed company email. Role-based login also incorrectly sent all employees into the legacy owner/manager workspace.
- Verification: 69 automated tests passed; TypeScript passed; production build passed. The earlier representative 8-line proposal PDF was visually inspected on both pages with no clipping, overlap, or split content. Actual Gmail delivery and public-link access still require a production smoke test after deployment so no test email is sent from development.
- Branch / PR: `codex/unify-crm-proposal-pdf` / pending.
- Blocker: the old `/legacy-crm` route must remain available until its business records are fully migrated; this change publishes legacy KP snapshots into the canonical proposal tables but does not yet migrate every legacy order or disable legacy writes.
- Next action: open the PR, let GitHub CI pass, merge and deploy from `main`; in production, send one controlled KP to an internal address, open the public link in a signed-out browser, and verify PDF download before using it with clients.

## Completion rule

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.
