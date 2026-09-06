import { Prisma } from "@/generated/prisma/client";

/** Company sales include paid, activated returns; manager acquisition bonuses do not. */
export function companySalesCountSql(from: Prisma.Sql, until: Prisma.Sql) {
  return Prisma.sql`(
    select count(*)::int from (
      select s.id, s.registered_at as sale_date
      from erp.students s
      where s.is_test_data = false
      union all
      select s.id, greatest(r.effective_at, activation.activated_at, payment.paid_at) as sale_date
      from erp.students s
      join (
        select distinct student_id, effective_at
        from erp.student_status_history
        where event_type = 'REACTIVATED'::"erp"."StudentLifecycleEventType"
      ) r on r.student_id = s.id and r.effective_at > s.registered_at
      left join lateral (
        select min(h.effective_at) as stopped_at
        from erp.student_status_history h
        where h.student_id = s.id and h.effective_at > r.effective_at
          and h.new_status in ('FROZEN', 'STOPPED', 'COMPLETED', 'DECLINED')
      ) next_stop on true
      join lateral (
        select min(h.effective_at) as activated_at
        from erp.student_status_history h
        where h.student_id = s.id and h.new_status = 'ACTIVE'
          and h.effective_at >= r.effective_at
          and (next_stop.stopped_at is null or h.effective_at < next_stop.stopped_at)
      ) activation on activation.activated_at is not null
      join lateral (
        select min(p.paid_at) as paid_at
        from erp.payments p
        where p.student_id = s.id and p.amount > 0 and p.paid_at >= r.effective_at
          and (next_stop.stopped_at is null or p.paid_at < next_stop.stopped_at)
      ) payment on payment.paid_at is not null
      where s.is_test_data = false
    ) sales
    where sale_date >= ${from}::date and sale_date < ${until}::date
      and sale_date <= (now() at time zone 'Asia/Baku')::date
  )`;
}

export function actualRegistrationSql(date: Prisma.Sql) {
  return Prisma.sql`${date} <= (now() at time zone 'Asia/Baku')::date`;
}
