import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decryptBackupFile,
  encryptBackupFile,
  encryptedBackupFileName,
  parseBackupEmailEncryptionKey,
} from "../admin-users/backup-encryption.js";

async function withTempDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "climbcrew-backup-encryption-"));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("backup email key accepts 32-byte Base64 and hexadecimal values", () => {
  const base64 = Buffer.alloc(32, 7).toString("base64");
  const hex = Buffer.alloc(32, 9).toString("hex");
  assert.equal(parseBackupEmailEncryptionKey(base64).length, 32);
  assert.equal(parseBackupEmailEncryptionKey(hex).length, 32);
  assert.throws(() => parseBackupEmailEncryptionKey("too-short"), /32 octets/);
});

test("encrypted backup uses a distinct .ccbk filename", () => {
  assert.equal(
    encryptedBackupFileName("climbcrew-manual-2026-08-22-210000.dump"),
    "climbcrew-manual-2026-08-22-210000.dump.ccbk",
  );
});

test("AES-256-GCM round trip restores the exact dump bytes", async () => {
  await withTempDir(async (dir) => {
    const input = path.join(dir, "input.dump");
    const encrypted = path.join(dir, "input.dump.ccbk");
    const output = path.join(dir, "output.dump");
    const payload = Buffer.concat([
      Buffer.from("PGDMP\0ClimbCrew test\n", "utf8"),
      Buffer.alloc(32 * 1024, 0x5a),
    ]);
    const key = Buffer.alloc(32, 0x2a);

    await fs.writeFile(input, payload);
    const metadata = await encryptBackupFile({ inputPath: input, outputPath: encrypted, key });
    assert.equal(metadata.algorithm, "AES-256-GCM");
    assert.equal(metadata.format, "CCBK1");

    await decryptBackupFile({ inputPath: encrypted, outputPath: output, key });
    assert.deepEqual(await fs.readFile(output), payload);
  });
});

test("AES-256-GCM rejects an incorrect key and removes partial plaintext", async () => {
  await withTempDir(async (dir) => {
    const input = path.join(dir, "input.dump");
    const encrypted = path.join(dir, "input.dump.ccbk");
    const output = path.join(dir, "output.dump");

    await fs.writeFile(input, Buffer.alloc(4096, 0x41));
    await encryptBackupFile({ inputPath: input, outputPath: encrypted, key: Buffer.alloc(32, 1) });

    await assert.rejects(
      decryptBackupFile({ inputPath: encrypted, outputPath: output, key: Buffer.alloc(32, 2) }),
      /clé incorrecte ou fichier altéré/,
    );
    await assert.rejects(fs.access(output));
  });
});
