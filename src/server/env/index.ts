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
});

export function getEnv() {
  return envSchema.parse(process.env);
}

export function requireEnv(name: keyof z.infer<typeof envSchema>) {
  const value = getEnv()[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function hasEnv(name: keyof z.infer<typeof envSchema>) {
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
