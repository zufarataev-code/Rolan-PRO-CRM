# Rolan PRO: multi-service Project flow

The implementation keeps one Project as the operational and financial container.

```mermaid
flowchart LR
  C[Client] --> S[Object / site]
  S --> P[One Project]
  P --> D1[Solar direction]
  P --> D2[Smart direction]
  P --> D3[Safety direction]
  D1 --> L1[Service line]
  D2 --> L2[Film service]
  D2 --> L3[Zone / power / electrician]
  D3 --> L4[Film service]
  D3 --> L5[Silicone / attachment]
  L1 --> M{Sizes required?}
  L2 --> M
  L4 --> M
  M -->|yes| ME[Shared Project measurement]
  M -->|no| Q[Quantity / fixed price]
  ME --> E[Project estimate]
  Q --> E
  L3 --> E
  L5 --> E
  E --> A[Approved versioned snapshot]
  A --> CP[One client Proposal]
  CP --> PR[Per-service production stages]
  PR --> PAY[Per-service payroll and actual costs]
```

## Calculation ownership

1. `projectLines(o)` is the canonical commercial scope.
2. Window services use verified measurement area, warehouse material cost, service price and installer rate.
3. Quantity, zone, linear-foot and fixed services use their saved unit, quantity and Price Book values.
4. Direct expenses remain separate from service material/labor and can be scoped to Project, direction or service.
5. The estimate approval freezes the line list, measurements, materials, prices, payment terms and role-safe economics.
6. The Proposal is generated from that approved snapshot. It never recalculates or rebuilds a second scope.

## Operational ownership

- A service may have several production stages.
- Every stage has dates, crew, responsible specialist, optional contractor and dependency.
- Different services in the same Project may run on different dates with different specialists.
- The Project closes only when all required services/stages are complete; payments and payroll remain separate settlement events.
