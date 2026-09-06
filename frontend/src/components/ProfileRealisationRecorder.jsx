import React from "react";
import Button from "./Button.jsx";
import { apiFetch, apiUploadVideoInChunks } from "../lib/api.js";
import { formatDateShortFr, formatRouteForRealisation } from "../lib/domain.js";
import {
  REALISATION_CRITERION_LABELS,
  REALISATION_MODE_LABELS,
} from "../lib/realisation-mode.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
const VIDEO_TYPE_BY_EXTENSION = Object.freeze({
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
});

function resolveVideoType(file) {
  const declaredType = String(file?.type || "").toLowerCase();
  if (ACCEPTED_VIDEO_TYPES.has(declaredType)) return declaredType;
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  return VIDEO_TYPE_BY_EXTENSION[extension] || "";
}

export default function ProfileRealisationRecorder({
  myParticipantId,
  routesById,
  getParticipantSessions,
  onSaved,
}) {
  const fileRef = React.useRef(null);
  const sessions = typeof getParticipantSessions === "function"
    ? getParticipantSessions(myParticipantId)
    : [];
  const routes = Object.values(routesById || {})
    .filter((route) => route?.active !== false)
    .sort((a, b) => {
      const rope = Number(a.numeroCorde || 999) - Number(b.numeroCorde || 999);
      if (rope !== 0) return rope;
      return String(a.numeroVoieUnique || a.id).localeCompare(String(b.numeroVoieUnique || b.id), "fr", { numeric: true });
    });

  const [sessionId, setSessionId] = React.useState("");
  const [routeId, setRouteId] = React.useState("");
  const [mode, setMode] = React.useState("en_tete");
  const [criterion, setCriterion] = React.useState("a_vue");
  const [comment, setComment] = React.useState("");
  const [videoFile, setVideoFile] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    if (!sessionId && sessions[0]?.id) setSessionId(String(sessions[0].id));
  }, [sessionId, sessions]);

  React.useEffect(() => {
    if (!routeId && routes[0]?.id) setRouteId(String(routes[0].id));
  }, [routeId, routes]);

  const selectedRoute = routesById?.[routeId];
  React.useEffect(() => {
    if (selectedRoute?.moulinetteOnly) setMode("moulinette");
  }, [selectedRoute?.moulinetteOnly]);

  function selectVideo(file) {
    setError("");
    setNotice("");
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoFile(null);
      setError("Vidéo trop volumineuse. Maximum 50 Mo.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!resolveVideoType(file)) {
      setVideoFile(null);
      setError("Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setVideoFile(file);
  }

  async function saveRealisation(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");

    const session = sessions.find((item) => String(item.id) === String(sessionId));
    const route = routesById?.[routeId];
    if (!session) {
      setError("Choisissez une séance à laquelle vous étiez inscrit.");
      return;
    }
    if (!route) {
      setError("Choisissez une voie.");
      return;
    }

    const realisationId = `realisation-profile-${Date.now()}`;
    const payload = {
      id: realisationId,
      participantId: String(myParticipantId),
      sessionId: String(session.id),
      voieId: String(route.id),
      dateRealisation: `${String(session.date).slice(0, 10)}T12:00:00`,
      modeRealisation: route.moulinetteOnly ? "moulinette" : mode,
      styleRealisation: criterion,
      commentaire: comment,
      cotationProposee: route.cotationAjustee || route.cotationReference || "",
      chute: false,
      assureurId: "",
    };

    try {
      setSaving(true);
      const created = await apiFetch("/realisations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const createdId = created?.id || realisationId;

      if (videoFile) {
        try {
          setNotice("Réalisation enregistrée. Transfert de la vidéo…");
          await apiUploadVideoInChunks(
            `/realisations/${encodeURIComponent(createdId)}/video-uploads`,
            videoFile,
            {
              mimeType: resolveVideoType(videoFile),
              onProgress: ({ uploadedParts, totalParts }) => {
                setNotice(`Réalisation enregistrée. Transfert vidéo ${uploadedParts}/${totalParts}…`);
              },
            },
          );
          setNotice("Réalisation et vidéo enregistrées dans Profil.");
        } catch (uploadError) {
          setNotice("La réalisation est enregistrée.");
          setError(`La vidéo n’a pas pu être chargée : ${uploadError.message || "erreur de transfert"}`);
        }
      } else {
        setNotice("Réalisation enregistrée dans Profil.");
      }

      setComment("");
      setVideoFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (typeof onSaved === "function") await onSaved();
    } catch (caughtError) {
      setError(caughtError.message || "Enregistrement de la réalisation impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card profile-realisation-recorder">
      <div className="card-header">
        <div>
          <h3 style={{ margin: 0 }}>Enregistrer une réalisation</h3>
          <div className="small">Ajoutez votre passage directement depuis Profil, avec une vidéo si vous le souhaitez.</div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="muted-box" style={{ marginTop: 8 }}>
          Aucune séance inscrite n’est disponible pour enregistrer une réalisation.
        </div>
      ) : (
        <form className="stack" onSubmit={saveRealisation} style={{ marginTop: 10 }}>
          <div className="grid two">
            <div>
              <label htmlFor="profile-realisation-session">Séance</label>
              <select
                id="profile-realisation-session"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDateShortFr(String(session.date).slice(0, 10))} · {session.slot || "séance"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="profile-realisation-route">Voie</label>
              <select
                id="profile-realisation-route"
                value={routeId}
                onChange={(event) => setRouteId(event.target.value)}
              >
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>{formatRouteForRealisation(route)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="profile-realisation-mode">Mode</label>
              <select
                id="profile-realisation-mode"
                value={selectedRoute?.moulinetteOnly ? "moulinette" : mode}
                disabled={Boolean(selectedRoute?.moulinetteOnly)}
                onChange={(event) => setMode(event.target.value)}
              >
                {Object.entries(REALISATION_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="profile-realisation-criterion">Critère</label>
              <select
                id="profile-realisation-criterion"
                value={criterion}
                onChange={(event) => setCriterion(event.target.value)}
              >
                {Object.entries(REALISATION_CRITERION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="profile-realisation-comment">Commentaire</label>
            <input
              id="profile-realisation-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optionnel"
            />
          </div>

          <div>
            <label htmlFor="profile-realisation-video">Vidéo du passage (optionnelle)</label>
            <input
              ref={fileRef}
              id="profile-realisation-video"
              type="file"
              accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.ogv,.mov"
              onChange={(event) => selectVideo(event.target.files?.[0])}
            />
            <div className="small">MP4, WebM, OGG ou MOV · 50 Mo maximum. Le transfert est découpé automatiquement pour les vidéos volumineuses.</div>
          </div>

          {videoFile && <div className="small">Vidéo prête : {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(2)} Mo</div>}
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="muted-box" role="status">{notice}</div>}

          <div className="group">
            <Button type="submit" disabled={saving || !sessionId || !routeId}>
              {saving ? "Enregistrement…" : videoFile ? "Enregistrer réalisation + vidéo" : "Enregistrer la réalisation"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
