# Service production stages — release handoff

Branch: `codex/service-production-stages`, based on `main` `a69debc`.

The existing Project card supports multiple stages per service with separate start/end times, internal crews, a responsible specialist, contractor firms and optional dependencies. Assignment follows accepted Proposal. Calendar visits and the command-center schedule use the same stages.

The owner and assigned manager can record direct expenses against a Project or service. Each contractor obligation produces one direct expense; completion records actual cost separately from payment. Reprojection preserves payment history. Unassigned internal stages retain a reference labor reserve.

Completed piecework stages receive server-calculated immutable payroll snapshots. Shares partition the existing service budget. Weekly payroll uses each stage's completion date and stage identity to prevent duplicate payment at overall Project close. Existing salary and fixed-per-job rules remain unchanged.

Field roles can request progress only for their own stages. Assignments, rates, timestamps and other people's payroll remain server-owned. Installers receive their own stage earnings; managers do not receive employee payroll snapshots.

Additional scope requires an auditable client approval before production and cannot increase committed revenue before approval. The existing Proposal acceptance path initializes scope approval.

Local verification: 712 tests, TypeScript, production build and inline-script checks passed. The authenticated CI browser scenario covers creation, contractor cost, shares, save/reload and layout at 390/1440 pixels. Local visual execution was blocked by an unavailable Chromium binary and failed browser download; CI/browser results must pass before merge.

The user explicitly authorized publication of the code, tests and documentation to `zufarataev-code/Rolan-PRO-CRM`. Automatic review separately rejected transmission of the existing large Project journal because it contained unrelated operational/personal history. That journal is preserved unchanged in this release; this scoped handoff contains only technical release information.

No production business records were written during development. Release through protected main only after CI and review, then verify the backed-up production deployment. The separately tracked relational migration is unchanged.
