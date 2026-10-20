import assert from "node:assert/strict";
import test from "node:test";
import { AZ_PHONE_MAX_LENGTH, sanitizeAzPhoneInput } from "@/lib/phone-input";

test("sanitizeAzPhoneInput keeps + and 12 digits only", () => {
  assert.equal(sanitizeAzPhoneInput("+994501234567"), "+994501234567");
  assert.equal(sanitizeAzPhoneInput("+994 50 123 45 67"), "+994501234567");
  assert.equal(sanitizeAzPhoneInput("+99450abc1234567"), "+994501234567");
  assert.equal(sanitizeAzPhoneInput("phone+994501234567"), "+994501234567");
  assert.equal(sanitizeAzPhoneInput("++99450"), "+99450");
});

test("sanitizeAzPhoneInput respects 13-character max (+ and 12 digits)", () => {
  assert.equal(AZ_PHONE_MAX_LENGTH, 13);
  assert.equal("+994501234567".length, AZ_PHONE_MAX_LENGTH);
  assert.equal(sanitizeAzPhoneInput("+994501234567999").length, AZ_PHONE_MAX_LENGTH);
  assert.equal(sanitizeAzPhoneInput("+994501234567999"), "+994501234567");
});
