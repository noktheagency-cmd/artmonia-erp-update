import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, requireEnv } from "@/server/env";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const env = getEnv();
    const adminKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    if (!adminKey) {
      throw new Error(
        "Missing required environment variable: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    adminClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      adminKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return adminClient;
}
