import type { LeadStageValue } from "@/modules/crm/stage";
import type { NextActionTypeValue } from "@/modules/crm/follow-up";

export const DEFAULT_TRIAL_LESSON_COUNT = 1;
export const MAX_TRIAL_LESSON_COUNT = 100;

export function resolveTrialLessonCount({
  stage,
  requestedCount,
  existingCount,
}: {
  stage: LeadStageValue;
  requestedCount?: number;
  existingCount?: number | null;
}) {
  if (stage !== "TRIAL_LESSON") {
    return existingCount ?? null;
  }

  return requestedCount ?? existingCount ?? DEFAULT_TRIAL_LESSON_COUNT;
}

export function resolveTrialLessonNextAction({
  stage,
  currentNextAction,
}: {
  stage: LeadStageValue;
  currentNextAction?: NextActionTypeValue | null;
}) {
  if (stage === "TRIAL_LESSON") {
    return "TRIAL_LESSON_REMINDER" as const;
  }

  return currentNextAction === "TRIAL_LESSON_REMINDER"
    ? null
    : currentNextAction ?? null;
}
