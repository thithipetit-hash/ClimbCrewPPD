#!/usr/bin/env node
import path from "node:path";
import { decryptBackupFile, parseBackupEmailEncryptionKey } from "../admin-users/backup-encryption.js";

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error("Usage : BACKUP_EMAIL_ENCRYPTION_KEY=... node tools/decrypt-backup.mjs <backup.dump.ccbk> <backup.dump>");
  process.exit(2);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);

try {
  const key = parseBackupEmailEncryptionKey();
  const stats = await decryptBackupFile({ inputPath, outputPath, key });
  console.log(`Sauvegarde déchiffrée : ${outputPath} (${stats.size} octets)`);
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
