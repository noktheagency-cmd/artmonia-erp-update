# Staging on Vercel (production-safe)

Goal: run the current local/Academy build on Vercel **without** touching Railway production (`erp.artmoniya.com`) or the production Supabase project.

## Preconditions

1. Railway service **artmonia-erp** → Settings → Source → **Auto deploys = Disabled**.
2. Staging data lives on the **Academy / staging** Supabase project (same as local `.env.local`), **not** production (`azhriwieowdeuvbqjqvl`).
3. Do **not** push to `main` if you later re-enable Railway auto-deploy without a review.

## Local files

```bash
npm run env:prepare-staging   # builds .env.staging from .env.local
npm run env:assert-staging    # fails if production markers are present
```

- `.env.staging` — gitignored, real secrets  
- `.env.staging.example` — committed template  

## Vercel project (one-time)

1. [vercel.com](https://vercel.com) → Add New Project → import `noktheagency-cmd/artmonia-erp` **or** deploy from CLI without linking Production domain.
2. **Do not** assign `erp.artmoniya.com` to this project.
3. Framework: Next.js. Build: `npm run build`. Install: `npm ci`.
4. Environment variables → scope **Preview** (and Development if you want):
   - Paste every non-empty key from `.env.staging`
   - Required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
5. After first Preview URL exists, set `NEXT_PUBLIC_APP_URL` to that `https://….vercel.app` and redeploy.

### CLI (optional)

```bash
npm run env:assert-staging
npx vercel login
npx vercel link          # create/link a project named artmonia-erp-staging if possible
npx vercel env add       # or paste in dashboard
npx vercel               # Preview deploy (not production)
```

Prefer **Preview** deploys (`vercel`) over `vercel --prod` until you intentionally cut over.

## What this does / does not do

| Action | Production Railway | Production DB |
|--------|--------------------|---------------|
| Vercel Preview with Academy env | Untouched | Untouched |
| `npm run db:seed` against `.env.staging` | Untouched | Staging only |
| Push to `main` with Railway auto-deploy **off** | Untouched | Untouched |
| Push to `main` with Railway auto-deploy **on** | Redeploy + migrate | **At risk** |

## Later: real production update

1. Backup production.
2. Re-enable Railway auto-deploy only when ready (or deploy manually).
3. Run migrate/deploy with a reviewed checklist — separate from this staging path.
