import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentPaginationItems,
  normalizeStudentPage,
} from "./student-pagination";

test("normalizes invalid student page values to the first page", () => {
  assert.equal(normalizeStudentPage(undefined), 1);
  assert.equal(normalizeStudentPage("0"), 1);
  assert.equal(normalizeStudentPage("not-a-page"), 1);
  assert.equal(normalizeStudentPage("3"), 3);
});

test("shows every page when the student page count is short", () => {
  assert.deepEqual(buildStudentPaginationItems(3, 6), [1, 2, 3, 4, 5, 6]);
});

test("uses ellipses around the current page for long student lists", () => {
  assert.deepEqual(buildStudentPaginationItems(6, 12), [
    1,
    "start-ellipsis",
    5,
    6,
    7,
    "end-ellipsis",
    12,
  ]);
});
