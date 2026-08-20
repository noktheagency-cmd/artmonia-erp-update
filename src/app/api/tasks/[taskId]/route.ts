import { deleteTaskAction } from "@/modules/tasks/actions";
import { taskApiErrorStatus } from "@/modules/tasks/task-api-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const formData = new FormData();
  formData.set("taskId", taskId);
  const result = await deleteTaskAction(formData);

  if (!result.ok) {
    return Response.json(
      { error: result.message, code: result.code },
      { status: taskApiErrorStatus(result.code) },
    );
  }

  return new Response(null, { status: 204 });
}
