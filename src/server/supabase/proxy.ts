import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv, hasSupabasePublicEnv } from "@/server/env";
import { hasSupabaseAuthCookie } from "@/server/supabase/auth-cookies";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  if (!hasSupabasePublicEnv()) {
    return response;
  }

  const env = getEnv();

  if (
    !hasSupabaseAuthCookie(
      request.cookies.getAll(),
      env.NEXT_PUBLIC_SUPABASE_URL
    )
  ) {
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headersToSet).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return response;
}
