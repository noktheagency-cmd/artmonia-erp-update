import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

export const FIRST_LESSON_PAYMENT_BLOCK_REASON =
  "İlk dərsdə iştirak üçün ilk dövrün tam ödənişi tamamlanmalıdır.";

export function assertFirstLessonAttendancePaymentAllowed(
  blockedEnrollmentIds: ReadonlySet<string>,
  items: ReadonlyArray<{ enrollmentId: string; status: string | null }>,
) {
  if (items.some(item => item.status && blockedEnrollmentIds.has(item.enrollmentId))) {
    throw new PublicActionError(FIRST_LESSON_PAYMENT_BLOCK_REASON);
  }
}

/** Caller must scope the enrollment IDs. One bounded query for the whole roster. */
export async function getUnpaidFirstLessonEnrollmentIds(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  enrollmentIds: string[],
  lessonDate: Date,
) {
  const rows = await getUnpaidFirstLessonEnrollmentDates(db, enrollmentIds, [lessonDate]);
  return new Set(rows.map(row => row.enrollmentId));
}

/** A single query also covers cron batches spanning several lesson dates. */
export async function getUnpaidFirstLessonEnrollmentDates(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  enrollmentIds: string[],
  lessonDates: Date[],
) {
  if (!enrollmentIds.length || !lessonDates.length) return [];
  const dates = [...new Set(lessonDates.map(date => date.toISOString().slice(0, 10)))];
  return db.$queryRaw<Array<{ enrollmentId: string; lessonDate: string }>>(Prisma.sql`
    select e.id::text as "enrollmentId", lesson.lesson_date::text as "lessonDate"
    from erp.enrollments e
    join erp.students s on s.id = e.student_id
    cross join unnest(array[${Prisma.join(dates.map(date => Prisma.sql`${date}::date`))}]) as lesson(lesson_date)
    left join lateral (
      select cs.id, cs.status, cs.initial_fee
      from erp.course_sales cs
      where cs.enrollment_id = e.id and cs.student_id = s.id and cs.cancelled_at is null
      order by cs.qualified_at desc, cs.created_at desc
      limit 1
    ) sale on true
    where e.id in (${Prisma.join([...new Set(enrollmentIds)].map(id => Prisma.sql`${id}::uuid`))})
      and s.lifecycle_status = 'SLOT_WAITING'
      and s.admission_tracking = true
      and e.monthly_fee > 0
      and coalesce(e.discount_type::text, '') <> 'GIFT'
      and (
        sale.id is null or sale.status::text <> 'COMPLETE'
        or coalesce((
          select sum(p.amount) from erp.payments p
          where p.course_sale_id = sale.id and p.paid_at <= lesson.lesson_date
        ), 0) < sale.initial_fee
      )
  `);
}
