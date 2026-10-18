# Decisions And Context

## Source

Primary product sources:

- `Artmonia_ERP_Final_Technical_PRD_v2.0.pdf` (initial MVP)
- `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` (confirmed business rules BK-01…BK-25; overrides older conflicting notes below)

The product is an education ERP, not a simple CRM. Core coverage: CRM, students, enrollments, payments/debt, teacher HR/payroll basics, dashboards, targets, audit log, and Excel migration.

## Confirmed Decisions

- Hosting: Vercel
- App stack: Next.js App Router, React, TypeScript
- Database/backend platform: Supabase Postgres, Supabase Auth, Supabase Storage
- ORM: Prisma for domain transactions; raw SQL/views for reporting performance
- Initial data: seed/demo data first, real Excel import later
- Sales journal: qualified admissions and STOPPED returns are counted from `erp.course_sales` (not registration date alone)
- Due date / billing anchor: monthly due day follows the billing anchor set at first actual monthly lesson (not slot plan or payment date alone)
- Activation (BK-05…08): full first-period fee before first monthly PRESENT; slot assignment does not activate; billing starts on that first PRESENT
- Frozen status billing (BK-10): seat is kept; **monthly billing continues** while frozen; payment day does not move; FROZEN return is not a new sale
- Package upgrade (BK-15): fee/lesson increase blocked during the first billing period; allowed from the second period (`effectiveMonth` ≥ month after `billingAnchorDate`); downgrades allowed anytime; pre-activation edits are initial setup
- CRM stage cards (BK-22/23): “Müraciət mərhələləri” is always all-time within manager scope; click opens the same all-time stage list
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

- Student lifecycle: slot waiting, active, frozen, stopped, declined, completed (debt is payment state, not a lifecycle status)
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

These map to AQ-01…AQ-07 in `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` and must not be invented in code:

- AQ-01: billing day when first lesson falls on 29/30/31
- AQ-02: mid-cycle STOPPED prorata / future invoices
- AQ-03: package downgrade and mid-period switches after month one
- AQ-04: school/teacher-caused compensation policy
- AQ-05: refund / sale refusal / KPI reversal
- AQ-06: one-off lesson KPI placement
- AQ-07: historical import / journal coverage plan
- Exact advance allocation choices in the UI
- Whether overdue reminders are internal tasks only in MVP or also email/SMS

See also `docs/business-workflow-decisions.md` and `docs/sales-metrics-audit-notes.md`.
