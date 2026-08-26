import React, { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import { apiFetch } from "../lib/api.js";
import { formatDateFr, fullName } from "../lib/domain.js";

export default function GestionComptes({
  USE_API,
  canManageAccountsAndLogs,
  loadAdminAccessData,
  generatedResetToken,
  adminAuthUsers,
  approveAccessRequest,
  revokeUserAccess,
  reactivateUserAccess,
  generatePasswordResetToken,
  deleteUserAccount,
  authUser,
}) {
  const [participants, setParticipants] = useState([]);
  const [associationDrafts, setAssociationDrafts] = useState({});
  const [associationMessage, setAssociationMessage] = useState("");
  const [associationError, setAssociationError] = useState("");
  const [associationBusy, setAssociationBusy] = useState(false);

  async function loadParticipants() {
    if (!USE_API || !canManageAccountsAndLogs) return;
    const result = await apiFetch("/participants");
    setParticipants(Array.isArray(result) ? result : []);
  }

  async function refreshAccountData() {
    setAssociationError("");
    await Promise.all([loadAdminAccessData(), loadParticipants()]);
  }

  useEffect(() => {
    if (!USE_API || !canManageAccountsAndLogs) return;
    loadParticipants().catch((error) => setAssociationError(String(error.message || error)));
  }, [USE_API, canManageAccountsAndLogs]);

  const participantById = useMemo(
    () => Object.fromEntries(participants.map((participant) => [String(participant.id), participant])),
    [participants]
  );

  const usedParticipantIds = useMemo(
    () => new Set(adminAuthUsers.map((user) => String(user.participantId || "")).filter(Boolean)),
    [adminAuthUsers]
  );

  if (!USE_API) {
    return <div className="card"><div className="muted-box">La gestion des comptes est disponible avec le backend API.</div></div>;
  }
  if (!canManageAccountsAndLogs) {
    return <div className="card"><div className="muted-box">Cette section est réservée aux administrateurs authentifiés.</div></div>;
  }

  const pendingUsers = adminAuthUsers.filter((user) => user.status === "pending");
  const otherUsers = adminAuthUsers.filter((user) => user.status !== "pending");

  function participantOptionsForUser(user) {
    const currentParticipantId = String(user.participantId || "");
    return participants
      .filter((participant) => {
        const id = String(participant.id);
        return id === currentParticipantId || !usedParticipantIds.has(id);
      })
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
  }

  function draftParticipantId(user) {
    if (Object.prototype.hasOwnProperty.call(associationDrafts, user.id)) {
      return associationDrafts[user.id];
    }
    return String(user.participantId || "");
  }

  async function runAutomaticAssociations() {
    setAssociationBusy(true);
    setAssociationError("");
    setAssociationMessage("");
    try {
      const result = await apiFetch("/admin/auth/associations/auto", { method: "POST" });
      setAssociationMessage(
        `${result.associatedCount || 0} association(s) créée(s) par e-mail identique. `
        + `${result.ambiguousCount || 0} ambiguë(s), ${result.unavailableCount || 0} déjà utilisée(s), `
        + `${result.unmatchedCount || 0} sans correspondance à associer manuellement.`
      );
      await refreshAccountData();
      if ((result.associatedUserIds || []).map(String).includes(String(authUser?.id || ""))) {
        window.location.reload();
      }
    } catch (error) {
      setAssociationError(String(error.message || error));
    } finally {
      setAssociationBusy(false);
    }
  }

  async function saveManualAssociation(user) {
    const participantId = draftParticipantId(user);
    if (!participantId) {
      setAssociationError("Choisissez une fiche grimpeur avant de lancer l’association manuelle.");
      return;
    }

    setAssociationBusy(true);
    setAssociationError("");
    setAssociationMessage("");
    try {
      await apiFetch(`/admin/auth/users/${user.id}/participant`, {
        method: "PUT",
        body: JSON.stringify({ participantId }),
      });
      const participant = participantById[String(participantId)];
      setAssociationMessage(`Compte associé à ${participant ? fullName(participant) : "la fiche grimpeur sélectionnée"}.`);
      await refreshAccountData();
      if (String(user.id) === String(authUser?.id || "")) {
        window.location.reload();
      }
    } catch (error) {
      setAssociationError(String(error.message || error));
    } finally {
      setAssociationBusy(false);
    }
  }

  async function removeManualAssociation(user) {
    setAssociationBusy(true);
    setAssociationError("");
    setAssociationMessage("");
    try {
      await apiFetch(`/admin/auth/users/${user.id}/participant`, {
        method: "PUT",
        body: JSON.stringify({ participantId: null }),
      });
      setAssociationDrafts((current) => ({ ...current, [user.id]: "" }));
      setAssociationMessage("Association supprimée.");
      await refreshAccountData();
      if (String(user.id) === String(authUser?.id || "")) {
        window.location.reload();
      }
    } catch (error) {
      setAssociationError(String(error.message || error));
    } finally {
      setAssociationBusy(false);
    }
  }

  const renderAccountActions = (user) => (
    <div className="group">
      {user.status === "pending" && <Button onClick={() => approveAccessRequest(user.id)}>Approuver</Button>}
      {user.status !== "revoked" ? (
        <Button variant="danger" onClick={() => revokeUserAccess(user.id)}>Répudier</Button>
      ) : (
        <Button onClick={() => reactivateUserAccess(user.id)}>Réactiver</Button>
      )}
      <Button variant="secondary" onClick={() => generatePasswordResetToken(user.id)}>Code reset</Button>
      {Number(authUser?.id) !== Number(user.id) && (
        <Button variant="danger" onClick={() => deleteUserAccount(user)}>Supprimer le compte</Button>
      )}
    </div>
  );

  const renderAssociation = (user) => {
    const associatedParticipant = user.participantId
      ? participantById[String(user.participantId)]
      : null;
    const selectedParticipantId = draftParticipantId(user);
    const options = participantOptionsForUser(user);

    return (
      <div style={{ marginTop: 10 }}>
        <div className="small" style={{ marginBottom: 6 }}>
          Fiche grimpeur : {associatedParticipant
            ? <strong>{fullName(associatedParticipant)}</strong>
            : <strong>aucune association</strong>}
        </div>
        <div className="group" style={{ alignItems: "center" }}>
          <select
            value={selectedParticipantId}
            onChange={(event) => setAssociationDrafts((current) => ({
              ...current,
              [user.id]: event.target.value,
            }))}
            disabled={associationBusy}
            aria-label={`Fiche grimpeur associée au compte de ${user.prenom} ${user.nom}`}
          >
            <option value="">Choisir un grimpeur</option>
            {options.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {fullName(participant)}{participant.email ? ` · ${participant.email}` : ""}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={associationBusy || !selectedParticipantId || String(selectedParticipantId) === String(user.participantId || "")}
            onClick={() => saveManualAssociation(user)}
          >
            Associer
          </Button>
          {user.participantId && (
            <Button variant="secondary" disabled={associationBusy} onClick={() => removeManualAssociation(user)}>
              Dissocier
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderAccountBody = (user) => (
    <div style={{ marginTop: 10 }}>
      <div className="card-header">
        <div className="small">{user.email} · rôle {user.role} · statut {user.status}</div>
        {renderAccountActions(user)}
      </div>
      <div className="small">
        Créé le {user.created_at ? formatDateFr(user.created_at.slice(0, 10)) : "-"}
        {user.last_login_at ? ` · dernière connexion le ${formatDateFr(user.last_login_at.slice(0, 10))}` : " · aucune connexion"}
      </div>
      {renderAssociation(user)}
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <h2>Gestion des comptes</h2>
        <div className="group">
          <Button onClick={runAutomaticAssociations} disabled={associationBusy}>Associations</Button>
          <Button variant="secondary" onClick={refreshAccountData} disabled={associationBusy}>Actualiser</Button>
        </div>
      </div>
      <div className="small" style={{ marginBottom: 10 }}>
        Le bouton Associations rattache les comptes encore non associés uniquement par adresse e-mail strictement identique — jamais par prénom/nom, trop ambigu en cas d’homonymes. Les associations existantes ne sont jamais remplacées automatiquement. Les comptes sans e-mail correspondant doivent être associés manuellement ci-dessous.
      </div>
      {associationMessage && <div className="success" style={{ marginBottom: 12 }}>{associationMessage}</div>}
      {associationError && <div className="error" style={{ marginBottom: 12 }}>{associationError}</div>}
      {generatedResetToken && <div className="success" style={{ marginBottom: 12 }}>{generatedResetToken}</div>}
      <div className="stack">
        {adminAuthUsers.length === 0 ? (
          <div className="muted-box">Aucun compte utilisateur chargé.</div>
        ) : (
          <>
            {pendingUsers.map((user) => (
              <div className="subcard account-admin-details" key={user.id}>
                <div className="card-header">
                  <div>
                    <div style={{ fontWeight: 700 }}>{user.prenom} {user.nom}</div>
                    <div className="small">En attente d’une intervention administrateur</div>
                  </div>
                </div>
                {renderAccountBody(user)}
              </div>
            ))}

            {otherUsers.map((user) => (
              <details className="subcard account-admin-details" key={user.id}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  {user.prenom} {user.nom}
                  {user.participantId ? " · associé" : " · non associé"}
                </summary>
                {renderAccountBody(user)}
              </details>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
