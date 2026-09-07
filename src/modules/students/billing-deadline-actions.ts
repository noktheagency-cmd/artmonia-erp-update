"use server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";
import {
  safeServerAction,
  PublicActionError,
} from "@/server/actions/safe-action";
import { revalidatePath, updateTag } from "next/cache";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import {
  canEditBillingDeadline,
  deadlineRuleSchema,
} from "./billing-deadline-policy";
import {
  applyDeadlineRule,
  previewDeadlineRule,
} from "./billing-deadline-service";

async function authorize(studentId: string) {
  const actor = await requireMutationActor("student.read");
  if (!canEditBillingDeadline(actor.id))
    throw new PublicActionError(
      "Ödəniş gününü yalnız Vaqif və İsmət dəyişə bilər",
      "FORBIDDEN",
    );
  const student = await getPrisma().student.findUnique({
    where: { id: studentId },
    select: { managerId: true },
  });
  if (
    !student ||
    (scopeFor(actor.permissions, "student.read") !== "ALL" &&
      student.managerId !== actor.id)
  )
    throw new PublicActionError("Tələbəyə giriş icazəsi yoxdur", "FORBIDDEN");
  return actor;
}
export const getBillingDeadlineHistoryAction = safeServerAction(
  async (studentId: string) => {
    z.string().uuid().parse(studentId);
    await authorize(studentId);
    return getPrisma().$queryRaw<
      Array<{
        id: string;
        month: string;
        mode: string;
        day: number;
        reason: string;
        creator: string;
      }>
    >(Prisma.sql`
    select r.id,to_char(r.effective_month,'YYYY-MM') as "month",r.mode,r.due_day as "day",r.reason,u.full_name creator
    from erp.student_due_date_rules r join erp.users u on u.id=r.created_by_id where r.student_id=${studentId}::uuid order by r.version desc limit 50
  `);
  },
  "Ödəniş günü tarixçəsi yüklənmədi",
);
export const previewBillingDeadlineAction = safeServerAction(
  async (data: FormData) => {
    const input = deadlineRuleSchema.parse(Object.fromEntries(data));
    await authorize(input.studentId);
    return getPrisma().$transaction((tx) => previewDeadlineRule(tx, input));
  },
  "Önizləmə hazırlanmadı",
);
export const saveBillingDeadlineAction = safeServerAction(
  async (data: FormData) => {
    const input = deadlineRuleSchema.parse(Object.fromEntries(data));
    const actor = await authorize(input.studentId);
    if (data.get("confirmed") !== "yes")
      throw new PublicActionError(
        "Dəyişikliyi əvvəlcədən yoxlayıb təsdiqləyin",
      );
    const fingerprint = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(data.get("fingerprint"));
    const result = await getPrisma().$transaction(
      (tx) => applyDeadlineRule(tx, input, actor.id, fingerprint),
      { timeout: 20000 },
    );
    for (const tag of [
      erpCacheTags.students,
      erpCacheTags.dashboard,
      erpCacheTags.finance,
    ])
      updateTag(tag);
    for (const path of [
      "/students",
      `/students/${input.studentId}`,
      "/dashboard",
      "/finance",
    ])
      revalidatePath(path);
    return result;
  },
  "Ödəniş günü dəyişdirilmədi",
);
