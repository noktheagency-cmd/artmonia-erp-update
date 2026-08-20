import type { ActionErrorCode } from "@/lib/action-result";

export function taskApiErrorStatus(code: ActionErrorCode) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  return code === "INTERNAL" || code === "CONFIGURATION" ? 500 : 400;
}
