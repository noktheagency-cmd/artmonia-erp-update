import assert from "node:assert/strict";
import test from "node:test";
import { calculateMobileJourneyAndGamification as calculate } from "./mobile-gamification";

const topics = Array.from({ length: 6 }, (_, index) => ({
  id: `topic-${index + 1}`,
  sequence: index + 1,
  title: `Dərs ${index + 1}`,
  materials: [
    {
      id: `material-${index}`,
      subject: "Forma",
      objective: "Çəkmək",
      homework: "Məşq",
      imageUrl: null,
    },
  ],
}));
const event = (status: "PRESENT" | "ABSENT" | "EXCUSED") => ({
  status,
  markedAt: new Date("2026-09-20T10:00:00Z"),
  sessionDate: new Date("2026-09-20T00:00:00Z"),
  startTime: "14:00",
});
test("PRESENT advances one lesson and previews only the next three", () => {
  const { journey } = calculate({
    programId: "p",
    courseCode: "121",
    topics,
    attendance: [event("PRESENT"), event("ABSENT"), event("EXCUSED")],
  });
  assert.equal(journey.completedTopicCount, 1);
  assert.deepEqual(
    journey.topics.map((t) => t.access),
    ["completed", "current", "preview", "preview", "preview", "locked"],
  );
  assert.deepEqual(journey.topics[5].materials, []);
  assert.equal(journey.topics[0].identifier, "program:p:topic:topic-1");
});
test("path length comes from program lessons, including empty and fully completed programs", () => {
  for (const count of [0, 1, 6, 31]) {
    const { journey } = calculate({
      programId: "p",
      courseCode: null,
      topics: Array.from({ length: count }, (_, i) => ({
        ...topics[0],
        id: String(i),
        sequence: i + 1,
      })),
      attendance: Array.from({ length: 35 }, () => event("PRESENT")),
    });
    assert.equal(journey.totalTopicCount, count);
    assert.equal(journey.completedTopicCount, count);
    assert.equal(journey.progressPercent, count ? 100 : 0);
    assert.equal(journey.currentTopic, null);
  }
});
test("attendance reversal restores the current step without XP calculations", () => {
  const result = calculate({
    programId: "p",
    courseCode: null,
    topics,
    attendance: [event("ABSENT")],
  });
  assert.equal(result.journey.currentTopic?.number, 1);
  assert.equal(result.journey.topics[4].canViewMaterials, false);
  assert.equal("gamification" in result, false);
});
