import { useMemo } from "react";
import { calculateClimberProfile } from "../lib/climber-profile.js";

function polarPoint(index, count, radius, centerX = 260, centerY = 205) {
  const angle = (-Math.PI / 2) + (index * Math.PI * 2) / count;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function pointsAttribute(points) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function KiviatChart({ characteristics }) {
  const count = characteristics.length;
  const radius = 140;
  if (count < 3) return <div className="muted-box">Pas assez de caractéristiques pour construire le Kiviat.</div>;

  const axes = characteristics.map((_, index) => polarPoint(index, count, radius));
  const dataPoints = characteristics.map((item, index) => {
    const score = Number.isFinite(item.score) ? Math.max(0, Math.min(100, item.score)) : 0;
    return polarPoint(index, count, radius * score / 100);
  });

  return (
    <div className="climber-kiviat">
      <svg viewBox="0 0 520 430" role="img" aria-labelledby="kiviat-title kiviat-description">
        <title id="kiviat-title">Kiviat des caractéristiques du grimpeur</title>
        <desc id="kiviat-description">Chaque axe présente un indice d’aisance compris entre zéro et cent pour une caractéristique de voie.</desc>
        {[25, 50, 75, 100].map((level) => (
          <polygon key={level} className={level === 50 ? "kiviat-grid kiviat-neutral" : "kiviat-grid"} points={pointsAttribute(characteristics.map((_, index) => polarPoint(index, count, radius * level / 100)))} />
        ))}
        {axes.map((point, index) => <line key={characteristics[index].value} className="kiviat-axis" x1="260" y1="205" x2={point.x} y2={point.y} />)}
        <polygon className="kiviat-area" points={pointsAttribute(dataPoints)} />
        {dataPoints.map((point, index) => (
          <circle key={characteristics[index].value} className="kiviat-point" cx={point.x} cy={point.y} r="4">
            <title>{characteristics[index].label} : {Number.isFinite(characteristics[index].score) ? `${characteristics[index].score} %` : "à découvrir"} · {characteristics[index].routeCount} voie{characteristics[index].routeCount > 1 ? "s" : ""}</title>
          </circle>
        ))}
        {characteristics.map((item, index) => {
          const point = polarPoint(index, count, 174);
          const anchor = point.x < 230 ? "end" : point.x > 290 ? "start" : "middle";
          return (
            <text key={item.value} className="kiviat-label" x={point.x} y={point.y} textAnchor={anchor} dominantBaseline="middle">
              <tspan x={point.x}>{item.label}</tspan>
              <tspan className="kiviat-label-score" x={point.x} dy="16">{Number.isFinite(item.score) ? `${item.score} %` : "À découvrir"} · {item.routeCount} voie{item.routeCount > 1 ? "s" : ""}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function ClimberProfilePanel({ realisations = [], routesById = {}, cprGrade = "" }) {
  const profile = useMemo(
    () => calculateClimberProfile({ realisations, routesById, cprGrade }),
    [realisations, routesById, cprGrade],
  );

  return (
    <section className="card climber-profile-card">
      <div className="climber-profile-layout">
        <div className="subcard climber-profile-skills">
          <KiviatChart characteristics={profile.characteristics} />

        </div>

      </div>

      {!cprGrade && profile.referenceGrade && (
        <div className="small climber-profile-reference-note">
          Le CPR n'étant pas disponible, la référence {profile.referenceGrade} est déduite de l'historique du grimpeur.
        </div>
      )}
    </section>
  );
}
