import assert from "node:assert/strict";
import test from "node:test";
import {
  bakuMonth,
  monthBounds,
  normalizeComment,
  qualifiesComment,
  settingsSchema,
} from "./contract";
test("Baku month boundaries include year rollover", () => {
  assert.equal(bakuMonth(new Date("2026-09-30T20:00:00Z")), "2026-10");
  assert.equal(
    monthBounds("2026-12").end.toISOString(),
    "2026-12-31T20:00:00.000Z",
  );
  assert.throws(() => monthBounds("2026-13"));
});
test("comment eligibility rejects self, replies, deleted, unapproved and emoji-only", () => {
  const valid = {
    body: "Çox gözəl rəng seçimi və kompozisiyadır",
    parentId: null,
    isOwn: false,
    deleted: false,
    approved: true,
  };
  assert.equal(qualifiesComment(valid, 20), true);
  for (const change of [
    { isOwn: true },
    { parentId: "reply" },
    { deleted: true },
    { approved: false },
    { body: "😀".repeat(30) },
    { body: "qısa" },
  ]) {
    assert.equal(qualifiesComment({ ...valid, ...change }, 20), false);
  }
  assert.equal(
    normalizeComment(" SALAM  dünya "),
    normalizeComment("salam dünya"),
  );
});
test("settings cannot enable scoring without a start or accept client point overrides", () => {
  assert.equal(
    settingsSchema.safeParse({
      enabled: true,
      startsAt: null,
      minCommentLength: 20,
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      enabled: false,
      startsAt: null,
      minCommentLength: 20,
      attendance: 100,
    }).success,
    false,
  );
});
