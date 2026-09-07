import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  canEditBillingDeadline,
  deadlineForMonth,
  type DeadlineRuleInput,
} from "./billing-deadline-policy";

export type DeadlinePreview = {
  fingerprint: string;
  invoices: Array<{
    id: string;
    month: string;
    oldDate: string;
    newDate: string;
    amount: string;
    balance: string;
    status: string;
    updated: string;
  }>;
  exampleDates: string[];
};
export async function previewDeadlineRule(
  tx: Prisma.TransactionClient,
  input: DeadlineRuleInput,
  lock = false,
): Promise<DeadlinePreview> {
  const [student] = await tx.$queryRaw<
    Array<{ anchor: string | null; updated: string }>
  >(Prisma.sql`
    select billing_anchor_date::text anchor,updated_at::text updated from erp.students
    where id=${input.studentId}::uuid ${lock ? Prisma.sql`for update` : Prisma.empty}
  `);
  if (!student?.anchor)
    throw new PublicActionError("Təsdiqlənmiş ilk dərs tarixi yoxdur");
  if (input.month < student.anchor.slice(0, 7))
    throw new PublicActionError(
      "İlk dərs ayından əvvəl ödəniş qaydası yaradıla bilməz",
    );
  const invoices = (
    await tx.$queryRaw<DeadlinePreview["invoices"]>(Prisma.sql`
    select id,period_month::text as "month",due_date::text as "oldDate",amount::text,balance_due::text balance,status::text,updated_at::text updated
    from erp.invoices where student_id=${input.studentId}::uuid and enrollment_id is not null and status<>'VOID'::erp."InvoiceStatus"
    and ${input.mode === "ONLY_MONTH" ? Prisma.sql`period_month=${input.month + "-01"}::date` : Prisma.sql`period_month>=${input.month + "-01"}::date`}
    order by period_month,id ${lock ? Prisma.sql`for update` : Prisma.empty}
  `)
  ).map((row) => ({ ...row, newDate: deadlineForMonth(row.month, input.day) }));
  const rules = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`select id from erp.student_due_date_rules where student_id=${input.studentId}::uuid order by version`,
  );
  const start = new Date(input.month + "-01T00:00:00Z");
  const exampleDates = Array.from(
    { length: input.mode === "ONLY_MONTH" ? 1 : 3 },
    (_, index) =>
      deadlineForMonth(
        new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1),
        ).toISOString(),
        input.day,
      ),
  );
  return {
    invoices,
    exampleDates,
    fingerprint: createHash("sha256")
      .update(JSON.stringify({ input, student, invoices, rules }))
      .digest("hex"),
  };
}

export async function applyDeadlineRule(
  tx: Prisma.TransactionClient,
  input: DeadlineRuleInput,
  actorId: string,
  fingerprint: string,
) {
  if (!canEditBillingDeadline(actorId))
    throw new PublicActionError(
      "Ödəniş gününü dəyişmək icazəniz yoxdur",
      "FORBIDDEN",
    );
  // Lock before idempotency check, shared with invoice writers and all student status changes.
  await tx.$queryRaw(
    Prisma.sql`select id from erp.students where id=${input.studentId}::uuid for update`,
  );
  const [existing] = await tx.$queryRaw<
    Array<{
      studentId: string;
      month: string;
      mode: string;
      day: number;
      reason: string;
    }>
  >(Prisma.sql`
    select student_id::text as "studentId",to_char(effective_month,'YYYY-MM') as "month",mode,due_day as "day",reason
    from erp.student_due_date_rules where id=${input.requestId}::uuid
  `);
  if (existing) {
    if (
      existing.studentId !== input.studentId ||
      existing.month !== input.month ||
      existing.mode !== input.mode ||
      existing.day !== input.day ||
      existing.reason !== input.reason
    )
      throw new PublicActionError(
        "Əməliyyat artıq başqa məlumatla saxlanılıb",
        "CONFLICT",
      );
    return { alreadySaved: true };
  }
  const preview = await previewDeadlineRule(tx, input, true);
  if (preview.fingerprint !== fingerprint)
    throw new PublicActionError(
      "Məlumat dəyişib. Önizləməni yenidən yoxlayın",
      "CONFLICT",
    );
  await tx.$executeRaw(Prisma.sql`insert into erp.student_due_date_rules(id,student_id,effective_month,mode,due_day,reason,created_by_id)
    values(${input.requestId}::uuid,${input.studentId}::uuid,${input.month + "-01"}::date,${input.mode},${input.day},${input.reason},${actorId}::uuid)`);
  for (const invoice of preview.invoices) {
    if (invoice.oldDate === invoice.newDate) continue;
    // The database trigger synchronizes deadline/status; money, payment dates and allocations stay intact.
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { dueDate: new Date(invoice.newDate + "T00:00:00Z") },
    });
    await writeAuditLog(tx, {
      actorUserId: actorId,
      action: "billing.invoice.deadline.change",
      entityType: "invoice",
      entityId: invoice.id,
      before: {
        dueDate: invoice.oldDate,
        periodMonth: invoice.month,
        status: invoice.status,
      },
      after: {
        dueDate: invoice.newDate,
        ruleId: input.requestId,
        amountPreserved: invoice.amount,
        balancePreserved: invoice.balance,
      },
      reason: input.reason,
    });
  }
  await writeAuditLog(tx, {
    actorUserId: actorId,
    action: "student.billing_deadline.change",
    entityType: "student",
    entityId: input.studentId,
    after: {
      ruleId: input.requestId,
      mode: input.mode,
      effectiveMonth: input.month,
      day: input.day,
      invoiceCount: preview.invoices.length,
      anchorPreserved: true,
    },
    reason: input.reason,
  });
  return { alreadySaved: false };
}
