import { LeadStage, Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { getCrmScopeLabel, getLeadReadScope } from "@/modules/crm/access";
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
  formatLeadPriorityLabel,
  formatNextActionTypeLabel,
  leadPriorityOptions,
  leadPriorityTones,
  type LeadPriorityValue,
  nextActionTypeOptions,
  type NextActionTypeValue,
} from "@/modules/crm/follow-up";
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
import {
  leadHadMeetingAttendedSql,
  leadHadMeetingScheduledSql,
  leadHadRealContactSql,
} from "@/modules/crm/contact-metrics-sql";
import { leadNeedsMeetingAttendanceConfirmSql } from "@/modules/crm/registration-attend-policy";
import {
  leadHasQualifiedSaleSql,
  ownerSalesCountSql,
} from "@/modules/students/sales-metrics-sql";
import {
  crmTeamVisibleHrStatuses,
  getCrmTeamPerformanceAccess,
} from "@/modules/crm/team-performance-rules";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { scopeFor, type PermissionScope } from "@/server/rbac/permissions";

export type CrmFollowUpFilter =
  | "all"
  | "workshop_masterclass"
  | "attention"
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
  priority?: string;
  followUp?: string;
  period?: string;
  from?: string;
  to?: string;
};

export type CrmData = {
  query: string;
  returnTo: string;
  filters: {
    stage: LeadStageValue | "";
    owner: string;
    program: string;
    source: string;
    priority: LeadPriorityValue | "";
    followUp: CrmFollowUpFilter;
    period: CrmPeriodValue;
    dateFrom: string;
    dateTo: string;
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
    canExport: boolean;
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
  /** BK-22: sum of all-time stage card counts (scope only, no period). */
  stageAllTimeTotal: number;
  /** BK-23: full filtered list size; table may return a page of leads. */
  listTotalCount: number;
  attentionFocus: CrmLeadFocusRow[];
  createdTodayFocus: CrmLeadFocusRow[];
  dashboardStats: {
    salesCount: string;
    conversionRate: string;
    contactedCount: string;
    contactRate: string;
    /** BK-16: combined consultation+trial meeting scheduled/reached. */
    meetingCount: string;
    meetingAttendedCount: string;
    contactToMeetingRate: string;
    meetingToSaleRate: string;
    /** @deprecated alias of meetingCount for older UI bindings */
    consultationCount: string;
    contactToConsultationRate: string;
    consultationToSaleRate: string;
    trialLessonLeads: string;
    trialLessonCount: string;
    directSales: string;
    consultationSales: string;
    meetingSales: string;
    lossRate: string;
    teamPerformance: Array<{
      manager: string;
      leads: string;
      sales: string;
      conversionRate: string;
    }>;
    sourceStats: Array<{ label: string; value: string }>;
    programStats: Array<{ label: string; value: string }>;
  };
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
    priority: LeadPriorityValue;
    priorityLabel: string;
    priorityTone: "success" | "warning" | "danger" | "neutral" | "info";
    nextActionType: NextActionTypeValue | "";
    nextActionTypeLabel: string;
    trialLessonCount: number;
    createdAt: string;
    nextFollowUpAt: string;
    nextFollowUpIso: string | null;
    latestNote: string;
    canConvert: boolean;
    conversionLabel: string;
    /** BK-18: open SCHEDULED meeting without ATTENDED yet. */
    needsMeetingAttendanceConfirm: boolean;
    detail: {
      contactId: string;
      fullName: string;
      phone: string;
      source: string;
      educationLevel: string;
      programId: string;
      managerId: string;
      stage: LeadStageValue;
      priority: LeadPriorityValue;
      nextActionType: NextActionTypeValue | "";
      trialLessonCount: number;
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
  campaigns: Array<{ id: string; name: string }>;
  sourceOptions: string[];
};

type CrmLeadFocusRow = {
  id: string;
  name: string;
  phone: string;
  bucket: "today" | "tomorrow" | "overdue";
  priorityLabel: string;
  priorityTone: "success" | "warning" | "danger" | "neutral" | "info";
  nextActionTypeLabel: string;
  nextFollowUpAt: string;
  manager: string;
  category: "general" | "workshop_masterclass";
  createdAt?: string;
};

type CrmPeriodRange = { gte?: Date; lt?: Date } | null;
type CrmCacheActor = Pick<ErpActor, "id" | "roles"> & {
  readScope: PermissionScope;
};
type CrmCachePeriodRange = { gte?: string; lt?: string } | null;

type CrmCacheInput = {
  actor: CrmCacheActor;
  search: string;
  searchDigits: string;
  stageFilter: LeadStageValue | "";
  ownerFilter: string;
  programFilter: string;
  sourceFilter: string;
  priorityFilter: LeadPriorityValue | "";
  followUpFilter: CrmFollowUpFilter;
  periodRange: CrmCachePeriodRange;
  monthStart: string;
  today: string;
  todayStart: string;
  tomorrowStart: string;
  dayAfterTomorrowStart: string;
};

type CrmRawRow = {
  stageCounts: unknown;
  totalLeads: unknown;
  listTotalCount: unknown;
  createdThisMonth: unknown;
  openFollowUps: unknown;
  qualifiedCount: unknown;
  conversionStats: unknown;
  teamPerformance: unknown;
  sourceStats: unknown;
  programStats: unknown;
  attentionLeads: unknown;
  createdTodayLeads: unknown;
  leads: unknown;
  programs: unknown;
  managers: unknown;
  campaigns: unknown;
  sources: unknown;
};

type CrmAttentionRawRow = {
  id: string;
  source: string | null;
  priority: string | null;
  nextActionType: string | null;
  nextFollowUpAt: string | null;
  createdAt?: string;
  fullName: string;
  phone: string | null;
  managerName: string | null;
};

type CrmLeadRawRow = {
  id: string;
  stage: string;
  source: string | null;
  priority: string | null;
  nextActionType: string | null;
  trialLessonCount: number | null;
  createdAt: string;
  nextFollowUpAt: string | null;
  contactId: string;
  managerId: string | null;
  programId: string | null;
  educationLevel: string | null;
  fullName: string;
  phone: string | null;
  managerName: string | null;
  programName: string | null;
  convertedStudentCode: string | null;
  needsMeetingAttendanceConfirm: boolean | null;
  timeline: unknown;
};

type CrmConversionStatsRaw = {
  salesCount: unknown;
  contactedCount: unknown;
  meetingCount: unknown;
  meetingAttendedCount: unknown;
  meetingSales: unknown;
  trialLessonLeads: unknown;
  trialLessonCount: unknown;
  directSales: unknown;
  lostCount: unknown;
};

type CrmTeamPerformanceRaw = {
  manager: string | null;
  leads: unknown;
  sales: unknown;
};

type CrmBreakdownRaw = {
  label: string | null;
  value: unknown;
};

type CrmLeadTimelineRawRow = {
  id: string;
  newStage: string;
  reason: string | null;
  createdAt: string;
  changedBy: string | null;
};

export async function getCrmData(input: CrmFiltersInput = {}): Promise<CrmData> {
  const actor = await requireErpActor("crm.lead.read");
  const search = normalizeText(input.q);
  const stageFilter = normalizeStage(input.stage);
  const ownerFilter = normalizeText(input.owner);
  const programFilter = normalizeText(input.program);
  const sourceFilter = normalizeText(input.source);
  const priorityFilter = normalizePriority(input.priority);
  const followUpFilter = normalizeFollowUp(input.followUp);
  const periodFilter = normalizeCrmPeriod(input.period);
  const dateFromFilter = normalizeDateFilter(input.from);
  const dateToFilter = normalizeDateFilter(input.to);
  const searchDigits = search.replace(/\D/g, "");
  const monthStart = startOfMonth();
  const today = new Date();
  const cachedToday = getCacheTimeBucket(today);
  const periodRange = resolveCrmPeriodRange({
    period: periodFilter,
    dateFrom: dateFromFilter.date,
    dateTo: dateToFilter.date,
    reference: today,
  });
  const todayStart = getBakuBusinessDate(today);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(todayStart.getUTCDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  const [row] = await readCrmRawData({
    actor: {
      id: actor.id,
      roles: actor.roles,
      readScope: scopeFor(actor.permissions, "crm.lead.read") ?? "ASSIGNED",
    },
    search,
    searchDigits,
    stageFilter: stageFilter ?? "",
    ownerFilter,
    programFilter,
    sourceFilter,
    priorityFilter: priorityFilter ?? "",
    followUpFilter,
    periodRange: serializePeriodRange(periodRange),
    monthStart: monthStart.toISOString(),
    today: cachedToday.toISOString(),
    todayStart: todayStart.toISOString(),
    tomorrowStart: tomorrowStart.toISOString(),
    dayAfterTomorrowStart: dayAfterTomorrowStart.toISOString(),
  });
  const stageCounts = asJsonRecord(row?.stageCounts);
  const totalLeads = toNumber(row?.totalLeads);
  const listTotalCount = toNumber(row?.listTotalCount);
  const stageAllTimeTotal = leadStageOptions.reduce(
    (sum, stage) => sum + toNumber(stageCounts[stage] ?? 0),
    0,
  );
  const createdThisMonth = toNumber(row?.createdThisMonth);
  const openFollowUps = toNumber(row?.openFollowUps);
  const leadRows = asJsonArray<CrmLeadRawRow>(row?.leads);
  const conversionStats = asJsonObject<CrmConversionStatsRaw>(row?.conversionStats);
  const teamPerformanceRows = asJsonArray<CrmTeamPerformanceRaw>(row?.teamPerformance);
  const sourceStatsRows = asJsonArray<CrmBreakdownRaw>(row?.sourceStats);
  const programStatsRows = asJsonArray<CrmBreakdownRaw>(row?.programStats);
  const attentionRows = asJsonArray<CrmAttentionRawRow>(row?.attentionLeads);
  const programs = asJsonArray<{ id: string; name: string }>(row?.programs);
  const managers = asJsonArray<{ id: string; fullName: string }>(row?.managers);
  const campaigns = asJsonArray<{ id: string; name: string }>(row?.campaigns);
  const sourceValues = asJsonArray<string>(row?.sources);
  const formattedLeads = leadRows.map((lead) => formatLeadRow(lead));
  const salesCount = toNumber(conversionStats?.salesCount);
  const contactedCount = toNumber(conversionStats?.contactedCount);
  const meetingCount = toNumber(conversionStats?.meetingCount);
  const meetingAttendedCount = toNumber(conversionStats?.meetingAttendedCount);
  const meetingSales = toNumber(conversionStats?.meetingSales);
  const trialLessonLeads = toNumber(conversionStats?.trialLessonLeads);
  const trialLessonCount = toNumber(conversionStats?.trialLessonCount);
  const directSales = toNumber(conversionStats?.directSales);
  const lostCount = toNumber(conversionStats?.lostCount);
  const activeCount = [
    stageFilter,
    ownerFilter,
    programFilter,
    sourceFilter,
    priorityFilter,
    dateFromFilter.input,
    dateToFilter.input,
    !dateFromFilter.input && !dateToFilter.input && periodFilter !== "this_month"
      ? periodFilter
      : "",
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
      priority: priorityFilter,
      followUp: followUpFilter,
      period: periodFilter,
      dateFrom: dateFromFilter.input,
      dateTo: dateToFilter.input,
    }),
    filters: {
      stage: stageFilter ?? "",
      owner: ownerFilter,
      program: programFilter,
      source: sourceFilter,
      priority: priorityFilter ?? "",
      followUp: followUpFilter,
      period: periodFilter,
      dateFrom: dateFromFilter.input,
      dateTo: dateToFilter.input,
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
      canExport: actor.permissions.has("report.export"),
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
        label: "Bugünkü follow-up",
        value: formatCount(openFollowUps),
        helper: "Vaxtı çatmış və ya planlanmamış izləmələr",
        tone: "coral",
      },
      {
        label: "Satış sayı",
        value: formatCount(salesCount),
        helper: `Konversiya ${formatPercent(salesCount, totalLeads)} · ${formatCount(salesCount)} satış / ${formatCount(totalLeads)} müraciət`,
        tone: "yellow",
      },
    ],
    stageSummary: leadStageOptions.map((stage) => ({
      stage,
      label: leadStageLabels[stage],
      value: formatCount(stageCounts[stage] ?? 0),
      tone: leadStageTones[stage],
    })),
    stageAllTimeTotal,
    listTotalCount,
    attentionFocus: attentionRows.map((lead) =>
      formatAttentionRow(lead, todayStart, tomorrowStart),
    ),
    createdTodayFocus: asJsonArray<CrmAttentionRawRow>(row?.createdTodayLeads).map(
      (lead) => ({
        ...formatAttentionRow(lead, todayStart, tomorrowStart),
        createdAt: lead.createdAt ? new Intl.DateTimeFormat("az-AZ", {
          timeZone: "Asia/Baku",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(lead.createdAt)) : "-",
      })
    ),
    dashboardStats: {
      salesCount: formatCount(salesCount),
      conversionRate: formatPercent(salesCount, totalLeads),
      contactedCount: formatCount(contactedCount),
      contactRate: formatPercent(contactedCount, totalLeads),
      meetingCount: formatCount(meetingCount),
      meetingAttendedCount: formatCount(meetingAttendedCount),
      contactToMeetingRate: formatPercent(meetingCount, contactedCount),
      meetingToSaleRate: formatPercent(meetingSales, meetingAttendedCount),
      consultationCount: formatCount(meetingCount),
      contactToConsultationRate: formatPercent(meetingCount, contactedCount),
      consultationToSaleRate: formatPercent(meetingSales, meetingAttendedCount),
      trialLessonLeads: formatCount(trialLessonLeads),
      trialLessonCount: formatCount(trialLessonCount),
      directSales: formatCount(directSales),
      consultationSales: formatCount(meetingSales),
      meetingSales: formatCount(meetingSales),
      lossRate: formatPercent(lostCount, totalLeads),
      teamPerformance: teamPerformanceRows.map((item) => {
        const leads = toNumber(item.leads);
        const sales = toNumber(item.sales);

        return {
          manager: item.manager ?? "Təyin edilməyib",
          leads: formatCount(leads),
          sales: formatCount(sales),
          conversionRate: formatPercent(sales, leads),
        };
      }),
      sourceStats: sourceStatsRows.map((item) => ({
        label: formatCrmSourceLabel(item.label),
        value: formatCount(toNumber(item.value)),
      })),
      programStats: programStatsRows.map((item) => ({
        label: item.label ?? "Proqram seçilməyib",
        value: formatCount(toNumber(item.value)),
      })),
    },
    leads: formattedLeads,
    programs,
    managers,
    campaigns,
    sourceOptions: buildCrmSourceOptions(sourceValues),
  };
}

const getCachedCrmRawData = unstable_cache(
  async (input: CrmCacheInput) => getCrmRawData(getPrisma(), toCrmRawDataInput(input)),
  ["crm-pipeline-data-v7"],
  {
    revalidate: 30,
    tags: [erpCacheTags.crm],
  }
);

async function readCrmRawData(input: CrmCacheInput) {
  try {
    return await getCachedCrmRawData(input);
  } catch (error) {
    if (!isMissingIncrementalCacheError(error)) {
      throw error;
    }

    return getCrmRawData(getPrisma(), toCrmRawDataInput(input));
  }
}

function toCrmRawDataInput(input: CrmCacheInput) {
  return {
    ...input,
    stageFilter: input.stageFilter || undefined,
    periodRange: deserializePeriodRange(input.periodRange),
    monthStart: new Date(input.monthStart),
    today: new Date(input.today),
    todayStart: new Date(input.todayStart),
    tomorrowStart: new Date(input.tomorrowStart),
    dayAfterTomorrowStart: new Date(input.dayAfterTomorrowStart),
  };
}

function getCrmRawData(
  prisma: ReturnType<typeof getPrisma>,
  input: {
    actor: CrmCacheActor;
    search: string;
    searchDigits: string;
    stageFilter: LeadStageValue | undefined;
    ownerFilter: string;
    programFilter: string;
    sourceFilter: string;
    priorityFilter: LeadPriorityValue | "";
    followUpFilter: CrmFollowUpFilter;
    periodRange: CrmPeriodRange;
    monthStart: Date;
    today: Date;
    todayStart: Date;
    tomorrowStart: Date;
    dayAfterTomorrowStart: Date;
  }
) {
  const scopeSql = buildLeadScopeSql(input.actor);
  const periodSql = buildLeadPeriodSql(input.periodRange);
  const summarySql = Prisma.sql`${scopeSql} AND ${periodSql}`;
  const listWhereSql = buildCrmListWhereSql(input);
  const managerScopeSql = buildManagerScopeSql(input.actor);
  const teamMemberScopeSql = buildTeamMemberScopeSql(input.actor, input.ownerFilter);
  const teamSaleFromSql = input.periodRange?.gte
    ? Prisma.sql`${input.periodRange.gte}`
    : null;
  const teamSaleUntilSql = input.periodRange?.lt
    ? Prisma.sql`${input.periodRange.lt}`
    : null;
  const leadSaleSql = leadHasQualifiedSaleSql();
  const leadContactSql = leadHadRealContactSql();
  const leadMeetingSql = leadHadMeetingScheduledSql();
  const leadMeetingAttendedSql = leadHadMeetingAttendedSql();
  const leadNeedsAttendSql = leadNeedsMeetingAttendanceConfirmSql();
  const teamHrStatusSql = Prisma.join(
    crmTeamVisibleHrStatuses.map(
      (status) => Prisma.sql`${status}::"erp"."HrEmployeeStatus"`,
    ),
  );

  return prisma.$queryRaw<CrmRawRow[]>(Prisma.sql`
    select
      coalesce((
        -- BK-22: mərhələ kartı period filtrindən asılı olmayaraq bütün dövrü göstərir.
        select jsonb_object_agg(summary.stage, summary.total_count)
        from (
          select l.stage::text as stage, count(*)::int as total_count
          from erp.leads l
          where ${scopeSql}
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
        join erp.contacts c on c.id = l.contact_id
        left join erp.programs p on p.id = l.program_interest_id
        where ${listWhereSql}
      ), 0) as "listTotalCount",
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
            'TRIAL_LESSON'::"erp"."LeadStage",
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
            'TRIAL_LESSON'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage"
          )
      ), 0) as "qualifiedCount",
      coalesce((
        select jsonb_build_object(
          'salesCount', count(*) filter (
            where stat_leads.has_sale
          ),
          'contactedCount', count(*) filter (
            where stat_leads.had_contact
          ),
          'meetingCount', count(*) filter (
            where stat_leads.had_meeting
          ),
          'meetingAttendedCount', count(*) filter (
            where stat_leads.had_meeting_attended
          ),
          'trialLessonLeads', count(*) filter (
            where stat_leads.trial_lesson_count is not null
              or stat_leads.stage = 'TRIAL_LESSON'::"erp"."LeadStage"
          ),
          'trialLessonCount', coalesce(sum(stat_leads.trial_lesson_count), 0),
          'directSales', count(*) filter (
            where stat_leads.has_sale
              and (
                stat_leads.sale_route = 'DIRECT'
                or not stat_leads.had_meeting_attended
              )
          ),
          'meetingSales', count(*) filter (
            where stat_leads.has_sale
              and stat_leads.had_meeting_attended
              and coalesce(stat_leads.sale_route, 'CRM') <> 'DIRECT'
          ),
          'lostCount', count(*) filter (
            where stat_leads.stage = 'LOST'::"erp"."LeadStage"
          )
        )
        from (
          select
            l.id,
            l.stage,
            l.converted_student_id,
            l.trial_lesson_count,
            ${leadSaleSql} as has_sale,
            (
              select cs.route
              from erp.course_sales cs
              join erp.students sale_student on sale_student.id = cs.student_id
              where sale_student.is_test_data = false
                and cs.cancelled_at is null
                and (
                  cs.lead_id = l.id
                  or (
                    l.converted_student_id is not null
                    and cs.student_id = l.converted_student_id
                  )
                )
              order by cs.qualified_at desc, cs.created_at desc
              limit 1
            ) as sale_route,
            ${leadMeetingSql} as had_meeting,
            ${leadMeetingAttendedSql} as had_meeting_attended,
            ${leadContactSql} as had_contact
          from erp.leads l
          where ${summarySql}
        ) stat_leads
      ), '{}'::jsonb) as "conversionStats",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'manager', team.manager_name,
            'leads', team.total_count,
            'sales', team.sales_count
          )
          order by team.sales_count desc, team.total_count desc, team.manager_name asc
        )
        from (
          select
            u.full_name as manager_name,
            coalesce(team_stats.total_count, 0)::int as total_count,
            coalesce(team_stats.sales_count, 0)::int as sales_count
          from erp.users u
          left join erp.hr_employees he on he.user_id = u.id
          left join lateral (
            select
              coalesce((
                select count(*)::int
                from erp.leads l
                join erp.contacts c on c.id = l.contact_id
                left join erp.programs p on p.id = l.program_interest_id
                left join erp.students converted_student on converted_student.id = l.converted_student_id
                where l.manager_id = u.id
                  and ${listWhereSql}
              ), 0)::int as total_count,
              ${ownerSalesCountSql(Prisma.raw("u.id"), teamSaleFromSql, teamSaleUntilSql)}::int as sales_count
          ) team_stats on true
          where ${teamMemberScopeSql}
            and (
              (
                he.id is null
                and not exists (
                  select 1
                  from erp.audit_logs deleted_employee
                  where deleted_employee.action = 'hr.employee.delete'
                    and deleted_employee.entity_type = 'hr_employee'
                    and deleted_employee.before_json->>'userId' = u.id::text
                )
              )
              or (
                he.archived_at is null
                and he.status in (${teamHrStatusSql})
              )
            )
          order by sales_count desc, total_count desc, manager_name asc
        ) team
      ), '[]'::jsonb) as "teamPerformance",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'label', source_rows.source,
            'value', source_rows.total_count
          )
          order by source_rows.total_count desc, source_rows.source asc
        )
        from (
          select coalesce(l.source, 'Manual') as source, count(*)::int as total_count
          from erp.leads l
          where ${summarySql}
          group by coalesce(l.source, 'Manual')
          order by total_count desc, source asc
          limit 6
        ) source_rows
      ), '[]'::jsonb) as "sourceStats",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'label', program_rows.program_name,
            'value', program_rows.total_count
          )
          order by program_rows.total_count desc, program_rows.program_name asc
        )
        from (
          select coalesce(p.name, 'Proqram seçilməyib') as program_name, count(*)::int as total_count
          from erp.leads l
          left join erp.programs p on p.id = l.program_interest_id
          where ${summarySql}
          group by coalesce(p.name, 'Proqram seçilməyib')
          order by total_count desc, program_name asc
          limit 6
        ) program_rows
      ), '[]'::jsonb) as "programStats",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', attention_rows.id::text,
            'source', attention_rows.source,
            'priority', attention_rows.priority::text,
            'nextActionType', attention_rows.next_action_type::text,
            'nextFollowUpAt', attention_rows.next_follow_up_at,
            'fullName', attention_rows.full_name,
            'phone', attention_rows.phone_display,
            'managerName', attention_rows.manager_name
          )
          order by attention_rows.next_follow_up_at asc, attention_rows.full_name asc
        )
        from (
          select
            l.id,
            l.source,
            l.priority,
            l.next_action_type,
            l.next_follow_up_at,
            c.full_name,
            c.phone_display,
            m.full_name as manager_name
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join erp.users m on m.id = l.manager_id
          where ${scopeSql}
            and l.stage in (
              'NEW'::"erp"."LeadStage",
              'CONTACTED'::"erp"."LeadStage",
              'QUALIFIED'::"erp"."LeadStage",
              'TRIAL_LESSON'::"erp"."LeadStage",
              'TRIAL_CONSULTATION'::"erp"."LeadStage",
              'NURTURE'::"erp"."LeadStage"
            )
            and l.next_follow_up_at is not null
            and l.next_follow_up_at < ${input.dayAfterTomorrowStart}
          order by l.next_follow_up_at asc, c.full_name asc
        ) attention_rows
      ), '[]'::jsonb) as "attentionLeads",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id::text,
            'source', l.source,
            'priority', l.priority::text,
            'nextActionType', l.next_action_type::text,
            'nextFollowUpAt', l.next_follow_up_at,
            'createdAt', l.created_at,
            'fullName', c.full_name,
            'phone', c.phone_display,
            'managerName', m.full_name
          ) order by l.created_at desc, l.id
        )
        from erp.leads l
        join erp.contacts c on c.id = l.contact_id
        left join erp.users m on m.id = l.manager_id
        where ${scopeSql}
          and l.created_at >= ${new Date(input.todayStart.getTime() - 4 * 60 * 60 * 1000)}
          and l.created_at < ${new Date(input.tomorrowStart.getTime() - 4 * 60 * 60 * 1000)}
      ), '[]'::jsonb) as "createdTodayLeads",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', lead_rows.id::text,
            'stage', lead_rows.stage::text,
            'source', lead_rows.source,
            'priority', lead_rows.priority::text,
            'nextActionType', lead_rows.next_action_type::text,
            'trialLessonCount', lead_rows.trial_lesson_count,
            'createdAt', lead_rows.created_at,
            'nextFollowUpAt', lead_rows.next_follow_up_at,
            'contactId', lead_rows.contact_id::text,
            'managerId', lead_rows.manager_id::text,
            'programId', lead_rows.program_interest_id::text,
            'educationLevel', lead_rows.education_level,
            'fullName', lead_rows.full_name,
            'phone', lead_rows.phone_display,
            'managerName', lead_rows.manager_name,
            'programName', lead_rows.program_name,
            'convertedStudentCode', lead_rows.converted_student_code,
            'needsMeetingAttendanceConfirm', lead_rows.needs_meeting_attendance_confirm,
            'timeline', coalesce(history.timeline, '[]'::jsonb)
          )
          order by lead_rows.next_follow_up_at asc nulls last, lead_rows.created_at desc
        )
        from (
          select
            l.id,
            l.stage,
            l.source,
            l.priority,
            l.next_action_type,
            l.trial_lesson_count,
            l.created_at,
            l.next_follow_up_at,
            l.contact_id,
            l.manager_id,
            l.program_interest_id,
            l.education_level,
            c.full_name,
            c.phone_display,
            m.full_name as manager_name,
            p.name as program_name,
            s.code as converted_student_code,
            ${leadNeedsAttendSql} as needs_meeting_attendance_confirm
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join erp.users m on m.id = l.manager_id
          left join erp.programs p on p.id = l.program_interest_id
          left join erp.students s on s.id = l.converted_student_id
          where ${listWhereSql}
          order by
            case l.priority
              when 'CRITICAL'::"erp"."LeadPriority" then 0
              when 'MEDIUM'::"erp"."LeadPriority" then 1
              else 2
            end asc,
            l.next_follow_up_at asc nulls last,
            l.created_at desc
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
        select jsonb_agg(jsonb_build_object('id', mc.id::text, 'name', mc.name) order by mc.name asc)
        from erp.marketing_campaigns mc
        where mc.status = 'ACTIVE'::"erp"."MarketingCampaignStatus"
      ), '[]'::jsonb) as "campaigns",
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

function buildLeadScopeSql(actor: CrmCacheActor) {
  if (actor.readScope === "ALL") {
    return Prisma.sql`true`;
  }

  if (actor.readScope === "ASSIGNED") {
    return Prisma.sql`l.manager_id = ${actor.id}::uuid`;
  }

  return Prisma.sql`false`;
}

function buildManagerScopeSql(actor: CrmCacheActor) {
  if (isPrivilegedActor(actor)) {
    return Prisma.sql`
      u.is_active = true
      and (
        exists (
          select 1
          from erp.user_roles ur
          join erp.roles r on r.id = ur.role_id
          where ur.user_id = u.id
            and r.code::text in ('OWNER', 'ADMIN', 'SALES')
        )
        or exists (
          select 1
          from erp.leads manager_lead
          where manager_lead.manager_id = u.id
        )
      )
    `;
  }

  return Prisma.sql`u.id = ${actor.id}::uuid and u.is_active = true`;
}

function buildTeamMemberScopeSql(actor: CrmCacheActor, ownerFilter: string) {
  const access = getCrmTeamPerformanceAccess(actor.readScope);
  const conditions: Prisma.Sql[] = [Prisma.sql`u.is_active = true`];

  if (access === "SALES_TEAM") {
    conditions.push(Prisma.sql`
      (
        exists (
          select 1
          from erp.user_roles team_ur
          join erp.roles team_role on team_role.id = team_ur.role_id
          where team_ur.user_id = u.id
            and (
              team_role.code::text = 'SALES'
              or team_role.key = 'sales'
            )
        )
        or exists (
          select 1
          from erp.leads team_lead
          where team_lead.manager_id = u.id
        )
      )
    `);
  } else {
    conditions.push(Prisma.sql`u.id = ${actor.id}::uuid`);
  }

  if (ownerFilter) {
    conditions.push(Prisma.sql`u.id = ${ownerFilter}::uuid`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildLeadPeriodSql(periodRange: CrmPeriodRange) {
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];

  if (periodRange?.gte) {
    conditions.push(Prisma.sql`l.created_at >= ${periodRange.gte}`);
  }

  if (periodRange?.lt) {
    conditions.push(Prisma.sql`l.created_at < ${periodRange.lt}`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildCrmListWhereSql(input: {
  actor: CrmCacheActor;
  search: string;
  searchDigits: string;
  stageFilter: LeadStageValue | undefined;
  ownerFilter: string;
  programFilter: string;
  sourceFilter: string;
  priorityFilter: LeadPriorityValue | "";
  followUpFilter: CrmFollowUpFilter;
  periodRange: CrmPeriodRange;
  today: Date;
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

  if (input.priorityFilter) {
    conditions.push(Prisma.sql`l.priority = ${input.priorityFilter}::"erp"."LeadPriority"`);
  }

  if (input.followUpFilter === "attention") {
    conditions.push(Prisma.sql`
      l.stage in (
        'NEW'::"erp"."LeadStage",
        'CONTACTED'::"erp"."LeadStage",
        'QUALIFIED'::"erp"."LeadStage",
        'TRIAL_LESSON'::"erp"."LeadStage",
        'TRIAL_CONSULTATION'::"erp"."LeadStage",
        'NURTURE'::"erp"."LeadStage"
      )
      and (l.next_follow_up_at is null or l.next_follow_up_at <= ${input.today})
    `);
  } else if (input.followUpFilter === "workshop_masterclass") {
    // Sold/lost leads must leave every follow-up queue, including source-based lists.
    conditions.push(Prisma.sql`
      l.stage not in ('REGISTERED'::"erp"."LeadStage", 'LOST'::"erp"."LeadStage")
      and l.next_follow_up_at is not null
      and lower(coalesce(l.source, '')) ~ '(workshop|masterclass|master class|masterklass|ustad)'
    `);
  } else if (input.followUpFilter === "overdue") {
    conditions.push(Prisma.sql`
      l.stage not in ('REGISTERED'::"erp"."LeadStage", 'LOST'::"erp"."LeadStage")
      and l.next_follow_up_at < ${input.todayStart}
    `);
  } else if (input.followUpFilter === "today") {
    conditions.push(Prisma.sql`
      l.stage not in ('REGISTERED'::"erp"."LeadStage", 'LOST'::"erp"."LeadStage")
      and l.next_follow_up_at >= ${input.todayStart}
      and l.next_follow_up_at < ${input.tomorrowStart}
    `);
  } else if (input.followUpFilter === "unplanned") {
    conditions.push(Prisma.sql`
      l.stage not in ('REGISTERED'::"erp"."LeadStage", 'LOST'::"erp"."LeadStage")
      and l.next_follow_up_at is null
    `);
  } else if (input.followUpFilter === "scheduled") {
    conditions.push(Prisma.sql`
      l.stage not in ('REGISTERED'::"erp"."LeadStage", 'LOST'::"erp"."LeadStage")
      and l.next_follow_up_at is not null
    `);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

export async function getCrmLeadDetail(id: string): Promise<CrmData["leads"][number] | null> {
  const actor = await requireErpActor("crm.lead.read");
  const lead = await getPrisma().lead.findFirst({
    where: { AND: [{ id }, getLeadReadScope(actor)] },
    select: {
      id: true, stage: true, source: true, priority: true, nextActionType: true,
      trialLessonCount: true, createdAt: true, nextFollowUpAt: true,
      contactId: true, managerId: true, programInterestId: true, educationLevel: true,
      contact: { select: { fullName: true, phoneDisplay: true } },
      manager: { select: { fullName: true } },
      programInterest: { select: { name: true } },
      convertedStudent: { select: { code: true } },
      stageHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, newStage: true, reason: true, createdAt: true,
          changedBy: { select: { fullName: true } },
        },
      },
    },
  });
  if (!lead) return null;

  const [openScheduled, attendedMeeting] = await Promise.all([
    getPrisma().crmAppointment.findFirst({
      where: {
        leadId: lead.id,
        kind: { in: ["CONSULTATION", "TRIAL"] },
        outcome: "SCHEDULED",
      },
      select: { id: true },
    }),
    getPrisma().crmAppointment.findFirst({
      where: {
        leadId: lead.id,
        kind: { in: ["CONSULTATION", "TRIAL"] },
        outcome: "ATTENDED",
      },
      select: { id: true },
    }),
  ]);

  return formatLeadRow({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    programId: lead.programInterestId,
    fullName: lead.contact.fullName,
    phone: lead.contact.phoneDisplay,
    managerName: lead.manager?.fullName ?? null,
    programName: lead.programInterest?.name ?? null,
    convertedStudentCode: lead.convertedStudent?.code ?? null,
    needsMeetingAttendanceConfirm: Boolean(openScheduled) && !attendedMeeting,
    timeline: lead.stageHistory.map((entry) => ({
      id: entry.id,
      newStage: entry.newStage,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
      changedBy: entry.changedBy?.fullName ?? null,
    })),
  });
}

function formatLeadRow(lead: CrmLeadRawRow): CrmData["leads"][number] {
  const stage = normalizeLeadStageValue(lead.stage);
  const priority = normalizeLeadPriorityValue(lead.priority);
  const nextActionType = normalizeNextActionTypeValue(lead.nextActionType);
  const timeline = asJsonArray<CrmLeadTimelineRawRow>(lead.timeline);
  const programId = lead.programId ?? "";
  const managerId = lead.managerId ?? "";
  const convertedStudentCode = lead.convertedStudentCode ?? "";
  const trialLessonCount = Math.max(0, toNumber(lead.trialLessonCount));

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
    priority,
    priorityLabel: formatLeadPriorityLabel(priority),
    priorityTone: leadPriorityTones[priority],
    nextActionType,
    nextActionTypeLabel: formatNextActionTypeLabel(nextActionType),
    trialLessonCount,
    createdAt: formatShortDate(lead.createdAt),
    nextFollowUpAt: lead.nextFollowUpAt
      ? formatShortDate(lead.nextFollowUpAt)
      : "Tarix yoxdur",
    nextFollowUpIso: lead.nextFollowUpAt
      ? new Date(lead.nextFollowUpAt).toISOString()
      : null,
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
    needsMeetingAttendanceConfirm: Boolean(lead.needsMeetingAttendanceConfirm),
    detail: {
      contactId: lead.contactId,
      fullName: lead.fullName,
      phone: lead.phone ?? "",
      source: lead.source ?? "",
      educationLevel: lead.educationLevel ?? "",
      programId,
      managerId,
      stage,
      priority,
      nextActionType,
      trialLessonCount,
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

function normalizePriority(value: string | undefined): LeadPriorityValue | undefined {
  const normalized = formFilterString(value);
  return leadPriorityOptions.find((priority) => priority === normalized);
}

function normalizeLeadPriorityValue(value: string | null | undefined): LeadPriorityValue {
  return leadPriorityOptions.find((priority) => priority === value) ?? "NORMAL";
}

function normalizeNextActionTypeValue(value: string | null | undefined): NextActionTypeValue | "" {
  return nextActionTypeOptions.find((actionType) => actionType === value) ?? "";
}

function normalizeFollowUp(value: string | undefined): CrmFollowUpFilter {
  const allowed: CrmFollowUpFilter[] = [
    "all",
    "workshop_masterclass",
    "attention",
    "overdue",
    "today",
    "unplanned",
    "scheduled",
  ];

  return allowed.find((item) => item === value) ?? "all";
}

function normalizeDateFilter(value: string | undefined) {
  const normalized = normalizeDateValue(value);

  return {
    input: normalized ? normalized.toISOString().slice(0, 10) : "",
    date: normalized,
  };
}

function resolveCrmPeriodRange({
  period,
  dateFrom,
  dateTo,
  reference,
}: {
  period: CrmPeriodValue;
  dateFrom: Date | null;
  dateTo: Date | null;
  reference: Date;
}): CrmPeriodRange {
  if (dateFrom || dateTo) {
    return {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: addUtcDays(dateTo, 1) } : {}),
    };
  }

  return getCrmPeriodRange(period, reference);
}

function formatAttentionRow(
  lead: CrmAttentionRawRow,
  todayStart: Date,
  tomorrowStart: Date,
): CrmLeadFocusRow {
  const priority = normalizePriority(lead.priority ?? undefined) ?? leadPriorityOptions[0];
  const nextActionType = normalizeNextActionTypeValue(lead.nextActionType);
  const source = lead.source?.trim().toLocaleLowerCase("az-AZ") ?? "";
  const followUpAt = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const bucket: CrmLeadFocusRow["bucket"] =
    followUpAt && followUpAt < todayStart
      ? "overdue"
      : followUpAt && followUpAt >= tomorrowStart
        ? "tomorrow"
        : "today";

  return {
    id: lead.id,
    name: lead.fullName,
    phone: lead.phone ?? "-",
    bucket,
    priorityLabel: formatLeadPriorityLabel(priority),
    priorityTone: leadPriorityTones[priority],
    nextActionTypeLabel: formatNextActionTypeLabel(nextActionType),
    nextFollowUpAt: lead.nextFollowUpAt ? formatShortDate(lead.nextFollowUpAt) : "Planlanmayıb",
    manager: lead.managerName ?? "Təyin edilməyib",
    category:
      source.includes("workshop") ||
      source.includes("masterclass") ||
      source.includes("master class") ||
      source.includes("masterklass") ||
      source.includes("ustad")
        ? "workshop_masterclass"
        : "general",
  };
}

function getBakuBusinessDate(reference: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return new Date(
    `${values.get("year")}-${values.get("month")}-${values.get("day")}T00:00:00.000Z`
  );
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

function getCacheTimeBucket(value: Date) {
  const bucketMs = 30_000;
  return new Date(Math.floor(value.getTime() / bucketMs) * bucketMs);
}

function serializePeriodRange(periodRange: CrmPeriodRange): CrmCachePeriodRange {
  if (!periodRange) {
    return null;
  }

  return {
    ...(periodRange.gte ? { gte: periodRange.gte.toISOString() } : {}),
    ...(periodRange.lt ? { lt: periodRange.lt.toISOString() } : {}),
  };
}

function deserializePeriodRange(periodRange: CrmCachePeriodRange): CrmPeriodRange {
  if (!periodRange) {
    return null;
  }

  return {
    ...(periodRange.gte ? { gte: new Date(periodRange.gte) } : {}),
    ...(periodRange.lt ? { lt: new Date(periodRange.lt) } : {}),
  };
}

function isMissingIncrementalCacheError(error: unknown) {
  return error instanceof Error && error.message.includes("incrementalCache missing");
}

function buildReturnTo(filters: {
  q: string;
  stage?: string;
  owner: string;
  program: string;
  source: string;
  priority?: string;
  period: CrmPeriodValue;
  dateFrom: string;
  dateTo: string;
  followUp: CrmFollowUpFilter;
}) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.program) params.set("program", filters.program);
  if (filters.source) params.set("source", filters.source);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.period !== "this_month") params.set("period", filters.period);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
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

function normalizeDateValue(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  return null;
}

function addUtcDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
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

function asJsonObject<T>(value: unknown): T | null {
  const parsed =
    typeof value === "string"
      ? parseJsonObject(value)
      : value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;

  return parsed ? (parsed as T) : null;
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
