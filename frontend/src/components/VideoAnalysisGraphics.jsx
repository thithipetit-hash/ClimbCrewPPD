import React from "react";
import { buildVideoDisplay, comparisonGraphRows, timelineItems } from "../lib/video-analysis-display.js";

const COLORS = { pause: "#d49a27", dynamic: "#b54b36", "foot-adjustment": "#2875b5" };
const LABELS = { pause: "Pause", dynamic: "Dynamisme", "foot-adjustment": "Ajustement pied" };
const pct = (ratio) => ratio === null ? "—" : `${Math.round(ratio * 100)} %`;
const clock = (time) => `${Math.floor(time/60)}:${String(Math.floor(time%60)).padStart(2,"0")}`;
const number = (value) => value === null ? "—" : String(Math.round(value * 10) / 10);

function Bar({ ratio, color = "#2875b5" }) {
  if (ratio === null) return <div className="small">Non mesuré</div>;
  return <div aria-hidden="true" style={{ height: 10, background: "#cbd5e1", borderRadius: 5, overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(1, ratio))*100}%`, height: "100%", background: color }} /></div>;
}

export function AnalysisGraphics({ metrics, onSeek }) {
  const data = buildVideoDisplay(metrics);
  const items = timelineItems(metrics);
  const duration = metrics.duration;
  return <div className="stack" style={{ marginTop: 12 }}>
    <section className="subcard">
      <strong>Répartition du temps observé</strong>
      {data.pauseRatio === null ? <p className="small">Mesure indisponible</p> : <>
        <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${(1-data.pauseRatio)*100}%`, background: "#2875b5" }} />
          <div style={{ width: `${data.pauseRatio*100}%`, background: COLORS.pause }} />
        </div>
        <p className="small">Hors pauses détectées : {pct(1-data.pauseRatio)} · Pauses : {pct(data.pauseRatio)}</p>
      </>}
      <strong>Économie des bras</strong>
      {[["Gauche", data.armLeftRatio], ["Droite", data.armRightRatio]].map(([label, ratio]) => <div key={label} style={{ marginTop: 6 }}>
        <div className="small">Bras {label.toLowerCase()} fléchi : {pct(ratio)} du temps analysable</div><Bar ratio={ratio} color={COLORS.pause} />
      </div>)}
      <p className="small">Les bras sont rapportés au temps analysable du corps. Les pauses sont rapportées aux intervalles de mouvement observables lorsque cette couverture est disponible.</p>
    </section>
    {items.length > 0 && <section className="subcard">
      <strong>Chronologie des événements</strong>
      <svg viewBox="0 0 320 74" role="img" aria-label="Chronologie des pauses, pics dynamiques et ajustements de pieds" style={{ width: "100%", height: "auto" }}>
        <rect x="12" y="13" width="296" height="12" rx="3" fill="#94a3b8" opacity=".5" />
        {items.map((item,i) => {
          const x = 12 + item.start / duration * 296;
          const color = COLORS[item.kind];
          return item.kind === "pause"
            ? <rect key={i} x={x} y="13" width={Math.max(1, (item.end-item.start)/duration*296)} height="12" fill={color}><title>{LABELS[item.kind]} {clock(item.start)}</title></rect>
            : <circle key={i} cx={x} cy={item.kind === "dynamic" ? 32 : 43} r="2.7" fill={color}><title>{LABELS[item.kind]} {clock(item.start)}</title></circle>;
        })}
        {[0,.25,.5,.75,1].map(f => <text key={f} x={12+296*f} y="62" textAnchor={f===0?"start":f===1?"end":"middle"} fontSize="9" fill="currentColor">{clock(duration*f)}</text>)}
      </svg>
      <div className="group">{Object.entries(LABELS).map(([kind,label]) => <span key={kind} className="small"><span style={{ color: COLORS[kind] }}>●</span> {label}</span>)}</div>
      {onSeek && <label className="small">Revoir un événement
        <select value="" onChange={event => { if (event.target.value !== "") onSeek(Number(event.target.value)); }}>
          <option value="">Sélectionner un passage</option>
          {items.map((item,i) => <option key={i} value={item.start}>{clock(item.start)} · {LABELS[item.kind]}</option>)}
        </select>
      </label>}
      <p className="small">Le fond gris représente la durée vidéo, y compris les périodes non observables.</p>
    </section>}
    <section className="subcard">
      <strong>Bilan par domaine</strong>
      <div className="stats-grid" style={{ marginTop: 8 }}>
        {data.domains.map(domain => <div className="muted-box" key={domain.label}>
          <strong>{domain.label}</strong>
          {domain.observations.map(([label,value]) => <div className="small" key={label}>{label} : <b>{number(value)}</b></div>)}
          <p className="small">{domain.context}</p>
        </div>)}
      </div>
      <p className="small">Bilan descriptif, sans note ni classement : les mesures ne suffisent pas à juger la qualité technique.</p>
    </section>
  </div>;
}

export function ComparisonGraphics({ comparison }) {
  const rows = comparisonGraphRows(comparison);
  if (!rows.length) return null;
  return <section className="stack" style={{ marginTop: 10 }}>
    <strong>Comparaison graphique A / B</strong>
    {!comparison.comparable && <div className="muted-box small">Versions moteur ou règles différentes/inconnues : écarts descriptifs, non interprétables comme un progrès.</div>}
    {rows.map(row => {
      const max = Math.max(row.a,row.b,0.000001);
      return <div key={row.key} className="muted-box">
        <div><strong>{row.label}</strong> <span className="small">· B−A : {row.deltaDisplay}</span></div>
        <div className="small">A : {row.aDisplay}</div><Bar ratio={row.a/max} color="#64748b" />
        <div className="small">B : {row.bDisplay}</div><Bar ratio={row.b/max} />
      </div>;
    })}
    <p className="small">Comparer des passages similaires, sur la même voie, avec un cadrage comparable. Une baisse ou hausse n’est pas nécessairement positive.</p>
  </section>;
}
