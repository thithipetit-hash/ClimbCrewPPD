import React from "react";
import Button from "./Button.jsx";
import {
  DEFAULT_VIDEO_ANALYSIS_RULES,
  VIDEO_ANALYSIS_RULE_DEFINITIONS,
  fetchVideoAnalysisRules,
  loadVideoAnalysisRules,
  resetVideoAnalysisRules,
  saveVideoAnalysisRules,
} from "../lib/video-analysis-rules.js";

export default function VideoAnalysisRulesAdmin() {
  const [rules, setRules] = React.useState(() => loadVideoAnalysisRules());
  const [savedMessage, setSavedMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchVideoAnalysisRules()
      .then((loaded) => {
        if (!cancelled) setRules(loaded);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(String(caughtError?.message || caughtError));
      });
    return () => { cancelled = true; };
  }, []);

  function updateRule(key, value) {
    setRules((current) => ({ ...current, [key]: Number(value) }));
    setSavedMessage("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      setRules(await saveVideoAnalysisRules(rules));
      setSavedMessage("Règles globales enregistrées pour le club.");
    } catch (caughtError) {
      setError(String(caughtError?.message || caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError("");
    try {
      setRules(await resetVideoAnalysisRules());
      setSavedMessage("Valeurs par défaut restaurées pour le club.");
    } catch (caughtError) {
      setError(String(caughtError?.message || caughtError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="muted-box" style={{ marginBottom: 12 }}>
        Les seuils ci-dessous pilotent l’analyse MediaPipe. Ils sont enregistrés côté serveur et s’appliquent à tous les membres du club. Une copie locale n’est conservée que comme secours hors connexion.
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
                    disabled={saving}
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
        <Button onClick={save} disabled={saving}>Enregistrer les règles</Button>
        <Button variant="secondary" onClick={reset} disabled={saving}>Valeurs par défaut</Button>
      </div>
      {savedMessage && <div className="success" style={{ marginTop: 10 }}>{savedMessage}</div>}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      <div className="small" style={{ marginTop: 10 }}>
        Les seuils sont expérimentaux : ils doivent être validés sur des vidéos réelles avant d’être considérés comme des références techniques du club.
      </div>
    </div>
  );
}
