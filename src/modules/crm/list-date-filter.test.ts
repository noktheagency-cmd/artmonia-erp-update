import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmListDateSql } from "./list-date-filter-sql";
import {
  clearCrmListDateParams,
  crmListDateError,
  crmListMonthDates,
  crmListNextWeekDates,
  resolveCrmListDateFilter,
} from "./list-date-filter";

const now = new Date("2026-10-25T09:00:00Z");

test("the initial date controls show the full current Baku month", () => {
  const filter = resolveCrmListDateFilter({}, crmListMonthDates(0, now));
  assert.equal(filter.field, "created");
  assert.equal(filter.from, "2026-10-01");
  assert.equal(filter.to, "2026-10-31");
  // No explicit filter means existing stage-card and attention scopes are retained.
  assert.equal(buildCrmListDateSql(filter), null);
});

test("future meeting plans filter by planned date without intersecting the lead's creation month", () => {
  const filter = resolveCrmListDateFilter({ listDateBy: "planned", listFrom: "2026-11-01", listTo: "2026-11-30" });
  const sql = buildCrmListDateSql(filter)!;
  assert.match(sql.sql, /l\.next_follow_up_at >=/);
  assert.match(sql.sql, /l\.next_follow_up_at </);
  assert.doesNotMatch(sql.sql, /created_at|priority|\bor\b/i);
  assert.deepEqual(sql.values, [new Date("2026-10-31T20:00:00Z"), new Date("2026-11-30T20:00:00Z")]);
});

test("created-date selection uses the same inclusive Baku day boundaries", () => {
  const sql = buildCrmListDateSql(resolveCrmListDateFilter({
    listDateBy: "created", listFrom: "2026-10-25", listTo: "2026-10-25",
  }))!;
  assert.match(sql.sql, /l\.created_at/);
  assert.doesNotMatch(sql.sql, /next_follow_up_at|priority/);
  assert.deepEqual(sql.values, [new Date("2026-10-24T20:00:00Z"), new Date("2026-10-25T20:00:00Z")]);
});

test("invalid and reversed URL ranges cannot silently return an unfiltered list", () => {
  for (const input of [
    { listFrom: "2026-09-31" },
    { listFrom: "bad" },
    { listFrom: "2026-11-30", listTo: "2026-11-01" },
    { listDateBy: "l.created_at; drop table" },
  ]) {
    const filter = resolveCrmListDateFilter(input);
    assert.ok(filter.error);
    assert.equal(buildCrmListDateSql(filter)!.sql, "false");
  }
});

test("all dates and open-ended ranges are intentional selections", () => {
  const all = buildCrmListDateSql(resolveCrmListDateFilter({ listDateBy: "created" }))!;
  assert.deepEqual(all.values, []);
  assert.equal(all.sql, "(true)");
  const planned = buildCrmListDateSql(resolveCrmListDateFilter({ listDateBy: "planned", listFrom: "2026-11-01" }))!;
  assert.match(planned.sql, /is not null/);
  assert.equal(planned.values.length, 1);
  assert.equal(crmListDateError("", "2026-11-30"), "");
});

test("month shortcuts follow Baku midnight and the new year", () => {
  assert.deepEqual(crmListMonthDates(0, new Date("2026-10-31T20:00:00Z")), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(crmListMonthDates(1, new Date("2026-12-15T08:00:00Z")), { from: "2027-01-01", to: "2027-01-31" });
  assert.deepEqual(crmListMonthDates(1, new Date("2028-01-15T08:00:00Z")), { from: "2028-02-01", to: "2028-02-29" });
});

test("next week's plans cover Monday through Sunday even across months", () => {
  assert.deepEqual(crmListNextWeekDates(now), { from: "2026-10-26", to: "2026-11-01" });
  assert.deepEqual(crmListNextWeekDates(new Date("2026-10-26T08:00:00Z")), { from: "2026-11-02", to: "2026-11-08" });
});

test("stage-card drill-downs clear table date restrictions and retain other filters", () => {
  const params = new URLSearchParams("listDateBy=planned&listFrom=2026-11-01&listTo=2026-11-30&stage=NEW&owner=manager");
  clearCrmListDateParams(params);
  assert.equal(params.get("owner"), "manager");
  assert.equal(params.get("stage"), "NEW");
  assert.equal(params.has("listDateBy"), false);
  assert.equal(params.has("listFrom"), false);
  assert.equal(params.has("listTo"), false);
});
