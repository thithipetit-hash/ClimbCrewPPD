import assert from "node:assert/strict";
import test from "node:test";
import { getFfmeSeasonYear } from "../../shared/ffme-age-categories.js";
import { calculateWallOfFameCategories } from "../src/lib/domain.js";
import { buildKudoRanking } from "../src/lib/kudo-ranking.js";
import {
  filterWallOfFameParticipants,
  UNSPECIFIED_FFME_CATEGORY,
} from "../src/lib/wall-of-fame-filters.js";

const seasonYear = getFfmeSeasonYear();
const participants = [
  { id: "1", prenom: "Alice", nom: "A", sexe: "f", anneeNaissance: seasonYear - 30 },
  { id: "2", prenom: "Bruno", nom: "B", sexe: "h", anneeNaissance: seasonYear - 43 },
  { id: "3", prenom: "Chloé", nom: "C", sexe: "f", anneeNaissance: seasonYear - 43 },
  { id: "4", prenom: "Diane", nom: "D", sexe: "f", anneeNaissance: null },
];

const ids = (items) => items.map(({ id }) => id);

test("le filtre FFME conserve Tous et accepte les catégories de la saison courante", () => {
  assert.deepEqual(ids(filterWallOfFameParticipants(participants)), ["1", "2", "3", "4"]);
  assert.deepEqual(ids(filterWallOfFameParticipants(participants, { ageCategory: "Sénior" })), ["1"]);
  assert.deepEqual(ids(filterWallOfFameParticipants(participants, { ageCategory: "Vétéran 1" })), ["2", "3"]);
});

test("les filtres catégorie et sexe se combinent, y compris sans date de naissance", () => {
  assert.deepEqual(
    ids(filterWallOfFameParticipants(participants, { sex: "f", ageCategory: "Vétéran 1" })),
    ["3"],
  );
  assert.deepEqual(
    ids(filterWallOfFameParticipants(participants, { sex: "f", ageCategory: UNSPECIFIED_FFME_CATEGORY })),
    ["4"],
  );
  assert.deepEqual(
    ids(filterWallOfFameParticipants(participants, { sex: "h", ageCategory: "Sénior" })),
    [],
  );
});

test("les rangs du Tableau d'honneur sont recalculés après filtrage", () => {
  const selected = filterWallOfFameParticipants(participants, { sex: "f", ageCategory: "Vétéran 1" });
  const rankings = calculateWallOfFameCategories({
    participants: selected,
    realisations: [],
    routesById: {},
    cprByParticipantId: {},
    pointsByParticipantId: { 1: 100, 2: 90, 3: 60, 4: 10 },
    participationCount: { 1: 1, 2: 1, 3: 1, 4: 1 },
  });
  const points = rankings.find(({ title }) => title === "Plus de points");
  assert.deepEqual(points.entries.map(({ participant, rank }) => [participant.id, rank]), [["3", 1]]);

  const kudos = buildKudoRanking({
    participants: selected,
    stats: [{ participantId: "2", receivedCount: 12 }, { participantId: "3", receivedCount: 7 }],
  });
  assert.deepEqual(kudos.map(({ participant, rank }) => [participant.id, rank]), [["3", 1]]);
});
