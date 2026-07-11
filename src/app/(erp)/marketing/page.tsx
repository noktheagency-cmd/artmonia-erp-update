import "@/modules/marketing/marketing.css";
import { MarketingWorkspace } from "@/modules/marketing/marketing-workspace";
import { getMarketingData } from "@/modules/marketing/queries";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const data = await getMarketingData();

  return <MarketingWorkspace data={data} />;
}
