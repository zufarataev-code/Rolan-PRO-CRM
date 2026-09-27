# ROLANPRO CRM mobile module parity

This map records how the existing desktop CRM modules are reached on a phone. Mobile and desktop render the same `/legacy-crm` document, use the same authenticated APIs and PostgreSQL-backed records, and call the same `selectAppView()` / `renderView()` module entry points.

The bottom dock is a shortcut layer only:

`Today | Leads | Projects | Calendar | More`

`More` is the complete role-aware module hub. It does not create a second workflow or data store.

## Owner and manager

| CRM area | Canonical view key | Phone entry | Roles |
| --- | --- | --- | --- |
| Today / Dashboard | `dashboard` | Bottom dock | Owner, Manager |
| New Leads | `leads` | Bottom dock | Owner, Manager |
| Cold Calls | `coldcalls` | More → Sales & Clients | Owner, Manager |
| Projects / Orders | `orders` | Bottom dock | Owner, Manager |
| Proposals / КП | `proposals` | More → Sales & Clients | Owner, Manager |
| Services & Pricing | `servicePricing` | More → Finance & Analytics | Owner, Manager; server redacts manager-only fields |
| Calendar | `calendar` | Bottom dock | Owner, Manager |
| Installer Operations | `installerOps` | More → Operations | Owner, Manager |
| Tasks | `tasks` | More → Operations | Owner, Manager |
| Academy | `academy` | More → Operations | Owner, Manager |
| Clients | `clients` | More → Sales & Clients | Owner, Manager |
| Inventory / Warehouse | `inventory` | More → Operations | Owner, Manager |
| Payroll | `payroll` | More → Finance & Analytics | Owner, Manager according to existing permissions |
| Payments Due | `paymentsdue` | More → Finance & Analytics | Owner only |
| Accounting / Money | `accounting` | More → Finance & Analytics | Owner only |
| Reports | `reports` | More → Finance & Analytics | Owner, Manager according to existing permissions |
| Team | `team` | More → Company | Owner, Manager according to existing permissions |
| Referrals | `referrals` | More → Sales & Clients | Owner, Manager |
| Reviews | `reviews` | More → Sales & Clients | Owner, Manager |
| Settings | `settings` | More → Company | Owner only |

## Surveyor and installer

| Role | Bottom dock | More hub |
| --- | --- | --- |
| Surveyor | Today, Projects, Measurements, Calendar | Tasks, profile/access, logout |
| Installer | Today, Assigned Work, Workday, Calendar | Tasks, profile/access, logout |

The server remains authoritative for record scope and finance visibility. The mobile hub is built only from the same role-filtered `navItems` that desktop uses, so it cannot expose an entry that the role does not have in the canonical CRM.

## Phone presentation contract

- Same record IDs, actions, lifecycle, auth session, API and business calculations as desktop.
- No local mobile business-data store and no second mobile API workflow.
- Fixed safe-area-aware bottom dock with 48px minimum targets.
- Full-screen `More` hub grouped by work domain, with profile/access actions.
- Existing responsive adapters convert supported tables to labeled rows, stack dense forms, and use full-screen or bottom-sheet dialogs.
- Any module-specific mobile defect must be fixed in the canonical module, not replaced by a reduced phone-only screen.

