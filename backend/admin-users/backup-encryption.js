import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("CCBK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

export function parseBackupEmailEncryptionKey(value = process.env.BACKUP_EMAIL_ENCRYPTION_KEY) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(
      "BACKUP_EMAIL_ENCRYPTION_KEY est requis pour envoyer une sauvegarde par e-mail. " +
      "Générer une clé dédiée avec : openssl rand -base64 32",
    );
  }

  let key;
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    key = Buffer.from(text, "hex");
  } else {
    key = Buffer.from(text, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "BACKUP_EMAIL_ENCRYPTION_KEY doit contenir exactement 32 octets " +
      "(Base64 recommandé, ou 64 caractères hexadécimaux)",
    );
  }
  return key;
}

export function encryptedBackupFileName(fileName) {
  const safeName = String(fileName || "").trim();
  if (!safeName) throw new Error("Nom de sauvegarde absent");
  return `${safeName}.ccbk`;
}

export async function encryptBackupFile({ inputPath, outputPath, key }) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error("Clé de chiffrement AES-256 invalide");
  }

  const iv = randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(header);

  try {
    await fs.writeFile(outputPath, header, { flag: "wx", mode: 0o600 });
    await pipeline(
      createReadStream(inputPath),
      cipher,
      createWriteStream(outputPath, { flags: "a", mode: 0o600 }),
    );
    await fs.appendFile(outputPath, cipher.getAuthTag());
    const stats = await fs.stat(outputPath);
    return { size: stats.size, format: "CCBK1", algorithm: "AES-256-GCM" };
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function decryptBackupFile({ inputPath, outputPath, key }) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error("Clé de déchiffrement AES-256 invalide");
  }

  const stats = await fs.stat(inputPath);
  if (!stats.isFile() || stats.size <= HEADER_BYTES + TAG_BYTES) {
    throw new Error("Fichier de sauvegarde chiffré invalide ou incomplet");
  }

  const handle = await fs.open(inputPath, "r");
  let header;
  let tag;
  try {
    header = Buffer.alloc(HEADER_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, stats.size - TAG_BYTES);
  } finally {
    await handle.close();
  }

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Format de sauvegarde chiffrée inconnu");
  }

  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  try {
    await pipeline(
      createReadStream(inputPath, {
        start: HEADER_BYTES,
        end: stats.size - TAG_BYTES - 1,
      }),
      decipher,
      createWriteStream(outputPath, { flags: "wx", mode: 0o600 }),
    );
    return fs.stat(outputPath);
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    const wrapped = new Error("Impossible de déchiffrer la sauvegarde : clé incorrecte ou fichier altéré");
    wrapped.cause = error;
    throw wrapped;
  }
}
