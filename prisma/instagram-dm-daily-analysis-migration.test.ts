import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("gündəlik analiz migration-ları eynidir və gün/dövr üzrə unikaldır", async () => {
  const [prisma, supabase] = await Promise.all([
    readFile(new URL("./migrations/20260905134611_instagram_dm_daily_analysis/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260905134611_instagram_dm_daily_analysis.sql", import.meta.url), "utf8"),
  ]);
  assert.equal(prisma.trim(), supabase.trim());
  assert.match(prisma, /CREATE UNIQUE INDEX/);
  assert.match(prisma, /\("period_from", "period_to", "snapshot_day"\)/);
  assert.match(prisma, /ENABLE ROW LEVEL SECURITY/);
  assert.match(prisma, /FROM PUBLIC, anon, authenticated/);
});
