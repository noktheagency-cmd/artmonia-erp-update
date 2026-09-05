import assert from "node:assert/strict";
import test from "node:test";
import { canPublishMobilePush } from "./access";
import { campaignSchema, acknowledgeSchema, claimSchema } from "./contract";
const input = {
  requestKey: "11111111-1111-4111-8111-111111111111",
  title: "Workshop", body: "Sabah yeni workshop başlayır", category: "workshop",
  destination: "notifications", linkUrl: null, imageUrl: null, priority: "normal",
  audience: "all", programId: null, studentIds: [], scheduledAt: null,
};
test("only the two explicitly authorized ERP accounts can publish", () => {
  assert.equal(canPublishMobilePush({ id: "f74ddcf3-fed2-4d36-86e5-5e75ab94f225" }), true);
  assert.equal(canPublishMobilePush({ id: "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a" }), true);
  assert.equal(canPublishMobilePush({ id: input.requestKey }), false);
});
test("targeted campaigns cannot silently turn into a broadcast", () => {
  assert.equal(campaignSchema.safeParse(input).success, true);
  assert.equal(campaignSchema.safeParse({ ...input, audience: "program" }).success, false);
  assert.equal(campaignSchema.safeParse({ ...input, audience: "students" }).success, false);
});
test("custom category and safe external destinations", () => {
  assert.equal(campaignSchema.safeParse({ ...input, category: "workshop.new" }).success, true);
  for (const linkUrl of [null, "javascript:alert(1)", "http://example.com", "https://user:pass@example.com"])
    assert.equal(campaignSchema.safeParse({ ...input, destination: "external", linkUrl }).success, false);
  assert.equal(campaignSchema.safeParse({ ...input, destination: "external", linkUrl: "https://artmoniya.com" }).success, true);
});
test("worker payload bounds and lease requirement", () => {
  assert.equal(claimSchema.safeParse({ limit: 51 }).success, false);
  assert.equal(claimSchema.safeParse({ limit: 1, studentId: input.requestKey }).success, false);
  assert.equal(acknowledgeSchema.safeParse({ deliveryId: input.requestKey, status: "delivered" }).success, false);
});
