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
| Prevent AI-only repeat-booking claims and force every new Messenger booking through CRM | `fix/messenger-repeat-booking-20260924` | Codex | In progress; reproduced the already-booked guard allowing AI to say booked while suppressing a new CRM call | Expand repeat-booking intent, restart only the booking state, recapture the CRM lead event, require real slots/quick reply, test, review, merge, and deploy |
| Make Messenger a fast film consultant and remove the post-booking CRM-check dead end | `fix/messenger-human-consultant-20260924` / #208 | Codex | Merged and deployed; production Worker version `93c64342-935b-4d81-ad48-89bc8cd2ba4c` | Send one Solar-film question in the existing booked chat and confirm a fast consultation answer rather than a CRM-check status |
| Make Messenger conversations follow the customer's language beyond RU/EN/ES | `fix/messenger-multilingual-20260924` / #206 | Codex | Merged and deployed; production Worker version `dd14f10f-8ebe-4cc4-b905-81b6f4752fbe` | Send controlled messages in two non-English languages and confirm the whole booking flow stays in each language |
| Fix Messenger service recognition for Russian customer messages | `fix/messenger-russian-service-20260924` / #204 | Codex | Merged and deployed; production Worker version `bef48a14-24c6-4d84-95f9-c39e6f0e9103` | Repeat the reported Messenger phrase and finish one controlled booking; confirm the new lead and consultation in CRM |
| Show canonical Messenger leads in active `/legacy-crm` New Leads inbox | `fix/messenger-new-leads-20260924` / #201 | Codex | Merged and deployed; live inbox shows the Zafar Messenger lead | Release the latest-booking selector and confirm the card opens the 10:00 Sherman Way consultation rather than the older 08:00 test booking |
| Show canonical Messenger consultations inside the active `/legacy-crm` calendar | `fix/messenger-consultations-calendar-20260924` / #200 | Codex | Implemented and locally verified; 299 tests, TypeScript, production build, and diff check pass | Merge #200, let the normal production deployment finish, then refresh Calendar and confirm the live Zafar booking is visible at 10:00 |
| Repair live Facebook Messenger lead capture before slot loading | `fix/facebook-messenger-advisory-lock` / #194 | Codex | Merged and deployed as `de262a4`; Prisma `P2010` from deserializing the advisory lock's PostgreSQL `void` return is fixed with `$executeRaw`; 289 tests, TypeScript, local production build, main CI, deploy, health check, and signed production slots smoke test pass | Repeat the live Messenger conversation; confirm the real Lead, Consultation, CalendarEvent, Survey, and notification in CRM |
| Connect the live Facebook Messenger Cloudflare Worker to canonical CRM lead, slot, and booking endpoints | `codex/facebook-messenger-worker` / #192 | Codex | Merged; production Worker `rolanpro-bot` deployed as version `158a75f7-17f1-45b1-9e5f-431a4f091e59`; protected CRM/Worker secret configured | Send one message from an internal Facebook account, complete a real test booking, and confirm the resulting Lead, Consultation, CalendarEvent, Survey, and notification before public promotion |
| Implement issue #164: canonical multi-service Project / Solar measurement constructor | `codex/issue-164-project-constructor` / #169 | Codex | PR open; local verification green; no production deployment performed | Review #169 and its CI, merge only after approval, then run the normal migration/release workflow separately |
| Remove the duplicate field-role CRM shell and open every employee inside the real `/legacy-crm` workspace | `codex/remove-duplicate-field-shell` / `f70355f` | Codex | Merged and deployed | Refresh/sign in through the public `/legacy-crm`; perform a controlled surveyor/installer account check of assigned records and `Рабочий день` without changing live customer data |
| Remove standalone voice-input button from every CRM interface | `codex/remove-voice-button` / #112 | Codex | Merged and deployed | Refresh any already-open CRM tab once; voice will return only inside the future agent |
| Put surveyor and installer inside the single canonical CRM interface | `codex/one-crm-all-roles` / #110 | Codex | Merged and deployed | Surveyor and installer should refresh/sign in through the public CRM and use only the `/legacy-crm` role workspace |
| Remove duplicate owner/manager pricing shell and keep canonical pricing inside the main CRM | `codex/unify-service-pricing-ui` / #108 | Codex | Merged and deployed | Refresh the public CRM and use `Услуги и цены` / `Монтажники сейчас` only inside `/legacy-crm` |
| Daily installer workspace: shifts, hours, mileage, payroll history, and opt-in work tracking | `codex/installer-daily-operations` / #106 | Codex | Merged and deployed | Have each installer sign in, install/open the Rolan PRO app, and begin using `Рабочий день`; review configured installer rates before first payroll |
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
- Branch / PR: `codex/installer-daily-operations` / #106 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/106`).
- Release: PR #106 passed GitHub CI and merged to `main` as `d9696a08fd84e2238328dc129a8de49ad02b80ad`. Production deploy run #33602991272 succeeded, including the database migration.
- Production smoke: `/installer`, `/installer/today`, and `/manager/installers` all returned the expected authenticated redirect rather than 404; the work-session API returned 401 without a session. No real employee shift, mileage, payroll, or location record was created.
- Next action: verify the real installer rates in `Услуги и цены`, then have each installer sign in at the public CRM, open `Рабочий день`, allow location only if desired, and start the first real shift.

## 2026-09-02 handoff — one owner/manager CRM interface

- Root cause: the canonical PostgreSQL pricing editor and installer tracking screen were opened in the separate modern owner/manager shell. The data source was correct, but the second sidebar and visual language made it look like a different CRM.
- Fix: `Услуги и цены` now renders directly inside the active `/legacy-crm` shell with compact expandable service/add-on cards, owner-only costs and installer rates, manager-safe selling prices, add-service/add-on actions, and the existing break-even plan. `Монтажники сейчас` also renders inside the same shell through a protected Owner/Manager API.
- Compatibility: `/owner/settings/pricing` and `/manager/crm/pricing` redirect to `/legacy-crm#/service-pricing`; `/manager/installers` redirects to `/legacy-crm#/installer-operations`. Existing bookmarks therefore stop showing the duplicate shell without breaking.
- Data safety: no service, rate, planning, payroll, shift, or location data was deleted. All writes continue through the same authenticated PostgreSQL APIs, including server-side manager cost redaction.
- Local verification: 142 tests passed, TypeScript passed, the legacy inline script compiled, production build passed with the new team API and compatibility redirects, and `git diff --check` passed.
- Branch / PR: `codex/unify-service-pricing-ui` / #108 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/108`).
- Release: PR #108 passed GitHub CI, merged to `main` as `133a1c13fcc0231c3cd87ebd5f05bd3546de0fe8`, and production deploy run #33604923832 succeeded.
- Production safety: the release was deployed without modifying any live price, installer rate, shift, payroll, or location record. An authenticated visual smoke still requires the owner to refresh their existing session; unauthenticated route protection remains in place.
- Next action: close the local `file:///tmp/...` tab, open the public `/legacy-crm`, refresh once, and verify that `Услуги и цены` stays under the same main sidebar.

## 2026-09-02 handoff — one CRM for surveyor and installer

- Root cause: the owner and manager had been consolidated under `/legacy-crm`, but surveyors still opened `/survey` and installers opened `/installer/today`. Those routes used a second white product shell, so the public system still looked like two different CRMs.
- Fix: surveyor login now opens `/legacy-crm/survey`; installer login and the installed PWA open `/legacy-crm/installer`. Consultation details, installer jobs, job details, and field-role notifications all stay under the same `/legacy-crm` namespace.
- Compatibility: every old `/survey...`, `/installer`, `/installer/today`, and `/installer/jobs...` address preserves its suffix and query string and returns a permanent redirect to the canonical CRM route.
- Visual continuity: field workspaces now use the real Rolan PRO logo, dark primary navigation, one `Rolan PRO CRM` identity, and compact rectangular work cards instead of presenting a separate white product shell.
- Data safety: field roles still use their existing PostgreSQL services and server-side assignment filters. They do not receive the owner/manager `LegacyWorkspace.payload`, selling prices, company costs, margins, or unrelated customer records.
- Verification: 146 automated tests passed; TypeScript passed; the production build passed and includes all seven canonical role routes. Local route smoke confirmed old URLs return 308 to the matching `/legacy-crm` URL, while canonical role URLs remain authentication-protected. `git diff --check` passed.
- Branch / PR: `codex/one-crm-all-roles` / #110 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/110`).
- Release: PR #110 passed CI and security review, merged to `main` as `554bb2636332c86825bc38a640805bfc7988bd17`, and production deploy run #33637568763 succeeded.
- Production smoke: old survey and installer URLs returned 308 to the exact canonical `/legacy-crm` route, including consultation/job IDs; canonical field and owner routes remained authentication-protected. No live customer, measurement, shift, mileage, payroll, price, or employee record was changed.
- Next action: sign in once as the real surveyor and installer, refresh or fully close/reopen the installed app, and visually verify their assigned data without changing any live records.

## 2026-09-02 handoff — remove standalone voice input

- Removed the floating `Голосовой ввод` button from the active legacy CRM and from the shared Next.js layout used by employee role pages.
- Removed the unused browser speech-recognition handlers, focus listeners, state, and button styles so the feature cannot reappear on another screen through shared code.
- Kept Google Voice calling/SMS configuration and the Smart-film `Voice Control` catalog capability unchanged; they are unrelated to the removed dictation button.
- Added a regression check that the standalone control and its handler are absent from both CRM shells.
- Verification: 146 automated tests passed, TypeScript passed, production build passed, and `git diff --check` passed.
- Branch / PR: `codex/remove-voice-button` / #112 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/112`).
- Release: PR #112 passed CI and security review, merged to `main` as `3dced4563ff24ad1b45b72ba5d0f2077aa5648c0`, and production deploy run #33641166229 succeeded.
- Production safety: the release changed interface code only. It did not modify customer data, orders, calls, Google Voice configuration, employees, shifts, payroll, prices, or Smart-film services.
- Next action: refresh any already-open CRM tab once. Voice interaction remains deferred until it is designed as part of the unified CRM agent.

## 2026-09-02 handoff — remove the duplicate field-role CRM shell

- Root cause: PR #110 changed the employee URL and colors but kept separate React page trees and a separate `ProductShell`. A route named `/legacy-crm/survey/...` therefore still displayed a different CRM, exactly as reported.
- Fix: the duplicate surveyor and installer page trees and their role shells are removed. Login, notifications, installed-app entry, and every old surveyor/installer URL now resolve to the one real `/legacy-crm` document used by the company.
- Field access: the real legacy workspace now accepts Surveyor and Installer sessions, but its API builds a server-side field view containing only explicitly assigned orders, linked clients, assigned tasks, safe coworkers, and operational reference data. It removes selling prices, payments, costs, margins, company finance, unrelated customers, and other employees' compensation before sending the response.
- Safe writes: field updates merge only operational order facts and assigned-task status into the current full workspace. Existing financial values embedded in measurements and financial timeline events are preserved on the server even though the employee never receives them. Assignment IDs, customer price, payment data, and unauthorized stage transitions cannot be overwritten by a field request.
- Installer continuity: PostgreSQL shift, hours, mileage, opt-in work location, and personal payroll history were not deleted. They now render as `Рабочий день` in the installer menu inside the actual legacy CRM.
- Verification: 150 automated tests passed; TypeScript passed; production build passed and no longer contains `/survey`, `/installer`, `/legacy-crm/survey`, or `/legacy-crm/installer` page bundles. Local route smoke confirmed the reported `/legacy-crm/survey/notifications` and old `/installer/today` addresses return 308 to `/legacy-crm`. No production record, employee account, password, shift, location, payroll, client, or order was changed.
- Release: branch `codex/remove-duplicate-field-shell` was reviewed and fast-forwarded to `main` as `f70355f99c76d32d4ee563a1ecb57b721f62cfe3`. GitHub CI run #33697488074 passed and production deploy run #33697612449 succeeded.
- Production smoke: the exact reported address `/legacy-crm/survey/notifications` and old `/installer/today` both return 308 to `/legacy-crm`; the public build exposes only the actual `/legacy-crm` page and no longer builds the deleted field shells. An unauthenticated request remains protected. No live employee session was used to change records.
- Next action: refresh/sign in through the public `/legacy-crm`, then perform one controlled visual check with mapped surveyor and installer accounts to confirm assigned records and `Рабочий день` without changing live customer data.

## 2026-09-12 handoff — canonical Project / Solar measurement constructor

- Scope: PR #169 completes issue #164 and supersedes the smaller foundation PR #161. One canonical Project now carries independent B2B/B2C customer classification, Residential/Commercial site type, multiple service positions, and service-level default films.
- Solar V1: the existing `/legacy-crm` shell now contains one compact Projects section for owner, manager, and assigned surveyor. It supports room templates, openings, French Window/French Door overall dimensions and cells, glass construction/strength/Low-E details, removal per cell, and film inheritance from service through room/opening/cell.
- Data integrity: PostgreSQL records source/status as `CUSTOMER`/`UNVERIFIED` or `SURVEYOR_VERIFIED`/`VERIFIED`; revisions preserve the prior measurement and a verified measurement cannot be replaced by customer data. Project, position, film category, source, revision, duplicate-cell, and role access checks are enforced on the server.
- Film selection: compatibility is evaluated from the existing `FilmCatalog.allowed_glass_types`, `restricted_orientations`, `requires_review`, and selection note fields. The catalog also receives explicit technology, appearance, application-side, and capability taxonomy. Safety A2 is corrected to 14 mil.
- Storage and permissions: the new section reads and writes canonical PostgreSQL APIs only; it does not create a second shell, second editor, or browser-storage source of truth. Assigned surveyors receive the operational constructor without project finance and can submit only verified measurements.
- Verification: Prisma schema validation and client generation passed; 210 automated tests passed; TypeScript passed; the real legacy inline script compiled in regression coverage; production build passed; `git diff --check` passed. The worktree has no live `DATABASE_URL`, so no migration was applied to any database.
- Branch / PR: `codex/issue-164-project-constructor` / #169 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/169`).
- Release: not deployed. Review #169 and GitHub CI first; merge and deploy only through the normal release workflow, then verify the migration and role-scoped Project screens in a controlled production smoke test.

### 2026-09-12 correction — structured film selection

- User review found that New Order still showed one combined value such as `RolanPRO — Smart Vision Prime`. PR #169 now replaces that control with three cascading fields: film category, product name, and model.
- Example identity is preserved exactly as `Зеркальная → Prime → NE2`; the service direction remains separate. The selected final model still resolves to one existing catalog ID.
- Existing catalog entries are migrated in place without changing IDs. Orders save category/name/model snapshots in addition to the catalog ID so later catalog edits do not erase what was sold.
- The same structure is available in order parameters and catalog management. Missing legacy model codes are displayed as `Модель не указана` instead of inventing a value.
- Final UI correction: the same cascading fields now apply to the Solar service default and every room, opening, and cell override. The New Order form no longer contains the explanatory sidebar, workflow pills, long introductory copy, or redundant field guidance; only actionable validation messages remain.
- New Order correction: site type is now a required independent choice (`RESIDENTIAL` or `COMMERCIAL`). The legacy measurement workspaces use it to show the matching residential-room or commercial-area presets, and the selected value is carried through the canonical proposal into the launched PostgreSQL Project.
- Multi-service film correction: New Order renders one film card for every selected service. Smart, Solar, Safety, and Decorative cards are filtered to their own existing catalog category and each independently selects `Серия / категория → Название → Модель`; the order persists the exact catalog ID and snapshots in `materialsByService`, while the primary-service fields remain for backward compatibility. The selected service film becomes the default for that service's measurement rooms.
- Lead attribution correction: New Order now captures one incoming service rather than treating every project service as a marketing origin. Managers add or remove cross-sold services inside the same project without changing `leadIntentServiceType`. The current-month report groups leads by frozen source + incoming service and reports cross-sell separately. Canonical launched Projects preserve the source and incoming ServiceType through a new relational migration.
- Verification: 219 automated tests pass, including the real legacy script compilation, immutable lead-intent guards, monthly service attribution, cross-sell separation, proposal propagation, and canonical Project persistence. GitHub CI generated the Prisma client, passed TypeScript, and completed the production build on commit `ab31ca7`. The local Prisma CLI did not complete on this host, but the same required Prisma generation passed in the clean CI environment.

### 2026-09-14 correction — strict Residential / Commercial measurement structure

- Project creation now presents the property choice explicitly as `Residential · жилой · комнаты дома` or `Commercial · коммерческий · офисы и зоны`; it remains independent from B2B/B2C.
- Both legacy and canonical measurement workspaces use site-specific terminology and presets. Residential receives home rooms only; Commercial receives offices and commercial zones only.
- Backend validation rejects a room template that belongs to the other site type. After a typed Project has measurements, its site type is locked so existing rooms cannot be reclassified into offices, or offices into home rooms.
- Release: PR #169 merged to `main` as `21d304a4af149172f9d5faea4325ceb248c0bd79`. Main CI run #34933721970 passed Prisma generation, 220 tests, TypeScript, and the production build. Production deploy run #34933844649 succeeded and confirmed that the server is serving the same commit.
- Production smoke: the public login responds successfully and `/legacy-crm` remains session-protected. No customer, order, measurement, film, or employee record was edited during smoke verification.

### 2026-09-15 correction — add service from the Project

- The canonical Project no longer keeps a permanent service dropdown on the page. Owner and manager use one `+ Добавить услугу` button, then choose from a compact list containing only services not already present in that Project.
- The selected service is still added as an existing `ProjectPosition` through the canonical PostgreSQL API. The incoming lead service remains unchanged, and no second order or Project is created.

### 2026-09-15 correction — confirmed Smart catalog and controls

- Smart-film selection now uses confirmed Rolan PRO lines: MS (Mitsubishi) with Vision 85/89/95, AR (Arshi · China) with Vision A-85/B-88/C-92, and decorative variable-pattern models DEC-SMART 1/2/3. Generic placeholder PDLC models are archived from new selection while historical references remain readable.
- Films, power supplies, and control options are separate records. The six confirmed power supplies are Rolan Control 50W, 100W, 200W, 300W, 500W, and 1000W. Wi-Fi, multi-zone, voice, Google Home, Amazon Alexa, Apple Home, and wall switches are selectable control options.
- The owner stated that eight power-supply variants and three manufacturers exist, but only six supply models and two named manufacturer lines plus the decorative line were identified. The two missing supply models and any separate third manufacturer remain intentionally unseeded until their exact names are confirmed.
- This correction extends PR #172. Prices and unprovided technical specifications remain empty/zero rather than being invented. Production deployment remains a separate release action.
- Verification on commit `1b8c07a`: all 226 tests passed locally; GitHub CI run #35043142443 generated Prisma, passed tests and TypeScript, and completed the production build. No production deployment was started.

### 2026-09-15 correction — commercial office glass partitions

- Commercial measurement spaces now offer `Офисная стеклянная перегородка` as a separate opening category alongside windows, doors, storefronts, and skylights. It persists as `glass_partition` with its own dimensions, panes/cells, glass characteristics, removal flags, and film inheritance.
- The manager measurement workspace shows the new add-element category only when the order site type is `COMMERCIAL`. Canonical backend validation rejects `glass_partition` for a `RESIDENTIAL` Project.
- This correction extends PR #172. Existing measurements and Residential choices remain unchanged; production deployment remains separate.

### 2026-09-15 correction — per-window film removal and proposal readiness

- Every measured window/door/partition card now has a distinct `Удаление плёнки` toggle separate from the destructive `Удалить окно` action. Selected windows contribute their measured sqft to one automatically maintained removal service line using the existing configured removal rate; changing dimensions or quantity recalculates that line.
- The selected room/office card now exposes its service-scoped film selector directly and shows the chosen brand/model in the room list. A room-level `Удаление плёнки со всех окон` checkbox applies the same existing opening flag to every opening of the active service; per-window checkboxes remain available for exceptions.
- The canonical opening editor also has one action to select removal for every cell in the opening while retaining per-cell control.
- Fixed the false `есть окна без размера` proposal blocker: `measureAllWindows()` returns `{ room, win }`, and readiness now validates `win` rather than the wrapper. Positive planned dimensions are also used when stale legacy actual dimensions are zero.
- Verification after the room-control correction: all 244 automated tests passed, TypeScript passed, and the production build completed locally.
- This correction extends PR #172. Existing measurements migrate without deletion, and production deployment remains separate.

### 2026-09-15 correction — measurement screen position is stable during editing

- Measurement actions that rebuild the modal now capture the active scroll containers before changing modal state and restore them synchronously and again on the next animation frame after layout settles.
- Browser scroll anchoring is disabled only inside the manager measurement modal because that workspace uses explicit keyed scroll restoration. Selecting film, toggling removal, changing dimensions, adding an opening, or switching an opening type must no longer jump the screen to the top.
- Verification: the local preview remained on the second window after its removal checkbox rebuilt the modal; all 245 automated tests, TypeScript, and the production build passed locally.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-15 correction — project calculation is usable on phones

- The Project calculation modal now converts material, additional-service, and direct-expense tables into labeled stacked rows below 840px instead of retaining a 720px minimum width.
- Inputs and selects use the full available row width, destructive actions have explicit full labels, section actions become full-width touch targets, and the sticky approval footer stacks its actions without horizontal clipping.
- The responsive breakpoint is aligned with the modal shell at 840px, preventing a mobile modal from containing the desktop table. Visual verification at a 390×844 phone viewport showed labeled material rows and both footer actions fully inside the screen.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-15 correction — preliminary customer dimensions versus verified field dimensions

- A manager may create and price a Project from dimensions supplied by the customer. Those windows are stored as `CUSTOMER / UNVERIFIED`, remain clearly marked as preliminary, and do not block calculation or proposal generation.
- Every measured window has an explicit action to confirm exact dimensions. Editing width, height, or quantity after confirmation returns that window to preliminary status; a field-measurement v2.5 import is recorded as `SURVEYOR_VERIFIED / VERIFIED` with provenance.
- Installation scheduling and every later production status are blocked until all active windows have positive, verified exact dimensions. Existing Projects already in installation or completed stages are migrated as verified so historical workflows are not broken.
- This correction extends PR #172. It stays inside the existing Project measurement history and does not authorize an automatic production deployment.

### 2026-09-15 correction — manager calculation is customer pricing, not company accounting

- The manager calculates the Project before creating the proposal: measured sqft, selected material, sale price per sqft, billable add-ons, and the customer total remain available.
- Purchase/material cost, installer and team cost, marketing, direct company expenses, production cost, profit, and margin are owner-only. The manager Project workspace and payment card do not render those fields, and the old expanded form is owner-only.
- Project material cost now follows the cut plan and consumes the proportional purchase cost of fitting warehouse lots (narrowest fitting width, oldest receipt first). Catalog cost is used only for an unpriced lot or shortage. Rates continue to come from the reference settings, and the Project calculator no longer asks for manual marketing spend.
- The default weekly Calendar is now a dispatcher workspace modeled on TintWiz's operational pattern: hourly week grid on the left and the same filtered visits on the map on the right. Events show time, work type, responsible employee, customer and address; overlapping visits receive separate lanes; map pins retain event identity and time; employee and work-type filters update both views together. It continues to use the existing Project/order events and geocache rather than introducing a second calendar store.
- Hidden internal expenses do not block proposal readiness. They remain attached to the same Project for owner accounting instead of becoming manager inputs or another entity.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-16 correction — owner Project profitability from one operational record

- The existing Project calculation now provides one compact operational summary: selected services and films, measured glass sqft, calculated film consumption, billable add-ons, assigned installers, warehouse material cost, and crew pay. It does not introduce another calculator, Project, or storage record.
- Installer labor now comes from each assigned employee's pay configuration and service-category rates. Until a crew is assigned, the estimate keeps a labor reserve from the owner-managed category defaults instead of treating labor as zero. Payroll reuses the same per-employee calculation.
- Owner-only direct Project expenses include delivery, one-off material purchases, helpers/subcontractors, hired specialists, tools/equipment, and the existing categories. These remain separate from recurring company OpEx.
- The management profit view calculates customer revenue minus direct Project cost, then allocates the active fixed monthly OpEx equally across all revenue-bearing Projects in that Project's operating month. A configurable California corporation tax reserve is allocated by revenue share and shown separately from actual tax payments.
- The default planning profile is California C corporation at 8.84% with the $800 annual minimum reserve. Owner may switch to the California S corporation planning rate of 1.5% or a custom rate. This is explicitly a management estimate; tax filings and paid cash remain in accounting.
- Verification: all 251 automated tests passed, TypeScript passed, and the production build completed locally. At a 390×844 viewport the Project calculation had no horizontal overflow; the fast summary, financial cards, tax settings, and approval footer remained within the phone screen.
- This correction extends PR #172. Production deployment remains a separate action.

### 2026-09-16 release correction — fast Project intake and company break-even settings

- The primary new-Project action now creates the same lifecycle record and immediately opens the existing room/office measurement workspace. `Сохранить черновик` remains available when dimensions are not ready; no second order, estimate, or storage record is created.
- Owner Settings now has one focused `Постоянные расходы и безубыточность` section backed by the existing `db.opex` plan data. It accepts recurring company obligations, shows monthly/daily fixed burn, and calculates required Projects and sqft per month.
- Break-even now excludes personal plans, variable expenses, and tax plans. It uses completed Projects when available and otherwise labels the result as preliminary from calculated Projects, so the owner can begin planning before the first completed month.
- Existing role boundaries were rechecked: owner retains company P&L and settings; manager can create, measure, price, and prepare the customer proposal without internal cost/profit; surveyor and installer remain limited to assigned work and never receive company financial totals.
- Verification: all 253 automated tests passed, TypeScript passed, and the production build completed locally. Branch / PR: `codex/project-add-service-button` / #172. The owner explicitly requested the production CRM update; next action is CI, merge to `main`, automatic production deploy, and a read-only smoke check.

### 2026-09-16 correction — quick Project line items do not require dimensions

- The prior primary action that opened measurements immediately was incorrect. New Project now opens the existing Project calculation with a seeded line for the selected incoming service; the manager can quote before any room, office, opening, or dimension exists.
- A quick line records service direction, the service-scoped existing catalog item, quantity, unit, sale price per unit, derived customer total, and owner-only catalog cost per unit. `+ Добавить услугу` adds Solar, Smart, Safety, or Decorative lines to the same Project; it does not create another order, calculator, catalog, or storage root.
- Film choices remain restricted to the selected service category and display the existing Category → Name → Model catalog identity. The same quick lines are published as individual Proposal items. Exact measurements remain mandatory only for production documents and installation release.
- No Prisma schema change is required for this correction: it changes the active legacy Project compatibility payload and Proposal projection while preserving existing relational `ProjectPosition` work from issue #164. A separate database entity or parallel migration would violate the one-Project decision.
- Verification: all 254 automated tests passed, TypeScript passed after the production build generated Next.js types, and the production build completed locally. Branch / PR: `codex/quick-project-line-items` / #173. Production deployment remains separate.

### 2026-09-16 correction — salaries, manager commission, and advertising reserve

- Owner Settings → `Постоянные расходы и безубыточность` now has one explicit compensation/cost model: owner salary $3,000/month, surveyor salary $4,000/month, assigned-manager commission 5% of Project gross revenue, and advertising reserve 10% of Project gross revenue.
- Salaries are fixed monthly company obligations and enter the monthly break-even pool. Manager commission and advertising are variable Project PSS costs; they are calculated automatically from `orderRevenue()` and are not requested from the manager on every Project.
- The previous seeded daily advertising plan is deactivated by an idempotent compatibility migration so the 10% reserve is not counted again as fixed OpEx. Surveyor percentage is set to zero because the approved compensation model is monthly salary.
- Employee pay cards now show and calculate salary per month rather than per week. The Settings model keeps the manager and active surveyor/owner pay configurations synchronized with the same percentages and salaries.
- Implemented as an extension of PR #173. Production deployment remains separate.

### 2026-09-16 correction — quick Project cost comes from Warehouse and Payroll references

- The fast Project service row now contains only manager-owned commercial inputs: service, an in-stock film, quantity/unit, and customer sale price. Manual material cost and manual installation price were removed from that row for every role.
- Film choices are restricted to the selected service category and to catalog items with a positive Warehouse roll balance. The selector shows current metres and approximate sqft; an old selected item remains readable after its stock reaches zero but cannot pass Proposal readiness.
- Preliminary material cost without dimensions is calculated from the remaining value and area of priced Warehouse purchase lots, including the catalog waste percentage. A Project cannot be approved when the selected quantity is not covered by stock with a recorded purchase price.
- Preliminary installer cost without dimensions is calculated from the assigned employee's Payroll category rate. Until installers are assigned, the existing owner-managed category defaults remain the reserve. Quick lines no longer contribute a second embedded service cost.
- Existing quick-line `unitCost` and `cost` compatibility fields are removed during the idempotent legacy-state migration. No second catalog, warehouse, payroll table, Project, or storage root was introduced.
- Verification: all 258 automated tests passed, standalone TypeScript passed, and a clean production build completed after regenerating the Prisma client.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains separate.

### 2026-09-16 correction — separate Quick Project Entry and reference-owned service costs

- The prior embedded quick-entry table inside `Расчёт проекта перед КП` was incorrect. `Быстрый ввод проекта` is now a separate compact window opened from the Project card and immediately after choosing the calculation path while creating a Project.
- The separate window writes service, in-stock film, sqft, and sale price into the same Project compatibility record. `Расчёт проекта` remains the approval and profitability workspace; no second Project, calculator entity, shell, or storage root was introduced.
- The visible `Услуги` reference and the Project service rows now contain customer pricing only. Material cost comes from priced Warehouse lots; film/installation and additional-work pay come from employee Payroll rates. Direct one-off purchases remain Project expenses.
- Employee Payroll cards now support per-unit rates for washing, removal, silicone, electrical work, connection, warranty, and custom work. Those rates are included automatically in Project installer cost.
- Verification: all 261 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains a separate action.

### 2026-09-16 correction — service-owned installer rate

- The owner clarified that each film service must include `Монтажнику / sqft` directly in the `Услуги` reference. This supersedes the immediately preceding rule that Services contain customer prices only.
- Film material cost still comes only from priced Warehouse lots. The service installation rate is the default payroll accrual for both measured openings and quick Project sqft; employee Payroll rates remain optional individual overrides.
- Built-in employee category rates are cleared by an idempotent migration so they do not silently mask the service rate. Genuine non-default employee overrides remain unchanged.
- The same canonical `installation_cost_per_sqft` field already used by relational Projects is restored in the `/legacy-crm` Services UI and synchronized into the compatibility Project calculator. No new entity or storage root is added.
- Verification: all 261 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains separate.

### 2026-09-16 correction — quick import by Project total

- `Быстрый ввод проекта` now matches the minimum data available from the former CRM: service direction, in-stock film, total sqft, customer-facing Project total, and Project installers.
- For every service row, sale price per sqft is derived automatically from total divided by sqft. Existing rows that were originally entered by price per sqft remain readable and retain their previous calculation until the total is edited.
- Every service row now has required start and end dates. Invalid reversed ranges are rejected; the service period is preserved in Proposal data, and the latest quick-service end date supplies the profitability month when no actual installation date exists.
- Installer assignment is available inside the same compact window. The Project calculator continues to derive film COGS from Warehouse lots and installer accrual from the service/employee reference; neither cost is entered manually during import.
- Multi-service rows continue through the existing Project revenue, Proposal, payroll, PSS, fixed-expense allocation, and management-profit formulas. No new database entity, storage root, or alternate calculation pipeline was added.
- Verification: all 264 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`. Production deployment remains separate until explicitly authorized.

### 2026-09-17 correction — per-service executors, film and supplies in Quick Project Entry

- Quick Project Entry now assigns installers on each service row instead of once for the whole Project. The Project card keeps the union only for compatibility and permissions; payroll uses the actual row assignments and splits one row only among its selected installers.
- The owner can add a new installer without leaving the row. The server account is created with its linked compatibility-card ID, the local employee card appears immediately, and it is selected for that service after the one-time password step.
- Each service row can select Warehouse supplies, set used quantities, or create a new supply with current stock and purchase cost. Supply purchase cost is included in PSS and profit without prematurely issuing inventory.
- A new film can be created in the same row using `brand → film category → product name → model`, plus the roll's width, length, lot, retail price, and actual purchase cost. The action writes the existing FilmCatalog and Warehouse receipt structures and immediately selects the new film.
- New Project quick rows and migrated old rows receive independent `installerIds` and `supplyItems`; no second Project, catalog, Warehouse, employee directory, shell, or storage path was introduced.
- Verification: all 268 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`, PR #174. Production deployment remains separate until explicitly authorized.

### 2026-09-17 correction — one-step closure for completed former-CRM projects

- The owner can now finish a historical import inside `Быстрый ввод проекта` with `Закрыть как выполненный и оплаченный`; no window dimensions or parallel import entity are required. Direct delivery, purchase, helper, subcontractor, tools, rental, permit, and other expenses can be recorded in the same window before closing.
- The action uses service start/end dates and a selected payment date/method, records full payment and completion milestones, approves the Project estimate, and preserves the existing payroll, PSS, monthly fixed-cost, California-tax, and net-profit calculations.
- The close action requires valid service data, assigned installers, film purchase cost, and valid dates. Because the material was consumed before import, it neither checks today's stock quantity nor deducts today's Warehouse; normal active-Project approval remains strict about available priced stock.
- No automatic customer notification is sent for the historical event. The Project carries explicit import flags and audit-timeline notes.
- Verification: all 275 automated tests passed after merging the latest `main`, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`, PR #174. Production deployment remains separate until explicitly authorized.

### 2026-09-15 architecture correction — Order and Project are the same customer job

- Product rule: one canonical PostgreSQL `Project` survives unchanged from calculation through Proposal, payment, installation, and completion. Closing the sale changes its stage; it must not create a second job record.
- The visible navigation is now consolidated as one `Проекты` workspace, but legacy `db.orders` and relational `Project` are still separate and unsynchronized behind that interface. Finishing the consolidation still requires a tested stable-ID/data migration and one PostgreSQL write path.
- PR #172 must not be treated as the final entity-consolidation release. It may supply the Project fields and permissions, but the duplicate launch/list workflow remains migration work. No production deployment is authorized.

## 2026-09-23 handoff — reset Project data and allow manager manual film

- Owner request: empty all CRM Project/order data and let a manager type a film manually when it is missing from the selectable Warehouse list.
- Branch: `codex/reset-projects-manual-film`.
- Project reset migration: `20260923182500_reset_project_data_only`. It deletes relational Projects and dependent execution rows, clears legacy `payload.orders`, removes only installer work sessions tied to deleted Project jobs, and preserves leads, clients, deals, proposals, consultations, users, catalog, services/pricing, Warehouse and independent employee shifts.
- Quick Project Entry now accepts `manualFilmName`. This lets owner/manager save and quote the film name without creating fake Warehouse stock. New Warehouse film creation remains owner-only.
- A manual film is emitted to Proposal output as a film item, but historical completion is blocked until the line is mapped to a real catalog/Warehouse film so material cost cannot silently remain unknown.
- Verification and release: PR #196 merged to `main` as `d6643933c6f7503c865c0c72ef57882fc42df338`; PR CI #423 and main CI #424 both passed tests, TypeScript, and production build. Production deploy #405 completed successfully. The production watcher applies `prisma migrate deploy` before activating a release and writes the active release only after migration, seed, build, and health checks succeed; therefore the one-time Project reset migration completed before `d6643933` became active.

## 2026-09-23 handoff — Messenger booking SMS + booking visibility

- Owner reported two production symptoms: the bot implied phone follow-up but no SMS arrived, and the booked appointment was not obvious in CRM.
- Root cause confirmed in code: Facebook booking already created the canonical `Lead -> CalendarEvent -> Consultation -> Survey` chain, but `onConsultationScheduled` only created an internal consultant notification; no Twilio send was called.
- Branch: `fix/messenger-booking-sms`.
- Fix: after the booking transaction commits, CRM sends the confirmation through the existing Twilio `sendSms` service, records source/kind/consultation metadata on the Twilio message, and writes a dedicated `integration.facebook_messenger.booking_sms` activity receipt.
- Repeated Meta webhook delivery is protected by a PostgreSQL advisory lock plus the successful SMS receipt, so a confirmed SMS is not sent twice. A failed SMS does not roll back the already-created booking; CRM records the error and creates an unread manager notification.
- New Facebook bookings also create a manager-facing CRM notification `Новая запись из Facebook`. The appointment itself remains a Consultation/Calendar event, visible under `Клиенты -> Замеры` and `Расписание`, not as a Project.
- Worker response now reads `sms_confirmation.status` from CRM. It says SMS was sent only for `sent` / `already_sent`; otherwise it tells the customer to keep the Messenger confirmation.
- Worker logs `crm_booking_confirmed` with lead ID, consultation ID, and SMS status for production diagnosis.
- Verification pending CI, merge/deploy of CRM, and a controlled real Messenger booking smoke test. Worker source deployment remains a separate Cloudflare release action.

## 2026-09-24 handoff — canonical Messenger consultations in the active calendar

- Production diagnosis confirmed that Messenger created canonical Consultation `39be9261-0f86-4dce-8179-23eeb9cf71eb`, CalendarEvent `6476f790-8367-4bde-9ad4-62c27bbafdcf`, and the related Survey before sending SMS. The booking is for Zafar at `385 Sherman Way, Los Angeles`, scheduled for 2026-09-24 10:00–11:00 America/Los_Angeles, assigned to Alan with Danil as manager.
- Root cause: `/legacy-crm` is the only visible CRM, but its calendar read only `LegacyWorkspace.payload.orders`; the canonical PostgreSQL consultation API and the hidden modern consultation page were not represented in that calendar.
- Fix: `/legacy-crm` now loads the existing role-scoped `/api/v1/consultations` feed during cloud startup and projects each Consultation into the existing day/week/month calendar and map at render time. It does not copy canonical consultations into the legacy payload or add another storage path.
- Clicking a canonical event opens a compact `Запись из Messenger` card with customer, date/time, address, service, surveyor, and status inside the same CRM shell.
- Verification: all 299 automated tests passed, TypeScript passed, the production build passed, and `git diff --check` passed.
- Branch / PR: `fix/messenger-consultations-calendar-20260924` / #200.
- Next action: merge #200, wait for the standard production deployment, refresh `/legacy-crm`, open `Календарь`, and confirm the 10:00 Zafar event and detail card.

## 2026-09-24 handoff — canonical Messenger leads in the active inbox

- Owner clarified that a Messenger booking must appear immediately in the visible `Новые лиды` section, not only in Calendar.
- Root cause: the active legacy inbox only read the retired external lead-backend queue and could even show `Сервер лидов не подключён`, while the bot already created the authoritative PostgreSQL Lead.
- Fix: `/legacy-crm` now reads the role-scoped `/api/v1/leads` feed, shows active `facebook_messenger` leads including `CONSULTATION_SCHEDULED`, joins the matching Consultation for address/time/surveyor, and refreshes the visible inbox every 10 seconds.
- A booked Messenger card opens its canonical Consultation. It does not create a duplicate legacy Project or copy canonical leads into `LegacyWorkspace.payload`.
- Verification: all 301 automated tests passed, TypeScript passed, the production build passed, and `git diff --check` passed.
- Branch: `fix/messenger-new-leads-20260924`.
- Live verification after #201 confirmed the Zafar card appears. Because the same Lead has both an older 08:00 test Consultation and the real 10:00 Consultation, the first release selected the earlier list item. Follow-up branch `fix/messenger-new-leads-latest-booking` selects the latest active Consultation and ignores cancelled/deleted records.
- Live verification after the latest-booking release confirmed the card shows 10:00 and Sherman Way. A final follow-up fixes its button to call the existing canonical Consultation card action used by Calendar.

## 2026-09-24 handoff — Russian Messenger service recognition

- Root cause: the Worker depended on the language model to extract the service and its fallback parser checked Russian `защит` before `солнц`. Therefore `солнцезащитная плёнка` could be stored as Safety Film or remain missing, causing the same generic qualification message to repeat.
- Fix: the latest raw customer message is now parsed deterministically for Solar, Smart, Safety, and Decorative Film wording. Solar is resolved before Safety, and an explicit current message corrects a stale model classification. The exact reported typo `услга солнцезащитная пленка` resolves to `Solar Film`.
- Dialog correction: when the model tries to claim a booking before all required facts exist, the Worker asks only for the next missing field. After recognizing the service it asks for Residential/Commercial, then the address/city, rather than requesting service, property type, and address again.
- Verification: all 303 tests passed, including the exact reported phrase and all four service families; TypeScript, production build, Worker dry-run, and `git diff --check` passed. GitHub PR CI also passed tests, TypeScript, and production build.
- Release: PR #204 merged to `main` as `73fd7bef887f23292b1df017ec70e7e0e187b452`. Cloudflare Worker `rolanpro-bot` deployed as version `bef48a14-24c6-4d84-95f9-c39e6f0e9103`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names were present before and after deployment; no secret value was printed or changed. The live endpoint returned the expected protected `403` response to an unsigned GET.
- Next action: send `услуга солнцезащитная пленка` in the existing Messenger chat, answer the single next question, select a real CRM slot, and confirm the booking appears under `Новые лиды` and Calendar.

## 2026-09-24 handoff — multilingual Messenger booking

- The assistant now detects the latest customer's language, stores it as a BCP-47 language tag, replies naturally in that language, and changes languages when the customer does. The prompt explicitly prevents unnecessary transliteration.
- Worker-owned messages no longer fall back permanently to English outside Russian, English, and Spanish. Slot offers, missing-field questions, booking/SMS confirmations, and failure messages are translated through the existing protected Anthropic integration; dates and times use the customer's locale.
- Language normalization covers standard BCP-47 tags and common names for German, French, Portuguese, Italian, Ukrainian, Polish, Turkish, Arabic, Hebrew, Persian, Hindi, Chinese, Japanese, Korean, Vietnamese, Russian, Spanish, and English. Other valid BCP-47 languages pass through generically rather than requiring a hard-coded list.
- Verification: all 304 tests passed, including German, French-Canadian, Arabic, and Chinese language normalization; TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #206 merged to `main` as `8da58b1389a32dfefc074587dea785eb3b589454`. Cloudflare Worker `rolanpro-bot` deployed as version `dd14f10f-8ebe-4cc4-b905-81b6f4752fbe`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: use an internal Messenger account to send one German and one Arabic message, complete the qualification questions, and confirm slot and booking confirmations stay in the selected language.

## 2026-09-24 handoff — fast human-like film consultant

- Root cause of the reported hang: after a confirmed booking, the KV conversation remained in `booked`. A later product question could be interpreted as a slot claim; the Worker then emitted `Проверяю свободное время в CRM`, deliberately skipped a second slot lookup because the customer was already booked, and never sent a follow-up.
- State fix: the real application stage is now passed to the assistant. An already-booked customer receives a normal follow-up consultation answer unless they explicitly ask for another appointment/address. The qualification override is disabled for booked conversations, and the dead-end CRM-check text is removed.
- Consultant behavior: the assistant answers the customer's actual product question first, asks at most one relevant follow-up, and does not force every message into a booking form.
- Product knowledge: the Worker now carries the verified Magnitronic Solar Prime SP-5%, SP-15%, SP-20%, SP-35%, SP-50%, and SP-70% range, 2026 measured VLT/UV/IR/TSER figures, glass-compatibility limits, daytime/nighttime privacy guidance, professional-installation positioning, and the owner-provided lifetime-warranty statement constrained to eligible installations and written terms.
- Speed: customer chat and operational translation use active `claude-haiku-4-5-20251001`, history was reduced from 20 to 12 messages, output was reduced from 1,000 to 500 tokens, and latency/status telemetry is recorded without message contents or PII. Anthropic's official customer-support guidance identifies Haiku 4.5 as the latency-optimized choice.
- Verification: all 305 tests passed, including the exact already-booked qualification guard; TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #208 merged to `main` as `e75dc88f8f75a19bdefadc88f6c6a8d8d2c8afe7`. Cloudflare Worker `rolanpro-bot` deployed as version `93c64342-935b-4d81-ad48-89bc8cd2ba4c`.
- Binding safety: `CHAT`, the CRM URL, and the protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: in the same Messenger chat, ask `Расскажи про солнцезащитную плёнку и какую выбрать?`; confirm the answer explains the line and asks one diagnostic question. Then request another appointment explicitly only if a second booking is desired.

## Completion rule

### 2026-09-15 correction — one Projects workspace

- Owner and manager navigation now contains one `Проекты` entry instead of separate `Заказы` and `Проекты` entries. New work is labeled `Новый проект`, and the funnel, cards, primary actions, and project intake use the same lifecycle language.
- The canonical PostgreSQL constructor remains available from the Projects workspace as `Проверенные замеры`; it is a measurement tool inside the project, not a second customer-job list.
- Compatibility is preserved: legacy `orders` keys, `#/order/...` links, `R-...` numbers, and `Заказ-наряд` documents are not deleted or rewritten. The relational ID/data migration is still required before legacy storage can be retired.
- Verification: all 240 automated tests pass locally. GitHub CI run #35055402899 generated the current Prisma client, passed the complete test suite and TypeScript, and completed the production build on commit `3d3b146`.
- Branch / PR: `codex/project-add-service-button` / #172. No production deployment was started.

### 2026-09-15 correction — Google Maps in the dispatch calendar

- The calendar/map workspace now uses Google Maps as its primary map. Project visit markers, customer/address details, calendar filters, and the existing route line remain attached to the same Project events.
- `/legacy-crm` receives the restricted browser key from protected server environment configuration (`GOOGLE_MAPS_BROWSER_API_KEY`, with the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as compatibility fallback). The key is not committed to Git or written into CRM storage.
- If the key is absent, rejected, or Google Maps cannot load, the existing Leaflet map remains an operational fallback instead of breaking Calendar.
- This correction extends PR #172. Production deployment remains a separate release action.

### 2026-09-15 correction — one readable dispatch workspace

- The Day view no longer repeats the same events across KPI cards, an agenda card, and four appointment-type lanes. It now uses one 06:00–21:00 timeline beside the map.
- The Week view uses the same operating model with seven time columns. The calendar receives the primary width; the map is a narrower route-planning context. Month remains a compact calendar with an optional map.
- Date navigation, Day/Week/Month mode, event filter, employee filter, event count, and `+ Назначить` are consolidated into one two-row command bar. Decorative legends and empty dashboard cards were removed from the main scheduling surface.
- The implementation follows the official TintWiz scheduler pattern relevant to Rolan PRO: calendar and map side by side, filtering by appointment/team member, and scheduling against the existing Project. It does not copy TintWiz data or create another scheduling entity.
- Desktop visual verification passed at 1920×1080 for Day and Week in the local preview. This correction extends PR #172; production deployment remains a separate action.

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.

## 2026-09-14 — Mobile measurement viewport repair

- Owner: Codex; branch `codex/mobile-measurement-workspace`, based on current `main`.
- Scope: the existing legacy measurement editor; one mobile scroll surface, compact title/services/progress, collapsible summary, footer in document flow, accessible room inputs.
- Verification: 189 automated tests passed; TypeScript passed; production build passed; inline scripts compile. Independent agent review identified adapter overrides, field focus IDs, details state, and horizontal scroll restoration; all addressed.
- Blocker: browser rejected both local preview URLs with ERR_BLOCKED_BY_CLIENT. Actual mobile rendering, keyboard interaction, and server persistence are NOT verified. Do not claim mobile acceptance or production completion.
- Next action: review dedicated branch/PR, test the injected legacy route at 375/390/430px and desktop with keyboard and save/reopen, then release through main after CI. Not merged or deployed.
