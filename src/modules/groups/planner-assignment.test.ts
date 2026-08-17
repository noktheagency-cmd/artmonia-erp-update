import assert from "node:assert/strict";
import test from "node:test";
import {
  firstSlotOccurrenceDate,
  minimumAssignmentDate,
  preferredAssignmentDate,
  selectedSlotsFirst,
} from "./planner-assignment";

const slots = [
  { id: "morning", validFrom: "2026-05-01", weekday: "MONDAY" as const },
  { id: "evening", validFrom: "2026-06-15", weekday: "THURSDAY" as const },
  { id: "future", validFrom: "2026-09-01", weekday: "FRIDAY" as const },
];

test("allows a past assignment date from the latest selected slot start", () => {
  assert.equal(
    minimumAssignmentDate(["morning", "evening"], slots),
    "2026-06-15",
  );
});

test("defaults to the first real lesson day and respects a future slot start", () => {
  assert.equal(
    preferredAssignmentDate(["morning"], slots, "2026-08-15"),
    "2026-08-17",
  );
  assert.equal(
    preferredAssignmentDate(["future"], slots, "2026-08-15"),
    "2026-09-04",
  );
});

test("moves a requested date forward to the selected slot weekday", () => {
  assert.equal(
    firstSlotOccurrenceDate("2026-08-17", slots[1]),
    "2026-08-20",
  );
  assert.equal(
    firstSlotOccurrenceDate("2026-08-20", slots[1]),
    "2026-08-20",
  );
});

test("uses the earliest real lesson when multiple weekdays are selected", () => {
  assert.equal(
    preferredAssignmentDate(["morning", "evening"], slots, "2026-08-15"),
    "2026-08-17",
  );
});

test("places selected slots first while preserving the order of both groups", () => {
  assert.deepEqual(
    selectedSlotsFirst(slots, new Set(["evening"])).map((slot) => slot.id),
    ["evening", "morning", "future"],
  );
});
