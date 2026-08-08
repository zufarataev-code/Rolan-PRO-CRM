# ROLANPRO SYSTEM

Core product modules:

- `CRM`
- `Survey`
- `Proposal`
- `Projects`
- `Dispatch / Scheduling`
- `Installer App`
- `Warehouse`
- `Payroll`
- `Finance`
- `ERP Dashboard`

Implementation and platform areas:

- `documents`
- `email`
- `notifications`
- `clients`
- `integrations`
- `ui`
- `components`
- `styles`
- `api`

System architecture:

- The application database is the system core.
- The backend stores data and performs calculations.
- `Web CRM` is the current interface layer.
- The CRM reads from and writes to the backend API.
- The interface must not duplicate financial calculations.
- The architecture must scale into `finance`, `inventory`, and `payroll` modules later.
- The system does not depend on `Google Sheets`.

Project service model:

- One project can contain multiple service line items.
- Each service is stored as a separate position inside the project.
- Current service types:
  - `Solar Film`
  - `Safety Film`
  - `Smart Film`
  - `Removal`
  - `Silicone`
  - `Block Installation`
  - `Zone Connection`
  - `Electrical Work`
- Each service line item includes:
  - `category`
  - `brand`
  - `model`
  - `sqft`
  - `zones`
  - `price`
  - `extra expenses`
  - `installers`

Confirmed functional rules:

- Scheduling board is based on project install date and time.
- Installer app shows only assigned jobs.
- Role-based access control is required.
- Notifications are part of the core architecture.
- Email actions must be available from the project card.

Suggested structure:

- System modules and business areas live in their own top-level folders.
- High-level modules such as `crm`, `survey`, `proposal`, `projects`, and `installer-app` coordinate finer-grained workflow areas.
- Shared UI stays in `ui` and `components`.
- Global design tokens and theme work live in `styles`.
- Backend contracts, handlers, and integrations live in `api`.

Integration rule:

- `api` should act as the central backend layer for all modules.
- Calculated values should come from backend business logic, not be recomputed in the UI.
- User edits from the CRM should update source fields in the application database.

Recommended next step:

Choose the app stack we want to use for implementation, then wire the CRM, scheduling board, installer app, notifications, and project-card email actions into real routes, screens, and backend services.

Current source-of-truth architecture document:

- `ROLANPRO_V1_ARCHITECTURE.md`
