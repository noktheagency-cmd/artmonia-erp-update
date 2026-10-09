import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function testsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? testsIn(path) : path.endsWith(".test.ts") ? [path] : [];
  });
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testsIn("src"), "scripts/backup/core.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
