import { verifyPayload } from "./core.mjs";

// Run against the decrypted/extracted backup directory. This script never connects
// to a database, uploads files, or restores production data.
if (process.argv.length !== 3) {
  console.error("Usage: node scripts/backup/verify.mjs <extracted-backup-directory>");
  process.exitCode = 1;
} else {
  try {
    const verified = await verifyPayload(process.argv[2]);
    console.log(`Backup payload verified; project ${verified.projectRef}; ${verified.files} files; ${verified.databaseBytes} database bytes.`);
  } catch {
    console.error("Backup payload verification failed. Do not restore this backup.");
    process.exitCode = 1;
  }
}
