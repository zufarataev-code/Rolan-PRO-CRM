# ROLANPRO CRM — Decision Log

This file records durable decisions. Current activity, blockers, and next steps belong in `PROJECT_STATE.md`.

## 2026-09-30 — Client identity, correspondence, objects, and portal access are separate concerns

- A client card represents one person or company. B2C stores first/last name; B2B additionally stores company, company type, representative, and job title.
- Legal and mailing/correspondence addresses belong to the account. Project/service addresses belong to the client's reusable address book; one account may have multiple objects and one primary object.
- A company is not automatically a permanent partner. Partnership remains an explicit relationship choice.
- A client or partner cabinet is optional. Owner or Manager must create access deliberately; the link carries a high-entropy per-client token and can be reissued or revoked. A client ID alone never grants cabinet access.
- Cabinet chronology is a read-only projection of the existing Project/order timeline. It is not a second history store and must never expose internal material cost, payroll, profit, margin, or company accounting.

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
- The room/office checkbox is a bulk editing control over those same opening attributes for the currently selected service. It does not store a separate room-level removal charge, and individual openings may still be changed afterward.
- Selecting removal contributes that opening's measured sqft to the project's removal service calculation. The window-removal action and the destructive delete-window action must remain visually and semantically distinct.
- Proposal readiness must validate the effective positive dimensions of the actual window record. A zero or stale legacy `actualWidth`/`actualHeight` cannot override newly entered positive planned dimensions and falsely block the proposal.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Customer dimensions may price a proposal but may not release production

- This decision refines `Canonical Project constructor and auditable Solar measurements`: `CUSTOMER / UNVERIFIED` dimensions are valid commercial inputs for calculating and issuing a proposal. They must remain visibly preliminary and retain their provenance.
- Closing the sale does not silently convert customer dimensions into exact dimensions. Before installation can be scheduled or any production status can begin, every active opening must have positive `SURVEYOR_VERIFIED / VERIFIED` dimensions.
- Changing width, height, or quantity invalidates the prior verification and the saved estimate until it is reviewed again. Existing completed or in-production legacy records are preserved through an idempotent compatibility migration.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Manager calculates the customer offer; owner controls internal economics

- The Project calculation is the required source for the Proposal. A manager may edit measured quantity, selected material, sale price, customer-facing add-ons, and the final customer amount.
- Material purchase cost, payroll, marketing, direct expenses, production cost, profit, and margin are internal company economics visible and editable only by the owner. They must not appear as manager Project fields or block the manager from preparing a complete Proposal.
- Project material cost is calculated from the cut plan and the actual purchase cost of suitable warehouse lots. The catalog `costPerSqft` is only a fallback when a lot has no recorded cost or stock is short. Installer and operating rates come from owner-managed reference settings; managers never re-enter them in a Project. Marketing attribution belongs to lead-source reporting and is not a manual Project estimate input.
- Scheduling follows one dispatch model: a work event belongs to the existing Project, carries its visit type, exact time, responsible employee(s), customer and object address, and is rendered simultaneously in the weekly time grid and on the map. Calendar cards and map pins are two views of the same event, never copied jobs or a second scheduling store. The interaction model is based on the proven calendar-plus-map workflow studied in TintWiz, while Rolan PRO keeps its own UI, data and implementation.
- This is a permission boundary inside the same Project, not a separate estimate, order, accounting Project, or duplicated storage record.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Order and Project are one lifecycle record

- This decision supersedes the record-creation boundary in `Sales closes before the operational project is launched`. A customer job is not converted into a second Project after the sale; accepting the Proposal and receiving the deposit change the stage of the same record.
- `Project` is the canonical database entity and `Заказ` is its user-facing name in the CRM. Measurements, service positions, Proposal, agreement, payments, scheduling, installation, payroll links, and history belong to that one record.
- A Lead/Deal may exist before a real customer job is opened, but the normal workflow may not create parallel Order and Project records or separate browser-storage and PostgreSQL versions of the same job.
- The existing legacy `orders` and modern `Project` split is migration debt, not the target architecture. It must be consolidated with stable ID mapping and data preservation before the duplicate navigation and launch path are removed.

## 2026-09-15 — One visible Projects workspace

- This decision refines the navigation portion of `Order and Project are one lifecycle record`: owner and manager see one `Проекты` entry, one project funnel, one creation action, and one project card from intake through completion. A separate `Заказы` menu is not allowed.
- `Проект` is the visible lifecycle term in the main CRM. `Заказ-наряд` remains the correct name for the installation work document; technical `orders` keys and historical `R-...` identifiers remain compatibility details until the data migration is complete.
- The PostgreSQL measurement constructor is exposed as `Проверенные замеры` inside the Projects workspace, not as another competing Projects/Orders navigation item.
- This UI consolidation does not claim that legacy `db.orders` has already been migrated into relational `Project`. Stable ID mapping and the single PostgreSQL write path remain required before the compatibility store can be removed.
- Implemented for review in PR #172. Production deployment remains a separate action.

## 2026-09-15 — Dispatch Calendar uses the configured Google map

- This decision refines the calendar/map portion of `Manager calculates the customer offer; owner controls internal economics`: the visible dispatch map in `/legacy-crm` uses Google Maps as its primary map provider.
- The browser key is supplied by protected server environment configuration and must be restricted in Google Cloud by the production domains and required Maps APIs. It is not Project data and must not be persisted in the legacy CRM payload or committed to Git.
- Calendar cards, Google map markers, filters, addresses, and route geometry remain views of the existing Project events and geocache. Changing the map provider does not create another calendar, route store, shell, or customer-job entity.
- Leaflet remains a resilience fallback only when Google Maps is unavailable. This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Calendar is a scheduling surface, not a dashboard

- This decision refines `Manager calculates the customer offer; owner controls internal economics`: the Calendar must prioritize time, availability, assignee, customer, address, and route. Revenue summaries and repeated appointment-type KPI cards do not belong above the schedule.
- Day and Week share one model: a chronological time grid beside the map. Day has one daily timeline; Week has seven day columns. Month is for date scanning and may reveal the map only on request.
- Appointment type and employee are filters over the same Project events. They must not create separate consultation, survey, installation, or complaint boards and must not duplicate those events into another store.
- The interaction model intentionally follows the proven TintWiz scheduler principles documented by TintWiz: side-by-side calendar/map, appointment and team-member filters, and scheduling an assignee against an existing Project. Rolan PRO retains its own UI, terminology, permissions, Project model, and implementation.
- Implemented for review in PR #172. Production deployment remains a separate action.

## 2026-09-15 — Measurement editing preserves operator position

- The legacy manager measurement workspace may rebuild its HTML to keep totals, film, and removal calculations current, but those rebuilds must preserve the active room, focused field, vertical position, and horizontal service/room strip positions.
- The measurement modal uses explicit keyed scroll restoration, so browser scroll anchoring is disabled within that modal to prevent a second competing adjustment after render.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-15 — Project calculation uses labeled mobile rows

- Wide estimate tables remain tables on desktop, but on phone widths each data row becomes a compact labeled record. Horizontal table scrolling is not an acceptable primary interaction for setting prices or internal expenses.
- Every mobile field retains its business label, destructive actions use complete phrases, and the proposal confirmation action remains reachable without horizontal overflow.
- This correction is implemented in PR #172 and does not authorize an automatic production deployment.

## 2026-09-16 — Project gross profit and management net profit are distinct

- This decision refines `Manager calculates the customer offer; owner controls internal economics`: the same Project calculation owns the fast operational input and the owner profitability view. It must not create a parallel financial Project, manual material list, or duplicate payroll record.
- Project gross profit is customer revenue minus direct material from warehouse lots, employee labor from the team reference, billable-service cost, and explicit direct Project expenses. Recurring monthly OpEx is not a direct Project cost and is shown only as a separate management allocation.
- Active fixed business OpEx is divided equally across the revenue-bearing Projects in the Project's operating month. This answers the owner's planning question without presenting a planned expense as an actual paid cash transaction.
- California income/franchise tax is a configurable planning reserve, not tax filing output. The default C corporation profile uses 8.84%, the S corporation option uses 1.5%, and the annual minimum reserve is $800. Actual entity treatment, federal tax, deductions, and paid amounts remain the accountant's and accounting module's responsibility.
- Installer cost and payroll share one source: the employee pay configuration by service category. Before assignment, the category reference rate is retained as a labor reserve so an incomplete staffing decision cannot falsely inflate Project profit.
- Implemented for review in PR #172. Production deployment remains a separate action.

## 2026-09-16 — Break-even uses fixed company obligations and the same Project margin

- This decision refines `Project gross profit and management net profit are distinct`: the break-even numerator is active fixed business OpEx only. Personal plans, variable Project expenses, and tax planning reserves must not be mixed into fixed company burn.
- Recurring expense settings and the Money workspace edit the same `db.opex` plan records. Adding a planned obligation does not create an actual cash transaction; real payment is recorded separately in Money.
- Break-even uses the margin of completed Projects when that history exists. Before then, the CRM may show a clearly preliminary result from calculated revenue-bearing Projects so the owner can start operating without a fake zero or invented benchmark.
- Fast intake remains a continuation of the same Project: after client, site type, incoming service, and manager are selected, the primary action opens the existing site-specific measurement workspace. A draft is a state of that Project, not another entity.
- Implemented in PR #172 for the production release requested by the owner.

## 2026-09-16 — Quick Project intake is line-item pricing before measurement

- This decision supersedes the final `Fast intake` paragraph in `Break-even uses fixed company obligations and the same Project margin`. The primary New Project action must not force the manager into rooms, windows, or dimensions.
- A manager first enters simple commercial lines inside the same Project: service, catalog position, quantity, unit, and sale price per unit. Each Project may contain multiple service directions, and every film picker is filtered to that line's service category while reusing the existing FilmCatalog Category → Name → Model identity.
- Line totals are derived as quantity × unit price. Catalog cost is an owner-only preliminary internal value. Detailed room/opening measurements later provide production truth; they remain required before technical sheets, cutting, and installation, but not before preliminary calculation or Proposal.
- Quick lines are a compatibility projection of Project service positions, not another Order, estimate, material catalog, or browser-storage root. The public Proposal preserves each line rather than collapsing the Project into one anonymous service total.
- Implemented on `codex/quick-project-line-items` in PR #173. Production deployment is a separate release step.

## 2026-09-16 — Fixed salaries and revenue-based costs use different bases

- Owner compensation of $3,000/month and surveyor compensation of $4,000/month are fixed company payroll obligations. They belong to the monthly break-even pool and are allocated across the month's revenue-bearing Projects; they are not charged in full to every Project.
- The assigned manager earns 5% of the Project's gross customer revenue. Advertising planning reserves 10% of that same gross revenue. Both are variable direct Project costs and reduce gross margin before fixed-cost allocation.
- The advertising percentage replaces the old seeded daily advertising plan. Keeping both active would double count marketing, so compatibility migration deactivates the old plan while preserving it for history.
- Managers do not enter payroll or advertising manually in Project calculation. Owner controls this model in `Настройки → Постоянные расходы и безубыточность`; individual employee cards reuse the same compensation values.
- Implemented in PR #173. Production deployment remains a separate action.

## 2026-09-16 — Warehouse and Payroll are the only quick-Project cost sources

- This decision supersedes the sentence `Catalog cost is an owner-only preliminary internal value` in `Quick Project intake is line-item pricing before measurement`. A Project service row must never ask a manager or owner to re-enter material cost or installation price.
- The row owns only customer-facing commercial input: service direction, an existing in-stock FilmCatalog item, quantity/unit, and sale price. The selectable film list is the intersection of the service category and current Warehouse roll balances.
- Preliminary material COGS is derived from actual Warehouse lot receipts: remaining roll value divided by remaining priced area, multiplied by the Project sqft and the catalog waste factor. Missing purchase price or insufficient priced stock blocks calculation approval instead of silently substituting a manually entered line cost.
- Installer labor is derived from the assigned employee's Payroll configuration by film category. Before assignment, the owner-managed category defaults are the reserve. These references are edited in Warehouse purchasing and employee Salary settings, not inside each Project.
- Quick entry is an estimate and does not reserve or issue stock. Actual roll deduction remains tied to production/installation flow and measured cutting data. No parallel inventory, payroll, catalog, or Project entity is permitted.
- Implemented in PR #173. Production deployment remains a separate action.

## 2026-09-16 — Quick Project Entry is a separate workflow window

**Supersedes:** the PR #173 presentation that placed quick line entry as section 1 inside the full Project estimate.

- `Быстрый ввод проекта` is a separate compact modal for service, Warehouse film, sqft, and customer sale price. It updates the same Project and then hands off to `Расчёт проекта` for review, internal economics, and Proposal approval.

### 2026-09-27 — superseded: quick entry is not a live project workflow

- The decision above is retained as history but no longer governs new Projects. A parallel quick-entry path allowed a Proposal to be prepared without the rooms, openings, dimensions, and material selection required by the operating workflow.
- The only live Project path is now: client and property → service → measurement → estimate and Proposal → client acceptance and deposit → production preparation (verified dimensions, cut plan, material and stock) → installation → act and payment.
- New Projects no longer create quick lines or expose a quick-entry button. Historical quick-entry records remain stored and readable only for compatibility; they are not accepted as the basis of a new estimate or Proposal.
- The `Услуги` reference owns customer prices only. It must not ask for material cost, installer cost, or add-on cost. Warehouse purchase lots own film cost; employee Payroll cards own installation and additional-work rates; Project expenses own one-off delivery, purchases, helpers, and subcontractors.
- This separation is presentation and responsibility ownership, not a new business entity. One Project remains the customer job from intake through Proposal, installation, payment, and completion.
- Implemented in PR #173. Production deployment is not authorized by this decision.

## 2026-09-16 — Services own the default installer rate

**Supersedes:** the same-day statement that `Услуги` owns customer prices only and all labor rates belong exclusively to employee Payroll cards.

- Each film service has one owner-editable `Монтажнику / sqft` value using the existing canonical `installation_cost_per_sqft` field.
- That service rate is the default installer accrual for quick and measured Project quantities. Employee Payroll category/base rates are optional individual overrides, not duplicated mandatory setup.
- Film purchase cost remains owned by Warehouse lots. Additional-work rates remain in employee Payroll, and one-off purchases/helpers/subcontractors remain Project expenses.
- Implemented in PR #173. Production deployment remains a separate authorized action.

## 2026-09-16 — Imported quick Projects use total sale price as the input

**Supersedes:** the quick-entry presentation in `Quick Project intake is line-item pricing before measurement`, where sale price per unit was the primary input.

- The old CRM export may contain only service, total sqft, and the customer-facing total for a Project service. Quick Project Entry therefore accepts the service total and derives sale price per sqft as `total / sqft`.
- Existing quick lines that were entered by price per sqft remain compatible. Once an operator enters the total, that total remains the commercial source while sqft changes recalculate the derived unit price.
- Installers are assigned in the same compact window at Project level. Their accrual is still calculated from service/employee reference rates and sqft; managers do not type labor cost into the Project.
- Every quick service row owns its own required start and end dates. The end cannot precede the start; the latest service end supplies the management reporting month when no actual Project installation date exists.
- Multiple service rows still belong to one Project and feed the existing revenue, Warehouse material cost, payroll, margin, Proposal, and management-profit calculations. No import-only Project or parallel calculator is created.
- Implemented on `codex/quick-project-total-and-installers`; production deployment remains a separate release action.

## 2026-09-17 — Quick Project operations belong to each service row

**Supersedes:** the same-window rule above that assigned installers only at Project level.

- Each quick service row owns its required installers, start/end dates, Warehouse film, sqft, customer total, and optional Warehouse supplies. The Project-level installer list is only a compatibility union of those row assignments.
- Installer accrual is calculated only from the sqft of services assigned to that employee. If several installers share one service, that service's accrual is divided among them; unrelated service rows do not affect their pay.
- The owner can create an installer from a service row. Creation writes the canonical server account and its linked legacy card together, assigns that card to the current service, and returns to Quick Project Entry after the one-time password is recorded.
- A missing film can be created inline only with its service direction, brand, film category, product name, model, actual roll dimensions, and purchase cost. The same action creates a FilmCatalog item and a Warehouse receipt; it does not create a second film list.
- Supplies can be selected from Warehouse or created inline with unit, stock quantity, and purchase cost. Their used quantity contributes to Project profitability, while actual stock issue remains a later Warehouse operation, consistent with film stock behavior.
- Implemented in PR #174. Production deployment remains a separate authorized action.

## 2026-09-17 — Completed legacy jobs close inside Quick Project Entry

- A completed job from the former CRM does not need fabricated room/window dimensions or a replay of every live funnel transition. The owner can close it directly from Quick Project Entry after entering its actual services, film, sqft, sale totals, dates, installers, supplies, and direct expenses.
- Closing records full payment, installation start/end, act/payment/completion milestones, the approved estimate snapshot, payroll, PSS, fixed-expense/tax allocation, and management profit on the same Project.
- Historical closure requires purchase-cost references but does not require today's Warehouse balance to cover material already consumed in the past and does not issue today's stock. This exception applies only to the explicit completed-import action; active Project approval keeps its normal stock sufficiency checks.
- Historical closure never sends automatic client messages. It is an owner-only accounting import action and is marked in the Project audit trail.
- Implemented in PR #174. Production deployment remains separate until explicitly authorized.

## 2026-09-23 — Managers may use a manual film label before warehouse mapping

- Quick Project Entry may accept a manager-entered film name when the required film is not yet available in the Warehouse-backed catalog.
- A manual film label belongs only to that Project service line; it does not create a FilmCatalog item, a Warehouse roll, purchase cost, or inventory movement.
- Selecting a real Warehouse film clears the manual label. A manually entered film is still published to the customer Proposal as a film line.
- Final historical closure is blocked until a manual film is mapped to a real Warehouse/catalog item, so project profitability cannot silently treat unknown material cost as zero.
- Creating a new film and Warehouse receipt from Quick Project Entry remains an owner action.
- Implemented for review on `codex/reset-projects-manual-film`.

## 2026-09-23 — One-time reset removes Projects but preserves sales and reference data

- The owner authorized a one-time reset of Project data. The reset removes relational Projects and dependent execution records plus the legacy `orders` array.
- Leads, clients, deals, proposals, consultations, users, catalog, services/pricing, and Warehouse/reference data are preserved.
- Project-linked installer work sessions are removed; independent employee shifts remain.
- Shared lead/deal calendar history and consultations are preserved with their Project link detached rather than deleted.
- The migration is transactional and aborts if protected sales/reference row counts change or Project postconditions fail.
- Implemented for review on `codex/reset-projects-manual-film`.

## 2026-09-24 — Google Ads learns only from verified CRM outcomes

- CRM sends server-side first-party conversion events through Google Data Manager; no Google credential, OAuth token, or customer identifier is stored in browser code.
- `CONSULTATION_SCHEDULED` is the recommended Qualified Lead milestone for Rolan PRO. A confirmed consultation may create this signal from a Lead before a Deal exists; a bot statement without a PostgreSQL consultation never qualifies.
- Converted Lead remains the canonical `CLOSED_WON` outcome and uses the CRM sale value only after the signed-agreement and paid-deposit gate.
- Every event uses a stable transaction ID, a durable outbox, explicit consent handling, retry-safe delivery, and asynchronous request-status confirmation. HTTP acceptance alone is not recorded as final Google success.
- Live uploads require owner configuration plus separate environment gates. Automated processing uses a dedicated server-to-server bearer secret of at least 32 characters and returns no customer PII or credentials.
- Implemented for review in PR #140; deployment and live activation remain separate steps.

## 2026-09-24 — One calculation basis and semantic workspace sizes

- A Project calculation has one active commercial basis at a time. Verified or preliminary room/window measurements take precedence over compatibility quick-entry drafts; when measurements exist, stale quick lines do not contribute revenue, costs, readiness checks, or Proposal positions.
- Quick-entry stock and purchase-cost checks remain blocking when quick entry is the active basis. This preserves Warehouse-backed profitability and does not weaken the active-Project inventory rule.
- Dialog width is chosen by workflow density, not by incidental CSS order. Compact forms keep the generic dialog size, intake uses the wide size, and measurement/project workspaces use the full desktop workspace size while retaining the existing mobile full-screen behavior.
- A Proposal action remains available to an authorized owner/manager before approval so it can route to the calculation and explain the exact missing data. Approval and publishing still require a valid calculation.
- Employee creation must surface the canonical API error and must never create an account if any requested role is absent from the server role directory.
- Implemented on `fix/legacy-crm-workspace-architecture`; production deployment remains a separate release action.

## 2026-09-25 — The standard owner kanban fits all stages on a wide workstation

**Supersedes:** the standard Projects-board presentation that always used seven fixed 296px columns and horizontal scrolling.

- At a 1920px owner workstation, the normal Projects view must show all seven canonical stages at once. A hidden sixth or seventh stage is not an acceptable default when enough screen width exists.
- At 1800px and wider, the board uses seven equal `minmax(0, 1fr)` tracks inside the available CRM content area. Cards, labels, fields, and actions are allowed to wrap inside their own stage, but the board itself does not extend beyond the workspace.
- On smaller desktops and phones, preserving a readable stage width is more important than squeezing seven unusable columns together. Those layouts remain an explicit horizontal stage scroller.
- All dialogs and shared form controls retain a zero intrinsic minimum width so long values cannot force an otherwise responsive workspace beyond its container.
- Implemented on `fix/full-crm-visual-architecture-audit`; the PR and production verification are recorded in `PROJECT_STATE.md`.

## 2026-09-25 — Proposal entry and installation scheduling are separate stages

**Supersedes:** the 2026-09-17 rule that active quick-entry service rows require installers and work dates before Proposal preparation.

- Quick Project Entry is a compact commercial form: service, Warehouse film, total sqft, and total customer price. It derives price per sqft and must not ask for a crew or installation dates before the customer accepts the Proposal.
- Proposal readiness reports the exact missing commercial fields. A selected film with zero sqft and zero customer price is reported as missing sqft and price, not as a generic missing-film error.
- The crew and installation date are selected through the existing `Монтаж` action after Proposal acceptance. That scheduling action copies the selected crew and start date to quick service rows so canonical installer payroll remains service-based.
- Per-service dates, installers, supplies, and direct historical closure remain available only inside a collapsed owner-only section for importing already completed work from the old CRM.
- Implemented on `fix/quick-entry-proposal-workflow`; the PR and production verification are recorded in `PROJECT_STATE.md`.

## 2026-09-26 — Mobile and desktop have functional parity

- A phone layout is not a separate or reduced CRM. Every role must receive the same authorized business functions, actions, and records on phone and desktop; only presentation, navigation density, and interaction layout may differ.
- `/legacy-crm` remains the one visible CRM document. Mobile shortcuts call the same existing `selectAppView()` routes and `renderView()` modules used by desktop.
- The mobile bottom dock contains only frequent role-specific shortcuts. `Ещё` opens the complete existing sidebar so no authorized module, Settings entry, profile context, or logout action is lost on a phone.
- Responsive adapters may stack fields, convert tables into labeled rows, preserve touch targets, apply safe areas, and center focused inputs above the keyboard. They may not replace the full application with a smaller API-specific shell.
- This decision supersedes the dedicated reduced mobile shell previously introduced for PR #248. The correction was later fast-forwarded to `main` with owner authorization and released as recorded in `PROJECT_STATE.md`.

## 2026-09-26 — Phone and email identify an existing client account

- A normalized phone number or normalized email may belong to only one client card. Formatting differences in a US phone number, email letter case, and Gmail dot or `+alias` variations do not create a new identity.
- Client creation, Lead conversion, Project creation, proposal publication, CSV import, and legacy workspace writes must reuse the existing client card when either identity matches. A contact edit that would collide with another card is rejected.
- The Project keeps its own job address and commercial snapshot. Reusing a client must not overwrite established account details merely because a new Project or Lead supplied a different display value.
- PostgreSQL creation paths serialize writes by normalized identity before checking and creating. The legacy workspace performs the same identity check in the browser and rejects newly introduced duplicate pairs on the server.
- Existing historical duplicate pairs are not silently merged or deleted. They remain readable until a separately reviewed merge workflow resolves their linked Projects, Deals, communications, and audit history.

## 2026-09-26 — Supplier purchasing extends the existing Warehouse workflow

- Supplier cards, manufacturer catalog links, Warehouse stock, reorder thresholds, and purchase requests remain fields of the existing canonical legacy CRM payload while that Warehouse module is active. A second supplier/procurement schema or browser-only store is not permitted.
- Manufacturer catalog seeds contain only products and characteristics confirmed by an official manufacturer source. Stable internal IDs are allowed for CRM linking, but unknown dealer SKU, purchase price, warranty, payment terms, and lead time stay empty until Rolan PRO receives them directly.
- Low stock may create a purchase-request draft automatically, but it may never contact a supplier automatically. One active general-stock request per item/vendor suppresses duplicates; receipt or cancellation allows a later reorder draft.
- Sending a supplier request is an explicit Owner/Manager action through the authenticated Resend procurement channel on the separate sending subdomain, never the client Google Workspace mailbox. The purchase-request ID is the provider idempotency key, and a draft becomes requested only after confirmed API success. When no official email is published, CRM opens the official contact path and preserves the unsent draft.
- Field roles do not receive vendor, inventory-cost, or purchase-request data. Phone and desktop use the same procurement records and actions, with only responsive presentation differences under the mobile parity decision.
- Implemented on `codex/supplier-catalog-procurement` in PR #253; release state is recorded in `PROJECT_STATE.md`. Production deployment remains a separate owner-authorized action.

## 2026-09-26 — Field measurement is one cloud workspace with phone and tablet presentations

**Supersedes:** the standalone `measurer_v2_5.html` launch through a developer Mac `file://` path.

- Every surveyor measurement entry point opens the assigned Project inside the canonical `/legacy-crm` document. A production device must never depend on a local desktop file, browser-to-browser JSON handoff, or a second copy of the Project.
- The same role-authorized measurement data and actions are used on every device. Surveyors continue to see technical data without prices, margin, payments, payroll, or internal economics.
- Phone is a full-screen single-column field flow with touch-sized controls and a persistent save action. Tablet is a two-column workspace with the active input sheet beside drawing, existing windows, photos, standards, and service-specific checks.
- Address, client, Project number, and active film direction stay visible in the measurement header so measurements cannot be entered into the wrong job.
- Historical v2.5 JSON conversion helpers may remain temporarily for old exports, but they are not a live measurement path and must not be presented as the normal surveyor workflow.
- Implemented on `codex/surveyor-phone-tablet-measurement`; release still requires PR review and deployment from `main`.

## 2026-09-29 — CRM core consolidation: legacy freeze, staged migration, end-to-end gate

Approved by the Owner on 2026-09-29. Reinforces the 2026-08-24 "One CRM data source" and "One operational workflow" decisions, which were recorded but not enforced.

Evidence (clean local build of `main` at `2b4003d`, 2026-09-29):

- Nearly all operating CRM data (clients, orders, proposals, tasks, employees, photos) lives in one `LegacyWorkspace.payload` JSON row shared by every user. Concurrent saves overwrite each other; the row grows with every photo.
- Employees exist twice: as PostgreSQL `User` records and as a separate list inside the legacy payload. A valid manager login opened `/legacy-crm` with "Доступ не настроен".
- The database cannot be rebuilt from scratch: migrations `20260824153000_reset_owner_password_recovery` and `20260824154500_rotate_owner_recovery_password` require one existing production owner row. `prisma db push` from `schema.prisma` also fails the seed because `proposal_code_sequence` exists only in raw migrations. Restore from backup is therefore unverifiable.
- `prisma/seed.ts` upserts Safety Film field configs with `where: SAFETY_FILM` but `create: SMART_FILM`, which fails on a clean database and may have attached safety-film fields to Smart Film.
- Legacy bootstrap depends on a backup file in the Owner's local `~/Downloads`.
- 422/422 unit tests and TypeScript pass; no test exercises a project end-to-end against a real database, so none of the above is caught.

Decision:

1. **Legacy freeze.** No new features, fields, or modules in `LegacyWorkspace.payload` or the legacy HTML. Only data-loss and security fixes are allowed there.
2. **Staged migration along the canonical lifecycle.** Order: Lead → Consultation/Survey → Measurement → Proposal → Agreement/Deposit → Project → Installation → Closeout/Payment. Each stage moves to relational PostgreSQL records, is verified, then its legacy write path becomes read-only. Existing records are migrated, never deleted.
3. **One employee directory.** PostgreSQL `User` + roles is the only employee list. The legacy list is derived, never edited.
4. **Server-only calculations.** Totals, margins, payouts and taxes are computed by the backend once; interfaces display them.
5. **Clean-build and end-to-end gate.** CI must build an empty database from migrations, run the seed, and run an end-to-end test of every migrated lifecycle stage. A stage is not done until this gate is green.
6. **File storage.** Photos and documents go to object storage (`AttachmentFile`, Cloudflare R2 target), never into JSON payloads or base64 in the database.
7. **Role-specific mobile screens** for surveyor, installer and manager are built on migrated stages, not as a shrunken desktop.
8. **Open PR triage.** Open PRs that extend legacy-only behavior are closed or reduced to data-loss/security fixes.

Execution is tracked as TASK-009 in `zufarataev-code/rolanpro-ai-system`. Builder: Codex. Reviewer: Claude. Production deploys and data migrations require explicit Owner approval.

## 2026-09-30 — Exception to the legacy freeze for urgent operational features

Owner decision in chat on 2026-09-30 (chosen over waiting for the relational installation/payment stage). Amends item 1 of "2026-09-29 — CRM core consolidation".

- Allowed in `LegacyWorkspace.payload` / the legacy HTML until the installation and payment stage moves to PostgreSQL: manager KP confirmation (PR #271), the installer rate directory and pay rules (PRs #272, #273), installation roles/groups, team-lead pay and job distribution (PRs #275–#277).
- Each such feature keeps server-side authority where it already exists (roles, groups, rates and approvals live in PostgreSQL; the legacy payload only mirrors them) and is listed for migration in the installation/payment stage.
- Everything else remains frozen as decided on 2026-09-29.

## 2026-10-01 — Exception to the legacy freeze: installer analytics and client identity fields

Owner decision in chat on 2026-10-01 (asked whether to wait for the relational stages, chose to build now). Amends item 1 of "2026-09-29 — CRM core consolidation", like the 2026-09-30 exception.

- Allowed in the legacy HTML until their stages move to PostgreSQL: the installer «Аналитика по объектам» view (PR #282; it reads legacy orders, the only place installation data exists today) and the client identity fields — B2C first/last name; B2B company, company type, representative and job title; explicit «Постоянный партнёр» (PR #284; mirrored in the PostgreSQL `leads` / `clients` columns).
- Migration: the analytics moves with the installation and payment stage (relational installer jobs and payroll accruals); client identity moves with the lead/client stage.
- Everything else remains frozen as decided on 2026-09-29.

## 2026-10-01 — Exception to the legacy freeze: a manually written film is fixed in the project and ordered

Owner request in chat on 2026-10-01: a manager must be able to write in a film that is not in the warehouse list; «это должно фиксироваться в рамках проекта обязательно, чтобы потом можно было закупить и сделать приход, чтобы проект правильно посчитался». Solar films have subtypes (зеркальная, керамическая, магнетронная, фотохромная, другая).

- Allowed in the legacy HTML until the warehouse/purchasing stage moves to PostgreSQL: «Плёнки нет в списке → Вписать плёнку вручную и заказать» in the quick project editor (PR for this exception). It creates a catalog film «ожидает закупки» on the project line and a draft project purchase request; the existing receipt flow brings the real roll cost into the project.
- Same exception (Owner request in chat, 2026-10-01): the «Принять рулон на склад» form has category, solar type, brand, model, vendor, lot, width, length, purchase price, date and location; a film missing from the list is typed in and added to the catalog; every roll gets a readable unique code (RP-YYMM-NNNN, also its QR code); the purchase price per sq ft is shown and stored, and the project material cost uses it.
- Migration: moves with the warehouse/purchasing stage (relational catalog, purchase requests and receipts).

## Changing a decision

## 2026-09-30 — Surveyor mobile navigation is organized around field work

- The Surveyor's frequent mobile destinations are `Сегодня`, `Календарь`, `Мои задачи`, and `Замеры`; `Ещё` continues to expose every other role-authorized module from the canonical sidebar.
- `Сегодня` is a presentation of assigned canonical Projects and existing operational actions, not a new job store. `Мои задачи` is the shared task module, and Calendar reuses the canonical dispatch events, filters, schedule, and map.
- The phone presentation may prioritize the next visit, route, touch actions, and a schedule/map switch. Tablet and desktop keep the same records and commands with roomier layouts. Role authorization and financial redaction do not change.
- Implemented for review on `codex/surveyor-mobile-v4`; deployment remains a separate owner-authorized action.

Do not silently overwrite an earlier decision. Add a new dated section that names the superseded decision, explains why it changed, and links the implementing PR.

## 2026-10-01 — Installation job titles (Owner)

- The word «монтажник» is not used anywhere in the CRM, the installer app, client messages or documents: the Owner considers it low-status.
- A regular installer is **«Специалист по установке»** (EN: Installer).
- The senior role that distributes jobs within a group is **«Руководитель отдела монтажа»**; it replaces «Руководитель монтажной группы» and «Главный специалист по установке» used in earlier drafts (PR #275–#277).
- Internal codes stay `INSTALLER` / `installer`; only user-visible text changes. New screens and PRs use these titles from the start.
- Scope: everything a person sees — CRM screens, the installer app and its demos, seed/provisioning data, client SMS/e-mail and documents. Historical internal engineering notes (`.agents/`, audit and prompt documents) are not rewritten.

## 2026-10-03 — Owner-defined solutions inside directions, with service scheduling

Owner clarified and authorized implementation in chat: choose the project direction, then add its concrete solutions/services, each with linked materials, its own customer price, specialist and date. The owner will create actual solutions; do not seed invented commercial products or prices.

- Apply to the operating legacy project and its existing measured/quick scope now. This is an explicit narrow exception to the 2026-09-29 legacy freeze for this requested workflow; the relational migration remains separate and must not hold the usable service UI hostage.
- Reuse the catalogue work from #295, adapted onto current main without importing its older warehouse/dependency chain. Solutions belong to a direction; their `filmIds` permit one film in several solutions. Owner edits the definitions, manager selects them. Server protects definitions and internal rates.
- Measured windows and existing quick lines snapshot their selected solution name, customer price and installation rate. Changing the catalogue must not rewrite old estimates. Materials for a solution are explicit; an empty material selection is not permission to use arbitrary film.
- Service groups are projections of the current scope: measured windows grouped by solution, or existing quick lines when there are no measurements, plus additional-work lines. Assignments live in `order.serviceSchedules`, with project crew/date derived summaries. A service has its own date and crew; calendar events use that crew. No duplicate charge is created for a measured service.
- Installation readiness, deposit/proposal and verified-measurement gates remain. This does not implement separate per-service completion, weekly payroll summaries, relational migration or automatic bank transfers.
- Branch `codex/service-solutions-live`, based on current main `4b5463c`. Supersedes the one-film/one-solution and automatically seeded examples in the unmerged #295 proposal.
## 2026-10-02 — Project overhead by revenue; ad budget from last month's revenue (Owner)

Owner decision in chat on 2026-10-02 («давай» to the proposed order). Amends item 1 of "2026-09-29 — CRM core consolidation", like the 2026-09-30 and 2026-10-01 exceptions: the change is in the legacy project economics because that is where project profit is calculated today.

- The advertising budget of a month is `marketingPct` (10%) of the previous month's revenue: $100 000 in September → $10 000 for October. With no revenue in the previous month (the first month in the CRM), the budget is estimated from the month's own revenue and the screen says so.
- The month's fixed costs and its advertising budget are shared between that month's projects in proportion to their revenue (not equally). A project without a price carries no share. The project month is `projectProfitDate` (installation date, then project dates, then proposal and creation dates).
- The project's ad share stays in the direct costs (`orderPSS.marketing`), so every margin in the CRM keeps meaning "after advertising"; the fixed-cost share and the tax reserve stay in the net-profit block.
- Supersedes: equal split of fixed costs (`fixedPool / projectCount`) and the flat «Рекламный резерв» of 10% of each project's revenue.
- Migration: moves with the payment stage, together with the monthly money report and the bank feeds (real ad spend can then replace the budget).
## 2026-10-02 — Projects are deleted into an archive, by the owner only (Owner)

Owner decision in chat on 2026-10-02: «удаление проектов только у меня как у админа — удалять в архив, чтобы потом можно было восстановить». Amends item 1 of "2026-09-29 — CRM core consolidation" like the earlier exceptions: projects live in the legacy payload today.

- Only the owner deletes and restores projects. A deleted project is never erased: it moves from `orders` to `archivedOrders` with all its data and `archive {at, by, reason, cancelledRequestIds}`.
- In the archive a project takes no part in lists, calendar, money, warehouse or analytics (all read `orders`). Its draft purchase requests are cancelled and become drafts again on restore; requests already sent stay with purchasing.
- The server enforces it on every owner/manager save (`enforceProjectArchive`): an archived project is never also in `orders`; a non-owner cannot change the archive or drop a project from `orders`. Field roles never receive the archive.
- Project numbers count archived projects, so numbers are never reused.
- Migration: moves with the project stage to PostgreSQL as a soft-delete column.

## 2026-10-04 — The owner's design canvas becomes the CRM look (Owner)

Owner decision in chat on 2026-10-04: «сделай дизайн для нашей CRM и мобильной версии… да, переноси дизайн в CRM нашу», after reviewing the canvas «CRM RolanPRO — экраны» (Claude Design, 21 screens). Amends item 1 of "2026-09-29 — CRM core consolidation" like the earlier exceptions: the screens people use are the legacy CRM today.

- Step 1 (this change): one visual layer for every screen and role — `src/features/legacy-crm/design-theme.ts`, injected by `/legacy-crm` after the legacy and Tailwind styles: Montserrat / Manrope / IBM Plex Mono, the navy gradient sidebar with the blue gradient active item, the light blue-grey ground, white 8 px cards with a soft shadow, gradient primary buttons, calm inputs, 4 px chips, softer dialogs. Stroke icons replace emoji in the menu and the phone dock. The owner/manager phone dock is «Сегодня · Лиды · [+] · Проекты · Календарь»; «+» opens «Создать» (project, client, leads, task, roll receipt, purchase request); all sections stay behind ☰.
- Layout is unchanged in this step; the canvas screens (Сегодня, Воронка, Карточка заказа, Календарь, Склад, Деньги, phone screens) follow one by one, each on top of the current structure (including the Precision Workbench «Сегодня»).
- Migration: the theme module is plain CSS and moves with the UI to the relational screens unchanged.


## 2026-10-04 — Selected mobile «Пульс бизнеса» presentation

The owner selected mobile design variant 2 and explicitly requested implementation in the existing CRM. On `codex/pulse-business-mobile`, OWNER/MANAGER home becomes a period-based business overview with square controls, cyan chart, colored metric indicators and authentic ROLANPRO wordmark. Phone shortcuts are Обзор / Продажи / Задачи / Ещё; Продажи routes to the existing projects lifecycle. The complete role navigation and operating workbench remain available. Phone projects default to the existing card list, with optional kanban and collapsible advanced filters. Field-role presentation is preserved.

The monetary tile is explicitly «Стоимость оплаченных проектов», aggregating existing `orderRevenue` for role-visible projects with `paidAt` in the selected period. It is not bank receipts or a replacement P&L. No synthetic growth, profit, conversion or plan figures are introduced. This presentation does not change financial formulas, record storage, permissions or APIs.

Release review: #305 (CRM 2.0 shell) and #306 (numbers home) are unmerged alternative canvas designs, not dependencies of the selected mobile variant. The owner instructed continuation after reviewing #307. Release only #307; keep those alternative PRs open for later reconciliation against the new main. #307 merged as eff1c4f4da5138f04f71290bb9233462f9f56b63 on 2026-10-04.


## 2026-10-04 — Project intake: direction → service → building → measurement → proposal

Owner explicitly restated the hierarchy. The existing primary-service ids represent directions; concrete services come from `settings.serviceOfferings` within a direction. New project intake starts with no preselected direction, selects an active concrete offering, then building type, then required contact/management details, and opens the existing measurement workflow. Changing direction clears the selected offering and building; inactive or foreign-direction offerings cannot be saved. No starter services are invented when a direction has none.

The chosen offering id/name is stored with the new project and passed into new measurement windows through the same `applyWindowOffering` assignment used by the existing solution picker. Proposal projections already consume window offering id/name. Existing projects and their measurements are not rewritten; later project additions remain available.

Owner sidebar labels the dashboard «Пульс бизнеса»; `#/overview` explicitly opens it. Shared HTML mobile project rows also receive square styling. The owner reported not seeing the new design, but no authenticated production session or user URL was supplied. Isolated cloud-boot rendering with mocked owner APIs confirmed the actual HTML transformation shows the pulse dashboard; the report's root cause remains unconfirmed.

## 2026-10-05 — Multiple project offerings, film categories and owner role testing

Owner clarified that a project can include several concrete services, including several within the same direction. Intake keeps one primary direction/offering for original enquiry attribution and allows additional active offerings grouped by direction. Project `offeringIds` and `serviceTypes` preserve the selection; new measurement lines inherit the first selected active offering matching their scope. Existing line-level offering selection remains available for subsequent services and the existing measurement/estimate formulas remain authoritative. Films cannot be assigned across scope categories, even if an offering contains a stale cross-category film link.

Owner requested all role workspaces during testing to inspect calculations. Reuse the server-authenticated, read-only employee preview; add explicit selection of one role actually assigned to an active employee. Only the real owner can enumerate/start previews. Owner targets remain prohibited, existing two-part preview cookies remain supported, and all existing write/integration restrictions remain enforced. Switching back reloads the owner session. No synthetic employees, passwords or production record changes are introduced.

Desktop project period/status/manager/date filters form a horizontal panel with wrapping when space is limited; phone advanced filters stay collapsible. Month calendar keeps seven weekday columns for every role and is excluded from generic mobile stacking.

## 2026-10-05 — Five directions; services priced per sq ft or without sizes (Owner)

Owner request in chat on 2026-10-05: «у нас есть 5 направлений… нет приватная; в каждом направлении свои услуги… у каждой услуги свои цены и свой материал… на какие-то услуги размеры обязательны, а на какие-то нет… у каждой услуги может быть свой исполнитель». Answers: privacy films move out of decorative into the new direction; units without sizes — per piece, per zone, a fixed sum and the owner's own unit; the executor is chosen in the project only.

- Directions: Смарт, Солнцезащитная, Защитная, Декоративная, **Приватная** (`privacy_film`, catalog category `privacy`, code `PRIVACY_FILM`, measurement scope, colour, warehouse category). `canonicalCatalogCategory` no longer maps privacy to decorative; frost stays decorative.
- A service (`settings.serviceOfferings`) has `unit`: `sqft` (needs measured windows; material = linked warehouse films) or `piece` / `zone` / `fixed` / `custom` with `unitLabel` (no sizes; material = `materialCostPerUnit`). `pricePerSqft` and `installerRatePerSqft` keep their names and hold the per-unit customer price and installer pay. Services saved before are per sq ft.
- In a project a service without sizes is a line in `extraServices` (`type: 'offering'`, `offeringId`, `unit`, `qty`, `unitPrice`, `price = qty × unitPrice`); the server snapshots `offeringInstallerRate` and `offeringMaterialCost` like window rates. Installer pay = qty × the service rate, split among that service's crew; material = qty × cost. Managers see neither the rate nor the material cost.
- A project whose services are all without sizes skips measurement: intake says «Создать проект», and «нет окон с размерами» / «не внесены помещения и размеры» apply only when `orderNeedsMeasurements` (a per-sq-ft service, windows, or a project from before services).
- The executor of each service is chosen in the project when scheduling (already per service via `serviceSchedules`).
- Postgres `service_types` gets DECORATIVE_FILM and PRIVACY_FILM so published proposal lines keep their direction.


## 2026-10-05 — Project is a multi-service container; site operations persist; accepted proposal may schedule before payment (Owner)

Owner confirmed in chat that a Project is the container for the whole customer job, not one service. It may contain services from several directions; each service keeps its own material, customer price, specialist and installation date. The service directory supplies the default customer price plus an owner-defined manager corridor (minimum/maximum); a manager may override the project price only inside that corridor. Historical project snapshots are not rewritten by later directory edits.

Operational object details are first-class project data: gate/access code, parking availability, customer-provided parking, parking instructions, HOA/security/permit restrictions, loading/elevator/service entrance, on-site contact/phone and special notes. They are visible in the Project card and flow into the Work Order / installer instructions.

This decision refines the 2026-09-04 sales-close gate for current operations: after the Proposal is accepted and the estimate/technical requirements are satisfied, payment/deposit remains tracked but is not a hard blocker for production preparation or installation scheduling. Projects intentionally sold as post-pay must continue operationally. Proposal acceptance remains required. Payment status stays auditable and final closeout/payment rules remain separate.

Solar measurement must continue to collect glass type and façade/orientation for recommendation/compatibility. Smart control packages will not be invented until the owner confirms the actual components and wiring standards.

## 2026-10-07 — Project intake starts from services; package components; per-linear-foot work (Owner)

Owner clarified that creating a Project must not begin with a direction or force the measurement screen. The intake lists active services from every direction together; the first selected service remains the immutable incoming-request attribution, while all selected services belong to the same Project. Creating it opens the Project card. Measurement stays an available Project action and is required only by services that need measured windows.

- A service may include size-free services from the directory at no customer charge, one level deep. An included component is stored as its own operational line with quantity, material, installer pay, crew and date, but customer price `$0`. It follows its parent into and out of the Project and cannot be removed independently. Removing a component from the directory package later does not rewrite an existing Project.
- Unit `lft` means linear foot. Its default quantity is the sum of the measured pane perimeters multiplied by pane quantity. A manager may enter a manual quantity and can return it to the calculated window perimeter.
- The Project estimate can add any active service. A per-square-foot service is assigned to unassigned measured windows of its direction; other units become quantity lines.
- Included `$0` lines do not block estimate readiness and do not appear as separate chargeable Proposal lines. Server validation enforces valid components, one-level packages, corridor pricing and the parent/component relationship.
- The service directory remains owner-created. This change does not seed A1/A2/A3, silicone or any Smart hardware package. Smart components and wiring packages remain out of scope until confirmed by the owner.
- Editing a package updates its summary in place and preserves the reference-directory scroll position. The calendar continues using the unified CRM design released in PR #316.

## 2026-10-08 — One role-safe Rolan PRO agent, represented by the approved mascot (Owner)

The existing CRM assistant becomes the single Rolan PRO agent instead of adding a second chat. Its first release is a deterministic, explainable operating pulse: it reads only records already authorized for the signed-in role, identifies overdue work, customer debt, missing next actions, upcoming field work and bank-review needs, and offers a direct next step.

- The approved Rolan PRO mascot is the agent's visual entry point. It does not imply a separate data source or a second automation system.
- Hard calculations, permissions and workflow gates remain normal backend/application rules. AI explains and recommends; it does not replace authoritative finance, payroll, tax, inventory or project calculations.
- A suggested task is created only after an Owner/Manager confirmation, is deduplicated by an agent key, and records `source: rolan_agent`. Payments, tax positions, customer sends, destructive changes and personnel decisions are never autonomous.
- Field roles receive only assigned operational work. Revenue, client debt, bank review and company economics remain hidden from Surveyors and Installers. The conversational context uses `visibleOrdersForUser` / `visibleClientsForUser` and omits money for field roles.
- Financial learning continues through the existing bank categorization rules: the Owner confirms a merchant once and may use «Запомнить». The agent surfaces the review queue but does not silently convert uncertain transactions into deductible expenses.
- Future phases may add persisted insight history, scheduled daily delivery and more approved safe-write actions. They must reuse the existing Operations Agent HMAC/idempotency layer rather than create an unrestricted automation path.
