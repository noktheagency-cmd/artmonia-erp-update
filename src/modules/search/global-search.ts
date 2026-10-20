import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { formatLeadStageLabel } from "@/modules/crm/stage";
import { getPrisma } from "@/server/db/prisma";
import type { ErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import { TASK_WORKSPACE_EXCLUDED_TYPES } from "@/modules/tasks/task-scope";

export const globalSearchKinds = [
  "student",
  "lead",
  "employee",
  "task",
  "slot",
  "workshop",
] as const;

export type GlobalSearchKind = (typeof globalSearchKinds)[number];

export type GlobalSearchItem = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
};

export type GlobalSearchResponse = {
  items: GlobalSearchItem[];
  query: string;
};

type SearchContext = {
  raw: string;
  rawPattern: string;
  rawPrefix: string;
  normalized: string;
  normalizedPattern: string;
  normalizedPrefix: string;
  digits: string;
  digitsPattern: string;
};

type GlobalSearchRawRow = {
  kind: GlobalSearchKind;
  kindOrder: number;
  id: string;
  title: string;
  status: string;
  code: string;
  meta1: string;
  meta2: string;
  meta3: string;
};

const perKindLimit = 5;

export async function searchGlobal(
  actor: ErpActor,
  rawQuery: string,
): Promise<GlobalSearchResponse> {
  const query = cleanSearchQuery(rawQuery);

  if (query.length < 2) {
    return { items: [], query };
  }

  const context = buildSearchContext(query);
  return { items: await searchAllKinds(actor, context), query };
}

function buildSearchContext(query: string): SearchContext {
  const normalized = normalizeAzerbaijaniSearch(query);
  const digits = query.replace(/\D/g, "");

  return {
    raw: query,
    rawPattern: `%${query}%`,
    rawPrefix: `${query}%`,
    normalized,
    normalizedPattern: `%${normalized}%`,
    normalizedPrefix: `${normalized}%`,
    digits,
    digitsPattern: `%${digits}%`,
  };
}

function cleanSearchQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function normalizeAzerbaijaniSearch(value: string) {
  return value
    .toLocaleLowerCase("az")
    .replaceAll("ə", "e")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replaceAll("ç", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const foldedLettersFrom = "əğıöşüçƏĞIİÖŞÜÇ";
const foldedLettersTo = "egiosucegiiosuc";

function normalizedSql(column: Prisma.Sql) {
  return Prisma.sql`translate(lower(coalesce(${column}, '')), ${foldedLettersFrom}, ${foldedLettersTo})`;
}

function foldedNameMatchSql(column: Prisma.Sql, search: SearchContext) {
  const tokens = search.normalized.split(" ").filter((token) => token.length >= 2);
  if (tokens.length === 0) return Prisma.sql`false`;
  const folded = normalizedSql(column);
  return Prisma.sql`(${Prisma.join(
    tokens.map((token) => Prisma.sql`${folded} like ${`%${token}%`}`),
    " and ",
  )})`;
}

async function searchAllKinds(actor: ErpActor, search: SearchContext) {
  const studentReadScope = scopeFor(actor.permissions, "student.read");
  const studentScopeSql = studentReadScope === "ALL"
    ? Prisma.sql`true`
    : studentReadScope === "ASSIGNED"
      ? Prisma.sql`s.manager_id = ${actor.id}::uuid`
      : Prisma.sql`false`;
  const leadReadScope = scopeFor(actor.permissions, "crm.lead.read");
  const leadScopeSql = leadReadScope === "ALL"
    ? Prisma.sql`true`
    : leadReadScope === "ASSIGNED"
      ? Prisma.sql`l.manager_id = ${actor.id}::uuid`
      : Prisma.sql`false`;
  const canReadEmployees = actor.permissions.has("hr.employee.read");
  const canReadTeachers = actor.permissions.has("teacher.read");
  const employeeScopeSql = canReadEmployees
    ? Prisma.sql`true`
    : canReadTeachers
      ? Prisma.sql`he.teacher_id is not null`
      : Prisma.sql`false`;
  const taskReadScope = scopeFor(actor.permissions, "task.read");
  const taskScopeSql = taskReadScope === "ALL"
    ? Prisma.sql`true`
    : taskReadScope === "ASSIGNED"
      ? Prisma.sql`task_row.owner_user_id = ${actor.id}::uuid`
      : Prisma.sql`false`;
  const groupReadScope = scopeFor(actor.permissions, "group.read");
  const slotScopeSql = groupReadScope === "ALL"
    ? Prisma.sql`true`
    : groupReadScope === "ASSIGNED"
      ? Prisma.sql`slot_teacher.user_id = ${actor.id}::uuid`
      : Prisma.sql`false`;
  const workshopScopeSql = actor.permissions.has("workshop.read")
    ? Prisma.sql`true`
    : Prisma.sql`false`;
  const normalizedStudentName = normalizedSql(Prisma.sql`student_contact.full_name`);
  const normalizedLeadName = normalizedSql(Prisma.sql`lead_contact.full_name`);
  const normalizedEmployeeName = normalizedSql(Prisma.sql`he.full_name`);
  const normalizedTaskTitle = normalizedSql(Prisma.sql`task_row.title`);
  const normalizedSlotTeacher = normalizedSql(Prisma.sql`slot_teacher.full_name`);
  const normalizedWorkshopTitle = normalizedSql(Prisma.sql`workshop_row.title`);
  const studentPhoneSql = search.digits.length >= 3
    ? Prisma.sql`or student_contact.phone_normalized like ${search.digitsPattern}`
    : Prisma.empty;
  const leadPhoneSql = search.digits.length >= 3
    ? Prisma.sql`or lead_contact.phone_normalized like ${search.digitsPattern}`
    : Prisma.empty;
  const employeePhoneSql = search.digits.length >= 3
    ? Prisma.sql`or regexp_replace(coalesce(he.phone, ''), '\\D', '', 'g') like ${search.digitsPattern}`
    : Prisma.empty;

  const rows = await getPrisma().$queryRaw<GlobalSearchRawRow[]>(Prisma.sql`
    select
      combined.kind,
      combined."kindOrder",
      combined.id,
      combined.title,
      combined.status,
      combined.code,
      combined."meta1",
      combined."meta2",
      combined."meta3"
    from (
      (
        select
          'student'::text as kind,
          1::int as "kindOrder",
          s.id::text as id,
          student_contact.full_name as title,
          s.lifecycle_status::text as status,
          s.code::text as code,
          coalesce(student_contact.phone_display, '')::text as "meta1",
          coalesce(student_enrollment.program_name, '')::text as "meta2",
          coalesce(student_enrollment.teacher_name, '')::text as "meta3",
          case
            when lower(s.code) = lower(${search.raw}) or ${normalizedStudentName} = ${search.normalized} then 0
            when s.code ilike ${search.rawPrefix} or ${normalizedStudentName} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          s.updated_at::text as "sortValue"
        from erp.students s
        join erp.contacts student_contact on student_contact.id = s.contact_id
        left join lateral (
          select program.name as program_name, teacher.full_name as teacher_name
          from erp.enrollments enrollment
          join erp.programs program on program.id = enrollment.program_id
          left join erp.teachers teacher on teacher.id = enrollment.teacher_id
          where enrollment.student_id = s.id
            and enrollment.status in ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus")
          order by enrollment.start_date desc, enrollment.created_at desc
          limit 1
        ) student_enrollment on true
        where ${studentScopeSql}
          and (
            s.code ilike ${search.rawPattern}
            or student_contact.full_name ilike ${search.rawPattern}
            or student_contact.phone_display ilike ${search.rawPattern}
            or ${normalizedStudentName} like ${search.normalizedPattern}
            or ${foldedNameMatchSql(Prisma.sql`student_contact.full_name`, search)}
            ${studentPhoneSql}
          )
        order by rank asc, s.updated_at desc
        limit ${perKindLimit}
      )
      union all
      (
        select
          'lead'::text as kind,
          2::int as "kindOrder",
          l.id::text as id,
          lead_contact.full_name as title,
          l.stage::text as status,
          ''::text as code,
          coalesce(lead_contact.phone_display, '')::text as "meta1",
          coalesce(lead_program.name, '')::text as "meta2",
          coalesce(l.source, '')::text as "meta3",
          case
            when ${normalizedLeadName} = ${search.normalized} then 0
            when ${normalizedLeadName} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          l.updated_at::text as "sortValue"
        from erp.leads l
        join erp.contacts lead_contact on lead_contact.id = l.contact_id
        left join erp.programs lead_program on lead_program.id = l.program_interest_id
        where ${leadScopeSql}
          and (
            lead_contact.full_name ilike ${search.rawPattern}
            or lead_contact.phone_display ilike ${search.rawPattern}
            or l.source ilike ${search.rawPattern}
            or lead_program.name ilike ${search.rawPattern}
            or ${normalizedLeadName} like ${search.normalizedPattern}
            or ${foldedNameMatchSql(Prisma.sql`lead_contact.full_name`, search)}
            ${leadPhoneSql}
          )
        order by rank asc, l.updated_at desc
        limit ${perKindLimit}
      )
      union all
      (
        select
          'employee'::text as kind,
          3::int as "kindOrder",
          he.id::text as id,
          he.full_name as title,
          he.status::text as status,
          he.staff_type::text as code,
          coalesce(he.position, '')::text as "meta1",
          coalesce(he.department, '')::text as "meta2",
          coalesce(he.phone, he.email, '')::text as "meta3",
          case
            when ${normalizedEmployeeName} = ${search.normalized} then 0
            when ${normalizedEmployeeName} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          he.updated_at::text as "sortValue"
        from erp.hr_employees he
        where ${employeeScopeSql}
          and (
            he.full_name ilike ${search.rawPattern}
            or he.email ilike ${search.rawPattern}
            or he.phone ilike ${search.rawPattern}
            or he.department ilike ${search.rawPattern}
            or he.position ilike ${search.rawPattern}
            or ${normalizedEmployeeName} like ${search.normalizedPattern}
            or ${foldedNameMatchSql(Prisma.sql`he.full_name`, search)}
            ${employeePhoneSql}
          )
        order by rank asc, he.updated_at desc
        limit ${perKindLimit}
      )
      union all
      (
        select
          'task'::text as kind,
          4::int as "kindOrder",
          task_row.id::text as id,
          task_row.title as title,
          task_row.status::text as status,
          ''::text as code,
          coalesce(task_owner.full_name, '')::text as "meta1",
          coalesce(task_row.due_at::text, '')::text as "meta2",
          ''::text as "meta3",
          case
            when ${normalizedTaskTitle} = ${search.normalized} then 0
            when ${normalizedTaskTitle} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          task_row.updated_at::text as "sortValue"
        from erp.tasks task_row
        left join erp.users task_owner on task_owner.id = task_row.owner_user_id
        where ${taskScopeSql}
          and task_row.type not in (${Prisma.join([...TASK_WORKSPACE_EXCLUDED_TYPES])})
          and (
            task_row.title ilike ${search.rawPattern}
            or task_row.description ilike ${search.rawPattern}
            or task_owner.full_name ilike ${search.rawPattern}
            or ${normalizedTaskTitle} like ${search.normalizedPattern}
          )
        order by rank asc,
          case when task_row.status in ('OPEN'::"erp"."TaskStatus", 'IN_PROGRESS'::"erp"."TaskStatus") then 0 else 1 end,
          task_row.due_at asc nulls last,
          task_row.updated_at desc
        limit ${perKindLimit}
      )
      union all
      (
        select
          'slot'::text as kind,
          5::int as "kindOrder",
          slot_row.id::text as id,
          coalesce(slot_teacher.full_name, 'Müəllim təyin edilməyib')::text as title,
          slot_row.weekday::text as status,
          slot_row.shift::text as code,
          slot_row.start_time::text as "meta1",
          slot_row.end_time::text as "meta2",
          coalesce(slot_row.room, '')::text as "meta3",
          case
            when ${normalizedSlotTeacher} = ${search.normalized} then 0
            when ${normalizedSlotTeacher} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          slot_row.updated_at::text as "sortValue"
        from erp.class_slots slot_row
        left join erp.teachers slot_teacher on slot_teacher.id = slot_row.teacher_id
        where ${slotScopeSql}
          and (
            slot_teacher.full_name ilike ${search.rawPattern}
            or slot_row.room ilike ${search.rawPattern}
            or slot_row.weekday::text ilike ${search.rawPattern}
            or slot_row.shift::text ilike ${search.rawPattern}
            or slot_row.start_time ilike ${search.rawPattern}
            or ${normalizedSlotTeacher} like ${search.normalizedPattern}
          )
        order by rank asc, slot_row.weekday asc, slot_row.start_time asc
        limit ${perKindLimit}
      )
      union all
      (
        select
          'workshop'::text as kind,
          6::int as "kindOrder",
          workshop_row.id::text as id,
          workshop_row.title as title,
          workshop_row.status::text as status,
          workshop_row.event_type::text as code,
          workshop_row.event_date::text as "meta1",
          coalesce(workshop_row.instructor, '')::text as "meta2",
          coalesce(workshop_row.room, workshop_row.category, '')::text as "meta3",
          case
            when ${normalizedWorkshopTitle} = ${search.normalized} then 0
            when ${normalizedWorkshopTitle} like ${search.normalizedPrefix} then 1
            else 2
          end::int as rank,
          workshop_row.updated_at::text as "sortValue"
        from erp.workshop_events workshop_row
        where ${workshopScopeSql}
          and (
            workshop_row.title ilike ${search.rawPattern}
            or workshop_row.instructor ilike ${search.rawPattern}
            or workshop_row.category ilike ${search.rawPattern}
            or workshop_row.room ilike ${search.rawPattern}
            or ${normalizedWorkshopTitle} like ${search.normalizedPattern}
          )
        order by rank asc, workshop_row.event_date desc, workshop_row.updated_at desc
        limit ${perKindLimit}
      )
    ) combined
    order by combined."kindOrder" asc, combined.rank asc, combined."sortValue" desc
  `);

  return rows.flatMap((row) => {
    const item = mapGlobalSearchRow(row);
    return item ? [item] : [];
  });
}

function mapGlobalSearchRow(row: GlobalSearchRawRow): GlobalSearchItem | null {
  switch (row.kind) {
    case "student":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `Tələbə · ${row.code} · ${studentStatusLabels[row.status] ?? row.status}`,
        meta: compactMeta(row.meta1, row.meta2, row.meta3),
        href: `/students/${row.id}`,
      };
    case "lead":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `CRM müraciəti · ${formatLeadStageLabel(row.status)}`,
        meta: compactMeta(row.meta1, row.meta2, row.meta3),
        href: `/crm?tab=list&q=${encodeURIComponent(row.title)}`,
      };
    case "employee":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `${row.code === "TEACHER" ? "Müəllim" : "Əməkdaş"} · ${employeeStatusLabels[row.status] ?? row.status}`,
        meta: compactMeta(row.meta1, row.meta2, row.meta3),
        href: `/hr/${row.id}`,
      };
    case "task":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `Task · ${taskStatusLabels[row.status] ?? row.status}`,
        meta: compactMeta(row.meta1, row.meta2 ? formatDate(new Date(row.meta2)) : "Deadline yoxdur"),
        href: "/tasks",
      };
    case "slot":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `Slot · ${weekdayLabels[row.status] ?? row.status} · ${row.meta1}–${row.meta2}`,
        meta: compactMeta(row.meta3, shiftLabels[row.code] ?? row.code),
        href: `/groups?slot=${row.id}&details=1`,
      };
    case "workshop":
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        subtitle: `${row.code === "MASTERCLASS" ? "Masterclass" : "Workshop"} · ${workshopStatusLabels[row.status] ?? row.status}`,
        meta: compactMeta(formatDate(new Date(row.meta1)), row.meta2, row.meta3),
        href: `/workshops/${row.id}`,
      };
    default:
      return null;
  }
}

function compactMeta(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(" · ");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Baku",
  }).format(value);
}

const studentStatusLabels: Record<string, string> = {
  ACTIVE: "Aktiv",
  SLOT_WAITING: "Slot gözləyir",
  FROZEN: "Dondurulub",
  STOPPED: "Dayandırılıb",
  DECLINED: "İmtina edib",
  COMPLETED: "Tamamlayıb",
};

const employeeStatusLabels: Record<string, string> = {
  ACTIVE: "Aktiv",
  ON_LEAVE: "Məzuniyyətdə",
  INACTIVE: "Deaktiv",
  TERMINATED: "İşdən ayrılıb",
};

const taskStatusLabels: Record<string, string> = {
  OPEN: "Gözləyir",
  IN_PROGRESS: "İcradadır",
  DONE: "Tamamlanıb",
  CANCELLED: "Ləğv edilib",
};

const workshopStatusLabels: Record<string, string> = {
  DRAFT: "Qaralama",
  SCHEDULED: "Planlanıb",
  COMPLETED: "Tamamlanıb",
  CANCELLED: "Ləğv edilib",
};

const weekdayLabels: Record<string, string> = {
  MONDAY: "Bazar ertəsi",
  TUESDAY: "Çərşənbə axşamı",
  WEDNESDAY: "Çərşənbə",
  THURSDAY: "Cümə axşamı",
  FRIDAY: "Cümə",
  SATURDAY: "Şənbə",
  SUNDAY: "Bazar",
};

const shiftLabels: Record<string, string> = {
  MORNING: "Səhər",
  AFTERNOON: "Günorta",
  EVENING: "Axşam",
};
