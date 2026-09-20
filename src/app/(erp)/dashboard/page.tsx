import "@/modules/dashboard/dashboard.css";
import { OwnerDashboard } from "@/modules/dashboard/owner-dashboard";
import { getOwnerDashboardData } from "@/modules/dashboard/queries";
import { createTaskAction, updateTaskStatusAction } from "@/modules/tasks/actions";
import { getTaskData } from "@/modules/tasks/queries";
import { AppRole } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { RoleDashboard } from "@/modules/dashboard/role-dashboard";
import { getRoleDashboardData } from "@/modules/dashboard/role-dashboard-query";
import { getCompanyKpiData } from "@/modules/hr/company-kpi-data";
import { getDailyReportData } from "@/modules/dashboard/daily-report-query";

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
    return <RoleDashboard data={roleData} taskData={taskData} createTaskAction={createTaskAction} updateTaskStatusAction={updateTaskStatusAction} />;
  }
  const showTaskProgress =
    !actor.roles.includes(AppRole.SUPER_ADMIN) && actor.permissions.has("task.read");
  const showCompanyKpi = actor.permissions.has("hr.company_kpi.read");
  const [data, taskData, companyKpiData, dailyReport] = await Promise.all([
    getOwnerDashboardData(filters),
    showTaskProgress ? getTaskData() : Promise.resolve(null),
    showCompanyKpi ? getCompanyKpiData() : Promise.resolve(null),
    getDailyReportData(),
  ]);

  return (
    <OwnerDashboard
      data={data}
      dailyReport={dailyReport}
      actorName={actor.fullName}
      companyKpiData={companyKpiData}
      taskData={taskData}
      createTaskAction={createTaskAction}
      updateTaskStatusAction={updateTaskStatusAction}
    />
  );
}
