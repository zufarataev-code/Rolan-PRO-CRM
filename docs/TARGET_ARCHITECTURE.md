# ROLANPRO CRM / ERP — Target Architecture

Goal: evolve the existing CRM into an AI-native ERP for a US architectural window film company without breaking current working functionality.

## 1. Core Principles

1. Preserve existing working CRM flows.
2. PostgreSQL is the source of truth.
3. Frontend is an interface, not a finance engine.
4. Business calculations live in backend domain services.
5. Every important action writes an activity/audit record.
6. Secrets never live in frontend code or browser storage.
7. Financial visibility is explicit by role.
8. B2B, B2C and regular clients have different workflows.
9. Measurements, cutting, inventory, proposal, work order and finance must be linked by IDs.
10. Build by phases, with tests before risky finance/inventory changes.

## 2. Target System Layers

### UI Layer

Role-based apps:

- Owner OS
- Manager CRM
- Measurer tablet app
- Installer field app
- Warehouse view
- Client portal
- Regular client account portal
- Academy / training portal

Rules:

- internal UI in Russian
- client-facing UI/docs in English
- no secret values in UI
- no duplicated finance calculations in UI
- tablet-first UX for measurer

### API Layer

All writes go through validated API endpoints.

Responsibilities:

- auth
- RBAC
- validation
- idempotency
- audit log
- domain service orchestration
- normalized response serializers
- integration adapters

### Domain Service Layer

Separate services:

- sales
- clients
- projects
- measurements
- proposals
- cutting
- warehouse
- scheduling
- dispatch
- installer runtime
- finance
- payroll
- communications
- AI assistant
- voice AI

### Database Layer

PostgreSQL with Prisma.

Rules:

- references by ID, not text
- status and catalog values controlled by reference tables
- financial records immutable or versioned where needed
- money and inventory movements are append-first ledger style
- schema changes require backup + diff + migration plan

### Background Job Layer

Needed for:

- scheduled reminders
- SMS/email/WhatsApp sending
- retrying failed messages
- AI lead scoring
- AI follow-up generation
- daily owner summaries
- proposal expiry checks
- inventory low-stock alerts
- payroll preparation

### Integration Layer

Server-side adapters only:

- Twilio SMS
- WhatsApp Business API or Twilio WhatsApp
- Telegram Bot API
- Gmail / SMTP
- Google Calendar
- Google Maps / Places
- Stripe
- QuickBooks
- website forms
- Facebook / Instagram / Messenger
- future phone / Voice AI provider

## 3. Target Modules

## CRM / Sales

Owns:

- leads
- clients
- companies
- deals
- pipeline
- follow-ups
- tasks
- lead source tracking
- duplicate lead detection
- next action control
- B2B/B2C logic

Required changes:

- enforce required next action on active deals
- store lead source and marketing campaign as structured fields
- add duplicate detection by phone/email/address
- add lead score and AI recommendation fields

## Client Accounts

Owns:

- client profile
- client type: B2C, B2B, regular account
- multiple addresses
- contacts for B2B companies
- private client portal
- regular-client repeat-order portal

Target tables:

- `client_accounts`
- `client_contacts`
- `client_addresses`
- `client_portal_users`
- `client_account_stats`

Address fields:

- street
- unit
- city
- state
- zip
- formatted address
- Google place id
- latitude
- longitude
- access notes

## Measurement

Owns:

- room list
- window list
- panel/cell dimensions
- glass type
- frame type
- orientation
- access complexity
- photos
- drawings
- voice notes
- AI measurement extraction
- service-specific survey rules

Target service modes:

- Smart Film
- Smart Glass
- Solar Film
- Security Film
- Safety Film
- Decorative Film
- Anti Graffiti

Window/panel model:

- measurement room
- window/opening
- panel/cell
- cut dimensions
- visual sketch data

Tablet UX:

- one measurer module, not multiple confusing measurement buttons
- large icon-based window type picker
- continuous drawing
- save draft automatically
- work offline and sync later
- no money visible to measurer

## Film Cutting

Owns:

- roll widths: 60 inch and 72 inch
- 3 inch overlap on every side
- cut size per panel
- roll layout optimization
- waste calculation
- remaining material
- reusable offcuts
- reservation against order

Cut rule:

- glass width + 6 inches
- glass height + 6 inches
- optimize by roll width and length
- calculate actual film usage separately from billable area

Target outputs:

- billable sqft
- actual cut sqft
- roll width used
- required linear feet
- waste sqft
- waste percent
- cut sheet for installers
- material cost for finance
- reservation for warehouse

Target files/services:

- `src/features/cutting/types.ts`
- `src/features/cutting/logic.ts`
- `src/features/cutting/service.ts`
- `app/api/v1/cutting/preview/route.ts`

## Warehouse / Inventory

Owns:

- film catalog
- suppliers
- rolls
- lots
- purchases
- stock movements
- reservations
- project consumption
- defects
- offcuts
- low-stock alerts

Target tables:

- `vendors`
- `warehouse_items`
- `film_rolls`
- `film_batches`
- `warehouse_movements`
- `film_reservations`
- `cutting_plans`
- `cutting_pieces`
- `film_offcuts`

Movement types:

- purchase
- reserve
- release
- consume
- adjustment
- waste
- return

## Proposal

Owns:

- premium proposal
- service packages
- optional items
- drawings and photos
- technical scope
- client selection
- terms
- signature
- deposit link
- version locking

Rules:

- proposal is generated from measurement and selected recommendations
- client-facing labels are English
- accepted proposals become locked snapshots
- changes after acceptance create a new version or change order

## Work Order

Generated from approved project:

- window list
- room list
- film model
- cut dimensions
- roll layout
- tools
- silicone
- power supplies
- controllers
- wiring notes
- install instructions
- photos
- drawings

Smart Film requirements:

- electrical stage
- cable route
- wire type
- power supplies
- WiFi controllers
- multi-zone controllers
- commissioning
- zone map

Security/Safety Film requirements:

- film class
- attachment system
- silicone stage
- required curing notes
- glass/frame compatibility warnings

## Scheduling / Dispatch

Owns:

- consultations
- measurements
- installations
- service calls
- complaints
- map-based day plan
- calendar day/week/month/year views
- crew color and service color
- customer notification triggers

Required behavior:

- when manager schedules a consultation, customer gets notification
- customer can request reschedule/cancel with reason
- manager sees this in CRM
- roles see only relevant schedule
- map shows assigned tasks and business heat by area

## Installer App

Installer sees:

- assigned jobs only
- client/contact/address
- work order
- photos/drawings
- room/window/cut list
- checklist
- navigation
- status actions
- upload before/after photos
- completion notes

Installer does not see:

- client price
- company profit
- owner margin
- sensitive project finance

## Finance ERP

Owns:

- revenue
- payments
- direct expenses
- fixed expenses
- variable expenses
- payroll
- bonuses
- commissions
- inventory cost
- gross profit
- net profit
- cash flow
- owner dashboard

Rules:

- every money movement must be either project-linked or overhead-classified
- project profit uses completed/earned project logic
- deposits on active projects are tracked as cash received and project liability/remaining balance
- fixed costs can be shown monthly, but should not distort unfinished project profitability
- owner dashboards should separate cash view, accrual view and project margin view

Target tables:

- `finance_accounts`
- `money_movements`
- `expense_categories`
- `project_expenses`
- `payment_transactions`
- `invoices`
- `project_financial_snapshots`
- `tax_profiles`

## Payroll

Owns:

- installer payout rules
- senior installer bonus
- per-service payroll calculations
- payroll holds
- release to pay
- payment record
- weekly/monthly payroll report

Rules:

- payroll is calculated from completed service lines
- payout requires release/approval
- payment creates finance movement
- already-paid payroll cannot be silently recalculated
- recalculation creates adjustment entries

Target tables:

- `payroll_rules`
- `payroll_ledger`
- `payroll_holds`
- `payroll_payments`
- `payroll_adjustments`

## Communications

Owns:

- SMS
- email
- WhatsApp
- Telegram
- internal notifications
- customer communication timeline
- inbound replies

Target model:

- CRM action creates `communication_outbox` row
- background worker sends message
- result is logged
- inbound reply creates `inbound_message`
- manager sees customer conversation in CRM

Target tables:

- `communication_templates`
- `communication_outbox`
- `communication_events`
- `inbound_messages`
- `customer_conversations`

## AI Agent

AI should assist, not bypass business rules.

Capabilities:

- duplicate lead detection
- answer customer questions
- schedule consultations
- prepare proposal drafts
- generate follow-up text
- reactivate old leads
- summarize calls/messages
- score leads
- recommend next action
- detect missing project data
- suggest film/product based on measurement data

Rules:

- AI actions are logged
- AI cannot send money-related or legal documents without approval
- AI cannot expose hidden finance fields to restricted roles
- AI uses structured tools/endpoints, not direct DB access

## Voice AI

Future capabilities:

- answer calls
- call customers
- book appointments
- collect address and project details
- summarize conversation
- create or update lead
- notify manager

Target table:

- `voice_call_logs`
- `voice_transcripts`
- `ai_extracted_fields`

## Academy

Owns:

- onboarding
- SOPs
- videos
- quizzes
- certifications
- role-specific training paths

Modules:

- Sales/Manager
- Measurer
- Installer
- Smart Film
- Solar Film
- Security/Safety Film
- Decorative/Anti Graffiti
- Customer communication
- Complaints/reclamations
- Warehouse
- Finance basics

## 4. Target Data Flow

### Lead To Project

1. Lead arrives from website/ad/phone/manual entry.
2. AI detects duplicate and suggests next action.
3. Manager qualifies lead.
4. Consultation/measurement is scheduled.
5. Customer receives notification.
6. Measurer accepts task.
7. Measurement is completed.
8. AI/recommendation engine suggests products.
9. Manager generates proposal.
10. Client accepts and pays deposit.
11. Project is created.
12. Warehouse reserves material.
13. Cutting plan is generated.
14. Installation is scheduled.
15. Installer completes job.
16. Client accepts completion.
17. Finance recognizes revenue/cost/payroll.
18. Review/follow-up automation starts.

### Measurement To Cutting

1. Measurer adds room.
2. Measurer adds window/opening.
3. Measurer selects window type with icon.
4. Measurer adds each panel/cell.
5. System calculates billable sqft.
6. Cutting engine adds 3 inch overlap on each side.
7. System optimizes roll layout.
8. Warehouse reserves selected roll/material.
9. Work order includes cut sheet.

### Finance

1. Payment received creates payment transaction.
2. Expense creates project expense or overhead movement.
3. Material consumption comes from warehouse movement.
4. Payroll ledger comes from completed work.
5. Project financial snapshot is recalculated by backend.
6. Owner dashboard shows cash, margin, debt, payroll and taxes separately.

## 5. Security Architecture

Required controls:

- production must not expose demo login
- no frontend secrets
- server-only integration tokens
- explicit role serializers
- owner-only sensitive finance/payroll endpoints
- rate limiting on public endpoints
- proposal token expiry/revocation
- audit every public proposal action
- idempotency for payment, signing, scheduling and payroll actions
- file upload validation
- restricted Google Maps key

## 6. Migration Strategy

Never run destructive migration blindly.

Required process:

1. Backup current DB.
2. Produce schema diff.
3. Add migration.
4. Run migration locally.
5. Validate Prisma.
6. Run tests.
7. Check critical screens.
8. Only then continue feature work.

Early safe migrations:

- client addresses
- measurement panels
- cutting plans
- warehouse rolls
- communication outbox

Risky migrations:

- finance ledger
- payroll ledger
- historical project recalculation
- legacy localStorage import

## 7. Testing Strategy

Add tests before ERP money/material work.

Minimum test layers:

- unit tests for sqft and cutting calculations
- unit tests for payroll formulas
- unit tests for finance rollups
- API authorization tests
- public proposal token tests
- integration tests for proposal to project handoff
- E2E smoke tests for owner/manager/measurer/installer roles

Critical test cases:

- 30 x 50 inch glass becomes 36 x 56 inch cut
- roll selection between 60 and 72 inch works
- waste is calculated correctly
- project billable sqft differs from actual film sqft
- manager cannot see owner-only finance
- measurer cannot see money
- installer sees assigned jobs only
- payroll paid record is not silently changed

## 8. Phase Plan

### Phase 1 — Stabilize Core

- add tests
- document current routes and flows
- tighten RBAC for finance/payroll/inventory
- add idempotency pattern
- remove production risk from demo login

### Phase 2 — Measurement And Cutting

- add measurement panels
- add cutting engine
- add cutting preview API
- add cut sheet output
- add roll width optimization

### Phase 3 — Warehouse

- add vendors
- add rolls/lots
- add stock movements
- add reservations
- connect cutting to inventory

### Phase 4 — Proposal And Work Order

- enrich proposal with drawings/photos/packages
- lock accepted proposal versions
- generate installer work order from cutting plan

### Phase 5 — Communications

- add communication outbox
- add templates
- connect SMS/email/WhatsApp/Telegram through server adapters
- log inbound replies

### Phase 6 — Finance

- add finance accounts
- add money movement ledger
- add project expenses
- add project financial snapshots
- separate cash/accrual/project margin views

### Phase 7 — Payroll

- add payroll rules
- add payroll ledger
- add weekly/monthly payout flow
- add adjustment logic

### Phase 8 — AI Agent

- AI lead scoring
- AI duplicate detection
- AI next actions
- AI proposal draft
- AI customer summaries

### Phase 9 — Voice AI

- call logs
- transcripts
- structured extraction
- appointment booking

### Phase 10 — Optimization

- analytics
- marketing ROI
- area heatmap
- regular client portal
- academy certification

## 9. First Safe Implementation Stage

First safe stage after this audit:

1. Add test tooling.
2. Add a pure `cutting` domain module.
3. Add unit tests for roll widths, 3 inch overlap, waste and actual film sqft.
4. Add preview API only after tests pass.
5. Do not change database or existing CRM behavior in this stage.

This gives ROLANPRO the foundation for correct measurement, inventory, proposal, work order and project profit without risking current data.

