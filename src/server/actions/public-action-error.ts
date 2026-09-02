import type { ActionErrorCode } from "@/lib/action-result";

export class PublicActionError extends Error {
  constructor(
    message: string,
    readonly code: ActionErrorCode = "VALIDATION",
  ) {
    super(message);
    this.name = "PublicActionError";
  }
}
