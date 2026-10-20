import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentAnchorDate,
  firstSlotOccurrenceDate,
  minimumAssignmentDate,
  preferredAssignmentDate,
  resolvePlanAnchor,
  selectionMatchesAssignedTeacher,
  selectedSlotsFirst,
  slotsForAssignedTeacher,
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

test("keeps a recorded first lesson as the plan anchor", () => {
  assert.equal(
    assignmentAnchorDate("2026-07-03", ["morning", "evening"], slots, "2026-08-15"),
    "2026-07-03",
  );
  assert.equal(
    assignmentAnchorDate(null, ["morning"], slots, "2026-08-15"),
    "2026-08-17",
  );
});

test("ignores the earliest plan date when the first lesson is already recorded", () => {
  assert.equal(resolvePlanAnchor("2026-07-03", "2026-08-17"), "2026-07-03");
  assert.equal(resolvePlanAnchor("2026-07-03", null), "2026-07-03");
  assert.equal(resolvePlanAnchor(null, "2026-08-17"), "2026-08-17");
  assert.equal(resolvePlanAnchor(null, ""), null);
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

test("shows only slots owned by the student's assigned teacher", () => {
  const teacherSlots = [
    { id: "a-monday", teacherId: "teacher-a" },
    { id: "b-monday", teacherId: "teacher-b" },
    { id: "unassigned", teacherId: null },
    { id: "a-friday", teacherId: "teacher-a" },
  ];

  assert.deepEqual(
    slotsForAssignedTeacher(teacherSlots, "teacher-a").map((slot) => slot.id),
    ["a-monday", "a-friday"],
  );
  assert.deepEqual(slotsForAssignedTeacher(teacherSlots, null), []);
});

test("rejects a mixed-teacher schedule while allowing an empty plan", () => {
  assert.equal(
    selectionMatchesAssignedTeacher(
      [{ teacherId: "teacher-a" }, { teacherId: "teacher-a" }],
      "teacher-a",
    ),
    true,
  );
  assert.equal(
    selectionMatchesAssignedTeacher(
      [{ teacherId: "teacher-a" }, { teacherId: "teacher-b" }],
      "teacher-a",
    ),
    false,
  );
  assert.equal(selectionMatchesAssignedTeacher([{ teacherId: "teacher-a" }], null), false);
  assert.equal(selectionMatchesAssignedTeacher([], null), true);
});
