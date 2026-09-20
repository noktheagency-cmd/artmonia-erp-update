import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of ["service.ts", "homework.ts", "actions.ts"]) {
  test(`${file}: void advisory locks execute without result deserialization`, () => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const locks = source.split("\n").filter((line) =>
      line.includes("pg_advisory_xact_lock"),
    );
    assert.equal(locks.length, 2, "Both transaction locks must remain");
    for (const lock of locks) {
      assert.match(lock, /await (db|tx)\.\$executeRaw`/);
      assert.doesNotMatch(lock, /\$queryRaw/);
      assert.match(lock, /hashtextextended/);
    }
  });
}
