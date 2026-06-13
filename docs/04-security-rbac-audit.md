# Security, RBAC, And Audit

## Security Model

Supabase Auth provides identity. Artmonia ERP provides authorization through internal users, roles, permissions, and server-side guards.

Auth flow:

1. User signs in through Supabase Auth.
2. Next.js server validates the user session/token.
3. ERP user is loaded by `auth_user_id`.
4. Role and permission set is resolved.
5. Domain service checks permission before any protected read or mutation.

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
