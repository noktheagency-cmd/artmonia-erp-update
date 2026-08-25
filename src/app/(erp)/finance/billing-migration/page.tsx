import "@/modules/finance/finance.css";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { StatusChip } from "@/components/ui/status-chip";
import { applyBillingMigrationReviewAction } from "@/modules/finance/billing-migration-actions";
import { formatShortDate } from "@/modules/shared/format";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  studentCode: string;
  studentName: string;
  oldNextPaymentAt: Date | null;
  billingAnchorDate: Date | null;
  proposedNextPaymentAt: Date | null;
  issueReason: string | null;
  reviewStatus: string;
};

export default async function BillingMigrationPage() {
  await requireErpActor("billing.invoice.read");
  const prisma = getPrisma();
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
      select
        r.id::text as id,
        s.code as "studentCode",
        c.full_name as "studentName",
        r.old_next_payment_at as "oldNextPaymentAt",
        r.billing_anchor_date as "billingAnchorDate",
        r.proposed_next_payment_at as "proposedNextPaymentAt",
        r.issue_reason as "issueReason",
        r.review_status as "reviewStatus"
      from erp.student_billing_migration_reviews r
      join erp.students s on s.id = r.student_id
      join erp.contacts c on c.id = s.contact_id
      where r.mismatch = true
      order by
        case r.review_status when 'PENDING' then 0 else 1 end,
        c.full_name asc
      limit 250
    `),
    prisma.$queryRaw<Array<{ total: bigint; pending: bigint; missingAnchor: bigint }>>(Prisma.sql`
      select
        count(*) filter (where mismatch = true) as total,
        count(*) filter (where mismatch = true and review_status = 'PENDING') as pending,
        count(*) filter (where issue_reason = 'MISSING_FIRST_LESSON_DATE') as "missingAnchor"
      from erp.student_billing_migration_reviews
    `),
  ]);
  const summary = totals[0] ?? { total: 0n, pending: 0n, missingAnchor: 0n };

  return (
    <section className="page-stack finance-page">
      <div className="page-heading list-heading">
        <div>
          <Link href="/finance" className="back-link">← Maliyyəyə qayıt</Link>
          <h1>Billing migration müqayisə hesabatı</h1>
          <p>Köhnə manual tarix, qorunan ilk dərs tarixi və sistemin təklif etdiyi billing tarixi.</p>
        </div>
      </div>

      <div className="finance-kpi-grid">
        <article className="finance-kpi"><span>Uyğunsuz qeydlər</span><strong>{Number(summary.total)}</strong></article>
        <article className="finance-kpi"><span>Vaqif təsdiqi gözləyir</span><strong>{Number(summary.pending)}</strong></article>
        <article className="finance-kpi"><span>İlk dərs tarixi yoxdur</span><strong>{Number(summary.missingAnchor)}</strong></article>
      </div>

      <article className="finance-panel">
        <div className="finance-panel-head">
          <div>
            <span>Nəzarətli sistem miqrasiyası</span>
            <h2>Köhnə və yeni billing tarixləri</h2>
            <small>PENDING qeydlər təsdiqlənmədən legacy tarix sahəsinə yazılmır.</small>
          </div>
        </div>
        <div className="finance-table-wrap" data-erp-table-scroll="">
          <table className="finance-table" data-erp-table="">
            <thead>
              <tr>
                <th>Tələbə</th>
                <th>Köhnə tarix</th>
                <th>İlk dərs / anchor</th>
                <th>Təklif edilən tarix</th>
                <th>Səbəb</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.studentName}</strong><br /><small>{row.studentCode}</small></td>
                  <td>{formatReviewDate(row.oldNextPaymentAt)}</td>
                  <td>{formatReviewDate(row.billingAnchorDate)}</td>
                  <td>{formatReviewDate(row.proposedNextPaymentAt)}</td>
                  <td>{row.issueReason === "MISSING_FIRST_LESSON_DATE" ? "İlk dərs tarixi çatışmır" : "Legacy tarix fərqlidir"}</td>
                  <td>
                    <StatusChip tone={row.reviewStatus === "PENDING" ? "warning" : "success"}>{row.reviewStatus}</StatusChip>
                    {row.reviewStatus === "PENDING" && row.issueReason !== "MISSING_FIRST_LESSON_DATE" ? (
                      <form action={applyBillingMigrationReviewAction}>
                        <input name="reviewId" type="hidden" value={row.id} />
                        <button className="finance-migration-apply" type="submit">Təsdiqlə və tətbiq et</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function formatReviewDate(value: Date | null) {
  return value ? formatShortDate(value) : "—";
}
