import test from "node:test";
import assert from "node:assert/strict";
import { validateRealisationPayload, ValidationError } from "../validation.js";

test("les tags autorisés sont normalisés et dédoublonnés", () => {
  const result = validateRealisationPayload({ tags: ["dalle", "technique", "dalle"] }, { partial: true });
  assert.deepEqual(result.tags, ["dalle", "technique"]);
});

test("un tag inconnu est refusé", () => {
  assert.throws(
    () => validateRealisationPayload({ tags: ["inconnu"] }, { partial: true }),
    ValidationError,
  );
});
