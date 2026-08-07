import { GroupWeekday, Prisma } from "@/generated/prisma/client";

export const teacherScheduleOverlapConstraint =
  "class_slots_teacher_schedule_no_overlap";

type TeacherAvailabilityInput = {
  teacherId: string;
  weekday: GroupWeekday;
  startTime: string;
  endTime: string;
};

export function buildTeacherAvailabilityWhere(
  input: TeacherAvailabilityInput,
  excludeId?: string,
): Prisma.ClassSlotWhereInput {
  return {
    ...(excludeId ? { id: { not: excludeId } } : {}),
    teacherId: input.teacherId,
    weekday: input.weekday,
    startTime: { lt: input.endTime },
    endTime: { gt: input.startTime },
  };
}

export function isTeacherScheduleOverlapError(error: unknown) {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length && visited.size < 100) {
    const value = queue.shift();
    if (value === null || value === undefined || visited.has(value)) continue;
    visited.add(value);

    if (typeof value === "string") {
      if (value === "23P01" || value.includes(teacherScheduleOverlapConstraint)) {
        return true;
      }
      continue;
    }
    if (typeof value !== "object") continue;

    queue.push(...Object.values(value as Record<string, unknown>));
  }

  return false;
}
