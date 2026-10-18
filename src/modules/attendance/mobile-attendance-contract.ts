import { z } from "zod";

export const mobileCheckInBodySchema = z.object({
  // Backward-compatible only. The ERP always derives the authoritative student ID
  // from X-Student-Authorization and rejects a mismatching supplied value.
  erpStudentId: z.string().uuid().optional(),
  clientEventId: z.string().uuid(),
  qrToken: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/),
  deviceInstallationId: z.string().uuid().optional(),
  scannedAt: z.string().datetime({ offset: true }),
}).strict();

export const mobileAttendanceErrorCodes = [
  "QR_INVALID",
  "QR_EXPIRED",
  "LESSON_NOT_FOUND",
  "STUDENT_NOT_FOUND",
  "STUDENT_NOT_ENROLLED",
  "ADMISSION_INCOMPLETE",
  "CHECK_IN_WINDOW_CLOSED",
  "NO_ACTIVE_LESSON",
  "LESSON_CANCELLED",
  "DEVICE_REQUIRED",
  "DEVICE_MISMATCH",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type MobileCheckInRequest = z.infer<typeof mobileCheckInBodySchema>;
export type MobileCheckInInput = Omit<MobileCheckInRequest, "erpStudentId"> & {
  erpStudentId: string;
};
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
