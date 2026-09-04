import assert from "node:assert/strict";
import test from "node:test";
import { resolveMarketingDateRange } from "@/modules/marketing/date-range";

test("tarix verilmədikdə header kimi cari ayın tam intervalını qaytarır", () => {
  const range = resolveMarketingDateRange(undefined, new Date("2026-09-04T15:00:00.000Z"));

  assert.equal(range.from, "2026-09-01");
  assert.equal(range.to, "2026-09-30");
  assert.equal(range.days, 30);
  assert.equal(range.businessStart.toISOString(), "2026-08-31T20:00:00.000Z");
  assert.equal(range.businessEnd.toISOString(), "2026-09-30T20:00:00.000Z");
});

test("header intervalını sıralayır və son tarixi daxil edir", () => {
  const range = resolveMarketingDateRange({ from: "2026-09-04", to: "2026-08-04" });

  assert.equal(range.from, "2026-08-04");
  assert.equal(range.to, "2026-09-04");
  assert.equal(range.days, 32);
  assert.equal(range.rangeEndExclusive.toISOString(), "2026-09-05T00:00:00.000Z");
});

test("yanlış tarixləri cari ay intervalı ilə əvəz edir", () => {
  const range = resolveMarketingDateRange(
    { from: "2026-02-31", to: "wrong" },
    new Date("2026-02-12T10:00:00.000Z"),
  );

  assert.equal(range.from, "2026-02-01");
  assert.equal(range.to, "2026-02-28");
});
