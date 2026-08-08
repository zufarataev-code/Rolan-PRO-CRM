# ROLANPRO CRM / ERP — Current State Audit

Status: audit-only document. No working CRM functionality was changed.

## 1. Scope

Inspected sources:

- `/Users/zufarataev/Desktop/CRM/Rolan-PRO CRM`
- `app/` Next.js routes and pages
- `src/` components, business services and shared libraries
- `prisma/schema.prisma`
- `prisma/migrations`
- `integrations/twilio`
- existing architecture docs: `README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_SPEC.md`, `ERP_SYSTEM.md`
- legacy CRM reference: `legacy-sources/rolanpro-crm_3-source.html`
- current local HTML CRM reference: `/Users/zufarataev/Downloads/rolanpro-crm_3.html`

Important: the tracker file `/Users/zufarataev/Downloads/RolanPRO_61.html` was not modified and is outside this audit scope unless explicitly requested.

## 2. Current Architecture

The repository is a modular Next.js CRM application with Prisma and PostgreSQL.

Current stack:

- Next.js 15
- React 19
- TypeScript
- Prisma 6
- PostgreSQL
- App Router
- Server-side domain services under `src/features`
- API routes under `app/api`
- Role-based session helpers under `src/lib/auth`

The architecture is already moving in the correct direction:

- database is intended as source of truth
- backend services perform important calculations
- UI reads data through API/server functions
- reference tables drive services, films, statuses and complexity
- old HTML CRM is used as legacy/prototype reference

Current counts:

- API route files: 54
- page files: 27
- component files: 27
- feature service files: 25
- Prisma models: 33

## 3. Implemented Modules

Implemented or partially implemented:

- authentication and demo role login
- roles and access model
- leads
- clients
- deals
- sales pipeline
- follow-ups
- tasks
- consultations
- survey / measurement records
- measurement photos and attachments metadata
- recommendations
- service calculator
- proposals
- public proposal view
- client proposal selection
- proposal agreement / signature text flow
- deposits
- project creation from approved proposal
- manual project creation
- project positions / service lines
- project finance snapshot from backend calculations
- scheduling assignment
- crew assignment
- installer jobs
- installer job status runtime
- calendar events
- notifications
- activity log
- email action records
- owner dashboard
- owner finance overview
- owner service P&L view
- settings/reference editor
- Google Maps frontend loader for planning map
- Twilio function reference files

## 4. Main Data Flow

Current primary flow:

1. Lead or client is created.
2. Deal moves through pipeline.
3. Consultation can be scheduled.
4. Survey stores measurements, photos, notes and recommendations.
5. Proposal is generated from survey or calculator.
6. Client can view/select/sign via public proposal link.
7. Approved proposal can create a project.
8. Project contains project positions.
9. Schedule assignment creates installer jobs.
10. Installer sees assigned jobs and changes status.
11. Activity logs and notifications are created around key events.
12. Owner pages show finance snapshots calculated from project/service data.

This is a good CRM foundation, but it is not yet a full ERP because inventory, payroll, real cash ledger and communication automation are not first-class database modules yet.

## 5. Database State

Current Prisma models:

- User, Role, UserAccess
- ServiceType, ServiceFieldConfig, ServiceAddon, FilmCatalog
- ProjectStatus, PaymentStatus, PositionStatus
- EventType, EventTrack, ComplexityLevel, City, DocumentType
- PipelineStatus
- Lead, Client, Deal
- Project, ProjectPosition, ProjectPositionAddon
- Crew, ScheduleAssignment, CalendarEvent, InstallerJob
- Consultation, Survey, Measurement, SurveyRecommendation
- Proposal, ProposalItem, Deposit, ProposalEvent, Agreement
- AttachmentFile, Document
- ActivityLog, Notification, EmailAction, FollowUp, Task

Missing for ERP:

- ClientAccount / CompanyAccount with multiple addresses and B2B/B2C behavior
- ClientAddress with unit, city, state, zip, geocode and Google place id
- MeasurementRoom and MeasurementPanel / WindowPanel
- FilmRoll / FilmBatch / WarehouseItem
- WarehouseMovement
- FilmReservation
- CuttingPlan
- CuttingPiece
- Offcut / reusable remnant
- Supplier / Vendor
- ProjectExpense
- ExpenseCategory
- FinanceAccount
- MoneyMovement
- Invoice
- PaymentTransaction
- PayrollLedger
- PayrollPayment
- PayrollRule
- CommunicationOutbox
- CommunicationTemplate
- InboundMessage
- VoiceCallLog
- AIActionLog
- IdempotencyKey / MutationLog

## 6. API And Routes

The app has a large API surface under:

- `/api/v1/auth`
- `/api/v1/clients`
- `/api/v1/leads`
- `/api/v1/deals`
- `/api/v1/pipeline`
- `/api/v1/consultations`
- `/api/v1/measurements`
- `/api/v1/survey-recommendations`
- `/api/v1/service-calculator`
- `/api/v1/proposals`
- `/api/v1/deposits`
- `/api/v1/projects`
- `/api/v1/schedule`
- `/api/v1/installer-jobs`
- `/api/v1/tasks`
- `/api/v1/follow-ups`
- `/api/v1/settings`
- `/api/public/proposals`
- `/api/public/site-leads`

Most protected routes use `requireRequestSession`.

Public routes exist intentionally for:

- site lead capture
- public proposal view
- proposal selection
- proposal agreement

Risks in public routes:

- no visible rate limiting
- proposal access token has no clear rotation/expiry enforcement policy
- public mutation routes need stronger idempotency and audit tracking

## 7. Authentication And RBAC

Current role rules exist in `src/lib/auth/rbac.ts`.

Current role areas:

- owner
- manager
- consultant / measurer
- installer

Strong parts:

- owner routes are separated
- installer routes are separated
- survey routes include consultant role
- API session helpers are used widely
- installer job filtering exists in project service

Problems:

- `/finance`, `/payroll`, `/inventory` currently allow OWNER and MANAGER in route rules. For production ERP, sensitive owner finance, payroll and margins should be OWNER-only by default.
- Financial visibility is partly protected by a broad string-key filter in `src/lib/finance/visibility.ts`. This is useful as a temporary shield, but ERP must use explicit serializers and endpoint contracts.
- Demo login exists and is useful locally, but must be disabled or protected before any production deployment.

## 8. Local Storage And Legacy CRM

The new Next.js CRM uses localStorage only lightly for UI preferences in marketing components.

The old HTML CRM uses localStorage as its main data store:

- key: `rolanpro_crm`
- stores operational data
- stores settings
- stores communication settings
- stores integration-related values

This is acceptable for a local prototype, but not for production ERP.

Production rule:

- operational data belongs in PostgreSQL
- secrets belong in server environment variables or external secret manager
- browser storage can keep only harmless UI preferences and offline draft buffers

## 9. Existing CRM Logic

Important working logic that must be preserved:

- multi-role entry points
- manager CRM workspace
- sales pipeline
- consultations and survey ownership
- proposal generation from surveys
- public proposal flow
- project creation from approved proposals
- project positions as service lines
- project finance calculation service
- scheduling assignment
- installer job status transitions
- activity log and notifications
- settings/reference bootstrap
- owner finance pages

Important legacy logic to port carefully, not copy blindly:

- local HTML order flow
- measurement drawing ideas
- material/cut sheet UI
- warehouse film roll concepts
- communication templates
- SMS/WhatsApp/Telegram manual flows
- academy prototype

## 10. Hardcoded Values And Technical Debt

Observed technical debt:

- proposal line price estimates include hardcoded service pricing in service code
- project/proposal codes use timestamp/random patterns rather than a dedicated sequence
- some financial inputs live inside JSON `dynamic_fields`
- actual film usage can be manually entered, but no real cutting engine exists
- measurements have width/height/quantity but not normalized panes/cells per window
- service support is incomplete for Smart Glass, Decorative Film, Anti Graffiti and detailed safety/security classes
- migration history exists, but prior instructions warn not to blindly replay all migrations
- seed file contains demo data and should not be run over live/local working data
- no proper automated test suite exists
- `.next` build artifacts are present in the repository folder
- old `.swp` files are present

## 11. Security Problems

Critical:

- old local HTML CRM contains hardcoded integration secrets and API keys in frontend code
- old local HTML CRM can store secrets in localStorage
- AI and messaging calls from browser are not safe for production

High:

- no visible rate limiting for public endpoints
- proposal public links need expiry, revocation and audit policy
- file upload metadata exists, but production upload validation/storage authorization must be hardened
- demo role login must not be available in production
- finance/payroll visibility should be tightened to owner-only sensitive endpoints

Medium:

- `AUTH_SECRET` has a development fallback if missing
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is public by design but must be restricted by allowed domains and APIs
- Twilio docs are present, but final CRM should call backend endpoints, not store credentials in browser

No secret values are repeated in this document on purpose.

## 12. Dependencies

Current dependencies are intentionally small:

- `next`
- `react`
- `react-dom`
- `@prisma/client`
- `prisma`
- `typescript`
- `tsx`
- React/Node type packages

Missing for production-grade ERP:

- test runner
- UI/e2e test tooling
- schema validation library
- background job/queue mechanism
- rate limiter
- file storage adapter
- logging/observability
- integration SDK wrappers as server-side modules

## 13. Current Build And Validation

Previously verified:

- Next.js production build passes.
- Prisma schema validation passes.

Current gap:

- no project test script exists
- no meaningful unit/integration/e2e tests exist in the app source

## 14. Main Risks

Business risks:

- owner may see incorrect project profit if actual film usage, waste, payroll and direct expenses are not separated correctly
- managers/measurers/installers may see financial fields if endpoint responses are not explicit
- B2B regular clients need a different workflow than one-time residential clients
- old HTML data and new PostgreSQL data may diverge if both are treated as active systems

Technical risks:

- extending JSON fields instead of creating domain tables will make ERP unreliable
- adding real integrations directly in frontend will leak secrets
- running seed/migrations without a baseline can damage current data
- no automated tests means finance/cutting/payroll bugs can return silently

## 15. Immediate Improvements

Recommended next actions before feature work:

1. Add test infrastructure.
2. Add pure backend cutting calculator with unit tests.
3. Create migration plan for measurement panels, film rolls and cutting plans.
4. Move all future communication actions to server-side outbox.
5. Tighten finance/payroll RBAC.
6. Create explicit financial serializers instead of string-key hiding.
7. Add address model with unit, Google place id, lat/lng and normalized city/state/zip.
8. Add migration safety procedure: backup, schema diff, apply, verify.
9. Mark old HTML CRM as prototype/legacy and stop adding new secrets to it.

## 16. Current Verdict

The system is not a blank CRM. It already has a solid operational CRM backbone.

The next architectural step is not to add more buttons. The next step is to turn the backbone into a reliable ERP core:

- normalized measurements
- real film cutting
- real inventory
- real project expenses
- real payroll ledger
- real communication outbox
- explicit RBAC
- test coverage around money and material calculations

