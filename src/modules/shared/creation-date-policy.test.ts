import assert from "node:assert/strict";
import test from "node:test";
import { assertCreationDatesAllowed, currentBakuMonthStart } from "./creation-date-policy";
import { parsePaymentDateInput, FUTURE_PAYMENT_DATE_ERROR } from "@/modules/students/payment-date-policy";

const now = new Date("2026-10-25T08:00:00.000Z");

test("the creation boundary changes at Baku midnight, including the new year", () => {
  assert.equal(currentBakuMonthStart(new Date("2026-09-30T19:59:59Z")), "2026-09-01");
  assert.equal(currentBakuMonthStart(new Date("2026-09-30T20:00:00Z")), "2026-10-01");
  assert.equal(currentBakuMonthStart(new Date("2026-12-31T20:00:00Z")), "2027-01-01");
});

test("current-month days before today and future months are allowed", () => {
  assert.doesNotThrow(() => assertCreationDatesAllowed([
    { label: "Qeydiyyat tarixi", value: "2026-10-01" },
    { label: "İlk dərs tarixi", value: "2026-10-31" },
    { label: "Növbəti addım tarixi", value: "2026-11-01" },
    { label: "Ödənişin aid olduğu ay", value: "2027-01" },
  ], now));
});

for (const label of ["Növbəti addım tarixi", "Qeydiyyat tarixi", "İlk dərs tarixi", "Ödəniş tarixi", "Ödənişin aid olduğu ay"]) {
  test(`${label}: past months are rejected even when submitted directly`, () => {
    assert.throws(() => assertCreationDatesAllowed([
      { label, value: label === "Ödənişin aid olduğu ay" ? "2026-09" : "2026-09-30" },
    ], now), new RegExp(`${label} cari aydan əvvəlki aya aid ola bilməz`));
  });
}

test("Azerbaijani date input follows the same boundary", () => {
  assert.doesNotThrow(() => assertCreationDatesAllowed([{ label: "Tarix", value: "01.10.2026" }], now));
  assert.throws(() => assertCreationDatesAllowed([{ label: "Tarix", value: "30/09/2026" }], now));
});

test("date-only database values and parsed billing months follow the same boundary", () => {
  assert.doesNotThrow(() => assertCreationDatesAllowed([
    { label: "Tarix", value: new Date("2026-10-01T00:00:00.000Z") },
  ], now));
  assert.throws(() => assertCreationDatesAllowed([
    { label: "Ay", value: new Date("2026-09-01T00:00:00.000Z") },
  ], now), /cari aydan əvvəlki/);
});

test("impossible dates cannot roll over from a closed month into an allowed month", () => {
  for (const value of ["2026-09-31", "31.09.2026", "2026-13", "invalid", "", new Date(Number.NaN)]) {
    assert.throws(() => assertCreationDatesAllowed([{ label: "Tarix", value }], now), /düzgün deyil/);
  }
});

test("a pending form from the preceding Baku month is rejected when submitted in the new month", () => {
  const dates = [{ label: "Qeydiyyat tarixi", value: "2026-10-31" }];
  assert.doesNotThrow(() => assertCreationDatesAllowed(dates, new Date("2026-10-31T19:59:59Z")));
  assert.throws(() => assertCreationDatesAllowed(dates, new Date("2026-10-31T20:00:00Z")), /cari aydan əvvəlki/);
});

test("optional creation fields may be absent for gift admissions", () => {
  assert.doesNotThrow(() => assertCreationDatesAllowed([
    { label: "İlk dərs tarixi", value: undefined },
    { label: "Ödəniş tarixi", value: null },
  ], now));
});

test("the creation rule preserves the separate prohibition on future actual payments", () => {
  const futureDate = "2999-01-01";
  assert.doesNotThrow(() => assertCreationDatesAllowed([{ label: "Tarix", value: futureDate }], now));
  assert.throws(() => parsePaymentDateInput(futureDate), { message: FUTURE_PAYMENT_DATE_ERROR });
});
