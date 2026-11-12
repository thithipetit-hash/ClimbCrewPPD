import React from "react";
import { deleteLocalMedia, getLocalMedia, saveLocalMedia } from "../lib/competences-local-media.js";

// Import volontaire : seuls les fichiers fournis avec une autorisation sont stockés.
// Aucune extraction automatique depuis YouTube ou FFME.
export default function CompetenceLocalMedia({ type, id, title }) {
  const [blob, setBlob] = React.useState(null);
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let active = true;
    getLocalMedia(type, id)
      .then((media) => { if (active) setBlob(media); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, id]);

  React.useEffect(() => {
    if (!blob) { setUrl(""); return undefined; }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveLocalMedia(type, id, file);
      setBlob(file);
      setMessage("Fichier enregistré sur cet appareil, disponible hors connexion.");
    } catch (cause) {
      setError(cause?.name === "QuotaExceededError"
        ? "Espace de stockage insuffisant sur cet appareil."
        : cause?.message || "Impossible d'enregistrer ce fichier.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteLocalMedia(type, id);
      setBlob(null);
      setMessage("Fichier local supprimé.");
    } catch (cause) {
      setError(cause?.message || "Impossible de supprimer le fichier.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="competences-local-media">
      {url && type === "video" && (
        <video controls playsInline preload="metadata" src={url} aria-label={title}>
          Votre navigateur ne peut lire cette vidéo locale.
        </video>
      )}
      {url && type === "image" && <img src={url} alt={"Illustration fournie pour : " + title} />}
      {!url && <p className="small competences-media-empty" role="status">{loading ? "Recherche du fichier local…" : type === "video" ? "Vidéo non encore disponible sur cet appareil." : "Aucune image supplémentaire importée."}</p>}
      <div className="competences-media-actions">
        <label className="competences-file-label">
          {busy ? "Enregistrement…" : blob ? "Remplacer le fichier" : type === "video" ? "Importer une vidéo autorisée" : "Importer une image autorisée"}
          <input
            type="file"
            accept={type === "video" ? ".mp4,.webm,video/mp4,video/webm" : ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"}
            disabled={busy}
            onChange={importFile}
            aria-label={"Fichier local : " + title}
          />
        </label>
        {blob && <button type="button" disabled={busy} onClick={removeFile}>Supprimer le fichier</button>}
      </div>
      {message && <p className="small" role="status">{message}</p>}
      {error && <p className="competences-error" role="alert">{error}</p>}
    </div>
  );
}
