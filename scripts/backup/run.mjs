import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  S3Client, HeadBucketCommand, HeadObjectCommand, GetObjectCommand,
  ListObjectsV2Command, PutObjectCommand, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import pg from "pg";
import {
  SNAPSHOT_ROOT, RETENTION_DAYS, readConfig, snapshotPrefix, retentionKeys,
  hashFile, hashStream, inventoryDigest, publishSnapshot, objectDownloadUrl,
} from "./core.mjs";

const PAGE_SIZE = 250;
// PostgreSQL major matches Artmonia's PostgreSQL 17. Tools run inside this image;
// no application dependency or live database schema is changed.
const POSTGRES_IMAGE = "postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826";
let stage = "configuration";
const config = readConfig(process.env);
const directory = await mkdtemp(join(tmpdir(), "artmonia-backup-"));
const payload = join(directory, "payload");
const startedAt = new Date();
const prefix = snapshotPrefix(config.projectRef, startedAt, randomBytes(16).toString("hex"));
const clients = [];

function s3(credentials) {
  const client = new S3Client({
    region: "auto", endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 3,
  });
  clients.push(client);
  return client;
}

// Never expose raw SQL, HTTP bodies, object names, credentials, or subprocess stderr
// in GitHub logs. The failed stage and exit status are enough for the first diagnosis.
async function command(executable, args, env = {}) {
  await new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "ignore"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Backup subprocess timed out")); }, 25 * 60_000);
    child.on("error", () => { clearTimeout(timer); reject(new Error(`Unable to start ${executable}`)); });
    child.on("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolveCommand(); else reject(new Error(`${executable} exited with status ${code}`));
    });
  });
}

async function postgres(args) {
  await command("docker", ["run", "--rm", "--volume", `${directory}:/backup`,
    ...["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGSSLROOTCERT", "PGCONNECT_TIMEOUT"].flatMap(name => ["--env", name]),
    POSTGRES_IMAGE, ...args], {
    PGHOST: config.db.host, PGPORT: String(config.db.port), PGDATABASE: config.db.database,
    PGUSER: config.db.user, PGPASSWORD: config.db.password,
    PGSSLMODE: "verify-full", PGSSLROOTCERT: "/backup/ca.crt", PGCONNECT_TIMEOUT: "30",
  });
}

async function storageInventory(client) {
  const result = [];
  let after = null;
  for (;;) {
    const page = await client.query(
      `select id::text, bucket_id, name, updated_at::text, metadata
       from storage.objects where ($1::uuid is null or id > $1::uuid) order by id limit $2`, [after, PAGE_SIZE]);
    result.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return result;
    after = page.rows.at(-1).id;
  }
}

async function listR2(client, bucket, objectPrefix = "") {
  const objects = [];
  let token;
  for (;;) {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: objectPrefix, ContinuationToken: token }));
    objects.push(...(page.Contents ?? []));
    if (!page.IsTruncated) return objects;
    if (!page.NextContinuationToken || page.NextContinuationToken === token) throw new Error("R2 pagination did not advance");
    token = page.NextContinuationToken;
  }
}

async function copyStream(stream, destination) {
  // Hash while streaming; complete files never have to fit in runner memory.
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(stream, new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length; hash.update(chunk); callback(null, chunk);
  } }), createWriteStream(destination, { flags: "wx", mode: 0o600 }));
  return { bytes, sha256: hash.digest("hex") };
}

async function downloadSupabase(object, destination) {
  const response = await fetch(objectDownloadUrl(config.supabaseUrl, object.bucket_id, object.name), {
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
    redirect: "error", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error(`Storage download failed with HTTP ${response.status}`);
  const content = await copyStream(Readable.fromWeb(response.body), destination);
  const expected = object.metadata?.size;
  if (expected !== undefined && Number(expected) !== content.bytes) throw new Error("Storage file size changed during backup");
  return content;
}

let database;
try {
  await mkdir(join(payload, "objects"), { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "ca.crt"), config.ca, { mode: 0o600 });
  stage = "R2 access";
  const destination = s3(config);
  await destination.send(new HeadBucketCommand({ Bucket: config.bucket }));

  stage = "database snapshot";
  database = new pg.Client({ ...config.db, ssl: { ca: config.ca, rejectUnauthorized: true }, connectionTimeoutMillis: 30_000 });
  database.on("error", () => {}); // The next query still fails; do not log driver errors containing private context.
  await database.connect();
  await database.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await database.query("SET LOCAL idle_in_transaction_session_timeout = 0");
  const snapshot = (await database.query("select pg_export_snapshot() as id, current_setting('server_version') as version")).rows[0];
  if (!snapshot.version.startsWith("17.")) throw new Error("Backup tools must be reviewed for the database's new major version");
  if (!/^[A-Fa-f0-9-]+$/.test(snapshot.id)) throw new Error("Invalid exported snapshot ID");
  const objects = await storageInventory(database);
  const buckets = (await database.query("select * from storage.buckets order by id")).rows;
  const tableInventory = (await database.query(
    `select n.nspname as schema, c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
     order by n.nspname,c.relname`)).rows;
  // A raw dump stores Vault ciphertext. Keep a separately age-protected export so
  // a different Supabase project's encryption root can recreate the same secrets.
  // These values stay only in the private temporary payload and encrypted archive.
  const vaultSecrets = (await database.query(
    "select id,name,description,decrypted_secret,created_at,updated_at from vault.decrypted_secrets order by id")).rows;
  await writeFile(join(payload, "vault-secrets.json"), JSON.stringify(vaultSecrets), { mode: 0o600 });

  stage = "full database export";
  // No schema/table exclusion: ERP, Auth, Storage metadata, migrations and other
  // database schemas are included in one consistent logical database archive.
  await postgres(["pg_dump", "--format=custom", "--compress=gzip:6", `--snapshot=${snapshot.id}`,
    "--file=/backup/payload/database.dump"]);
  await postgres(["pg_dumpall", "--roles-only", "--no-role-passwords", "--file=/backup/payload/roles.sql"]);
  await postgres(["pg_restore", "--list", "--file=/backup/payload/database.toc", "/backup/payload/database.dump"]);
  const toc = await readFile(join(payload, "database.toc"), "utf8");
  for (const table of ["erp students", "erp invoices", "erp payments", "auth users", "auth identities", "storage objects", "storage buckets", "supabase_migrations schema_migrations"]) {
    if (!toc.includes(`TABLE DATA ${table} `)) throw new Error("A required table is missing from the database archive");
  }
  const databaseArchive = await hashFile(join(payload, "database.dump"));

  stage = "complete Supabase file export";
  const files = [];
  for (const object of objects) {
    const path = `objects/${String(files.length).padStart(10, "0")}.bin`;
    const content = await downloadSupabase(object, join(payload, path));
    files.push({ provider: "supabase", bucket: object.bucket_id, key: object.name, path,
      contentType: object.metadata?.mimetype ?? "application/octet-stream", updatedAt: object.updated_at, ...content });
  }
  await database.query("COMMIT");
  // A separate statement after COMMIT sees current metadata, rather than the dump's
  // old snapshot. Never certify a file backup whose source changed while reading.
  if (inventoryDigest(objects) !== inventoryDigest(await storageInventory(database))) {
    throw new Error("Supabase files changed during backup; rerun the complete backup");
  }

  stage = "complete source R2 file export";
  if (config.sourceR2) {
    const source = s3(config.sourceR2);
    for (const bucket of config.sourceR2.buckets) {
      const inventory = await listR2(source, bucket);
      for (const object of inventory) {
        const path = `objects/${String(files.length).padStart(10, "0")}.bin`;
        const response = await source.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key, IfMatch: object.ETag }));
        if (!response.Body) throw new Error("Source R2 file has no body");
        const content = await copyStream(response.Body, join(payload, path));
        if (content.bytes !== object.Size) throw new Error("Source R2 file size changed");
        files.push({ provider: "r2", accountId: config.sourceR2.accountId, bucket, key: object.Key, path,
          contentType: response.ContentType ?? "application/octet-stream", etag: object.ETag, ...content });
      }
      const describe = entries => entries.map(object => [object.Key, object.Size, object.ETag]);
      if (inventoryDigest(describe(inventory)) !== inventoryDigest(describe(await listR2(source, bucket)))) {
        throw new Error("Source R2 files changed during backup; rerun the complete backup");
      }
    }
  }

  stage = "manifest and recovery sources";
  // Migration sources are kept as recovery references. Replaying all data-repair
  // migrations on restored data is never part of the automatic backup.
  await mkdir(join(payload, "recovery"));
  for (const name of ["prisma", "supabase"]) {
    await command("tar", ["-czf", join(payload, "recovery", `${name}-migrations.tar.gz`), `${name}/migrations`]);
  }
  const auxiliary = [];
  for (const path of ["roles.sql", "database.toc", "vault-secrets.json", "recovery/prisma-migrations.tar.gz", "recovery/supabase-migrations.tar.gz"]) {
    auxiliary.push({ path, ...await hashFile(join(payload, path)) });
  }
  await writeFile(join(payload, "manifest.json"), JSON.stringify({
    format: "artmonia-full-backup-v1", projectRef: config.projectRef, startedAt: startedAt.toISOString(),
    capturedAt: new Date().toISOString(), postgresVersion: snapshot.version, sourceCommit: process.env.GITHUB_SHA ?? null,
    database: { path: "database.dump", ...databaseArchive, tables: tableInventory }, buckets, files, auxiliary,
    sourceR2Buckets: config.sourceR2?.buckets ?? [],
    notes: ["PostgreSQL logical dump; platform settings and database encryption root keys require separate recovery configuration.",
      "Database snapshot and object stores do not provide a cross-service atomic snapshot. Object metadata stability is checked."],
  }, null, 2), { mode: 0o600 });
  await command("tar", ["-czf", join(directory, "snapshot.tar.gz"), "-C", payload, "."]);
  stage = "age encryption";
  const encrypted = join(directory, "snapshot.tar.gz.age");
  await command("age", ["--encrypt", "--recipient", config.recipient, "--output", encrypted, join(directory, "snapshot.tar.gz")]);
  const checksum = await hashFile(encrypted);
  // Single PUT supports up to 5 GiB. Fail clearly rather than silently omitting files.
  if (checksum.bytes >= 5 * 1024 ** 3) throw new Error("Encrypted backup exceeds the single-upload limit; multipart upload is required");
  const key = `${prefix}snapshot.tar.gz.age`;
  await publishSnapshot({
    upload: async () => {
      stage = "encrypted R2 upload";
      await destination.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: createReadStream(encrypted),
        ContentLength: checksum.bytes, ContentType: "application/octet-stream", Metadata: { sha256: checksum.sha256 } }));
    },
    verify: async () => {
      stage = "R2 read-back verification";
      const head = await destination.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      if (head.ContentLength !== checksum.bytes || head.Metadata?.sha256 !== checksum.sha256) throw new Error("Uploaded backup metadata mismatch");
      const uploaded = await destination.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!uploaded.Body) throw new Error("Uploaded backup has no body");
      const actual = await hashStream(uploaded.Body);
      if (actual.sha256 !== checksum.sha256 || actual.bytes !== checksum.bytes) throw new Error("Uploaded backup checksum mismatch");
    },
    complete: async () => {
      stage = "completion marker";
      await destination.send(new PutObjectCommand({ Bucket: config.bucket, Key: `${prefix}complete.json`, ContentType: "application/json",
        Body: JSON.stringify({ format: "artmonia-full-backup-v1", projectRef: config.projectRef, key,
          startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), ...checksum, retentionDays: RETENTION_DAYS }) }));
    },
    prune: async () => {
      stage = "30-day retention";
      const expired = retentionKeys(await listR2(destination, config.bucket, `${SNAPSHOT_ROOT}/${config.projectRef}/`), config.projectRef, startedAt, prefix);
      for (let index = 0; index < expired.length; index += 1000) {
        const deleted = await destination.send(new DeleteObjectsCommand({ Bucket: config.bucket,
          Delete: { Objects: expired.slice(index, index + 1000).map(Key => ({ Key })), Quiet: true } }));
        if (deleted.Errors?.length) throw new Error("Expired backup deletion failed");
      }
    },
  });
  console.log(`Verified encrypted full backup completed; ${files.length} files; ${checksum.bytes} encrypted bytes; retention ${RETENTION_DAYS} days.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `Full backup verified in R2.\n\n- Snapshot: \`${prefix}\`\n- Files: ${files.length}\n- Retention: ${RETENTION_DAYS} days\n`);
  }
} catch (error) {
  // Raw errors can include object paths, database URLs or row data.
  console.error(`Full backup failed during: ${stage}. No successful backup is reported for this run.`);
  if (error instanceof Error && /^(Missing |Invalid |Backup requires|Database connection does not|Supabase URL does not)/.test(error.message)) {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  if (database) await database.end().catch(() => {});
  clients.forEach(client => client.destroy());
  // Only delete the exact temporary directory created by this process.
  if (resolve(dirname(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("artmonia-backup-")) {
    throw new Error("Refusing unsafe temporary-directory cleanup");
  }
  await rm(directory, { recursive: true, force: true });
}
