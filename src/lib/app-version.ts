export const APP_VERSION_STALE_EVENT = "artmonia:version-stale";
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "";

export function isMissingServerAction(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string" ? error : "";
  return /(?:failed to find server action|server action\s+["'][^"']+["']\s+was not found on the server)/i.test(message);
}

export function announceStaleVersion() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APP_VERSION_STALE_EVENT));
  }
}

// Only a successful, valid version response is evidence of a new deployment.
// Auth redirects, offline failures and proxy errors must not trigger reloads.
export async function hasNewAppVersion(
  currentVersion: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!currentVersion) return false;
  try {
    const response = await fetcher("/api/version", {
      method: "GET", cache: "no-store", credentials: "omit",
      redirect: "error", signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return false;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("buildId" in data)) return false;
    return typeof data.buildId === "string" && data.buildId.trim().length > 0 && data.buildId !== currentVersion;
  } catch {
    return false;
  }
}
