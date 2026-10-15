import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The preview uses the existing database and file stores. No new cache bucket,
// Durable Object, database migration, or scheduled job is provisioned here.
const config = defineCloudflareConfig();
// Turbopack's WASM module output is converted to static Worker imports by OpenNext.
config.buildCommand = "npm run build";
export default config;
