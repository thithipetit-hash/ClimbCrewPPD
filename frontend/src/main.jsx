import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import StartupVideoGate from "./StartupVideoGate.jsx";
import "./styles/climbcrew-enhancements.css";
import "./styles/index.css";
import "./styles/button-compact.css";
import "./styles/session-status-colors.css";
import "./styles/badges.css";
import "./styles/badges-image-fix.css";
import "./styles/climber-profile.css";
import "./styles/mobile-bottom-nav.css";
import "./styles/mobile-session-compact.css";
import "./styles/startup-video.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StartupVideoGate>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StartupVideoGate>
  </React.StrictMode>
);
