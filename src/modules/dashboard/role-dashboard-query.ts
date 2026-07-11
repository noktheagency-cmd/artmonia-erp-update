import { LeadStage, MarketingCampaignStatus } from "@/generated/prisma/client";
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
  kpis: Array<{ label: string; value: string; helper: string; tone: "blue" | "violet" | "green" | "orange" }>;
  breakdown: Array<{ label: string; value: number; total: number }>;
  recent: Array<{ title: string; meta: string; status: string }>;
};

export async function getRoleDashboardData(): Promise<RoleDashboardData> {
  const actor = await requireErpActor();
  if (actor.permissions.has("dashboard.sales.read")) return salesDashboard(actor.id, actor.fullName);
  if (actor.permissions.has("dashboard.teacher.read")) return teacherDashboard(actor.id, actor.fullName);
  if (actor.permissions.has("dashboard.marketing.read")) return marketingDashboard(actor.fullName);
  throw new Error("Missing permission: dashboard.read");
}

async function salesDashboard(actorId: string, actorName: string): Promise<RoleDashboardData> {
  const prisma = getPrisma();
  const activeStages = [LeadStage.NEW, LeadStage.CONTACTED, LeadStage.QUALIFIED, LeadStage.TRIAL_CONSULTATION, LeadStage.NURTURE];
  const [leadCount, studentCount, followUps, converted, stages, recent] = await Promise.all([
    prisma.lead.count({ where: { managerId: actorId } }),
    prisma.student.count({ where: { managerId: actorId } }),
    prisma.lead.count({ where: { managerId: actorId, stage: { in: activeStages }, OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: new Date(Date.now() + 86_400_000) } }] } }),
    prisma.lead.count({ where: { managerId: actorId, OR: [{ convertedStudentId: { not: null } }, { stage: LeadStage.REGISTERED }] } }),
    prisma.lead.groupBy({ by: ["stage"], where: { managerId: actorId }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { managerId: actorId }, take: 5, orderBy: [{ nextFollowUpAt: "asc" }, { updatedAt: "desc" }], include: { contact: { select: { fullName: true } } } }),
  ]);
  const maxStage = Math.max(...stages.map((item) => item._count._all), 1);
  return {
    kind: "sales", actorName, eyebrow: "Şəxsi satış mərkəzi", title: "Follow-up ritmini qoru", description: "Yalnız sizə təyin olunmuş lead və tələbələr üzrə canlı satış görünüşü.", primaryHref: "/crm", primaryLabel: "Follow-up aç",
    kpis: [
      { label: "Mənim lead-lərim", value: String(leadCount), helper: "Sizə assign olunan bütün müraciətlər", tone: "blue" },
      { label: "Bugünkü follow-up", value: String(followUps), helper: "Əlaqə gözləyən prioritetlər", tone: "orange" },
      { label: "Konvertasiya", value: leadCount ? `${Math.round(converted / leadCount * 100)}%` : "0%", helper: `${converted} uğurlu qeydiyyat`, tone: "green" },
      { label: "Mənim tələbələrim", value: String(studentCount), helper: "Satışdan tələbəyə çevrilən portfel", tone: "violet" },
    ],
    breakdown: stages.map((item) => ({ label: stageLabel(item.stage), value: item._count._all, total: maxStage })),
    recent: recent.map((lead) => ({ title: lead.contact.fullName, meta: lead.nextFollowUpAt ? `Növbəti əlaqə: ${dateLabel(lead.nextFollowUpAt)}` : "Əlaqə tarixi gözləyir", status: stageLabel(lead.stage) })),
  };
}

async function teacherDashboard(actorId: string, actorName: string): Promise<RoleDashboardData> {
  const prisma = getPrisma();
  const teacher = await prisma.teacher.findUnique({ where: { userId: actorId }, select: { id: true } });
  if (!teacher) return emptyTeacher(actorName);
  const [memberships, attendance, recentGroups] = await Promise.all([
    prisma.groupMembership.findMany({ where: { teacherId: teacher.id, endedAt: null }, select: { groupId: true, enrollmentId: true } }),
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { teacherId: teacher.id }, _count: { _all: true } }),
    prisma.studentGroup.findMany({ where: { memberships: { some: { teacherId: teacher.id, endedAt: null } } }, take: 5, orderBy: { code: "asc" }, include: { schedules: true, _count: { select: { memberships: { where: { teacherId: teacher.id, endedAt: null } } } } } }),
  ]);
  const groupCount = new Set(memberships.map((item) => item.groupId)).size;
  const studentCount = new Set(memberships.map((item) => item.enrollmentId)).size;
  const present = attendance.find((item) => item.status === "PRESENT")?._count._all ?? 0;
  const absent = attendance.find((item) => item.status === "ABSENT")?._count._all ?? 0;
  const total = present + absent;
  return {
    kind: "teacher", actorName, eyebrow: "Müəllim paneli", title: "Qruplarınız bir baxışda", description: "Yalnız sizə bağlı qruplar, tələbələr, davamiyyət və şəxsi tasklar.", primaryHref: "/groups", primaryLabel: "Qrupları aç",
    kpis: [
      { label: "Mənim qruplarım", value: String(groupCount), helper: "Aktiv müəllim təyinatları", tone: "violet" },
      { label: "Aktiv tələbələr", value: String(studentCount), helper: "Qruplarınızdakı unikal tələbələr", tone: "blue" },
      { label: "Davamiyyət", value: total ? `${Math.round(present / total * 100)}%` : "—", helper: `${present} iştirak · ${absent} qaib`, tone: "green" },
      { label: "Jurnal qeydləri", value: String(total), helper: "Qeyd edilmiş dərs iştirakları", tone: "orange" },
    ],
    breakdown: [{ label: "İştirak", value: present, total: Math.max(total, 1) }, { label: "Qaib", value: absent, total: Math.max(total, 1) }],
    recent: recentGroups.map((group) => ({ title: group.code, meta: `${group._count.memberships} tələbə · ${group.schedules.length} dərs vaxtı`, status: "Aktiv qrup" })),
  };
}

async function marketingDashboard(actorName: string): Promise<RoleDashboardData> {
  const prisma = getPrisma();
  const [campaigns, active, budget, stats, recent] = await Promise.all([
    prisma.marketingCampaign.count(),
    prisma.marketingCampaign.count({ where: { status: MarketingCampaignStatus.ACTIVE } }),
    prisma.marketingCampaign.aggregate({ _sum: { budget: true } }),
    prisma.marketingCampaignStat.aggregate({ _sum: { spend: true, revenue: true, leads: true, conversions: true } }),
    prisma.marketingCampaign.findMany({ take: 5, orderBy: [{ status: "asc" }, { startsAt: "desc" }] }),
  ]);
  const spend = Number(stats._sum.spend ?? 0); const revenue = Number(stats._sum.revenue ?? 0); const leads = stats._sum.leads ?? 0; const conversions = stats._sum.conversions ?? 0;
  return {
    kind: "marketing", actorName, eyebrow: "Marketing cockpit", title: "Kampaniyaları nəticəyə çevir", description: "Marketing performansı, büdcə, lead axını və şəxsi tasklar bir mərkəzdə.", primaryHref: "/marketing", primaryLabel: "Marketing aç",
    kpis: [
      { label: "Aktiv kampaniyalar", value: String(active), helper: `${campaigns} ümumi kampaniya`, tone: "violet" },
      { label: "Lead axını", value: String(leads), helper: `${conversions} konvertasiya`, tone: "blue" },
      { label: "ROAS", value: spend ? `${(revenue / spend).toFixed(1)}x` : "—", helper: `${money(spend)} xərc`, tone: "green" },
      { label: "Plan büdcəsi", value: money(Number(budget._sum.budget ?? 0)), helper: `${money(revenue)} gəlir təsiri`, tone: "orange" },
    ],
    breakdown: [{ label: "Lead", value: leads, total: Math.max(leads, 1) }, { label: "Konvertasiya", value: conversions, total: Math.max(leads, 1) }],
    recent: recent.map((campaign) => ({ title: campaign.name, meta: `${campaign.channel} · ${money(Number(campaign.budget))}`, status: campaignStatus(campaign.status) })),
  };
}

function emptyTeacher(actorName: string): RoleDashboardData { return { kind: "teacher", actorName, eyebrow: "Müəllim paneli", title: "Profil bağlantısı gözləyir", description: "ERP hesabınızı müəllim profilinə bağladıqdan sonra qrup göstəriciləri burada görünəcək.", primaryHref: "/groups", primaryLabel: "Qrupları aç", kpis: [], breakdown: [], recent: [] }; }
function stageLabel(stage: LeadStage) { return ({ NEW: "Yeni", CONTACTED: "Əlaqə saxlanıb", QUALIFIED: "Uyğun", TRIAL_CONSULTATION: "Konsultasiya", REGISTERED: "Qeydiyyat", LOST: "İtirilib", NURTURE: "İzləmədə" } as const)[stage]; }
function campaignStatus(status: MarketingCampaignStatus) { return ({ DRAFT: "Qaralama", ACTIVE: "Aktiv", PAUSED: "Dayandırılıb", COMPLETED: "Tamamlanıb" } as const)[status]; }
function dateLabel(value: Date) { return `${value.getUTCDate().toString().padStart(2, "0")}.${(value.getUTCMonth() + 1).toString().padStart(2, "0")}.${value.getUTCFullYear()}`; }
function money(value: number) { return `${value.toFixed(0)} ₼`; }
