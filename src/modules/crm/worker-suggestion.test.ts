import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerSuggestion } from "./worker-suggestion";

const base = {
  stage: "QUALIFIED",
  latestMeetingOutcome: "SCHEDULED" as string | null,
  meetingUpcoming: true,
  latestContactResult: null as string | null,
};

test("does not say a scheduled meeting was missed just because its time passed", () => {
  assert.equal(
    buildWorkerSuggestion({ ...base, latestMeetingOutcome: "SCHEDULED", meetingUpcoming: false }),
    null,
  );
});

test("says the meeting did not happen only after it is marked missed", () => {
  assert.deepEqual(
    buildWorkerSuggestion({ ...base, latestMeetingOutcome: "NO_SHOW", meetingUpcoming: false }),
    { panel: "meeting", title: "Görüş baş tutmadı", action: "Yeni görüş təyin et" },
  );
});

test("suggests a new meeting when the last meeting was postponed and none is planned", () => {
  assert.deepEqual(
    buildWorkerSuggestion({ ...base, latestMeetingOutcome: "RESCHEDULED", meetingUpcoming: false }),
    { panel: "meeting", title: "Görüş təxirə salındı", action: "Yeni görüş təyin et" },
  );
});

test("stays quiet when a replacement meeting is already planned", () => {
  assert.equal(
    buildWorkerSuggestion({ ...base, latestMeetingOutcome: "NO_SHOW", meetingUpcoming: true }),
    null,
  );
});

test("suggests another contact when the last attempt failed", () => {
  assert.deepEqual(
    buildWorkerSuggestion({ ...base, stage: "NEW", latestContactResult: "UNANSWERED", meetingUpcoming: false, latestMeetingOutcome: null }),
    { panel: "contact", title: "Əlaqə alınmadı", action: "Yenidən əlaqə saxla" },
  );
});

test("does not suggest contact after the stage already says contact was established", () => {
  assert.equal(
    buildWorkerSuggestion({ ...base, stage: "CONTACTED", latestContactResult: "UNANSWERED", meetingUpcoming: false, latestMeetingOutcome: null }),
    null,
  );
});
