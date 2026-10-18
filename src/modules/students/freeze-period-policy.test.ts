import test from "node:test";
import assert from "node:assert/strict";
import {
  assessFrozenInvoice,
  freezePeriodSchema,
} from "./freeze-period-policy";
const base = {
  periodMonth: "2026-08-01",
  anchorDate: "2026-06-04",
  startDate: "2026-08-04",
  endDate: "2026-09-04",
  today: "2026-09-07",
  amount: 200,
  balance: 200,
  allocated: 0,
  status: "OVERDUE",
};
test("BK-10: overlapping unpaid cycles are kept — never voided", () => {
  const result = assessFrozenInvoice(base);
  assert.equal(result.decision, "KEEP");
  assert.equal(result.overlaps, true);
  assert.match(result.reason, /BK-10/);
  assert.equal(
    assessFrozenInvoice({
      ...base,
      startDate: "2026-08-01",
      endDate: "2026-09-01",
    }).decision,
    "KEEP",
  );
  assert.equal(
    assessFrozenInvoice({ ...base, startDate: "2026-08-05" }).decision,
    "KEEP",
  );
});
test("BK-10: paid and partial invoices also keep billing", () => {
  for (const change of [
    { allocated: 100, balance: 100 },
    { allocated: 200, balance: 0, status: "PAID" },
    { balance: 50 },
  ]) {
    assert.equal(
      assessFrozenInvoice({ ...base, ...change }).decision,
      "KEEP",
    );
  }
  assert.equal(
    assessFrozenInvoice({ ...base, status: "VOID", balance: 0 }).decision,
    "KEEP",
  );
});
test("return day is exclusive and January 31 anchor does not drift", () => {
  const result = assessFrozenInvoice({
    ...base,
    anchorDate: "2026-01-31",
    periodMonth: "2026-02-01",
    startDate: "2026-02-28",
    endDate: "2026-03-31",
  });
  assert.equal(result.cycleEnd, "2026-03-31");
  assert.equal(result.decision, "KEEP");
  assert.equal(
    assessFrozenInvoice({
      ...base,
      endDate: "2026-08-04",
      startDate: "2026-07-04",
    }).overlaps,
    false,
  );
});
test("open freeze still keeps cycles — billing continues", () => {
  assert.equal(assessFrozenInvoice({ ...base, endDate: "" }).decision, "KEEP");
  assert.equal(
    assessFrozenInvoice({ ...base, endDate: "", today: "2026-08-20" }).decision,
    "KEEP",
  );
});
test("reject invalid, reversed, future dates and empty reason", () => {
  const input = {
    studentId: "966844cb-800a-4a5e-9510-8288567c1e76",
    requestId: "966844cb-800a-4a5e-9510-8288567c1e76",
    startDate: "2026-08-01",
    endDate: "2026-09-01",
    note: "Tarixi fasilə",
  };
  assert.ok(freezePeriodSchema.safeParse(input).success);
  for (const change of [
    { startDate: "2026-02-30" },
    { endDate: "2026-07-01" },
    { endDate: "2099-01-01" },
    { note: " " },
  ])
    assert.ok(!freezePeriodSchema.safeParse({ ...input, ...change }).success);
});
