# Project entry and October reconciliation — implementation contract

Issue: #453. Branch: feature/project-entry-october-reconciliation.

## Constraints
Preserve existing Project-as-services model and CRM visual tokens. No new competing project entity or standalone accounting ledger.

## Single-screen input
Project header (customer, site, status, order date, completion date); service rows with direction (Solar, Smart, Security, Privacy, Decorative), subtype, units, quantities, price, discount, executor, scheduled date; service materials with typed inventory categories (film, power supply, remote, silicone, wire, cable channel, other); project expenses; payments; calculated financial summary. Support add/remove service without navigation and mobile stacked layout.

## Historical backfill
Explicit historical=true flag and original external order ID. On historical imports disable inventory deductions, payroll creation, client notifications, invoicing and scheduling side effects. Idempotency key = source + external order ID. Display dry-run preview before save; persist original transaction dates. Existing ledger transactions must be linked, never recreated.

## Reconciliation invariants
All monetary values in integer cents. Revenue = sum(service gross - discount - refunds), with explicit handling of sales tax as liability rather than revenue. Direct costs = consumed material cost + labor + subcontractors + directly attributable expenses + applicable commissions, each booked exactly once. Gross profit = revenue - direct costs; gross margin = gross profit/revenue when revenue != 0, otherwise null. Operating profit = gross profit - allocated overhead. Tax reserve is an estimate based on configurable policy, not a definitive tax liability. Cash collected = sum(successful payment amounts - refunds), grouped by payment date; receivables = invoiced/earned amount less applied payments subject to accounting policy. Do not add project payments to revenue a second time.

Allocation: use an explicitly selected allocation base (e.g. recognized revenue share) with deterministic rounding and remainder assignment. Preserve source overhead ledger and record allocation policy/version. Separate project completion-period profitability from cash-period reporting.

## Required test fixtures
- One project, two services, different executors and dates
- Mixed film and non-film components, quantities in sqft/lf/pcs
- Zero revenue, negative margin, discount, refund, partial payment
- Manager commission eligible/ineligible, shared project cost booked once
- Backfill repeated twice produces no additional inventory/payroll/notification activity
- Cross-month completion vs payment and monthly reconciliation
- Allocated overhead sums exactly to the selected month overhead total in cents
- Mobile project editor is reachable and usable

## Release gates
Inspect existing schema, UI, accounting calculation functions and tests before coding. Add integration tests using existing test harness. Run npm test, npm run typecheck, npm run build, and targeted mobile QA. Do not deploy before verified reconciliation.
