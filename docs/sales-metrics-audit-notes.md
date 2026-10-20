# Sales metrics audit notes

Companion to `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` §19 and BK-21.

## Canonical source

Company / dashboard / CRM conversion **sale counts** use:

```sql
erp.course_sales.qualified_at  -- cancelled_at is null
```

via `companySalesCountSql` / `leadHasQualifiedSaleSql` in `src/modules/students/sales-metrics-sql.ts`.

Do **not** use `students.registered_at` for admission-sale KPI after this sync.

## Historical gap handling

1. Dry-run: `npm run db:backfill-course-sales`
2. Review listed tracked candidates and legacy UNCLASSIFIED totals
3. Apply only after owner sign-off: `npm run db:backfill-course-sales:apply`
4. Re-compare panel vs CRM vs daily report for the same Baku date window

Legacy `admission_tracking=false` rows are never auto-qualified (BK-25 / no silent invention).

## Related reports

| Report | Source |
|--------|--------|
| Daily sales | `course_sales` |
| Company KPI newSales | `course_sales` |
| CRM conversion sales | `leadHasQualifiedSaleSql` → `course_sales` |
| Retention / freeze-stop | `registered_at` population (not sales) |
| Marketing campaign satış / gəlir | `course_sales` (+ payments on `course_sale_id`) |
| HR acquisition bonus (DEPARTMENT_SALES_COUNT) | `course_sales.qualified_at` by sale owner |
| Owner dashboard konversiya | `companySalesCount` / period leads |
