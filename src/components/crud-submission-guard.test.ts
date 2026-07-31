import assert from "node:assert/strict";
import test from "node:test";
import { isDuplicateSubmission } from "./crud-submission-guard";

test("blocks the same payload during the rapid-submit window", () => {
  const previous = { fingerprint: "student:42\u001famount:100", submittedAt: 1_000 };

  assert.equal(
    isDuplicateSubmission(previous, previous.fingerprint, 2_499),
    true,
  );
});

test("allows a changed payload immediately", () => {
  const previous = { fingerprint: "student:42\u001famount:100", submittedAt: 1_000 };

  assert.equal(
    isDuplicateSubmission(previous, "student:42\u001famount:120", 1_001),
    false,
  );
});

test("allows a retry after the rapid-submit window", () => {
  const previous = { fingerprint: "student:42\u001famount:100", submittedAt: 1_000 };

  assert.equal(
    isDuplicateSubmission(previous, previous.fingerprint, 2_500),
    false,
  );
});
