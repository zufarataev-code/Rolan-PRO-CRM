# ROLANPRO CRM — Decision Log

This file records durable decisions. Current activity, blockers, and next steps belong in `PROJECT_STATE.md`.

## 2026-08-24 — One cross-device source of truth

- GitHub repository `zufarataev-code/Rolan-PRO-CRM` is the shared project source.
- `main` is the only canonical code branch and the only production deployment source.
- `PROJECT_STATE.md` is the required live handoff for devices, chats, agents, and contributors.
- Chat history, agent memory, browser state, and unpushed local branches are not authoritative.
- Every task uses a short-lived branch and records its exact handoff in `PROJECT_STATE.md`.

## 2026-08-24 — One CRM data source

- PostgreSQL is the only target source of CRM business data.
- Browser/local storage may be used only as a disposable cache, never as an independent record store.
- Legacy `LegacyWorkspace.payload` data must be mapped and migrated before legacy write paths are disabled.
- Existing customer and order data must be preserved and verified during migration.

## 2026-08-24 — One operational workflow

- Canonical lifecycle: `Deal -> Consultation / Survey -> Measurement -> Proposal -> Agreement / Deposit -> Project`.
- There will be one active editor for measurement, one for proposals, and one Project record.
- Public/print proposal views are outputs from the canonical proposal record, not separate proposal engines.
- Legacy duplicates become read-only before removal.

## 2026-08-24 — Financial visibility

- Surveyors and installers must not see project totals, selling prices, costs, margins, commissions, or other financial data.
- Authorization must be enforced by server responses, not only by hiding interface elements.

## 2026-09-01 — Credential-bound sessions and one-time password recovery

- Authenticated sessions are bound to the user's current canonical email and a one-way fingerprint of the current password hash.
- Changing the user's password or login email invalidates every previously issued session automatically.
- An authenticated password change issues exactly one fresh session for the new credentials so the employee can continue working without preserving older sessions.
- Password-reset links are bound to the current user ID, email, and password hash and are consumed with an atomic compare-and-swap database update.
- Concurrent reuse of one reset link must have at most one successful password change; all later or racing attempts fail as already used/invalid.
- These rules were introduced by security hotfix PR #99 after the post-merge review of PR #98 identified session-revocation and concurrent-token-consumption P1 findings.

## 2026-09-01 — One canonical service price list and role-safe planning

- PostgreSQL `ServiceType` and `ServiceAddon` records are the only canonical price list for calculator and proposal flows; the legacy CRM links to this editor instead of creating another pricing store.
- Owners and managers may add services and change customer-facing prices. Only owners may view or change material costs, installer rates, block costs, company overhead, target profit, and margin assumptions.
- Break-even is a planning forecast, not cash truth. It is calculated from monthly overhead, average catalog contribution margin, average deal value, and lead-to-deal conversion.
- The manager receives actionable revenue, deal, and lead targets without receiving internal cost fields. The owner dashboard receives the full financial signal.

## 2026-09-02 — Installer daily operations and explicit work tracking

- The installer application is a role-specific workspace inside the canonical Rolan PRO CRM, not a second CRM or a downloadable HTML file.
- PostgreSQL stores installer shifts, work minutes, mileage, job-linked payroll accruals, and work-location history.
- Payroll accrues when an installer job is completed, using the job's sqft, saved installer rate, and complexity multiplier. Accrued and paid remain separate states.
- Precise location tracking is explicit and work-bound: the installer enables it when starting a shift, it stops when the shift ends, and the interface states that the app must remain open. Hidden continuous off-shift tracking is not permitted.
- Installers may see only their own work history and own payroll accruals. Owners and managers may see current team work status and the last consented work location; customer prices and company margin remain hidden from installers.

## 2026-09-02 — One owner/manager interface

- This decision supersedes the UI-routing part of `One canonical service price list and role-safe planning`: the canonical PostgreSQL price list remains unchanged, but owner and manager pricing no longer opens a separate modern shell.
- `/legacy-crm` is the single owner/manager operating interface while legacy business records are being migrated. Canonical PostgreSQL modules must open as sections inside that interface, not appear as a second CRM.
- `Услуги и цены` and `Монтажники сейчас` render inside `/legacy-crm`. Old direct modern-shell URLs redirect to the matching section of the main CRM so bookmarks do not break.
- Removing a duplicate interface must not delete canonical PostgreSQL pricing, payroll, installer, or planning data.

## 2026-09-02 — One CRM interface for every employee role

- This decision extends and supersedes the role scope of `One owner/manager interface`: `/legacy-crm` is the single visible Rolan PRO CRM namespace for owner, manager, surveyor, and installer.
- Surveyors work at `/legacy-crm/survey`; installers work at `/legacy-crm/installer`. Old `/survey` and `/installer` links are compatibility redirects and must not present another CRM shell.
- One interface does not mean one unrestricted payload. Owner/manager may load the legacy operating workspace; field-role pages continue to read only their assigned PostgreSQL records through server-enforced role filters.
- Surveyors and installers keep their focused mobile workspaces and must not receive customer prices, company costs, margins, or the complete legacy workspace payload.
- All role workspaces use the same Rolan PRO identity and primary CRM visual language so an employee never appears to enter a different product.
- Implemented and released by PR #110 (`codex/one-crm-all-roles`).

## 2026-09-02 — Voice input belongs to the future agent

- The standalone floating `Голосовой ввод` control is removed from the legacy CRM and every modern employee page.
- Voice interaction may return only as part of the unified CRM agent, with a clear workflow and permissions, not as an unrelated global microphone button.
- This does not remove Google Voice telephony, call history, or the customer-facing Smart-film `Voice Control` service; those are separate business capabilities.
- Implemented and released by PR #112 (`codex/remove-voice-button`).

## 2026-09-02 — Field roles use the actual CRM shell, not a look-alike

- This decision supersedes the route/UI part of `One CRM interface for every employee role`: putting a second React shell under an address beginning with `/legacy-crm` does not make it the same CRM.
- Owner, manager, surveyor, and installer all enter the actual `/legacy-crm` document. The separate surveyor and installer page trees and their role shells are removed; every old nested employee URL is only a compatibility redirect to `/legacy-crm`.
- Field roles receive a server-generated subset of the legacy workspace containing only explicitly assigned orders, their linked clients, and operational reference data. Customer prices, payments, costs, margin, company finance, unrelated customers, and other employees' compensation are removed before the response leaves the server.
- Field saves may merge only operational order fields such as measurements, status, technical notes, photos, checklists, and installation timestamps. They cannot overwrite assignments, customer price, payment data, or the full workspace.
- Canonical PostgreSQL work-session, mileage, opt-in location, and installer payroll history stay available as the `Рабочий день` section inside the real CRM; removing the duplicate interface does not remove those records or capabilities.

## 2026-09-04 — Sales closes before the operational project is launched

- This decision refines and supersedes the old mixed sales/operations lifecycle. A lead/deal remains a sales object while the customer is being estimated, surveyed, quoted, followed up, or nurtured. Operational project statuses do not continue the sales pipeline.
- The fast service calculator is a sales tool. Saving a quick estimate does not create a `Project` and does not assign a project number. A manager explicitly converts an estimate/survey into a Proposal when it is time to send a formal quote.
- The canonical sales close condition is BOTH: the client has signed the Agreement AND the required Deposit has been recorded as paid. At that point the Deal becomes `CLOSED_WON` and the manager receives the explicit next action `Запустить проект`.
- Creating a `Project` is an explicit operational launch after the sale is closed. Only this action creates the `PRJ-...` project number. Customers who are still thinking remain in sales/nurture statuses and retain follow-up tasks instead of appearing in Projects.
- One Project may contain multiple operational phases. Each phase has its own planned date range, client-confirmation state, services/positions, crew, and one or more installers. A single Project is not limited to one installation date or one service date.
- The public customer package is one canonical Proposal output, not separate document engines. The client receives one link/package containing the commercial proposal, agreement/signature flow, approved warranty terms, and payment instructions.
- Preferred payment methods are Zelle and bank transfer with no processor fee. If the client deliberately chooses the online payment-system option, the server applies the configured processing fee (initial business setting: 3.5%) and shows the fee and resulting total before payment. The browser may not calculate or override this fee.
- Bank account and Zelle details are operational secrets/configuration and must never be committed to Git. They are supplied from protected server configuration/settings.
- Existing/historical projects may be imported through an owner-only migration/history path, but the normal manager workflow cannot bypass the signed-agreement + paid-deposit launch gate.

## 2026-09-05 — No secondary CRM shell and onboarding-only app install

- This decision reinforces `One owner/manager interface` and `Field roles use the actual CRM shell, not a look-alike`: `/legacy-crm` is the only visible CRM shell for owner, manager, consultant, and installer.
- `/owner/*` and `/manager/*` are compatibility URLs only. They must redirect to `/legacy-crm` and may not render a separate navigation/header that looks like another CRM.
- Historical modern pages and their server/API logic may remain temporarily during migration, but `OwnerShell` and `ManagerShell` are non-visual compatibility wrappers and must not create a second product surface.
- The canonical `/legacy-crm` response must not inject floating shortcuts that send users to a secondary owner/manager shell.
- PWA registration remains global so the service worker can function, but there is no persistent `Установить Rolan PRO` button inside CRM.
- App installation is offered only as a one-time onboarding step after a successful first login on a browser where the offer has not already been handled. Accepting or dismissing the offer marks it seen so it does not keep covering the CRM.

## Changing a decision

Do not silently overwrite an earlier decision. Add a new dated section that names the superseded decision, explains why it changed, and links the implementing PR.