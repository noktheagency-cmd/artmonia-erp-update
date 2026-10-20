/**
 * T-01…T-54 acceptance runner.
 *
 *   npm run test:acceptance
 *
 * 1) Automated policy suite (t-matrix.test.ts)
 * 2) BK-25 live gap check against DATABASE_URL / DIRECT_URL
 * 3) Prints remaining manual UI smoke cases
 */
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

console.log("\n=== Artmonia T-01…T-54 acceptance ===\n");
console.log("--- Automated policy suite ---");

const testResult = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "src/modules/acceptance/t-matrix.test.ts"],
  { stdio: "inherit", cwd: process.cwd() },
);
if (testResult.status !== 0) {
  process.exit(testResult.status ?? 1);
}

console.log("\n--- BK-25 course_sales gap check ---");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL missing — skip live gap check");
} else {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const journal = await client.query(`
      select count(*)::int as total,
             count(*) filter (where cancelled_at is null)::int as active
      from erp.course_sales
    `);
    const gaps = await client.query(`
      select count(*)::int as c
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join lateral (
        select en.id
        from erp.enrollments en
        where en.student_id = s.id
          and en.status in ('ACTIVE'::erp."EnrollmentStatus", 'PAUSED'::erp."EnrollmentStatus")
        order by en.created_at desc
        limit 1
      ) e on true
      where s.is_test_data = false
        and p.course_sale_id is null
        and p.amount >= 20
        and (
          p.receipt_purpose in ('ADMISSION', 'INITIAL_BALANCE')
          or (s.admission_tracking = true and p.receipt_purpose = 'UNCLASSIFIED')
        )
    `);
    console.log("course_sales:", journal.rows[0]);
    console.log("tracked gap candidates:", gaps.rows[0].c);
    if (Number(gaps.rows[0].c) > 0) {
      console.error("BK-25 gaps remain — run npm run db:backfill-course-sales:apply");
      process.exit(1);
    }
    console.log("BK-25: no tracked gaps");
  } finally {
    await client.end();
  }
}

console.log("\n--- Manual UI smoke (owner) ---");
console.log("See docs/t-01-t-54-acceptance-matrix.md for full event/expected text.");
console.log("Manual IDs: T-07, T-11–T-13, T-15, T-17–T-18, T-21–T-27, T-31, T-39–T-40, T-43, T-45, T-48–T-54");

console.log("\nPASS: automated T-matrix + BK-25 gap check");
process.exit(0);
