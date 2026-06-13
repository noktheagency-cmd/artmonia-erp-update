export const EMPTY_SELECT_VALUE = "__empty__";

export function optionalFormString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== EMPTY_SELECT_VALUE ? trimmed : undefined;
}

export function formFilterString(value: string | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === EMPTY_SELECT_VALUE ? "" : trimmed;
}
