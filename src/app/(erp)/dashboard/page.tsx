import "@/modules/dashboard/dashboard.css";
import { OwnerDashboard } from "@/modules/dashboard/owner-dashboard";
import { getOwnerDashboardData } from "@/modules/dashboard/queries";
import { createTaskAction } from "@/modules/tasks/actions";
import { getTaskData } from "@/modules/tasks/queries";
import { requireErpActor } from "@/server/auth/actor";
import { RoleDashboard } from "@/modules/dashboard/role-dashboard";
import { getRoleDashboardData } from "@/modules/dashboard/role-dashboard-query";
import { getHrBonusData } from "@/modules/hr/bonus-data";
import { AppRole } from "@/generated/prisma/client";

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
  const actor = await requireErpActor();
  const showOwnerDashboard = actor.permissions.has("dashboard.owner.read");
  if (!showOwnerDashboard) {
    const [roleData, taskData] = await Promise.all([getRoleDashboardData(), getTaskData()]);
    return <RoleDashboard data={roleData} taskData={taskData} createTaskAction={createTaskAction} />;
  }
  const isSuperAdmin = actor.roles.includes(AppRole.SUPER_ADMIN);
  const [data, taskData, bonusData] = await Promise.all([
    getOwnerDashboardData(filters),
    getTaskData(),
    isSuperAdmin ? getHrBonusData() : Promise.resolve(null),
  ]);

  return (
    <OwnerDashboard
      data={data}
      bonusData={bonusData}
      taskData={taskData}
      createTaskAction={createTaskAction}
    />
  );
}
