# Artmonia ERP

Artmonia ERP is a role-based education ERP built with Next.js, React, and TypeScript. The repository contains application modules for CRM, student operations, attendance, billing and debt control, HR, dashboards, marketing, audit, and integrations.

The application includes UI, server-side domain logic, database migrations, and regression tests. The numbered blueprint documents describe the original plan and may contain historical stage or infrastructure assumptions; they are not a statement of feature completeness or production readiness.

Agent contributors should start with [AGENTS.md](AGENTS.md) for repository boundaries, business rules, security requirements, and verification commands.

## Core Stack

- App: Next.js App Router, React, TypeScript
- Deployment configuration: Railway with Railpack (`railway.json`, `railpack.json`); earlier blueprints reference Vercel
- Backend model: full-stack modular monolith through Next.js Server Components, Server Actions, Route Handlers, and domain services
- Database: Supabase Postgres
- Auth: Supabase Auth mapped to internal ERP users and roles
- ORM: Prisma for transactional domain writes, SQL views for dashboard/reporting reads
- Storage: server-side storage adapters, including Supabase and Cloudflare R2; inspect `src/server/storage/` for each file category
- Integrations: mobile APIs, Meta/Instagram, and MCP; see the feature-specific contracts in `docs/`

## Local Development

Use Node.js `>=22 <25` and npm. CI uses Node 22 and npm 10.9.4.

1. Copy `.env.example` to `.env.local` if a local environment file does not already exist. Fill in the settings for the features you need; keep credentials out of version control.
2. Run `npm ci` to install locked dependencies and generate the Prisma client.
3. Run `npm run dev` to start the application, normally at `http://localhost:3000`.

Database-backed flows require a configured database and authentication environment. Installation does not apply migrations or seed data. Inspect `prisma.config.ts` and the migration history before using database commands against an identified development target.

## Verification

```sh
npm run lint
npx next typegen
npm run typecheck
npm test
```

Use `npm run build` to verify the production build. After schema changes, run `npm run prisma:validate` and `npm run prisma:generate`. Dependency changes also require `node scripts/check-lockfile.mjs`; CI includes `npm audit --audit-level=high`.

Tests are colocated under `src/` as `*.test.ts` and run with Node's test runner through `tsx`. Operational scripts named `verify-*` are separate from the test suite and must be inspected for database access or writes before use.

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

## Repository Structure

- `src/app/`: routes, layouts, and HTTP endpoints
- `src/modules/`: domain UI, queries, actions, services, and tests
- `src/components/`: reusable UI components
- `src/server/`: authentication, RBAC, database, storage, and integration infrastructure
- `src/lib/`: shared helpers
- `prisma/` and `supabase/migrations/`: data model and migration history
- `scripts/`: test runner and operational tools
- `docs/`: architecture plans and integration contracts

See [AGENTS.md](AGENTS.md) for detailed ownership and contribution rules.
