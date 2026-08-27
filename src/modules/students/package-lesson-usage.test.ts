import assert from "node:assert/strict";
import test from "node:test";
import { calculatePackageLessonUsage } from "./package-lesson-usage";

test("yalnız PRESENT sayı paketdən istifadə kimi hesablanır", () => {
  assert.deepEqual(calculatePackageLessonUsage(8, 3), {
    totalLessons: 8,
    usedLessons: 3,
    remainingLessons: 5,
    overLimitLessons: 0,
  });
});

test("təkrar və artıq istifadə qalan dərsi mənfiyə salmır", () => {
  assert.deepEqual(calculatePackageLessonUsage(4, 6), {
    totalLessons: 4,
    usedLessons: 6,
    remainingLessons: 0,
    overLimitLessons: 2,
  });
});

test("dərs limiti olmayan paketdə istifadə sayı yenə görünür", () => {
  assert.deepEqual(calculatePackageLessonUsage(null, 2), {
    totalLessons: null,
    usedLessons: 2,
    remainingLessons: null,
    overLimitLessons: 0,
  });
});
