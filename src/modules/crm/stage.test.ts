import assert from "node:assert/strict";
import test from "node:test";
import { leadStageSelectOptions, formatLeadStageLabel, isContactStageCompleted } from "./stage";

test("the reminder pipeline stage is available in create and edit status options", () => {
  assert.deepEqual(leadStageSelectOptions.find(option => option.value === "CONTACTED"), { value: "CONTACTED", label: "Xatırlatma" });
  assert.equal(formatLeadStageLabel("CONTACTED"), "Xatırlatma");
  assert.equal(isContactStageCompleted("CONTACTED"), true);
});
