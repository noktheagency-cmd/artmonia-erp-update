import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import dotenv from "dotenv";
import { databaseConfig, supabaseStorageHeaders } from "./core.mjs";

const repository = "noktheagency-cmd/artmonia-erp";
const [keygen, identity, certificate, envFile = ".env.local"] = process.argv.slice(2);

function gh(args, input) {
  const result = spawnSync("gh", args, { input, encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error("GitHub configuration failed; check CLI authentication/network access");
  return result.stdout;
}

try {
  if (!keygen || !identity || !certificate || !existsSync(identity)) {
    throw new Error("Usage: node scripts/backup/configure-github.mjs <age-keygen-path> <existing-private-identity-path> <ca-certificate-path> [local-env-path]");
  }
  const source = dotenv.parse(readFileSync(envFile));
  const projectRef = "azhriwieowdeuvbqjqvl";
  if (source.SUPABASE_PROJECT_ID !== projectRef || source.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`) {
    throw new Error("Local Supabase configuration does not match Artmonia");
  }
  databaseConfig(source.DIRECT_URL, projectRef);
  const ca = readFileSync(certificate, "utf8");
  if (!new X509Certificate(ca).ca) throw new Error("The supplied certificate is not a CA certificate");
  if (!source.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local Supabase service role key");
  supabaseStorageHeaders(source.SUPABASE_SERVICE_ROLE_KEY, projectRef);
  const publicKey = spawnSync(keygen, ["-y", identity], { encoding: "utf8", timeout: 10_000 });
  const recipient = publicKey.stdout?.trim();
  if (publicKey.status !== 0 || !/^age1[0-9a-z]{58}$/.test(recipient)) throw new Error("Unable to read the public age recipient");
  const variables = JSON.parse(gh(["variable", "list", "--repo", repository, "--json", "name,value"]));
  const previous = variables.find(variable => variable.name === "BACKUP_AGE_RECIPIENT")?.value;
  if (previous && previous !== recipient) throw new Error("Refusing to replace an existing encryption recipient");
  const existing = new Set(JSON.parse(gh(["secret", "list", "--repo", repository, "--json", "name"])).map(secret => secret.name));
  for (const [name, value] of Object.entries({
    BACKUP_DB_URL: source.DIRECT_URL, BACKUP_DB_CA_CERT: ca, BACKUP_SUPABASE_SERVICE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
  })) {
    if (!existing.has(name)) gh(["secret", "set", name, "--repo", repository], value);
    console.log(`${name}: configured`);
  }
  gh(["variable", "set", "BACKUP_AGE_RECIPIENT", "--repo", repository, "--body", recipient]);
  console.log("Public age recipient configured. The private identity was not uploaded.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
