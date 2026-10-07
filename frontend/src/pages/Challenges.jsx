import React from "react";
import Button from "../components/Button.jsx";
import { apiFetch } from "../lib/api.js";

function localTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function routeLabel(route) {
  const rope = route.numeroCorde === null || route.numeroCorde === undefined ? "" : `Corde ${route.numeroCorde}`;
  const grade = route.cotation || route.cotationAjustee || route.cotationReference || "";
  return [rope, route.couleurPrises, grade, route.nomOuvreur, route.nomVoie]
    .filter(Boolean)
    .join(" · ") || `Voie ${route.numeroVoieUnique || route.id}`;
}

const EMPTY_FORM = Object.freeze({
  name: "",
  description: "",
  startsOn: "",
  endsOn: "",
  routeIds: [],
});

export default function Challenges({ isAdmin = false }) {
  const [challenges, setChallenges] = React.useState([]);
  const [selectedChallengeId, setSelectedChallengeId] = React.useState("");
  const [detail, setDetail] = React.useState(null);
  const [badges, setBadges] = React.useState([]);
  const [availableRoutes, setAvailableRoutes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [routesLoading, setRoutesLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [form, setForm] = React.useState(() => ({ ...EMPTY_FORM, startsOn: localTodayIso() }));

  const loadChallenges = React.useCallback(async (preferredId = "") => {
    setLoading(true);
    setError("");
    try {
      const [challengeList, challengeBadges] = await Promise.all([
        apiFetch("/challenges"),
        apiFetch("/challenge-badges/me"),
      ]);
      const list = Array.isArray(challengeList) ? challengeList : [];
      setChallenges(list);
      setBadges(Array.isArray(challengeBadges) ? challengeBadges : []);
      setSelectedChallengeId((current) => {
        const wanted = String(preferredId || current || "");
        if (wanted && list.some((item) => String(item.id) === wanted)) return wanted;
        return String(list[0]?.id || "");
      });
    } catch (loadError) {
      setError(String(loadError.message || loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  React.useEffect(() => {
    if (!isAdmin) {
      setAvailableRoutes([]);
      return undefined;
    }
    let mounted = true;
    setRoutesLoading(true);
    apiFetch("/routes")
      .then((value) => {
        if (mounted) setAvailableRoutes(Array.isArray(value) ? value : []);
      })
      .catch((loadError) => {
        if (mounted) setError(String(loadError.message || loadError));
      })
      .finally(() => {
        if (mounted) setRoutesLoading(false);
      });
    return () => { mounted = false; };
  }, [isAdmin]);

  React.useEffect(() => {
    if (!selectedChallengeId) {
      setDetail(null);
      return;
    }
    let mounted = true;
    setDetailLoading(true);
    setError("");
    apiFetch(`/challenges/${encodeURIComponent(selectedChallengeId)}`)
      .then((value) => {
        if (mounted) setDetail(value);
      })
      .catch((loadError) => {
        if (mounted) setError(String(loadError.message || loadError));
      })
      .finally(() => {
        if (mounted) setDetailLoading(false);
      });
    return () => { mounted = false; };
  }, [selectedChallengeId]);

  function toggleRoute(routeId) {
    const id = String(routeId);
    setForm((current) => ({
      ...current,
      routeIds: current.routeIds.includes(id)
        ? current.routeIds.filter((value) => value !== id)
        : [...current.routeIds, id],
    }));
  }

  async function createNewChallenge(event) {
    event.preventDefault();
    if (saving) return;
    setMessage("");
    setError("");
    if (form.routeIds.length === 0) {
      setError("Sélectionnez au moins une voie pour le challenge.");
      return;
    }

    try {
      setSaving(true);
      const created = await apiFetch("/admin/challenges", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
          routeIds: form.routeIds,
        }),
      });
      setForm({ ...EMPTY_FORM, startsOn: localTodayIso() });
      setMessage(`Challenge « ${created.name} » créé avec ${created.targetRouteCount} voie${created.targetRouteCount > 1 ? "s" : ""}.`);
      await loadChallenges(created.id);
    } catch (saveError) {
      setError(String(saveError.message || saveError));
    } finally {
      setSaving(false);
    }
  }

  async function closeSelectedChallenge() {
    if (!detail || detail.status === "closed" || closing) return;
    if (!window.confirm(`Clôturer définitivement le challenge « ${detail.name} » et figer son classement ?`)) return;

    setMessage("");
    setError("");
    try {
      setClosing(true);
      const closed = await apiFetch(`/admin/challenges/${encodeURIComponent(detail.id)}/close`, { method: "POST" });
      setDetail(closed);
      setMessage(`Challenge « ${closed.name} » clôturé. Le classement est figé et les badges portent désormais le nom du challenge.`);
      await loadChallenges(closed.id);
    } catch (closeError) {
      setError(String(closeError.message || closeError));
    } finally {
      setClosing(false);
    }
  }

  const completedIds = new Set((detail?.myProgress?.completedRouteIds || []).map(String));

  return (
    <div className="stack challenges-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ margin: 0 }}>Challenges</h2>
            <div className="small">Toute réalisation pendant la période compte, y compris un essai. Une même voie ne compte qu’une fois.</div>
          </div>
        </div>
        {badges.length > 0 && (
          <div className="group" style={{ marginTop: 12 }}>
            {badges.map((badge) => {
              const badgeName = badge.metadata?.challengeName || badge.label || "Challenge";
              return (
                <span className="pill" key={badge.id} title={badgeName}>
                  🏅 {badgeName} · #{badge.metadata?.rank || "?"}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <details className="card">
          <summary><strong>Créer un challenge</strong></summary>
          <form className="stack challenge-create-form" style={{ marginTop: 14 }} onSubmit={createNewChallenge}>
            <div className="form-grid challenge-form-grid">
              <label>
                Nom
                <input value={form.name} minLength={3} maxLength={120} required onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                Date de début
                <input type="date" value={form.startsOn} required onChange={(event) => setForm((current) => ({ ...current, startsOn: event.target.value }))} />
              </label>
              <label>
                Date de fin (facultative)
                <input type="date" min={form.startsOn || undefined} value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} />
              </label>
            </div>
            <label>
              Description
              <textarea value={form.description} maxLength={2000} rows={3} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <div className="challenge-route-picker">
              <strong>Voies du challenge</strong>
              <div className="small" style={{ marginTop: 4 }}>Sélectionnez directement une ou plusieurs voies. Les voies choisies sont figées à la création du challenge.</div>
              {routesLoading ? (
                <div className="muted-box" style={{ marginTop: 10 }}>Chargement des voies…</div>
              ) : availableRoutes.length === 0 ? (
                <div className="muted-box" style={{ marginTop: 10 }}>Aucune voie disponible.</div>
              ) : (
                <div className="stack challenge-route-list" style={{ marginTop: 10 }}>
                  {availableRoutes.map((route) => {
                    const id = String(route.id);
                    return (
                      <label className="muted-box challenge-route-option" key={id}>
                        <input type="checkbox" checked={form.routeIds.includes(id)} onChange={() => toggleRoute(id)} />
                        <span className="challenge-route-label">{routeLabel(route)}{route.active === false ? " · inactive" : ""}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="small" style={{ marginTop: 8 }}>{form.routeIds.length} voie{form.routeIds.length > 1 ? "s" : ""} sélectionnée{form.routeIds.length > 1 ? "s" : ""}</div>
            </div>
            <Button type="submit" disabled={saving || routesLoading || availableRoutes.length === 0}>{saving ? "Création…" : "Créer le challenge"}</Button>
          </form>
        </details>
      )}

      {error && <div className="muted-box" role="alert">{error}</div>}
      {message && <div className="muted-box" role="status">{message}</div>}

      {loading ? (
        <div className="card"><div className="muted-box">Chargement des challenges…</div></div>
      ) : challenges.length === 0 ? (
        <div className="card"><div className="muted-box">Aucun challenge pour le moment.</div></div>
      ) : (
        <div className="card">
          <label htmlFor="challenge-select">Challenge affiché</label>
          <select id="challenge-select" value={selectedChallengeId} onChange={(event) => setSelectedChallengeId(event.target.value)}>
            {challenges.map((challenge) => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.status === "closed" ? "✓ " : "▶ "}{challenge.name} — {formatDate(challenge.startsOn)}
              </option>
            ))}
          </select>
        </div>
      )}

      {detailLoading && <div className="card"><div className="muted-box">Calcul du classement…</div></div>}

      {!detailLoading && detail && (
        <>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 style={{ margin: 0 }}>{detail.name}</h2>
                <div className="small">{detail.targetRouteCount} voie{detail.targetRouteCount > 1 ? "s" : ""} sélectionnée{detail.targetRouteCount > 1 ? "s" : ""}</div>
              </div>
              <span className="badge">{detail.status === "closed" ? "Clôturé" : "En cours"}</span>
            </div>
            {detail.description && <p>{detail.description}</p>}
            <div className="group">
              <span className="pill">Début : {formatDate(detail.startsOn)}</span>
              {detail.endsOn && <span className="pill">Fin : {formatDate(detail.endsOn)}</span>}
              <span className="pill">{detail.targetRouteCount} voie{detail.targetRouteCount > 1 ? "s" : ""}</span>
            </div>
            {detail.myProgress && (
              <div className="muted-box" style={{ marginTop: 12 }}>
                <strong>Ma progression : {detail.myProgress.score} / {detail.targetRouteCount}</strong>
                {detail.myProgress.rank && <span> · classement #{detail.myProgress.rank}</span>}
                {detail.myProgress.challengeBadge && <span> · 🏅 Badge {detail.name}</span>}
              </div>
            )}
            {isAdmin && detail.status !== "closed" && (
              <div style={{ marginTop: 12 }}>
                <Button type="button" disabled={closing} onClick={closeSelectedChallenge}>
                  {closing ? "Clôture…" : "Clôturer le challenge"}
                </Button>
              </div>
            )}
          </div>

          <section className="card">
            <div className="card-header"><h3 style={{ margin: 0 }}>Classement</h3></div>
            {detail.ranking.length === 0 ? (
              <div className="muted-box">Aucune réalisation depuis le début du challenge.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead><tr><th>Rang</th><th>Grimpeur</th><th>Voies</th><th>Récompense</th></tr></thead>
                  <tbody>
                    {detail.ranking.map((entry) => (
                      <tr key={entry.participantId}>
                        <td><strong>#{entry.rank}</strong></td>
                        <td>{entry.participantName}</td>
                        <td>{entry.score} / {detail.targetRouteCount}</td>
                        <td>{detail.status === "closed" && entry.challengeBadge ? `🏅 ${detail.name}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="card">
            <summary><strong>Voies du challenge ({detail.targetRoutes.length})</strong></summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {detail.targetRoutes.map((route) => (
                <div className="muted-box" key={route.id}>
                  {completedIds.has(String(route.id)) ? "✓ " : "○ "}{routeLabel(route)}
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
