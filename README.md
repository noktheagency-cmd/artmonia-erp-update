# Artmonia ERP

Artmonia ERP is planned as a fast, role-based education ERP for CRM, student operations, billing, debt control, teacher payroll, dashboards, automation, audit, and Excel migration.

Current stage: technical foundation and implementation blueprint. UI/UX will be added in the next stage after the visual direction is provided.

## Core Stack

- App: Next.js App Router, React, TypeScript
- Hosting: Vercel
- Backend model: full-stack modular monolith through Next.js Server Components, Server Actions, Route Handlers, and domain services
- Database: Supabase Postgres
- Auth: Supabase Auth mapped to internal ERP users and roles
- ORM: Prisma for transactional domain writes, SQL views for dashboard/reporting reads
- Storage: Supabase Storage for receipts, exports, and student files
- Jobs: Vercel Cron for MVP scheduled work; Supabase/Postgres cron or a worker can be added when load requires it

## Foundation Files

- [docs/00-decisions-and-context.md](docs/00-decisions-and-context.md) - PRD context and confirmed business decisions
- [docs/01-technical-blueprint.md](docs/01-technical-blueprint.md) - architecture, modules, runtime strategy, and repo structure
- [docs/02-data-model-blueprint.md](docs/02-data-model-blueprint.md) - entities, status machines, rules, and migration shape
- [docs/03-performance-blueprint.md](docs/03-performance-blueprint.md) - smoothness, query, caching, loading, and dashboard strategy
- [docs/04-security-rbac-audit.md](docs/04-security-rbac-audit.md) - roles, permissions, authorization, audit, and data protection
- [docs/05-mvp-phase-plan.md](docs/05-mvp-phase-plan.md) - phased delivery plan and acceptance gates
- [docs/06-ui-ux-handoff.md](docs/06-ui-ux-handoff.md) - UI/UX handoff checklist for the next stage
- [docs/07-next-stage-checklist.md](docs/07-next-stage-checklist.md) - scaffold and first demo flow checklist
- [docs/08-visual-design-system.md](docs/08-visual-design-system.md) - visual system based on the approved reference direction
- [docs/09-phase-1-foundation.md](docs/09-phase-1-foundation.md) - data/auth/RBAC foundation before CRM
- [docs/10-supabase-connection.md](docs/10-supabase-connection.md) - Supabase project/env connection details
- [docs/11-instagram-dm-ingestion.md](docs/11-instagram-dm-ingestion.md) - Instagram DM webhook and history sync setup
- [database/schema-blueprint.sql](database/schema-blueprint.sql) - initial SQL blueprint for the future Supabase migration
- [.env.example](.env.example) - environment variable contract

## Build Principles

1. Keep the ERP core server-controlled. Critical operations such as status changes, payment allocation, invoice generation, payroll, refunds, and export audit must go through server-side domain services.
2. Keep reads fast. Lists use pagination, sorting, filtering, and indexes from day one. Dashboards use SQL views/materialized views where needed.
3. Keep UI smooth. The first load should render the app shell quickly, then stream or lazy-load role-specific data and heavy modules.
4. Keep finance correct. Student lifecycle status and payment state stay separate. Debt is calculated from invoice balances, not status text.
5. Keep every risky mutation auditable. Before/after JSON, actor, entity, timestamp, and reason are required for critical changes.

## Next Stage

After UI/UX direction is provided, the next implementation stage should scaffold the Next.js app, install dependencies, wire Supabase clients, add Prisma schema/migrations, and create seed/demo data for the P0 flows.
