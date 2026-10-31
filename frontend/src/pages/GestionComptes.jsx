import React, { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import { apiFetch, downloadFile } from "../lib/api.js";
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
  const [approvingUserId, setApprovingUserId] = useState(null);
  const [adminRoleSavingId, setAdminRoleSavingId] = useState(null);
  const [resendingConfirmationId, setResendingConfirmationId] = useState(null);
  const [accountSort, setAccountSort] = useState("name");

  async function handleApprove(userId) {
    setApprovingUserId(userId);
    try {
      await approveAccessRequest(userId);
    } finally {
      setApprovingUserId(null);
    }
  }

  async function resendConfirmationEmail(user) {
    setResendingConfirmationId(user.id);
    setAssociationError("");
    setAssociationMessage("");
    try {
      const result = await apiFetch(`/admin/auth/users/${user.id}/resend-confirmation`, {
        method: "POST",
      });
      setAssociationMessage(result.message || `E-mail de confirmation renvoyé à ${user.email}.`);
      await loadAdminAccessData();
    } catch (error) {
      setAssociationError(String(error.message || error));
      await loadAdminAccessData().catch(() => undefined);
    } finally {
      setResendingConfirmationId(null);
    }
  }

  async function setAdminRole(user, enabled) {
    setAdminRoleSavingId(user.id);
    setAssociationError("");
    try {
      await apiFetch(`/admin/auth/users/${user.id}/admin`, {
        method: "POST",
        body: JSON.stringify({ isAdmin: enabled }),
      });
      await loadAdminAccessData();
      setAssociationMessage(`Droit administrateur ${enabled ? "accordé" : "retiré"} pour ${user.prenom} ${user.nom}.`);
    } catch (error) {
      setAssociationError(String(error.message || error));
    } finally {
      setAdminRoleSavingId(null);
    }
  }

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

  const approvedLinkedEmails = useMemo(
    () => adminAuthUsers
      .filter((user) => user.status === "active" && user.participantId && user.email)
      .map((user) => user.email)
      .sort((a, b) => a.localeCompare(b, "fr")),
    [adminAuthUsers]
  );

  if (!USE_API) {
    return <div className="card"><div className="muted-box">La gestion des comptes est disponible avec le backend API.</div></div>;
  }
  if (!canManageAccountsAndLogs) {
    return <div className="card"><div className="muted-box">Cette section est réservée aux administrateurs authentifiés.</div></div>;
  }

  const sortAccounts = (users) => [...users].sort((a, b) => {
    if (accountSort === "created") {
      const left = a.created_at ? new Date(a.created_at).getTime() : 0;
      const right = b.created_at ? new Date(b.created_at).getTime() : 0;
      return right - left;
    }
    const lastName = String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" });
    if (lastName !== 0) return lastName;
    return String(a.prenom || "").localeCompare(String(b.prenom || ""), "fr", { sensitivity: "base" });
  });

  const pendingUsers = sortAccounts(adminAuthUsers.filter((user) => user.status === "pending"));
  const otherUsers = sortAccounts(adminAuthUsers.filter((user) => user.status !== "pending"));

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
    if (Object.prototype.hasOwnProperty.call(associationDrafts, user.id)) return associationDrafts[user.id];
    return String(user.participantId || "");
  }

  function exportApprovedLinkedEmailsOutlook() {
    if (!approvedLinkedEmails.length) return;
    downloadFile("emails-comptes-approuves.txt", approvedLinkedEmails.join("; "), "text/plain;charset=utf-8;");
    setAssociationError("");
    setAssociationMessage(`${approvedLinkedEmails.length} adresse(s) e-mail exportée(s) au format Outlook.`);
  }

  async function saveManualAssociation(user) {
    const participantId = draftParticipantId(user);
    if (user.status === "pending" && !user.email_verified_at) {
      setAssociationError("L’adresse e-mail doit être confirmée avant d’associer ce compte.");
      return;
    }
    if (!participantId) {
      setAssociationError("Choisissez une fiche grimpeur avant de lancer l’association manuelle.");
      return;
    }
    setAssociationBusy(true);
    setAssociationError("");
    setAssociationMessage("");
    try {
      await apiFetch(`/admin/auth/users/${user.id}/participant`, { method: "PUT", body: JSON.stringify({ participantId }) });
      const participant = participantById[String(participantId)];
      setAssociationMessage(`Compte associé à ${participant ? fullName(participant) : "la fiche grimpeur sélectionnée"}.`);
      await refreshAccountData();
      if (String(user.id) === String(authUser?.id || "")) window.location.reload();
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
      await apiFetch(`/admin/auth/users/${user.id}/participant`, { method: "PUT", body: JSON.stringify({ participantId: null }) });
      setAssociationDrafts((current) => ({ ...current, [user.id]: "" }));
      setAssociationMessage("Association supprimée.");
      await refreshAccountData();
      if (String(user.id) === String(authUser?.id || "")) window.location.reload();
    } catch (error) {
      setAssociationError(String(error.message || error));
    } finally {
      setAssociationBusy(false);
    }
  }

  const renderAccountActions = (user) => (
    <div className="group">
      <label className="admin-user-right-control">
        <input
          type="checkbox"
          aria-label={`Droit administrateur pour ${user.prenom} ${user.nom}`}
          checked={Boolean(user.isAdmin || user.role === "admin")}
          disabled={adminRoleSavingId === user.id}
          onChange={(event) => setAdminRole(user, event.target.checked)}
        /> Administrateur
      </label>
      {user.status === "pending" && !user.email_verified_at && (
        <Button
          variant="secondary"
          onClick={() => resendConfirmationEmail(user)}
          disabled={resendingConfirmationId === user.id}
        >
          {resendingConfirmationId === user.id ? "Envoi…" : "Renvoyer confirmation"}
        </Button>
      )}
      {user.status === "pending" && user.email_verified_at && <Button onClick={() => handleApprove(user.id)} disabled={approvingUserId === user.id}>{approvingUserId === user.id ? "Approbation…" : "Approuver"}</Button>}
      {user.status !== "revoked" ? <Button variant="danger" onClick={() => revokeUserAccess(user.id)}>Répudier</Button> : <Button onClick={() => reactivateUserAccess(user.id)}>Réactiver</Button>}
      <Button variant="secondary" onClick={() => generatePasswordResetToken(user.id)}>Code reset</Button>
      {Number(authUser?.id) !== Number(user.id) && <Button variant="danger" onClick={() => deleteUserAccount(user)}>Supprimer le compte</Button>}
    </div>
  );

  const renderAssociation = (user) => {
    const associatedParticipant = user.participantId ? participantById[String(user.participantId)] : null;
    const selectedParticipantId = draftParticipantId(user);
    const options = participantOptionsForUser(user);
    const associationAllowed = user.status !== "pending" || Boolean(user.email_verified_at);
    return (
      <div style={{ marginTop: 10 }}>
        <div className="small" style={{ marginBottom: 6 }}>Fiche grimpeur : {associatedParticipant ? <strong>{fullName(associatedParticipant)}</strong> : <strong>aucune association</strong>}</div>
        <div className="group" style={{ alignItems: "center" }}>
          <select value={selectedParticipantId} onChange={(event) => setAssociationDrafts((current) => ({ ...current, [user.id]: event.target.value }))} disabled={associationBusy || !associationAllowed} aria-label={`Fiche grimpeur associée au compte de ${user.prenom} ${user.nom}`}>
            <option value="">Choisir un grimpeur</option>
            {options.map((participant) => <option key={participant.id} value={participant.id}>{fullName(participant)}{participant.email ? ` · ${participant.email}` : ""}</option>)}
          </select>
          <Button variant="secondary" disabled={associationBusy || !associationAllowed || !selectedParticipantId || String(selectedParticipantId) === String(user.participantId || "")} onClick={() => saveManualAssociation(user)}>Associer</Button>
          {user.participantId && <Button variant="secondary" disabled={associationBusy} onClick={() => removeManualAssociation(user)}>Dissocier</Button>}
        </div>
        {!associationAllowed && (
          <div className="small" style={{ marginTop: 6 }}>
            Confirmez d’abord l’adresse e-mail du compte avant de l’associer à une fiche grimpeur.
          </div>
        )}
      </div>
    );
  };

  function confirmationEmailLabel(user) {
    if (user.email_verified_at) return { label: "Adresse e-mail confirmée", className: "success" };
    const status = user.confirmationEmail?.status;
    if (status === "sent") return { label: "E-mail de confirmation envoyé", className: "success" };
    if (status === "skipped") {
      const reason = user.confirmationEmail?.reason === "email_disabled" ? "messagerie serveur désactivée" : "envoi ignoré";
      return { label: `E-mail non envoyé — ${reason}`, className: "error" };
    }
    if (status === "failed") return { label: "Échec d’envoi de l’e-mail de confirmation", className: "error" };
    return { label: "Aucun e-mail de confirmation enregistré", className: "small" };
  }

  const renderAccountBody = (user) => {
    const confirmation = confirmationEmailLabel(user);
    return (
      <div style={{ marginTop: 10 }}>
        <div className="card-header"><div className="small">{user.email} · rôle {user.role} · statut {user.status}</div>{renderAccountActions(user)}</div>
        <div className="small">Créé le {user.created_at ? formatDateFr(user.created_at.slice(0, 10)) : "-"}{user.last_login_at ? ` · dernière connexion le ${formatDateFr(user.last_login_at.slice(0, 10))}` : " · aucune connexion"}</div>
        <div className={confirmation.className} style={{ marginTop: 6 }}>
          {confirmation.label}
          {user.confirmationEmail?.at ? ` · ${new Date(user.confirmationEmail.at).toLocaleString("fr-FR")}` : ""}
        </div>
        {renderAssociation(user)}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Gestion des comptes</h2>
        <div className="group">
          <Button
            variant="secondary"
            onClick={() => setAccountSort((current) => current === "name" ? "created" : "name")}
            title="Changer le critère de tri des comptes"
          >
            Tri : {accountSort === "name" ? "Nom" : "Date de création"}
          </Button>
          <Button variant="secondary" onClick={refreshAccountData} disabled={associationBusy}>Actualiser</Button>
          <Button variant="secondary" onClick={exportApprovedLinkedEmailsOutlook} disabled={approvedLinkedEmails.length === 0}>Exporter les e-mails (Outlook)</Button>
        </div>
      </div>
      <div className="small" style={{ marginBottom: 10 }}>Parcours d’un nouveau compte : confirmation de l’adresse e-mail, association manuelle à une fiche grimpeur, puis approbation. Une fiche déjà associée à un autre compte n’est pas proposée. L'export e-mail ne reprend que les comptes approuvés reliés à une fiche grimpeur.</div>
      {associationMessage && <div className="success" style={{ marginBottom: 12 }}>{associationMessage}</div>}
      {associationError && <div className="error" style={{ marginBottom: 12 }}>{associationError}</div>}
      {generatedResetToken && <div className="success" style={{ marginBottom: 12 }}>{generatedResetToken}</div>}
      <div className="stack">
        {adminAuthUsers.length === 0 ? <div className="muted-box">Aucun compte utilisateur chargé.</div> : <>
          {pendingUsers.map((user) => <div className="subcard account-admin-details account-needs-action" key={user.id}><div className="card-header"><div><div style={{ fontWeight: 700 }}>{user.prenom} {user.nom}</div><div className="small">En attente d’une intervention administrateur</div></div></div>{renderAccountBody(user)}</div>)}
          {otherUsers.map((user) => <details className="subcard account-admin-details" key={user.id}><summary style={{ cursor: "pointer", fontWeight: 700 }}>{user.prenom} {user.nom}{user.participantId ? " · associé" : " · non associé"}</summary>{renderAccountBody(user)}</details>)}
        </>}
      </div>
    </div>
  );
}
