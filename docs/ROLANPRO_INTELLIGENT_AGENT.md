# Rolan PRO intelligent agent

## Purpose

One assistant lives inside the existing CRM and turns operational facts into the next useful action. The mascot is its consistent visual identity. The agent never becomes a second source of CRM truth: Projects, tasks, schedules, warehouse movements, bank transactions and payroll remain in their existing authoritative stores.

## Operating loop

1. **Observe** an event or scheduled check: a lead is idle, a task is overdue, a Proposal is accepted, an installation approaches, stock is low, a payment is missing, or a bank transaction needs review.
2. **Evaluate** deterministic business rules first. Calculations and permissions never depend on a language-model answer.
3. **Explain** what changed, why it matters, confidence/source, and the proposed next action.
4. **Ask** for approval when the action writes data or affects a person, customer, money, tax, payroll or inventory.
5. **Act** through an allowlisted, idempotent application command.
6. **Audit** the observation, recommendation, approval, result and responsible user.
7. **Learn** only from confirmed structured choices, such as a merchant category or preferred task owner.

## Role experience

### Owner

- cash, card debt and transactions awaiting review;
- customer receivables, payroll owed and recurring obligations;
- progress against an explicitly configured sales plan;
- project margin and exceptions without duplicating finance formulas;
- approvals, security exceptions and cross-team bottlenecks.

### Manager

- leads and Projects without a current next action;
- callbacks, measurements, Proposals, acceptances and collections due;
- missing customer/site information;
- safe task creation for records assigned to that manager.

### Surveyor

- next assigned visit, route, contact and site access;
- missing measurements, glass facts, photos or verification;
- no company revenue, margin, bank or payroll information.

### Installer

- next assigned Work Order, route, crew, material and site instructions;
- missing prerequisites and closeout evidence;
- only personal compensation already authorized for that role.

## Financial assistant

- Bank data is immutable source evidence; categorization is a separate decision.
- Known high-confidence rules may classify automatically. Uncertain transactions remain in review.
- «Remember» creates a direction-specific merchant rule from an Owner confirmation.
- Zelle and other person-to-person transfers require a known employee/vendor match before payroll or contractor classification.
- A bank line alone never proves tax deductibility. Business purpose, receipt, vendor, Project and reviewer are retained.
- Transfers between owned accounts and card payments are transfers, not income or expense.
- Tax payments, payroll tax, sales tax, corporate income tax and owner payments remain distinct categories pending confirmed entity/tax treatment.

## Autonomy levels

| Level | Behavior | Examples |
| --- | --- | --- |
| 0 — Observe | Read-only pulse | overdue task, debt, low stock |
| 1 — Recommend | Explain a proposed action | suggest category or follow-up |
| 2 — Confirmed action | Human approves an allowlisted write | create/update a task |
| 3 — Reversible automation | Owner enables a proven rule | recurring internal reminder |
| Never autonomous | High-risk decision/action | payment, refund, tax filing, payroll release, customer send, deletion, pricing or personnel action |

## Delivery phases

### V1 — Personal pulse

- mascot entry point and role-safe insights;
- overdue work, client debt, missing next actions, next field assignment and bank review;
- confirmed, deduplicated task creation;
- role-scoped conversational context.

### V2 — Financial review

- receipts and business-purpose evidence;
- employee/vendor identity mapping;
- confidence and explanation for every suggested bank category;
- reconciliation between bank evidence and CRM expense/payroll records without duplicates;
- CPA export and an exceptions report.

### V3 — Scheduled operating rhythm

- morning personal brief, end-of-day exceptions and weekly Owner review;
- event-driven reminders after accepted Proposal, missed payment, stock shortage or incomplete closeout;
- quiet when nothing actionable changed.

### V4 — Approved safe automation

- reusable Owner-approved rules with limits, expiration and rollback;
- existing Operations Agent HMAC, allowlist and idempotency receipts for writes;
- no general-purpose tool that can bypass CRM authorization.

## Acceptance and success

- A field employee can never retrieve company money through the pulse or chat context.
- Every agent-created task shows its source and cannot be duplicated while open.
- Every proposed financial category has a reason and uncertain operations stay in review.
- No agent path can pay, send, delete, change pricing or make a tax/payroll decision without explicit approval and an authorized application command.
- Within 30 days of rollout: at least 90% of active Projects have a current next action; overdue tasks fall by 50%; at least 80% of recurring merchants are covered by confirmed rules; zero duplicate ledger expenses are created.

## Required Owner decisions before later phases

- confirmed C Corporation or S Corporation treatment from the accountant;
- approved monthly sales target and the definition of progress;
- which reminders may become reversible automation after a supervised trial;
- the final mascot source asset if it changes from the approved website mascot.
