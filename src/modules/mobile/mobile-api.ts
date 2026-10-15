import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hasValidMobileAttendanceAuthorization } from "@/modules/attendance/mobile-attendance-auth";
import {
  resolveStudentMobileIdentityDetailed,
  type StudentMobileIdentityResolution,
} from "@/modules/students/mobile-account-service";

const uuidSchema = z.string().uuid();

export type MobileStudentIdentity = Extract<
  StudentMobileIdentityResolution,
  { ok: true }
>["identity"];

export type MobileRequestContext = {
  requestId: string;
  identity: MobileStudentIdentity;
};

export type MobileAuthResult =
  | { ok: true; context: MobileRequestContext }
  | { ok: false; response: Response };

export async function authenticateMobileStudentRequest(
  request: Request,
): Promise<MobileAuthResult> {
  const auth = authenticateMobileRequestHeaders(request);
  if (!auth.ok) return auth;
  const { requestId, accessToken } = auth.context;
  try {
    const resolution = await resolveStudentMobileIdentityDetailed(accessToken);
    if (!resolution.ok) {
      const error = identityErrorMeta(resolution.code);
      return { ok: false, response: mobileError(resolution.code, error.message, error.status, requestId) };
    }
    return { ok: true, context: { requestId, identity: resolution.identity } };
  } catch (error) {
    return { ok: false, response: mobileInternalError(error, requestId) };
  }
}

export function authenticateMobileRequestHeaders(request: Request):
  | { ok: true; context: { requestId: string; accessToken: string } }
  | { ok: false; response: Response } {
  const requestId = getMobileRequestId(request);
  if (!hasValidMobileAttendanceAuthorization(request.headers.get("authorization"))) {
    return {
      ok: false,
      response: mobileError(
        "UNAUTHORIZED",
        "Server autentifikasiyası uğursuz oldu.",
        401,
        requestId,
      ),
    };
  }

  const studentAccessToken = readBearerToken(
    request.headers.get("x-student-authorization"),
  );
  if (!studentAccessToken) {
    return {
      ok: false,
      response: mobileError(
        "STUDENT_AUTH_REQUIRED",
        "Tələbə autentifikasiyası tələb olunur.",
        401,
        requestId,
      ),
    };
  }

  return {
    ok: true,
    context: { requestId, accessToken: studentAccessToken },
  };
}

export function getMobileRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return uuidSchema.safeParse(supplied).success ? supplied as string : randomUUID();
}

export function mobileJson(
  body: object,
  status: number,
  requestId: string,
  extraHeaders?: HeadersInit,
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
      ...extraHeaders,
    },
  });
}

export function mobileError(
  code: string,
  message: string,
  status: number,
  requestId: string,
  extra?: Record<string, unknown>,
) {
  return mobileJson({ code, message, requestId, ...extra }, status, requestId);
}

export function mobileInternalError(error: unknown, requestId: string) {
  console.error("Mobile student API request failed", {
    requestId,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  return mobileError(
    "INTERNAL_ERROR",
    "Sorğu hazırda icra edilə bilmədi.",
    500,
    requestId,
  );
}

export function readBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

function identityErrorMeta(code: Exclude<StudentMobileIdentityResolution, { ok: true }>["code"]) {
  if (code === "STUDENT_MAPPING_NOT_FOUND") {
    return { status: 403, message: "Mobil hesab ERP tələbəsinə bağlanmayıb." };
  }
  if (code === "MOBILE_ACCOUNT_DISABLED") {
    return { status: 403, message: "Mobil hesab deaktiv edilib." };
  }
  return { status: 401, message: "Tələbə sessiyası etibarsızdır və ya vaxtı bitib." };
}
