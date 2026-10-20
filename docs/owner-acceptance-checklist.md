# Owner acceptance checklist (BK / T matris)



Meeting-ready map of business rules in `artmonia-erp-update`.



## One command



```bash

npm run test:acceptance

```



Runs:



1. Automated T-01…T-54 policy suite (`src/modules/acceptance/t-matrix.test.ts`)

2. BK-25 `course_sales` gap check (fails if tracked gaps remain)

3. Prints remaining **manual** UI smoke IDs



Full matrix: `docs/t-01-t-54-acceptance-matrix.md`



## BK extract

Full BK-01…BK-25 + AQ-01…AQ-07: `docs/bk-01-bk-25-rules.md`

## Canonical sale definition (BK-01 / BK-02 / BK-21)



- Sale = contract confirmed + one payment ≥ 20 AZN → `erp.course_sales`

- Panel / CRM / Marketing / HR bonus satış → eyni jurnal



## BK-25 backfill



```bash

npm run db:backfill-course-sales          # dry-run

npm run db:backfill-course-sales:apply    # after review

```



Legacy `admission_tracking=false` UNCLASSIFIED never auto-qualified.



## Manual smoke (after automated PASS)



High-value UI checks: T-07, T-11–T-13, T-15, T-17–T-18, T-21–T-27, T-31, T-39–T-40, T-43, T-45, T-48–T-54.

