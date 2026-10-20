# Legacy CRM stability audit — 2026-10-20

## Objective

Make the active `/legacy-crm` workspace predictable while preserving existing
customer, project, finance, warehouse, payroll and field records. The safe path
is to remove overlapping behavior behind automated invariants, not to rewrite the
40,000-line workspace in one release.

## Verified baseline

- Active legacy shell: `private/legacy/rolanpro-crm-cloud.html`.
- Current size: 40,536 lines, 1,594 top-level function declarations and 178
  top-level variable declarations.
- The file parses as JavaScript without diagnostics.
- Nineteen currently open pull requests touch the same legacy HTML file. They
  must not be merged independently without rebasing and reviewing the resulting
  combined behavior.
- PostgreSQL remains the target source of truth. Browser storage is compatibility
  state only and must not become a second business database.

## Prioritized debt

Priority uses `(Impact + Risk) × (6 - Effort)`, each input scored from 1 to 5.

| Priority | Finding | Impact | Risk | Effort | Score | Action |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| P0 | Two global `printWorkOrder` declarations existed. The later old printer silently replaced the canonical printer and could omit multi-service scope, per-service crew/date, site access and Smart installation plans. | 5 | 5 | 1 | 50 | Fixed: delete the shadow printer and require one top-level declaration per function name. |
| P0 | Nineteen open PRs edit the same legacy file. Independent merges can restore removed code or silently replace a newer workflow. | 5 | 5 | 3 | 30 | Rebase and triage as one integration queue; close superseded PRs only after owner review. |
| P1 | Business UI, navigation, saving and documents live in one 40k-line global script with 1,594 global functions. | 5 | 5 | 5 | 10 | Use a strangler approach: extract one tested domain at a time while keeping the public CRM route stable. |
| P1 | Compatibility state still has several direct `localStorage` write sites alongside the server workspace save path. | 5 | 5 | 4 | 20 | Route all writes through one persistence gateway, then make browser state disposable after server parity is proven. |
| P1 | Document generators can be introduced as new global functions instead of using one canonical renderer. | 4 | 5 | 2 | 36 | Keep rendering and printing separate; add single-definition and canonical-renderer tests for each document. |
| P2 | Old PRs and branches remain open after later implementations landed, obscuring which workflow is canonical. | 4 | 4 | 2 | 32 | Produce a supersession map and archive only after comparing each branch with current `main`. |

## Remediation plan

### Phase 1 — stop new overlap

1. Keep the new top-level function uniqueness test in the full test suite.
2. Require every legacy change to reuse an existing function or explicitly
   replace it; never add a second declaration with the same name.
3. Rebase every legacy-touching PR on the current `main` before review.

### Phase 2 — one persistence path

1. Inventory direct `localStorage` writes and classify each as cache, login
   convenience, destructive reset or business-state persistence.
2. Move business writes behind the existing authenticated server workspace API.
3. Add revision/conflict tests for multiple tabs before disabling compatibility
   writes.

### Phase 3 — extract domains without changing routes

Extract in business order, one domain per reviewed PR:

1. Project service scope and estimate/proposal read model.
2. Measurement and work-order document rendering.
3. Warehouse reservation/consumption.
4. Schedule and per-service execution.
5. Finance/payroll projections.

Each extraction must preserve `/legacy-crm`, existing IDs and server contracts,
and must pass desktop, phone, clean-database and end-to-end gates before merge.

## Release rule

No mass rewrite, no automatic deletion of old PRs and no production-data
migration are part of this audit. Every release remains a small reversible PR
from current `main`, with a database backup before production activation.
