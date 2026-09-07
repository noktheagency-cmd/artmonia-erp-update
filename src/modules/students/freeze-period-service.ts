import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import {
  assessFrozenInvoice,
  type FreezePeriodInput,
} from "./freeze-period-policy";
import { currentBakuDateValue } from "./payment-date-policy";

export type FreezePeriodHistory = {
  id: string;
  startDate: string;
  endDate: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  voidAmount: string;
  reviewCount: number;
};
export type FreezeInvoiceRow = {
  id: string;
  period: string;
  amount: number;
  balance: number;
  allocated: number;
  status: string;
  cycleStart: string;
  cycleEnd: string;
  decision: "VOID" | "REVIEW" | "KEEP";
  reason: string;
};
export type FreezePreview = {
  fingerprint: string;
  currentStatus: string;
  freezesNow: boolean;
  voidAmount: number;
  reviewCount: number;
  invoices: FreezeInvoiceRow[];
};
export type FreezeStudent = {
  id: string;
  managerId: string | null;
  status: string;
  paused: boolean;
  anchor: string | null;
  updatedAt: string;
};

export async function loadFreezeStudent(
  tx: Prisma.TransactionClient,
  studentId: string,
  lock = false,
) {
  const rows = await tx.$queryRaw<FreezeStudent[]>(Prisma.sql`
    select id,manager_id as "managerId",lifecycle_status::text as status,billing_paused as paused,
      billing_anchor_date::text as anchor,updated_at::text as "updatedAt" from erp.students
    where id=${studentId}::uuid ${lock ? Prisma.sql`for update` : Prisma.empty}
  `);
  if (!rows[0]) throw new PublicActionError("Tələbə tapılmadı", "NOT_FOUND");
  return rows[0];
}

export async function loadFreezePeriods(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  return tx.$queryRaw<FreezePeriodHistory[]>(Prisma.sql`
    select f.id,f.start_date::text as "startDate",f.end_date::text as "endDate",f.note,
      u.full_name as "createdBy",f.created_at::text as "createdAt",
      coalesce((select sum((a.before_json->>'balanceDue')::numeric) from erp.audit_logs a where a.action='billing.invoice.void_freeze_interval' and a.after_json->>'freezePeriodId'=f.id::text),0)::text as "voidAmount",
      (select count(*)::int from erp.audit_logs a where a.action='billing.freeze_interval.review_required' and a.after_json->>'freezePeriodId'=f.id::text) as "reviewCount"
    from erp.student_freeze_periods f join erp.users u on u.id=f.created_by_id
    where f.student_id=${studentId}::uuid order by f.start_date desc,f.id
  `);
}

export async function buildFreezePreview(
  tx: Prisma.TransactionClient,
  input: FreezePeriodInput,
  student: FreezeStudent,
  lock = false,
): Promise<FreezePreview> {
  if (!student.anchor)
    throw new PublicActionError(
      "Əvvəlcə təsdiqlənmiş ilk dərs tarixi daxil edilməlidir",
    );
  if (input.startDate < student.anchor)
    throw new PublicActionError("Dondurulma ilk dərsdən əvvəl başlaya bilməz");
  if (
    !input.endDate &&
    !["ACTIVE", "FROZEN", "SLOT_WAITING"].includes(student.status)
  )
    throw new PublicActionError(
      "Bu statusda yalnız başa çatmış keçmiş dövr əlavə edilə bilər",
    );
  const periods = await loadFreezePeriods(tx, input.studentId);
  const [reservation] = await tx.$queryRaw<Array<{ overlaps: boolean }>>(Prisma.sql`
    with history as (
      select freeze_reserved,effective_at,lead(effective_at) over(order by effective_at,created_at,id) ends
      from erp.student_status_history where student_id=${input.studentId}::uuid
    ) select exists(select 1 from history where freeze_reserved
      and effective_at<coalesce(${input.endDate || null}::date,'infinity'::date)
      and coalesce(ends,'infinity'::date)>${input.startDate}::date) as overlaps
  `);
  if (reservation?.overlaps) throw new PublicActionError("Bu intervalda ödənişli yer rezervi var. Rezerv dövrünü ödənişsiz dondurma ilə ləğv etmək olmaz");
  if (
    periods.some(
      (p) =>
        input.startDate < (p.endDate || "9999-12-31") &&
        p.startDate < (input.endDate || "9999-12-31"),
    )
  ) {
    throw new PublicActionError(
      "Seçilən tarixlər mövcud dondurulma dövrü ilə üst-üstə düşür",
      "CONFLICT",
    );
  }
  const raw = await tx.$queryRaw<
    Array<{
      id: string;
      period: string;
      amount: string;
      balance: string;
      status: string;
      updated: string;
    }>
  >(Prisma.sql`
    select id,period_month::text as period,amount::text,balance_due::text as balance,status::text,updated_at::text as updated
    from erp.invoices where student_id=${input.studentId}::uuid and status<>'VOID'::erp."InvoiceStatus"
    order by period_month,id ${lock ? Prisma.sql`for update` : Prisma.empty}
  `);
  const allocations = await tx.$queryRaw<
    Array<{ id: string; amount: string }>
  >(Prisma.sql`
    select a.invoice_id as id,sum(a.amount_allocated)::text as amount from erp.payment_allocations a
    join erp.invoices i on i.id=a.invoice_id where i.student_id=${input.studentId}::uuid group by a.invoice_id
  `);
  const allocated = new Map(allocations.map((a) => [a.id, Number(a.amount)]));
  const today = currentBakuDateValue();
  const invoices = raw
    .map((r) => {
      const values = {
        amount: Number(r.amount),
        balance: Number(r.balance),
        allocated: allocated.get(r.id) || 0,
      };
      return {
        id: r.id,
        period: r.period,
        status: r.status,
        ...values,
        ...assessFrozenInvoice({
          ...input,
          ...values,
          periodMonth: r.period,
          anchorDate: student.anchor!,
          status: r.status,
          today,
        }),
      };
    })
    .filter((r) => r.decision !== "KEEP");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        input,
        student,
        raw,
        allocations: allocations.sort((a, b) => a.id.localeCompare(b.id)),
        periods,
        today,
      }),
    )
    .digest("hex");
  return {
    fingerprint,
    currentStatus: student.status,
    freezesNow: !input.endDate && student.status !== "FROZEN",
    voidAmount: invoices
      .filter((r) => r.decision === "VOID")
      .reduce((sum, r) => sum + r.balance, 0),
    reviewCount: invoices.filter((r) => r.decision === "REVIEW").length,
    invoices,
  };
}
