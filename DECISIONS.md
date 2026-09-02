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

## Changing a decision

Do not silently overwrite an earlier decision. Add a new dated section that names the superseded decision, explains why it changed, and links the implementing PR.
