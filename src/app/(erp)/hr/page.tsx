import { HrPerformancePanel } from "@/modules/hr/hr-performance-panel";
import { getHrPerformanceData } from "@/modules/hr/performance-data";

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{
    manager?: string;
    month?: string;
  }>;
}) {
  const filters = await searchParams;
  const data = getHrPerformanceData(filters);

  return <HrPerformancePanel data={data} />;
}
