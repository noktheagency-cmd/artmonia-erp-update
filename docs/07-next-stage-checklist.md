# Next Stage Checklist

Use this checklist when moving from blueprint to implementation.

## Before Scaffold

- Confirm final app language for UI text.
- Confirm brand assets and UI/UX direction.
- Confirm Supabase project exists.
- Confirm Vercel project/account access.
- Confirm local package manager: npm, pnpm, or bun.

## Scaffold

- Create Next.js App Router project with TypeScript.
- Add Tailwind and selected component system after UI direction is known.
- Add env validation.
- Add lazy database and Supabase client initialization.
- Add protected route shell.
- Add role-aware navigation.

## Supabase And Prisma

- Create Supabase project.
- Add env vars to `.env.local` and Vercel.
- Configure pooled `DATABASE_URL`.
- Configure direct `DIRECT_URL` for migrations.
- Convert SQL blueprint into Prisma schema and real migrations.
- Generate Prisma client.
- Add seed command.

## Foundation Code

- `src/server/auth` - session and ERP user resolver
- `src/server/rbac` - permission guard
- `src/server/db` - Prisma lazy singleton
- `src/server/supabase` - browser/server Supabase clients
- `src/modules/audit` - audit writer
- `src/modules/tasks` - task service
- `src/modules/migration` - demo seed and future Excel import

## First Demo Flow

The first working demo should prove the architecture before detailed UI polish:

1. Login as Owner.
2. See protected ERP shell.
3. Open dashboard with seed KPI cards.
4. Open student list with server filters.
5. Open student profile.
6. Change lifecycle status with audit log.
7. Add payment and allocate it to invoice.
8. See finance/debt metrics update from source data.

## Quality Gate

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Seed reset works locally.
- No secret keys are exposed to browser bundle.
- P0 mutation paths write audit logs.
