import { OwnerDashboard } from "@/modules/dashboard/owner-dashboard";
import { getOwnerDashboardData } from "@/modules/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getOwnerDashboardData();

  return <OwnerDashboard data={data} />;
}
