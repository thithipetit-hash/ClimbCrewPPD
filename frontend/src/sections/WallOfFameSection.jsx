import React, { useMemo, useState } from "react";
import { fullName } from "../lib/domain.js";
import { buildKudoRanking } from "../lib/kudo-ranking.js";

export default function WallOfFameSection({
  wallOfFameCategories,
  kudoStats = [],
  kudoStatsError = "",
  getPassportStyle,
  getPassportDotStyle,
  normalizePassport,
  wallOfFameSexFilter,
  setWallOfFameSexFilter,
}) {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [kudoMetric, setKudoMetric] = useState("received");

  const eligibleParticipants = useMemo(() => {
    const byId = new Map();
    wallOfFameCategories.forEach((category) => {
      category.entries.forEach((entry) => {
        if (entry?.participant?.id == null) return;
        byId.set(String(entry.participant.id), entry.participant);
      });
    });
    return [...byId.values()];
  }, [wallOfFameCategories]);

  const kudoCategory = useMemo(() => ({
    title: "Champion des Kudos",
    entries: buildKudoRanking({
      participants: eligibleParticipants,
      stats: kudoStats,
      metric: kudoMetric,
    }),
    kudoMetric,
    error: kudoStatsError,
  }), [eligibleParticipants, kudoMetric, kudoStats, kudoStatsError]);

  const displayedCategories = useMemo(
    () => [...wallOfFameCategories, kudoCategory],
    [wallOfFameCategories, kudoCategory],
  );

  function toggleCategory(title) {
    setExpandedCategories((current) => ({
      ...current,
      [title]: !current[title],
    }));
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Tableau d’honneur</h2>
        <div className="group">
          <select
            id="wall-of-fame-sex-filter"
            aria-label="Filtrer le Tableau d’honneur par sexe"
            value={wallOfFameSexFilter}
            onChange={(event) => setWallOfFameSexFilter(event.target.value)}
          >
            <option value="all">Tous</option>
            <option value="h">H</option>
            <option value="f">F</option>
          </select>
        </div>
      </div>
      <div className="grid three" id="wall-of-fame-rankings">
        {displayedCategories.map((category) => {
          const canExpand = category.entries.length > 3;
          const isExpanded = Boolean(expandedCategories[category.title]);
          const visibleEntries = isExpanded ? category.entries : category.entries.slice(0, 3);
          const categoryId = `wall-of-fame-${category.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
          const isKudoCategory = category.title === "Champion des Kudos";

          return (
            <div className="subcard" key={category.title}>
              <div className="card-header wall-of-fame-category-header">
                <h3>
                  {canExpand ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={categoryId}
                      aria-label={`${isExpanded ? "Compacter" : "Étendre"} le classement ${category.title}`}
                      onClick={() => toggleCategory(category.title)}
                      style={{
                        all: "unset",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        cursor: "pointer",
                        minHeight: "28px",
                        padding: "2px 6px",
                        lineHeight: 1.05,
                      }}
                    >
                      <span>{category.title}</span>
                      <span aria-hidden="true">{isExpanded ? "▴" : "▾"}</span>
                    </button>
                  ) : (
                    category.title
                  )}
                </h3>
                {isKudoCategory && (
                  <select
                    aria-label="Filtrer le champion des Kudos"
                    value={kudoMetric}
                    onChange={(event) => setKudoMetric(event.target.value)}
                  >
                    <option value="received">Reçus</option>
                    <option value="given">Donnés</option>
                  </select>
                )}
              </div>
              <div className="stack" id={categoryId}>
                {category.error ? (
                  <div className="muted-box" role="alert">{category.error}</div>
                ) : visibleEntries.length === 0 ? (
                  <div className="muted-box">Pas encore de classement.</div>
                ) : (
                  visibleEntries.map((entry) => (
                    <div
                      className="participant-row passport-row"
                      key={entry.participant.id}
                      style={getPassportStyle(entry.participant)}
                      data-passport={normalizePassport(entry.participant.passport)}
                    >
                      <span className="participant-identity">
                        <span aria-hidden="true">
                          {entry.rank === 1
                            ? "🥇"
                            : entry.rank === 2
                              ? "🥈"
                              : entry.rank === 3
                                ? "🥉"
                                : `${entry.rank}.`}
                        </span>
                        <span className="passport-dot" style={getPassportDotStyle(entry.participant)} aria-hidden="true" />
                        <span className="participant-name">{fullName(entry.participant)}</span>
                      </span>
                      <strong style={{ color: "inherit" }}>{entry.displayValue}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
