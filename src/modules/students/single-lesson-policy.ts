import { z } from "zod";
import { PublicActionError } from "@/server/actions/public-action-error";

export const singleLessonSchema = z.object({
  requestId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  programId: z.string().uuid(), teacherId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  duration: z.coerce.number().int().min(15).max(480),
  room: z.string().trim().max(80).default(""),
  price: z.string().regex(/^\d{1,5}(?:\.\d{1,2})?$/).refine(value => Number(value) > 0, "Dərs haqqı sıfırdan böyük olmalıdır."),
}).refine(input => Boolean(input.studentId || (input.fullName && input.phone)), "Tələbə seçin və ya yeni tələbənin adını və telefonunu yazın.");

export function assertSingleLessonAttendance(current: string, requested: string, date: string, today: string) {
  if (current === requested) return;
  if (current !== "RESERVED") throw new PublicActionError("Bu dərsin nəticəsi artıq qeydə alınıb.", "CONFLICT");
  if (requested !== "CANCELLED" && date > today) throw new PublicActionError("Gələcək dərs üçün iştirak qeyd edilə bilməz.");
}
