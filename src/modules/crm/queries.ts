import { AppRole, LeadStage, Prisma } from "@/generated/prisma/client";
import {
  canAssignLeadOwner,
  getCrmScopeLabel,
} from "@/modules/crm/access";
import { getPrisma } from "@/server/db/prisma";
import {
  isPrivilegedActor,
  requireErpActor,
  type ErpActor,
} from "@/server/auth/actor";
import {
  formatCount,
  formatShortDate,
  startOfMonth,
  toNumber,
} from "@/modules/shared/format";
import { formFilterString } from "@/modules/shared/form-values";
import {
  buildCrmSourceOptions,
  formatCrmSourceLabel,
} from "@/modules/crm/source-options";
import {
  type CrmPeriodValue,
  getCrmPeriodRange,
  normalizeCrmPeriod,
} from "@/modules/crm/period";
import {
  type LeadStageValue,
  leadStageLabels,
  leadStageOptions,
  leadStageTones,
} from "@/modules/crm/stage";

export type CrmFollowUpFilter =
  | "all"
  | "overdue"
  | "today"
  | "unplanned"
  | "scheduled";

export type CrmFiltersInput = {
  q?: string;
  stage?: string;
  owner?: string;
  program?: string;
  source?: string;
  followUp?: string;
  period?: string;
};

export type CrmData = {
  query: string;
  returnTo: string;
  filters: {
    stage: LeadStageValue | "";
    owner: string;
    program: string;
    source: string;
    followUp: CrmFollowUpFilter;
    period: CrmPeriodValue;
    activeCount: number;
  };
  access: {
    actorName: string;
    actorEmail: string;
    roleLabel: string;
    scopeLabel: string;
    canAssignOwner: boolean;
    canCreateLead: boolean;
    canUpdateLead: boolean;
    canConvertLead: boolean;
  };
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
    tone: "blue" | "coral" | "yellow" | "mint";
  }>;
  stageSummary: Array<{
    stage: LeadStageValue;
    label: string;
    value: string;
    tone: "success" | "warning" | "danger" | "neutral" | "info";
  }>;
  leads: Array<{
    id: string;
    name: string;
    phone: string;
    source: string;
    sourceValue: string;
    program: string;
    programId: string;
    manager: string;
    managerId: string;
    stage: LeadStage;
    stageLabel: string;
    stageTone: "success" | "warning" | "danger" | "neutral" | "info";
    createdAt: string;
    nextFollowUpAt: string;
    latestNote: string;
    canConvert: boolean;
    conversionLabel: string;
    detail: {
      contactId: string;
      fullName: string;
      phone: string;
      source: string;
      programId: string;
      managerId: string;
      stage: LeadStageValue;
      nextFollowUpDate: string;
      createdAt: string;
      convertedStudentCode: string;
      timeline: Array<{
        id: string;
        label: string;
        reason: string;
        date: string;
        changedBy: string;
      }>;
    };
  }>;
  programs: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; fullName: string }>;
  sourceOptions: string[];
};

type CrmPeriodRange = ReturnType<typeof getCrmPeriodRange>;

type CrmRawRow = {
  stageCounts: unknown;
  totalLeads: unknown;
  createdThisMonth: unknown;
  openFollowUps: unknown;
  qualifiedCount: unknown;
  leads: unknown;
  programs: unknown;
  managers: unknown;
  sources: unknown;
};

type CrmLeadRawRow = {
  id: string;
  stage: string;
  source: string | null;
  createdAt: string;
  nextFollowUpAt: string | null;
  contactId: string;
  managerId: string | null;
  programId: string | null;
  fullName: string;
  phone: string | null;
  managerName: string | null;
  programName: string | null;
  convertedStudentCode: string | null;
  timeline: unknown;
};

type CrmLeadTimelineRawRow = {
  id: string;
  newStage: string;
  reason: string | null;
  createdAt: string;
  changedBy: string | null;
};

export async function getCrmData(input: CrmFiltersInput = {}): Promise<CrmData> {
  const prisma = getPrisma();
  const actor = await requireErpActor("crm.lead.read");
  const search = normalizeText(input.q);
  const stageFilter = normalizeStage(input.stage);
  const ownerFilter = normalizeText(input.owner);
  const programFilter = normalizeText(input.program);
  const sourceFilter = normalizeText(input.source);
  const followUpFilter = normalizeFollowUp(input.followUp);
  const periodFilter = normalizeCrmPeriod(input.period);
  const searchDigits = search.replace(/\D/g, "");
  const monthStart = startOfMonth();
  const today = new Date();
  const periodRange = getCrmPeriodRange(periodFilter, today);
  const todayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(todayStart.getUTCDate() + 1);

  const [row] = await getCrmRawData(prisma, {
    actor,
    search,
    searchDigits,
    stageFilter,
    ownerFilter,
    programFilter,
    sourceFilter,
    followUpFilter,
    periodRange,
    monthStart,
    today,
    todayStart,
    tomorrowStart,
  });
  const stageCounts = asJsonRecord(row?.stageCounts);
  const totalLeads = toNumber(row?.totalLeads);
  const createdThisMonth = toNumber(row?.createdThisMonth);
  const openFollowUps = toNumber(row?.openFollowUps);
  const qualifiedCount = toNumber(row?.qualifiedCount);
  const leadRows = asJsonArray<CrmLeadRawRow>(row?.leads);
  const programs = asJsonArray<{ id: string; name: string }>(row?.programs);
  const managers = asJsonArray<{ id: string; fullName: string }>(row?.managers);
  const sourceValues = asJsonArray<string>(row?.sources);
  const activeCount = [
    stageFilter,
    ownerFilter,
    programFilter,
    sourceFilter,
    periodFilter !== "this_month" ? periodFilter : "",
    followUpFilter !== "all" ? followUpFilter : "",
  ].filter(Boolean).length;

  return {
    query: search,
    returnTo: buildReturnTo({
      q: search,
      stage: stageFilter,
      owner: ownerFilter,
      program: programFilter,
      source: sourceFilter,
      followUp: followUpFilter,
      period: periodFilter,
    }),
    filters: {
      stage: stageFilter ?? "",
      owner: ownerFilter,
      program: programFilter,
      source: sourceFilter,
      followUp: followUpFilter,
      period: periodFilter,
      activeCount,
    },
    access: {
      actorName: actor.fullName,
      actorEmail: actor.email,
      roleLabel: actor.roles.join(", "),
      scopeLabel: getCrmScopeLabel(actor),
      canAssignOwner: managers.some((manager) => manager.id !== actor.id),
      canCreateLead: actor.permissions.has("crm.lead.create"),
      canUpdateLead: actor.permissions.has("crm.lead.update"),
      canConvertLead: actor.permissions.has("crm.lead.convert"),
    },
    metrics: [
      {
        label: "Cəmi müraciətlər",
        value: formatCount(totalLeads),
        helper: "Bütün CRM qeydləri",
        tone: "blue",
      },
      {
        label: "Bu ay yeni",
        value: formatCount(createdThisMonth),
        helper: "Yaradılma tarixinə görə",
        tone: "mint",
      },
      {
        label: "Cavab gözləyir",
        value: formatCount(openFollowUps),
        helper: "Vaxtı çatmış və ya planlanmamış izləmələr",
        tone: "coral",
      },
      {
        label: "Uyğun müraciətlər",
        value: formatCount(qualifiedCount),
        helper: "Sınaq görüşü üçün hazır",
        tone: "yellow",
      },
    ],
    stageSummary: leadStageOptions.map((stage) => ({
      stage,
      label: leadStageLabels[stage],
      value: formatCount(stageCounts[stage] ?? 0),
      tone: leadStageTones[stage],
    })),
    leads: leadRows.map((lead) => formatLeadRow(lead)),
    programs,
    managers,
    sourceOptions: buildCrmSourceOptions(sourceValues),
  };
}

function getCrmRawData(
  prisma: ReturnType<typeof getPrisma>,
  input: {
    actor: ErpActor;
    search: string;
    searchDigits: string;
    stageFilter: LeadStageValue | undefined;
    ownerFilter: string;
    programFilter: string;
    sourceFilter: string;
    followUpFilter: CrmFollowUpFilter;
    periodRange: CrmPeriodRange;
    monthStart: Date;
    today: Date;
    todayStart: Date;
    tomorrowStart: Date;
  }
) {
  const scopeSql = buildLeadScopeSql(input.actor);
  const periodSql = buildLeadPeriodSql(input.periodRange);
  const summarySql = Prisma.sql`${scopeSql} AND ${periodSql}`;
  const listWhereSql = buildCrmListWhereSql(input);
  const managerScopeSql = buildManagerScopeSql(input.actor);

  return prisma.$queryRaw<CrmRawRow[]>(Prisma.sql`
    select
      coalesce((
        select jsonb_object_agg(summary.stage, summary.total_count)
        from (
          select l.stage::text as stage, count(*)::int as total_count
          from erp.leads l
          where ${summarySql}
          group by l.stage
        ) summary
      ), '{}'::jsonb) as "stageCounts",
      coalesce((
        select count(*)::int
        from erp.leads l
        where ${summarySql}
      ), 0) as "totalLeads",
      coalesce((
        select count(*)::int
        from erp.leads l
        where ${scopeSql}
          and l.created_at >= ${input.monthStart}
      ), 0) as "createdThisMonth",
      coalesce((
        select count(*)::int
        from erp.leads l
        where ${summarySql}
          and l.stage in (
            'NEW'::"erp"."LeadStage",
            'CONTACTED'::"erp"."LeadStage",
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage",
            'NURTURE'::"erp"."LeadStage"
          )
          and (l.next_follow_up_at is null or l.next_follow_up_at <= ${input.today})
      ), 0) as "openFollowUps",
      coalesce((
        select count(*)::int
        from erp.leads l
        where ${summarySql}
          and l.stage in (
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage"
          )
      ), 0) as "qualifiedCount",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', lead_rows.id::text,
            'stage', lead_rows.stage::text,
            'source', lead_rows.source,
            'createdAt', lead_rows.created_at,
            'nextFollowUpAt', lead_rows.next_follow_up_at,
            'contactId', lead_rows.contact_id::text,
            'managerId', lead_rows.manager_id::text,
            'programId', lead_rows.program_interest_id::text,
            'fullName', lead_rows.full_name,
            'phone', lead_rows.phone_display,
            'managerName', lead_rows.manager_name,
            'programName', lead_rows.program_name,
            'convertedStudentCode', lead_rows.converted_student_code,
            'timeline', coalesce(history.timeline, '[]'::jsonb)
          )
          order by lead_rows.next_follow_up_at asc nulls last, lead_rows.created_at desc
        )
        from (
          select
            l.id,
            l.stage,
            l.source,
            l.created_at,
            l.next_follow_up_at,
            l.contact_id,
            l.manager_id,
            l.program_interest_id,
            c.full_name,
            c.phone_display,
            m.full_name as manager_name,
            p.name as program_name,
            s.code as converted_student_code
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join erp.users m on m.id = l.manager_id
          left join erp.programs p on p.id = l.program_interest_id
          left join erp.students s on s.id = l.converted_student_id
          where ${listWhereSql}
          order by l.next_follow_up_at asc nulls last, l.created_at desc
          limit 50
        ) lead_rows
        left join lateral (
          select jsonb_agg(
            jsonb_build_object(
              'id', h.id::text,
              'newStage', h.new_stage::text,
              'reason', h.reason,
              'createdAt', h.created_at,
              'changedBy', changed_by.full_name
            )
            order by h.created_at desc
          ) as timeline
          from (
            select
              h.id,
              h.new_stage,
              h.reason,
              h.created_at,
              h.changed_by_id
            from erp.lead_stage_history h
            where h.lead_id = lead_rows.id
            order by h.created_at desc
            limit 8
          ) h
          left join erp.users changed_by on changed_by.id = h.changed_by_id
        ) history on true
      ), '[]'::jsonb) as "leads",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', p.id::text, 'name', p.name)
          order by p.name asc
        )
        from erp.programs p
        where p.is_active = true
      ), '[]'::jsonb) as "programs",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', u.id::text, 'fullName', u.full_name)
          order by u.full_name asc
        )
        from erp.users u
        where ${managerScopeSql}
      ), '[]'::jsonb) as "managers",
      coalesce((
        select jsonb_agg(source_rows.source order by source_rows.source asc)
        from (
          select distinct l.source
          from erp.leads l
          where ${scopeSql}
            and l.source is not null
        ) source_rows
      ), '[]'::jsonb) as "sources"
  `);
}

function buildLeadScopeSql(actor: ErpActor) {
  if (isPrivilegedActor(actor)) {
    return Prisma.sql`true`;
  }

  if (actor.roles.includes(AppRole.SALES)) {
    return Prisma.sql`l.manager_id = ${actor.id}::uuid`;
  }

  return Prisma.sql`false`;
}

function buildManagerScopeSql(actor: ErpActor) {
  if (canAssignLeadOwner(actor)) {
    return Prisma.sql`
      u.is_active = true
      and exists (
        select 1
        from erp.user_roles ur
        join erp.roles r on r.id = ur.role_id
        where ur.user_id = u.id
          and r.code::text in ('OWNER', 'ADMIN', 'SALES')
      )
    `;
  }

  return Prisma.sql`u.id = ${actor.id}::uuid and u.is_active = true`;
}

function buildLeadPeriodSql(periodRange: CrmPeriodRange) {
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];

  if (periodRange) {
    conditions.push(Prisma.sql`l.created_at >= ${periodRange.gte}`);

    if ("lt" in periodRange && periodRange.lt) {
      conditions.push(Prisma.sql`l.created_at < ${periodRange.lt}`);
    }
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildCrmListWhereSql(input: {
  actor: ErpActor;
  search: string;
  searchDigits: string;
  stageFilter: LeadStageValue | undefined;
  ownerFilter: string;
  programFilter: string;
  sourceFilter: string;
  followUpFilter: CrmFollowUpFilter;
  periodRange: CrmPeriodRange;
  todayStart: Date;
  tomorrowStart: Date;
}) {
  const conditions: Prisma.Sql[] = [
    buildLeadScopeSql(input.actor),
    buildLeadPeriodSql(input.periodRange),
  ];

  if (input.search.length > 0) {
    const searchPattern = `%${input.search}%`;
    const searchConditions: Prisma.Sql[] = [
      Prisma.sql`c.full_name ilike ${searchPattern}`,
      Prisma.sql`c.phone_display ilike ${searchPattern}`,
      Prisma.sql`l.source ilike ${searchPattern}`,
      Prisma.sql`p.name ilike ${searchPattern}`,
    ];

    if (input.searchDigits.length > 0) {
      searchConditions.push(
        Prisma.sql`c.phone_normalized like ${`%${input.searchDigits}%`}`
      );
    }

    conditions.push(Prisma.sql`(${Prisma.join(searchConditions, " OR ")})`);
  }

  if (input.stageFilter) {
    conditions.push(Prisma.sql`l.stage = ${input.stageFilter}::"erp"."LeadStage"`);
  }

  if (input.ownerFilter) {
    conditions.push(Prisma.sql`l.manager_id = ${input.ownerFilter}::uuid`);
  }

  if (input.programFilter) {
    conditions.push(
      Prisma.sql`l.program_interest_id = ${input.programFilter}::uuid`
    );
  }

  if (input.sourceFilter) {
    conditions.push(Prisma.sql`l.source = ${input.sourceFilter}`);
  }

  if (input.followUpFilter === "overdue") {
    conditions.push(Prisma.sql`l.next_follow_up_at < ${input.todayStart}`);
  } else if (input.followUpFilter === "today") {
    conditions.push(Prisma.sql`
      l.next_follow_up_at >= ${input.todayStart}
      and l.next_follow_up_at < ${input.tomorrowStart}
    `);
  } else if (input.followUpFilter === "unplanned") {
    conditions.push(Prisma.sql`l.next_follow_up_at is null`);
  } else if (input.followUpFilter === "scheduled") {
    conditions.push(Prisma.sql`l.next_follow_up_at is not null`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function formatLeadRow(lead: CrmLeadRawRow): CrmData["leads"][number] {
  const stage = normalizeLeadStageValue(lead.stage);
  const timeline = asJsonArray<CrmLeadTimelineRawRow>(lead.timeline);
  const programId = lead.programId ?? "";
  const managerId = lead.managerId ?? "";
  const convertedStudentCode = lead.convertedStudentCode ?? "";

  return {
    id: lead.id,
    name: lead.fullName,
    phone: lead.phone ?? "-",
    source: formatCrmSourceLabel(lead.source),
    sourceValue: lead.source ?? "",
    program: lead.programName ?? "-",
    programId,
    manager: lead.managerName ?? "Təyin edilməyib",
    managerId,
    stage,
    stageLabel: leadStageLabels[stage],
    stageTone: leadStageTones[stage],
    createdAt: formatShortDate(lead.createdAt),
    nextFollowUpAt: lead.nextFollowUpAt
      ? formatShortDate(lead.nextFollowUpAt)
      : "Tarix yoxdur",
    latestNote: formatLeadHistoryReason(timeline[0]?.reason),
    canConvert:
      Boolean(programId) &&
      !convertedStudentCode &&
      stage !== LeadStage.REGISTERED,
    conversionLabel: convertedStudentCode
      ? convertedStudentCode
      : programId
        ? "Qeydiyyata al"
        : "Proqram seçilməyib",
    detail: {
      contactId: lead.contactId,
      fullName: lead.fullName,
      phone: lead.phone ?? "",
      source: lead.source ?? "",
      programId,
      managerId,
      stage,
      nextFollowUpDate: formatDateInput(lead.nextFollowUpAt),
      createdAt: formatShortDate(lead.createdAt),
      convertedStudentCode,
      timeline: timeline.map((item) => {
        const newStage = normalizeLeadStageValue(item.newStage);

        return {
          id: item.id,
          label: leadStageLabels[newStage],
          reason: formatLeadHistoryReason(item.reason),
          date: formatShortDate(item.createdAt),
          changedBy: item.changedBy ?? "Sistem",
        };
      }),
    },
  };
}

function normalizeText(value: string | undefined) {
  return formFilterString(value);
}

function normalizeStage(value: string | undefined): LeadStageValue | undefined {
  return leadStageOptions.find((stage) => stage === value);
}

function normalizeLeadStageValue(value: string): LeadStageValue {
  return leadStageOptions.find((stage) => stage === value) ?? "NEW";
}

function normalizeFollowUp(value: string | undefined): CrmFollowUpFilter {
  const allowed: CrmFollowUpFilter[] = [
    "all",
    "overdue",
    "today",
    "unplanned",
    "scheduled",
  ];

  return allowed.find((item) => item === value) ?? "all";
}

function buildReturnTo(filters: {
  q: string;
  stage?: string;
  owner: string;
  program: string;
  source: string;
  period: CrmPeriodValue;
  followUp: CrmFollowUpFilter;
}) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.program) params.set("program", filters.program);
  if (filters.source) params.set("source", filters.source);
  if (filters.period !== "this_month") params.set("period", filters.period);
  if (filters.followUp !== "all") params.set("followUp", filters.followUp);

  const query = params.toString();
  return query ? `/crm?${query}` : "/crm";
}

function formatDateInput(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = date.getUTCFullYear().toString();

  return `${day}.${month}.${year}`;
}

function formatLeadHistoryReason(value: string | null | undefined) {
  if (!value) {
    return "Mərhələ qeydi yoxdur";
  }

  const convertedMatch = value.match(/^Converted to student (.+)$/);
  if (convertedMatch) {
    return `Tələbəyə çevrildi: ${convertedMatch[1]}`;
  }

  const knownReasons: Record<string, string> = {
    "Lead created": "Müraciət yaradıldı",
    "Lead updated": "Müraciət yeniləndi",
    "Stage updated": "Mərhələ yeniləndi",
    "Lead converted from CRM": "CRM müraciəti tələbəyə çevrildi",
  };

  return knownReasons[value] ?? value;
}

function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asJsonRecord(value: unknown): Record<string, number> {
  const parsed =
    typeof value === "string"
      ? parseJsonObject(value)
      : value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;

  if (!parsed) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, count]) => [key, toNumber(count)])
  );
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
