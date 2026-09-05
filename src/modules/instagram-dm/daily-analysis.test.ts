import assert from "node:assert/strict";
import test from "node:test";
import { getDailyDmAnalysis } from "./daily-analysis";
import { aggregateConversationClassifications } from "./analytics-ai";

type Row = Record<string, unknown> & { id: string; startedAt: Date; snapshotDay: Date; periodFrom: Date; periodTo: Date; status: string };
function fakeDatabase() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown>): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "periodFrom_periodTo_snapshotDay") return matches(row, value as Record<string, unknown>);
    if (value && typeof value === "object" && "lte" in value) return (row[key] as Date) <= (value.lte as Date);
    return value instanceof Date ? (row[key] as Date)?.getTime() === value.getTime() : row[key] === value;
  });
  const db = { instagramDmDailyAnalysis: {
    async findUnique({ where }: { where: Record<string, unknown> }) { return rows.find((row) => matches(row, where)) ?? null; },
    async createMany({ data }: { data: Row[] }) {
      let count = 0;
      for (const entry of data) {
        const key = { periodFrom: entry.periodFrom, periodTo: entry.periodTo, snapshotDay: entry.snapshotDay };
        if (rows.some((row) => matches(row, key))) continue;
        rows.push({ ...entry, id: String(rows.length + 1) }); count++;
      }
      return { count };
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) {
      const matching = rows.filter((row) => matches(row, where));
      matching.forEach((row) => Object.assign(row, data));
      return { count: matching.length };
    },
    async findMany({ where }: { where: Record<string, unknown> }) { return rows.filter((row) => matches(row, where)).toReversed(); },
  } };
  return { db: db as unknown as NonNullable<Parameters<typeof getDailyDmAnalysis>[1]>, rows, raw: db };
}
const emptyAnalysis = aggregateConversationClassifications([], { responseRate: 0, medianFirstResponseMinutes: null });

test("paralel girişlər, refresh və proses cache-i olmadan gündə bir uğurlu analiz", async () => {
  const { db, rows } = fakeDatabase();
  let calls = 0;
  const input = {
    period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date("2026-09-05T10:00:00Z"),
    model: "test", metrics: { conversations: 153 },
    analyze: async () => { calls++; return { analysis: emptyAnalysis, classifications: [] }; },
  };
  await Promise.all([getDailyDmAnalysis(input, db), getDailyDmAnalysis(input, db)]);
  const repeated = await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T18:00:00Z") }, db);
  assert.equal(calls, 1);
  assert.equal(rows.length, 1);
  assert.equal(repeated.ai.state, "ready");
  const originalTimestamp = repeated.ai.generatedAt;
  const again = await getDailyDmAnalysis(input, db);
  assert.equal(again.ai.generatedAt, originalTimestamp);
  const tomorrow = await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T20:00:00Z") }, db);
  assert.equal(calls, 2);
  assert.equal(tomorrow.history.length, 2);
  assert.equal(tomorrow.snapshot?.day, "2026-09-06");
});

test("fərqli ay eyni gündə ayrı nəticə saxlayır", async () => {
  const { db, rows } = fakeDatabase();
  const input = { period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date("2026-09-05T10:00:00Z"), model: "test", metrics: {}, analyze: async () => ({ analysis: emptyAnalysis, classifications: [] }) };
  await getDailyDmAnalysis(input, db);
  const august = await getDailyDmAnalysis({ ...input, period: { from: "2026-08-01", to: "2026-08-31" } }, db);
  assert.equal(rows.length, 2);
  assert.equal(august.history.length, 1);
});

test("uğursuz cəhd cooldown-dan sonra yenilənir, uğurlu nəticə dəyişmir", async () => {
  const { db } = fakeDatabase();
  let calls = 0;
  const input = { period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date("2026-09-05T10:00:00Z"), model: "test", metrics: {}, analyze: async () => {
    calls++;
    if (calls === 1) throw { statusCode: 402 };
    return { analysis: emptyAnalysis, classifications: [] };
  } };
  const failed = await getDailyDmAnalysis(input, db);
  assert.equal(failed.ai.state, "unavailable");
  await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T10:05:00Z") }, db);
  assert.equal(calls, 1);
  const success = await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T10:16:00Z") }, db);
  assert.equal(success.ai.state, "ready");
  assert.equal(calls, 2);
});

test("konfiqurasiya olmadıqda gün tutulmur, sonradan açar əlavə edilə bilir", async () => {
  const { db, rows } = fakeDatabase();
  let calls = 0;
  const input = { period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date(), model: null, metrics: {}, analyze: async () => { calls++; return { analysis: null, classifications: [] }; } };
  await getDailyDmAnalysis(input, db);
  assert.equal(rows.length, 0);
  assert.equal(calls, 0);
  const ready = await getDailyDmAnalysis({ ...input, model: "test" }, db);
  assert.equal(ready.ai.state, "no_data");
  await getDailyDmAnalysis({ ...input, model: "test" }, db);
  assert.equal(calls, 1);
});

test("yeni versiya yalnız uğursuz nəticəni cooldown gözləmədən yeniləyir", async () => {
  const { db, rows } = fakeDatabase();
  let calls = 0;
  const input = { period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date("2026-09-05T10:00:00Z"), model: "test", metrics: {}, analyze: async () => {
    calls++;
    if (calls === 1) throw { statusCode: 400 };
    return { analysis: emptyAnalysis, classifications: [] };
  } };
  await getDailyDmAnalysis(input, db);
  rows[0].analysisVersion = "old-version";
  const fixed = await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T10:01:00Z") }, db);
  assert.equal(fixed.ai.state, "ready");
  rows[0].analysisVersion = "old-version";
  await getDailyDmAnalysis({ ...input, now: new Date("2026-09-05T10:02:00Z") }, db);
  assert.equal(calls, 2);
});

test("yaddaş işləməyəndə saxlanılmayan pullu AI analizi çağırılmır", async () => {
  const { db, raw } = fakeDatabase();
  raw.instagramDmDailyAnalysis.findUnique = async () => { throw new Error("storage unavailable"); };
  let calls = 0;
  const result = await getDailyDmAnalysis({ period: { from: "2026-09-01", to: "2026-09-30" }, now: new Date(), model: "test", metrics: {}, analyze: async () => { calls++; return { analysis: null, classifications: [] }; } }, db);
  assert.equal(result.ai.state, "unavailable");
  assert.equal(calls, 0);
});
