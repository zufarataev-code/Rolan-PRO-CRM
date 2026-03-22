# ROLANPRO CRM Data Model

## Overview

The application database remains the source of truth.

The recommended structure is:

- One `project` record as the master business container
- Many `project positions` under each project
- Employees, schedule, installer jobs, warehouse, finance, payroll, and communication records linked by IDs
- Financial outputs calculated by backend services

Normalization note:

- The database should prefer foreign-key IDs for statuses, roles, crews, templates, cities, problem types, and catalog values.
- The API can still return resolved display labels for UI convenience.
- Service-specific position fields should be driven by configuration tables, not hardcoded UI logic.

Localization note:

- Internal `CRM / ERP / Installer App` screens should render Russian labels from reference data.
- Client-facing documents and communications should render English labels from the same reference data.
- Translation-aware reference tables must store explicit bilingual fields instead of relying on hardcoded text.
- Recommended bilingual pattern:
  - simple references: `name_ru`, `name_en`
  - film catalog hierarchy: `category_name_ru`, `category_name_en`, `brand_name_ru`, `brand_name_en`, `model_name_ru`, `model_name_en`
  - warehouse catalog: `item_name_ru`, `item_name_en`
  - pricing catalog rows: `price_book_items.name_ru`, `price_book_items.name_en`
- Business tables should store reference IDs; translated display text should be resolved by the backend per output context.

## Core Relationships

- One `client` -> many `projects`
- One `project` -> many `project_positions`
- One `service_type` -> many `service_field_config` records
- One `service_type` -> many `service_addons`
- One `project` -> many `schedule` records
- One `project_position` -> many `installer_jobs`
- One `project_position` -> many `project_position_addons`
- One `project`, `project_position`, or `installer_job` -> many `attachments_files`
- One `project` -> many `activity_log` records
- One `employee` -> many `installer_jobs`
- One `employee` -> many `payroll` records
- One `employee` -> many `notifications`
- One `account` -> many `money_movements`
- One `vendor` -> many `payables`
- One `project` -> one `project_financials` summary
- One `chat_thread` -> many `chat_messages`
- One `warehouse` item -> many `warehouse_movements`

## Recommended Core Tables

### `Clients`

Stores customer master data.

Suggested fields:

- `client_id`
- `name`
- `phone`
- `email`
- `billing_address`
- `service_address`
- `city`
- `zip_code`
- `status`
- `created_at`
- `updated_at`

### `Projects`

Stores project-level information.

Suggested fields:

- `project_id`
- `client_id`
- `project_name`
- `status`
- `payment_status`
- `priority`
- `address`
- `city`
- `zip_code`
- `install_date`
- `install_time`
- `lead_installer_id`
- `helper_installers`
- `complexity`
- `manager_id`
- `manager_notes`
- `installer_notes`
- `what_to_bring`
- `problem_flag`
- `created_at`
- `updated_at`

Notes:

- `project` is the container for all service positions.
- `install_date` and `install_time` are the primary scheduling inputs for the board.
- `payment_status` is operationally visible in the CRM, but finance calculations remain in backend services.
- `lead_installer_id` and `helper_installers` support quick staffing visibility at the project level.

### `Project_Positions`

Stores one row per service position inside a project.

Suggested fields:

- `position_id`
- `project_id`
- `service_type_id`
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
- `sort_order`
- `notes`
- `created_at`
- `updated_at`

Notes:

- `Project_Positions` is the canonical multi-service structure for the business.
- `service_type` should come from `Service_Types`.
- Visible service-specific fields should be loaded from `Service_Field_Config`.
- Allowed addons should be loaded from `Service_Addons`.
- Film-specific fields should map against `Film_Catalog` where relevant.
- `client_price` and `extra_costs` are input fields; totals and margin are calculated in backend services.

### `Project_Position_Addons`

Stores addons selected for a specific project position.

Suggested fields:

- `position_addon_id`
- `position_id`
- `service_addon_id`
- `qty`
- `unit_price`
- `notes`
- `created_at`
- `updated_at`

Notes:

- Addons must be validated against the selected `service_type`.
- This keeps addon logic out of one static hardcoded position form.

### `Employees`

Stores employees and installers.

Suggested fields:

- `employee_id`
- `name`
- `role`
- `phone`
- `email`
- `crew`
- `status`
- `user_account_id`
- `active`

### `Schedule`

Stores schedule-board records.

Suggested fields:

- `schedule_id`
- `project_id`
- `lead_installer_id`
- `helper_1_id`
- `helper_2_id`
- `assigned_employee_ids`
- `install_date`
- `start_time`
- `end_time`
- `arrival_window`
- `schedule_status`
- `notes`
- `created_at`
- `updated_at`

Notes:

- The scheduling board is based on `project install date` plus the schedule time fields.
- One project may have multiple schedule records when work is split across days, crews, or visits.
- `assigned_employee_ids` supports quick board rendering; normalized installer job records should still be maintained.

### `Installer_Jobs`

Stores installer-facing jobs derived from assignments and schedule.

Suggested fields:

- `installer_job_id`
- `project_id`
- `position_id`
- `schedule_id`
- `installer_id`
- `job_status`
- `on_the_way_at`
- `started_at`
- `paused_at`
- `completed_at`
- `before_photos_required`
- `after_photos_required`
- `before_photos_uploaded`
- `after_photos_uploaded`
- `checklist_completed`
- `completion_confirmed`
- `problem_reported`
- `installer_comment`
- `created_at`
- `updated_at`

Notes:

- The installer app should show only jobs assigned to the logged-in installer.
- Photo requirements and completion flags should be driven from this entity, with actual uploaded media stored in `Attachments_Files`.
- Completed jobs should feed installer history and personal statistics in backend-generated views.

### `Attachments_Files`

Stores uploaded photos, files, and field attachments.

Suggested fields:

- `file_id`
- `project_id`
- `position_id`
- `installer_job_id`
- `file_type`
- `file_url`
- `uploaded_by`
- `uploaded_at`

Notes:

- This entity is separate from business documents because it supports operational uploads from project, position, and field-job context.
- `file_type` can distinguish contract, before-photo, after-photo, receipt, issue-photo, and other upload categories.

### `Documents`

Stores business documents and document registry records.

Suggested fields:

- `document_id`
- `project_id`
- `position_id`
- `type`
- `file_url`
- `status`
- `created_by`
- `created_at`

Notes:

- `Documents` covers contracts, forms, signatures, and managed paperwork.
- `Attachments_Files` covers operational and field uploads.

### `Activity_Log`

Stores user actions and timeline events.

Suggested fields:

- `activity_id`
- `project_id`
- `user_id`
- `activity_type`
- `message`
- `created_at`

Notes:

- Activity log should support the project timeline and audit trail.
- Important schedule, assignment, and status changes should generate activity records.

### `Service_Types`

Stores allowed service offerings.

Suggested fields:

- `service_type_id`
- `service_name`
- `unit_type`
- `active`

Notes:

- `service_type` examples include `Solar Film`, `Safety Film`, `Smart Film`, `Removal`, `Silicone`, `Block Installation`, `Zone Connection`, and `Electrical Work`.
- `unit_type` can help drive UI and validation, such as `sqft`, `zones`, `qty`, or mixed input modes.

### `Service_Field_Config`

Stores the dynamic field definition for each service type.

Suggested fields:

- `service_field_config_id`
- `service_type_id`
- `field_key`
- `field_label`
- `input_type`
- `data_type`
- `dropdown_source`
- `is_required`
- `default_value`
- `sort_order`
- `active`
- `created_at`
- `updated_at`

Notes:

- The position form should be rendered from this table after the manager selects a service type.
- `dropdown_source` can point to controlled reference data such as `film_catalog`, `employees`, `complexity_levels`, and status tables.

### `Service_Addons`

Stores addons allowed for each service type.

Suggested fields:

- `service_addon_id`
- `service_type_id`
- `addon_name`
- `addon_code`
- `unit_type`
- `default_price`
- `active`
- `sort_order`
- `created_at`
- `updated_at`

Notes:

- Addons are linked to service type.
- New services and addons should be addable later without rebuilding the whole form.

### `Film_Catalog`

Stores approved film products and models.

Suggested fields:

- `film_id`
- `category`
- `brand`
- `model`
- `unit`
- `active`

Notes:

- This supports consistent brand/model selection in `Project_Positions`.
- The catalog should be referenced instead of free-form film entry where possible.

### `Warehouse`

Stores inventory master data.

Suggested fields:

- `item_id`
- `sku`
- `category`
- `brand`
- `model`
- `unit`
- `qty_on_hand`
- `location`
- `active`

### `Warehouse_Movements`

Stores inventory movement history.

Suggested fields:

- `movement_id`
- `item_id`
- `project_id`
- `position_id`
- `type`
- `qty`
- `movement_date`
- `employee_id`
- `notes`

### `Vendors`

Stores company vendors and payees.

Suggested fields:

- `vendor_id`
- `vendor_name`
- `phone`
- `email`
- `notes`
- `active`
- `created_at`

### `Accounts`

Stores company accounts used for money tracking.

Suggested fields:

- `account_id`
- `account_name`
- `account_type`
- `currency`
- `is_active`

Notes:

- Account balances should be derived from posted or cleared `money_movements`.

### `Expense_Categories`

Stores controlled finance categories for project-linked and overhead spending.

Suggested fields:

- `category_id`
- `category_name`
- `parent_type`
- `parent_category_id`
- `active`

Notes:

- `parent_type` must distinguish `project` vs `overhead`.
- `subcategory_id` in finance records can point to another row in this same table.

### `Money_Movements`

Stores the company money ledger.

Suggested fields:

- `movement_id`
- `date`
- `type`
- `direction`
- `amount`
- `account_id`
- `project_id`
- `client_id`
- `vendor_id`
- `category_id`
- `subcategory_id`
- `payment_method`
- `status`
- `notes`
- `created_by`
- `created_at`

Notes:

- Every money movement must be either `project-linked` or `company overhead`.
- If `category.parent_type = project`, then `project_id` is required.
- If `category.parent_type = overhead`, then `project_id` should be null.
- Stripe receipts, payroll payouts, vendor payments, and manual company expenses should all land in this ledger.

### `Payables`

Stores vendor bills and upcoming company obligations.

Suggested fields:

- `payable_id`
- `vendor_id`
- `category_id`
- `project_id`
- `amount`
- `due_date`
- `status`
- `notes`
- `created_at`
- `updated_at`

Notes:

- Payables can be linked to a project or remain overhead-level company obligations.

### `Project_Financials`

Stores backend-generated project financial performance.

Suggested fields:

- `project_id`
- `revenue`
- `deposit_received`
- `balance_due`
- `material_cost`
- `crew_cost`
- `project_expenses`
- `gross_profit`
- `margin_percent`
- `manager_commission`
- `net_project_profit`
- `updated_at`

Notes:

- This should be a read-only aggregate table or materialized view from the backend.

### `Company_Financial_Summary`

Stores company-level finance summary by period.

Suggested fields:

- `period`
- `revenue_total`
- `project_gross_profit_total`
- `overhead_total`
- `payroll_total`
- `tax_reserve`
- `owner_draw`
- `net_profit`
- `cash_available`

Notes:

- This should be backend-generated and exposed through dashboard and finance modules.

### `Payroll`

Stores payroll inputs and formula-driven outputs.

Suggested fields:

- `payroll_id`
- `employee_id`
- `project_id`
- `position_id`
- `period`
- `pay_basis`
- `calculated_payout`
- `status`
- `updated_at`

Notes:

- Installer-facing payment history should be derived from payroll or payout records that have been approved or paid by the business.
- The installer app may show pending and paid amounts, but those values must remain read-only for the installer role.

### `Notifications`

Stores in-app or system notification events.

Suggested fields:

- `notification_id`
- `project_id`
- `position_id`
- `installer_job_id`
- `recipient_role`
- `recipient_user_id`
- `type`
- `message`
- `status`
- `created_at`

Notes:

- Notifications should support installer-app inbox views as well as CRM alerts.
- Installer recipients should only receive records tied to their assignments, schedule changes, payout updates, or direct communication events.

### `Chat_Threads`

Stores internal conversation threads when embedded chat is enabled.

Suggested fields:

- `thread_id`
- `context_type`
- `project_id`
- `schedule_id`
- `installer_job_id`
- `created_by`
- `created_at`
- `last_message_at`
- `status`

Notes:

- Internal chat should be scoped to project, schedule, or installer-job context.
- Avoid one global unstructured chat feed; context-linked threads are safer for operations.

### `Chat_Messages`

Stores individual internal chat messages.

Suggested fields:

- `message_id`
- `thread_id`
- `sender_user_id`
- `message_text`
- `attachment_file_id`
- `created_at`
- `read_at`

Notes:

- Chat attachments can reuse `Attachments_Files`.
- Chat should complement notifications, not replace system-triggered alerts.

### `Email_Actions`

Stores project-linked email actions and history.

Suggested fields:

- `email_action_id`
- `project_id`
- `client_id`
- `template_key`
- `subject`
- `status`
- `sent_at`
- `created_by`

### `User_Access`

Stores role-based access control data.

Suggested fields:

- `user_account_id`
- `employee_id`
- `email`
- `role`
- `status`

## CRM Behavior

The CRM should:

- treat `project` as the primary business container
- show all `project positions` inside a project
- allow users to add, edit, reorder, and remove positions
- load service-specific fields dynamically after service type selection
- load allowed addons dynamically based on the selected service type
- expose email actions from the project card
- expose attachments and business documents separately
- show project timeline activity from `Activity_Log`
- enforce role-based access control
- drive scheduling views from `install_date`, `start_time`, `end_time`, and `arrival_window`
- display project-level totals from backend-calculated data
- display finance dashboards and financial summaries from backend-calculated data
- treat formula-driven financial outputs as read-only

The CRM should not:

- calculate totals itself
- recalculate finance when position fields change
- bypass backend business rules
- show installers jobs that are not assigned to them

## Installer App Behavior

The installer app should:

- show the installer's upcoming schedule based on assigned `schedule` and `installer_jobs`
- show job detail only for assigned work
- show order history from completed jobs and completed project participation
- show personal statistics generated by backend aggregation
- show payment history and paid amounts from backend-approved payroll data
- show installer-targeted notifications in a dedicated inbox
- optionally support internal project or job chat threads

The installer app should not:

- expose other installers' jobs, schedules, payouts, or history
- let installers edit payroll or payout values
- replace notifications with chat-only communication
- use a free-form global chat without project or job context

## Example Record Shape

```json
{
  "project_id": "PRJ-1001",
  "project_name": "Downtown Office Film Upgrade",
  "priority": "High",
  "payment_status": "Deposit Paid",
  "install_date": "2026-03-24",
  "positions": [
    {
      "position_id": "POS-001",
      "service_type": "Solar Film",
      "film_category": "Window Film",
      "brand": "3M",
      "model": "Prestige 70",
      "sqft": 420,
      "zones": 3,
      "windows_qty": 18,
      "client_price": 8400,
      "extra_costs": 250,
      "position_status": "Ready",
      "assigned_installers": ["EMP-01", "EMP-04"]
    },
    {
      "position_id": "POS-002",
      "service_type": "Electrical Work",
      "film_category": "Smart Film Support",
      "brand": "Lutron",
      "model": "Control Module A",
      "zones": 2,
      "electrical_qty": 2,
      "client_price": 1600,
      "extra_costs": 120,
      "position_status": "Scheduled",
      "assigned_installers": ["EMP-07"]
    }
  ]
}
```

## Implementation Guidance

- Keep stable IDs for `project`, `position`, `employee`, `schedule`, `installer_job`, `file`, `activity`, `notification`, and `email_action`.
- Centralize sheet-to-app mapping in the integration layer.
- Use `Service_Types` and `Film_Catalog` as controlled reference data.
- Use `Service_Field_Config` and `Service_Addons` to drive dynamic position forms.
- Keep project-level notes and installer-facing notes separate.
- Use `Attachments_Files` for photos and field uploads, and `Documents` for controlled paperwork.
- Mark calculated finance and payroll outputs as read-only in the app.
- Build installer statistics and payment summaries as backend-generated views or aggregates, not frontend calculations.
- Build project financials, company financial summary, and account balances as backend-generated views or aggregates, not frontend calculations.
- Enforce that every finance ledger record is either project-linked or overhead-classified.
