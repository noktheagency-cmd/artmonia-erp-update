import assert from "node:assert/strict";
import test from "node:test";
import { calculateMobileJourneyAndGamification } from "./mobile-gamification";

const topics = [1, 2, 3].map((sequence) => ({
  id: `topic-${sequence}`,
  sequence,
  title: `Mövzu ${sequence}`,
  materials: [],
}));

test("PRESENT mövzunu və XP-ni irəli aparır", () => {
  const result = calculateMobileJourneyAndGamification({
    programId: "program-1",
    courseCode: "RƏSM-101",
    topics,
    attendance: [{
      status: "PRESENT",
      markedAt: new Date("2026-08-24T10:00:00Z"),
      sessionDate: new Date("2026-08-24T00:00:00Z"),
      startTime: "14:00",
    }],
    homeworkCompletions: [{ completedAt: new Date("2026-08-25T10:00:00Z") }],
    weekStartsAt: new Date("2026-08-24T00:00:00Z"),
  });

  assert.equal(result.journey.completedTopicCount, 1);
  assert.equal(result.journey.currentTopic?.number, 2);
  assert.equal(result.journey.topics[0].status, "completed");
  assert.equal(
    result.journey.topics[0].identifier,
    "program:program-1:topic:topic-1",
  );
  assert.equal(result.journey.topics[0].courseCode, "RƏSM-101");
  assert.equal(result.gamification.xp.total, 125);
  assert.equal(result.gamification.xp.earnedThisWeek, 125);
});

test("ABSENT seriyanı qırır, EXCUSED isə mövzunu və seriyanı dəyişmir", () => {
  const result = calculateMobileJourneyAndGamification({
    programId: "program-1",
    courseCode: "RƏSM-101",
    topics,
    attendance: [
      event("PRESENT", "2026-08-01", "10:00"),
      event("EXCUSED", "2026-08-02", "10:00"),
      event("PRESENT", "2026-08-03", "10:00"),
      event("ABSENT", "2026-08-04", "10:00"),
      event("PRESENT", "2026-08-05", "10:00"),
    ],
    homeworkCompletions: [],
    weekStartsAt: new Date("2026-08-01T00:00:00Z"),
  });

  assert.equal(result.journey.completedTopicCount, 3);
  assert.equal(result.gamification.streak.current, 1);
  assert.equal(result.gamification.streak.best, 2);
  assert.equal(result.gamification.xp.total, 300);
});

function event(status: "PRESENT" | "ABSENT" | "EXCUSED", date: string, startTime: string) {
  return {
    status,
    markedAt: new Date(`${date}T10:00:00Z`),
    sessionDate: new Date(`${date}T00:00:00Z`),
    startTime,
  };
}
