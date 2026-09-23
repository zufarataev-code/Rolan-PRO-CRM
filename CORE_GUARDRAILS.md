# ROLANPRO CRM Core Guardrails

This file is a preflight guardrail for implementation and review. It does not replace `DECISIONS.md`, `PROJECT_STATE.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, or PostgreSQL. When details conflict, those canonical sources win according to `AGENTS.md`.

## Purpose

Prevent agents and contributors from solving a local UI request by breaking the CRM's architecture, data model, security boundaries, or already-working workflows.

Every code task must identify the affected core invariants before implementation and verify them again before acceptance.

## Canonical sources of truth

1. GitHub `main` is the only released code source.
2. `PROJECT_STATE.md` is the live handoff/status source.
3. `DECISIONS.md` is the durable product/architecture decision log.
4. Prisma schema + migrations define the relational database contract.
5. PostgreSQL is the target system of record for CRM business data.
6. `ARCHITECTURE.md`, `DATA_MODEL.md`, and `API_SPEC.md` define the reviewed technical contract.
7. Chat history, agent memory, local browser state, screenshots, and unpushed branches are context only, never authoritative current-state evidence.

## Core product invariants

### One CRM

- `/legacy-crm` is the single visible CRM product shell during migration.
- Do not create a second owner, manager, surveyor, installer, proposal, measurement, pricing, or project application when an existing canonical path can be extended.
- Compatibility URLs may redirect, but must not become competing product shells.

### One business-data destination

- PostgreSQL is the only target authoritative CRM business-data store.
- Browser/local storage may be used only as disposable cache or legacy migration input, never as an independent source of truth.
- Existing legacy records must be mapped, preserved, migrated, and verified before a legacy write path is removed.
- Never create a parallel price list, proposal store, customer store, project store, payroll store, or assignment store to simplify one feature.

### Preserve historical records

Do not delete, rewrite, silently re-key, or orphan existing:

- customers/contacts;
- leads/deals;
- estimates/proposals;
- agreements and payment state;
- projects/orders;
- measurements/openings;
- assignments and installation records;
- communications/timeline/history;
- payroll accrual history;
- imported external IDs.

Any schema change that affects existing records requires an explicit migration path and verification.

### Commercial-to-operations lifecycle

The durable sales/operations boundary from `DECISIONS.md` remains authoritative:

- a lead/deal stays a sales object while estimating, surveying, quoting, following up, or nurturing;
- saving a quick estimate does not create an operational Project;
- the sale closes only when the Agreement is signed and the required Deposit is recorded paid;
- Project creation is an explicit operational launch after `CLOSED_WON`;
- one Project may contain multiple operational phases.

Do not introduce shortcuts that silently bypass this lifecycle unless the Owner explicitly changes the durable decision.

### One canonical record per concept

Prefer extending the canonical entity over creating a second editor/record model. In particular:

- one active measurement workflow;
- one canonical Proposal record, with public/PDF representations as outputs;
- one Project record shared by scheduling, installation, finance, and operations;
- one canonical ServiceType/ServiceAddon price list;
- one user identity/session model.

If legacy duplicates still exist, migrate or adapt them rather than adding another duplicate.

## Authorization invariants

Authorization is enforced server-side, not only by hidden UI.

- Owner: full company visibility subject to protected-action approvals.
- Manager: only permitted commercial/operational scope; no hidden owner-only assumptions.
- Surveyor/installer: only assigned operational records and safe reference data.
- Surveyors/installers must not receive selling prices, payment totals, costs, margins, company finance, or other employees' compensation unless a later explicit durable decision changes this.
- Employee credential/session rules in `DECISIONS.md` must remain intact.

A UI change is not accepted if the API response leaks data the role should not receive.

## Calculation invariants

- Canonical financial, price, fee, margin, payroll, and project-economics calculations belong on the backend/server side.
- The browser may display server results but must not become a second calculation authority.
- Historical payroll/payment snapshots must not be retroactively changed by later configuration edits unless explicitly designed as a migration.

## Security invariants

- Never commit secrets, `.env`, customer exports, production uploads, private financial values, passwords, OAuth tokens, or API keys.
- Secrets live in protected server environment/configuration.
- Destructive migrations, production deploys, live payment changes, credential changes, and real customer communications follow the repository/AI-system approval gates.
- Do not weaken current session invalidation, password-reset, webhook verification, role filtering, or audit protections merely to make a feature easier to implement.

## Required implementation preflight

Before writing code, the Builder must record:

1. **Owner-visible outcome** — the exact result the user should see or be able to do.
2. **Current path** — files/routes/functions/models currently responsible for that behavior.
3. **Canonical data owner** — which PostgreSQL model/API/source owns the affected data.
4. **Existing decisions** — relevant entries from `DECISIONS.md`.
5. **Overlap check** — open PRs/branches touching the same behavior.
6. **Core invariants affected** — list the sections of this file that must remain true.
7. **Smallest safe change** — reuse/extend before replacing or duplicating.
8. **Acceptance tests** — concrete user-visible and regression checks.

If the requested change conflicts with a durable decision, stop and ask the Owner for an explicit decision change rather than silently overriding it.

## Required verification gate

Before handoff/review, verify all applicable items:

- requested Owner-visible flow works;
- existing related flow still works;
- `pnpm test` passes;
- TypeScript check passes;
- production build passes;
- desktop behavior is checked when applicable;
- mobile behavior is checked for CRM workflows used on phones;
- no new duplicate source of truth was introduced;
- no existing data was deleted or made unreachable;
- role responses remain server-safe;
- migrations are reversible/safely forward-compatible as required;
- changed files are scoped to the task.

Reviewer must return `CHANGES_REQUIRED` if any core invariant is violated even when the requested screen appears visually correct.

## Missed-the-point correction rule

If the Owner says the result is wrong or missed the point:

1. compare the implementation with the original Owner-visible outcome;
2. identify the failed acceptance criteria only;
3. preserve already-correct code and behavior;
4. inspect the latest repository state and diff;
5. create a narrow correction rather than restarting the whole feature;
6. re-run the affected regression and core gates.

The goal is to avoid repeated broad rewrites and unnecessary Builder/Codex usage.
