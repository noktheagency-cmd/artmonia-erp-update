import { Prisma } from "@/generated/prisma/client";

/**
 * HR-linked teachers belong in the shared teacher directory only after their
 * employment status becomes active. An own-profile lookup stays available so
 * a teacher can still open their personal HR profile during probation/leave.
 */
export function buildTeacherDirectoryScope(ownTeacherId?: string) {
  const retainedTeacher = Prisma.sql`
    not (t.is_active = false and he.id is null and t.user_id is null)
  `;

  if (ownTeacherId) {
    return Prisma.sql`where ${retainedTeacher} and t.id = ${ownTeacherId}::uuid`;
  }

  return Prisma.sql`
    where ${retainedTeacher}
      and (
        he.id is null
        or he.status = 'ACTIVE'::"erp"."HrEmployeeStatus"
      )
  `;
}
