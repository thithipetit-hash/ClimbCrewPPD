import test from "node:test";
import assert from "node:assert/strict";
import { validateRoutePayload, ValidationError } from "../validation.js";

test("les caractéristiques autorisées d'une voie sont normalisées et dédoublonnées", () => {
  const result = validateRoutePayload({ tags: ["dalle", "technique", "dalle"] }, { partial: true });
  assert.deepEqual(result.tags, ["dalle", "technique"]);
});

test("une caractéristique de voie inconnue est refusée", () => {
  assert.throws(
    () => validateRoutePayload({ tags: ["inconnu"] }, { partial: true }),
    ValidationError,
  );
});
