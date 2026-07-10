import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWorkshopPaymentWithinBalance,
  calculateWorkshopParticipantFinance,
} from "./finance-rules";

test("150 AZN qeydiyyatda 50 AZN avans 100 AZN qalıq yaradır", () => {
  assert.deepEqual(
    calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 0, activePaid: 50 }),
    { listPrice: 150, discountAmount: 0, netPrice: 150, activePaid: 50, balance: 100, state: "ADVANCE" },
  );
});

test("ikinci 100 AZN ödəniş tam ödənilmiş edir, ləğv ediləndə yenidən avans olur", () => {
  assert.equal(calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 0, activePaid: 150 }).state, "PAID");
  const afterVoid = calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 0, activePaid: 50 });
  assert.equal(afterVoid.state, "ADVANCE");
  assert.equal(afterVoid.balance, 100);
});

test("endirim, hədiyyə və qeydiyyat qiyməti snapshot qaydaları", () => {
  const discounted = calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 30, activePaid: 50 });
  assert.equal(discounted.netPrice, 120);
  assert.equal(discounted.balance, 70);
  assert.equal(calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 0, activePaid: 0, isGift: true }).state, "GIFT");
  assert.equal(calculateWorkshopParticipantFinance({ listPrice: 150, discountAmount: 0, activePaid: 0 }).netPrice, 150);
});

test("artıq ödəniş bloklanır", () => {
  assert.throws(() => assertWorkshopPaymentWithinBalance(101, 100), /qalıq məbləğdən çox/);
  assert.doesNotThrow(() => assertWorkshopPaymentWithinBalance(100, 100));
});
