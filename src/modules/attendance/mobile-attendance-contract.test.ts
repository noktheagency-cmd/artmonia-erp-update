import assert from "node:assert/strict";
import test from "node:test";
import { mobileCheckInBodySchema } from "./mobile-attendance-contract";

const baseRequest = {
  clientEventId: "7d94f164-a19b-48fc-86fd-50889a667ad2",
  qrToken: "0123456789abcdef",
  scannedAt: "2026-08-26T10:00:00.000Z",
};

test("dinamik QR sorğusu geriyə uyğun qalır", () => {
  assert.equal(mobileCheckInBodySchema.safeParse(baseRequest).success, true);
});

test("ümumi QR sorğusu daimi cihaz UUID-sini qəbul edir", () => {
  assert.deepEqual(mobileCheckInBodySchema.parse({
    ...baseRequest,
    deviceInstallationId: "ac4d6e49-3e86-4289-b9ee-cb4a650eb98b",
  }).deviceInstallationId, "ac4d6e49-3e86-4289-b9ee-cb4a650eb98b");
});

test("cihaz ID-si və naməlum sahələr sərt yoxlanır", () => {
  assert.equal(mobileCheckInBodySchema.safeParse({
    ...baseRequest,
    deviceInstallationId: "not-a-uuid",
  }).success, false);
  assert.equal(mobileCheckInBodySchema.safeParse({ ...baseRequest, studentId: crypto.randomUUID() }).success, false);
});
