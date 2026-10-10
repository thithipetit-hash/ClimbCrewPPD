import React, { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import VideoAnalysisRulesAdmin from "../components/VideoAnalysisRulesAdmin.jsx";
import { API_BASE, apiFetch, readCookie } from "../lib/api.js";

function formatBackupSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

const logTextStyle = {
  minWidth: 0,
  maxWidth: "100%",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  whiteSpace: "normal",
};

function ServerSection({ title, summary, children }) {
  return (
    <details className="card admin-section-details" style={{ minWidth: 0, maxWidth: "100%" }}>
      <summary
        className="card-header"
        style={{ cursor: "pointer", userSelect: "none", marginBottom: 0, minWidth: 0 }}
      >
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {summary ? <div className="small">{summary}</div> : null}
        </div>
      </summary>
      <div style={{ marginTop: 12, minWidth: 0 }}>{children}</div>
    </details>
  );
}

export default function Logs({
  USE_API,
  canManageAccountsAndLogs,
  adminAccessLogs,
  onRefreshLogs,
  exportAllData,
  importJsonFile,
  importMessage,
}) {
  const [backups, setBackups] = useState([]);
  const [backupConfig, setBackupConfig] = useState(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState({ title: "", body: "" });
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [routeArchiveState, setRouteArchiveState] = useState({ status: "idle", message: "" });
  const [accountLogsOnly, setAccountLogsOnly] = useState(true);

  const displayedLogs = accountLogsOnly
    ? adminAccessLogs.filter((log) => String(log.event_type || "").startsWith("account_creation"))
    : adminAccessLogs;

  async function archiveActiveRoutes() {
    if (!window.confirm("Archiver toutes les voies actives ? Elles resteront dans l’historique mais ne seront plus affichées dans l’onglet Voies.")) return;

    setRouteArchiveState({ status: "saving", message: "Archivage des voies…" });
    try {
      const routes = await apiFetch("/routes");
      const activeRoutes = Array.isArray(routes)
        ? routes.filter((route) => route?.active !== false)
        : [];

      if (activeRoutes.length === 0) {
        setRouteArchiveState({ status: "success", message: "Aucune voie active à archiver." });
        return;
      }

      const results = await Promise.allSettled(
        activeRoutes.map((route) => apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
          method: "PUT",
          body: JSON.stringify({ active: false }),
        })),
      );
      const archivedCount = results.filter(
        (result) => result.status === "fulfilled" && result.value?.active === false,
      ).length;
      const failedCount = activeRoutes.length - archivedCount;

      if (failedCount > 0) {
        setRouteArchiveState({
          status: "error",
          message: `Archivage incomplet : ${archivedCount}/${activeRoutes.length} voie(s) archivée(s). Rechargement…`,
        });
        window.setTimeout(() => window.location.reload(), 1400);
        return;
      }

      setRouteArchiveState({
        status: "success",
        message: `${archivedCount} voie${archivedCount > 1 ? "s" : ""} archivée${archivedCount > 1 ? "s" : ""}. Rechargement…`,
      });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setRouteArchiveState({
        status: "error",
        message: `Archivage impossible : ${String(error?.message || error)}`,
      });
    }
  }

  async function loadBackups() {
    const result = await apiFetch("/admin/backups");
    setBackups(result.backups || []);
    setBackupConfig(result.config || null);
  }

  useEffect(() => {
    if (!USE_API || !canManageAccountsAndLogs) return;
    loadBackups().catch((error) => {
      setBackupStatus(`Sauvegardes indisponibles : ${error.message || error}`);
    });
  }, [USE_API, canManageAccountsAndLogs]);

  async function createBackupNow() {
    try {
      setBackupBusy(true);
      setBackupStatus("Sauvegarde PostgreSQL en cours…");
      const result = await apiFetch("/admin/backups", {
        method: "POST",
        body: JSON.stringify({ sendEmail: true }),
      });
      const backup = result.backup || {};
      setBackupStatus(
        backup.emailSent
          ? `Sauvegarde ${backup.fileName} créée localement et envoyée par e-mail.`
          : `Sauvegarde ${backup.fileName} créée localement. L’envoi e-mail n’a pas abouti${backup.emailError ? ` : ${backup.emailError}` : "."}`,
      );
      await loadBackups();
    } catch (error) {
      setBackupStatus(`Sauvegardes impossible : ${error.message || error}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function sendBackupAgain(fileName) {
    if (!backupConfig?.emailConfigured) {
      setBackupStatus("Envoi impossible : BACKUP_RECIPIENT n’est pas configuré sur le serveur.");
      return;
    }

    try {
      setBackupBusy(true);
      setBackupStatus(`Envoi de ${fileName}…`);
      await apiFetch(`/admin/backups/${encodeURIComponent(fileName)}/email`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBackupStatus(`${fileName} envoyé à ${backupConfig.recipient}.`);
      await loadBackups();
    } catch (error) {
      setBackupStatus(`Envoi impossible : ${error.message || error}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function importDatabaseBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setBackupBusy(true);
      setBackupStatus(`Vérification et import local de ${file.name}…`);
      const response = await fetch(`${API_BASE}/admin/backups/import?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-CSRF-Token": readCookie("climbcrew_csrf"),
        },
        body: file,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `Erreur API ${response.status}`);
      const result = JSON.parse(text);
      setBackupStatus(`Sauvegarde importée et vérifiée : ${result.backup?.fileName}. Elle peut maintenant être restaurée.`);
      await loadBackups();
    } catch (error) {
      setBackupStatus(`Import impossible : ${error.message || error}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreDatabaseBackup(fileName) {
    const accepted = window.confirm(
      `Restaurer ${fileName} ?\n\nLa base actuelle sera d’abord sauvegardée automatiquement. Ensuite toutes les données seront remplacées par la sauvegarde choisie et toutes les sessions utilisateur seront déconnectées.`,
    );
    if (!accepted) return;

    const confirmation = window.prompt("Pour confirmer la restauration, saisir exactement : RESTAURER");
    if (confirmation !== "RESTAURER") {
      setBackupStatus("Restauration annulée : confirmation incorrecte.");
      return;
    }

    try {
      setBackupBusy(true);
      setBackupStatus(`Restauration de ${fileName}… Ne pas fermer cette page.`);
      const result = await apiFetch(`/admin/backups/${encodeURIComponent(fileName)}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirm: "RESTAURER" }),
      });
      setBackupStatus(`${result.message || "Restauration terminée."} Reconnexion dans quelques secondes…`);
      window.setTimeout(() => window.location.reload(), 6000);
    } catch (error) {
      setBackupStatus(`Restauration impossible : ${error.message || error}`);
      setBackupBusy(false);
    }
  }

  async function sendBroadcastMessage() {
    const title = broadcastDraft.title.trim();
    const body = broadcastDraft.body.trim();
    if (title.length < 3 || body.length < 3) {
      setBroadcastStatus("Le titre et le message doivent contenir au moins 3 caractères.");
      return;
    }

    try {
      setBroadcastSending(true);
      setBroadcastStatus("");
      const result = await apiFetch("/admin/broadcast-messages", {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
      setBroadcastDraft({ title: "", body: "" });
      setBroadcastStatus(`Message diffusé à ${result.recipientCount || 0} utilisateur${result.recipientCount > 1 ? "s" : ""}.`);
    } catch (error) {
      setBroadcastStatus(`Diffusion impossible : ${error.message || error}`);
    } finally {
      setBroadcastSending(false);
    }
  }

  if (!USE_API) {
    return <div className="card"><div className="muted-box">L’administration serveur est disponible avec le backend API.</div></div>;
  }
  if (!canManageAccountsAndLogs) {
    return <div className="card"><div className="muted-box">Cette section est réservée aux administrateurs authentifiés.</div></div>;
  }

  return (
    <>
      <ServerSection title="Gestion des voies" summary="Archive les voies actives sans supprimer leur historique">
        <div className="small" style={{ marginBottom: 10 }}>
          Les voies archivées restent conservées avec leurs réalisations, mais ne sont plus affichées dans l’onglet Voies.
        </div>
        <Button
          variant="danger"
          disabled={routeArchiveState.status === "saving"}
          onClick={archiveActiveRoutes}
        >
          {routeArchiveState.status === "saving" ? "Archivage…" : "Archiver les voies"}
        </Button>
        {routeArchiveState.message && (
          <div
            className={routeArchiveState.status === "error" ? "error" : routeArchiveState.status === "success" ? "success" : "muted-box"}
            style={{ marginTop: 10 }}
          >
            {routeArchiveState.message}
          </div>
        )}
      </ServerSection>

      <ServerSection title="Analyse technique" summary="Règles et seuils de l’analyse vidéo MediaPipe">
        <VideoAnalysisRulesAdmin />
      </ServerSection>

      <ServerSection title="Import / export des données métier">
        <div className="group">
          <Button variant="secondary" onClick={exportAllData}>Export JSON</Button>
          <label className="pill" style={{ cursor: "pointer" }}>Import JSON<input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={importJsonFile} /></label>
        </div>
        {importMessage && <div className="success" style={{ marginTop: 10 }}>{importMessage}</div>}
      </ServerSection>

      <ServerSection title="Logs" summary={`${displayedLogs.length} événement${displayedLogs.length > 1 ? "s" : ""} affiché${displayedLogs.length > 1 ? "s" : ""}`}>
        <div className="group" style={{ marginBottom: 12 }}>
          <Button variant="secondary" onClick={onRefreshLogs}>Actualiser les logs</Button>
          <Button variant="secondary" onClick={() => setAccountLogsOnly((value) => !value)}>
            {accountLogsOnly ? "Afficher tous les logs" : "Création de compte uniquement"}
          </Button>
        </div>
        <div className="small" style={{ marginBottom: 12 }}>
          Les diagnostics de création de compte affichent le requestId, l’étape atteinte et les détails techniques utiles, sans mot de passe ni token.
        </div>
        <div className="stack" style={{ minWidth: 0, maxWidth: "100%" }}>
          {displayedLogs.length === 0 ? (
            <div className="muted-box">
              {accountLogsOnly ? "Aucun diagnostic récent de création de compte." : "Aucun log disponible."}
            </div>
          ) : (
            displayedLogs.map((log) => (
              <div
                className="subcard"
                key={log.id}
                style={{ minWidth: 0, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}
              >
                <div
                  className="card-header"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", minWidth: 0 }}
                >
                  <strong style={logTextStyle}>{log.event_type}</strong>
                  <span className={`badge ${log.success ? "" : "danger"}`} style={{ flexShrink: 0 }}>
                    {log.success ? "OK" : "Échec"}
                  </span>
                </div>
                <div className="small" style={logTextStyle}>
                  {log.email || "utilisateur inconnu"} · {log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-"}
                </div>
                <div className="small" style={logTextStyle}>
                  {log.ip_address || "IP inconnue"} · {log.user_agent || "navigateur inconnu"}
                </div>
                {log.details?.requestId && (
                  <div className="small" style={logTextStyle}><strong>Request ID :</strong> {log.details.requestId}</div>
                )}
                {(log.details?.stage || log.details?.diagnosticStage) && (
                  <div className="small" style={logTextStyle}>
                    <strong>Étape :</strong> {log.details.stage || log.details.diagnosticStage}
                  </div>
                )}
                {log.details_text && <div className="small" style={logTextStyle}>Détails : {log.details_text}</div>}
              </div>
            ))
          )}
        </div>
      </ServerSection>

      <ServerSection
        title="Sauvegardes et restauration"
        summary={`${backups.length} sauvegarde${backups.length > 1 ? "s" : ""} locale${backups.length > 1 ? "s" : ""}`}
      >
        <div className="small" style={{ marginBottom: 10 }}>
          Sauvegarde PostgreSQL automatique tous les jours à {String(backupConfig?.hour ?? 3).padStart(2, "0")}:00 ({backupConfig?.timezone || "Europe/Paris"}).
          {backupConfig?.emailConfigured
            ? ` La sauvegarde du lundi est envoyée à ${backupConfig.recipient}.`
            : " L’envoi e-mail du lundi est désactivé tant que BACKUP_RECIPIENT n’est pas configuré."}
        </div>

        <div className="group" style={{ marginBottom: 12 }}>
          <Button onClick={createBackupNow} disabled={backupBusy}>Sauvegarder maintenant</Button>
          <Button variant="secondary" onClick={loadBackups} disabled={backupBusy}>Actualiser la liste</Button>
          <label className="pill" style={{ cursor: backupBusy ? "default" : "pointer", opacity: backupBusy ? 0.6 : 1 }}>
            Importer une sauvegarde .dump
            <input
              type="file"
              accept=".dump,application/octet-stream"
              disabled={backupBusy}
              style={{ display: "none" }}
              onChange={importDatabaseBackup}
            />
          </label>
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          Un dump complet est toujours conservé localement. L’envoi par e-mail n’est tenté que lorsqu’un destinataire est configuré. Conservation locale : {backupConfig?.retentionDays || 35} jours.
        </div>

        {backupStatus && <div className="muted-box" style={{ marginBottom: 12 }}>{backupStatus}</div>}

        <div className="stack">
          {backups.length === 0 ? (
            <div className="small">Aucune sauvegarde locale disponible.</div>
          ) : backups.slice(0, 20).map((backup) => (
            <div className="subcard" key={backup.fileName}>
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{backup.fileName}</div>
                  <div className="small">
                    {formatBackupSize(backup.size)} · {backup.modifiedAt ? new Date(backup.modifiedAt).toLocaleString("fr-FR") : "date inconnue"}
                    {backup.emailed ? " · e-mail envoyé" : ""}
                  </div>
                </div>
                <div className="group">
                  <Button
                    variant="secondary"
                    onClick={() => sendBackupAgain(backup.fileName)}
                    disabled={backupBusy || !backupConfig?.emailConfigured}
                  >
                    Envoyer
                  </Button>
                  <Button variant="danger" onClick={() => restoreDatabaseBackup(backup.fileName)} disabled={backupBusy}>
                    Restaurer
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ServerSection>

      <ServerSection
        title="Messagerie"
        summary={backupConfig?.emailFromAddress || "Adresse non configurée"}
      >
        <div className="grid two">
          <div>
            <label>Adresse d’expédition</label>
            <input value={backupConfig?.emailFromAddress || "Non configurée"} readOnly />
          </div>
          <div>
            <label>État</label>
            <input value={backupConfig?.emailEnabled ? "Messagerie activée" : "Messagerie désactivée"} readOnly />
          </div>
          <div>
            <label>Destinataire des sauvegardes</label>
            <input value={backupConfig?.recipient || "Non configuré"} readOnly />
          </div>
        </div>
        <div className="small" style={{ marginTop: 10 }}>
          Seules les adresses utiles à l’exploitation sont affichées ici. Les identifiants et mots de passe SMTP ne sont jamais exposés dans l’interface.
        </div>
      </ServerSection>

      <ServerSection title="Diffuser un message">
        <div className="small" style={{ marginBottom: 12 }}>
          Le message sera présenté une seule fois à chaque utilisateur actif lors de sa prochaine utilisation de l’application.
        </div>
        <div className="stack">
          <div>
            <label htmlFor="server-broadcast-title">Titre</label>
            <input
              id="server-broadcast-title"
              maxLength={120}
              value={broadcastDraft.title}
              onChange={(event) => setBroadcastDraft((draft) => ({ ...draft, title: event.target.value }))}
              placeholder="Ex. Information importante"
            />
          </div>
          <div>
            <label htmlFor="server-broadcast-body">Message</label>
            <textarea
              id="server-broadcast-body"
              rows={5}
              maxLength={2000}
              value={broadcastDraft.body}
              onChange={(event) => setBroadcastDraft((draft) => ({ ...draft, body: event.target.value }))}
              placeholder="Saisir le message qui sera affiché aux utilisateurs…"
            />
            <div className="small">{broadcastDraft.body.length} / 2 000 caractères</div>
          </div>
          <div className="group" style={{ justifyContent: "space-between" }}>
            {broadcastStatus ? <div className="small">{broadcastStatus}</div> : <span />}
            <Button onClick={sendBroadcastMessage} disabled={broadcastSending}>
              {broadcastSending ? "Diffusion…" : "Diffuser"}
            </Button>
          </div>
        </div>
      </ServerSection>
    </>
  );
}
