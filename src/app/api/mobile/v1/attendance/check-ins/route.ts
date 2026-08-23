import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hasValidMobileAttendanceAuthorization } from "@/modules/attendance/mobile-attendance-auth";
import { mobileCheckInBodySchema } from "@/modules/attendance/mobile-attendance-contract";
import { processMobileAttendanceCheckIn } from "@/modules/attendance/mobile-attendance-service";
import { resolveStudentMobileIdentity } from "@/modules/students/mobile-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId = uuidSchema.safeParse(suppliedRequestId).success
    ? suppliedRequestId as string
    : randomUUID();

  if (!hasValidMobileAttendanceAuthorization(request.headers.get("authorization"))) {
    return json({ code: "UNAUTHORIZED", message: "Server autentifikasiyası uğursuz oldu.", requestId }, 401, requestId);
  }
  const studentAccessToken = readBearerToken(request.headers.get("x-student-authorization"));
  if (!studentAccessToken) {
    return json({ code: "STUDENT_AUTH_REQUIRED", message: "Tələbə autentifikasiyası tələb olunur.", requestId }, 401, requestId);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type application/json olmalıdır.", requestId }, 415, requestId);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!uuidSchema.safeParse(idempotencyKey).success) {
    return json({ code: "INVALID_REQUEST", message: "Etibarlı Idempotency-Key tələb olunur.", requestId }, 400, requestId);
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
      return json({ code: "PAYLOAD_TOO_LARGE", message: "Sorğu body-si çox böyükdür.", requestId }, 413, requestId);
    }
    const requestInput = mobileCheckInBodySchema.parse(JSON.parse(rawBody));
    const identity = await resolveStudentMobileIdentity(studentAccessToken);
    if (!identity) {
      return json({ code: "STUDENT_AUTH_INVALID", message: "Mobil tələbə hesabı etibarsız və ya deaktivdir.", requestId }, 403, requestId);
    }
    if (requestInput.erpStudentId && requestInput.erpStudentId !== identity.studentId) {
      return json({ code: "STUDENT_ID_MISMATCH", message: "Sorğudakı tələbə kimliyi giriş hesabı ilə uyğun deyil.", requestId }, 403, requestId);
    }
    const result = await processMobileAttendanceCheckIn({
      ...requestInput,
      erpStudentId: identity.studentId,
    }, {
      idempotencyKey: idempotencyKey as string,
      requestId,
    });
    return json(result.body, result.httpStatus, String(result.body.requestId), result.httpStatus === 429);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return json({ code: "INVALID_REQUEST", message: "Sorğu body-si düzgün deyil.", requestId }, 400, requestId);
    }
    console.error("Mobile attendance check-in failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ code: "INTERNAL_ERROR", message: "Davamiyyət qeydə alına bilmədi.", requestId }, 500, requestId);
  }
}

function readBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

function json(body: object, status: number, requestId: string, retryAfter = false) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
      ...(retryAfter ? { "Retry-After": "60" } : {}),
    },
  });
}
