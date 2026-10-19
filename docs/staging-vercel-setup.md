# Staging on Vercel (production-safe)

Goal: run the current local/Academy build on Vercel **without** touching Railway production (`erp.artmoniya.com`) or the production Supabase project.

## Git auto-deploy blocked? (Hobby / Free)

If Vercel says *“commit author doesn’t have permission to create deployments”*:

- Repo is private + Vercel team is **Hobby/Free** → **only the Hobby owner** can trigger Git deployments.
- Your commits are authored as `PashanurM <merdanovpashanur@gmail.com>`, while the Vercel login is often the company account (`noktheagency-…`). Hobby does **not** allow multi-user Git deploy collaboration.
- `credential.*.username=noktheagency-cmd` only affects **push auth**, not commit author.

**Workarounds (pick one):**

1. **CLI deploy without Git metadata (recommended on Hobby)** — bypasses the author check:

   ```bash
   npx vercel login
   npx vercel link --yes --project artmonia-erp-f5tk --scope nokthe-agencys-projects
   npm run deploy:staging:vercel
   ```

   This runs `scripts/deploy-vercel-hobby.mjs`, which uploads a temp copy **without `.git`** so Hobby does not block `PashanurM` / Cursor co-authored commits.

2. **Dashboard** → Deployments → **Create Deployment** → choose the commit (as the team owner account).

3. **Pro upgrade** → add `PashanurM` as a team member and connect their GitHub under Account Settings → Login Connections.

4. For a **one-off Git deploy** without changing global git config, author the commit as the Hobby/GitHub owner:

   ```powershell
   $env:GIT_AUTHOR_NAME = "noktheagency-cmd"
   $env:GIT_AUTHOR_EMAIL = "282391128+noktheagency-cmd@users.noreply.github.com"
   $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
   $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL
   git commit --allow-empty -m "Trigger Vercel staging deploy under Hobby owner authorship."
   git push
   ```

   Do **not** use `PashanurM <merdanovpashanur@gmail.com>` as author on Hobby — Git deploys will be Blocked.

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
4. Environment variables → scope **Preview** / **Production** (for `*.vercel.app`):
   - Paste every **non-empty** key from `.env.staging`
   - Required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
   - **Do not set `NODE_ENV`** on Vercel. Importing `NODE_ENV=production` makes `npm ci` skip Tailwind/PostCSS and the build fails with ~50 PostCSS errors.
5. After first Preview URL exists, set `NEXT_PUBLIC_APP_URL` to that `https://….vercel.app`. Ensure `DATABASE_URL` includes `sslmode=require` and `uselibpqcompat=true` (pg 8.16+ otherwise treats `require` as `verify-full` and login fails with `limiter_unavailable` on Vercel). Then redeploy.

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
