import React from "react";
import { calculateBmi, physicalConsistencyWarnings } from "../lib/profile-physical.js";

const MORPHOLOGY_FIELDS = [
  ["heightCm", "Taille", "cm"],
  ["weightKg", "Poids", "kg"],
  ["armSpanCm", "Envergure", "cm"],
  ["standingReachCm", "Portée bras levé", "cm"],
];
const TEST_FIELDS = [
  ["gripStrengthRightKg", "Préhension droite", "kg"],
  ["gripStrengthLeftKg", "Préhension gauche", "kg"],
  ["hang20mmSeconds", "Suspension 20 mm (complète ou délestée)", "s"],
  ["jugHangSeconds", "Suspension sur bac", "s"],
  ["strictPullups", "Tractions strictes", "nb"],
  ["flexedArmHangSeconds", "Suspension bras fléchis à 90°", "s"],
  ["hipMobilityCm", "Mobilité / ouverture hanches", "cm"],
];
const KEYS = [...MORPHOLOGY_FIELDS, ...TEST_FIELDS].map(([key]) => key);

function normalizeNumericInput(value) {
  return String(value ?? "").replace(",", ".").replace(/[^0-9.-]/g, "");
}

export default function PhysicalProfileCard({ participant, editable, onUpdate }) {
  const [draft, setDraft] = React.useState(() => Object.fromEntries(KEYS.map((key) => [key, participant?.[key] ?? ""])));
  const [saveMessage, setSaveMessage] = React.useState("");

  React.useEffect(() => {
    setDraft(Object.fromEntries(KEYS.map((key) => [key, participant?.[key] ?? ""])));
  }, [participant?.id, ...KEYS.map((key) => participant?.[key])]);

  const merged = { ...participant, ...draft };
  const bmi = calculateBmi(merged.heightCm, merged.weightKg);
  const warnings = physicalConsistencyWarnings(merged);
  const ape = Number(merged.heightCm) > 0 && Number(merged.armSpanCm) > 0
    ? Number(merged.armSpanCm) - Number(merged.heightCm) : null;
  const relativeReach = Number(merged.heightCm) > 0 && Number(merged.armSpanCm) > 0
    ? Number(merged.armSpanCm) / Number(merged.heightCm) : null;

  async function save(key) {
    if (!editable || !onUpdate) return;
    const raw = draft[key];
    const value = raw === "" ? "" : Number(raw);
    if (raw !== "" && !Number.isFinite(value)) {
      setSaveMessage("Valeur numérique invalide.");
      return;
    }
    try {
      await onUpdate({ [key]: raw === "" ? "" : value });
      setSaveMessage("Valeur enregistrée.");
    } catch (error) {
      setSaveMessage(String(error?.message || error));
    }
  }

  function field([key, label, unit]) {
    return <div key={key}>
      <label htmlFor={`physical-${key}`}>{label} ({unit})</label>
      <input
        id={`physical-${key}`}
        type="text"
        inputMode={key === "strictPullups" ? "numeric" : "decimal"}
        value={draft[key] ?? ""}
        disabled={!editable}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: normalizeNumericInput(event.target.value) }))}
        onBlur={() => void save(key)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        autoComplete="off"
      />
    </div>;
  }

  return <div className="card profile-physical-card">
    <div className="card-header"><h3>Profil physique</h3></div>
    <div className="grid four">{MORPHOLOGY_FIELDS.map(field)}</div>
    <div className="group" style={{ marginTop: 10 }}>
      <span className="pill">Ape Index : {ape === null ? "-" : `${ape.toFixed(1)} cm`}</span>
      <span className="pill">Allonge relative : {relativeReach === null ? "-" : relativeReach.toFixed(3)}</span>
      <span className="pill">IMC : {bmi === null ? "-" : bmi.toFixed(1)}</span>
    </div>
    {warnings.length > 0 && <div className="error" role="alert" style={{ marginTop: 10 }}>
      <strong>Vérification de cohérence</strong>
      {warnings.map((warning) => <div className="small" key={warning}>⚠️ {warning}</div>)}
    </div>}
    <h4 style={{ marginBottom: 8 }}>Tests physiques</h4>
    <div className="grid four">{TEST_FIELDS.map(field)}</div>
    {editable && <div className="small" style={{ marginTop: 8 }}>
      Saisie au clavier. La valeur est enregistrée en quittant le champ ou avec Entrée. Les données restent facultatives.
      {saveMessage && <> · {saveMessage}</>}
    </div>}
  </div>;
}
