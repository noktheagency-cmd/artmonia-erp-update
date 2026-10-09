import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  databaseConfig, readConfig, snapshotPrefix, snapshotKeyTime, retentionKeys,
  hashStream, publishSnapshot, objectDownloadUrl, hashFile, verifyPayload, supabaseStorageHeaders,
} from "./core.mjs";

const ref = "azhriwieowdeuvbqjqvl";
const random = "a".repeat(32);
const now = new Date("2026-10-10T23:17:00Z");
const prefix = snapshotPrefix(ref, now, random);
const config = {
  BACKUP_PROJECT_REF: ref, BACKUP_SUPABASE_URL: `https://${ref}.supabase.co`,
  BACKUP_DB_URL: `postgresql://postgres.${ref}:synthetic%23password@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?schema=erp&options=-c%20search_path%3Derp`,
  BACKUP_DB_CA_CERT: "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----",
  BACKUP_SUPABASE_SERVICE_KEY: "sb_secret_synthetic_backup_key_1234",
  BACKUP_R2_ACCOUNT_ID: "b".repeat(32), BACKUP_R2_BUCKET: "artmonia-backups",
  BACKUP_R2_ACCESS_KEY_ID: "synthetic-access", BACKUP_R2_SECRET_ACCESS_KEY: "synthetic-secret",
  BACKUP_AGE_RECIPIENT: `age1${"q".repeat(58)}`,
};

test("Storage backup requires an elevated project key and supports modern API headers", () => {
  const token = claims => `synthetic.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  const elevated = token({ role: "service_role", ref });
  assert.deepEqual(supabaseStorageHeaders(elevated, ref), { apikey: elevated, Authorization: `Bearer ${elevated}` });
  assert.deepEqual(readConfig(config).storageHeaders, { apikey: config.BACKUP_SUPABASE_SERVICE_KEY });
  for (const key of [token({ role: "anon", ref }), token({ role: "authenticated", ref }),
    token({ role: "service_role", ref: "z".repeat(20) }), token({ role: "service_role", ref, exp: 1 }),
    "sb_publishable_synthetic_public_1234", "synthetic.e30.signature", "invalid-key"]) {
    assert.throws(() => readConfig({ ...config, BACKUP_SUPABASE_SERVICE_KEY: key }), /Invalid BACKUP_SUPABASE_SERVICE_KEY/);
  }
});

test("backup URL removes Prisma parameters and verifies the project/session port", () => {
  const db = databaseConfig(config.BACKUP_DB_URL, ref);
  assert.equal(db.password, "synthetic#password");
  assert.equal(db.port, 5432);
  assert.equal(db.database, "postgres");
  assert.equal("options" in db, false);
  for (const url of [
    config.BACKUP_DB_URL.replace(":5432", ":6543"),
    config.BACKUP_DB_URL.replace(`postgres.${ref}`, `postgres.${"z".repeat(20)}`),
    config.BACKUP_DB_URL.replace("aws-1-eu-central-1.pooler.supabase.com", "attacker.example"),
    config.BACKUP_DB_URL.replace("/postgres?", "/another?"),
  ]) assert.throws(() => databaseConfig(url, ref));
});

test("missing source credentials fail instead of silently skipping R2 files", () => {
  assert.equal(readConfig(config).sourceR2, undefined);
  assert.throws(() => readConfig({ ...config, BACKUP_SOURCE_R2_BUCKETS: "hr-documents" }), /Missing BACKUP_SOURCE_R2_ACCOUNT_ID/);
  const source = {
    BACKUP_SOURCE_R2_BUCKETS: "hr-documents", BACKUP_SOURCE_R2_ACCOUNT_ID: config.BACKUP_R2_ACCOUNT_ID,
    BACKUP_SOURCE_R2_ACCESS_KEY_ID: "source-access", BACKUP_SOURCE_R2_SECRET_ACCESS_KEY: "source-secret",
  };
  assert.deepEqual(readConfig({ ...config, ...source }).sourceR2.buckets, ["hr-documents"]);
  assert.throws(() => readConfig({ ...config, ...source, BACKUP_SOURCE_R2_BUCKETS: config.BACKUP_R2_BUCKET }), /cannot also be a source/);
  assert.throws(() => readConfig({ ...config, BACKUP_SUPABASE_URL: "https://attacker.example" }));
  assert.throws(() => readConfig({ ...config, BACKUP_DB_CA_CERT: "" }), /Missing/);
});

test("30-day retention deletes only this project's known expired backup keys", () => {
  const atCutoff = snapshotPrefix(ref, new Date(now.getTime() - 30 * 86_400_000), random);
  const retained = snapshotPrefix(ref, new Date(now.getTime() - 30 * 86_400_000 + 1000), random);
  const old = snapshotPrefix(ref, new Date("2026-08-01T00:00:00Z"), random);
  const foreign = old.replace(ref, "z".repeat(20));
  const keys = [atCutoff + "complete.json", old + "snapshot.tar.gz.age", retained + "snapshot.tar.gz.age",
    foreign + "complete.json", old + "other-document.pdf", prefix + "complete.json", "hr-employees/private.pdf",
    old.replace("2026-08-01", "2026-02-30") + "complete.json"];
  assert.deepEqual(retentionKeys(keys.map(Key => ({ Key })), ref, now, prefix), keys.slice(0, 2));
  assert.equal(snapshotKeyTime("unrelated", ref), null);
  assert.equal(snapshotKeyTime(keys.at(-1), ref), null);
});

test("same-second retries have separate snapshot keys", () => {
  assert.notEqual(prefix, snapshotPrefix(ref, now, "b".repeat(32)));
  assert.equal(snapshotKeyTime(prefix + "complete.json", ref).toISOString(), now.toISOString());
});

test("failed uploads or checksum verification never publish success or prune", async () => {
  for (const failingStage of ["upload", "verify", "complete"]) {
    const events = [];
    const operations = Object.fromEntries(["upload", "verify", "complete", "prune"].map(stage => [stage, async () => {
      events.push(stage);
      if (stage === failingStage) throw new Error("synthetic failure");
    }]));
    await assert.rejects(() => publishSnapshot(operations));
    assert.equal(events.includes("prune"), false);
    if (failingStage !== "complete") assert.equal(events.includes("complete"), false);
  }
  const events = [];
  await publishSnapshot(Object.fromEntries(["upload", "verify", "complete", "prune"].map(stage => [stage, async () => { events.push(stage); }])));
  assert.deepEqual(events, ["upload", "verify", "complete", "prune"]);
});

test("stream verification hashes all chunks and counts bytes", async () => {
  assert.deepEqual(await hashStream(Readable.from([Buffer.from("a"), Buffer.from("bc")])), {
    bytes: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  });
});

test("object URLs support UTF-8 and reject traversal and path ambiguity", () => {
  assert.equal(objectDownloadUrl("https://example.supabase.co", "private", "folder/şəkil #1.png"),
    "https://example.supabase.co/storage/v1/object/private/folder/%C5%9F%C9%99kil%20%231.png");
  for (const key of ["../secret", "a/../secret", "a/./secret", "a//b", "/a", "a\\b", ""]) {
    assert.throws(() => objectDownloadUrl("https://example.supabase.co", "private", key));
  }
});

test("decrypted payload verification rejects tampering, missing files and path escape", async () => {
  const directory = await mkdtemp(join(tmpdir(), "artmonia-backup-test-"));
  try {
    await mkdir(join(directory, "objects"));
    await writeFile(join(directory, "database.dump"), "PGDMP synthetic database");
    const path = "objects/0000000000.bin";
    await writeFile(join(directory, path), "synthetic private receipt");
    const manifest = { format: "artmonia-full-backup-v1", projectRef: ref, startedAt: now.toISOString(),
      database: { path: "database.dump", ...await hashFile(join(directory, "database.dump")) },
      files: [{ path, ...await hashFile(join(directory, path)) }] };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    assert.equal((await verifyPayload(directory)).files, 1);
    await writeFile(join(directory, path), "tampered private receipt");
    await assert.rejects(() => verifyPayload(directory), /checksum mismatch/);
    manifest.files[0].path = "../outside.bin";
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    await assert.rejects(() => verifyPayload(directory), /Invalid backup file path/);
    manifest.files[0].path = "objects/0000000001.bin";
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    await assert.rejects(() => verifyPayload(directory));
  } finally {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("artmonia-backup-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
