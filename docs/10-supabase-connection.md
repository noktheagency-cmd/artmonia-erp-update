# Supabase Connection

Connected Supabase project:

- Project name: Academy ERP
- Project ref: `tbkjwahrbtjdwajvvvur`
- Region: `ap-southeast-1`
- API URL: `https://tbkjwahrbtjdwajvvvur.supabase.co`
- Database host: `db.tbkjwahrbtjdwajvvvur.supabase.co`

## Local Env

`.env.local` now contains:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_HOST`
- `DATABASE_URL` using the Supabase transaction pooler on port `6543`
- `DIRECT_URL` using the Supabase session pooler on port `5432`

Both database URLs use the `aws-1-ap-southeast-1.pooler.supabase.com` pooler host and set the Postgres search path to `erp,public,extensions`.

The direct database host resolves as IPv6-only in this environment, so local development uses Supabase pooler endpoints for reliable IPv4 connectivity.

## Applied Remote Setup

Applied through the Supabase connector:

- Migration: `20260611225446_init_erp_schema`
- Created schema: `erp`
- Enabled extension: `pgcrypto`
- Added schema comment marking `erp` as the private ERP domain schema

Applied through Prisma:

- Migration: `20260612103257_init_erp_core`
- Created the ERP P0 domain tables, indexes, relations, and enums in the `erp` schema
- Migration: `20260612104321_add_foreign_key_indexes`
- Added covering indexes for foreign keys flagged by Supabase Performance Advisor
- Seeded demo data for owner/admin/finance/users, programs, teachers, students, invoices, payments, tasks, and audit data

Current verification snapshot:

- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference detected
- Demo counts: 4 users, 6 students, 2 leads, 6 programs, 4 teachers, 6 invoices, 6 payments, 3 tasks
- Supabase Security Advisor: no lints
- Supabase Performance Advisor: no unindexed foreign key lints; remaining `unused_index` info notices are expected before real application traffic

## Useful Commands

```bash
npm run prisma:validate
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
npm run build
```

## Security Notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` server-only.
- Never add service keys to `NEXT_PUBLIC_*`.
- ERP domain tables should be accessed through server-side domain services, not directly from browser code.
