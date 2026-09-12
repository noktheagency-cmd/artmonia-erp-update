# Agent Guide — Artmonia ERP

## Scope and working agreement

This file applies to the entire repository. Read any more specific `AGENTS.md` before editing its directory. Follow the user's current request and preserve unrelated work.

- Start with `git status --short`, then inspect the affected module and its tests. Never revert existing changes that are outside the task.
- Make the smallest coherent change that completes the requested behavior. Avoid unrelated refactors, dependency upgrades, or directory moves.
- Follow existing module conventions. If a pattern is unsafe or inconsistent, fix the affected path and explain the decision instead of copying the defect.
- Communicate with the user in their language. Keep code identifiers in English and preserve Azerbaijani product text and UTF-8 characters.
- Finish with what changed, which checks ran, and any remaining limitations. Do not claim deployment or live verification without evidence.

## Project context and sources of truth

Artmonia is an education ERP implemented as a Next.js modular monolith. Existing modules cover CRM, student operations, attendance, finance, HR, marketing, roles, and integrations; module presence does not imply that every workflow is complete.

- `package.json` and `package-lock.json`: scripts, runtime requirements, and installed dependency contract. Use npm; do not introduce a second lockfile.
- `src/`: current application behavior.
- `prisma/schema.prisma` and `prisma/migrations/`: ORM data model and its migration history.
- `src/server/rbac/permissions.ts` and `src/server/auth/actor.ts`: current permission definitions, scopes, and actor guards.
- `.env.example` and `src/server/env/index.ts`: environment configuration; document new variables without real credentials.
- `railway.json` and `railpack.json`: checked-in deployment configuration. Do not infer the live deployment state from these files.
- `docs/00-decisions-and-context.md` through `docs/09-phase-1-foundation.md`: product decisions and original architecture/design plans. Some stage and hosting statements are historical; compare them with the implementation before acting.
- Feature-specific documents in `docs/`: integration contracts and handoff details. Update the relevant contract when behavior changes.

When requirements and implementation disagree, identify the discrepancy. Preserve established business rules unless the task authorizes changing them; do not silently treat a historical plan as current behavior.

## Repository boundaries

| Location | Responsibility |
| --- | --- |
| `src/app/` | App Router pages, layouts, loading/error boundaries, Server Action wiring, and HTTP endpoints |
| `src/modules/<domain>/` | Domain queries, actions, services, DTOs, UI, and colocated tests |
| `src/components/` | Reusable UI and application components |
| `src/server/` | Server infrastructure: authentication, RBAC, database, storage, environment, and MCP |
| `src/lib/` | Small shared utilities and application-wide helpers |
| `src/generated/` | Generated Prisma output; regenerate instead of hand-editing |
| `prisma/` | Prisma schema, migrations, and demo seed |
| `supabase/migrations/` | Additional SQL migrations; inspect alongside Prisma history before database changes |
| `database/` | Original SQL blueprint; not a substitute for migration history |
| `scripts/` | Test runner, lockfile validation, and operational verification tools |
| `docs/` | Architecture notes, business decisions, and integration contracts |

Keep domain logic in its owning module and route handlers thin. Reuse existing services across entry points rather than duplicating business rules. Promote code to shared locations only when there is a real shared responsibility; avoid circular module imports.

## Implementation conventions

- Use strict TypeScript and the `@/` alias for `src/`. Prefer explicit domain types and validated inputs over `any` or unchecked assertions.
- Default to Server Components. Add `"use client"` only where browser state or interaction requires it; never import privileged server modules into client code.
- Reuse `src/components/ui/`, existing layout patterns, and design tokens in `src/app/globals.css`. Consult `docs/08-visual-design-system.md` for visual changes.
- Handle loading, empty, error, and success states. Preserve keyboard navigation, labels, focus behavior, and responsive layouts for affected controls.
- Return client-safe, serializable results. Reuse `src/server/actions/safe-action.ts` and established action-result conventions for mutations; keep internal errors out of user-facing responses.
- Keep queries bounded with appropriate filters, pagination, and selected fields. Avoid N+1 queries and loading whole tables for summaries.
- Scope cached data by all relevant access constraints. Reuse `src/modules/shared/cache-tags.ts` and invalidate affected paths/tags after successful writes.

## Authorization and data protection

- Enforce authentication, permissions, and record scope on the server for protected reads, writes, exports, and integration endpoints. Hiding a button is not authorization.
- Reuse actor guards and permission helpers, including `requireMutationActor` for applicable ERP mutations. Respect `ASSIGNED` versus `ALL` access; never trust submitted actor IDs or role metadata.
- Validate external input with the module's Zod schemas or established validators. Preserve origin checks, webhook signature validation, and dedicated integration authentication.
- Keep Prisma and Supabase admin/service credentials on the server. Do not print, commit, or copy secrets from local environment files into documentation or test artifacts.
- Preserve protected-role rules, MFA/password policies, and development-only actor restrictions. Test both allowed and denied paths when changing access control.
- Keep file downloads and exports permission-scoped. Reuse storage signing, row limits, and audit mechanisms; do not replace private storage with public URLs.
- Avoid personal student, staff, or financial data in logs and fixtures. Use synthetic data for tests.

## Business rules and database changes

- Keep student lifecycle and payment state separate. Derive debt from invoice balances and payment allocations, not status labels.
- Preserve registration-date billing, frozen-period handling, and payment-month teacher payout rules. Read the affected finance services and regression tests before modifying calculations.
- Use the existing decimal money representation and rounding conventions. Do not introduce binary floating-point arithmetic into persisted financial calculations.
- Use transactions for related domain writes. Preserve audit entries with actor, entity, before/after state, and reasons where required; normal application code must not rewrite audit history.
- Make retryable billing, synchronization, and webhook operations idempotent. Account for concurrency and duplicate delivery where applicable.
- For schema changes, inspect both migration directories and choose the established owner for the affected object. Do not create competing migrations or rewrite applied history.
- Generate and review migrations against an identified development database. Never run resets, destructive SQL, demo seeding, or migration commands against an unknown/shared target as a routine check.
- Regenerate Prisma after schema changes. Review backfills, constraints, indexes, data preservation, and application compatibility before applying migrations.
- Inspect operational verification scripts before executing them: a script named `verify-*` may connect to a database or mutate records.

## Commands and verification

Run commands from the repository root. Supported Node range is `>=22 <25`; CI uses Node 22 and npm 10.9.4.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install locked dependencies | `npm ci` | Runs Prisma generation through `postinstall` |
| Development server | `npm run dev` | Use `npm run dev -- --port 3001` if the default port is occupied |
| ESLint | `npm run lint` | Repository lint check |
| Generate route types | `npx next typegen` | Run before typecheck on a fresh checkout or after route changes |
| TypeScript | `npm run typecheck` | Requires generated Prisma and route types |
| Unit/regression tests | `npm test` | Node test runner with `tsx`; discovers `src/**/*.test.ts` |
| One test file | `node --import tsx --test src/path/to/file.test.ts` | Replace the example path with an existing test |
| Production build | `npm run build` | Use for build/runtime/configuration changes as appropriate |
| Prisma generation | `npm run prisma:generate` | Updates generated client |
| Prisma validation | `npm run prisma:validate` | Validates schema; does not apply migrations |
| Lockfile policy | `node scripts/check-lockfile.mjs` | Run when dependency manifests or lockfile change |

- For code changes, run lint, route type generation, typecheck, and relevant tests; run the full test suite before handoff when practical. Report blocked checks and their causes.
- For auth, finance, or other consequential behavior changes, add focused regression coverage for failure cases and boundaries, not only the happy path.
- For UI changes, verify the affected flow in a browser at relevant viewport sizes when available. State explicitly if browser verification was unavailable.
- For documentation-only changes, verify referenced paths, scripts, factual claims, and `git diff --check`; application tests are unnecessary unless behavior also changes.
- CI additionally runs dependency auditing via `npm audit --audit-level=high`; do not weaken CI or suppress failures to make a change pass.
- Before handoff, inspect the final diff for unrelated edits, generated files, secrets, and stale documentation. Leave deployment and external data changes within the user's authorized scope.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
