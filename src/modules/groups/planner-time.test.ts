import assert from "node:assert/strict";
import test from "node:test";
import { bakuTimeOptions, buildPlannerTimeAxis } from "./planner-time";

test("offers the full day in 24-hour half-hour steps", () => {
  assert.equal(bakuTimeOptions.length, 48);
  assert.equal(bakuTimeOptions[0], "00:00");
  assert.equal(bakuTimeOptions.at(-1), "23:30");
  assert.equal(bakuTimeOptions.includes("13:30"), true);
});

test("fills every hour between the earliest start and latest end", () => {
  assert.deepEqual(
    buildPlannerTimeAxis([
      { startTime: "09:00", endTime: "10:30" },
      { startTime: "14:00", endTime: "16:00" },
    ]),
    ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"],
  );
});

test("keeps non-hour slot starts and expands when the range changes", () => {
  assert.deepEqual(
    buildPlannerTimeAxis([
      { startTime: "07:30", endTime: "08:30" },
      { startTime: "19:30", endTime: "21:00" },
    ]),
    [
      "07:00",
      "07:30",
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "19:30",
      "20:00",
      "21:00",
    ],
  );
});
