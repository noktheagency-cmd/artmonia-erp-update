import { TaskStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { TASK_COMPLETION_NOTE_MAX_LENGTH } from "@/modules/tasks/task-status-constants";

export const taskStatusUpdateSchema = z.object({
  taskId: z.string().uuid(),
  status: z.nativeEnum(TaskStatus),
  completionNote: z
    .string()
    .trim()
    .max(
      TASK_COMPLETION_NOTE_MAX_LENGTH,
      `Tamamlanma qeydi ${TASK_COMPLETION_NOTE_MAX_LENGTH} simvoldan uzun ola bilməz`,
    )
    .optional(),
}).superRefine((input, context) => {
  if (input.status === TaskStatus.DONE && !input.completionNote) {
    context.addIssue({
      code: "custom",
      path: ["completionNote"],
      message: "Taskı tamamlamaq üçün tamamlanma qeydi yazın.",
    });
  }
});
