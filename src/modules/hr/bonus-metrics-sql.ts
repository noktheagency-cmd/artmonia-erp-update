import { Prisma } from "@/generated/prisma/client";
import { ownerSalesCountSql } from "@/modules/students/sales-metrics-sql";

export function participantEmployeeSql(employeeId?: string) {
  return employeeId ? Prisma.sql`and participant.employee_id = ${employeeId}::uuid` : Prisma.sql``;
}

export function participantSalesMetricsSql(campaignId: string, employeeId?: string) {
  return Prisma.sql`
    select participant.id::text as "participantId",
      ${ownerSalesCountSql(
        Prisma.sql`employee.user_id`,
        Prisma.sql`campaign.starts_at`,
        Prisma.sql`campaign.ends_at + interval '1 day'`,
      )}::int as value
    from erp.hr_bonus_participants participant
    join erp.hr_bonus_campaigns campaign on campaign.id = participant.campaign_id
    left join erp.hr_employees employee on employee.id = participant.employee_id
    where participant.campaign_id = ${campaignId}::uuid
      and participant.is_eligible = true
      ${participantEmployeeSql(employeeId)}
  `;
}
