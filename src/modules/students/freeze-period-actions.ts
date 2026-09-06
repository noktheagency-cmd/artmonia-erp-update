"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireMutationActor, type MutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { freezePeriodSchema } from "./freeze-period-policy";
import {
  buildFreezePreview,
  loadFreezePeriods,
  loadFreezeStudent,
  type FreezeStudent,
} from "./freeze-period-service";
import { currentBakuDateValue } from "./payment-date-policy";
import { pauseStudentLifecycleRelations } from "./lifecycle-service";
import { clearStudentPaymentSchedules } from "./payment-schedule-service";

function authorize(
  actor: MutationActor,
  student: FreezeStudent,
  manage: boolean,
) {
  if (
    !actor.permissions.has("student.read") ||
    (scopeFor(actor.permissions, "student.read") !== "ALL" &&
      student.managerId !== actor.id) ||
    (manage &&
      scopeFor(actor.permissions, "student.freeze.manage") !== "ALL" &&
      student.managerId !== actor.id)
  ) {
    throw new PublicActionError("Bu tələbə üzrə icazəniz yoxdur", "FORBIDDEN");
  }
}
export const getStudentFreezePeriodsAction = safeServerAction(
  async (studentId: string) => {
    z.string().uuid().parse(studentId);
    const actor = await requireMutationActor("student.read");
    return getPrisma().$transaction(async (tx) => {
      const student = await loadFreezeStudent(tx, studentId);
      authorize(actor, student, false);
      return {
        periods: await loadFreezePeriods(tx, studentId),
        canManage:
          actor.permissions.has("student.freeze.manage") &&
          (scopeFor(actor.permissions, "student.freeze.manage") === "ALL" ||
            student.managerId === actor.id),
      };
    });
  },
  "Dondurulma tarixçəsi yüklənmədi",
);

export const previewStudentFreezePeriodAction = safeServerAction(
  async (formData: FormData) => {
    const actor = await requireMutationActor("student.freeze.manage");
    const input = freezePeriodSchema.parse(Object.fromEntries(formData));
    return getPrisma().$transaction(async (tx) => {
      const student = await loadFreezeStudent(tx, input.studentId);
      authorize(actor, student, true);
      return buildFreezePreview(tx, input, student);
    });
  },
  "Dondurulmanın maliyyə təsiri hesablanmadı",
);

export const createStudentFreezePeriodAction = safeServerAction(
  async (formData: FormData) => {
    const actor = await requireMutationActor("student.freeze.manage");
    const input = freezePeriodSchema.parse(Object.fromEntries(formData));
    const fingerprint = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(formData.get("fingerprint"));
    if (formData.get("confirmed") !== "yes")
      throw new PublicActionError(
        "Əvvəlcə maliyyə təsirini yoxlayıb təsdiqləyin",
      );
    const result = await getPrisma().$transaction(
      async (tx) => {
        const student = await loadFreezeStudent(tx, input.studentId, true);
        authorize(actor, student, true);
        const existing = await tx.$queryRaw<
          Array<{
            studentId: string;
            startDate: string;
            endDate: string | null;
            note: string;
          }>
        >(Prisma.sql`
      select student_id::text as "studentId",start_date::text as "startDate",end_date::text as "endDate",note
      from erp.student_freeze_periods where id=${input.requestId}::uuid
    `);
        if (existing[0]) {
          const e = existing[0];
          if (
            e.studentId !== input.studentId ||
            e.startDate !== input.startDate ||
            (e.endDate || "") !== input.endDate ||
            e.note !== input.note
          )
            throw new PublicActionError(
              "Əməliyyat identifikatoru artıq istifadə edilib",
              "CONFLICT",
            );
          return { id: input.requestId, alreadySaved: true };
        }
        const preview = await buildFreezePreview(tx, input, student, true);
        if (preview.fingerprint !== fingerprint)
          throw new PublicActionError(
            "Önizləmədən sonra məlumat dəyişib. Maliyyə təsirini yenidən yoxlayın",
            "CONFLICT",
          );
        await tx.$executeRaw(Prisma.sql`insert into erp.student_freeze_periods(id,student_id,start_date,end_date,note,created_by_id)
      values(${input.requestId}::uuid,${input.studentId}::uuid,${input.startDate}::date,${input.endDate || null}::date,${input.note},${actor.id}::uuid)`);
        for (const invoice of preview.invoices) {
          if (invoice.decision === "VOID")
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: "VOID", balanceDue: 0 },
            });
          await writeAuditLog(tx, {
            actorUserId: actor.id,
            action:
              invoice.decision === "VOID"
                ? "billing.invoice.void_freeze_interval"
                : "billing.freeze_interval.review_required",
            entityType: "invoice",
            entityId: invoice.id,
            before: {
              status: invoice.status,
              amount: invoice.amount,
              balanceDue: invoice.balance,
              allocated: invoice.allocated,
            },
            after: {
              freezePeriodId: input.requestId,
              cycleStart: invoice.cycleStart,
              cycleEnd: invoice.cycleEnd,
              decision: invoice.decision,
              status: invoice.decision === "VOID" ? "VOID" : invoice.status,
            },
            reason: input.note,
          });
        }
        if (preview.freezesNow) {
          const today = new Date(currentBakuDateValue() + "T00:00:00Z");
          await tx.student.update({
            where: { id: input.studentId },
            data: { lifecycleStatus: "FROZEN", billingPaused: true },
          });
          await tx.studentStatusHistory.create({
            data: {
              studentId: input.studentId,
              oldStatus: student.status as "ACTIVE" | "SLOT_WAITING",
              newStatus: "FROZEN",
              effectiveAt: today,
              reason: "Dondurulma dövrü əlavə edildi",
              note: input.note,
              changedById: actor.id,
            },
          });
          await pauseStudentLifecycleRelations(tx, {
            studentId: input.studentId,
            effectiveAt: today,
            changedById: actor.id,
            clearTeacherAssignment: false,
          });
          await clearStudentPaymentSchedules(tx, [input.studentId]);
        }
        await writeAuditLog(tx, {
          actorUserId: actor.id,
          action: "student.freeze_period.create",
          entityType: "student",
          entityId: input.studentId,
          before: { status: student.status, billingPaused: student.paused },
          after: {
            freezePeriodId: input.requestId,
            startDate: input.startDate,
            endDate: input.endDate || null,
            status: preview.freezesNow ? "FROZEN" : student.status,
            voidAmount: preview.voidAmount,
            reviewCount: preview.reviewCount,
            anchorPreserved: true,
          },
          reason: input.note,
        });
        return { id: input.requestId, alreadySaved: false };
      },
      { timeout: 20000 },
    );
    for (const tag of [
      erpCacheTags.students,
      erpCacheTags.dashboard,
      erpCacheTags.finance,
      erpCacheTags.slots,
      erpCacheTags.attendance,
    ])
      updateTag(tag);
    for (const path of [
      "/students",
      `/students/${input.studentId}`,
      "/dashboard",
      "/finance",
      "/groups",
    ])
      revalidatePath(path);
    return result;
  },
  "Dondurulma dövrü saxlanılmadı",
);
