export type ActionErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE"
  | "NETWORK"
  | "CONFIGURATION"
  | "INTERNAL";

export type ActionFailure = {
  ok: false;
  code: ActionErrorCode;
  message: string;
  errorId?: string;
};

export type ActionSuccess<T> = {
  ok: true;
  data: T;
};

export type ActionResult<T = null> = ActionSuccess<T> | ActionFailure;

export function unwrapActionResult<T>(value: T | ActionResult<T>): T {
  if (!isActionResult(value)) return value as T;
  if (!value.ok) {
    const error = new Error(value.message);
    error.name = "ActionResultError";
    throw error;
  }
  return value.data;
}

export function isActionResult(value: unknown): value is ActionResult<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ok" in value &&
      typeof (value as { ok?: unknown }).ok === "boolean",
  );
}
