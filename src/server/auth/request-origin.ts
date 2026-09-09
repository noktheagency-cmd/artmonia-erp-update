/** Browser cookie mutations require an explicit same-origin request. */
export function isAllowedBrowserMutation(method: string, pathname: string, headers: Pick<Headers, "get">, expectedOrigin: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true;
  if (!pathname.startsWith("/api/")) return true; // Next.js validates Server Action origins.
  // These routes authenticate server tokens or webhook signatures, never ERP cookies.
  if (/^\/api\/(cron|mobile|integrations)\//.test(pathname)) return true;
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;
  try { return new URL(origin).origin === new URL(expectedOrigin).origin; } catch { return false; }
}
