import { z } from "zod";

export const mobileCheckInBodySchema = z.object({
  erpStudentId: z.string().uuid(),
  clientEventId: z.string().uuid(),
  qrToken: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/),
  scannedAt: z.string().datetime({ offset: true }),
}).strict();

export const mobileAttendanceErrorCodes = [
  "QR_INVALID",
  "QR_EXPIRED",
  "LESSON_NOT_FOUND",
  "STUDENT_NOT_FOUND",
  "STUDENT_NOT_ENROLLED",
  "CHECK_IN_WINDOW_CLOSED",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type MobileCheckInInput = z.infer<typeof mobileCheckInBodySchema>;
export type MobileAttendanceErrorCode = typeof mobileAttendanceErrorCodes[number];

export type MobileAttendanceResponseBody = Record<string, unknown> & {
  requestId: string;
};

export type MobileAttendanceResult = {
  httpStatus: number;
  body: MobileAttendanceResponseBody;
};

export class AttendanceIntegrationError extends Error {
  constructor(
    public readonly code: MobileAttendanceErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "AttendanceIntegrationError";
  }
}
