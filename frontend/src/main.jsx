import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Competences from "./pages/Competences.jsx";
import AppPageOutlet from "./components/AppPageOutlet.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./styles/climbcrew-enhancements.css";
import "./styles/index.css";
import "./styles/button-compact.css";
import "./styles/session-status-colors.css";
import "./styles/badges.css";
import "./styles/badges-image-fix.css";
import "./styles/climber-profile.css";
import "./styles/mobile-bottom-nav.css";
import "./styles/mobile-session-compact.css";
import "./styles/user-data-mobile.css";
import "./styles/ui-density.css";
import "./styles/challenges.css";
import "./styles/competences.css";

function OfflineCompetences() {
  const [offlineReady, setOfflineReady] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    let mounted = true;
    navigator.serviceWorker.ready.then(() => {
      if (mounted) setOfflineReady(true);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <header className="card competences-autonomous-header">
        <strong>ClimbCrew · Bibliothèque de compétences</strong>
        <p className="small" role="status">
          {offlineReady ? "Bibliothèque préparée pour une consultation sans réseau sur cet appareil." : "Préparation de la bibliothèque autonome…"}
        </p>
        <a href="/">Retour à l’application (connexion nécessaire)</a>
      </header>
      <main className="competences-autonomous-main">
        <Competences accountId="autonome" standalone />
      </main>
    </>
  );
}

const isStandaloneCompetences = window.location.pathname === "/competences/hors-ligne";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isStandaloneCompetences ? <OfflineCompetences /> : <><App /><AppPageOutlet /></>}
    </ErrorBoundary>
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/competences-sw.js").catch((error) => {
      console.warn("Mode autonome non disponible :", error);
    });
  }, { once: true });
}
