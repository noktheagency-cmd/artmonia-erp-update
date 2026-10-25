import "server-only";
import { getPrisma } from "@/server/db/prisma";
import { getTeacherPayrollPreviewsFromDb, recalculateTeacherPayoutsForMonthInTransaction } from "./teacher-payroll-service";
export { recalculateTeacherPayoutsForMonthInTransaction };
export type { TeacherPayrollPreview } from "./teacher-payroll-service";

export async function getTeacherPayrollPreviews(period = new Date()) {
  return getTeacherPayrollPreviewsFromDb(getPrisma(), period);
}
export async function recalculateTeacherPayoutsForMonth(period: Date, actorId: string | null, teacherIds?: string[]) {
  await getPrisma().$transaction(tx => recalculateTeacherPayoutsForMonthInTransaction(tx, period, actorId, teacherIds), { timeout: 20000 });
}
