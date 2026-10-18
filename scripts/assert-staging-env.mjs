/**
 * Refuse to use / deploy staging tooling against production credentials.
 *
 * Usage:
 *   node scripts/assert-staging-env.mjs
 *   node scripts/assert-staging-env.mjs --file .env.staging
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROD_MARKERS = [
  "azhriwieowdeuvbqjqvl", // production Supabase project (backup / live ERP)
  "erp.artmoniya.com",
];

const fileArgIndex = process.argv.indexOf("--file");
const envFile =
  fileArgIndex >= 0
    ? process.argv[fileArgIndex + 1]
    : process.env.STAGING_ENV_FILE || ".env.staging";

const path = resolve(process.cwd(), envFile);
if (!existsSync(path)) {
  console.error(`Missing ${envFile}. Copy .env.staging.example → ${envFile} and fill Academy/staging values.`);
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const values = {};
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  values[key] = value;
}

const haystack = [
  values.NEXT_PUBLIC_SUPABASE_URL,
  values.DATABASE_URL,
  values.DIRECT_URL,
  values.NEXT_PUBLIC_APP_URL,
  values.BACKUP_SUPABASE_URL,
  values.BACKUP_PROJECT_REF,
  values.BACKUP_DB_URL,
].filter(Boolean).join("\n");

const hits = PROD_MARKERS.filter((marker) =>
  haystack.toLowerCase().includes(marker.toLowerCase()),
);

if (hits.length) {
  console.error("REFUSING staging deploy/env: production markers found:");
  for (const hit of hits) console.error(`  - ${hit}`);
  console.error("Use Academy/staging Supabase only. Production Railway stays untouched.");
  process.exit(1);
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
];
const missing = required.filter((key) => !values[key]);
if (missing.length) {
  console.error(`Staging env incomplete (${envFile}). Missing: ${missing.join(", ")}`);
  process.exit(1);
}

if (values.APP_ENV && values.APP_ENV !== "staging") {
  console.error(`APP_ENV must be "staging" in ${envFile} (got "${values.APP_ENV}").`);
  process.exit(1);
}

console.log(`Staging env OK (${envFile}). No production markers. Safe for Vercel Preview.`);
