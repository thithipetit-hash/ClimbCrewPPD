import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("l'interface confirme les suppressions définitives", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const routeManagement = await readFile(new URL("../src/hooks/useRouteManagement.js", import.meta.url), "utf8");
  const participantManagement = await readFile(new URL("../src/hooks/useParticipantManagement.js", import.meta.url), "utf8");
  // Les boutons "Supprimer la voie" / "Supprimer le compte" ont été extraits dans
  // pages/Voies.jsx et pages/GestionComptes.jsx, et rendus via le composant <Button>
  // (JSX, donc fermé par </Button> et non plus </button>).
  const voies = await readFile(new URL("../src/pages/Voies.jsx", import.meta.url), "utf8");
  const gestionComptes = await readFile(new URL("../src/pages/GestionComptes.jsx", import.meta.url), "utf8");

  assert.match(participantManagement, /Supprimer définitivement le grimpeur/);
  assert.match(routeManagement, /Supprimer définitivement la voie/);
  assert.match(routeManagement, /seront conservées dans l’historique/);
  assert.match(source, /Supprimer définitivement le compte/);
  assert.match(voies, /Supprimer la voie<\/Button>/);
  assert.match(gestionComptes, /Supprimer le compte<\/Button>/);
  assert.match(routeManagement, /Voie supprimée\./);
  assert.match(routeManagement, /Historique conservé/);
  assert.match(source, /Compte supprimé\./);
  assert.match(participantManagement, /Grimpeur supprimé\./);
});
