import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type {
  ActionFailure,
  ActionResult,
} from "@/lib/action-result";
import {
  getPublicValidationMessage,
  isUuidDatabaseError,
} from "@/server/actions/validation-errors";
import { PublicActionError } from "@/server/actions/public-action-error";

export { PublicActionError } from "@/server/actions/public-action-error";

export function safeServerAction<Args extends unknown[], Result>(
  operation: (...args: Args) => Promise<Result>,
  fallback: string,
) {
  return async (...args: Args): Promise<ActionResult<Result>> => {
    try {
      return { ok: true, data: await operation(...args) };
    } catch (error) {
      unstable_rethrow(error);
      return toActionFailure(error, fallback);
    }
  };
}

export function toActionFailure(
  error: unknown,
  fallback: string,
): ActionFailure {
  if (error instanceof PublicActionError) {
    return { ok: false, code: error.code, message: error.message };
  }

  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "VALIDATION",
      message: getPublicValidationMessage(error),
    };
  }

  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : "";

  if (isUuidDatabaseError(message)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Seçilmiş məlumat düzgün deyil. Səhifəni yeniləyib yenidən cəhd edin.",
    };
  }

  if (code === "P2002" || code === "23505") {
    return {
      ok: false,
      code: "DUPLICATE",
      message: "Bu məlumat artıq sistemdə mövcuddur.",
    };
  }
  if (code === "P2025") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Dəyişdiriləcək məlumat tapılmadı.",
    };
  }
  if (message === "Unauthorized") {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Sessiya bitib. Səhifəni yeniləyib yenidən daxil olun.",
    };
  }
  if (message.startsWith("Missing permission")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Bu əməliyyat üçün hesabınızda lazımi icazə yoxdur.",
    };
  }
  if (/already registered|already exists|email.*(?:used|taken)|duplicate/i.test(message)) {
    return {
      ok: false,
      code: "DUPLICATE",
      message: "Bu e-poçt ünvanı ilə giriş hesabı artıq mövcuddur.",
    };
  }
  if (/password/i.test(message) && /weak|short|length|characters/i.test(message)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Parol təhlükəsizlik tələblərinə uyğun deyil.",
    };
  }
  if (/missing required environment variable/i.test(message)) {
    return configurationFailure();
  }
  if (/failed to fetch|fetch failed|network|econnrefused|timeout/i.test(message)) {
    return {
      ok: false,
      code: "NETWORK",
      message: "Server bağlantısı müvəqqəti əlçatan deyil. Yenidən cəhd edin.",
    };
  }
  if (isExplicitUserFacingError(error, message)) {
    return {
      ok: false,
      code: "VALIDATION",
      message,
    };
  }

  const errorId = randomUUID().slice(0, 8).toUpperCase();
  console.error("Server action failed", {
    errorId,
    name: error instanceof Error ? error.name : typeof error,
    code,
    message: redactLogMessage(message),
  });
  return {
    ok: false,
    code: "INTERNAL",
    message: `${fallback} Xəta kodu: ${errorId}`,
    errorId,
  };
}

function isExplicitUserFacingError(error: unknown, message: string) {
  return (
    error instanceof Error &&
    error.constructor === Error &&
    message.length > 0 &&
    message.length <= 400 &&
    /[ƏəĞğİıÖöŞşÜüÇç]/.test(message) &&
    !/(prisma|postgres|select |insert |update |delete |constraint|node_modules|[A-Z]:\\)/i.test(message)
  );
}

function configurationFailure(): ActionFailure {
  return {
    ok: false,
    code: "CONFIGURATION",
    message: "Server konfiqurasiyası tamamlanmayıb. Sistem administratoruna müraciət edin.",
  };
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}

function redactLogMessage(message: string) {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(?:bearer|token|secret|password|key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 800);
}
