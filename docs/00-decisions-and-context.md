# Decisions And Context

## Source

Primary product source:

- `Artmonia_ERP_Final_Technical_PRD_v2.0.pdf`

The PRD defines Artmonia as an education ERP, not a simple CRM. The MVP must cover CRM, students, enrollments, payments/debt, teacher HR/payroll basics, dashboards, targets, audit log, and Excel migration.

## Confirmed Decisions

- Hosting: Vercel
- App stack: Next.js App Router, React, TypeScript
- Database/backend platform: Supabase Postgres, Supabase Auth, Supabase Storage
- ORM: Prisma for domain transactions; raw SQL/views for reporting performance
- Initial data: seed/demo data first, real Excel import later
- Due date rule: monthly payment due date follows student registration date
- Frozen status billing rule: billing stops while the student is frozen
- Teacher payout basis: payment month
- Advance handling: finance can choose how advance is allocated according to the case
- Refund/adjustment approval: Owner and Finance both participate
- Teacher portal: not required in MVP; move to P1/P2
- WhatsApp/Instagram/online payment: P2, after core data and finance workflows are stable

## Product Core

The ERP has three operating streams:

- Sales stream: lead capture, pipeline, follow-up, conversion
- Student operations stream: profile, lifecycle, enrollment, groups, attendance
- Finance/payroll stream: invoices, payments, debt, advance, refund, teacher payout

Dashboards, tasks, and audit logs sit across all streams.

## Important Domain Rule

Student lifecycle status and payment state must never be stored as one mixed text value.

Correct separation:

- Student lifecycle: group waiting, active, debt, frozen, stopped, completed
- Payment state: unpaid, partial, paid, overdue, advance, refunded, adjusted
- Balance/debt: calculated from invoices and payment allocations

## Parent/Guardian Decision

Parent/guardian contacts are useful when the student is a child or when the paying/contact person is not the student.

Recommended MVP approach:

- Keep parent/guardian as an optional linked contact on the student profile.
- Store relationship type, payer flag, emergency/contact flag, and communication preference.
- Do not build a parent portal in MVP.

This keeps the data model ready for reminders, portal access, and multi-student family relationships without expanding MVP UI scope.

## Open Decisions For Later

- Exact refund workflow steps and approval ordering
- Whether Finance approval is required before Owner approval or either role can approve
- Exact advance allocation choices in the UI
- Whether overdue reminders are internal tasks only in MVP or also email/SMS
- Final UI navigation and visual system
