import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  getPublicValidationMessage,
  isUuidDatabaseError,
} from "./validation-errors";

function parseFailure(field: string, value: unknown) {
  const result = z.object({ [field]: z.string().uuid() }).safeParse({
    [field]: value,
  });

  assert.equal(result.success, false);
  return result.error;
}

test("UUID validation errors use the Azerbaijani field label", () => {
  assert.equal(
    getPublicValidationMessage(parseFailure("programId", "__empty__")),
    "Proqram düzgün seçilməyib.",
  );
  assert.equal(
    getPublicValidationMessage(parseFailure("studentId", "not-a-uuid")),
    "Tələbə düzgün seçilməyib.",
  );
});

test("missing required ID fields use a selection message", () => {
  assert.equal(
    getPublicValidationMessage(parseFailure("programId", undefined)),
    "Proqram seçilməlidir.",
  );
});

test("unknown UUID fields never expose the technical Zod message", () => {
  assert.equal(
    getPublicValidationMessage(parseFailure("customEntityId", "")),
    "Seçilmiş məlumat düzgün deyil.",
  );
});

test("non-UUID validation messages are preserved", () => {
  const result = z.string().min(2, "Ad ən azı 2 simvol olmalıdır.").safeParse("");
  assert.equal(result.success, false);
  assert.equal(
    getPublicValidationMessage(result.error),
    "Ad ən azı 2 simvol olmalıdır.",
  );
});

test("database UUID syntax errors are recognized", () => {
  assert.equal(
    isUuidDatabaseError('invalid input syntax for type uuid: "__empty__"'),
    true,
  );
  assert.equal(isUuidDatabaseError("connection timed out"), false);
});
