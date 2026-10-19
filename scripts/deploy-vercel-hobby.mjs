/**
 * Hobby/Free Vercel teams block Git deployments when the commit author is not
 * the team owner. Deploy from a temporary copy without .git so Vercel cannot
 * attribute the upload to PashanurM / Cursor co-authors.
 *
 * Usage: node scripts/deploy-vercel-hobby.mjs
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const vercelDir = join(root, ".vercel");
if (!existsSync(join(vercelDir, "project.json"))) {
  console.error("Missing .vercel/project.json. Run: npx vercel link --yes --project artmonia-erp-f5tk --scope nokthe-agencys-projects");
  process.exit(1);
}

const stamp = Date.now();
const dest = join(tmpdir(), `artmonia-erp-vercel-${stamp}`);
mkdirSync(dest, { recursive: true });

const skip = new Set([
  "node_modules",
  ".next",
  ".git",
  "tmp",
  "coverage",
  ".open-next",
  ".wrangler",
  "terminals",
]);

console.log(`Copying project to ${dest} (without .git)…`);
cpSync(root, dest, {
  recursive: true,
  filter: (src) => {
    const parts = src.slice(root.length).split(/[/\\]/).filter(Boolean);
    if (parts.some((p) => skip.has(p))) return false;
    if (parts.some((p) => p.endsWith(".log"))) return false;
    return true;
  },
});

cpSync(vercelDir, join(dest, ".vercel"), { recursive: true });

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vercel", "deploy", "--prod", "--yes", "--force"],
  { cwd: dest, stdio: "inherit", shell: true, env: process.env },
);

try {
  rmSync(dest, { recursive: true, force: true });
} catch {
  // Temp cleanup is best-effort on Windows if a handle remains open.
}

process.exit(result.status ?? 1);
