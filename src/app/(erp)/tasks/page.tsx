import { createTaskAction, updateTaskStatusAction } from "@/modules/tasks/actions";
import { getTaskData } from "@/modules/tasks/queries";
import { TaskWorkspace } from "@/modules/tasks/task-workspace";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const data = await getTaskData(await searchParams);

  return (
    <TaskWorkspace
      data={data}
      createTaskAction={createTaskAction}
      updateTaskStatusAction={updateTaskStatusAction}
    />
  );
}
