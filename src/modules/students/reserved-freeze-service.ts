import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { currentBakuDateValue } from "./payment-date-policy";

export async function changeReservedFreeze(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    actorId: string;
    reserve: boolean;
    effectiveAt: Date;
    note?: string;
  },
) {
  const today = currentBakuDateValue();
  if (input.effectiveAt.toISOString().slice(0, 10) !== today)
    throw new PublicActionError(
      "Rezervə keçid və rezervdən qayıdış bu gün üçün edilir; keçmiş davamiyyət dəyişdirilmir",
    );
  if (!input.note || input.note.trim().length < 3)
    throw new PublicActionError("Rezerv dəyişikliyinin səbəbini yazın");
  const [student] = await tx.$queryRaw<
    Array<{
      status: string;
      reserved: boolean;
      paused: boolean;
      anchor: Date | null;
    }>
  >(Prisma.sql`
    select lifecycle_status::text status,freeze_reserved reserved,billing_paused paused,billing_anchor_date anchor
    from erp.students where id=${input.studentId}::uuid for update
  `);
  if (!student) throw new PublicActionError("Tələbə tapılmadı");
  if (input.reserve && student.reserved) return;
  if (!input.reserve && !student.reserved)
    throw new PublicActionError("Tələbənin rezervli dondurması yoxdur");
  if (input.reserve && student.status !== "ACTIVE")
    throw new PublicActionError(
      "Yalnız aktiv slotu olan aktiv tələbə yerini rezerv edə bilər",
    );
  if (!student.anchor)
    throw new PublicActionError("Təsdiqlənmiş ilk dərs tarixi yoxdur");
  const [conflict] = await tx.$queryRaw<
    Array<{ blocked: boolean }>
  >(Prisma.sql`select
    exists(select 1 from erp.student_status_history where student_id=${input.studentId}::uuid and effective_at>${today}::date)
    or exists(select 1 from erp.student_freeze_periods where student_id=${input.studentId}::uuid and end_date is null) as blocked`);
  if (conflict.blocked)
    throw new PublicActionError(
      "Açıq dondurulma və ya gələcək status qeydi var. Əvvəlcə onu yoxlayın",
    );
  const slots = await tx.studentScheduleAssignment.count({
    where: {
      validTo: null,
      enrollment: { studentId: input.studentId, status: "ACTIVE" },
    },
  });
  if (!slots)
    throw new PublicActionError(
      "Saxlanılacaq aktiv slot yoxdur. Əvvəlcə slot təyin edilməlidir",
    );
  await tx.student.update({
    where: { id: input.studentId },
    data: {
      lifecycleStatus: input.reserve ? "FROZEN" : "ACTIVE",
      freezeReserved: input.reserve,
      billingPaused: false,
      freezeReturnAt: null,
    },
  });
  await tx.studentStatusHistory.create({
    data: {
      studentId: input.studentId,
      oldStatus: student.status as "ACTIVE" | "FROZEN",
      newStatus: input.reserve ? "FROZEN" : "ACTIVE",
      freezeReserved: input.reserve,
      eventType: input.reserve ? "STATUS_CHANGE" : "REACTIVATED",
      effectiveAt: input.effectiveAt,
      changedById: input.actorId,
      note: input.note,
      reason: input.reserve
        ? "Dondurulub — yer rezervdir, aylıq ödəniş davam edir"
        : "Rezervdən dərsə qayıtdı — slot saxlanıldı",
    },
  });
  await writeAuditLog(tx, {
    actorUserId: input.actorId,
    action: input.reserve
      ? "student.freeze_reserved.start"
      : "student.freeze_reserved.end",
    entityType: "student",
    entityId: input.studentId,
    before: student,
    after: {
      status: input.reserve ? "FROZEN" : "ACTIVE",
      freezeReserved: input.reserve,
      billingPaused: false,
      preservedSlots: slots,
      anchorPreserved: true,
    },
    reason: input.note,
  });
}
