import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Multiple Next server layers can emit byte-identical WASM modules. Give them
// one static import target so Wrangler uploads each compiled module only once.
export function consolidateCloudflareWasm() {
  const directory = resolve(".open-next/cloudflare/wasm");
  mkdirSync(directory, { recursive: true });
  for (const output of [".open-next/server-functions/default/handler.mjs", ".open-next/middleware/handler.mjs"]) {
    const metadataPath = `${output}.meta.json`;
    if (!existsSync(metadataPath)) continue;
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    let source = readFileSync(output, "utf8");
    const imports = Object.values(metadata.outputs).flatMap((item) => item.imports ?? []);
    const replacements = new Map();
    for (const entry of imports) {
      if (!/\.wasm(?:\?module)?$/.test(entry.path) || replacements.has(entry.path)) continue;
      const originalFile = entry.path.replace(/\?module$/, "");
      const digest = createHash("sha256").update(readFileSync(originalFile)).digest("hex");
      const target = resolve(directory, `${digest}.wasm`);
      if (!existsSync(target)) copyFileSync(originalFile, target);
      const targetImport = target.replaceAll("\\", "/") + (entry.path.endsWith("?module") ? "?module" : "");
      const originalLiteral = JSON.stringify(entry.path);
      if (!source.includes(originalLiteral)) throw new Error("Expected WASM import missing from OpenNext output.");
      source = source.replaceAll(originalLiteral, JSON.stringify(targetImport));
      replacements.set(entry.path, targetImport);
    }
    for (const entry of imports) entry.path = replacements.get(entry.path) ?? entry.path;
    writeFileSync(output, source);
    writeFileSync(metadataPath, JSON.stringify(metadata));
    console.log(`WASM imports consolidated: ${replacements.size} paths -> ${new Set(replacements.values()).size} modules.`);
  }
}
