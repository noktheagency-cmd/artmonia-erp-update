import { createTaskAction } from "@/modules/tasks/actions";
import { taskApiErrorStatus } from "@/modules/tasks/task-api-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON məlumatı düzgün deyil." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Sorğu məlumatı düzgün deyil." }, { status: 400 });
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") formData.set(key, value);
  }

  const result = await createTaskAction(formData);
  if (!result.ok) {
    return Response.json(
      { error: result.message, code: result.code },
      { status: taskApiErrorStatus(result.code) },
    );
  }

  return Response.json(result.data, { status: 201 });
}
