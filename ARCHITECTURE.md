# ROLANPRO ERP System Architecture

## Core Principle

The application database is the source of truth for this system.

- Stores operational data
- Stores financial data
- Supports business calculations through backend services
- Remains the core for finance-related outputs through backend logic

`Web CRM` is the current interface layer.

- Displays data to users
- Lets users create and update records
- Sends changes to the backend API
- Reads calculated results back from the backend
- Provides the base for future ERP modules

## Localization Rule

- Internal `CRM / ERP / Installer App` screens must use Russian labels.
- All client-facing outputs must use English labels and content:
  - proposals
  - agreements
  - invoices
  - completion forms
  - warranty documents
  - client emails
- Reference-driven labels must not be hardcoded in UI or document templates.
- The backend should resolve translation-aware reference values for the requested output context.

## Responsibility Split

### Application Database

- Primary data store for the ERP
- Stores operational and financial records
- Supports relational links between all business entities
- Returns source data for backend services and UI modules

### Web CRM

- Authentication and access flows
- Role-based screens for `manager`, `installer`, and `owner`
- Forms, tables, filters, dashboards, and workflow actions
- Validation of required fields and input format
- Read/write integration with the backend API

Current and planned system modules include:

- `CRM`
- `Survey`
- `Proposal`
- `Projects`
- `Scheduling`
- `Dispatch`
- `Installer App`
- `Settings / Reference Tables`
- `Warehouse`
- `Payroll`
- `Finance`
- `ERP Dashboard`
- `Documents`
- `Email`
- `Notifications`

### API / Integration Layer

- Acts as the system backend and business-logic layer
- Handles auth, RBAC, validation, and calculations
- Reads and writes application data
- Normalizes responses for the UI
- Can add logging, retries, background jobs, and error handling

### File Storage

- Stores uploaded photos, field files, and business documents
- Connects to `Attachments_Files` and `Documents`
- Keeps binary files separate from the primary application database

## Core Data Backbone

The system backbone is:

- `Clients`
- `Projects`
- `Project_Positions`
- `Employees`
- `Schedule`
- `Installer_Jobs`
- `Attachments_Files`
- `Activity_Log`
- `Service_Types`
- `Service_Field_Config`
- `Service_Addons`
- `Film_Catalog`
- `Roles`
- `Crews`
- `Project_Statuses`
- `Position_Statuses`
- `Payment_Statuses`
- `Schedule_Statuses`
- `Complexity_Levels`
- `Cities`
- `Notification_Types`
- `Vendors`
- `Accounts`
- `Money_Movements`
- `Expense_Categories`
- `Payables`
- `Project_Financials`
- `Company_Financial_Summary`
- `Document_Types`
- `Email_Templates`
- `Checklist_Templates`
- `Problem_Types`
- `Warehouse`
- `Warehouse_Movements`
- `Finance`
- `Payroll`
- `Documents`
- `Notifications`
- `Email_Actions`
- `User_Access`

## Confirmed Architecture Rules

1. The application database is the data core.
2. `Web CRM` is the interface layer.
3. Projects can contain multiple service line items.
4. The scheduling board is based on project install date and time.
5. The installer app shows only assigned work and installer-specific personal data.
6. Role-based access control must be implemented.
7. The notifications system is part of the core architecture.
8. Email actions must be available from the project card.
9. The system must scale to `finance`, `inventory`, and `payroll` modules later.
10. Service-specific position forms must be loaded from reference tables and configuration, not hardcoded into one static form.
11. Every money movement must be classified as either `project-linked` or `company overhead`.
12. Internal UI labels must resolve to Russian, while client-facing documents and emails must resolve to English translation fields from reference tables.

## Project Service Model

Each `project` can contain multiple service line items.

Each service line item represents one specific offering, such as:

- `Solar Film`
- `Safety Film`
- `Smart Film`
- `Removal`
- `Silicone`
- `Block Installation`
- `Zone Connection`
- `Electrical Work`

Each line item should support these fields:

- `service_type`
- `film_category`
- `brand`
- `model`
- `sqft`
- `zones`
- `windows_qty`
- `blocks_qty`
- `zone_connections_qty`
- `film_used_sqft`
- `removal_qty`
- `silicone_qty`
- `electrical_qty`
- `client_price`
- `extra_costs`
- `assigned_installers`
- `position_status`
- `complexity`
- `warehouse_item_id`
- `notes`

Recommended data rule:

- Store one row per service line item in the application database.
- Link each service line item back to a parent `project`.
- Use `Service_Types` as the controlled list of available services.
- Use `Service_Field_Config` to define which fields appear for each service type.
- Use `Service_Addons` to define which addons are allowed for each service type.
- Use `Film_Catalog` as the controlled list of film category, brand, and model options.
- Treat `installers` as a linked list of people, ideally by ID.
- Keep project-level totals and financial rollups in backend-calculated data.

## Manager Position Builder Flow

The manager flow for positions must be:

1. Click `Add Position`.
2. Select `Service Type` from a dropdown backed by `service_types`.
3. Load service-specific fields from `service_field_config`.
4. Load allowed addons from `service_addons`.
5. Let the manager select values from dropdowns and controlled inputs.
6. Save the position.
7. Allow another service position to be added to the same project.

Dropdown-based rules:

- `service_type` must come from `service_types`
- `category`, `brand`, and `model` must come from reference-driven dropdowns
- `lead_installer` and `helpers` must come from `employees`
- statuses must come from status reference tables
- `complexity` must come from `complexity_levels`
- addons must be constrained by the selected `service_type`

## Non-Negotiable Rules

1. The frontend must not calculate finances.
2. Financial logic must live in backend services.
3. The UI must not duplicate calculation logic already defined in the backend.
4. If a value is calculated, the UI reads it from the backend.
5. Write operations should target validated backend endpoints, not direct data storage access.

## Data Flow

1. A user opens the CRM interface.
2. The CRM requests data through the backend API.
3. The backend reads from the application database and related services.
4. The backend returns project fields, service line items, raw inputs, and calculated values.
5. The CRM UI displays those values.
6. When a user updates a project or a service line item, the CRM sends the change back to the backend.

Scheduling and installer flow:

7. The scheduling board reads project install date and time from the application database.
8. Schedule records include lead installer, helpers, assigned employees, arrival window, and schedule status.
9. Assignment data determines which jobs appear in the installer app.
10. Installer jobs track travel, start, pause, completion, checklist, confirmation, and photo requirements.
11. The installer app must include dedicated sections for `schedule`, `order history`, `personal statistics`, `payments received`, and `notifications`.
12. The installer app shows only jobs, schedules, payouts, and notifications that belong to the logged-in installer.
13. Installer payment visibility should be driven by backend-approved payroll or payout records, not editable from the installer app.
14. Internal chat can be embedded, but it should be scoped to project, schedule, or job threads instead of one unstructured global chat.
15. Notifications and email actions are triggered from project, schedule, assignment, status, payout, and communication changes.

## Module Mapping

- `crm`: customer, project, and relationship workflows
- `scheduling`: planning calendar, schedule visibility, and assignments
- `dispatch`: job movement, day-of-job coordination, and crew control
- `installer-app`: field-facing installer workflows, assigned schedule, order history, personal stats, payout visibility, notifications, and optional internal chat
- `settings`: reference data, statuses, catalogs, templates, and admin-managed system options
- `inventory`: materials, stock, and allocation tracking
- `payroll`: payroll inputs and installer compensation records
- `finance`: accounts, money movements, payables, overhead tracking, project financial performance, and company cash/profit indicators powered by backend calculations
- `analytics`: reporting, KPIs, and management dashboards
- `manager`, `owner`: role-focused ERP areas
- `projects`, `schedule`, `clients`, `documents`, `notifications`, `email`: operational workflows
- `ui`, `components`, `styles`: shared frontend system
- `api`, `integrations`: internal backend services and external adapters

## Access And Communication Rules

- Access must be role-based for `manager`, `installer`, and `owner`.
- Project cards should expose email actions directly in the UI.
- Notifications should support reminders, assignment changes, and project status events.
- Installer-facing views should be filtered strictly to assigned work only.
- Installer-facing payout screens should be read-only and limited to the logged-in employee.
- Internal chat, if enabled, should be contextual to project, schedule, or installer job records.
- Project cards should expose attachments, files, and activity timeline events.
- Project cards should support dynamic position forms driven by service configuration.

## Practical Implementation Guidance

- Treat relational tables as the primary system entities.
- Keep field mapping centralized in the integration layer.
- Return both editable fields and calculated read-only fields to the UI.
- Mark formula-driven fields as read-only in the CRM UI.
- Keep finance presentation in the app, but finance calculation in backend services.
- Resolve display text from translation-aware reference tables such as `name_ru` and `name_en`, not from hardcoded strings in frontend components.
- Build account balances, project financial summaries, and company financial summaries from backend-ledger logic.
- Model service positions as child records of a project, not as flat project text fields.
- Let all ERP modules share one backend layer and one source of truth in the application database.
- Use install date and install time as first-class scheduling fields in the data model.
- Separate `Documents` from `Attachments_Files` so controlled paperwork and field uploads are not mixed.
- Maintain `Activity_Log` as the project timeline and operational audit history.
- Do not hardcode service logic directly into one static form.
- Enforce that each money movement is either linked to a project or classified as company overhead.
