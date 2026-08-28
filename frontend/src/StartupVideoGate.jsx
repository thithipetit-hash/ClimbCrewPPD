import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "./lib/version.js";

const INTRO_VIDEO_SRC = `/media/climbcrew-startup.mp4?v=${encodeURIComponent(APP_VERSION || "dev")}`;
const EXIT_DURATION_MS = 260;
const SAFETY_TIMEOUT_MS = 8000;
const VIDEO_ERROR_GRACE_MS = 1200;

export default function StartupVideoGate({ children }) {
  const [showIntro, setShowIntro] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const appRef = useRef(null);
  const finishingRef = useRef(false);
  const exitTimerRef = useRef(null);
  const videoErrorTimerRef = useRef(null);

  const finishIntro = useCallback(() => {
    if (finishingRef.current) return;

    finishingRef.current = true;
    setIsLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      setShowIntro(false);
    }, EXIT_DURATION_MS);
  }, []);

  const handleVideoError = useCallback(() => {
    // Ne ferme plus l'intro dans la même frame qu'une erreur média : sur certains
    // navigateurs/PWA Android, une ancienne entrée de cache peut échouer avant
    // que la ressource versionnée soit revalidée. Le court délai rend le branding
    // visible et laisse le timeout de sécurité reprendre la main proprement.
    if (videoErrorTimerRef.current) {
      window.clearTimeout(videoErrorTimerRef.current);
    }
    videoErrorTimerRef.current = window.setTimeout(finishIntro, VIDEO_ERROR_GRACE_MS);
  }, [finishIntro]);

  useEffect(() => {
    if (appRef.current) {
      appRef.current.inert = showIntro;
    }
    document.body.classList.toggle("startup-video-active", showIntro);

    return () => {
      if (appRef.current) {
        appRef.current.inert = false;
      }
      document.body.classList.remove("startup-video-active");
    };
  }, [showIntro]);

  useEffect(() => {
    if (!showIntro) return undefined;

    const safetyTimer = window.setTimeout(finishIntro, SAFETY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(safetyTimer);
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
      if (videoErrorTimerRef.current) {
        window.clearTimeout(videoErrorTimerRef.current);
      }
    };
  }, [finishIntro, showIntro]);

  return (
    <>
      <div
        ref={appRef}
        className="startup-video-app"
        aria-hidden={showIntro ? "true" : undefined}
      >
        {children}
      </div>

      {showIntro ? (
        <div
          className={`startup-video${isLeaving ? " startup-video--leaving" : ""}`}
          aria-label="Vidéo d'introduction Cristal Climb Club"
        >
          <video
            className="startup-video__media"
            autoPlay
            muted
            playsInline
            preload="auto"
            onClick={finishIntro}
            onEnded={finishIntro}
            onError={handleVideoError}
            aria-label="Passer la vidéo d'introduction et ouvrir l'application"
          >
            <source src={INTRO_VIDEO_SRC} type="video/mp4" />
          </video>

          <div className="startup-video__brand-frame" aria-hidden="true">
            <div className="startup-video__brand">
              <span className="startup-video__brand-c startup-video__brand-c--crystal">C</span>
              <span>ristal </span>
              <span className="startup-video__brand-c startup-video__brand-c--blue">C</span>
              <span>limb </span>
              <span className="startup-video__brand-c startup-video__brand-c--orange">C</span>
              <span>lub</span>
            </div>
          </div>

          <button
            className="startup-video__skip"
            type="button"
            onClick={finishIntro}
          >
            Passer
          </button>
        </div>
      ) : null}
    </>
  );
}
