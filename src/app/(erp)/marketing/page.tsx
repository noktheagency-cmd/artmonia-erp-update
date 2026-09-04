import "@/modules/instagram-dm/instagram-dm-analytics.css";
import "@/modules/marketing/marketing-dashboard.css";
import { InstagramDmAnalytics } from "@/modules/instagram-dm/instagram-dm-analytics";
import { getInstagramDmAnalyticsData } from "@/modules/instagram-dm/analytics-queries";
import { MarketingContentPlanner } from "@/modules/marketing/marketing-content-planner";
import { MarketingDashboard } from "@/modules/marketing/marketing-dashboard";
import { getMarketingDashboardData } from "@/modules/marketing/dashboard-queries";
import { MarketingStrategyWorkspace } from "@/modules/marketing/marketing-strategy-workspace";
import { MarketingWorkspace } from "@/modules/marketing/marketing-workspace";
import { getMarketingContentData } from "@/modules/marketing/content-queries";
import { getMarketingStrategyData } from "@/modules/marketing/strategy-queries";
import { getMarketingData } from "@/modules/marketing/queries";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    month?: string;
    strategy?: string;
    content?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const filters = await searchParams;

  if (filters.view === "content") {
    return (
      <MarketingContentPlanner
        data={await getMarketingContentData(filters.month)}
        initialSelectedId={filters.content}
      />
    );
  }

  if (filters.view === "strategy") {
    return (
      <MarketingStrategyWorkspace
        data={await getMarketingStrategyData({
          month: filters.month,
          strategyId: filters.strategy,
        })}
      />
    );
  }

  if (filters.view === "dm") {
    return <InstagramDmAnalytics data={await getInstagramDmAnalyticsData()} />;
  }

  if (filters.view === "results") {
    return <MarketingWorkspace data={await getMarketingData({ from: filters.from, to: filters.to })} />;
  }

  return <MarketingDashboard data={await getMarketingDashboardData({ from: filters.from, to: filters.to })} />;
}
