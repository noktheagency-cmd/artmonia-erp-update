import type { MarketingContentItemRow } from "@/modules/marketing/content-queries";
import { getMarketingContentData } from "@/modules/marketing/content-queries";
import type { MarketingCampaignRow } from "@/modules/marketing/queries";
import { getMarketingData } from "@/modules/marketing/queries";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type MarketingStrategyExpenseRow = {
  id: string;
  title: string;
  category: string;
  amount: number;
  spentOn: string;
  notes: string;
  createdByName: string;
};

export type MarketingStrategyRow = {
  id: string;
  name: string;
  month: string;
  objective: string;
  status: string;
  responsibleUserId: string;
  responsibleName: string;
  salesGoal: number;
  leadGoal: number;
  revenueGoal: number;
  budget: number;
  notes: string;
  createdAt: string;
  expenses: MarketingStrategyExpenseRow[];
};

export type MarketingStrategyData = {
  month: string;
  year: number;
  strategies: MarketingStrategyRow[];
  selectedStrategy: MarketingStrategyRow | null;
  people: Array<{ id: string; name: string; email: string }>;
  monthCounts: Record<string, number>;
  permissions: { canManage: boolean };
  auto: {
    campaigns: MarketingCampaignRow[];
    contentItems: MarketingContentItemRow[];
    pendingContentCount: number;
    totals: {
      spend: number;
      impressions: number;
      conversations: number;
      leads: number;
      sales: number;
      revenue: number;
      costPerConversation: number;
      currency: string;
    };
  };
};

export async function getMarketingStrategyData(filters?: {
  month?: string;
  strategyId?: string;
}): Promise<MarketingStrategyData> {
  const actor = await requireErpActor("marketing.read");
  const prisma = getPrisma();
  const [strategiesRaw, people] = await Promise.all([
    prisma.marketingStrategy.findMany({
      orderBy: [{ month: "desc" }, { updatedAt: "desc" }],
      take: 250,
      select: {
        id: true,
        name: true,
        month: true,
        objective: true,
        status: true,
        responsibleUserId: true,
        salesGoal: true,
        leadGoal: true,
        revenueGoal: true,
        budget: true,
        notes: true,
        createdAt: true,
        responsible: { select: { fullName: true } },
        expenses: {
          orderBy: [{ spentOn: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            category: true,
            amount: true,
            spentOn: true,
            notes: true,
            createdBy: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      take: 100,
      select: { id: true, fullName: true, email: true },
    }),
  ]);

  const strategies: MarketingStrategyRow[] = strategiesRaw.map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    month: strategy.month.toISOString().slice(0, 7),
    objective: strategy.objective,
    status: strategy.status,
    responsibleUserId: strategy.responsibleUserId ?? "",
    responsibleName: strategy.responsible?.fullName ?? "Təyin edilməyib",
    salesGoal: strategy.salesGoal,
    leadGoal: strategy.leadGoal,
    revenueGoal: Number(strategy.revenueGoal),
    budget: Number(strategy.budget),
    notes: strategy.notes ?? "",
    createdAt: strategy.createdAt.toISOString(),
    expenses: strategy.expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      category: expense.category,
      amount: Number(expense.amount),
      spentOn: expense.spentOn.toISOString().slice(0, 10),
      notes: expense.notes ?? "",
      createdByName: expense.createdBy?.fullName ?? "Sistem",
    })),
  }));

  const requestedStrategy = validUuid(filters?.strategyId)
    ? strategies.find((strategy) => strategy.id === filters?.strategyId) ?? null
    : null;
  const month = validMonth(filters?.month)
    ? filters!.month!
    : requestedStrategy?.month ?? bakuMonthKey(new Date());
  const selectedStrategy = requestedStrategy?.month === month
    ? requestedStrategy
    : strategies.find((strategy) => strategy.month === month) ?? null;
  const { from, to } = monthRange(month);
  const [marketing, content] = await Promise.all([
    getMarketingData({ from, to }),
    getMarketingContentData(month),
  ]);
  const monthlyContent = content.items.filter(
    (item) => item.scheduledAt && bakuMonthFromIso(item.scheduledAt) === month,
  );
  const totals = marketing.campaigns.reduce((result, campaign) => {
    result.spend += campaign.stats.spend;
    result.impressions += campaign.stats.impressions;
    result.conversations += campaign.stats.conversations;
    result.leads += campaign.leadCount;
    result.sales += campaign.saleCount;
    result.revenue += campaign.revenue;
    if (campaign.stats.currency) result.currency = campaign.stats.currency;
    return result;
  }, {
    spend: 0,
    impressions: 0,
    conversations: 0,
    leads: 0,
    sales: 0,
    revenue: 0,
    currency: "AZN",
  });

  const visibleCampaigns = marketing.campaigns
    .filter((campaign) =>
      campaign.stats.spend > 0
      || campaign.stats.conversations > 0
      || campaign.leadCount > 0
      || campaign.saleCount > 0,
    )
    .toSorted((left, right) => right.stats.spend - left.stats.spend)
    .slice(0, 8);
  const monthCounts = strategies.reduce<Record<string, number>>((counts, strategy) => {
    counts[strategy.month] = (counts[strategy.month] ?? 0) + 1;
    return counts;
  }, {});

  return {
    month,
    year: Number(month.slice(0, 4)),
    strategies,
    selectedStrategy,
    people: people.map((person) => ({ id: person.id, name: person.fullName, email: person.email })),
    monthCounts,
    permissions: { canManage: actor.permissions.has("marketing.manage") },
    auto: {
      campaigns: visibleCampaigns,
      contentItems: monthlyContent,
      pendingContentCount: content.items.filter((item) => item.status === "PENDING_APPROVAL").length,
      totals: {
        ...totals,
        costPerConversation: totals.conversations > 0 ? totals.spend / totals.conversations : 0,
      },
    },
  };
}

function validMonth(value?: string): value is string {
  return Boolean(value && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value));
}

function validUuid(value?: string): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function bakuMonthKey(value: Date) {
  const baku = new Date(value.getTime() + 4 * 60 * 60 * 1000);
  return `${baku.getUTCFullYear()}-${String(baku.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bakuMonthFromIso(value: string) {
  return bakuMonthKey(new Date(value));
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}
