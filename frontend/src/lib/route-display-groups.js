import { GRADES, normalizeRopeNumber } from "./domain.js";

function routeGrade(route) {
  return route?.cotationAjustee || route?.cotationReference || "nc";
}

export function buildRouteDisplayGroups({ routes = [], ropes = [], sortMode = "corde" } = {}) {
  if (sortMode === "cotation") {
    const gradeRank = new Map(GRADES.map((grade, index) => [grade, index]));
    const grades = [...new Set(routes.map(routeGrade))].sort((gradeA, gradeB) => {
      const rankA = gradeRank.has(gradeA) ? gradeRank.get(gradeA) : Number.MAX_SAFE_INTEGER;
      const rankB = gradeRank.has(gradeB) ? gradeRank.get(gradeB) : Number.MAX_SAFE_INTEGER;
      return rankA - rankB || String(gradeA).localeCompare(String(gradeB), "fr");
    });

    return grades.map((grade) => ({
      key: `cotation-${grade}`,
      label: `Cotation ${grade}`,
      routes: routes.filter((route) => routeGrade(route) === grade),
    }));
  }

  return [...new Set(routes.map((route) => normalizeRopeNumber(route.numeroCorde)))]
    .sort((numeroA, numeroB) => numeroA - numeroB)
    .map((numeroCorde) => {
      const rope = ropes.find((item) => normalizeRopeNumber(item.numeroCorde) === numeroCorde);
      return {
        key: `corde-${numeroCorde}`,
        label: `Corde ${numeroCorde}${rope?.couleurCorde ? ` · ${rope.couleurCorde}` : ""}`,
        routes: routes.filter((route) => normalizeRopeNumber(route.numeroCorde) === numeroCorde),
      };
    });
}
