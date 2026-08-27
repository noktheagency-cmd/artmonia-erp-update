import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationId = "20260827234526_sync_teacher_account_links";

test("teacher account backfill stays identical in Prisma and Supabase histories", async () => {
  const [prismaSql, supabaseSql] = await Promise.all([
    readFile(new URL(`./migrations/${migrationId}/migration.sql`, import.meta.url), "utf8"),
    readFile(new URL(`../supabase/migrations/${migrationId}.sql`, import.meta.url), "utf8"),
  ]);

  assert.equal(prismaSql, supabaseSql);
  assert.match(prismaSql, /teacher\.account\.link\.backfill/);
  assert.match(prismaSql, /role\.permission\.reconcile/);
  assert.match(prismaSql, /Teacher account link reconciliation did not converge/);
});
