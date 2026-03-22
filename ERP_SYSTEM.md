# ROLANPRO ERP System

## Platform Scope

The platform includes current modules and planned expansion areas:

- `CRM`
- `Scheduling`
- `Dispatch`
- `Installer App`
- `Inventory`
- `Payroll`
- `Finance`
- `Analytics`
- `Documents`
- `Email`
- `Notifications`

## Architecture Principle

The application database remains the source of truth across the whole ERP.

- Stores operational records
- Stores financial inputs and outputs
- Supports backend calculations and finance logic
- Feeds all ERP modules through the backend layer

`Web CRM` is the current application layer.

- The CRM reads from the backend API
- The CRM writes permitted input fields back to the backend
- Financial logic stays in backend services, not in the frontend
- The system is designed to expand into broader ERP modules later

## Module Definitions

### `CRM`

Owns customers, projects, service positions, statuses, and internal coordination data.

Primary current areas:

- `manager`
- `owner`
- `projects`
- `clients`

### `Scheduling`

Owns project timing, visit windows, crew calendars, and schedule visibility.

Primary board rule:

- The scheduling board is based on project install date and time.

Related current area:

- `schedule`

### `Dispatch`

Owns day-of-job assignment flow, crew routing, job readiness, and execution state.

### `Installer App`

Owns field workflows for installers, including assigned jobs, notes, progress, and confirmations.

Related current area:

- `installer`

Primary visibility rule:

- Installers should only see jobs assigned to them.

### `Inventory`

Owns stock, materials, allocation, and usage against projects or service items.

Current status:

- Planned as a scalable future module.

### `Payroll`

Owns payroll inputs, installer compensation references, and pay-related operational records.

Important rule:

- Payroll calculations should remain in backend services.
- The app should capture and present payroll data without duplicating logic.

Current status:

- Planned as a scalable future module.

### `Finance`

Owns finance visibility, totals, margins, costs, and payment-related outputs.

Important rule:

- This module displays finance data from backend services.
- It must not become a second finance calculation engine.

Current status:

- Planned as a scalable future module.

### `Analytics`

Owns dashboards, KPIs, operational reports, and management insights.

### `Documents`

Owns generated files, contracts, attachments, and project paperwork.

### `Email`

Owns outbound communication, templates, and project/client email history.

### `Notifications`

Owns alerts, reminders, status changes, and task-triggered messaging.

## Recommended Workspace Structure

Top-level functional modules:

- `crm`
- `scheduling`
- `dispatch`
- `installer-app`
- `inventory`
- `payroll`
- `finance`
- `analytics`

Existing workflow areas already present:

- `manager`
- `installer`
- `owner`
- `projects`
- `schedule`
- `clients`
- `documents`
- `email`
- `notifications`

Shared system layers:

- `api`
- `integrations`
- `ui`
- `components`
- `styles`

## Cross-Module Rule

All modules should use the same integration layer and consistent IDs for:

- `project_id`
- `service_item_id`
- `client_id`
- `installer_id`

This keeps CRM, Scheduling, Dispatch, Inventory, Payroll, Finance, and Analytics synchronized through one backend and one application database.

## Required Capabilities

- Role-based access control for `manager`, `installer`, and `owner`
- Notifications as a built-in system capability
- Email actions directly from the project card
- Scheduling driven by install date and install time
- Installer app visibility restricted to assigned jobs
