import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

export async function assertGuestVisitAvailable(tx: Prisma.TransactionClient, input: {
  studentId: string; date: string; time: string; duration: number;
}) {
  await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`guest-visit:${input.studentId}:${input.date}`}, 0))`);
  const conflicts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    select id from erp.single_lessons where student_id=${input.studentId}::uuid
      and lesson_date=${input.date}::date and status in ('RESERVED', 'ATTENDED')
      and start_time::time < ${input.time}::time + make_interval(mins => ${input.duration}::int)
      and start_time::time + make_interval(mins => duration_minutes) > ${input.time}::time
    limit 1
  `);
  if (conflicts.length) throw new PublicActionError("Bu tələbənin həmin vaxtda qonaq dərsi var. Başqa vaxt seçin.", "CONFLICT");
}
