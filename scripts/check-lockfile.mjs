import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  assert.deepEqual(lock.packages[""][section] ?? {}, manifest[section] ?? {}, `${section} differs from the lockfile`);
}
for (const [path, entry] of Object.entries(lock.packages)) {
  assert.ok(!path.startsWith("..") && !entry.link && !entry.resolved?.startsWith("file:"), `Local dependency cannot be deployed: ${path}`);
}
console.log("Dependency lock matches the manifest and has no local filesystem links.");
