import assert from "node:assert/strict";
import test from "node:test";
import { metaLeadActionValue } from "@/modules/marketing/meta-ads";
import { isInvalidMetaAppSecretProof } from "@/modules/meta/appsecret-proof";

test("Meta lead action prioritet sırası ilə oxunur", () => {
  assert.equal(metaLeadActionValue([
    { action_type: "onsite_conversion.lead_grouped", value: "9" },
    { action_type: "lead", value: "12" },
  ]), 12);
});

test("alternativ lead action və boş nəticə təhlükəsiz hesablanır", () => {
  assert.equal(metaLeadActionValue([{ action_type: "onsite_conversion.lead_grouped", value: "7" }]), 7);
  assert.equal(metaLeadActionValue([{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "18" }]), 18);
  assert.equal(metaLeadActionValue([{ action_type: "link_click", value: "40" }]), 0);
  assert.equal(metaLeadActionValue(undefined), 0);
});

test("yalnız etibarsız appsecret proof xətası təhlükəsiz retry üçün seçilir", () => {
  assert.equal(isInvalidMetaAppSecretProof({ code: 100, message: "Invalid appsecret_proof provided" }), true);
  assert.equal(isInvalidMetaAppSecretProof({ code: 100, message: "Invalid field" }), false);
  assert.equal(isInvalidMetaAppSecretProof({ code: 190, message: "Invalid OAuth token" }), false);
});
