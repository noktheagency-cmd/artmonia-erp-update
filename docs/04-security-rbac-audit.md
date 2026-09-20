# Security, RBAC, And Audit

## Security Model

Supabase Auth provides identity. Artmonia ERP provides authorization through internal users, roles, permissions, and server-side guards.

Auth flow:

1. User signs in through Supabase Auth.
2. Next.js server validates the user session/token.
3. ERP user is loaded by `auth_user_id`.
4. Role and permission set is resolved.
5. Domain service checks permission before any protected read or mutation.

## ERP Session Lifetime

ERP sessions have an absolute maximum lifetime of 7 days from `auth.sessions.created_at`.
The server identity check, session heartbeat, and MCP authentication share
`src/server/auth/session-lifetime.ts`. Refreshing tokens does not restart this window.
At the 7-day boundary the session is rejected. Earlier provider expiry (`not_after`),
sign-out, revocation, account deactivation, and MFA requirements still apply.
This policy does not increase the JWT access-token lifetime or restore ended sessions.

MCP OAuth tokens may have `aal1` even after browser MFA. Such tokens require
the latest client/user-specific `MCP_OAUTH_APPROVED` audit decision and an
OAuth session created after that decision. The originating browser session
must still be valid, unrevoked, `aal2`, and within the same seven-day limit;
a verified MFA factor must remain. See `docs/chatgpt-founder-mcp.md`.

The read-only PostgreSQL boundary regression test can be run with an explicitly
selected `SESSION_LIFETIME_TEST_DATABASE_URL` and
`node --import tsx --test src/server/auth/session-lifetime.test.ts`.

## Roles

Initial roles:

- `SUPER_ADMIN` - technical owner, migration, emergency admin
- `OWNER` - full business visibility, approvals, dashboards, export
- `ADMIN` - daily operations, students, groups, assignments, status changes
- `SALES` - CRM pipeline, lead conversion, follow-up, source/manager reports
- `FINANCE` - invoices, payments, refunds, debt, closing
- `TEACHER` - own students/schedule/attendance/payout report in later portal
- `AUDITOR` - read-only dashboards and audit logs

## Permission Pattern

Use action-level permissions instead of hardcoding role checks everywhere.

CRM follow-up detail and status edits require `crm.lead.update` and access to the
record under `crm.lead.read`. Editors with read scope `ALL` can update another
manager's follow-up even when their update scope is `ASSIGNED`. Read scope
`ASSIGNED` still limits editing to their own records. Creation assigns the lead
to its creator; editing preserves the current manager unless an editor with
update scope `ALL` explicitly selects a new manager. Deletion and conversion
retain their existing action scope checks. Changes remain attributed to the
acting user in audit and stage history.

Examples:

- `crm.lead.create`
- `crm.lead.convert`
- `student.read`
- `student.status.change`
- `billing.invoice.generate`
- `billing.payment.create`
- `billing.refund.request`
- `billing.refund.approve`
- `teacher.rule.update`
- `teacher.payout.approve`
- `dashboard.owner.read`
- `report.export`
- `audit.read`
- `settings.manage`

## Critical Mutation Rules

Every critical mutation must:

- Validate input
- Check permission
- Run inside a transaction when multiple records change
- Write audit log with before/after JSON
- Store actor ID and request metadata where possible
- Return a typed result/error

Critical mutations:

- Lead conversion
- Student lifecycle status change
- Enrollment teacher change
- Monthly fee/pricing exception
- Invoice generation/update
- Payment creation/update/delete
- Payment allocation change
- Refund/adjustment request and approval
- Teacher contract rule change
- Payroll generation/approval/payment mark
- Export generation
- User/role/permission change

## Audit Log Shape

Minimum fields:

- `id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `before_json`
- `after_json`
- `reason`
- `ip_address`
- `user_agent`
- `created_at`

Audit logs should be append-only in normal application code.

## Supabase Key Safety

- Browser code may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Secret/service keys must never be placed in `NEXT_PUBLIC_*`.
- Service role or secret key should only be used in trusted server contexts.
- Authorization must not rely on user-editable metadata.
- Role/permission data should live in ERP tables and/or trusted app metadata managed by server code.

## Row-Level Security Position

For MVP, critical ERP reads/writes are server-controlled through domain services and Prisma.

Recommended database defense:

- Keep domain tables unavailable for anonymous browser writes.
- Enable RLS or revoke public access for any exposed schema/table.
- Use RLS-backed policies later for teacher/parent portals if direct Supabase client access is needed.
- Keep security-definer functions out of exposed schemas.

## Export Safety

Exports can expose sensitive student and finance data.

Required controls:

- Permission check before export
- Export row limit
- Audit log with filters and record count
- Signed or short-lived download URL
- Separate export metadata table

## Session And MFA

MVP:

- Email/password login or configured Supabase Auth provider
- Strong password policy
- Optional MFA for Owner, Finance, and Super Admin if rollout time allows

Post-MVP:

- Enforce MFA for finance and owner roles
- Session review and forced sign-out for role removal/security incidents
