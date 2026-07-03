import { OwnerDashboard } from "@/modules/dashboard/owner-dashboard";
import { getOwnerDashboardData } from "@/modules/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
}) {
  const filters = await searchParams;
  const data = await getOwnerDashboardData(filters);

  return <OwnerDashboard data={data} />;
}
