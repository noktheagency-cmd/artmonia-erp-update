# Business workflow decisions (BK sync)

Source of truth for confirmed rules: `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` (v1.0, 18 Oct 2026).

This note tracks **technical completion** of rules that can be closed in code. Open business edges (AQ-01…AQ-07) and individual historical exceptions (BK-25) stay out of scope until the owner decides.

## Closed in code (implementation map)

| Rule | Implementation |
|------|----------------|
| BK-01 / BK-04 / BK-21 | Admission sales counted from `erp.course_sales.qualified_at` (`sales-metrics-sql.ts`, daily report, CRM conversion helpers) |
| BK-02 / BK-03 | `course-sale-policy.ts` / `course-sale-service.ts` |
| BK-05…BK-08 | `activation-from-attendance.ts`; planner/mobile/site check-in call PRESENT activation; slot assign does not activate |
| BK-10 | Freeze keeps seat; `billingPaused=false`; invoices not voided (`lifecycle-service.ts`, `freeze-period-actions.ts`, `freeze-period-policy.ts`) |
| BK-11 / BK-12 | Manual stop/freeze only; STOPPED frees seat |
| BK-13 / BK-14 | RETURN sale only from STOPPED; renewals / freeze return do not create NEW sales |
| BK-15 | `package-upgrade-policy.ts` |
| BK-16 | Unified `MEETING` kind (+ optional CONSULTATION/TRIAL detail); reports already one “Görüş” card |
| BK-17 / BK-18 | Direct route; registration dialog attendance confirm (`registration-attend-policy.ts`) |
| BK-19 | Distinct phone/WhatsApp outcomes in `contact-policy.ts` |
| BK-22 / BK-23 | Stage card all-time within manager scope (`crm/queries.ts`) |

## Operational scripts

- Gap report / backfill: `node --import tsx scripts/backfill-course-sales.mjs` (dry-run)
- Apply tracked candidates only: `node --import tsx scripts/backfill-course-sales.mjs --apply`
- Legacy `admission_tracking=false` UNCLASSIFIED payments are listed for **manual review**, never auto-sold.

## Intentionally separate metrics

- **Admission sales / KPI:** `course_sales.qualified_at`
- **Retention / churn panel:** population by `students.registered_at` + freeze/stop events (not a sales KPI)
- **HR acquisition bonus (`DEPARTMENT_SALES_COUNT`):** uses `course_sales` by sale owner (same definition as company KPI)

## Acceptance automation

- `npm run test:acceptance` — T-01…T-54 automated policy suite + BK-25 gap check
- Catalog: `src/modules/acceptance/t-cases.ts`
- Matrix doc: `docs/t-01-t-54-acceptance-matrix.md`

## Still owner-owned

- AQ-01…AQ-07 open edges in the PDF
- BK-25 personal historical exceptions beyond tracked auto-backfill
- Remaining **manual** T cases (UI smoke list printed by `test:acceptance`)
