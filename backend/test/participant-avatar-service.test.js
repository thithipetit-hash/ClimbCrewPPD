import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodeCustomAvatarDataUrl,
  resolveCustomAvatarUpdate,
} from "../admin-users/participant-avatar-service.js";

const source = await readFile(
  new URL("../admin-users/participant-avatar-service.js", import.meta.url),
  "utf8",
);

function minimalWebpDataUrl() {
  const buffer = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([4, 0, 0, 0]),
    Buffer.from("WEBP", "ascii"),
  ]);
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

test("un WebP valide est décodé avant stockage", () => {
  const buffer = decodeCustomAvatarDataUrl(minimalWebpDataUrl());
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
});

test("un faux WebP avec simple préfixe data URL est refusé", () => {
  const fake = `data:image/webp;base64,${Buffer.from("not-a-webp").toString("base64")}`;
  assert.throws(() => decodeCustomAvatarDataUrl(fake), /WebP valide/);
});

test("le marqueur remote conserve l image existante sans Base64", () => {
  assert.deepEqual(resolveCustomAvatarUpdate("remote"), {
    keepExisting: true,
    value: null,
  });
});

test("une chaîne vide demande explicitement la suppression", () => {
  assert.deepEqual(resolveCustomAvatarUpdate(""), {
    keepExisting: false,
    value: "",
  });
});

test("un nouveau WebP valide remplace l image", () => {
  const dataUrl = minimalWebpDataUrl();
  assert.deepEqual(resolveCustomAvatarUpdate(dataUrl), {
    keepExisting: false,
    value: dataUrl,
  });
});

test("PATCH profil préserve sexe et confidentialité lorsqu'ils sont absents", () => {
  assert.match(source, /const hasField = \(field\) => Object\.prototype\.hasOwnProperty\.call\(body, field\)/);
  assert.match(source, /profilePublic = hasField\("profilePublic"\) \? body\.profilePublic !== false : null/);
  assert.match(source, /sexe = hasField\("sexe"\) \? cleanSexe\(body\.sexe\) : null/);
  assert.match(source, /profile_public = coalesce\(\$4::boolean, profile_public\)/);
  assert.match(source, /sexe = coalesce\(\$7, sexe\)/);
});

test("PATCH profil est limité à la fiche liée au compte connecté", () => {
  assert.match(source, /const participantId = Number\(participantIdForUser\(user\)\)/);
  assert.match(source, /where id = \$1/);
  assert.equal(source.includes("req.params?.id"), true, "la lecture d'avatar peut utiliser un id de route");
  const patchSection = source.slice(
    source.indexOf("export async function updateOwnParticipantProfile"),
    source.indexOf("export async function getParticipantCustomAvatar"),
  );
  assert.equal(patchSection.includes("req.params"), false);
});
