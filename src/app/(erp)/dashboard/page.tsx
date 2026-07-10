import { OwnerDashboard } from "@/modules/dashboard/owner-dashboard";
import { getOwnerDashboardData } from "@/modules/dashboard/queries";
import { createTaskAction } from "@/modules/tasks/actions";
import { getTaskData } from "@/modules/tasks/queries";

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
  const [data, taskData] = await Promise.all([
    getOwnerDashboardData(filters),
    getTaskData(),
  ]);

  return (
    <OwnerDashboard
      data={data}
      taskData={taskData}
      createTaskAction={createTaskAction}
    />
  );
}
