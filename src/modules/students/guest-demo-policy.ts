import type { Prisma } from "@/generated/prisma/client";

// Only explicitly marked guest demos are visible in operational guest views.
// Financial, payroll and student KPI queries must continue excluding all test data.
export const GUEST_DEMO_MARKER = "[guest-lesson-demo]";

export function visibleGuestStudentWhere(): Prisma.StudentWhereInput {
  return { OR: [
    { isTestData: false },
    { isTestData: true, notes: { startsWith: GUEST_DEMO_MARKER }, enrollments: { none: {} } },
  ] };
}
