import React from "react";
import Button from "./Button.jsx";
import {
  DEFAULT_VIDEO_ANALYSIS_RULES,
  VIDEO_ANALYSIS_RULE_DEFINITIONS,
  loadVideoAnalysisRules,
  resetVideoAnalysisRules,
  saveVideoAnalysisRules,
} from "../lib/video-analysis-rules.js";

export default function VideoAnalysisRulesAdmin() {
  const [rules, setRules] = React.useState(() => loadVideoAnalysisRules());
  const [savedMessage, setSavedMessage] = React.useState("");

  function updateRule(key, value) {
    setRules((current) => ({ ...current, [key]: Number(value) }));
    setSavedMessage("");
  }

  function save() {
    setRules(saveVideoAnalysisRules(rules));
    setSavedMessage("Règles enregistrées sur cet appareil.");
  }

  function reset() {
    setRules(resetVideoAnalysisRules());
    setSavedMessage("Valeurs par défaut restaurées.");
  }

  return (
    <div>
      <div className="muted-box" style={{ marginBottom: 12 }}>
        Les seuils ci-dessous pilotent l’analyse MediaPipe. Cette première version les conserve localement dans le navigateur de l’administrateur afin de permettre la calibration sans modifier les données métier.
      </div>

      <div className="stack">
        {VIDEO_ANALYSIS_RULE_DEFINITIONS.map((definition) => {
          const defaultValue = DEFAULT_VIDEO_ANALYSIS_RULES[definition.key];
          return (
            <div className="subcard" key={definition.key}>
              <div className="grid three">
                <div>
                  <strong>{definition.label}</strong>
                  <div className="small">Défaut : {defaultValue}{definition.unit ? ` ${definition.unit}` : ""}</div>
                </div>
                <div>
                  <label htmlFor={`video-analysis-rule-${definition.key}`}>Valeur</label>
                  <input
                    id={`video-analysis-rule-${definition.key}`}
                    type="number"
                    min={definition.min}
                    max={definition.max}
                    step={definition.step}
                    value={rules[definition.key]}
                    onChange={(event) => updateRule(definition.key, event.target.value)}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "end" }}>
                  <span className="pill">{definition.unit || "seuil"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="group" style={{ marginTop: 12 }}>
        <Button onClick={save}>Enregistrer les règles</Button>
        <Button variant="secondary" onClick={reset}>Valeurs par défaut</Button>
      </div>
      {savedMessage && <div className="success" style={{ marginTop: 10 }}>{savedMessage}</div>}

      <div className="small" style={{ marginTop: 10 }}>
        Les seuils sont expérimentaux : ils doivent être validés sur des vidéos réelles avant d’être considérés comme des références techniques du club.
      </div>
    </div>
  );
}
