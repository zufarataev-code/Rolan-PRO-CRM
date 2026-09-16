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

## 2026-09-12 — Canonical Project constructor and auditable Solar measurements

- This decision extends `One CRM data source`, `One operational workflow`, and `Field roles use the actual CRM shell`: the Project constructor is a section of the existing `/legacy-crm` document backed only by relational PostgreSQL APIs, not a second shell or browser-storage editor.
- Customer classification (`B2B`/`B2C`) and physical site type (`RESIDENTIAL`/`COMMERCIAL`) are independent facts. One Project may contain multiple service positions; each position may define its default film.
- Solar rooms, openings, and cells are the structured view of canonical Measurement records. Opening/cell identity and technical details live in versioned constructor metadata, while project-position ownership, author, source/status, and revision links are relational and constrained.
- Measurement provenance is explicit: customer data is `CUSTOMER` + `UNVERIFIED`; a surveyor record is `SURVEYOR_VERIFIED` + `VERIFIED`. Revisions append records instead of overwriting measurements, and unverified customer data may never supersede a verified measurement.
- Effective film resolves in this order: cell override, opening override, room override, service default. Solar compatibility is advisory (`OK`, `REVIEW`, `NOT_RECOMMENDED`) and must be derived from canonical FilmCatalog compatibility fields; the browser cannot declare compatibility itself.
- Owners and assigned managers may configure the Project and services. Assigned surveyors may read only their scoped projects and create verified measurements; server responses must not expose project finance to them.
- Implemented for review by PR #169 (`codex/issue-164-project-constructor`), which supersedes the foundation PR #161. Production deployment remains a separate, reviewed release action.

## 2026-09-12 — Film identity is Category → Name → Model

- A film is not presented or stored as one concatenated `brand — model` choice. Its business identity is three separate catalog dimensions: film category/appearance (for example `Зеркальная`), product name/line (for example `Prime`), and exact model code (for example `NE2`).
- The service direction (`Solar`, `Smart`, `Safety`, or `Decorative`) remains a separate filter and must not be mislabeled as the film category.
- Order creation, order parameters, the Solar service default, and room/opening/cell overrides use cascading Category → Name → Model selectors but persist one exact catalog ID plus the applicable display snapshots. Existing orders and catalog IDs remain valid.
- Legacy catalog records are extended in place with `filmCategory`, `productName`, and `modelCode`; no second material list is created. Canonical PostgreSQL uses the corresponding FilmCatalog appearance/category, model name, and model code fields.
- Obvious selectors must not be surrounded by instructional paragraphs. The New Order screen uses compact service cards and short field labels; explanatory copy is shown only for an actionable warning or validation failure.
- New Order requires an explicit physical site type. This value is never inferred from B2B/B2C, controls the room/location presets in legacy measurement entry, and is propagated through the canonical Proposal into the launched Project.
- Added to PR #169 after review of the New Order screen. Production deployment remains a separate action.

## 2026-09-13 — Film selection is scoped per service

- This decision refines `Film identity is Category → Name → Model`: a multi-service order never uses one shared film choice and never exposes the complete film catalog in a service picker.
- New Order renders one independent film card for every selected service: Solar sees only Solar catalog records, Smart only Smart, Safety only Safety, and Decorative only Decorative.
- Within each service card, film identity remains `Серия / категория → Название → Модель`. The order stores one exact existing catalog ID and display snapshot per service in `materialsByService`; no duplicate film catalog is created.
- The first selected service remains the legacy primary service only for backward compatibility. Measurement defaults resolve from the active service's saved film, so a multi-service Project cannot accidentally inherit another service's material.
- Added to PR #169 after New Order review. Production deployment remains a separate reviewed release action.

## 2026-09-14 — Incoming lead intent is not the project service list

- This decision refines `Film selection is scoped per service`: New Order records exactly one immutable incoming service — the offer or problem that caused the customer to contact Rolan PRO.
- A project's operational service list is separate and mutable. A manager may add Smart, Solar, Safety, or Decorative work without rewriting the incoming service or creating another order/project.
- Marketing statistics count the lead once under its captured source and incoming service. Cross-sold services and their revenue remain part of the same project and are measured separately; they do not reclassify the original Google Ads intent.
- The legacy order keeps an intake snapshot for the current operating workflow. When the sale launches a canonical Project, PostgreSQL stores `lead_source` and the relational `lead_intent_service_type_id`; Project positions continue to represent the services actually sold.
- Google Ads conversion delivery must use the original click/campaign attribution and stable conversion events. This change preserves the required service identity but does not claim to upload offline conversions to Google Ads.
- Added to PR #169. Production deployment remains a separate reviewed release action.

## 2026-09-14 — Site type owns the measurement-space vocabulary

- This decision refines `Canonical Project constructor and auditable Solar measurements`: `RESIDENTIAL` and `COMMERCIAL` are not display tags; they select two separate measurement structures.
- Residential projects use home-room templates and room terminology. Commercial projects use office/commercial-zone templates and matching terminology. Neither list is inferred from B2B/B2C, and a template from one structure is rejected for the other by the backend.
- The first site type may be assigned to an imported Project whose type is missing. Once a typed Project contains measurements, switching its site type is rejected to prevent mixed room/office history.
- Added to PR #169. Production deployment remains a separate reviewed release action.

## 2026-09-15 — Smart film, power supply, and controls are separate catalog dimensions

- This decision refines `Film identity is Category → Name → Model`: the selected Smart film remains a FilmCatalog record, while its Rolan Control power supply is a Smart service add-on and Wi-Fi/multi-zone/voice/ecosystem/wall-switch choices are control options. None of those components may be concatenated into one material name.
- The confirmed Smart film lines are Rolan PRO MS (Mitsubishi), Rolan PRO AR (Arshi · China), and the decorative variable-pattern DEC-SMART line. Exact models are stored independently and the picker remains scoped to Smart only.
- Unknown commercial prices, specifications, the two unnamed members of the stated eight-model power-supply range, and any unnamed third manufacturer must remain unset. Catalog maintenance may add them only after their exact identity is confirmed; the implementation must not infer plausible wattages or names.
- Existing generic Smart placeholder records are retained for historical references but archived from new-order selection. This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Office glass partitions are commercial openings

- This decision refines `Site type owns the measurement-space vocabulary`: an office glass partition is a first-class `glass_partition` opening in a Commercial space, not an ordinary window and not a room type.
- It uses the same canonical measurement facts as other glass openings—overall dimensions, cells/panes, glass construction and treatment, removal, provenance, and film inheritance—but is not offered for Residential Projects.
- Existing records remain valid. This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Film removal is selected at the measured opening

- This decision refines `Canonical Project constructor and auditable Solar measurements`: removal is an attribute of each measured window/opening or its individual cells, not a second measurement list and not an ambiguous global checkbox.
- Selecting removal contributes that opening's measured sqft to the project's removal service calculation. The window-removal action and the destructive delete-window action must remain visually and semantically distinct.
- Proposal readiness must validate the effective positive dimensions of the actual window record. A zero or stale legacy `actualWidth`/`actualHeight` cannot override newly entered positive planned dimensions and falsely block the proposal.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Customer dimensions may price a proposal but may not release production

- This decision refines `Canonical Project constructor and auditable Solar measurements`: `CUSTOMER / UNVERIFIED` dimensions are valid commercial inputs for calculating and issuing a proposal. They must remain visibly preliminary and retain their provenance.
- Closing the sale does not silently convert customer dimensions into exact dimensions. Before installation can be scheduled or any production status can begin, every active opening must have positive `SURVEYOR_VERIFIED / VERIFIED` dimensions.
- Changing width, height, or quantity invalidates the prior verification and the saved estimate until it is reviewed again. Existing completed or in-production legacy records are preserved through an idempotent compatibility migration.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## Changing a decision

Do not silently overwrite an earlier decision. Add a new dated section that names the superseded decision, explains why it changed, and links the implementing PR.
