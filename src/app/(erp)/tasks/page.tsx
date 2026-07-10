import { createTaskAction, updateTaskStatusAction } from "@/modules/tasks/actions";
import { getTaskData } from "@/modules/tasks/queries";
import { TaskWorkspace } from "@/modules/tasks/task-workspace";

export default async function TasksPage() {
  const data = await getTaskData();

  return (
    <TaskWorkspace
      data={data}
      createTaskAction={createTaskAction}
      updateTaskStatusAction={updateTaskStatusAction}
    />
  );
}
