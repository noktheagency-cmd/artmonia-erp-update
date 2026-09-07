import { Prisma } from "@/generated/prisma/client";

/** Historical eligibility, including after a student has returned to ACTIVE. */
export async function getReservedAttendanceKeys(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  sessionIds: string[],
  enrollmentIds: string[],
) {
  if (!sessionIds.length || !enrollmentIds.length) return new Set<string>();
  const rows = await db.$queryRaw<
    Array<{ sessionId: string; enrollmentId: string }>
  >(Prisma.sql`
    select ss.id::text as "sessionId",e.id::text as "enrollmentId"
    from erp.slot_sessions ss join erp.student_schedule_assignments a on a.slot_id=ss.slot_id
    join erp.enrollments e on e.id=a.enrollment_id
    where ss.id in (${Prisma.join(sessionIds.map((id) => Prisma.sql`${id}::uuid`))})
      and e.id in (${Prisma.join(enrollmentIds.map((id) => Prisma.sql`${id}::uuid`))})
      and a.valid_from<=ss.session_date and (a.valid_to is null or a.valid_to>=ss.session_date)
      and erp.student_is_reserved_on_date(e.student_id,ss.session_date)
  `);
  return new Set(rows.map((row) => `${row.sessionId}:${row.enrollmentId}`));
}
