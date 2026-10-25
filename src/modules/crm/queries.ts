import { LeadStage, Prisma } from "@/generated/prisma/client";
import { nameSearchSql } from "@/modules/shared/search-sql";
import { meetingAnalyticsSql } from "./meeting-analytics-sql";
import { unstable_cache } from "next/cache";
import { getCrmScopeLabel, getLeadReadScope } from "@/modules/crm/access";
import {
  leadHadConsultationSql,
  leadHasQualifiedSaleSql,
  periodCourseSalesCountSql,
} from "@/modules/students/sales-metrics-sql";
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
  consultationTrialLabel,
  consultationTrialStage,
  type CrmStageFilter,
  type LeadStageValue,
  leadStageLabels,
  leadStageOptions,
  leadStageTones,
} from "@/modules/crm/stage";
import { buildWorkerSuggestion, type WorkerSuggestion } from "@/modules/crm/worker-suggestion";
import { leadNeedsMeetingAttendanceConfirmSql } from "@/modules/crm/registration-attend-policy";
import {
  crmTeamVisibleHrStatuses,
  getCrmTeamPerformanceAccess,
} from "@/modules/crm/team-performance-rules";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { buildCrmListDateSql } from "./list-date-filter-sql";
import { crmListMonthDates, resolveCrmListDateFilter, type CrmListDateFilter, type CrmListDateInput } from "./list-date-filter";
import { scopeFor, type PermissionScope } from "@/server/rbac/permissions";

export type CrmFollowUpFilter =
  | "all"
  | "workshop_masterclass"
  | "attention"
  | "overdue"
  | "today"
  | "unplanned"
  | "scheduled";

export type CrmFiltersInput = CrmListDateInput & {
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
    stage: CrmStageFilter | "";
    owner: string;
    program: string;
    source: string;
    priority: LeadPriorityValue | "";
    followUp: CrmFollowUpFilter;
    period: CrmPeriodValue;
    dateFrom: string;
    dateTo: string;
    listDate: CrmListDateFilter;
    /** Resolved sale-window bounds for conversion → students deep-links */
    saleFrom: string;
    saleTo: string;
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
    canDeleteLead: boolean;
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
    stage: CrmStageFilter;
    label: string;
    value: string;
    tone: "success" | "warning" | "danger" | "neutral" | "info";
  }>;
  /** BK-22: sum of all-time stage card counts (scope only, no period). */
  stageAllTimeTotal: number;
  /** BK-23: full filtered list size; table may return a page of leads. */
  listTotalCount: number;
  meetings: {
    scheduled: number; attended: number; noShow: number; pending: number; overdue: number;
    teachers: Array<{ teacherId: string | null; teacher: string; scheduled: number; attended: number; noShow: number; successful: number; unsuccessful: number; pending: number }>;
  };
  attentionFocus: CrmLeadFocusRow[];
  createdTodayFocus: CrmLeadFocusRow[];
  dashboardStats: {
    /** Funnel qeydiyyat = ödənişli CRM NEW + SLOT_WAITING tələbələr */
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
    /** course_sales.route = DIRECT — tələbələr səhifəsindən, follow-up xaric */
    directSales: string;
    /** course_sales.route = CRM + kind = NEW — follow-up/müraciətdən ödənişli satış */
    consultationSales: string;
    meetingSales: string;
    /** course_sales.kind = RETURN */
    returnSales: string;
    /** Dövr üzrə bütün ödənişli satışlar (dashboard / KPI ilə eyni): NEW+RETURN, CRM+DIRECT */
    periodSalesTotal: string;
    /** Lead-linked ödənişli satış (funnel qeydiyyat) */
    crmLeadSales: string;
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
    /** Bakı günü üzrə bu gün yaradılıbsa true; sabah avtomatik false olur. */
    isNewToday: boolean;
    latestNote: string;
    canConvert: boolean;
    conversionLabel: string;
    /** BK-18: open SCHEDULED meeting without ATTENDED yet. */
    needsMeetingAttendanceConfirm: boolean;
    pendingMeetingAt: string | null;
    meetingAttended: boolean;
    suggestion: WorkerSuggestion | null;
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
  /** Bakı günü üzrə bu gün yaradılıbsa true; sabah avtomatik false olur. */
  isNewToday: boolean;
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
  stageFilter: CrmStageFilter | "";
  ownerFilter: string;
  programFilter: string;
  sourceFilter: string;
  priorityFilter: LeadPriorityValue | "";
  followUpFilter: CrmFollowUpFilter;
  periodRange: CrmCachePeriodRange;
  listDate: CrmListDateFilter;
  monthStart: string;
  today: string;
  todayStart: string;
  tomorrowStart: string;
  dayAfterTomorrowStart: string;
};

type CrmRawRow = {
  meetings: unknown;
  stageCounts: unknown;
  reminderCount: unknown;
  totalLeads: unknown;
  listTotalCount: unknown;
  createdThisMonth: unknown;
  openFollowUps: unknown;
  qualifiedCount: unknown;
  conversionStats: unknown;
  periodSalesTotal: unknown;
  periodDirectSales: unknown;
  periodReturnSales: unknown;
  periodCrmNewSales: unknown;
  slotWaitingCrmSales: unknown;
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
  isNewToday?: boolean | null;
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
  /** Bakı günü: yalnız yaradıldığı gün true (növbəti gün false). */
  isNewToday?: boolean | null;
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
  pendingMeetingAt: string | null;
  meetingAttended: boolean | null;
  latestMeetingOutcome: string | null;
  meetingOverdue: boolean | null;
  meetingUpcoming: boolean | null;
  latestContactResult: string | null;
  timeline: unknown;
};

type CrmConversionStatsRaw = {
  salesCount: unknown;
  contactedCount: unknown;
  consultationCount: unknown;
  trialLessonLeads: unknown;
  trialLessonCount: unknown;
  consultationSales: unknown;
  crmLeadSales: unknown;
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
  const listDate = resolveCrmListDateFilter(input,
    dateFromFilter.input || dateToFilter.input
      ? { from: dateFromFilter.input, to: dateToFilter.input }
      : periodFilter === "this_month"
        ? crmListMonthDates(0, today)
        : {
          from: periodRange?.gte?.toISOString().slice(0, 10) ?? "",
          to: periodRange?.lt ? addUtcDays(periodRange.lt, -1).toISOString().slice(0, 10) : "",
        },
  );
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
    listDate,
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
  // Funnel qeydiyyat = slot gözləyən ödənişli CRM NEW. Period totals = canonical journal.
  const crmLeadSales = toNumber(conversionStats?.crmLeadSales ?? conversionStats?.salesCount);
  const consultationPathSales = toNumber(conversionStats?.consultationSales);
  const contactedCount = toNumber(conversionStats?.contactedCount);
  const consultationCount = toNumber(conversionStats?.consultationCount);
  const meetings = asJsonObject<CrmData["meetings"]>(row?.meetings);
  const trialLessonLeads = toNumber(conversionStats?.trialLessonLeads);
  const trialLessonCount = toNumber(conversionStats?.trialLessonCount);
  const lostCount = toNumber(conversionStats?.lostCount);
  const periodSalesTotal = toNumber(row?.periodSalesTotal);
  const directSales = toNumber(row?.periodDirectSales);
  const returnSales = toNumber(row?.periodReturnSales);
  const crmNewSales = toNumber(row?.periodCrmNewSales);
  const slotWaitingCrmSales = toNumber(row?.slotWaitingCrmSales);
  // Qeydiyyat (bölgü) = CRM NEW journal; funnel Qeydiyyat = hələ slot gözləyənlər.
  const followUpSales = crmNewSales > 0 ? crmNewSales : crmLeadSales;
  // const salesCount = slotWaitingCrmSales;
  // Qeydiyyat = satış: bütün kartlar eyni jurnal sayından oxuyur
  const salesCount = crmNewSales;
  const activeCount = [
    search,
    stageFilter,
    ownerFilter,
    programFilter,
    sourceFilter,
    priorityFilter,
    listDate.active ? "listDate" : "",
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
      listDate,
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
      listDate,
      saleFrom: (periodRange?.gte ?? new Date("2000-01-01T00:00:00.000Z"))
        .toISOString()
        .slice(0, 10),
      saleTo: (() => {
        const until = periodRange?.lt
          ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endInclusive = new Date(until.getTime() - 24 * 60 * 60 * 1000);
        return endInclusive.toISOString().slice(0, 10);
      })(),
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
      canDeleteLead: actor.permissions.has("crm.lead.delete"),
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
        value: formatCount(periodSalesTotal),
        helper: `Dövr: ${formatCount(followUpSales)} qeydiyyat · ${formatCount(directSales)} birbaşa · ${formatCount(returnSales)} qayıdış`,
        tone: "yellow",
      },
    ],
    stageSummary: leadStageOptions.flatMap((stage): CrmData["stageSummary"] => {
      if (stage === "TRIAL_LESSON") return [];
      if (stage === "QUALIFIED") {
        return [{
          stage: consultationTrialStage,
          label: consultationTrialLabel,
          value: formatCount(toNumber(stageCounts.QUALIFIED) + toNumber(stageCounts.TRIAL_LESSON)),
          tone: "warning",
        }];
      }
      return [{
        stage,
        label: stage === "CONTACTED" ? "Xatırlatma" : leadStageLabels[stage],
        value: formatCount(
          stage === "CONTACTED"
            ? toNumber(row?.reminderCount)
            : stage === "REGISTERED"
              ? followUpSales
              : stageCounts[stage] ?? 0
        ),
        tone: leadStageTones[stage],
      }];
    }),
    stageAllTimeTotal,
    listTotalCount,
    meetings: meetings ?? { scheduled: 0, attended: 0, noShow: 0, pending: 0, overdue: 0, teachers: [] },
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
      meetingCount: formatCount(meetings?.scheduled ?? 0),
      meetingAttendedCount: formatCount(meetings?.attended ?? 0),
      contactToMeetingRate: formatPercent(consultationCount, contactedCount),
      meetingToSaleRate: formatPercent(
        consultationPathSales > 0 ? consultationPathSales : followUpSales,
        consultationCount,
      ),
      consultationCount: formatCount(consultationCount),
      contactToConsultationRate: formatPercent(consultationCount, contactedCount),
      consultationToSaleRate: formatPercent(
        consultationPathSales > 0 ? consultationPathSales : followUpSales,
        consultationCount,
      ),
      trialLessonLeads: formatCount(trialLessonLeads),
      trialLessonCount: formatCount(trialLessonCount),
      directSales: formatCount(directSales),
      consultationSales: formatCount(followUpSales),
      meetingSales: formatCount(followUpSales),
      returnSales: formatCount(returnSales),
      periodSalesTotal: formatCount(periodSalesTotal),
      crmLeadSales: formatCount(crmLeadSales),
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
  ["crm-pipeline-data-v18"],
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
    stageFilter: CrmStageFilter | undefined;
    ownerFilter: string;
    programFilter: string;
    sourceFilter: string;
    priorityFilter: LeadPriorityValue | "";
    followUpFilter: CrmFollowUpFilter;
    periodRange: CrmPeriodRange;
    listDate: CrmListDateFilter;
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
  const teamWhereSql = input.listDate.active
    ? buildCrmListWhereSql({ ...input, listDate: { ...input.listDate, active: false } })
    : listWhereSql;
  const managerScopeSql = buildManagerScopeSql(input.actor);
  const teamMemberScopeSql = buildTeamMemberScopeSql(input.actor, input.ownerFilter);
  const teamSalePeriodSql = buildLeadSalePeriodSql(input.periodRange);
  const leadNeedsAttendSql = leadNeedsMeetingAttendanceConfirmSql();
  const teamHrStatusSql = Prisma.join(
    crmTeamVisibleHrStatuses.map(
      (status) => Prisma.sql`${status}::"erp"."HrEmployeeStatus"`,
    ),
  );
  const createdTodayFrom = new Date(input.todayStart.getTime() - 4 * 60 * 60 * 1000);
  const createdTodayUntil = new Date(input.tomorrowStart.getTime() - 4 * 60 * 60 * 1000);
  const saleWindowFrom = input.periodRange?.gte ?? new Date("2000-01-01T00:00:00.000Z");
  const saleWindowUntil = input.periodRange?.lt
    ?? new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth() + 1, 1));
  const periodSalesTotalSql = periodCourseSalesCountSql(
    Prisma.sql`${saleWindowFrom}`,
    Prisma.sql`${saleWindowUntil}`,
  );
  const periodDirectSalesSql = periodCourseSalesCountSql(
    Prisma.sql`${saleWindowFrom}`,
    Prisma.sql`${saleWindowUntil}`,
    { route: "DIRECT",kind: "NEW" },
  );
  const periodReturnSalesSql = periodCourseSalesCountSql(
    Prisma.sql`${saleWindowFrom}`,
    Prisma.sql`${saleWindowUntil}`,
    { kind: "RETURN" },
  );
  const periodCrmNewSalesSql = periodCourseSalesCountSql(
    Prisma.sql`${saleWindowFrom}`,
    Prisma.sql`${saleWindowUntil}`,
    { route: "CRM", kind: "NEW" },
  );

  function leadQueueOrderSql(tableAlias: "l" | "lead_rows" | "attention_rows") {
    const createdAt = Prisma.raw(`${tableAlias}.created_at`);
    const priority = Prisma.raw(`${tableAlias}.priority`);
    const id = Prisma.raw(`${tableAlias}.id`);

    // Növbə: ən yeni (bu gün) → kritik → digərləri; hər qrupda ən yeni üstə.
    return Prisma.sql`
      case
        when ${createdAt} >= ${createdTodayFrom} and ${createdAt} < ${createdTodayUntil} then 0
        when ${priority} = 'CRITICAL'::"erp"."LeadPriority" then 1
        else 2
      end,
      ${createdAt} desc nulls last,
      ${id} desc
    `;
  }

  return prisma.$queryRaw<CrmRawRow[]>(Prisma.sql`
    select
      ${meetingAnalyticsSql(scopeSql, input.periodRange?.gte ?? null, input.periodRange?.lt ?? null, input.todayStart)} as meetings,
      coalesce((
        -- BK-22: mərhələ kartı period filtrindən asılı olmayaraq bütün dövrü göstərir.
        select jsonb_object_agg(summary.stage, summary.total_count)
        from (
          select l.stage::text as stage, count(*)::int as total_count
          from erp.leads l
          where ${scopeSql}
            and l.converted_student_id is null
          group by l.stage
        ) summary
      ), '{}'::jsonb) as "stageCounts",
      coalesce((
        -- CRM mərhələ kartındakı Xatırlatma sayı: növbəti addımı xatırlatma olan açıq müraciətlər.
        select count(*)::int
        from erp.leads l
        where ${scopeSql}
          and l.converted_student_id is null
          and l.next_action_type in (
            'CONSULTATION_REMINDER',
            'TRIAL_LESSON_REMINDER',
            'PAYMENT_REMINDER'
          )
      ), 0) as "reminderCount",
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
        where ${scopeSql}
          and l.stage in (
            'NEW'::"erp"."LeadStage",
            'CONTACTED'::"erp"."LeadStage",
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_LESSON'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage",
            'NURTURE'::"erp"."LeadStage"
          )
          and l.converted_student_id is null
          and (l.next_follow_up_at is null or l.next_follow_up_at <= ${input.today})
      ), 0) as "openFollowUps",
      coalesce((
        select count(*)::int
        from erp.leads l
        where ${summarySql}
          and l.converted_student_id is null
          and l.stage in (
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_LESSON'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage"
          )
      ), 0) as "qualifiedCount",
      coalesce((
        select jsonb_build_object(
          -- Funnel "Qeydiyyat" = ödənişli lead satışları (qeydiyyat = satış)
          'salesCount', count(*) filter (
            where ${leadHasQualifiedSaleSql()}
          ),
          'crmLeadSales', count(*) filter (
            where ${leadHasQualifiedSaleSql()}
          ),
          -- Funnel kumulyativ: əlaqə → onun içindən konsultasiya (əlaqə ≥ konsultasiya)
          'contactedCount', count(*) filter (
            where
              l.stage in (
                'CONTACTED'::"erp"."LeadStage",
                'QUALIFIED'::"erp"."LeadStage",
                'TRIAL_LESSON'::"erp"."LeadStage",
                'TRIAL_CONSULTATION'::"erp"."LeadStage",
                'REGISTERED'::"erp"."LeadStage",
                'LOST'::"erp"."LeadStage",
                'NURTURE'::"erp"."LeadStage"
              )
              or exists (
                select 1
                from erp.lead_stage_history contact_history
                where contact_history.lead_id = l.id
                  and contact_history.new_stage in (
                    'CONTACTED'::"erp"."LeadStage",
                    'QUALIFIED'::"erp"."LeadStage",
                    'TRIAL_LESSON'::"erp"."LeadStage",
                    'TRIAL_CONSULTATION'::"erp"."LeadStage",
                    'REGISTERED'::"erp"."LeadStage",
                    'LOST'::"erp"."LeadStage",
                    'NURTURE'::"erp"."LeadStage"
                  )
              )
              or ${leadHadConsultationSql()}
          ),
          'consultationCount', count(*) filter (
            where ${leadHadConsultationSql()}
          ),
          'trialLessonLeads', count(*) filter (
            where l.trial_lesson_count is not null
              or l.stage = 'TRIAL_LESSON'::"erp"."LeadStage"
          ),
          'trialLessonCount', coalesce(sum(l.trial_lesson_count), 0),
          -- Konsultasiya yolu + ödəniş (lead funnel)
          'consultationSales', count(*) filter (
            where ${leadHasQualifiedSaleSql()}
              and ${leadHadConsultationSql()}
          ),
          'lostCount', count(*) filter (
            where l.stage = 'LOST'::"erp"."LeadStage"
          )
        )
        from erp.leads l
        where ${summarySql}
      ), '{}'::jsonb) as "conversionStats",
      coalesce(${periodSalesTotalSql}, 0) as "periodSalesTotal",
      coalesce(${periodDirectSalesSql}, 0) as "periodDirectSales",
      coalesce(${periodReturnSalesSql}, 0) as "periodReturnSales",
      coalesce(${periodCrmNewSalesSql}, 0) as "periodCrmNewSales",
      coalesce((
        -- Funnel Qeydiyyat = ödənişli CRM NEW + hələ slot gözləyən tələbələr
        select count(*)::int
        from erp.course_sales cs
        join erp.students s on s.id = cs.student_id
        where s.is_test_data = false
          and cs.cancelled_at is null
          and cs.route = 'CRM'
          and cs.kind = 'NEW'
          and cs.qualified_at >= ${saleWindowFrom}::date
          and cs.qualified_at < ${saleWindowUntil}::date
          and cs.qualified_at <= (now() at time zone 'Asia/Baku')::date
          and s.lifecycle_status = 'SLOT_WAITING'::"erp"."StudentLifecycleStatus"
      ), 0) as "slotWaitingCrmSales",
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
              count(*) filter (where ${teamWhereSql})::int as total_count,
              count(*) filter (
                where ${leadHasQualifiedSaleSql()}
                  and ${teamSalePeriodSql}
              )::int as sales_count
            from erp.leads l
            join erp.contacts c on c.id = l.contact_id
            left join erp.programs p on p.id = l.program_interest_id
            left join erp.students converted_student on converted_student.id = l.converted_student_id
            left join lateral (
              select min(conversion_history.created_at) as registered_at
              from erp.lead_stage_history conversion_history
              where conversion_history.lead_id = l.id
                and conversion_history.new_stage = 'REGISTERED'::"erp"."LeadStage"
            ) conversion on true
            where l.manager_id = u.id
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
            'createdAt', attention_rows.created_at,
            'isNewToday', attention_rows.is_new_today,
            'fullName', attention_rows.full_name,
            'phone', attention_rows.phone_display,
            'managerName', attention_rows.manager_name
          )
          order by ${leadQueueOrderSql("attention_rows")}, attention_rows.next_follow_up_at asc nulls last
        )
        from (
          select
            l.id,
            l.source,
            l.priority,
            l.next_action_type,
            l.next_follow_up_at,
            l.created_at,
            (
              l.created_at >= ${createdTodayFrom}
              and l.created_at < ${createdTodayUntil}
            ) as is_new_today,
            c.full_name,
            c.phone_display,
            m.full_name as manager_name
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join erp.users m on m.id = l.manager_id
          where ${scopeSql}
            and l.converted_student_id is null
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
          order by ${leadQueueOrderSql("l")}, l.next_follow_up_at asc nulls last
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
            'isNewToday', true,
            'fullName', c.full_name,
            'phone', c.phone_display,
            'managerName', m.full_name
          ) order by l.created_at desc, l.id
        )
        from erp.leads l
        join erp.contacts c on c.id = l.contact_id
        left join erp.users m on m.id = l.manager_id
        where ${scopeSql}
          and l.created_at >= ${createdTodayFrom}
          and l.created_at < ${createdTodayUntil}
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
            'isNewToday', lead_rows.is_new_today,
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
            'pendingMeetingAt', lead_rows.pending_meeting_at,
            'meetingAttended', lead_rows.meeting_attended,
            'latestMeetingOutcome', lead_rows.latest_meeting_outcome,
            'meetingOverdue', lead_rows.meeting_overdue,
            'meetingUpcoming', lead_rows.meeting_upcoming,
            'latestContactResult', lead_rows.latest_contact_result,
            'timeline', coalesce(history.timeline, '[]'::jsonb)
          )
          order by ${leadQueueOrderSql("lead_rows")}
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
            (
              l.created_at >= ${createdTodayFrom}
              and l.created_at < ${createdTodayUntil}
            ) as is_new_today,
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
            ${leadNeedsAttendSql} as needs_meeting_attendance_confirm,
            (
              select a.planned_at from erp.crm_appointments a
              where a.lead_id = l.id and a.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
                and a.outcome = 'SCHEDULED'
              order by a.planned_at desc, a.created_at desc
              limit 1
            ) as pending_meeting_at,
            exists (
              select 1 from erp.crm_appointments attended_meeting
              where attended_meeting.lead_id = l.id
                and attended_meeting.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
                and attended_meeting.outcome = 'ATTENDED'
            ) as meeting_attended,
            (
              select a.outcome
              from erp.crm_appointments a
              where a.lead_id = l.id
                and a.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
              order by a.planned_at desc, a.created_at desc
              limit 1
            ) as latest_meeting_outcome,
            exists (
              select 1 from erp.crm_appointments overdue_meeting
              where overdue_meeting.lead_id = l.id
                and overdue_meeting.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
                and overdue_meeting.outcome = 'SCHEDULED'
                and overdue_meeting.planned_at < now()
            ) as meeting_overdue,
            exists (
              select 1 from erp.crm_appointments upcoming_meeting
              where upcoming_meeting.lead_id = l.id
                and upcoming_meeting.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
                and upcoming_meeting.outcome = 'SCHEDULED'
                and upcoming_meeting.planned_at >= now()
            ) as meeting_upcoming,
            (
              select w.result
              from erp.lead_work_items w
              where w.lead_id = l.id
                and w.source = 'PRIMARY'
                and w.completed_at is not null
              order by w.completed_at desc
              limit 1
            ) as latest_contact_result
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join erp.users m on m.id = l.manager_id
          left join erp.programs p on p.id = l.program_interest_id
          left join erp.students s on s.id = l.converted_student_id
          where ${listWhereSql}
          order by ${leadQueueOrderSql("l")}
          limit 300
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

function buildLeadConversionPeriodSql(periodRange: CrmPeriodRange) {
  const conversionDateSql = Prisma.sql`
    coalesce(conversion.registered_at, converted_student.registered_at, l.updated_at)
  `;
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];

  if (periodRange?.gte) {
    conditions.push(Prisma.sql`${conversionDateSql} >= ${periodRange.gte}`);
  }

  if (periodRange?.lt) {
    conditions.push(Prisma.sql`${conversionDateSql} < ${periodRange.lt}`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

/** Paid sale window for CRM team cards — course_sales.qualified_at (Baku calendar). */
function buildLeadSalePeriodSql(periodRange: CrmPeriodRange) {
  const saleDateSql = Prisma.sql`(
    select min(cs.qualified_at)
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
  )`;
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];

  if (periodRange?.gte) {
    conditions.push(Prisma.sql`${saleDateSql} >= ${periodRange.gte}::date`);
  }

  if (periodRange?.lt) {
    conditions.push(Prisma.sql`${saleDateSql} < ${periodRange.lt}::date`);
  }

  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildCrmListWhereSql(input: {
  actor: CrmCacheActor;
  search: string;
  searchDigits: string;
  stageFilter: CrmStageFilter | undefined;
  ownerFilter: string;
  programFilter: string;
  sourceFilter: string;
  priorityFilter: LeadPriorityValue | "";
  followUpFilter: CrmFollowUpFilter;
  periodRange: CrmPeriodRange;
  listDate: CrmListDateFilter;
  today: Date;
  todayStart: Date;
  tomorrowStart: Date;
}) {
  // Explicit list dates are strict; otherwise preserve the overview's legacy
  // period + today's leads + open critical leads, including all-time stage drill-downs.
  const createdTodayFrom = new Date(input.todayStart.getTime() - 4 * 60 * 60 * 1000);
  const createdTodayUntil = new Date(input.tomorrowStart.getTime() - 4 * 60 * 60 * 1000);
  const periodSql = buildLeadPeriodSql(input.periodRange);
  const conditions: Prisma.Sql[] = [
    buildLeadScopeSql(input.actor),
    Prisma.sql`l.converted_student_id is null`,
    // Ödənişli qeydiyyat follow-updan çıxır — tələbələr siyahısında (slot gözləyir) görünür.
    Prisma.sql`l.stage <> 'REGISTERED'::"erp"."LeadStage"`,
    // Konsultasiya/Sınaq kartı all-time say göstərir; onun siyahısı da eyni
    // mərhələ üzrə bütün açıq müraciətləri göstərməlidir, period filtri say fərqi yaratmasın.
    buildCrmListDateSql(input.listDate) ?? (input.stageFilter === consultationTrialStage
      ? Prisma.sql`true`
      : Prisma.sql`(
          (${periodSql})
          or (
            l.created_at >= ${createdTodayFrom}
            and l.created_at < ${createdTodayUntil}
          )
          or (
            l.priority = 'CRITICAL'::"erp"."LeadPriority"
            and l.stage not in (
              'REGISTERED'::"erp"."LeadStage",
              'LOST'::"erp"."LeadStage"
            )
          )
        )`),
  ];

  if (input.search.length > 0) {
    const searchPattern = `%${input.search}%`;
    const searchConditions: Prisma.Sql[] = [
      Prisma.sql`c.full_name ilike ${searchPattern}`,
      nameSearchSql(Prisma.sql`c.full_name`, input.search),
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

  if (input.stageFilter === consultationTrialStage) {
    conditions.push(Prisma.sql`l.stage in ('QUALIFIED'::"erp"."LeadStage", 'TRIAL_LESSON'::"erp"."LeadStage")`);
  } else if (input.stageFilter) {
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

  const now = new Date();
  const meetingWhere = {
    leadId: lead.id,
    kind: { in: ["MEETING", "CONSULTATION", "TRIAL"] as ("MEETING" | "CONSULTATION" | "TRIAL")[] },
  };
  const [openScheduled, attendedMeeting, latestMeeting, overdueMeeting, upcomingMeeting, latestWork] = await Promise.all([
    getPrisma().crmAppointment.findFirst({
      where: { ...meetingWhere, outcome: "SCHEDULED" },
      orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, plannedAt: true },
    }),
    getPrisma().crmAppointment.findFirst({
      where: { ...meetingWhere, outcome: "ATTENDED" },
      select: { id: true },
    }),
    getPrisma().crmAppointment.findFirst({
      where: meetingWhere,
      orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }],
      select: { outcome: true },
    }),
    getPrisma().crmAppointment.findFirst({
      where: { ...meetingWhere, outcome: "SCHEDULED", plannedAt: { lt: now } },
      select: { id: true },
    }),
    getPrisma().crmAppointment.findFirst({
      where: { ...meetingWhere, outcome: "SCHEDULED", plannedAt: { gte: now } },
      select: { id: true },
    }),
    getPrisma().leadWorkItem.findFirst({
      where: { leadId: lead.id, source: "PRIMARY", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { result: true },
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
    pendingMeetingAt: openScheduled?.plannedAt.toISOString() ?? null,
    meetingAttended: Boolean(attendedMeeting),
    latestMeetingOutcome: latestMeeting?.outcome ?? null,
    meetingOverdue: Boolean(overdueMeeting),
    meetingUpcoming: Boolean(upcomingMeeting),
    latestContactResult: latestWork?.result ?? null,
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
    nextActionType: convertedStudentCode ? "" : nextActionType,
    nextActionTypeLabel: convertedStudentCode ? "Təyin edilməyib" : formatNextActionTypeLabel(nextActionType),
    trialLessonCount,
    createdAt: formatShortDate(lead.createdAt),
    nextFollowUpAt: convertedStudentCode || !lead.nextFollowUpAt
      ? "Tarix yoxdur"
      : formatShortDate(lead.nextFollowUpAt),
    nextFollowUpIso: convertedStudentCode || !lead.nextFollowUpAt
      ? null
      : new Date(lead.nextFollowUpAt).toISOString(),
    // Yalnız Bakı üzrə yaradıldığı təqvim günü — növbəti gün badge yox olur.
    isNewToday: resolveIsNewToday(lead.isNewToday, lead.createdAt),
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
    pendingMeetingAt: lead.needsMeetingAttendanceConfirm ? lead.pendingMeetingAt ?? null : null,
    meetingAttended: Boolean(lead.meetingAttended),
    suggestion: convertedStudentCode
      ? null
      : buildWorkerSuggestion({
          stage,
          latestMeetingOutcome: lead.latestMeetingOutcome,
          meetingUpcoming: Boolean(lead.meetingUpcoming),
          latestContactResult: lead.latestContactResult,
        }),
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
      nextActionType: convertedStudentCode ? "" : nextActionType,
      trialLessonCount,
      nextFollowUpDate: convertedStudentCode ? "" : formatDateInput(lead.nextFollowUpAt),
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

function normalizeStage(value: string | undefined): CrmStageFilter | undefined {
  if (value === consultationTrialStage) return consultationTrialStage;
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
    isNewToday: resolveIsNewToday(lead.isNewToday, lead.createdAt),
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

function resolveIsNewToday(
  sqlFlag: boolean | null | undefined,
  createdAt: string | Date | null | undefined,
) {
  if (typeof sqlFlag === "boolean") return sqlFlag;
  return false;
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
  listDate: CrmListDateFilter;
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
  if (filters.listDate.active) {
    params.set("listDateBy", filters.listDate.field);
    if (filters.listDate.from) params.set("listFrom", filters.listDate.from);
    if (filters.listDate.to) params.set("listTo", filters.listDate.to);
  }
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
