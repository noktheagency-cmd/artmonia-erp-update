import { z } from "zod";
import { weekdayMeta } from "@/modules/groups/shared";

export const retentionInput = z.object({
  from: z.iso.date(), to: z.iso.date(),
  teacherId: z.string().uuid().optional(), groupId: z.string().uuid().optional(),
  status: z.enum(["FROZEN", "STOPPED"]).default("FROZEN"),
  page: z.number().int().min(1).max(100000).default(1),
}).refine(({ from, to }) => from <= to, { message: "Başlanğıc tarixi bitmə tarixindən sonra ola bilməz." });

export type RetentionOptions = {
  teachers: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; teacherId: string }>;
};
export type RetentionReport = RetentionOptions & {
  population: number; frozen: number; stopped: number; total: number; rate: number;
  page: number; pages: number;
  details: Array<{ id: string; studentId: string; name: string; date: string; reason: string; note: string | null; manager: string | null }>;
};

export function retentionRate(total: number, population: number) {
  return population > 0 ? Math.round(total / population * 100) : 0;
}

export function localizeAttendanceGroup(name: string) {
  return name.replace(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/g,
    (day) => weekdayMeta[day as keyof typeof weekdayMeta].label);
}

export function retentionDetailsHref(from: string, to: string) {
  return `/students?tab=overview&attendance=1&attendanceFrom=${encodeURIComponent(from)}&attendanceTo=${encodeURIComponent(to)}` as const;
}
