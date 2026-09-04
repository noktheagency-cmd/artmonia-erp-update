import assert from "node:assert/strict";
import test from "node:test";
import { metaLeadActionValue } from "@/modules/marketing/meta-ads";

test("Meta lead action prioritet sırası ilə oxunur", () => {
  assert.equal(metaLeadActionValue([
    { action_type: "onsite_conversion.lead_grouped", value: "9" },
    { action_type: "lead", value: "12" },
  ]), 12);
});

test("alternativ lead action və boş nəticə təhlükəsiz hesablanır", () => {
  assert.equal(metaLeadActionValue([{ action_type: "onsite_conversion.lead_grouped", value: "7" }]), 7);
  assert.equal(metaLeadActionValue([{ action_type: "link_click", value: "40" }]), 0);
  assert.equal(metaLeadActionValue(undefined), 0);
});
