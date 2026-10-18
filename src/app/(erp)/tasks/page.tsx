import { createTaskAction, deleteTaskAction, updateTaskStatusAction } from "@/modules/tasks/actions";
import { markTaskNotificationsReadAction } from "@/modules/notifications/actions";
import { getTaskData } from "@/modules/tasks/queries";
import { TaskWorkspace } from "@/modules/tasks/task-workspace";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    historyPage?: string;
    view?: string;
    task?: string;
  }>;
}) {
  const data = await getTaskData({ ...(await searchParams), includeHistory: true });

  return (
    <TaskWorkspace
      data={data}
      createTaskAction={createTaskAction}
      updateTaskStatusAction={updateTaskStatusAction}
      deleteTaskAction={deleteTaskAction}
      markNotificationsReadAction={markTaskNotificationsReadAction}
    />
  );
}
