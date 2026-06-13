# Phase 1 Foundation

This stage prepares the ERP core and the first real-data operating screens.

## Implemented Foundation

- Prisma 7 schema for P0 ERP entities
- Supabase SSR client and session proxy
- RBAC permission catalog and role-permission map
- Audit log writer service
- Demo seed script
- Vercel/Supabase env contract
- Dynamic Dashboard, Students, and CRM pages reading from Prisma/Supabase
- CRM P0 lead create and stage update server actions
- Server-side Students and CRM search filters

## Runtime Rules

- Use Supabase Auth for identity.
- Use internal ERP `users`, `roles`, and `permissions` for authorization.
- Use Prisma for domain transactions.
- Use pooled Supabase `DATABASE_URL` for Vercel/serverless runtime.
- Use direct `DIRECT_URL` for Prisma migrations and schema work.
- Do not allow browser code to mutate ERP tables directly.

## Seed Data

Run after a real database connection is configured:

```bash
npm run prisma:migrate -- --name init
npm run db:seed
```

The seed creates:

- Owner, admin, sales, and finance users
- Roles and permission mappings
- 4 teachers
- 6 programs
- Demo students with active, debt, group waiting, frozen, partial, and overdue states
- Invoices, payments, allocations, teacher payout preview, tasks, target, and audit log

## Completed Runtime Verification

- Supabase migrations applied to the `erp` schema.
- Demo seed runs successfully.
- Dashboard KPIs read from invoices, payments, enrollments, leads, tasks, and payout data.
- Students list reads from real contacts, enrollments, invoices, and lifecycle status.
- CRM list reads from real leads, contacts, users, and programs.
- CRM create lead action writes contact, lead, optional follow-up task, stage history, and audit log.
- CRM stage update action writes lead history and audit log.
- Browser smoke tested create/update flow and cleaned the temporary smoke lead afterward.

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Next Gate

Before lead-to-student conversion:

- Add duplicate phone warning in CRM.
- Add lead detail panel or page.
- Implement conversion transaction: lead -> student -> enrollment -> initial invoice/status history.
- Add student profile with lifecycle status mutation and audit log.
