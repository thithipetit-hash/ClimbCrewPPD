import React, { useMemo, useState } from "react";
import { getFfmeAgeCategory } from "../../../shared/ffme-age-categories.js";
import { apiFetch } from "../lib/api.js";
import {
  USER_DATA_BOOLEAN_KEYS,
  USER_DATA_COLUMNS,
  USER_DATA_COLUMN_WIDTHS,
  USER_DATA_FILTER_CHOICES,
  USER_DATA_PASSPORT_OPTIONS,
  buildParticipantQualificationsPayload,
  buildParticipantUpdatePayload,
  compactUserDataColumnWidth,
  displayUserDataValue,
  participantQualificationsChanged,
  yesNo,
} from "../lib/user-data-management.js";

const MOBILE_WIDE_FIELD_KEYS = new Set(["nom", "prenom", "email", "passport", "categorieFfme"]);
const MOBILE_READ_ONLY_KEYS = new Set(["accountAssociated", "sessions"]);

function stickyColumnStyle(key, header = false) {
  if (key !== "nom" && key !== "prenom") return {};
  return {
    position: "sticky",
    left: key === "nom" ? 0 : USER_DATA_COLUMN_WIDTHS.nom,
    zIndex: header ? 5 : 3,
    background: header ? "var(--card-bg, #eee)" : "var(--surface, white)",
    boxShadow: key === "prenom" ? "2px 0 0 var(--border, #bbb)" : undefined,
  };
}

function PassportSelect({ value, onChange }) {
  return (
    <select value={value || "sans"} onChange={onChange} style={{ width: "100%", minWidth: 0, fontSize: "inherit", padding: "4px 2px" }}>
      {USER_DATA_PASSPORT_OPTIONS.map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  );
}

export default function DonneesUtilisateurs({ participants = [], sessions = [], onSaved, newParticipant, setNewParticipant, addParticipant }) {
  const [sortKey, setSortKey] = useState("nom");
  const [ascending, setAscending] = useState(true);
  const [filters, setFilters] = useState({});
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sessionCountByParticipantId = useMemo(() => {
    const counts = {};
    sessions.forEach((session) => {
      (session.participantIds || []).forEach((id) => {
        counts[String(id)] = (counts[String(id)] || 0) + 1;
      });
    });
    return counts;
  }, [sessions]);

  const valueFor = (participant, key) => (
    key === "sessions"
      ? (sessionCountByParticipantId[String(participant.id)] || 0)
      : displayUserDataValue(participant, key)
  );

  const rows = useMemo(() => participants.filter((participant) =>
    USER_DATA_COLUMNS.every(([key]) => {
      const filter = filters[key];
      if (USER_DATA_BOOLEAN_KEYS.has(key)) {
        if (filter !== "oui" && filter !== "non") return true;
        return Boolean(participant[key]) === (filter === "oui");
      }
      if (key === "passport" && filter) {
        return (participant.passport || "sans") === filter;
      }
      if (key === "sexe" && filter) {
        return participant.sexe === filter;
      }
      const query = String(filter ?? "").trim().toLocaleLowerCase("fr");
      return !query || String(valueFor(participant, key)).toLocaleLowerCase("fr").includes(query);
    })
  ).slice().sort((left, right) => (
    String(valueFor(left, sortKey)).localeCompare(
      String(valueFor(right, sortKey)),
      "fr",
      { numeric: true },
    ) * (ascending ? 1 : -1)
  )), [participants, filters, sortKey, ascending, sessionCountByParticipantId]);

  function draftFor(participant) {
    return drafts[participant.id] || participant;
  }

  function setField(participant, key, value) {
    setDrafts((current) => ({
      ...current,
      [participant.id]: {
        ...participant,
        ...(current[participant.id] || {}),
        [key]: value,
      },
    }));
    setMessage("");
    setError("");
  }

  async function removeParticipant(participant) {
    const label = `${participant.prenom || ""} ${participant.nom || ""}`.trim() || "cet utilisateur";
    if (!window.confirm(`Supprimer ${label} ? Cette action est irréversible.`)) return;
    setSavingId(participant.id);
    setMessage("");
    setError("");
    try {
      await apiFetch(`/participants/${encodeURIComponent(participant.id)}`, { method: "DELETE" });
      setDrafts((current) => {
        const next = { ...current };
        delete next[participant.id];
        return next;
      });
      if (onSaved) await onSaved();
      setMessage(`${label} supprimé.`);
    } catch (saveError) {
      setError(String(saveError.message || saveError));
    } finally {
      setSavingId(null);
    }
  }

  async function saveParticipant(participant, draft) {
    await apiFetch(`/participants/${encodeURIComponent(participant.id)}`, {
      method: "PUT",
      body: JSON.stringify(buildParticipantUpdatePayload(participant, draft)),
    });

    if (participantQualificationsChanged(participant, draft)) {
      await apiFetch(`/admin/participants/${encodeURIComponent(participant.id)}/qualifications`, {
        method: "PUT",
        body: JSON.stringify(buildParticipantQualificationsPayload(draft)),
      });
    }
  }

  async function saveAll() {
    const changed = participants.filter((participant) => drafts[participant.id]);
    if (!changed.length) return;

    setSavingAll(true);
    setMessage("");
    setError("");

    const savedIds = [];
    let failedParticipant = null;
    let failure = null;

    try {
      for (const participant of changed) {
        try {
          await saveParticipant(participant, draftFor(participant));
          savedIds.push(String(participant.id));
        } catch (saveError) {
          failedParticipant = participant;
          failure = saveError;
          break;
        }
      }

      if (onSaved) await onSaved();

      setDrafts((current) => {
        const next = { ...current };
        savedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      if (failure) {
        const failedLabel = `${failedParticipant?.prenom || ""} ${failedParticipant?.nom || ""}`.trim() || "un utilisateur";
        const prefix = savedIds.length
          ? `${savedIds.length} utilisateur${savedIds.length > 1 ? "s" : ""} enregistré${savedIds.length > 1 ? "s" : ""}. `
          : "";
        setError(`${prefix}Échec pour ${failedLabel} : ${String(failure.message || failure)}. Les modifications non enregistrées sont conservées.`);
      } else {
        setMessage(`${savedIds.length} utilisateur${savedIds.length > 1 ? "s" : ""} enregistré${savedIds.length > 1 ? "s" : ""}. Données actualisées.`);
      }
    } catch (refreshError) {
      setError(`Les modifications ont été traitées, mais l’actualisation des données a échoué : ${String(refreshError.message || refreshError)}.`);
    } finally {
      setSavingAll(false);
    }
  }

  function editor(participant, key) {
    if (key === "sessions") return sessionCountByParticipantId[String(participant.id)] || 0;
    if (key === "accountAssociated") return yesNo(Boolean(participant.accountAssociated));
    if (key === "categorieFfme") return displayUserDataValue(draftFor(participant), key);

    const draft = draftFor(participant);
    const value = draft[key];

    if (USER_DATA_BOOLEAN_KEYS.has(key)) {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => setField(participant, key, event.target.checked)}
          aria-label={`${USER_DATA_COLUMNS.find((column) => column[0] === key)?.[1]} ${participant.prenom} ${participant.nom}`}
        />
      );
    }
    if (key === "anneeNaissance") {
      return (
        <input
          type="number"
          min="1900"
          max={new Date().getFullYear() - 18}
          step="1"
          value={value ?? ""}
          onChange={(event) => setField(participant, key, event.target.value)}
          aria-label={`Année de naissance ${participant.prenom} ${participant.nom}`}
          style={{ width: "100%", minWidth: 0, boxSizing: "border-box", fontSize: "inherit", padding: "4px 2px" }}
        />
      );
    }
    if (key === "sexe") {
      return (
        <select value={value || ""} onChange={(event) => setField(participant, key, event.target.value)} style={{ width: "100%", minWidth: 0, fontSize: "inherit", padding: "4px 2px" }}>
          <option value="">-</option>
          <option value="h">H</option>
          <option value="f">F</option>
        </select>
      );
    }
    if (key === "passport") {
      return <PassportSelect value={value} onChange={(event) => setField(participant, key, event.target.value)} />;
    }

    const text = String(value ?? "");
    return (
      <input
        value={text}
        onChange={(event) => setField(participant, key, event.target.value)}
        style={{ width: "100%", minWidth: 0, boxSizing: "border-box", fontSize: "inherit", padding: "4px 5px" }}
      />
    );
  }

  function filterEditor(key, label) {
    const commonProps = {
      "aria-label": `Filtrer ${label}`,
      value: filters[key] || "",
      onChange: (event) => setFilters((current) => ({ ...current, [key]: event.target.value })),
      onClick: (event) => event.stopPropagation(),
    };

    if (USER_DATA_BOOLEAN_KEYS.has(key)) {
      return (
        <select {...commonProps}>
          <option value="">Tout</option>
          <option value="oui">Oui</option>
          <option value="non">Non</option>
        </select>
      );
    }
    if (USER_DATA_FILTER_CHOICES[key]) {
      return (
        <select {...commonProps}>
          <option value="">Tous</option>
          {USER_DATA_FILTER_CHOICES[key].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      );
    }
    return <input {...commonProps} placeholder="Filtrer" />;
  }

  function exportCsv() {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      USER_DATA_COLUMNS.map(([, label]) => quote(label)).join(";"),
      ...rows.map((participant) => USER_DATA_COLUMNS.map(([key]) => quote(displayUserDataValue(draftFor(participant), key))).join(";")),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "utilisateurs-climbcrew.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card user-data-page">
      {newParticipant && setNewParticipant && addParticipant && (
        <details className="subcard" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Nouvel utilisateur</summary>
          <div className="grid four" style={{ marginTop: 10 }}>
            <div><label>Nom</label><input value={newParticipant.nom || ""} onChange={(event) => setNewParticipant((participant) => ({ ...participant, nom: event.target.value }))} /></div>
            <div><label>Prénom</label><input value={newParticipant.prenom || ""} onChange={(event) => setNewParticipant((participant) => ({ ...participant, prenom: event.target.value }))} /></div>
            <div><label>E-mail</label><input type="email" value={newParticipant.email || ""} onChange={(event) => setNewParticipant((participant) => ({ ...participant, email: event.target.value }))} /></div>
            <div>
              <label>Couleur passeport</label>
              <PassportSelect value={newParticipant.passport} onChange={(event) => setNewParticipant((participant) => ({ ...participant, passport: event.target.value }))} />
            </div>
            <div><label>Sexe</label><select value={newParticipant.sexe || ""} onChange={(event) => setNewParticipant((participant) => ({ ...participant, sexe: event.target.value }))}><option value="">-</option><option value="h">H</option><option value="f">F</option></select></div>
            <div><label>Année de naissance</label><input type="number" min="1900" max={new Date().getFullYear() - 18} step="1" value={newParticipant.anneeNaissance ?? ""} onChange={(event) => setNewParticipant((participant) => ({ ...participant, anneeNaissance: event.target.value }))} /></div>
            <div><label>Catégorie FFME</label><div className="pill">{getFfmeAgeCategory(newParticipant.anneeNaissance) || "Non renseignée"}</div></div>
          </div>
          <div className="group" style={{ marginTop: 10 }}>
            <label><input type="checkbox" checked={Boolean(newParticipant.passeportFfme)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, passeportFfme: event.target.checked }))} /> Passeport FFME</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.passportDecouverte)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, passportDecouverte: event.target.checked }))} /> Découverte</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.cotisation)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, cotisation: event.target.checked }))} /> Cotisation</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.ffme)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, ffme: event.target.checked }))} /> FFME</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.canEncadrer)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canEncadrer: event.target.checked }))} /> Encadrant</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.canReferer)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canReferer: event.target.checked }))} /> Référent</label>
            <label><input type="checkbox" checked={Boolean(newParticipant.canAdmin)} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canAdmin: event.target.checked }))} /> Administrateur</label>
            <button type="button" onClick={addParticipant}>Ajouter l’utilisateur</button>
          </div>
        </details>
      )}

      <div className="card-header">
        <div>
          <h2>Données utilisateurs</h2>
          <div className="small">{rows.length} utilisateur{rows.length > 1 ? "s" : ""}</div>
        </div>
        <div className="user-data-actions">
          <button type="button" onClick={exportCsv}>Export CSV</button>
          <button type="button" disabled={!Object.keys(drafts).length || savingAll} onClick={saveAll}>
            {savingAll ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {message && <div className="success" style={{ marginBottom: 10 }}>{message}</div>}
      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}

      <details className="subcard user-data-mobile-controls">
        <summary>Filtres et tri</summary>
        <div className="user-data-mobile-sort">
          <div>
            <label htmlFor="mobile-user-sort">Trier par</label>
            <select id="mobile-user-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              {USER_DATA_COLUMNS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <button type="button" className="secondary" onClick={() => setAscending((value) => !value)}>
            {ascending ? "Croissant ↑" : "Décroissant ↓"}
          </button>
        </div>
        <div className="user-data-mobile-filter-grid">
          {USER_DATA_COLUMNS.map(([key, label]) => (
            <div key={key} className="user-data-mobile-filter-field">
              <label>{label}</label>
              {filterEditor(key, label)}
            </div>
          ))}
        </div>
        <button type="button" className="secondary user-data-clear-filters" onClick={() => setFilters({})}>Effacer les filtres</button>
      </details>

      <div className="user-data-mobile-list">
        {rows.map((participant) => {
          const draft = draftFor(participant);
          const participantName = `${draft.prenom || ""} ${draft.nom || ""}`.trim() || "Utilisateur sans nom";
          const participantSessions = sessionCountByParticipantId[String(participant.id)] || 0;
          return (
            <details className="user-data-mobile-card" key={participant.id}>
              <summary>
                <span className="user-data-mobile-summary-main">
                  <strong>{participantName}</strong>
                  <span>{draft.email || "Sans e-mail"}</span>
                </span>
                <span className="user-data-mobile-summary-meta">
                  <span>{displayUserDataValue(draft, "passport")}</span>
                  <span>{participantSessions} séance{participantSessions > 1 ? "s" : ""}</span>
                  {drafts[participant.id] && <span className="user-data-modified">Modifié</span>}
                </span>
              </summary>
              <div className="user-data-mobile-fields">
                {USER_DATA_COLUMNS.map(([key, label]) => {
                  const isEditableBoolean = USER_DATA_BOOLEAN_KEYS.has(key) && !MOBILE_READ_ONLY_KEYS.has(key);
                  const classNames = [
                    "user-data-mobile-field",
                    MOBILE_WIDE_FIELD_KEYS.has(key) ? "is-wide" : "",
                    isEditableBoolean ? "is-boolean" : "",
                    MOBILE_READ_ONLY_KEYS.has(key) ? "is-read-only" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <div className={classNames} key={key}>
                      <label>{label}</label>
                      <div className="user-data-mobile-control">{editor(participant, key)}</div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="danger user-data-mobile-delete"
                disabled={savingId === participant.id || savingAll}
                onClick={() => removeParticipant(participant)}
              >
                Supprimer cet utilisateur
              </button>
            </details>
          );
        })}
      </div>

      <div className="user-data-desktop-table" style={{ overflowY: "auto", overflowX: "auto", maxHeight: "70vh", border: "1px solid var(--border, #bbb)", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1500, tableLayout: "fixed", background: "var(--surface, white)", fontSize: "clamp(.68rem, .75vw, .82rem)" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--card-bg, #eee)" }}>
            <tr>
              {USER_DATA_COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  style={{ padding: USER_DATA_BOOLEAN_KEYS.has(key) ? "5px 2px" : "6px 3px", whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "center", lineHeight: 1.05, border: "1px solid #bbb", background: "var(--card-bg, #eee)", cursor: "pointer", width: compactUserDataColumnWidth(key), ...stickyColumnStyle(key, true) }}
                  title={`Trier par ${label}`}
                  onClick={() => {
                    if (sortKey === key) setAscending((value) => !value);
                    else {
                      setSortKey(key);
                      setAscending(true);
                    }
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {label}
                    <span aria-hidden="true" style={{ opacity: sortKey === key ? 1 : 0.45, fontSize: ".85em" }}>
                      {sortKey === key ? (ascending ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
              ))}
              <th style={{ whiteSpace: "nowrap" }}>Action</th>
            </tr>
            <tr>
              {USER_DATA_COLUMNS.map(([key, label]) => (
                <th key={key} style={{ padding: 2, background: "var(--card-bg, #eee)", border: "1px solid #bbb", width: compactUserDataColumnWidth(key), ...stickyColumnStyle(key, true) }}>
                  <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box", fontSize: "inherit" }}>
                    {filterEditor(key, label)}
                  </div>
                </th>
              ))}
              <th style={{ background: "var(--card-bg, #eee)", border: "1px solid #bbb", width: "12%" }}>
                <button type="button" onClick={() => setFilters({})} style={{ width: "100%", padding: "4px 2px", fontSize: "inherit" }}>Effacer</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((participant) => (
              <tr key={participant.id}>
                {USER_DATA_COLUMNS.map(([key]) => (
                  <td key={key} style={{ padding: (USER_DATA_BOOLEAN_KEYS.has(key) || key === "sessions") ? "2px" : "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: (USER_DATA_BOOLEAN_KEYS.has(key) || key === "sessions") ? "center" : "left", border: "1px solid #ccc", width: compactUserDataColumnWidth(key), ...stickyColumnStyle(key, false) }}>
                    {editor(participant, key)}
                  </td>
                ))}
                <td style={{ padding: 2, border: "1px solid #ccc", width: "12%" }}>
                  <button type="button" className="danger" disabled={savingId === participant.id || savingAll} onClick={() => removeParticipant(participant)} style={{ padding: "4px 2px", fontSize: "inherit", minWidth: 0, width: "100%" }}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
