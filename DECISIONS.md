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

## Changing a decision

Do not silently overwrite an earlier decision. Add a new dated section that names the superseded decision, explains why it changed, and links the implementing PR.
