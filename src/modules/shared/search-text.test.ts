import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { normalizeAzerbaijaniSearch, escapeSearchLike } from "./search-text";
import { nameSearchSql } from "./search-sql";

test("Azerbaijani search accepts keyboard variants, case and repeated whitespace", () => {
  assert.equal(normalizeAzerbaijaniSearch("  GÜLAY   KƏRİMZADƏ "), "gulay kerimzade");
  assert.equal(normalizeAzerbaijaniSearch("İŞLƏYİR"), normalizeAzerbaijaniSearch("isleyir"));
});
test("name search requires all tokens, binds input and treats SQL wildcards literally", () => {
  const sql = nameSearchSql(Prisma.sql`c.full_name`, "Kərimzadə Gülay%_");
  assert.match(sql.sql, / AND /);
  assert.ok(sql.values.includes("%kerimzade%"));
  assert.ok(sql.values.includes("%gulay\\%\\_%"));
  assert.equal(escapeSearchLike("a\\%_"), "a\\\\\\%\\_");
  assert.equal(nameSearchSql(Prisma.sql`c.full_name`, " ").sql, "false");
});
