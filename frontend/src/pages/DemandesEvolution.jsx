import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import Button from "../components/Button.jsx";
import SaveFeedback from "../components/SaveFeedback.jsx";

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const STATUS_OPTIONS = [
  { value: "a_voir", label: "À voir" },
  { value: "approuve", label: "Approuvé" },
  { value: "integre", label: "Intégré" },
  { value: "trop_creatif", label: "Trop créatif" },
];

export default function DemandesEvolution({ USE_API, authUser }) {
  const [requests, setRequests] = useState([]);
  const [draft, setDraft] = useState({ title: "", description: "" });
  const [requestType, setRequestType] = useState("evolution");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");

  async function loadRequests() {
    if (!USE_API) {
      setLoading(false);
      return;
    }
    try {
      setError("");
      setRequests(await apiFetch("/evolution-requests"));
    } catch (requestError) {
      setError(requestError.message || "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, [USE_API, authUser?.id]);

  async function runAction(key, action, successMessage) {
    if (busyAction) return;
    setBusyAction(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
    } catch (actionError) {
      setError(actionError.message || "Enregistrement impossible");
    } finally {
      setBusyAction("");
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    await runAction("create", async () => {
      await apiFetch("/evolution-requests", {
        method: "POST",
        body: JSON.stringify({ ...draft, title: requestType === "bug" ? `[BUG] ${draft.title}` : draft.title }),
      });
      setDraft({ title: "", description: "" });
      await loadRequests();
    }, requestType === "bug" ? "✓ Bug signalé" : "✓ Demande enregistrée");
  }

  async function vote(request, value) {
    const nextValue = request.myVote === value ? 0 : value;
    await runAction(`vote:${request.id}`, async () => {
      await apiFetch(`/evolution-requests/${request.id}/vote`, {
        method: "PUT",
        body: JSON.stringify({ value: nextValue }),
      });
      await loadRequests();
    }, "✓ Avis enregistré");
  }

  async function addComment(event, requestId) {
    event.preventDefault();
    const body = String(commentDrafts[requestId] || "").trim();
    if (!body) return;
    await runAction(`comment:${requestId}`, async () => {
      await apiFetch(`/evolution-requests/${requestId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setCommentDrafts((current) => ({ ...current, [requestId]: "" }));
      await loadRequests();
    }, "✓ Commentaire enregistré");
  }

  async function updateStatus(requestId, status) {
    await runAction(`status:${requestId}`, async () => {
      await apiFetch(`/admin/evolution-requests/${requestId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await loadRequests();
    }, "✓ Statut enregistré");
  }

  const sortedRequests = [...requests].sort((left, right) => {
    let comparison = 0;
    if (sortBy === "author") comparison = left.authorName.localeCompare(right.authorName, "fr", { sensitivity: "base" });
    if (sortBy === "date") comparison = new Date(left.createdAt) - new Date(right.createdAt);
    if (sortBy === "opinions") comparison = left.opinionCount - right.opinionCount;
    return sortDirection === "asc" ? comparison : -comparison;
  });

  if (!USE_API) return <div className="card"><p>Les demandes d’évolution nécessitent une connexion au serveur.</p></div>;

  return (
    <section className="evolution-page">
      <form className="card evolution-create" onSubmit={submitRequest}>
        <div className="card-header"><h2>{requestType === "bug" ? "Signaler un bug" : "Proposer une évolution"}</h2></div>
        <div className="group" style={{ marginBottom: 12 }}>
          <Button type="button" variant={requestType === "evolution" ? "primary" : "secondary"} onClick={() => setRequestType("evolution")}>Demande d’évolution</Button>
          <Button type="button" variant={requestType === "bug" ? "primary" : "secondary"} onClick={() => setRequestType("bug")}>Signaler un bug</Button>
        </div>
        <label>Titre</label>
        <input maxLength={140} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={requestType === "bug" ? "Résumez le problème" : "Résumez votre idée"} />
        <label>Description</label>
        <textarea maxLength={4000} required rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={requestType === "bug" ? "Décrivez ce qui s’est passé, le résultat attendu et comment reproduire le bug" : "Décrivez le besoin et le résultat attendu"} />
        <Button type="submit" disabled={Boolean(busyAction)}>{busyAction === "create" ? "Enregistrement…" : (requestType === "bug" ? "Signaler le bug" : "Ajouter la demande")}</Button>
      </form>

      <div className="card evolution-toolbar">
        <label htmlFor="evolution-sort">Trier par</label>
        <select id="evolution-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="date">Date</option>
          <option value="author">Émetteur</option>
          <option value="opinions">Nombre d’avis</option>
        </select>
        <Button type="button" variant="secondary" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>
          {sortDirection === "asc" ? "Croissant ↑" : "Décroissant ↓"}
        </Button>
      </div>

      <SaveFeedback status={error ? "error" : (notice ? "success" : "idle")} message={error || notice} />
      {loading && <div className="muted-box">Chargement…</div>}
      {!loading && requests.length === 0 && <div className="muted-box">Aucune demande pour le moment.</div>}

      <div className="evolution-list">
        {sortedRequests.map((request) => (
          <details className="card evolution-card" key={request.id}>
            <summary className="evolution-summary">
              <span className={`evolution-status status-${request.status}`}>{STATUS_OPTIONS.find((item) => item.value === request.status)?.label || "À voir"}</span>
              <span className="evolution-summary-title">{request.title}</span>
              <span className="evolution-summary-meta">{request.authorName} · {formatDate(request.createdAt)}</span>
              <span className="opinion-count">{request.opinionCount} avis</span>
              <span className="evolution-score" aria-label={`Score ${request.score}`}>Score {request.score > 0 ? "+" : ""}{request.score}</span>
            </summary>
            <div className="evolution-content">
            <p className="evolution-description">{request.description}</p>
            <div className="evolution-votes">
              <Button type="button" className={request.myVote === 1 ? "vote-button selected positive" : "vote-button positive"} disabled={Boolean(busyAction)} onClick={() => vote(request, 1)} aria-pressed={request.myVote === 1}>👍 Pour</Button>
              <Button type="button" className={request.myVote === -1 ? "vote-button selected negative" : "vote-button negative"} disabled={Boolean(busyAction)} onClick={() => vote(request, -1)} aria-pressed={request.myVote === -1}>👎 Contre</Button>
              <span className="opinion-count">{request.opinionCount} {request.opinionCount > 1 ? "avis" : "avis"}</span>
            </div>

            {authUser?.role === "admin" && (
              <div className="evolution-admin-status" aria-label="État administratif"><span className="small evolution-admin-label">Changer le statut</span>
                {STATUS_OPTIONS.map((option) => (
                  <Button key={option.value} type="button" className={request.status === option.value ? `status-button active status-${option.value}` : "status-button"} disabled={Boolean(busyAction)} onClick={() => updateStatus(request.id, option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="evolution-comments">
              <h3>Commentaires ({request.comments.length})</h3>
              {request.comments.map((comment) => (
                <div className="evolution-comment" key={comment.id}>
                  <strong>{comment.authorName}</strong><span className="small"> · {formatDate(comment.createdAt)}</span>
                  <p>{comment.body}</p>
                </div>
              ))}
              <form className="comment-form" onSubmit={(event) => addComment(event, request.id)}>
                <textarea rows={2} maxLength={2000} required value={commentDrafts[request.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Ajouter un commentaire" aria-label={`Commenter ${request.title}`} />
                <Button type="submit" disabled={Boolean(busyAction)}>{busyAction === `comment:${request.id}` ? "Enregistrement…" : "Commenter"}</Button>
              </form>
            </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
