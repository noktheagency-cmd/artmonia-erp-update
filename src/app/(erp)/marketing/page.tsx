import "@/modules/marketing/marketing.css";
import "@/modules/marketing/marketing-slide-planner.css";
import "@/modules/marketing/marketing-strategy.css";
import { MarketingSlidePlanner } from "@/modules/marketing/marketing-slide-planner";
import { MarketingStrategyWorkspace } from "@/modules/marketing/marketing-strategy-workspace";
import { MarketingWorkspace } from "@/modules/marketing/marketing-workspace";
import { getMarketingContentData } from "@/modules/marketing/content-queries";
import { getMarketingData } from "@/modules/marketing/queries";
import { getMarketingStrategyData } from "@/modules/marketing/strategy-queries";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string; month?: string; strategy?: string }>;
}) {
  const filters = await searchParams;
  if (filters.view === "strategy") {
    const data = await getMarketingStrategyData({ month: filters.month, strategyId: filters.strategy });
    return <MarketingStrategyWorkspace data={data} />;
  }
  if (filters.view === "content") {
    const data = await getMarketingContentData(filters.month);
    return <MarketingSlidePlanner data={data} />;
  }
  const data = await getMarketingData(filters);

  return <MarketingWorkspace data={data} />;
}
