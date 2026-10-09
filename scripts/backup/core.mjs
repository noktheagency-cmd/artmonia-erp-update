import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const RETENTION_DAYS = 30;
export const SNAPSHOT_ROOT = "artmonia-backups/v1";
const DAY_MS = 86_400_000;
const RUN_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)_[a-f0-9]{32}$/;

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function readConfig(env) {
  const projectRef = required(env, "BACKUP_PROJECT_REF");
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Invalid BACKUP_PROJECT_REF");
  const supabaseUrl = new URL(required(env, "BACKUP_SUPABASE_URL"));
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${projectRef}.supabase.co` ||
      supabaseUrl.username || supabaseUrl.password || supabaseUrl.port ||
      supabaseUrl.pathname !== "/" || supabaseUrl.search || supabaseUrl.hash) {
    throw new Error("Supabase URL does not match the backup project");
  }
  const accountId = required(env, "BACKUP_R2_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error("Invalid BACKUP_R2_ACCOUNT_ID");
  const bucket = required(env, "BACKUP_R2_BUCKET");
  validateBucket(bucket);
  const recipient = required(env, "BACKUP_AGE_RECIPIENT");
  if (!/^age1[0-9a-z]{58}$/.test(recipient)) throw new Error("Invalid BACKUP_AGE_RECIPIENT");
  const ca = required(env, "BACKUP_DB_CA_CERT");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("BACKUP_DB_CA_CERT must contain the downloaded Supabase CA certificate");
  }
  const db = databaseConfig(required(env, "BACKUP_DB_URL"), projectRef);
  const storageHeaders = supabaseStorageHeaders(required(env, "BACKUP_SUPABASE_SERVICE_KEY"), projectRef);
  const sourceBuckets = [...new Set((env.BACKUP_SOURCE_R2_BUCKETS ?? "").split(",").map(x => x.trim()).filter(Boolean))];
  let sourceR2;
  const sourceNames = ["BACKUP_SOURCE_R2_ACCOUNT_ID", "BACKUP_SOURCE_R2_ACCESS_KEY_ID", "BACKUP_SOURCE_R2_SECRET_ACCESS_KEY"];
  if (sourceBuckets.length || sourceNames.some(name => env[name]?.trim())) {
    if (!sourceBuckets.length) throw new Error("Source R2 credentials require BACKUP_SOURCE_R2_BUCKETS");
    const sourceAccountId = required(env, sourceNames[0]);
    if (!/^[a-f0-9]{32}$/.test(sourceAccountId)) throw new Error("Invalid source R2 account ID");
    sourceBuckets.forEach(validateBucket);
    if (sourceAccountId === accountId && sourceBuckets.includes(bucket)) {
      throw new Error("The backup bucket cannot also be a source bucket");
    }
    sourceR2 = { accountId: sourceAccountId, buckets: sourceBuckets,
      accessKeyId: required(env, sourceNames[1]), secretAccessKey: required(env, sourceNames[2]) };
  }
  return {
    projectRef, supabaseUrl: supabaseUrl.origin, db, ca, recipient, bucket, accountId,
    storageHeaders,
    accessKeyId: required(env, "BACKUP_R2_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "BACKUP_R2_SECRET_ACCESS_KEY"), sourceR2,
  };
}

// This is a configuration check; Supabase still authenticates every request.
// A variable named SERVICE_KEY can contain an anon JWT, so inspect its role/ref.
// Modern secret keys belong only in apikey, not in a JWT Authorization header.
export function supabaseStorageHeaders(key, projectRef) {
  const invalid = () => new Error("Invalid BACKUP_SUPABASE_SERVICE_KEY: requires a Supabase secret or service_role key for this project");
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) return { apikey: key };
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw invalid();
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); }
  catch { throw invalid(); }
  if (claims?.role !== "service_role" || claims.ref !== projectRef ||
      (typeof claims.exp === "number" && claims.exp <= Math.floor(Date.now() / 1000))) throw invalid();
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function validateBucket(bucket) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid R2 bucket name");
}

export function databaseConfig(connectionString, projectRef) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("Invalid BACKUP_DB_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password || url.hash) {
    throw new Error("Invalid BACKUP_DB_URL");
  }
  const isPooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  const isDirect = url.hostname === `db.${projectRef}.supabase.co`;
  if ((!isDirect && !isPooler) || (url.port && url.port !== "5432") || url.pathname !== "/postgres") {
    throw new Error("Backup requires the project's direct connection or session pooler on port 5432");
  }
  const user = decodeURIComponent(url.username);
  if ((isPooler && user !== `postgres.${projectRef}`) || (isDirect && user !== "postgres")) {
    throw new Error("Database connection does not match the backup project");
  }
  // Prisma's schema/pgbouncer/options parameters are intentionally not passed to libpq.
  return { host: url.hostname, port: 5432, database: "postgres", user, password: decodeURIComponent(url.password) };
}

export function snapshotPrefix(projectRef, now, randomId) {
  if (!/^[a-z]{20}$/.test(projectRef) || !/^[a-f0-9]{32}$/.test(randomId)) throw new Error("Invalid snapshot identity");
  return `${SNAPSHOT_ROOT}/${projectRef}/${now.toISOString().slice(0, 19).replaceAll(":", "-")}Z_${randomId}/`;
}

export function snapshotKeyTime(key, projectRef) {
  const root = `${SNAPSHOT_ROOT}/${projectRef}/`;
  if (!key.startsWith(root)) return null;
  const parts = key.slice(root.length).split("/");
  if (parts.length !== 2 || !["snapshot.tar.gz.age", "complete.json"].includes(parts[1])) return null;
  const match = RUN_PATTERN.exec(parts[0]);
  if (!match) return null;
  const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z");
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) + "Z" !== iso) return null;
  return date;
}

export function retentionKeys(objects, projectRef, now, currentPrefix) {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  return objects.filter(object => {
    const date = snapshotKeyTime(object.Key ?? "", projectRef);
    return date && date.getTime() <= cutoff && !object.Key.startsWith(currentPrefix);
  }).map(object => object.Key);
}

export async function hashStream(stream) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), bytes };
}

export function hashFile(path) { return hashStream(createReadStream(path)); }
export function inventoryDigest(rows) { return createHash("sha256").update(JSON.stringify(rows)).digest("hex"); }

// Publishing a completion marker and deleting expired snapshots are forbidden until
// a read-back of the uploaded ciphertext confirms its complete checksum and length.
export async function publishSnapshot({ upload, verify, complete, prune }) {
  await upload();
  await verify();
  await complete();
  await prune();
}

export function objectDownloadUrl(base, bucket, key) {
  if (!bucket || !key || key.split("/").some(segment => !segment || segment === "." || segment === "..") || key.includes("\\")) {
    throw new Error("Invalid Supabase object path");
  }
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function verifyPayload(directory) {
  const root = await realpath(directory);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.format !== "artmonia-full-backup-v1" || !Array.isArray(manifest.files) ||
      manifest.database?.path !== "database.dump") throw new Error("Invalid backup manifest");
  const paths = new Set();
  const auxiliary = manifest.auxiliary ?? [];
  if (!Array.isArray(auxiliary)) throw new Error("Invalid backup manifest");
  for (const entry of [manifest.database, ...manifest.files, ...auxiliary]) {
    const validFile = /^objects\/[0-9]{10}\.bin$/.test(entry.path);
    const validAuxiliary = ["roles.sql", "database.toc", "vault-secrets.json", "recovery/prisma-migrations.tar.gz", "recovery/supabase-migrations.tar.gz"].includes(entry.path);
    if (entry !== manifest.database && !(manifest.files.includes(entry) ? validFile : validAuxiliary)) throw new Error("Invalid backup file path");
    if (paths.has(entry.path)) throw new Error("Duplicate backup file path");
    paths.add(entry.path);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error("Invalid backup file checksum");
    }
    const file = join(root, entry.path);
    const resolved = await realpath(file);
    const rel = relative(root, resolved);
    if (rel === ".." || rel.startsWith(`..${sep}`) || !(await lstat(file)).isFile()) throw new Error("Backup file escapes its directory");
    const actual = await hashFile(file);
    if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) throw new Error("Backup payload checksum mismatch");
  }
  const objects = await readdir(join(root, "objects"));
  if (objects.length !== manifest.files.length || objects.some(name => !paths.has(`objects/${name}`))) {
    throw new Error("Backup file inventory mismatch");
  }
  return { projectRef: manifest.projectRef, startedAt: manifest.startedAt, files: manifest.files.length, databaseBytes: manifest.database.bytes };
}
