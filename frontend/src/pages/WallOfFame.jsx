import React from "react";
import WallOfFameSection from "../sections/WallOfFameSection.jsx";
import { apiFetch } from "../lib/api.js";

export default function WallOfFame({
  wallOfFameCategories,
  getPassportStyle,
  getPassportDotStyle,
  normalizePassport,
  wallOfFameSexFilter,
  setWallOfFameSexFilter,
}) {
  const [kudoStats, setKudoStats] = React.useState([]);
  const [kudoStatsError, setKudoStatsError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    apiFetch("/realisations/kudos/stats")
      .then((stats) => {
        if (!mounted) return;
        setKudoStats(Array.isArray(stats) ? stats : []);
        setKudoStatsError("");
      })
      .catch((error) => {
        if (!mounted) return;
        setKudoStats([]);
        setKudoStatsError(String(error.message || error));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <WallOfFameSection
      wallOfFameCategories={wallOfFameCategories}
      kudoStats={kudoStats}
      kudoStatsError={kudoStatsError}
      getPassportStyle={getPassportStyle}
      getPassportDotStyle={getPassportDotStyle}
      normalizePassport={normalizePassport}
      wallOfFameSexFilter={wallOfFameSexFilter}
      setWallOfFameSexFilter={setWallOfFameSexFilter}
    />
  );
}
