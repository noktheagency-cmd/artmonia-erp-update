import assert from "node:assert/strict";
import test from "node:test";
import { classifyLifecycleHistoryChange } from "./lifecycle-history-policy";

test("a historical freeze preserves an explicit subsequent reactivation", () => {
  assert.deepEqual(classifyLifecycleHistoryChange({
    currentStatus: "ACTIVE", requestedStatus: "FROZEN",
    laterStatus: "ACTIVE", hasLaterReactivation: true,
  }), { historicalOnly: true });
});

test("an ordinary freeze changes current state", () => {
  assert.deepEqual(classifyLifecycleHistoryChange({
    currentStatus: "ACTIVE", requestedStatus: "FROZEN",
    laterStatus: null, hasLaterReactivation: false,
  }), { historicalOnly: false });
});

test("legacy slot activation cannot silently resolve contradictory dates", () => {
  assert.throws(() => classifyLifecycleHistoryChange({
    currentStatus: "ACTIVE", requestedStatus: "FROZEN",
    laterStatus: "ACTIVE", hasLaterReactivation: false,
  }), /Tarixlər ziddiyyət/);
});

test("a backdated stop cannot overwrite a later active state", () => {
  assert.throws(() => classifyLifecycleHistoryChange({
    currentStatus: "ACTIVE", requestedStatus: "STOPPED",
    laterStatus: "ACTIVE", hasLaterReactivation: true,
  }), /Tarixlər ziddiyyət/);
});
