# Supabase Connection

Connected Supabase project:

- Project name: Artmoni-erp-final
- Project ref: `azhriwieowdeuvbqjqvl`
- Region: `eu-central-1`
- API URL: `https://azhriwieowdeuvbqjqvl.supabase.co`
- Database host: `db.azhriwieowdeuvbqjqvl.supabase.co`

Previous source project:

- Project name: Academy ERP
- Project ref: `tbkjwahrbtjdwajvvvur`
- Region: `ap-southeast-1`

## Local Env

`.env.local` now contains:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_HOST`
- `DATABASE_URL` using the Supabase transaction pooler on port `6543`
- `DIRECT_URL` using the Supabase session pooler on port `5432`

Both database URLs use the `aws-1-eu-central-1.pooler.supabase.com` pooler host and set the Postgres search path to `erp,public,extensions`.

Sensitive Supabase values are filled in local `.env.local` from the new Supabase dashboard. Do not commit or print them. Required local/deployment values are:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- database password in `DATABASE_URL` and `DIRECT_URL`

The direct database host resolves as IPv6-only in this environment, so local development uses Supabase pooler endpoints for reliable IPv4 connectivity.

## Applied Remote Setup

Applied through the Supabase connector to `azhriwieowdeuvbqjqvl`:

- Created schema: `erp`
- Enabled extension: `pgcrypto`
- Enabled extension: `pg_trgm`
- Added schema comment marking `erp` as the private ERP domain schema

Applied through the Supabase connector from local Prisma migration SQL:

- Migration: `20260612103257_init_erp_core`
- Created the ERP P0 domain tables, indexes, relations, and enums in the `erp` schema
- Migration: `20260612104321_add_foreign_key_indexes`
- Added covering indexes for foreign keys flagged by Supabase Performance Advisor
- Migration: `20260614093000_add_student_list_performance_indexes`
- Added student list and search performance indexes
- Migration: `20260614103000_add_crm_dashboard_performance_indexes`
- Added CRM and dashboard performance indexes
- Prisma migration history was recorded in `erp._prisma_migrations`

Data migration status:

- Real data has been copied from the Singapore source project to the Frankfurt target project.
- Auth data copied: `auth.users` 1 row and `auth.identities` 1 row.
- Auth sessions/refresh tokens were not copied. Users should sign in again on the new project because project JWT secrets differ.
- Storage buckets/objects are 0 on both projects, so there was no storage payload to copy.
- Keep the Singapore source project until the final application cutover and login flow are verified.

Current verification snapshot:

- ERP base tables: 29
- Prisma migrations marked finished: 4
- Copied ERP data counts on the Frankfurt project match the Singapore source project:
  - `erp.users`: 5
  - `erp.contacts`: 12
  - `erp.students`: 7
  - `erp.leads`: 3
  - `erp.enrollments`: 7
  - `erp.invoices`: 7
  - `erp.payments`: 6
  - `erp.tasks`: 4
  - `erp.roles`: 7
  - `erp.permissions`: 31
- Supabase Security Advisor: no lints
- Supabase Performance Advisor: only `unused_index` info notices are expected before real application traffic/data import

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
