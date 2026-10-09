import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const age = process.env.AGE_TEST_AGE_BIN;
const keygen = process.env.AGE_TEST_KEYGEN_BIN;

test("age round-trips synthetic backup data and rejects corrupted ciphertext", { skip: !age || !keygen }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "artmonia-backup-age-test-"));
  const invoke = (program, args) => spawnSync(program, args, { encoding: "utf8", timeout: 10_000 });
  try {
    const identity = join(directory, "identity.txt");
    assert.equal(invoke(keygen, ["-o", identity]).status, 0);
    const recipient = invoke(keygen, ["-y", identity]);
    assert.equal(recipient.status, 0);
    const input = join(directory, "input.bin");
    const encrypted = join(directory, "backup.age");
    const output = join(directory, "output.bin");
    const payload = Buffer.from("Synthetic student/payment/file backup. Ə ş ı ö ü ç.");
    await writeFile(input, payload);
    assert.equal(invoke(age, ["-r", recipient.stdout.trim(), "-o", encrypted, input]).status, 0);
    assert.equal(invoke(age, ["-d", "-i", identity, "-o", output, encrypted]).status, 0);
    assert.deepEqual(await readFile(output), payload);
    const ciphertext = await readFile(encrypted);
    ciphertext[ciphertext.length - 1] ^= 1;
    const corrupted = join(directory, "corrupted.age");
    await writeFile(corrupted, ciphertext);
    assert.notEqual(invoke(age, ["-d", "-i", identity, "-o", join(directory, "rejected.bin"), corrupted]).status, 0);
  } finally {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("artmonia-backup-age-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
