import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  MCP_PUBLIC_URL: z.string().url().optional(),
  MCP_OAUTH_CLIENT_ID: z.string().uuid().optional(),
  MCP_EXPECTED_AUDIENCE: z.string().optional(),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  META_BUSINESS_ID: z.string().regex(/^\d+$/).optional(),
  META_AD_ACCOUNT_ID: z.string().regex(/^act_\d+$/).optional(),
  META_APP_ID: z.string().regex(/^\d+$/).optional(),
  META_SYSTEM_USER_ID: z.string().regex(/^\d+$/).optional(),
  META_ACCESS_TOKEN: z.string().min(20).optional(),
  META_APP_SECRET: z.string().min(16).optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
  META_SYNC_MONTHS: z.coerce.number().int().min(1).max(24).default(8),
  META_SYNC_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(90).default(14),
});

type AppEnv = z.infer<typeof envSchema>;

export function getEnv() {
  return envSchema.parse(process.env);
}

export function requireEnv<K extends keyof AppEnv>(name: K): NonNullable<AppEnv[K]> {
  const value = getEnv()[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value as NonNullable<AppEnv[K]>;
}

export function hasEnv(name: keyof AppEnv) {
  return Boolean(getEnv()[name]);
}

export function hasSupabasePublicEnv() {
  const env = getEnv();

  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function hasDatabaseEnv() {
  return hasEnv("DATABASE_URL");
}
