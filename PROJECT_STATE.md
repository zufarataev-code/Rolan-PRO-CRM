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

> Live repository state has advanced significantly since this old verified snapshot. Always re-check `main`, PRs, and Actions before acting. A current task update is recorded below.

## Active pull requests

| PR | Purpose | Branch | State at last verification |
| --- | --- | --- | --- |
| #19 | Hide project finance from surveyors and installers | `security/hide-project-finance-field-roles` | Open; review and merge still required |
| #18 | Enforce manager record scope | `security/enforce-manager-record-scope` | Open; review and merge still required |
| #17 | Remove embedded customer export | `security/remove-embedded-wiz-data` | Open; review and merge still required |
| #12 | Bootstrap Claude Builder transport | `feature/claude-builder-transport` | Open; completion state must be reviewed before reuse |
| #24 | Unified proposal delivery, public PDF, employee routing, and removal of duplicate PIN login | `codex/unify-crm-proposal-pdf` | Open; local checks passed, GitHub review/CI and merge still required |
| #98 | Employee email editing, password recovery, and canonical server login | `fix/employee-account-recovery` | Merged and deployed; post-merge security findings are handled by #99 |
| #99 | Revoke old sessions and make password-reset links atomically one-time | `fix/password-reset-session-revocation` | Open; first full CI green, final docs commit CI/security review required before merge |

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
| Daily installer workspace: shifts, hours, mileage, payroll history, and opt-in work tracking | `codex/installer-daily-operations` | Codex | Implemented and locally verified | Push branch, release from `main`, run migration, then production smoke without starting a real employee shift |
| Fix installed employee app opening installer 404 | `fix/installer-pwa-entry` / #103 | Codex | Merged and deployed | No remaining code action; employee should close and reopen the installed app |
| Canonical services/pricing and break-even control for owner + manager | `codex/service-pricing-control` / #101 | Codex | Merged and deployed | No remaining release action; owner should confirm planning assumptions before using targets operationally |
| Unify CRM navigation, employee entry points, and one public proposal/PDF output | `codex/unify-crm-proposal-pdf` / #24 | Codex | PR open | Review, merge after CI passes, deploy from `main`, then smoke-test Gmail delivery and the no-login client link |
| Fix employee email editing, forgot-password by email, and server-only employee login | `fix/employee-account-recovery` / #98 | ChatGPT | Merged/deployed | Verify through #99 security hotfix, then controlled production employee-access smoke test |
| Revoke old sessions after credential changes and make reset links concurrency-safe | `fix/password-reset-session-revocation` / #99 | ChatGPT | First full CI green; final docs commit pending checks | Wait for final CI/security review on latest head, merge to `main`, deploy, verify production health |
| Make employee login email editable directly in the employee card | `codex/direct-email-edit` | Codex | Merged and deployed | No remaining code action; use the Team card's `Изменить` action for future email changes |
| Allow owner to change an employee role from the normal employee card | `codex/edit-employee-role` | Codex | Merged and deployed | No remaining code action; change roles through `Команда` → employee → `Изменить` |

Contributors must add a row before starting substantial work and update or remove it at handoff.

## Latest handoff

- What changed: mail returns owners to `/owner` and managers to `/manager`; login and password-change flows now send every employee to the correct role workspace; legacy KP publishing creates or refreshes a canonical PostgreSQL proposal, produces a public `/proposal/<token>` link that does not require CRM login, and sends it through the connected corporate Gmail instead of opening `mailto`; the canonical public proposal keeps its dedicated Letter-size PDF layout and one-click PDF action. The server now removes the legacy pre-rendered PIN screen before serving `/legacy-crm`, legacy employee PINs are removed from seeded and stored workspace data, the Team view no longer manages PINs, and logout returns to the canonical email/password login.
- Why: the old KP button exposed an authenticated `/legacy-crm/#/proposal/...` address and the Email button only opened a local mail composer, so clients could receive an inaccessible link and no server-confirmed company email. Role-based login also incorrectly sent all employees into the legacy owner/manager workspace. The legacy HTML additionally contained a second PIN login that could flash or remain visible before cloud authentication completed.
- Verification: 72 automated tests passed; TypeScript passed; production build passed. A regression test runs the real legacy HTML through the server shell and confirms the pre-rendered PIN screen is absent. The earlier representative 8-line proposal PDF was visually inspected on both pages with no clipping, overlap, or split content. Actual Gmail delivery, public-link access, and cloud login behavior still require a production smoke test after deployment so no test email is sent from development.
- Branch / PR: `codex/unify-crm-proposal-pdf` / #24 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/24`).
- Blocker: the old `/legacy-crm` route must remain available until its business records are fully migrated; this change publishes legacy KP snapshots into the canonical proposal tables but does not yet migrate every legacy order or disable legacy writes.
- Next action: open the PR, let GitHub CI pass, merge and deploy from `main`; in production, send one controlled KP to an internal address, open the public link in a signed-out browser, and verify PDF download before using it with clients.

## 2026-09-01 handoff — employee account recovery / PR #98

- Root cause: the legacy Team access modal matched a server user only by the legacy card's current email. When legacy and PostgreSQL emails had diverged, the owner could see the edit field but the save flow could not reliably identify the canonical account.
- Fix: Team API now exposes `legacyUserIds`; owner-only account updates may link a legacy employee ID to the canonical PostgreSQL User, and the legacy access UI resolves by stable ID first with old email only as a fallback. The mapping is persisted after a successful update.
- Owner account control: the existing Access modal can change the employee login email and can set a new temporary password while preserving the required password-change behavior.
- Forgot-password: `/login` now exposes `Забыли пароль?`; `/forgot-password` sends a reset link through the connected corporate Gmail; `/reset-password` accepts a signed HMAC token with 30-minute TTL. The token is bound to user ID, email, and current password hash, so changing email/password invalidates it.
- Server-only access: employee Access UI now displays/copies the canonical server `/login` URL, and `/legacy-crm` explicitly returns HTML inline. Employees should never receive or store a CRM HTML file; see `docs/EMPLOYEE_ACCESS.md`.
- Security verification added: automated tests cover token signature tampering, expiry, password-change invalidation, and email-change invalidation.
- First CI attempt: all 119 existing tests passed; TypeScript failed only because the two new pages initially imported root `components/` through the `@/` alias that points to `src/`. Those imports were corrected and a new CI run was triggered.
- Branch / PR: `fix/employee-account-recovery` / #98 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/98`).
- Result after handoff: PR #98 later passed CI, merged to `main` as `59c4794ec464ce40a297c73e63032467cb5c96b3`, and production deploy succeeded. A post-merge security review then identified two P1 issues now owned by PR #99.

## 2026-09-01 handoff — password recovery security hotfix / PR #99

- Trigger: the post-merge security review of #98 found two P1 issues: existing stateless session cookies remained valid after a password reset, and concurrent submissions of the same reset link could both validate the old password hash before either write completed.
- Session fix: every newly issued session now carries a one-way fingerprint of the current password hash plus canonical email. Both API and server-rendered app session loaders compare that fingerprint/email with the live PostgreSQL User. Password or email changes therefore invalidate all older sessions automatically.
- Current-session UX: the authenticated change-password endpoint writes the new password and returns one freshly bound cookie for the new credentials; all other older cookies fail validation.
- Reset race fix: reset completion now uses PostgreSQL `updateMany` as an atomic compare-and-swap against exact user ID, email, old password hash, and active status. Only one concurrent request can update one row; every racing/later request gets an invalid/already-used result.
- Tests: regression coverage now checks credential fingerprint creation, password-change invalidation, email-change invalidation, and rejection of malformed/legacy-style session payloads. Existing reset-token signature/TTL/credential-change tests remain.
- Verification on code head `96885575b64e52b0156929bbbaec1838e0d4cca0`: GitHub CI passed tests, TypeScript, and production build. Documentation commits recording this handoff and durable decision were added afterward, so final CI must be green again on the latest head before merge.
- Durable decision: `DECISIONS.md` now records credential-bound sessions and atomic one-time password recovery as the canonical authentication policy.
- Branch / PR: `fix/password-reset-session-revocation` / #99 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/99`).
- Blocker: none in code; release is gated only by final GitHub CI/security review on the latest head.
- Next action: wait for final checks, merge #99 to `main`, let the standard production workflow deploy it, and verify production is serving the merge SHA. Controlled real-email/reset smoke should be done only with an intentionally selected internal/test employee account so no real employee password is changed unexpectedly.

## 2026-09-01 handoff — direct employee email editing

- Root cause: the employee card still rendered the login email as a disabled reference field and delegated changes to a separate Access dialog. The cloud access patch that was intended to support the dialog also contained an invalid nested quote in generated JavaScript, so that patch stopped executing in production.
- Fix: for an owner, the normal Team card editor now contains an enabled email field. Saving resolves the canonical PostgreSQL user by stable `legacyUserIds` first, updates the server login email, and keeps the owner signed in when the owner changes their own email. The malformed inline access-button handler was replaced with a separate valid function.
- Verification: 131 automated tests passed, TypeScript passed, and the production build passed. GitHub CI and the production deploy both succeeded for `e734ea3743ded8afbc2b85cce305514f2c6eb2c9`. A fresh production browser load had no script errors; the Team editor displayed `Почта для входа` as an enabled, non-read-only `email` field for both owner and manager cards. No real employee email was changed during smoke testing.
- Branch / release: `codex/direct-email-edit`; merged by reviewed fast-forward to `main`; production served release `e734ea3743ded8afbc2b85cce305514f2c6eb2c9` before this documentation-only handoff commit.
- Next action: none. When changing an address, open `Команда` → the employee's `Изменить` button, enter the new email, and press `Сохранить`; the new address immediately becomes that employee's login.

## 2026-09-01 handoff — employee role editing from the Team card

- Root cause: the normal employee editor rendered `Роль` as a permanently disabled reference field. The separate access dialog only changed email and password, so the owner had no working UI for changing the canonical server role.
- Fix: an owner editing another employee now gets one role selector in the normal card: Manager, Surveyor, Installer, or Owner. Saving maps that selection to the canonical server role, updates PostgreSQL through the owner-only Team API, and then updates the legacy card. The owner cannot change their own role in this card, preventing accidental self-lockout; promotion to Owner requires an explicit warning confirmation.
- Data safety: the editor hydrates the canonical server email and role before saving. A role-only change therefore does not overwrite a newer server email with stale legacy data. If a server account has multiple roles, the primary legacy view follows the existing access priority: Owner, Manager, Surveyor, Installer.
- Local verification: the legacy inline script compiled; all 133 automated tests passed; TypeScript passed; the production build passed. No real employee account was modified.
- Branch: `codex/edit-employee-role`.
- Production verification: GitHub CI and the production deploy succeeded for `0b6e0883bb0f1713f7dac3858c007a8b4e942474`. On a fresh public CRM load, Danilla's normal employee card showed an enabled `SELECT` with Manager, Surveyor, Installer, and Owner; the current owner's role remained a disabled field. The public page reported no script errors, and the dialog was closed with `Отмена`, so no real account was changed.
- Release: `0b6e0883bb0f1713f7dac3858c007a8b4e942474` from `main`.
- Next action: none. Change a role through `Команда` → employee → `Изменить` → `Роль` → `Сохранить`.

## 2026-09-01 handoff — canonical service pricing and break-even control

- Added focused owner and manager pages for one PostgreSQL-backed service price list. Both roles can add services and add-ons and maintain customer-facing prices used by calculator/proposal flows.
- Owner-only fields include material cost, installer pay rate, block/add-on cost, company overhead, target profit, and margin assumptions. Manager server responses zero internal-cost fields and expose only actionable sales targets.
- Added persistent business-planning assumptions and a monthly signal that converts overhead, contribution margin, average check, and conversion into required revenue, deals, and leads. The owner dashboard now raises an action when the break-even plan is behind.
- Added direct `Услуги и цены` entry points to owner navigation, manager navigation, and the active legacy CRM menu/settings hub.
- Security review: a P1 finding showed that manager PATCH responses could return internal cost fields even though the screen hid them. All GET and PATCH responses now use the same server-side redaction, with dedicated regression tests.
- Local verification: 137 tests passed, TypeScript passed, production build passed, and `git diff --check` passed. Migration status could not be queried locally because this worktree intentionally has no `DATABASE_URL`; the standard production deploy runs `prisma migrate deploy`.
- Branch / PR: `codex/service-pricing-control` / #101 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/101`).
- Release: PR #101 passed CI and security review, then merged to `main` as `fb1c3d69815a53b47ce4cf5262b5ecd0cb993dcc`. Production deploy run #33589241883 completed successfully, including `prisma migrate deploy`.
- Production verification: `/owner/settings/pricing` loaded the live canonical service list, owner-only cost fields, margin figures, and break-even/target cards with no browser errors. `/manager/crm/pricing` also loaded successfully with 24 service/add-on cards and no browser errors. No live price, service, or planning value was changed during smoke testing.
- Next action: owner should review and save the real average deal, lead-to-deal conversion, monthly target profit, and company overhead. After that the dashboard signal becomes the operating monthly target for leads and closed deals.

## 2026-09-01 handoff — installed employee app installer 404

- Root cause: the shared post-login destination mapped the Installer role to `/installer`, while the real employee workspace lives at `/installer/jobs`. The installed PWA therefore opened a valid authenticated session on a nonexistent page and showed the reported 404.
- Fix: Installer login and first-password-change now route to `/installer/jobs`; `/installer` remains as a compatibility redirect so already installed apps, bookmarks, and cached entry links recover automatically after deployment.
- Related access fix: `/api/v1/settings/pricing` now has the same Owner + Manager middleware permission as its route handler, while all other settings APIs remain Owner-only.
- Verification: 138 tests passed, TypeScript passed, production build passed, the build now contains both `/installer` and `/installer/jobs`, and `git diff --check` passed.
- Branch / PR: `fix/installer-pwa-entry` / #103 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/103`).
- Release: PR #103 passed CI and merged to `main` as `03e5c7b345f31d999ff9214d640f042e7856cda3`; production deploy run #33590299756 completed successfully.
- Production verification: unauthenticated requests to both `/installer` and `/installer/jobs` return the same authorization redirect and neither returns 404. The authenticated role destination and compatibility redirect are covered by the passing tests/build. No employee password or live account was used or changed.
- Next action: the affected employee should fully close the installed Rolan PRO app and open it again. If Chrome still shows the old page, refresh once; reinstalling should not be necessary.

## 2026-09-02 handoff — installer daily operations

- Added one mobile-first installer workday inside the canonical CRM at `/installer/today`. Installer login and the installed PWA now open this workspace first; existing job cards remain at `/installer/jobs`.
- A worker can start a shift, bind it to an assigned installation, record starting/ending odometer or manual mileage, add an end-of-shift note, and review the last 30 shifts with hours and miles.
- When an installer completes a job, PostgreSQL creates one immutable payroll accrual snapshot from actual sqft, the saved installer rate, and the saved complexity multiplier. The installer sees only their own owed/paid history; client selling price and company margin are not returned.
- Work location is opt-in at shift start and is accepted only for the authenticated installer's active, tracking-enabled shift. The manager/owner view at `/manager/installers` shows current shift, object, elapsed time, and last location with a Google Maps link. The legacy CRM navigation includes `Монтажники сейчас` so this is reachable from the current operating workspace.
- Data protection: a partial unique database index prevents two simultaneous active shifts for one installer; location writes validate coordinates and are rejected when tracking is inactive; all employee writes are scoped server-side to the authenticated Installer role.
- Local verification: 140 tests passed, TypeScript passed, production build passed with `/installer/today`, `/manager/installers`, and both work-session APIs, and `git diff --check` passed.
- Branch: `codex/installer-daily-operations`.
- Remaining release action: push, merge to `main`, let the standard production deployment run the migration, and smoke-test route availability without starting a real employee shift or requesting location permission.

## Completion rule

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.
