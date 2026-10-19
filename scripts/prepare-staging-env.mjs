/**
 * Build a gitignored .env.staging from .env.local (Academy DB).
 * Never overwrites production markers — aborts instead.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePath = resolve(process.cwd(), ".env.local");
const targetPath = resolve(process.cwd(), ".env.staging");

if (!existsSync(sourcePath)) {
  console.error("Missing .env.local — fill Academy credentials first.");
  process.exit(1);
}

const source = readFileSync(sourcePath, "utf8");
const prodMarkers = ["azhriwieowdeuvbqjqvl", "erp.artmoniya.com"];
for (const marker of prodMarkers) {
  if (source.toLowerCase().includes(marker.toLowerCase())) {
    // Allow comments that mention production backup refs in unrelated keys only if
    // the live runtime URLs are not production. Double-check runtime keys below.
  }
}

function get(key) {
  const match = source.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const runtimeBlob = [
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("DATABASE_URL"),
  get("DIRECT_URL"),
  get("NEXT_PUBLIC_APP_URL"),
].join("\n");

for (const marker of prodMarkers) {
  if (runtimeBlob.toLowerCase().includes(marker.toLowerCase())) {
    console.error(`Refusing: .env.local runtime points at production (${marker}).`);
    process.exit(1);
  }
}

const appUrl = get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

/** Ensure Supabase pooler URLs work with pg 8.16+ on Vercel/Node 24. */
function hardenDbUrl(value) {
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "require");
    if (!parsed.searchParams.has("uselibpqcompat")) parsed.searchParams.set("uselibpqcompat", "true");
    return parsed.toString();
  } catch {
    return value;
  }
}

const stagingAppUrl =
  process.env.STAGING_APP_URL ||
  (appUrl.includes("localhost") ? "https://artmonia-erp-test.vercel.app" : appUrl);

const lines = [
  "# Auto-generated for Vercel/staging. DO NOT COMMIT. DO NOT point at production.",
  "# Regenerate: npm run env:prepare-staging",
  "APP_ENV=staging",
  "ALLOW_DEMO_SEED=true",
  "# Do NOT set NODE_ENV on Vercel — it skips Tailwind/PostCSS install during npm ci.",
  `NEXT_PUBLIC_APP_URL=${stagingAppUrl}`,
  "CLOUDFLARE_PREVIEW=false",
  "",
  `NEXT_PUBLIC_SUPABASE_URL=${get("NEXT_PUBLIC_SUPABASE_URL")}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")}`,
  `SUPABASE_SECRET_KEY=${get("SUPABASE_SECRET_KEY")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${get("SUPABASE_SERVICE_ROLE_KEY")}`,
  `DATABASE_URL=${hardenDbUrl(get("DATABASE_URL"))}`,
  `DIRECT_URL=${hardenDbUrl(get("DIRECT_URL"))}`,
  "",
  `# Optional — copy from .env.local if you need these on staging`,
  `CLOUDFLARE_R2_ACCOUNT_ID=${get("CLOUDFLARE_R2_ACCOUNT_ID")}`,
  `CLOUDFLARE_R2_ACCESS_KEY_ID=${get("CLOUDFLARE_R2_ACCESS_KEY_ID")}`,
  `CLOUDFLARE_R2_SECRET_ACCESS_KEY=${get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")}`,
  `CLOUDFLARE_R2_HR_BUCKET=${get("CLOUDFLARE_R2_HR_BUCKET")}`,
  `CRON_SECRET=${get("CRON_SECRET")}`,
  `EXPORT_SIGNING_SECRET=${get("EXPORT_SIGNING_SECRET")}`,
  `GOOGLE_GENERATIVE_AI_API_KEY=${get("GOOGLE_GENERATIVE_AI_API_KEY")}`,
  `OPENROUTER_API_KEY=${get("OPENROUTER_API_KEY")}`,
  "",
  "# Intentionally omitted on staging unless you need them:",
  "# META_*, INSTAGRAM_*, MCP_*, BACKUP_*, MOBILE_*",
];

writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf8");
console.log("Wrote .env.staging from .env.local (gitignored).");

const check = spawnSync(process.execPath, ["scripts/assert-staging-env.mjs", "--file", ".env.staging"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
process.exit(check.status ?? 1);
