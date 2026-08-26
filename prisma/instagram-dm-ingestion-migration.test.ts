import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prismaMigration = new URL(
  "./migrations/20260826185121_instagram_dm_ingestion/migration.sql",
  import.meta.url,
);
const supabaseMigration = new URL(
  "../supabase/migrations/20260826185121_instagram_dm_ingestion.sql",
  import.meta.url,
);

test("Instagram DM Prisma və Supabase migration-ları eyni qalır", async () => {
  const [prismaSql, supabaseSql] = await Promise.all([
    readFile(prismaMigration, "utf8"),
    readFile(supabaseMigration, "utf8"),
  ]);
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();

  assert.equal(normalize(prismaSql), normalize(supabaseSql));
  assert.match(prismaSql, /CREATE TABLE "erp"\."instagram_dm_messages"/);
  assert.match(prismaSql, /instagram_dm_messages_meta_message_id_key/);
  assert.match(prismaSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(prismaSql, /FROM anon, authenticated/);
});
