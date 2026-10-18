/**
 * Course sales journal backfill / gap report (BK-01 / BK-04 / BK-21).
 *
 * Default: dry-run report only (no writes).
 * Apply mode: --apply
 *   - Links UNCLASSIFIED/ADMISSION/INITIAL_BALANCE payments that already have
 *     enough evidence onto a new or existing course_sale row.
 *   - Never invents sales for admission_tracking=false students without
 *     an explicit ADMISSION/INITIAL_BALANCE receipt purpose.
 *
 * Usage:
 *   node --import tsx scripts/backfill-course-sales.mjs
 *   node --import tsx scripts/backfill-course-sales.mjs --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const journal = await client.query(`
    select count(*)::int as total,
           count(*) filter (where cancelled_at is null)::int as active
    from erp.course_sales
  `);
  console.log("course_sales journal:", journal.rows[0]);

  const gaps = await client.query(`
    with candidates as (
      select
        s.id as student_id,
        s.code,
        s.admission_tracking,
        s.manager_id,
        s.lifecycle_status::text as lifecycle,
        e.id as enrollment_id,
        e.monthly_fee,
        p.id as payment_id,
        p.amount,
        p.paid_at::date as paid_at,
        p.receipt_purpose,
        p.course_sale_id
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join lateral (
        select en.id, en.monthly_fee
        from erp.enrollments en
        where en.student_id = s.id
          and en.status in ('ACTIVE'::erp."EnrollmentStatus", 'PAUSED'::erp."EnrollmentStatus")
        order by en.created_at desc
        limit 1
      ) e on true
      where s.is_test_data = false
        and p.course_sale_id is null
        and p.amount >= 20
        and e.monthly_fee > 0
        and (
          p.receipt_purpose in ('ADMISSION', 'INITIAL_BALANCE')
          or (s.admission_tracking = true and p.receipt_purpose = 'UNCLASSIFIED')
        )
      order by p.paid_at asc, p.created_at asc
    )
    select * from candidates
  `);

  console.log(`gap candidates: ${gaps.rows.length}`);
  for (const row of gaps.rows.slice(0, 40)) {
    console.log(
      [
        row.code,
        row.paid_at?.toISOString?.()?.slice(0, 10) ?? row.paid_at,
        `${row.amount} AZN`,
        row.receipt_purpose,
        row.admission_tracking ? "tracked" : "legacy",
        row.lifecycle,
      ].join(" | "),
    );
  }
  if (gaps.rows.length > 40) console.log(`… +${gaps.rows.length - 40} more`);

  const legacyUnclassified = await client.query(`
    select count(*)::int as c
    from erp.payments p
    join erp.students s on s.id = p.student_id
    where s.is_test_data = false
      and s.admission_tracking = false
      and p.course_sale_id is null
      and p.receipt_purpose = 'UNCLASSIFIED'
      and p.amount >= 20
  `);
  console.log(
    "legacy UNCLASSIFIED ≥20 AZN (manual review only, not auto-applied):",
    legacyUnclassified.rows[0].c,
  );

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to create/link sales for tracked candidates.");
    process.exit(0);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;

  await client.query("BEGIN");
  try {
    for (const row of gaps.rows) {
      if (!row.manager_id || !row.enrollment_id) {
        skipped += 1;
        continue;
      }

      const cycleKey = `new:${row.student_id}`;
      let sale = (
        await client.query(
          `select id, status, initial_fee from erp.course_sales where cycle_key = $1`,
          [cycleKey],
        )
      ).rows[0];

      if (!sale) {
        if (row.receipt_purpose === "INITIAL_BALANCE") {
          skipped += 1;
          continue;
        }
        const inserted = await client.query(
          `
          insert into erp.course_sales (
            id, student_id, enrollment_id, owner_id, lead_id,
            cycle_key, kind, route, qualified_at, contract_confirmed_at,
            initial_fee, status, created_at
          ) values (
            gen_random_uuid(), $1, $2, $3, null,
            $4, 'NEW', 'DIRECT', $5::date, now(),
            $6, 'DEPOSIT', now()
          )
          returning id, status, initial_fee
          `,
          [
            row.student_id,
            row.enrollment_id,
            row.manager_id,
            cycleKey,
            row.paid_at,
            row.monthly_fee,
          ],
        );
        sale = inserted.rows[0];
        created += 1;
      }

      await client.query(
        `
        update erp.payments
        set course_sale_id = $1,
            receipt_purpose = case
              when receipt_purpose = 'UNCLASSIFIED' then 'ADMISSION'
              else receipt_purpose
            end
        where id = $2 and course_sale_id is null
        `,
        [sale.id, row.payment_id],
      );
      linked += 1;

      const paid = await client.query(
        `select coalesce(sum(amount),0)::numeric as paid from erp.payments where course_sale_id = $1`,
        [sale.id],
      );
      if (Number(paid.rows[0].paid) >= Number(sale.initial_fee)) {
        await client.query(
          `update erp.course_sales set status = 'COMPLETE' where id = $1 and cancelled_at is null`,
          [sale.id],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log({ created, linked, skipped });
  console.log("Apply complete. Re-run without --apply to verify remaining gaps.");
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await client.end();
}
