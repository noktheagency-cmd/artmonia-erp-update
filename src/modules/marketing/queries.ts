import { MarketingCampaignStatus, MarketingReportOutcome } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type MarketingStatusValue = `${MarketingCampaignStatus}`;
export type MarketingStatRow = { id: string; recordedOn: string; spend: number };
export type MarketingCampaignRow = {
  id: string; name: string; channel: string; owner: string; objective: string; notes: string;
  status: MarketingStatusValue; startsAt: string; endsAt: string; createdAt: string;
  stats: MarketingStatRow[];
  leads: Array<{ createdAt: string }>;
  sales: Array<{ registeredAt: string }>;
  payments: Array<{ paidAt: string; amount: number }>;
  latestReport: { outcome: `${MarketingReportOutcome}`; notes: string; createdAt: string } | null;
};

export type MarketingData = { campaigns: MarketingCampaignRow[]; permissions: { canManage: boolean } };

export async function getMarketingData(): Promise<MarketingData> {
  const actor = await requireErpActor("marketing.read");
  const campaigns = await getPrisma().marketingCampaign.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 250,
    select: {
      id: true, name: true, channel: true, owner: true, objective: true, notes: true, status: true, startsAt: true, endsAt: true, createdAt: true,
      stats: { orderBy: { recordedOn: "asc" }, select: { id: true, recordedOn: true, spend: true } },
      leads: { select: { createdAt: true } },
      students: { select: { registeredAt: true, payments: { select: { paidAt: true, amount: true } } } },
      reports: { take: 1, orderBy: { createdAt: "desc" }, select: { outcome: true, notes: true, createdAt: true } },
    },
  });
  return {
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id, name: campaign.name, channel: campaign.channel, owner: campaign.owner ?? "Marketing", objective: campaign.objective ?? "", notes: campaign.notes ?? "", status: campaign.status,
      startsAt: dateInput(campaign.startsAt), endsAt: campaign.endsAt ? dateInput(campaign.endsAt) : "", createdAt: campaign.createdAt.toISOString(),
      stats: campaign.stats.map((stat) => ({ id: stat.id, recordedOn: dateInput(stat.recordedOn), spend: Number(stat.spend) })),
      leads: campaign.leads.map((lead) => ({ createdAt: dateInput(lead.createdAt) })),
      sales: campaign.students.map((student) => ({ registeredAt: dateInput(student.registeredAt) })),
      payments: campaign.students.flatMap((student) => student.payments.map((payment) => ({ paidAt: dateInput(payment.paidAt), amount: Number(payment.amount) }))),
      latestReport: campaign.reports[0] ? { outcome: campaign.reports[0].outcome, notes: campaign.reports[0].notes ?? "", createdAt: campaign.reports[0].createdAt.toISOString() } : null,
    })),
    permissions: { canManage: actor.permissions.has("marketing.manage") },
  };
}

function dateInput(value: Date) { return value.toISOString().slice(0, 10); }
