import assert from "node:assert/strict";
import test from "node:test";
import { appointmentHistory, appointmentOutcomeTarget, isMeetingReminder, type AppointmentHistoryRow } from "./appointment-history";

const lead = {
  id: "lead-1", stage: "QUALIFIED", convertedStudentId: null,
  nextActionType: "CONSULTATION_REMINDER", nextFollowUpAt: new Date("2026-10-25T09:00:00.000Z"),
};

function appointment(extra: Partial<Omit<AppointmentHistoryRow, "source">> = {}): Omit<AppointmentHistoryRow, "source"> {
  return {
    id: "appointment-1", plannedAt: "2026-10-25T08:00:00.000Z", occurredAt: null,
    kind: "MEETING", outcome: "SCHEDULED", teacherId: null, isLegacy: false, previousId: null,
    ...extra,
  };
}

test("outcome buttons send the real appointment ID or the exact reminder timestamp", () => {
  const plan = appointmentHistory([], lead)[0];
  assert.deepEqual(appointmentOutcomeTarget(plan), { leadPlanAt: lead.nextFollowUpAt.toISOString() });
  assert.deepEqual(appointmentOutcomeTarget({ ...appointment(), source: "APPOINTMENT" }), { appointmentId: "appointment-1" });
});

test("today and tomorrow meeting reminders appear without inventing attendance or a database appointment ID", () => {
  for (const date of ["2026-10-25", "2026-10-26"]) {
    const plannedAt = new Date(`${date}T09:00:00.000Z`);
    const rows = appointmentHistory([], { ...lead, nextFollowUpAt: plannedAt });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].plannedAt, plannedAt.toISOString());
    assert.equal(rows[0].outcome, "SCHEDULED");
    assert.equal(rows[0].occurredAt, null);
    assert.equal(rows[0].source, "LEAD_PLAN");
    assert.equal(rows[0].id, "lead-plan:lead-1");
  }
});

test("trial meeting reminders preserve the trial subtype", () => {
  const rows = appointmentHistory([], { ...lead, nextActionType: "TRIAL_LESSON_REMINDER" });
  assert.equal(rows[0].kind, "TRIAL");
});

test("calls, payments and generic follow-ups are not presented as scheduled meetings", () => {
  for (const nextActionType of [null, "CALL", "PAYMENT_REMINDER", "FOLLOW_UP"]) {
    assert.equal(isMeetingReminder(nextActionType), false);
    assert.deepEqual(appointmentHistory([], { ...lead, nextActionType }), []);
  }
  assert.equal(isMeetingReminder("CONSULTATION_REMINDER"), true);
  assert.equal(isMeetingReminder("TRIAL_LESSON_REMINDER"), true);
  assert.deepEqual(appointmentHistory([], { ...lead, nextFollowUpAt: null }), []);
});

test("closed and converted leads do not regain a scheduled meeting from a stale reminder", () => {
  for (const stage of ["REGISTERED", "LOST"]) {
    assert.deepEqual(appointmentHistory([], { ...lead, stage }), []);
  }
  assert.deepEqual(appointmentHistory([], { ...lead, convertedStudentId: "student-1" }), []);
});

test("a real appointment takes precedence over its date-only reminder", () => {
  const record = appointment();
  const rows = appointmentHistory([record], lead);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, record.id);
  assert.equal(rows[0].source, "APPOINTMENT");
  assert.equal(rows[0].plannedAt, record.plannedAt);
});

test("final outcomes and rescheduling history are preserved instead of duplicated as scheduled reminders", () => {
  for (const outcome of ["ATTENDED", "NO_SHOW", "CANCELLED", "RESCHEDULED"]) {
    const record = appointment({ outcome, occurredAt: outcome === "ATTENDED" || outcome === "NO_SHOW" ? "2026-10-25T10:00:00.000Z" : null });
    const rows = appointmentHistory([record], lead);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, outcome);
    assert.equal(rows[0].occurredAt, record.occurredAt);
  }
});

test("a current recorded meeting suppresses an older profile reminder", () => {
  const rows = appointmentHistory([appointment({ plannedAt: "2026-10-26T08:00:00.000Z" })], lead);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "APPOINTMENT");
});

test("duplicate detection uses Baku calendar dates across the UTC midnight boundary", () => {
  const rows = appointmentHistory([appointment({ outcome: "CANCELLED", plannedAt: "2026-10-25T20:30:00.000Z" })], {
    ...lead, nextFollowUpAt: new Date("2026-10-26T09:00:00.000Z"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "CANCELLED");
});

test("history retains real records and their order while adding a separate current reminder", () => {
  const old = appointment({ plannedAt: "2026-10-20T08:00:00.000Z", outcome: "ATTENDED" });
  const rows = appointmentHistory([old], lead);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, "LEAD_PLAN");
  assert.equal(rows[1].id, old.id);
  assert.equal(old.outcome, "ATTENDED");
  assert.ok(!("source" in old));
  assert.equal(appointmentHistory([], { ...lead, id: "lead-2" })[0].id, "lead-plan:lead-2");
});
