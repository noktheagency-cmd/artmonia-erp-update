import test from "node:test";
import assert from "node:assert/strict";
import {
  assertContactTime,
  contactSchema,
  nextUnansweredDate,
  outcomeOptionsForChannel,
  outcomesForChannel,
} from "./contact-policy";
import { assertLeadPlan } from "./lead-validation";

const base = {
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
  leadId: "00000000-0000-4000-8000-000000000002",
  channel: "PHONE" as const,
  outcome: "TALKED" as const,
  occurredAt: "2026-10-10T08:00:00Z",
  nextActionType: "CALL" as const,
  nextDate: "2026-10-11",
};

test("contact requires a factual outcome, channel, request key and next work", () => {
  assert.equal(contactSchema.safeParse(base).success, true);
  for (const input of [
    { outcome: "CONTACTED" },
    { channel: "STAGE" },
    { nextDate: "" },
    { nextActionType: "" },
  ]) {
    assert.equal(contactSchema.safeParse({ ...base, ...input }).success, false);
  }
});

test("BK-19: phone and whatsapp outcomes are channel-scoped", () => {
  assert.deepEqual(outcomesForChannel("PHONE"), [
    "TALKED",
    "ANSWERED_NO_TALK",
    "UNANSWERED",
  ]);
  assert.deepEqual(outcomesForChannel("WHATSAPP"), [
    "WHATSAPP_SENT",
    "WHATSAPP_REPLIED",
  ]);
  assert.equal(
    contactSchema.safeParse({
      ...base,
      channel: "WHATSAPP",
      outcome: "TALKED",
    }).success,
    false,
  );
  assert.equal(
    contactSchema.safeParse({
      ...base,
      channel: "WHATSAPP",
      outcome: "WHATSAPP_REPLIED",
    }).success,
    true,
  );
  assert.equal(
    contactSchema.safeParse({
      ...base,
      channel: "PHONE",
      outcome: "ANSWERED_NO_TALK",
    }).success,
    true,
  );
  assert.ok(outcomeOptionsForChannel("PHONE").some((item) => item.value === "ANSWERED_NO_TALK"));
});

test("contact cannot pretend to be a past-day or future occurrence", () => {
  const now = new Date("2026-10-10T08:00:00Z");
  assert.doesNotThrow(() => assertContactTime(now, now));
  for (const at of ["2026-10-09T19:59:59Z", "2026-10-10T08:00:01Z"]) {
    assert.throws(() => assertContactTime(new Date(at), now));
  }
});

test("unanswered plan keeps same-day retry and first-attempt day 3 and day 7 anchors", () => {
  const first = new Date("2026-10-10T08:00:00Z");
  assert.equal(nextUnansweredDate(first, first, 1), "2026-10-10");
  assert.equal(nextUnansweredDate(first, first, 2), "2026-10-13");
  assert.equal(nextUnansweredDate(first, new Date("2026-10-13T08:00:00Z"), 3), "2026-10-17");
});

test("open leads need contact, program and dated next work; lost needs reason", () => {
  const plan = {
    stage: "NEW",
    phone: "994synthetic",
    programId: "program",
    nextActionType: "CALL",
    nextDate: "2026-10-11",
  };
  assert.doesNotThrow(() => assertLeadPlan(plan));
  for (const input of [
    { phone: null },
    { programId: null },
    { nextActionType: null },
    { nextDate: null },
  ]) {
    assert.throws(() => assertLeadPlan({ ...plan, ...input }));
  }
  assert.throws(() => assertLeadPlan({ ...plan, stage: "LOST" }));
  assert.doesNotThrow(() =>
    assertLeadPlan({ ...plan, stage: "LOST", reason: "Closed by request" }),
  );
});
