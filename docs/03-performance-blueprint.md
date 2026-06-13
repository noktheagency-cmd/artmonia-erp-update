# Performance Blueprint

## Performance Goal

The ERP should feel instant for daily operators and reliable for finance workflows.

Targets for MVP:

- Initial authenticated shell render: under 1.5s on normal office internet after auth
- Dashboard visible content: under 2s with seed/normal MVP data
- List page first response: under 1s for common filters
- Large list interactions: no full-table client loads
- Critical mutation response: under 500ms where no heavy recalculation is needed
- Dashboard/reports: under 2s through indexed SQL views or cached snapshots

## Frontend Smoothness

### App Shell

- Render navigation, layout, and role-specific shell first.
- Lazy-load heavy route segments such as dashboards, reports, imports, and payroll.
- Avoid loading all ERP modules into the initial route.
- Keep global providers minimal.

### UI Data Loading

- Use Server Components for initial read data.
- Use streaming/suspense for slow dashboard widgets.
- Use route-level loading states that preserve layout dimensions.
- Use optimistic UI only for reversible low-risk actions such as task completion.
- Avoid optimistic finance changes until transaction and audit flow is fully stable.

### Tables And Boards

- All tables must use server-side pagination.
- Filters and search must be sent to the server.
- Sort only on indexed or intentionally supported columns.
- Use stable row heights and virtualized lists only when record volume requires it.
- Kanban lead board should fetch column summaries first, then cards per column.

## Backend Performance

### Query Strategy

- Use selective columns instead of `select *`.
- Add indexes for every frequent filter and join path.
- Keep dashboard formulas in SQL views or dedicated query modules.
- Use `EXPLAIN ANALYZE` for slow dashboard and finance queries before adding cache.
- Use idempotency keys for imports, invoices, and payment mutation retries.

### Index Plan

High-priority indexes:

- contacts: normalized phone, full name search
- leads: stage, manager, source, next follow-up date, created date
- students: code, lifecycle status, manager, created date
- enrollments: student, teacher, program, status
- invoices: student, period, due date, status, balance
- payments: student, paid date, method, created date
- payment allocations: invoice, payment
- tasks: owner, due date, status, entity type/id
- audit logs: entity type/id, actor, created date
- teacher payout: teacher, period, status

### Dashboard Strategy

Dashboard metrics should not recalculate the whole domain graph on every card.

MVP approach:

1. Live SQL views for current metrics.
2. Query by date/program/teacher/manager/source filters.
3. Add monthly snapshot table for targets and closing.
4. Add materialized views only after measured slow queries.

### Jobs

Scheduled jobs should be chunked and idempotent:

- Select eligible rows by period/status.
- Lock or deduplicate with job run ID/idempotency key.
- Process in batches.
- Record job run result.
- Avoid long-running Vercel function execution for large imports or reports.

## Database Connection Strategy

- Use Supabase pooled connection for Vercel runtime.
- Use direct connection only for migrations and local schema work.
- Initialize DB/Supabase clients lazily in server code so builds do not fail when runtime env vars are absent.
- Keep serverless functions short and transaction boundaries tight.

## Cache Strategy

Use cache deliberately:

- Auth/user permissions: short-lived per request/session cache
- Lookup settings: cache with explicit invalidation after settings changes
- Dashboard cards: cache only when data freshness is acceptable
- Finance ledger: no stale cache after payment/refund/invoice mutation
- Export files: generated async or with explicit audit metadata

## Performance Definition Of Done

- No P0 list page loads all rows at once.
- P0 list pages include pagination, sorting, and filters.
- Dashboard KPI queries have documented source formulas.
- Heavy modules are route-split.
- Mutations write audit logs without blocking unrelated UI refreshes.
- Seed data includes enough volume to catch table/filter issues early.
