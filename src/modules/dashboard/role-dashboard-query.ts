import {
  EnrollmentStatus,
  LeadStage,
  MarketingCampaignStatus,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { ownerSalesCountSql } from "@/modules/students/sales-metrics-sql";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type RoleDashboardData = {
  kind: "sales" | "teacher" | "marketing";
  actorName: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: "/crm" | "/groups" | "/marketing";
  primaryLabel: string;
  kpis: Array<{ label: string; value: string; helper: string; tone: "blue" | "violet" | "green" | "orange"; progress?: number }>;
  breakdown: Array<{ label: string; value: number; total: number }>;
  recent: Array<{ title: string; meta: string; status: string }>;
};

type SalesDashboardRow = {
  leadCount: number;
  studentCount: number;
  followUps: number;
  converted: number;
  stages: Array<{ stage: LeadStage; count: number }>;
  recent: Array<{ name: string; nextFollowUpAt: string | null; stage: LeadStage }>;
};

type MarketingDashboardRow = {
  campaigns: number;
  active: number;
  budget: number;
  spend: number;
  revenue: number;
  leads: number;
  conversions: number;
  recent: Array<{ name: string; channel: string; budget: number; status: MarketingCampaignStatus }>;
};

export async function getRoleDashboardData(): Promise<RoleDashboardData> {
  const actor = await requireErpActor();
  if (actor.permissions.has("dashboard.sales.read")) return salesDashboard(actor.id, actor.fullName);
  if (actor.permissions.has("dashboard.teacher.read")) return teacherDashboard(actor.id, actor.fullName);
  if (actor.permissions.has("dashboard.marketing.read")) return marketingDashboard(actor.fullName);
  throw new Error("Missing permission: dashboard.read");
}

async function salesDashboard(actorId: string, actorName: string): Promise<RoleDashboardData> {
  const [row] = await getPrisma().$queryRaw<SalesDashboardRow[]>(Prisma.sql`
    select
      count(*)::int as "leadCount",
      (select count(*)::int from erp.students student where student.manager_id = ${actorId}::uuid) as "studentCount",
      count(*) filter (
        where l.converted_student_id is null
          and l.stage in ('NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_LESSON', 'TRIAL_CONSULTATION', 'NURTURE')
          and (l.next_follow_up_at is null or l.next_follow_up_at <= now() + interval '1 day')
      )::int as "followUps",
      ${ownerSalesCountSql(Prisma.sql`${actorId}::uuid`, null, null)}::int as converted,
      coalesce((
        select jsonb_agg(jsonb_build_object('stage', grouped.stage::text, 'count', grouped.count) order by grouped.stage)
        from (select stage, count(*)::int as count from erp.leads where manager_id = ${actorId}::uuid group by stage) grouped
      ), '[]'::jsonb) as stages,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', recent.full_name, 'nextFollowUpAt', recent.next_follow_up_at, 'stage', recent.stage::text) order by recent.next_follow_up_at asc nulls last, recent.updated_at desc)
        from (
          select contact.full_name, lead.next_follow_up_at, lead.stage, lead.updated_at
          from erp.leads lead
          join erp.contacts contact on contact.id = lead.contact_id
          where lead.manager_id = ${actorId}::uuid
            and lead.converted_student_id is null
            and lead.stage not in ('REGISTERED', 'LOST')
          order by lead.next_follow_up_at asc nulls last, lead.updated_at desc
          limit 5
        ) recent
      ), '[]'::jsonb) as recent
    from erp.leads l
    where l.manager_id = ${actorId}::uuid
  `);
  const leadCount = row?.leadCount ?? 0;
  const studentCount = row?.studentCount ?? 0;
  const followUps = row?.followUps ?? 0;
  const converted = row?.converted ?? 0;
  const stages = row?.stages ?? [];
  const recent = row?.recent ?? [];
  const maxStage = Math.max(...stages.map((item) => item.count), 1);
  return {
    kind: "sales", actorName, eyebrow: "Şəxsi satış mərkəzi", title: "Follow-up ritmini qoru", description: "Yalnız sizə təyin olunmuş lead və tələbələr üzrə canlı satış görünüşü.", primaryHref: "/crm", primaryLabel: "Follow-up aç",
    kpis: [
      { label: "Mənim lead-lərim", value: String(leadCount), helper: "Sizə assign olunan bütün müraciətlər", tone: "blue" },
      { label: "Bugünkü follow-up", value: String(followUps), helper: "Əlaqə gözləyən prioritetlər", tone: "orange" },
      { label: "Ödənişli satış", value: String(converted), helper: leadCount ? `${Math.round(converted / leadCount * 100)}% lead → satış` : "course_sales jurnalı", tone: "green" },
      { label: "Mənim tələbələrim", value: String(studentCount), helper: "Satışdan tələbəyə çevrilən portfel", tone: "violet" },
    ],
    breakdown: stages.map((item) => ({ label: stageLabel(item.stage), value: item.count, total: maxStage })),
    recent: recent.map((lead) => ({ title: lead.name, meta: lead.nextFollowUpAt ? `Növbəti əlaqə: ${dateLabel(new Date(lead.nextFollowUpAt))}` : "Əlaqə tarixi gözləyir", status: stageLabel(lead.stage) })),
  };
}

async function teacherDashboard(actorId: string, actorName: string): Promise<RoleDashboardData> {
  const prisma = getPrisma();
  const teacher = await prisma.teacher.findUnique({ where: { userId: actorId }, select: { id: true, capacity: true } });
  if (!teacher) return emptyTeacher(actorName);
  const [assignments, attendance, recentSlots] = await Promise.all([
    prisma.studentScheduleAssignment.findMany({
      where: {
        slot: { teacherId: teacher.id },
        validTo: null,
        enrollment: {
          status: "ACTIVE",
          student: { lifecycleStatus: "ACTIVE", isTestData: false },
        },
      },
      select: { slotId: true, enrollmentId: true, enrollment: { select: { studentId: true } } },
    }),
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { teacherId: teacher.id }, _count: { _all: true } }),
    prisma.classSlot.findMany({
      where: { teacherId: teacher.id },
      take: 5,
      orderBy: [{ validFrom: "asc" }, { weekday: "asc" }, { startTime: "asc" }],
      select: {
        weekday: true,
        startTime: true,
        endTime: true,
        room: true,
        _count: {
          select: {
            assignments: {
              where: {
                validTo: null,
                enrollment: {
                  status: EnrollmentStatus.ACTIVE,
                  student: { lifecycleStatus: StudentLifecycleStatus.ACTIVE },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  const slotCount = new Set(assignments.map((item) => item.slotId)).size;
  const studentCount = new Set(assignments.map((item) => item.enrollment.studentId)).size;
  const studentLimit = teacher.capacity ?? 0;
  const studentKpi = studentLimit > 0 ? Math.round((studentCount / studentLimit) * 100) : 0;
  const present = attendance.find((item) => item.status === "PRESENT")?._count._all ?? 0;
  const absent = attendance.find((item) => item.status === "ABSENT")?._count._all ?? 0;
  const total = present + absent;
  return {
    kind: "teacher", actorName, eyebrow: "Müəllim paneli", title: "Slotlarınız bir baxışda", description: "Yalnız sizə bağlı slotlar, tələbələr, davamiyyət və şəxsi tasklar.", primaryHref: "/groups", primaryLabel: "Slotları aç",
    kpis: [
      { label: "Mənim slotlarım", value: String(slotCount), helper: "Həftəlik dərs vaxtları", tone: "violet" },
      {
        label: "Tələbə KPI",
        value: studentLimit > 0 ? `${studentCount}/${studentLimit}` : String(studentCount),
        helper: studentLimit > 0 ? `${studentKpi}% doluluq · ${Math.max(studentLimit - studentCount, 0)} yer qalır` : "Tələbə limiti təyin edilməyib",
        tone: studentKpi >= 100 ? "green" : studentKpi >= 75 ? "blue" : "orange",
        progress: studentLimit > 0 ? Math.min(studentKpi, 100) : 0,
      },
      { label: "Davamiyyət", value: total ? `${Math.round(present / total * 100)}%` : "—", helper: `${present} iştirak · ${absent} qaib`, tone: "green" },
      { label: "Jurnal qeydləri", value: String(total), helper: "Qeyd edilmiş dərs iştirakları", tone: "orange" },
    ],
    breakdown: [{ label: "İştirak", value: present, total: Math.max(total, 1) }, { label: "Qaib", value: absent, total: Math.max(total, 1) }],
    recent: recentSlots.map((slot) => ({
      title: `${slot.startTime}–${slot.endTime}`,
      meta: `${slot._count.assignments} tələbə · ${slot.room ?? "Otaq seçilməyib"}`,
      status: weekdayLabel(slot.weekday),
    })),
  };
}

async function marketingDashboard(actorName: string): Promise<RoleDashboardData> {
  const [row] = await getPrisma().$queryRaw<MarketingDashboardRow[]>(Prisma.sql`
    select
      count(*)::int as campaigns,
      count(*) filter (where campaign.status = 'ACTIVE')::int as active,
      coalesce(sum(campaign.budget), 0)::float8 as budget,
      coalesce((select sum(stat.spend) from erp.marketing_campaign_stats stat), 0)::float8 as spend,
      coalesce((select sum(stat.revenue) from erp.marketing_campaign_stats stat), 0)::float8 as revenue,
      coalesce((select sum(stat.leads) from erp.marketing_campaign_stats stat), 0)::int as leads,
      coalesce((select sum(stat.conversions) from erp.marketing_campaign_stats stat), 0)::int as conversions,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', recent.name, 'channel', recent.channel, 'budget', recent.budget::float8, 'status', recent.status::text) order by recent.status, recent.starts_at desc)
        from (
          select name, channel, budget, status, starts_at
          from erp.marketing_campaigns
          order by status asc, starts_at desc
          limit 5
        ) recent
      ), '[]'::jsonb) as recent
    from erp.marketing_campaigns campaign
  `);
  const campaigns = row?.campaigns ?? 0;
  const active = row?.active ?? 0;
  const budget = row?.budget ?? 0;
  const spend = row?.spend ?? 0;
  const revenue = row?.revenue ?? 0;
  const leads = row?.leads ?? 0;
  const conversions = row?.conversions ?? 0;
  const recent = row?.recent ?? [];
  return {
    kind: "marketing", actorName, eyebrow: "Marketing cockpit", title: "Kampaniyaları nəticəyə çevir", description: "Marketing performansı, büdcə, lead axını və şəxsi tasklar bir mərkəzdə.", primaryHref: "/marketing", primaryLabel: "Marketing aç",
    kpis: [
      { label: "Aktiv kampaniyalar", value: String(active), helper: `${campaigns} ümumi kampaniya`, tone: "violet" },
      { label: "Lead axını", value: String(leads), helper: `${conversions} konvertasiya`, tone: "blue" },
      { label: "ROAS", value: spend ? `${(revenue / spend).toFixed(1)}x` : "—", helper: `${money(spend)} xərc`, tone: "green" },
      { label: "Plan büdcəsi", value: money(budget), helper: `${money(revenue)} gəlir təsiri`, tone: "orange" },
    ],
    breakdown: [{ label: "Lead", value: leads, total: Math.max(leads, 1) }, { label: "Konvertasiya", value: conversions, total: Math.max(leads, 1) }],
    recent: recent.map((campaign) => ({ title: campaign.name, meta: `${campaign.channel} · ${money(Number(campaign.budget))}`, status: campaignStatus(campaign.status) })),
  };
}

function emptyTeacher(actorName: string): RoleDashboardData { return { kind: "teacher", actorName, eyebrow: "Müəllim paneli", title: "Profil bağlantısı gözləyir", description: "ERP hesabınızı müəllim profilinə bağladıqdan sonra slot göstəriciləri burada görünəcək.", primaryHref: "/groups", primaryLabel: "Slotları aç", kpis: [], breakdown: [], recent: [] }; }
function stageLabel(stage: LeadStage) { return ({ NEW: "Yeni", CONTACTED: "Əlaqə saxlanıb", QUALIFIED: "Uyğun", TRIAL_LESSON: "Sınaq dərsi", TRIAL_CONSULTATION: "Ödəniş gözlənilir", REGISTERED: "Qeydiyyat", LOST: "İtirilib", NURTURE: "İzləmədə" } as const)[stage]; }
function campaignStatus(status: MarketingCampaignStatus) { return ({ DRAFT: "Qaralama", ACTIVE: "Aktiv", PAUSED: "Dayandırılıb", COMPLETED: "Tamamlanıb" } as const)[status]; }
function weekdayLabel(value: string) { return ({ MONDAY: "Bazar ertəsi", TUESDAY: "Çərşənbə axşamı", WEDNESDAY: "Çərşənbə", THURSDAY: "Cümə axşamı", FRIDAY: "Cümə", SATURDAY: "Şənbə", SUNDAY: "Bazar" } as Record<string, string>)[value] ?? value; }
function dateLabel(value: Date) { return `${value.getUTCDate().toString().padStart(2, "0")}.${(value.getUTCMonth() + 1).toString().padStart(2, "0")}.${value.getUTCFullYear()}`; }
function money(value: number) { return `${value.toFixed(0)} ₼`; }
