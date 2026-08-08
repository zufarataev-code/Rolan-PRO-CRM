# ROLANPRO API Specification

## Conventions

- Base path: `/api/v1`
- Auth: bearer token
- Response envelope:

```json
{
  "data": {},
  "meta": {},
  "errors": []
}
```

- All status, catalog, role, city, template, and problem fields should use IDs in write payloads.
- UI-facing responses may include both raw IDs and resolved labels.
- Position forms must be dynamic and loaded from service configuration endpoints, not hardcoded in the frontend.
- Internal UI responses should default to Russian display labels.
- Client-facing proposal, agreement, invoice, completion-form, warranty, and email rendering should use English display labels.
- Translation-aware reference responses should expose raw translation fields plus a resolved `label` for the requested context.
- Required bilingual reference pattern:
  - `name_ru`, `name_en`
  - domain-specific variants such as `category_name_ru`, `category_name_en`
  - `item_name_ru`, `item_name_en`

## Dashboard

### `GET /api/v1/dashboard`

Purpose:

- Load the full dashboard screen in one request.

Query params:

- `date`
- `city_id`
- `manager_id`

Returns:

- `kpis`
- `finance_indicators`
- `today_by_installer`
- `board_snapshot`
- `unassigned_projects`
- `overdue_jobs`
- `recent_activity`
- `live_notifications`

Example response shape:

```json
{
  "data": {
    "kpis": {
      "active_projects": 42,
      "todays_installs": 9,
      "unassigned_projects": 4,
      "overdue_jobs": 3,
      "problem_flags": 5,
      "pending_payments": 7
    },
    "finance_indicators": {
      "cash_on_hand": 12000,
      "bank_balance": 68500,
      "stripe_pending": 4200,
      "tax_reserve": 9600,
      "available_to_withdraw": 18300,
      "revenue_this_month": 74200,
      "expenses_this_month": 32800,
      "overhead_this_month": 12100,
      "payroll_this_month": 15400,
      "gross_profit": 41400,
      "margin_percent": 55.8,
      "net_profit": 22100,
      "outstanding_invoices": 18800
    },
    "today_by_installer": [],
    "board_snapshot": [],
    "unassigned_projects": [],
    "overdue_jobs": [],
    "recent_activity": [],
    "live_notifications": []
  }
}
```

### `POST /api/v1/dashboard/alerts/{notificationId}/acknowledge`

Purpose:

- Mark a live notification as acknowledged from the dashboard.

## Finance

### `GET /api/v1/finance/dashboard`

Purpose:

- Load company-level finance dashboard indicators and balances.

Query params:

- `period`

Returns:

- `finance_indicators`
- `accounts`
- `outstanding_invoices`
- `top_overhead_categories`
- `company_financial_summary`

### `GET /api/v1/finance/accounts`

Purpose:

- Load active finance accounts with current balances.

Returns:

- `items`

Each item should include:

- `account_id`
- `account_name`
- `account_type`
- `currency`
- `current_balance`
- `is_active`

### `POST /api/v1/finance/accounts`

Purpose:

- Create a finance account.

Write fields:

- `account_name`
- `account_type`
- `currency`
- `is_active`

### `GET /api/v1/finance/money-movements`

Purpose:

- Load ledger records for project-linked and overhead money movements.

Query params:

- `date_from`
- `date_to`
- `account_id`
- `project_id`
- `client_id`
- `vendor_id`
- `category_id`
- `direction`
- `status`
- `page`
- `page_size`

Returns:

- `items`
- `summary`
- `pagination`

Validation rule:

- each record must be either project-linked or overhead-classified

### `POST /api/v1/finance/money-movements`

Purpose:

- Create a money movement ledger record.

Write fields:

- `date`
- `type`
- `direction`
- `amount`
- `account_id`
- `project_id` nullable
- `client_id` nullable
- `vendor_id` nullable
- `category_id`
- `subcategory_id` nullable
- `payment_method`
- `status`
- `notes`

### `PATCH /api/v1/finance/money-movements/{movementId}`

Purpose:

- Update a finance ledger record.

### `GET /api/v1/finance/payables`

Purpose:

- Load accounts payable records.

Query params:

- `status`
- `due_from`
- `due_to`
- `project_id`
- `vendor_id`
- `page`
- `page_size`

Returns:

- `items`
- `summary`
- `pagination`

### `POST /api/v1/finance/payables`

Purpose:

- Create a payable.

Write fields:

- `vendor_id`
- `category_id`
- `project_id` nullable
- `amount`
- `due_date`
- `status`
- `notes`

### `PATCH /api/v1/finance/payables/{payableId}`

Purpose:

- Update payable status or details.

### `GET /api/v1/projects/{projectId}/financials`

Purpose:

- Load project financial performance.

Returns:

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

### `GET /api/v1/finance/company-summary`

Purpose:

- Load company finance summary by period.

Query params:

- `period`

Returns:

- `period`
- `revenue_total`
- `project_gross_profit_total`
- `overhead_total`
- `payroll_total`
- `tax_reserve`
- `owner_draw`
- `net_profit`
- `cash_available`

## Projects List

### `GET /api/v1/projects`

Purpose:

- Load the projects list with filters, sorting, and pagination.

Query params:

- `search`
- `project_status_id`
- `payment_status_id`
- `priority`
- `city_id`
- `lead_installer_id`
- `problem_flag`
- `complexity_level_id`
- `date_from`
- `date_to`
- `page`
- `page_size`
- `sort_by`
- `sort_dir`

Returns:

- `items`
- `filters`
- `summary`
- `pagination`

Each item should include:

- `project_id`
- `client_name`
- `city_name`
- `project_name`
- `service_summary`
- `install_date`
- `install_time`
- `complexity`
- `helpers_count`
- `lead_installer`
- `payment_status`
- `priority`
- `problem_flag`
- `project_status`

### `GET /api/v1/projects/{projectId}/preview`

Purpose:

- Load quick-preview details without opening the full project card.

### `POST /api/v1/projects`

Purpose:

- Create a new project.

Write fields:

- `client_id`
- `project_name`
- `project_status_id`
- `payment_status_id`
- `priority`
- `address`
- `city_id`
- `zip_code`
- `install_date`
- `install_time`
- `lead_installer_id`
- `complexity_level_id`
- `manager_notes`
- `installer_notes`
- `what_to_bring`

### `PATCH /api/v1/projects/bulk`

Purpose:

- Bulk-edit selected projects from the list screen.

Supported bulk fields:

- `project_status_id`
- `payment_status_id`
- `priority`
- `lead_installer_id`
- `problem_flag`

## Project Card

### `GET /api/v1/projects/{projectId}`

Purpose:

- Load the full project card.

Returns:

- `header`
- `overview`
- `crew_assignment`
- `positions`
- `schedule`
- `files`
- `documents`
- `activity_log`
- `email_actions`
- `notifications`
- `finance_snapshot`

`finance_snapshot` should include:

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

### `PATCH /api/v1/projects/{projectId}`

Purpose:

- Update project-level data.

Write fields:

- `project_status_id`
- `payment_status_id`
- `priority`
- `city_id`
- `zip_code`
- `lead_installer_id`
- `complexity_level_id`
- `manager_notes`
- `installer_notes`
- `what_to_bring`
- `problem_flag`
- `problem_type_id`

### `POST /api/v1/projects/{projectId}/positions`

Purpose:

- Add a position to the project.

Write fields:

- `service_type_id`
- `dynamic_fields` object
- `selected_addons` array
- `client_price`
- `extra_costs`
- `position_status_id`
- `complexity_level_id`
- `warehouse_item_id`
- `notes`

Notes:

- `dynamic_fields` must be validated against `service_field_config` for the chosen `service_type_id`.
- `selected_addons` must be validated against `service_addons` for the chosen `service_type_id`.

### `PATCH /api/v1/projects/{projectId}/positions/{positionId}`

Purpose:

- Update an existing position.

### `GET /api/v1/projects/{projectId}/position-builder`

Purpose:

- Load all dropdowns and defaults needed to start the `Add Position` flow.

Returns:

- `service_types`
- `employees`
- `position_statuses`
- `complexity_levels`
- `base_dropdowns`

Notes:

- Return both raw translation fields and Russian-resolved labels for internal UI usage.

### `GET /api/v1/service-types/{serviceTypeId}/position-config`

Purpose:

- Load service-specific form fields and allowed addons after service type selection.

Returns:

- `service_type`
- `field_config`
- `allowed_addons`
- `dropdowns`
- `defaults`

Notes:

- `dropdowns` should include translation-aware values and Russian-resolved labels for internal screens.

Manager flow supported by API:

1. Open add-position flow with `GET /projects/{projectId}/position-builder`
2. Select service type
3. Load dynamic config with `GET /service-types/{serviceTypeId}/position-config`
4. Submit position with `POST /projects/{projectId}/positions`

### `POST /api/v1/projects/{projectId}/crew-assignment`

Purpose:

- Set project-level lead and helper assignments.

Write fields:

- `lead_installer_id`
- `helper_employee_ids`

### `POST /api/v1/projects/{projectId}/files`

Purpose:

- Upload field files or photos linked to project or position context.

Write fields:

- `position_id` nullable
- `installer_job_id` nullable
- `file_type`
- `file`

### `POST /api/v1/projects/{projectId}/documents`

Purpose:

- Upload or register controlled business documents.

Write fields:

- `position_id` nullable
- `document_type_id`
- `file`

### `GET /api/v1/projects/{projectId}/activity`

Purpose:

- Load project activity timeline.

### `POST /api/v1/projects/{projectId}/email-actions`

Purpose:

- Trigger an email action from the project card.

Write fields:

- `email_template_id`
- `subject_override` nullable
- `recipient_email`
- `tokens` object

Notes:

- Client-facing emails must render English template content and English reference labels.

### `GET /api/v1/projects/{projectId}/notifications`

Purpose:

- Load notifications linked to this project.

## Scheduling Board

### `GET /api/v1/schedules/board`

Purpose:

- Load the scheduling board for `day` or `week` view.

Query params:

- `view=day|week`
- `date`
- `city_id`
- `crew_id`
- `installer_id`
- `schedule_status_id`

Returns:

- `time_slots`
- `crew_columns`
- `open_unassigned_lane`
- `conflicts`
- `board_meta`

Each schedule card should include:

- `schedule_id`
- `project_id`
- `project_name`
- `client_name`
- `service_summary`
- `lead_installer`
- `helpers`
- `start_time`
- `end_time`
- `arrival_window`
- `schedule_status`
- `problem_flag`
- `materials_missing`
- `unassigned`

### `POST /api/v1/schedules`

Purpose:

- Create a schedule record.

Write fields:

- `project_id`
- `install_date`
- `start_time`
- `end_time`
- `arrival_window`
- `schedule_status_id`
- `lead_installer_id`
- `helper_employee_ids`
- `notes`

### `PATCH /api/v1/schedules/{scheduleId}`

Purpose:

- Update schedule details.

### `POST /api/v1/schedules/{scheduleId}/move`

Purpose:

- Handle drag-and-drop move as the primary board interaction.

Write fields:

- `install_date`
- `start_time`
- `end_time`
- `lead_installer_id` nullable
- `helper_employee_ids`

Response should include:

- updated schedule
- `installer_conflicts`
- `time_conflicts`
- `warning_required`

### `POST /api/v1/schedules/{scheduleId}/assign`

Purpose:

- Assign or reassign crew members from the board.

### `GET /api/v1/schedules/conflicts`

Purpose:

- Return installer and time conflict details for the board filters/date range.

## Installer App

### `GET /api/v1/installer/home`

Purpose:

- Load the installer app home screen with summary widgets and tab counters.

Returns:

- `schedule_summary`
- `history_summary`
- `stats_summary`
- `payments_summary`
- `notifications_summary`

### `GET /api/v1/installer/schedule`

Purpose:

- Load the logged-in installer's assigned installation schedule.

Query params:

- `date_from`
- `date_to`
- `view`
- `job_status`

Returns:

- `items`
- `summary`

Each schedule item should include:

- `schedule_id`
- `installer_job_id`
- `project_id`
- `project_name`
- `full_address`
- `arrival_window`
- `start_time`
- `end_time`
- `lead_installer_name`
- `helpers`
- `job_status`
- `problem_flag`

### `GET /api/v1/installer/jobs`

Purpose:

- Load only jobs assigned to the logged-in installer.

Query params:

- `date`
- `job_status`

Returns:

- `items`

Each job item should include:

- `installer_job_id`
- `project_id`
- `project_name`
- `full_address`
- `start_time`
- `job_status`
- `problem_flag`

### `GET /api/v1/installer/history`

Purpose:

- Load completed and past jobs for the logged-in installer.

Query params:

- `date_from`
- `date_to`
- `project_status_id`
- `city_id`
- `page`
- `page_size`

Returns:

- `items`
- `summary`
- `pagination`

Each history item should include:

- `installer_job_id`
- `project_id`
- `project_name`
- `service_summary`
- `completed_at`
- `city_name`
- `job_status`
- `payment_status`

### `GET /api/v1/installer/stats`

Purpose:

- Load personal installer statistics for the selected period.

Query params:

- `date_from`
- `date_to`

Returns:

- `completed_jobs`
- `completed_positions`
- `completed_sqft`
- `total_zones`
- `problem_reports`
- `on_time_rate`
- `average_completion_time`

### `GET /api/v1/installer/payments`

Purpose:

- Load the installer's payment history and released payouts.

Query params:

- `period`
- `status`
- `page`
- `page_size`

Returns:

- `items`
- `summary`
- `pagination`

Each payment item should include:

- `payroll_id`
- `period`
- `project_id`
- `project_name`
- `position_id`
- `service_type`
- `calculated_payout`
- `status`
- `paid_at`

Notes:

- Installer-facing payments must be read-only.
- Show released, approved, or paid amounts according to business payout rules.

### `GET /api/v1/installer/notifications`

Purpose:

- Load installer-targeted notifications.

Query params:

- `status`
- `page`
- `page_size`

Returns:

- `items`
- `pagination`

### `POST /api/v1/installer/notifications/{notificationId}/read`

Purpose:

- Mark an installer notification as read.

### `GET /api/v1/installer/jobs/{installerJobId}`

Purpose:

- Load the full installer job detail screen.

Returns:

- `job_header`
- `address_contact`
- `assigned_positions`
- `what_to_bring`
- `manager_notes`
- `time_tracking`
- `photo_requirements`
- `checklist`
- `attachments`

### `POST /api/v1/installer/jobs/{installerJobId}/status`

Purpose:

- Apply a job-status transition.

Write fields:

- `action`

Allowed actions:

- `on_the_way`
- `start`
- `pause`
- `resume`
- `complete`
- `report_problem`

### `POST /api/v1/installer/jobs/{installerJobId}/photos`

Purpose:

- Upload before or after photos.

Write fields:

- `photo_phase`
- `files`

### `POST /api/v1/installer/jobs/{installerJobId}/checklist`

Purpose:

- Save checklist progress.

Write fields:

- `checklist_template_id`
- `items`
- `checklist_completed`

### `PATCH /api/v1/installer/jobs/{installerJobId}/comment`

Purpose:

- Save installer comments.

Write fields:

- `installer_comment`

## Installer Internal Chat (Optional)

### `GET /api/v1/installer/chat/threads`

Purpose:

- Load chat threads visible to the logged-in installer.

Query params:

- `context_type`
- `project_id`
- `installer_job_id`

Returns:

- `items`

### `GET /api/v1/installer/chat/threads/{threadId}`

Purpose:

- Load one contextual chat thread with messages.

Returns:

- `thread`
- `messages`

### `POST /api/v1/installer/chat/threads/{threadId}/messages`

Purpose:

- Send a new internal chat message inside a project, schedule, or job thread.

Write fields:

- `message_text`
- `attachment_file_ids` array nullable

## Clients

### `GET /api/v1/clients`

Purpose:

- Load clients list with search and filters.

Query params:

- `search`
- `city_id`
- `status`
- `payment_health`
- `page`
- `page_size`

Returns:

- `items`
- `summary`
- `pagination`

### `POST /api/v1/clients`

Purpose:

- Create a new client.

Write fields:

- `name`
- `phone`
- `email`
- `billing_address`
- `service_address`
- `city_id`
- `zip_code`
- `status`

### `GET /api/v1/clients/{clientId}`

Purpose:

- Load the client preview/detail data.

### `PATCH /api/v1/clients/{clientId}`

Purpose:

- Update client information.

### `GET /api/v1/clients/{clientId}/projects`

Purpose:

- Load projects linked to the selected client.

## Settings

### `GET /api/v1/settings/bootstrap`

Purpose:

- Load all reference tables needed by forms and screen filters in one request.

Query params:

- `locale` default `ru`

Returns:

- `service_types`
- `service_field_config`
- `service_addons`
- `film_catalog`
- `employees`
- `roles`
- `crews`
- `project_statuses`
- `position_statuses`
- `payment_statuses`
- `schedule_statuses`
- `event_types`
- `complexity_levels`
- `cities`
- `warehouse_items`
- `notification_types`
- `expense_categories`
- `price_book_items`
- `pay_rules`
- `split_rules`
- `minimum_trip_rules`
- `document_types`
- `email_templates`
- `checklist_templates`
- `problem_types`

Notes:

- Each translation-aware item should return raw bilingual fields plus a resolved `label` in the requested `locale`.

### `GET /api/v1/settings/{resource}`

Supported resources:

- `service-types`
- `service-field-config`
- `service-addons`
- `film-catalog`
- `employees`
- `roles`
- `crews`
- `project-statuses`
- `position-statuses`
- `payment-statuses`
- `schedule-statuses`
- `event-types`
- `complexity-levels`
- `cities`
- `warehouse-items`
- `notification-types`
- `expense-categories`
- `document-types`
- `email-templates`
- `checklist-templates`
- `price-book-items`
- `problem-types`

Purpose:

- List records for a specific reference table.

### `POST /api/v1/settings/{resource}`

Purpose:

- Create a new reference record.

### `PATCH /api/v1/settings/{resource}/{recordId}`

Purpose:

- Update a reference record.

### `POST /api/v1/settings/{resource}/{recordId}/deactivate`

Purpose:

- Soft-disable a reference value without deleting history.

### `POST /api/v1/settings/email-templates/{emailTemplateId}/preview`

Purpose:

- Render a preview for an email template with tokens.

### `POST /api/v1/settings/checklist-templates/{checklistTemplateId}/preview`

Purpose:

- Render a checklist template preview before assigning it to jobs or services.

## Notification Triggers

The backend should emit notification jobs when these API operations occur:

- project assignment changed
- schedule moved
- schedule conflict unresolved
- installer marked `on_the_way`
- installer marked `problem_reported`
- installer payout released
- installer payout marked paid
- new internal chat message in subscribed thread
- payable due or overdue
- outstanding invoice threshold exceeded
- required photos missing at completion
- project `problem_flag` enabled
- materials missing on scheduled work
- email action sent
- service position created
- service position addon changed
