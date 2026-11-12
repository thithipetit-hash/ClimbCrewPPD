import test from "node:test";
import assert from "node:assert/strict";
import { buildKudoRanking } from "../src/lib/kudo-ranking.js";

const participants = [
  { id: "1", prenom: "Alice", nom: "A" },
  { id: "2", prenom: "Bruno", nom: "B" },
  { id: "3", prenom: "Chloé", nom: "C" },
];

const stats = [
  { participantId: "1", givenCount: 2, receivedCount: 5 },
  { participantId: "2", givenCount: 7, receivedCount: 1 },
  { participantId: "3", givenCount: 2, receivedCount: 5 },
];

test("classe les Kudos reçus avec gestion des ex aequo", () => {
  const ranking = buildKudoRanking({ participants, stats, metric: "received" });
  assert.deepEqual(
    ranking.map(({ participant, value, rank }) => [participant.id, value, rank]),
    [["1", 5, 1], ["3", 5, 1], ["2", 1, 3]],
  );
  assert.equal(ranking[0].displayValue, "5 Kudos reçus");
});

test("le filtre donnés utilise le nombre de Kudos distribués", () => {
  const ranking = buildKudoRanking({ participants, stats, metric: "given" });
  assert.deepEqual(
    ranking.map(({ participant, value }) => [participant.id, value]),
    [["2", 7], ["1", 2], ["3", 2]],
  );
  assert.equal(ranking[0].displayValue, "7 Kudos donnés");
});
