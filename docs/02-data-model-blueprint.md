# Data Model Blueprint

## Model Principles

- Normalize the Excel data instead of copying spreadsheet columns directly.
- Keep contact, student, enrollment, invoice, payment, and teacher data separate.
- Keep lifecycle status and payment state separate.
- Calculate debt from invoices and payment allocations.
- Preserve all important historical changes.
- Make future Excel migration reproducible through dry-run reports and final import mode.

## Core Entity Groups

### Identity And RBAC

- `users` - internal ERP users mapped to Supabase Auth users
- `roles` - owner, admin, sales, finance, teacher, auditor, super admin
- `user_roles` - role assignment
- `permissions` - action-level permission catalog
- `role_permissions` - permission mapping

### CRM

- `contacts` - master contact record for leads, students, parents, guardians, referrers
- `leads` - sales pipeline record
- `lead_stage_history` - pipeline movement history
- `lead_notes` - sales notes

### Students

- `students` - student profile and lifecycle status
- `student_status_history` - status transition audit
- `student_relationships` - parent, guardian, sibling, friend, referral, payer relationships
- `student_notes` - operational notes and important flags

### Programs And Enrollments

- `programs` - package/catalog
- `program_pricing_versions` - price and lesson count versions
- `enrollments` - student-program-teacher relation
- `teacher_assignment_history` - enrollment teacher changes

### Finance

- `invoices` - monthly billing documents
- `payments` - payment transaction ledger
- `payment_allocations` - payment-to-invoice allocation
- `refund_adjustments` - approval-based changes
- `student_finance_snapshots` - optional monthly finance snapshots

### Teachers

- `teachers` - teacher profile
- `teacher_contract_rules` - versioned payout rules
- `teacher_payouts` - monthly payout result
- `teacher_payout_lines` - calculation detail per payment/enrollment

### Operations

- `groups` - P1 class/group
- `group_memberships` - student in group
- `lessons` - scheduled lessons
- `attendance` - attendance status and teacher note

### Cross-Cutting

- `tasks` - manual and automated work queue
- `targets` - monthly target plan
- `audit_logs` - critical before/after changes
- `job_runs` - scheduled job tracking
- `exports` - export audit and file metadata

## Student Lifecycle Status

| Status | Meaning | Required Data |
| --- | --- | --- |
| `GROUP_WAITING` | Registered, no active group/lesson yet | program, manager, expected start |
| `ACTIVE` | Learning process is active | enrollment, teacher, monthly fee |
| `DEBT` | Active or service-related debt exists | balance due, due date |
| `FROZEN` | Temporary pause | reason, return date, billing pause rule |
| `STOPPED` | Churn/left | reason, stopped date, balance resolution |
| `COMPLETED` | Program completed | completion date |

Confirmed rule: billing stops while status is `FROZEN`.

## Payment State

Payment state is calculated from invoice and allocation data.

| State | Rule |
| --- | --- |
| `UNPAID` | invoice amount > 0 and no allocated payment |
| `PARTIAL` | allocated amount > 0 and invoice balance > 0 |
| `PAID` | invoice balance = 0 |
| `OVERDUE` | due date < today and balance > 0 |
| `ADVANCE` | payment exceeds selected invoice balance and leaves advance balance |
| `REFUNDED` | approved refund exists |
| `ADJUSTED` | approved adjustment exists |

## Confirmed Business Rules

- New student codes use `ART-xxxx`; migrated codes remain unchanged.
- Due date follows registration date.
- Payment month is the basis for teacher payout.
- Advance allocation is selectable by Finance according to the case.
- Refund/adjustment approval involves Finance and Owner.
- A frozen student does not generate new billable invoices while frozen.
- A student can only move to `DEBT` automatically when balance due is greater than zero.
- Status changes require reason, effective date, actor, note, and audit log.
- Payment create/update/delete, monthly fee changes, teacher rule changes, refunds, and exports require audit log.

## Dashboard Read Models

Dashboard performance should be based on dedicated read models:

- `dashboard_owner_metrics_v`
- `dashboard_sales_metrics_v`
- `dashboard_finance_metrics_v`
- `dashboard_teacher_metrics_v`
- `debt_aging_v`
- `teacher_payout_preview_v`

Use materialized views or monthly snapshot tables only after live SQL views become slow or reconciliation requires frozen historical numbers.

## Seed/Demo Data Plan

Seed data should include:

- 1 owner
- 1 admin/operations user
- 1 sales user
- 1 finance user
- 4 teachers
- 6 programs from the PRD
- 20-30 demo contacts/students
- Mixed statuses: active, debt, group waiting, frozen, stopped, completed
- Invoices across at least 3 months
- Paid, partial, overdue, advance, and refund/adjustment examples
- Teacher contract rules and payout preview data
- Tasks for follow-up, debt reminder, freeze return, and group waiting

This lets the UI/UX and flow tests work before real Excel migration.
