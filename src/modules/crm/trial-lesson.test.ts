import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TRIAL_LESSON_COUNT,
  resolveTrialLessonCount,
  resolveTrialLessonNextAction,
} from "./trial-lesson";

test("sınaq dərsi mərhələsi ilk seçimdə avtomatik bir dərs qeyd edir", () => {
  assert.equal(
    resolveTrialLessonCount({ stage: "TRIAL_LESSON" }),
    DEFAULT_TRIAL_LESSON_COUNT,
  );
});

test("istifadəçinin daxil etdiyi sınaq dərsi sayı saxlanılır", () => {
  assert.equal(
    resolveTrialLessonCount({ stage: "TRIAL_LESSON", requestedCount: 3 }),
    3,
  );
});

test("müraciət növbəti mərhələyə keçəndə sınaq dərsi tarixçəsi qorunur", () => {
  assert.equal(
    resolveTrialLessonCount({ stage: "TRIAL_CONSULTATION", existingCount: 2 }),
    2,
  );
});

test("sınaq dərsi mərhələsi uyğun follow-up xatırlatmasını avtomatik seçir", () => {
  assert.equal(
    resolveTrialLessonNextAction({ stage: "TRIAL_LESSON", currentNextAction: "CALL" }),
    "TRIAL_LESSON_REMINDER",
  );
});

test("sınaq dərsi mərhələsindən çıxanda köhnə xatırlatma təmizlənir", () => {
  assert.equal(
    resolveTrialLessonNextAction({
      stage: "TRIAL_CONSULTATION",
      currentNextAction: "TRIAL_LESSON_REMINDER",
    }),
    null,
  );
});
