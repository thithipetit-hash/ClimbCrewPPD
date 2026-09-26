import React, { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import SaveFeedback from "../components/SaveFeedback.jsx";
import { apiFetch, USE_API } from "../lib/api.js";
import { fullName } from "../lib/domain.js";

function AdminSection({ title, summary, children }) {
  return (
    <details className="card admin-section-details">
      <summary className="card-header" style={{ cursor: "pointer", userSelect: "none", marginBottom: 0 }}>
        <div>
          <h2>{title}</h2>
          {summary ? <div className="small">{summary}</div> : null}
        </div>
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}

export default function Administration({
  adminUnlocked,
  adminInput,
  setAdminInput,
  unlockAdmin,
  adminError,
  newParticipant,
  setNewParticipant,
  addParticipant,
  adminParticipants,
  updateParticipant,
  deleteParticipant,
}) {
  const [qualificationOverrides, setQualificationOverrides] = useState({});
  const [notificationPreferences, setNotificationPreferences] = useState({});
  const [savingControl, setSavingControl] = useState("");
  const [nativeAdminError, setNativeAdminError] = useState("");
  const [participantDrafts, setParticipantDrafts] = useState({});
  const [participantSaveState, setParticipantSaveState] = useState({});

  useEffect(() => {
    setParticipantDrafts(Object.fromEntries(
      adminParticipants.map((participant) => [String(participant.id), {
        nom: participant.nom || "",
        prenom: participant.prenom || "",
        email: participant.email || "",
        passport: participant.passport || "sans",
        sexe: participant.sexe || "",
      }])
    ));
  }, [adminParticipants]);

  useEffect(() => {
    if (!USE_API || !adminUnlocked) return;
    apiFetch("/admin/auth/notification-preferences")
      .then((result) => {
        const preferences = Array.isArray(result?.preferences) ? result.preferences : [];
        setNotificationPreferences(Object.fromEntries(
          preferences.map((preference) => [String(preference.participantId || ""), preference])
        ));
      })
      .catch((error) => setNativeAdminError(String(error.message || error)));
  }, [adminUnlocked]);

  function participantDraftFor(participant) {
    return participantDrafts[String(participant.id)] || {
      nom: participant.nom || "",
      prenom: participant.prenom || "",
      email: participant.email || "",
      passport: participant.passport || "sans",
      sexe: participant.sexe || "",
    };
  }

  function setParticipantDraftField(participant, key, value) {
    const participantId = String(participant.id);
    setParticipantDrafts((current) => ({
      ...current,
      [participantId]: { ...participantDraftFor(participant), ...current[participantId], [key]: value },
    }));
    setParticipantSaveState((current) => ({
      ...current,
      [participantId]: { status: "dirty", message: "Modifications non enregistrées" },
    }));
  }

  async function saveParticipantDraft(participant) {
    const participantId = String(participant.id);
    const draft = participantDraftFor(participant);
    setParticipantSaveState((current) => ({
      ...current,
      [participantId]: { status: "saving", message: "Enregistrement…" },
    }));
    try {
      await updateParticipant(participant.id, draft);
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "success", message: "✓ Participant enregistré" },
      }));
    } catch (error) {
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "error", message: `Enregistrement impossible : ${String(error?.message || error)}` },
      }));
    }
  }

  async function saveQuickField(participant, key, value) {
    const participantId = String(participant.id);
    setSavingControl(`participant:${participantId}:${key}`);
    setParticipantSaveState((current) => ({
      ...current,
      [participantId]: { status: "saving", message: "Enregistrement…" },
    }));
    try {
      await updateParticipant(participant.id, { [key]: value });
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "success", message: "✓ Enregistré" },
      }));
    } catch (error) {
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "error", message: `Enregistrement impossible : ${String(error?.message || error)}` },
      }));
    } finally {
      setSavingControl("");
    }
  }

  function qualificationFor(participant) {
    return qualificationOverrides[String(participant.id)] || {
      initiateurSae: Boolean(participant.initiateurSae),
      initiateurSne: Boolean(participant.initiateurSne),
    };
  }

  async function saveQualification(participant, key, checked) {
    const participantId = String(participant.id);
    const previous = qualificationFor(participant);
    const next = { ...previous, [key]: checked };
    setQualificationOverrides((current) => ({ ...current, [participantId]: next }));
    if (!USE_API) return;

    setSavingControl(`qualification:${participantId}`);
    setNativeAdminError("");
    try {
      const saved = await apiFetch(`/admin/participants/${encodeURIComponent(participantId)}/qualifications`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setQualificationOverrides((current) => ({
        ...current,
        [participantId]: {
          initiateurSae: Boolean(saved.initiateurSae),
          initiateurSne: Boolean(saved.initiateurSne),
        },
      }));
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "success", message: "✓ Qualification enregistrée" },
      }));
    } catch (error) {
      setQualificationOverrides((current) => ({ ...current, [participantId]: previous }));
      setNativeAdminError(String(error.message || error));
    } finally {
      setSavingControl("");
    }
  }

  function notificationPreferenceFor(participant) {
    return notificationPreferences[String(participant.id)] || {
      participantId: participant.id,
      userId: null,
      status: null,
      isAdmin: false,
      receiveAccountNotifications: false,
    };
  }

  async function saveNotificationPreference(participant, enabled) {
    const participantId = String(participant.id);
    const previous = notificationPreferenceFor(participant);
    const optimistic = { ...previous, receiveAccountNotifications: enabled };
    setNotificationPreferences((current) => ({ ...current, [participantId]: optimistic }));
    setSavingControl(`notification:${participantId}`);
    setNativeAdminError("");
    try {
      const saved = await apiFetch(`/admin/participants/${encodeURIComponent(participantId)}/account-notifications`, {
        method: "PUT",
        body: JSON.stringify({ receiveAccountNotifications: enabled }),
      });
      setNotificationPreferences((current) => ({
        ...current,
        [participantId]: { ...optimistic, receiveAccountNotifications: Boolean(saved.receiveAccountNotifications) },
      }));
      setParticipantSaveState((current) => ({
        ...current,
        [participantId]: { status: "success", message: "✓ Préférence enregistrée" },
      }));
    } catch (error) {
      setNotificationPreferences((current) => ({ ...current, [participantId]: previous }));
      setNativeAdminError(String(error.message || error));
    } finally {
      setSavingControl("");
    }
  }

  if (!adminUnlocked) {
    return (
      <div className="card">
        <div className="card-header"><h2>Accès administration</h2></div>
        <div className="grid two">
          <div>
            <label>Code administrateur</label>
            <input type="password" maxLength={8} value={adminInput} onChange={(event) => setAdminInput(event.target.value.replace(/\D/g, "").slice(0, 8))} />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}><Button onClick={unlockAdmin}>Déverrouiller</Button></div>
        </div>
        {adminError && <div className="error" style={{ marginTop: 10 }}>{adminError}</div>}
      </div>
    );
  }

  return (
    <>
      {nativeAdminError && <div className="error" style={{ marginBottom: 10 }}>{nativeAdminError}</div>}

      <AdminSection title="Ajouter un participant">
        <div className="grid four">
          <div><label>Nom</label><input value={newParticipant.nom} onChange={(event) => setNewParticipant((participant) => ({ ...participant, nom: event.target.value }))} /></div>
          <div><label>Prénom</label><input value={newParticipant.prenom} onChange={(event) => setNewParticipant((participant) => ({ ...participant, prenom: event.target.value }))} /></div>
          <div><label>Adresse e-mail</label><input type="email" value={newParticipant.email} onChange={(event) => setNewParticipant((participant) => ({ ...participant, email: event.target.value }))} /></div>
          <div>
            <label>Passeport</label>
            <select value={newParticipant.passport} onChange={(event) => setNewParticipant((participant) => ({ ...participant, passport: event.target.value }))}>
              <option value="sans">Sans</option><option value="jaune">Jaune</option><option value="orange">Orange</option><option value="vert">Vert</option><option value="bleu">Bleu</option><option value="decouverte">Découverte</option>
            </select>
          </div>
          <div>
            <label>Sexe</label>
            <div className="group">
              <label><input type="radio" name="new-participant-sexe" checked={newParticipant.sexe === "h"} onChange={() => setNewParticipant((participant) => ({ ...participant, sexe: "h" }))} /> H</label>
              <label><input type="radio" name="new-participant-sexe" checked={newParticipant.sexe === "f"} onChange={() => setNewParticipant((participant) => ({ ...participant, sexe: "f" }))} /> F</label>
              <label><input type="radio" name="new-participant-sexe" checked={!newParticipant.sexe} onChange={() => setNewParticipant((participant) => ({ ...participant, sexe: "" }))} /> Non précisé</label>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "end" }}><Button onClick={addParticipant}>Ajouter</Button></div>
        </div>
        <div className="group" style={{ marginTop: 12 }}>
          <label><input type="checkbox" checked={newParticipant.cotisation} onChange={(event) => setNewParticipant((participant) => ({ ...participant, cotisation: event.target.checked }))} /> Cotisation</label>
          <label><input type="checkbox" checked={newParticipant.ffme} onChange={(event) => setNewParticipant((participant) => ({ ...participant, ffme: event.target.checked }))} /> FFME</label>
          <label><input type="checkbox" checked={newParticipant.canEncadrer} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canEncadrer: event.target.checked }))} /> Encadrant</label>
          <label><input type="checkbox" checked={newParticipant.canReferer} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canReferer: event.target.checked }))} /> Référent</label>
          <label><input type="checkbox" checked={newParticipant.canAdmin} onChange={(event) => setNewParticipant((participant) => ({ ...participant, canAdmin: event.target.checked }))} /> Administrateur</label>
        </div>
      </AdminSection>



      <AdminSection title="Gestion des participants" summary={`${adminParticipants.length} participant${adminParticipants.length > 1 ? "s" : ""}`}>
        <div className="stack">
          {adminParticipants.map((participant) => {
            const qualification = qualificationFor(participant);
            const preference = notificationPreferenceFor(participant);
            const notificationEligible = Boolean(participant.canAdmin && preference.userId && preference.status === "active" && preference.isAdmin);
            const qualificationSaving = savingControl === `qualification:${participant.id}`;
            const notificationSaving = savingControl === `notification:${participant.id}`;
            const participantQuickSaving = savingControl.startsWith(`participant:${participant.id}:`);
            const draft = participantDraftFor(participant);
            const saveState = participantSaveState[String(participant.id)] || { status: "idle", message: "" };
            return (
              <details className="subcard participant-admin-details" key={participant.id}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>{fullName(participant)}</summary>
                <div className="grid four" style={{ marginTop: 10 }}>
                  <div><label>Nom</label><input value={draft.nom} onChange={(event) => setParticipantDraftField(participant, "nom", event.target.value)} /></div>
                  <div><label>Prénom</label><input value={draft.prenom} onChange={(event) => setParticipantDraftField(participant, "prenom", event.target.value)} /></div>
                  <div><label>Adresse e-mail</label><input type="email" value={draft.email} onChange={(event) => setParticipantDraftField(participant, "email", event.target.value)} /></div>
                  <div>
                    <label>Passeport</label>
                    <select value={draft.passport} onChange={(event) => setParticipantDraftField(participant, "passport", event.target.value)}>
                      <option value="sans">Sans</option><option value="jaune">Jaune</option><option value="orange">Orange</option><option value="vert">Vert</option><option value="bleu">Bleu</option><option value="decouverte">Découverte</option>
                    </select>
                  </div>
                  <div>
                    <label>Sexe</label>
                    <div className="group">
                      <label><input type="radio" name={`participant-sexe-${participant.id}`} checked={draft.sexe === "h"} onChange={() => setParticipantDraftField(participant, "sexe", "h")} /> H</label>
                      <label><input type="radio" name={`participant-sexe-${participant.id}`} checked={draft.sexe === "f"} onChange={() => setParticipantDraftField(participant, "sexe", "f")} /> F</label>
                      <label><input type="radio" name={`participant-sexe-${participant.id}`} checked={!draft.sexe} onChange={() => setParticipantDraftField(participant, "sexe", "")} /> Non précisé</label>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                    <Button disabled={saveState.status !== "dirty" || participantQuickSaving} onClick={() => saveParticipantDraft(participant)}>
                      {saveState.status === "saving" ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                    <Button variant="danger" disabled={participantQuickSaving || saveState.status === "saving"} onClick={() => deleteParticipant(participant.id)}>Supprimer</Button>
                  </div>
                </div>
                <div className="group" style={{ marginTop: 12 }}>
                  <label><input type="checkbox" checked={participant.cotisation} disabled={participantQuickSaving} onChange={(event) => saveQuickField(participant, "cotisation", event.target.checked)} /> Cotisation</label>
                  <label><input type="checkbox" checked={participant.ffme} disabled={participantQuickSaving} onChange={(event) => saveQuickField(participant, "ffme", event.target.checked)} /> FFME</label>
                  <label><input type="checkbox" checked={participant.canEncadrer} disabled={participantQuickSaving} onChange={(event) => saveQuickField(participant, "canEncadrer", event.target.checked)} /> Encadrant</label>
                  <label><input type="checkbox" checked={participant.canReferer} disabled={participantQuickSaving} onChange={(event) => saveQuickField(participant, "canReferer", event.target.checked)} /> Référent</label>
                  <label><input type="checkbox" checked={Boolean(participant.canAdmin)} disabled={participantQuickSaving} onChange={(event) => saveQuickField(participant, "canAdmin", event.target.checked)} /> Administrateur</label>
                  {USE_API && <label><input type="checkbox" checked={qualification.initiateurSae} disabled={qualificationSaving} onChange={(event) => saveQualification(participant, "initiateurSae", event.target.checked)} /> Initiateur SAE</label>}
                  {USE_API && <label><input type="checkbox" checked={qualification.initiateurSne} disabled={qualificationSaving} onChange={(event) => saveQualification(participant, "initiateurSne", event.target.checked)} /> Initiateur SNE</label>}
                  {USE_API && (
                    <label title={notificationEligible ? "Recevoir un e-mail lorsqu'une nouvelle demande de compte est confirmée." : "Nécessite un participant administrateur associé à un compte administrateur actif."}>
                      <input type="checkbox" checked={notificationEligible && Boolean(preference.receiveAccountNotifications)} disabled={!notificationEligible || notificationSaving} onChange={(event) => saveNotificationPreference(participant, event.target.checked)} /> E-mail demandes
                    </label>
                  )}
                </div>
                <SaveFeedback status={saveState.status} message={saveState.message} />
              </details>
            );
          })}
        </div>
      </AdminSection>

    </>
  );
}
