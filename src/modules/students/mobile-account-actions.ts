"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scopeFor } from "@/server/rbac/permissions";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import {
  inviteStudentMobileAccount,
  resendStudentMobileInvite,
  setStudentMobileAccountDisabled,
} from "@/modules/students/mobile-account-service";

const inputSchema = z.object({ studentId: z.string().uuid() });

async function requireStudentMobileAccountActor(formData: FormData) {
  const actor = await requireMutationActor("student.update");
  const { studentId } = inputSchema.parse(Object.fromEntries(formData));
  const scope = scopeFor(actor.permissions, "student.update");
  const student = await getPrisma().student.findFirst({
    where: {
      id: studentId,
      ...(scope === "ALL" ? {} : scope === "ASSIGNED" ? { managerId: actor.id } : { id: "" }),
    },
    select: { id: true },
  });
  if (!student) throw new PublicActionError("Tələbə tapılmadı və ya əməliyyata icazəniz yoxdur.", "FORBIDDEN");
  return { actor, studentId };
}

async function inviteActionImpl(formData: FormData) {
  const { actor, studentId } = await requireStudentMobileAccountActor(formData);
  await inviteStudentMobileAccount({ studentId, actorId: actor.id });
  revalidatePath(`/students/${studentId}`);
}

async function resendActionImpl(formData: FormData) {
  const { actor, studentId } = await requireStudentMobileAccountActor(formData);
  await resendStudentMobileInvite({ studentId, actorId: actor.id });
  revalidatePath(`/students/${studentId}`);
}

async function disableActionImpl(formData: FormData) {
  const { actor, studentId } = await requireStudentMobileAccountActor(formData);
  await setStudentMobileAccountDisabled({ studentId, actorId: actor.id, disabled: true });
  revalidatePath(`/students/${studentId}`);
}

async function enableActionImpl(formData: FormData) {
  const { actor, studentId } = await requireStudentMobileAccountActor(formData);
  await setStudentMobileAccountDisabled({ studentId, actorId: actor.id, disabled: false });
  revalidatePath(`/students/${studentId}`);
}

export const inviteStudentMobileAccountAction = safeServerAction(
  inviteActionImpl,
  "Mobil hesab yaradıla bilmədi.",
);
export const resendStudentMobileInviteAction = safeServerAction(
  resendActionImpl,
  "Mobil giriş linki göndərilə bilmədi.",
);
export const disableStudentMobileAccountAction = safeServerAction(
  disableActionImpl,
  "Mobil hesab deaktiv edilə bilmədi.",
);
export const enableStudentMobileAccountAction = safeServerAction(
  enableActionImpl,
  "Mobil hesab aktiv edilə bilmədi.",
);
