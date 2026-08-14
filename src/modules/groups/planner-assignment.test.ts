import assert from "node:assert/strict";
import test from "node:test";
import {
  minimumAssignmentDate,
  preferredAssignmentDate,
  selectedSlotsFirst,
} from "./planner-assignment";

const slots = [
  { id: "morning", validFrom: "2026-05-01" },
  { id: "evening", validFrom: "2026-06-15" },
  { id: "future", validFrom: "2026-09-01" },
];

test("allows a past assignment date from the latest selected slot start", () => {
  assert.equal(
    minimumAssignmentDate(["morning", "evening"], slots),
    "2026-06-15",
  );
});

test("defaults to today but clamps a future slot to its own start date", () => {
  assert.equal(
    preferredAssignmentDate(["morning"], slots, "2026-08-15"),
    "2026-08-15",
  );
  assert.equal(
    preferredAssignmentDate(["future"], slots, "2026-08-15"),
    "2026-09-01",
  );
});

test("places selected slots first while preserving the order of both groups", () => {
  assert.deepEqual(
    selectedSlotsFirst(slots, new Set(["evening"])).map((slot) => slot.id),
    ["evening", "morning", "future"],
  );
});
