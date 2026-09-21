import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { assertPermission, scopeFor } from "@/server/rbac/permissions";
import { getPrisma } from "@/server/db/prisma";
import { todayInBaku } from "@/modules/groups/shared";
import { PublicActionError } from "@/server/actions/public-action-error";
import { localizeAttendanceGroup, retentionInput, retentionRate, type RetentionReport } from "./retention-analytics";
import { retentionCtes, retentionScope, retentionSummarySql } from "./retention-analytics-sql";

export async function getRetentionReport(input: unknown): Promise<RetentionReport> {
  const actor = await requireErpActor("student.read");
  assertPermission(actor.permissions, "attendance.read");
  const { from, to, teacherId, groupId, status, page } = retentionInput.parse(input);
  if (to > todayInBaku()) throw new PublicActionError("Gələcək tarix seçilə bilməz.");
  const teacherScope = scopeFor(actor.permissions, "attendance.read") === "ALL"
    ? Prisma.sql`true` : Prisma.sql`t.user_id = ${actor.id}::uuid`;
  const [row] = await getPrisma().$queryRaw<Array<Omit<RetentionReport, "rate" | "page" | "pages">>>(Prisma.sql`
    ${retentionCtes(from, to, retentionScope(actor), teacherId, groupId)}
    select ${retentionSummarySql},
      coalesce((select jsonb_agg(d order by d.date desc, d.id) from (
        select l.id::text, l.student_id::text as "studentId", c.full_name as name,
          l.date::text as date, l.reason, l.note, u.full_name as manager
        from losses l join population p on p.id = l.student_id
        join erp.contacts c on c.id = p.contact_id left join erp.users u on u.id = p.manager_id
        where l.status = ${status} order by l.date desc, l.id
        limit 20 offset ${(page - 1) * 20}
      ) d), '[]'::jsonb) as details,
      coalesce((select jsonb_agg(o order by o.name) from (
        select distinct t.id::text, t.full_name as name
        from relations r join base b on b.id = r.student_id join erp.teachers t on t.id = r.teacher_id
        where ${teacherScope}
      ) o), '[]'::jsonb) as teachers,
      coalesce((select jsonb_agg(o order by o.name) from (
        select distinct cs.id::text, coalesce(cs.display_name, cs.weekday::text || ' · ' || cs.start_time) as name,
          t.id::text as "teacherId"
        from relations r join base b on b.id = r.student_id join erp.class_slots cs on cs.id = r.group_id
        join erp.teachers t on t.id = r.teacher_id where ${teacherScope}
      ) o), '[]'::jsonb) as groups
  `);
  return { ...row, groups: row.groups.map((group) => ({ ...group, name: localizeAttendanceGroup(group.name) })),
    rate: retentionRate(row.total, row.population), page, pages: Math.max(1, Math.ceil((status === "FROZEN" ? row.frozen : row.stopped) / 20)) };
}
