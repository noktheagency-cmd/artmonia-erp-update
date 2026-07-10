import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/server/env";
import type { Database } from "@/server/supabase/database.types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export async function createSupabaseServerClient(cookieStore?: CookieStore) {
  const resolvedCookieStore = cookieStore ?? (await cookies());

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return resolvedCookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              resolvedCookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. Middleware/Route Handlers will refresh sessions.
          }
        },
      },
    }
  );
}
