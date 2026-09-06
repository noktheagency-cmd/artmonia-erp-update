import { z } from "zod";

export const taskEditSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(2, "Task adı çox qısadır").max(160),
  description: z.string().trim().max(2000),
  ownerUserId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
    const parsed = new Date(`${date}T12:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  }, "Son tarix düzgün deyil."),
  priority: z.enum(["URGENT", "NORMAL", "LOW"]),
});
