"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  safeServerAction,
  PublicActionError,
} from "@/server/actions/safe-action";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { reviewSchema, settingsSchema } from "./contract";
import { reviewHomework, commentScope } from "./homework";
import { setBalance, settings } from "./service";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";

export const reviewHomeworkAction = safeServerAction(async (raw: unknown) => {
  const actor = await requireMutationActor("attendance.manage");
  const input = reviewSchema.parse(raw);
  try {
    await getPrisma().$transaction((tx) => reviewHomework(tx, actor, input), {timeout:15000});
  } catch (error) {
    if (error instanceof MobilePortalError) throw new PublicActionError(error.message, error.status===404?"NOT_FOUND":"CONFLICT");
    throw error;
  }
  revalidatePath("/firca");
}, "Tapşırıq yoxlanılmadı.");
export const saveFircaSettingsAction = safeServerAction(
  async (raw: unknown) => {
    const actor = await requireMutationActor("settings.manage");
    const input = settingsSchema.parse(raw);
    await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`select id from erp.firca_settings where id=1 for update`;
      const previous = await settings(tx);
      if (
        previous.startsAt &&
        previous.startsAt.toISOString() !== input.startsAt
      )
        throw new PublicActionError(
          "Başlanğıc tarixi ilk saxlamadan sonra dəyişmir.",
          "CONFLICT",
        );
      if (
        !previous.startsAt &&
        input.startsAt &&
        new Date(input.startsAt).getTime() < Date.now() - 60000
      )
        throw new PublicActionError(
          "İlk başlanğıc tarixi keçmişdə ola bilməz.",
        );
      await tx.$executeRaw`update erp.firca_settings set enabled=${input.enabled},starts_at=${input.startsAt ? new Date(input.startsAt) : null},min_comment_length=${input.minCommentLength},updated_at=clock_timestamp() where id=1`;
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "firca.settings",
        entityType: "firca_settings",
        entityId: "1",
        before: {
          enabled: previous.enabled,
          startsAt: previous.startsAt?.toISOString() ?? null,
          minCommentLength: previous.minCommentLength,
        },
        after: input,
      });
    });
    revalidatePath("/firca");
  },
  "Fırça ayarları saxlanmadı.",
);
export const excludeFircaStudentAction = safeServerAction(
  async (raw: unknown) => {
    const actor = await requireMutationActor("settings.manage");
    const input = z
      .object({
        studentId: z.string().uuid(),
        excluded: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(raw);
    await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca:" + input.studentId},0))`;
      if (input.excluded)
        await tx.$executeRaw`insert into erp.firca_exclusions(student_id,reason) values(${input.studentId}::uuid,${input.reason}) on conflict(student_id) do update set reason=excluded.reason`;
      else
        await tx.$executeRaw`delete from erp.firca_exclusions where student_id=${input.studentId}::uuid`;
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "firca.exclusion",
        entityType: "student",
        entityId: input.studentId,
        after: { excluded: input.excluded },
        reason: input.reason,
      });
    });
    revalidatePath("/firca");
  },
  "Tələbə ayarı saxlanmadı.",
);
export const moderateFircaCommentAction = safeServerAction(
  async (raw: unknown) => {
    const actor = await requireMutationActor("attendance.manage");
    const input = z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(raw);
    await getPrisma().$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ studentId: string; postId: string }[]>(
        Prisma.sql`select r.student_id::text as "studentId",r.post_id::text as "postId" from erp.firca_comments r where r.id=${input.id}::uuid and ${commentScope(actor)}`,
      );
      if (!row) throw new PublicActionError("Rəy tapılmadı.", "NOT_FOUND");
      await tx.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca:" + row.studentId},0))`;
      await tx.$executeRaw`update erp.firca_comments set moderated=true where id=${input.id}::uuid`;
      const [claim] = await tx.$queryRaw<
        { id: string }[]
      >`select comment_id::text as id from erp.firca_comment_claims where student_id=${row.studentId}::uuid and post_id=${row.postId}::uuid`;
      if (claim?.id === input.id)
        await setBalance(
          tx,
          row.studentId,
          "comment",
          row.postId,
          0,
          input.reason,
          actor.id,
        );
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "firca.comment.moderate",
        entityType: "firca_comment",
        entityId: input.id,
        after: { moderated: true },
        reason: input.reason,
      });
    });
    revalidatePath("/firca");
  },
  "Rəy yoxlanılmadı.",
);
