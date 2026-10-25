"use server";
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireMutationActor } from "@/server/auth/actor";
import { safeServerAction } from "@/server/actions/safe-action";
import { getPrisma } from "@/server/db/prisma";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { bookSingleLesson, markSingleLesson, paySingleLesson } from "./single-lesson-service";

function invalidate() {
  for (const tag of [erpCacheTags.students,erpCacheTags.attendance,erpCacheTags.finance,erpCacheTags.dashboard]) updateTag(tag);
  revalidatePath("/students", "layout"); revalidatePath("/finance"); revalidatePath("/dashboard"); revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/calendar");
}
export const bookSingleLessonAction = safeServerAction(async (form: FormData) => {
  const actor = await requireMutationActor();
  const raw = Object.fromEntries(form);
  z.string().uuid().parse(raw.studentId);
  if (!raw.studentId) delete raw.studentId;
  if (!raw.fullName) delete raw.fullName;
  if (!raw.phone) delete raw.phone;
  const lesson = await getPrisma().$transaction(tx => bookSingleLesson(tx, raw, actor), { timeout: 20000 });
  invalidate(); return { id: lesson.id, studentId: lesson.studentId };
}, "Birdəfəlik dərs yaradılmadı.");
export const markSingleLessonAction = safeServerAction(async (form: FormData) => {
  const actor = await requireMutationActor("attendance.manage");
  const input = z.object({ lessonId: z.string().uuid(), status: z.enum(["ATTENDED","ABSENT","CANCELLED"]) }).parse(Object.fromEntries(form));
  await getPrisma().$transaction(tx => markSingleLesson(tx, input, actor), { timeout: 20000 });
  invalidate(); return { done: true };
}, "Dərsin davamiyyəti saxlanılmadı.");
export const paySingleLessonAction = safeServerAction(async (form: FormData) => {
  const actor = await requireMutationActor("billing.payment.create");
  const input = z.object({ lessonId: z.string().uuid(), requestId: z.string().uuid(), paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(["CASH","CARD","BANK_TRANSFER"]) }).parse(Object.fromEntries(form));
  await getPrisma().$transaction(tx => paySingleLesson(tx, input, actor), { timeout: 20000 });
  invalidate(); return { done: true };
}, "Dərsin ödənişi saxlanılmadı.");
