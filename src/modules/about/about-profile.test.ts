import assert from "node:assert/strict";
import test from "node:test";
import { defaultAboutProfile, normalizeAboutValues } from "@/modules/about/about-profile";

test("about profile fallback contains a complete informational snapshot", () => {
  assert.equal(defaultAboutProfile.title, "Biz kimik");
  assert.ok(defaultAboutProfile.story.length >= 40);
  assert.ok(defaultAboutProfile.mission.length >= 10);
  assert.ok(defaultAboutProfile.vision.length >= 10);
  assert.ok(defaultAboutProfile.values.length >= 1);
});

test("about values are trimmed, deduplicated and accept comma separated input", () => {
  assert.deepEqual(
    normalizeAboutValues(" Yaradıcılıq\nİnkişaf, Yaradıcılıq \n Səmimiyyət "),
    ["Yaradıcılıq", "İnkişaf", "Səmimiyyət"],
  );
});
