function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function originsMatch(requestOrigin: string, expectedOrigin: string) {
  try {
    const request = new URL(requestOrigin);
    const expected = new URL(expectedOrigin);
    if (request.origin === expected.origin) return true;
    // Local Next often runs on a different port than NEXT_PUBLIC_APP_URL.
    return isLocalHostname(request.hostname) && isLocalHostname(expected.hostname);
  } catch {
    return false;
  }
}

/** Browser cookie mutations require an explicit same-origin request. */
export function isAllowedBrowserMutation(
  method: string,
  pathname: string,
  headers: Pick<Headers, "get">,
  expectedOrigin: string,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true;
  if (!pathname.startsWith("/api/")) return true; // Next.js validates Server Action origins.
  // These routes authenticate server tokens or webhook signatures, never ERP cookies.
  if (/^\/api\/(cron|mobile|integrations)\//.test(pathname)) return true;
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;
  return originsMatch(origin, expectedOrigin);
}
