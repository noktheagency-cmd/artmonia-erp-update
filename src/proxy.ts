import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/server/supabase/proxy";
import { isAllowedBrowserMutation } from "@/server/auth/request-origin";
import { getEnv } from "@/server/env";

export async function proxy(request: NextRequest) {
  const configuredOrigin = getEnv().NEXT_PUBLIC_APP_URL;
  const requestOrigin = request.nextUrl.origin;
  const candidates = configuredOrigin
    ? [configuredOrigin, requestOrigin]
    : [requestOrigin];

  const allowed = candidates.some((expectedOrigin) =>
    isAllowedBrowserMutation(
      request.method,
      request.nextUrl.pathname,
      request.headers,
      expectedOrigin,
    ),
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "FORBIDDEN_ORIGIN" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return updateSession(request);
}

export const config = {
  matcher:
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
};
