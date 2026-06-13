# MVP Phase Plan

## Phase 0 - Technical Foundation

Goal: lock the implementation plan before UI/UX and code scaffold.

Deliverables:

- Tech stack decision
- Architecture blueprint
- Data model blueprint
- Performance blueprint
- Security/RBAC/audit blueprint
- Seed/demo data plan

Exit criteria:

- Core decisions are documented
- P0 modules are sequenced
- UI/UX handoff checklist is ready

## Phase 1 - App Foundation

Goal: create a production-ready Next.js foundation.

Deliverables:

- Next.js App Router scaffold
- TypeScript, ESLint, formatting
- Supabase SSR clients
- Prisma setup
- Env validation
- Auth pages and protected ERP shell
- Base RBAC guard
- Seed/demo data command

Exit criteria:

- App runs locally
- Auth flow works with demo users
- Protected route blocks unauthenticated users
- Seed data can be reset safely

## Phase 2 - CRM + Students

Goal: build the lead-to-student operating flow.

Deliverables:

- Lead list/board
- Lead detail and follow-up task
- Duplicate phone warning
- Lead conversion transaction
- Student list
- Student profile
- Enrollment creation
- Student lifecycle status history

Exit criteria:

- Lead converts into contact + student + enrollment without data loss
- Status changes write history and audit logs
- Server-side list filters work

## Phase 3 - Billing + Debt

Goal: make finance data correct and auditable.

Deliverables:

- Invoice model and generation
- Payment entry
- Payment allocation
- Partial/advance handling
- Overdue calculation
- Debt aging dashboard
- Reminder tasks

Exit criteria:

- Payment states come from invoice balances
- Advance can be allocated according to selected case
- Frozen students stop billing
- Overdue tasks are created by job

## Phase 4 - Teachers + Payroll Basics

Goal: calculate teacher payout from payment month.

Deliverables:

- Teacher profiles
- Contract rule versioning
- Payout preview
- Payroll draft
- Adjustment entry
- Approval state foundation

Exit criteria:

- Payout is calculated by payment month
- Rule versions are respected
- Rule changes and payouts are audited

## Phase 5 - Dashboards + Targets

Goal: give leadership real-time business visibility.

Deliverables:

- Owner dashboard
- Sales dashboard
- Finance dashboard
- Teacher dashboard summary
- Targets dashboard
- Drill-down links

Exit criteria:

- KPI formulas are documented
- Dashboard data reconciles against seed data
- Drill-downs lead to source lists

## Phase 6 - Excel Migration Preparation

Goal: prepare safe migration before real customer data import.

Deliverables:

- Excel import parser
- Dry-run validation
- Status normalization report
- Duplicate phone report
- Final import mode
- KPI reconciliation report

Exit criteria:

- Dry-run reports show counts and issues
- Import is idempotent or safely resettable in staging
- Demo import path is tested before real workbook

## Phase 7 - P1/P2 Expansion

P1:

- Groups
- Schedule
- Attendance
- Payroll approval workflow
- Advanced exports

P2:

- Teacher portal
- WhatsApp/Instagram lead capture and reminders
- Online payment links and reconciliation
- Parent/student portal

## Immediate Next Step

After UI/UX is provided:

1. Scaffold the Next.js app.
2. Install Supabase, Prisma, and UI dependencies.
3. Add env validation and lazy server clients.
4. Convert `database/schema-blueprint.sql` into real Prisma schema/migrations.
5. Add seed/demo data.
6. Build the first protected dashboard shell.
