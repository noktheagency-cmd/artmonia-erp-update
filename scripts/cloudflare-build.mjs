import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { consolidateCloudflareWasm } from "./cloudflare-wasm.mjs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const adapterDirectory = resolve("node_modules/@opennextjs/cloudflare");
const adapter = JSON.parse(readFileSync(resolve(adapterDirectory, "package.json"), "utf8"));
const entry = typeof adapter.bin === "string" ? adapter.bin : adapter.bin["opennextjs-cloudflare"];
// OpenNext 1.20.11 checks the original package instead of its traced ESM entry.
// Apply the narrow upstream workaround until issue #1400 is released:
// https://github.com/opennextjs/opennextjs-cloudflare/issues/1400
const middlewareBundler = resolve(adapterDirectory, "dist/cli/build/open-next/bundle-node-middleware.js");
const originalCheck = 'existsSync(path.join(options.appBuildOutputPath, "node_modules", "@opentelemetry", "api"))';
const tracedCheck = 'existsSync(path.join(middlewareDir, "node_modules", "@opentelemetry", "api", "build", "esm", "index.js"))';
const bundlerSource = readFileSync(middlewareBundler, "utf8");
if (adapter.version !== "1.20.11") throw new Error("Review the OpenNext middleware workaround before upgrading the adapter.");
if (bundlerSource.includes(originalCheck)) {
  writeFileSync(middlewareBundler, bundlerSource.replace(originalCheck, tracedCheck));
} else if (!bundlerSource.includes(tracedCheck)) {
  throw new Error("Unexpected OpenNext middleware bundler; review the compatibility workaround.");
}
// The application imports one native server WASM module: Prisma PostgreSQL.
// Turbopack's broad trace also emits unused CLI engines as server chunks, so
// restrict its generated loader to byte-identical copies of that actual engine.
const wasmBundler = resolve(adapterDirectory, "dist/cli/build/patches/plugins/turbopack.js");
const allWasm = 'tracedFiles.filter((f) => f.endsWith(".wasm"))';
const runtimeWasm = 'tracedFiles.filter((f) => f.endsWith(".wasm") && f.includes("/.next/server/") && fs.readFileSync(f).equals(fs.readFileSync(path.resolve("src/generated/prisma-cloudflare/internal/query_compiler_fast_bg.wasm"))))';
const serverWasm = 'tracedFiles.filter((f) => f.endsWith(".wasm") && f.includes("/.next/server/"))';
const wasmSource = readFileSync(wasmBundler, "utf8");
if (wasmSource.includes(allWasm)) writeFileSync(wasmBundler, wasmSource.replace(allWasm, runtimeWasm));
else if (wasmSource.includes(serverWasm)) writeFileSync(wasmBundler, wasmSource.replace(serverWasm, runtimeWasm));
else if (!wasmSource.includes(runtimeWasm)) throw new Error("Review OpenNext WASM tracing before building.");
// Directory junctions preserve traced package links on Windows without requiring
// administrator privileges or changing the machine's security settings.
if (process.platform === "win32") {
  const traceCopier = resolve("node_modules/@opennextjs/aws/dist/build/copyTracedFiles.js");
  const linkCall = "symlinkSync(symlink, to);";
  const junctionCall = 'symlinkSync(path.resolve(path.dirname(from), symlink), to, statSync(from).isDirectory() ? "junction" : "file");';
  const traceSource = readFileSync(traceCopier, "utf8");
  if (traceSource.includes(linkCall)) writeFileSync(traceCopier, traceSource.replace(linkCall, junctionCall));
  else if (!traceSource.includes(junctionCall)) throw new Error("Unexpected OpenNext trace copier; review Windows compatibility.");
}
const secretsFile = "tmp/cloudflare-preview/secrets.json";
const secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8").replace(/^\uFEFF/, "")) : {};
const publicVariables = Object.fromEntries(Object.entries(secrets).filter(([name]) => name.startsWith("NEXT_PUBLIC_")));

// Generate a separate Workers client from the exact current schema. The normal
// Node client and schema stay unchanged; this command never applies migrations.
const schema = readFileSync("prisma/schema.prisma", "utf8");
const generator = schema.match(/generator client\s*\{[\s\S]*?\}/)?.[0];
if (!generator || !/provider\s*=\s*"prisma-client"/.test(generator) || /\bruntime\s*=/.test(generator)) {
  throw new Error("Review the Prisma generator before preparing the Workers client.");
}
const workerGenerator = generator
  .replace(/output\s*=\s*"[^"]+"/, 'output = "../../src/generated/prisma-cloudflare"')
  .replace(/\}$/, '  runtime = "workerd"\n}');
mkdirSync(resolve("tmp/cloudflare-preview"), { recursive: true });
const workerSchemaPath = resolve("tmp/cloudflare-preview/schema.prisma");
writeFileSync(workerSchemaPath, schema.replace(generator, workerGenerator));
const generation = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "generate", "--schema", workerSchemaPath], {
  stdio: "inherit",
  env: { ...process.env, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
});
if (generation.error) throw generation.error;
if (generation.status !== 0) process.exit(generation.status ?? 1);

// Scope preview settings to this build; keep .env.local and Railway unchanged.
const result = spawnSync(process.execPath, [resolve(adapterDirectory, entry), "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...publicVariables,
    ...config.vars,
    // Next evaluates its config in several processes. Pin one identity for the
    // server and browser so the preview does not show a false update notice.
    NEXT_PUBLIC_APP_BUILD_ID: randomUUID(),
  },
});

if (result.error) throw result.error;
if (result.status === 0) {
  // The adapter copies .env.local into server output by default. Runtime values
  // must come exclusively from encrypted Cloudflare secrets / Wrangler vars.
  writeFileSync(resolve(".open-next/cloudflare/next-env.mjs"),
    "export const production = {};\nexport const development = {};\nexport const test = {};\n");
  // Historical local uploads are not public preview assets. Receipts continue
  // to use the authenticated API and the existing private Supabase bucket.
  writeFileSync(resolve(".open-next/assets/.assetsignore"), "/uploads/**\n");
  consolidateCloudflareWasm();
}
process.exitCode = result.status ?? 1;
