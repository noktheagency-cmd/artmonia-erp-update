import { z } from "zod";

const dateSchema = z.string().date();
const lessonFilterValues = [
  "all",
  "scheduled",
  "completed",
  "cancelled",
  "rescheduled",
  "pending",
  "present",
  "absent",
  "excused",
] as const;

export const mobileProfilePatchSchema = z.object({
  phone: z.string().trim().min(7).max(30).nullable().optional(),
  avatarObjectPath: z.string().trim().max(240).nullable().optional(),
}).strict().refine(
  (value) => value.phone !== undefined || value.avatarObjectPath !== undefined,
  { message: "Ən azı bir profil sahəsi göndərilməlidir." },
);

export const mobileLessonsQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: z.enum(lessonFilterValues).default("all"),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const mobileAttendanceSummaryQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
}).strict();

export type MobileLessonsQuery = z.infer<typeof mobileLessonsQuerySchema>;
export type MobileLessonFilter = typeof lessonFilterValues[number];
export type MobileProfilePatch = z.infer<typeof mobileProfilePatchSchema>;
