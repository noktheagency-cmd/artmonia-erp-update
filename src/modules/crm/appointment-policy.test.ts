import test from "node:test";
import assert from "node:assert/strict";
import { appointmentKey, appointmentSchema, isFutureAppointmentResult } from "./appointment-policy";

const input = { leadId: "00000000-0000-4000-8000-000000000001", date: "2026-09-20", kind: "TRIAL", outcome: "SCHEDULED" } as const;
test("appointment validation rejects invalid dates, IDs and outcomes", () => {
  for (const invalid of [{ date: "2026-02-30" }, { leadId: "invalid" }, { outcome: "DONE" }, { kind: "CALL" }]) {
    assert.equal(appointmentSchema.safeParse({ ...input, ...invalid }).success, false);
  }
});
test("outcome corrections and retries address the same appointment", () => {
  assert.equal(appointmentKey(input), appointmentKey({ ...input, outcome: "ATTENDED" }));
  assert.notEqual(appointmentKey(input), appointmentKey({ ...input, date: "2026-09-21" }));
  assert.notEqual(appointmentKey(input), appointmentKey({ ...input, kind: "CONSULTATION" }));
});
test("future appointments can be scheduled or cancelled but cannot have attendance results", () => {
  assert.equal(isFutureAppointmentResult(input, "2026-09-19"), false);
  assert.equal(isFutureAppointmentResult({ ...input, outcome: "CANCELLED" }, "2026-09-19"), false);
  for (const outcome of ["ATTENDED", "NO_SHOW"] as const) {
    assert.equal(isFutureAppointmentResult({ ...input, outcome }, "2026-09-19"), true);
    assert.equal(isFutureAppointmentResult({ ...input, outcome }, "2026-09-20"), false);
    assert.equal(isFutureAppointmentResult({ ...input, outcome }, "2026-09-21"), false);
  }
});
