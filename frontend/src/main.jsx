import React from "react";
import ReactDOM from "react-dom/client";
import "./brand-name-ui.js";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import StartupVideoGate from "./StartupVideoGate.jsx";
import "./api-error-messages.js";
import "./issue-13-access-page.js";
import "./admin-user-management.js";
import "./climbcrew-enhancements.js";
import "./release-version-enhancements.js";
import "./session-status-display.js";
import "./account-participant-priority.js";
import "./realisation-mode-ui.js";
import "./progression-ui.js";
import "./badge-faq-ui.js";
import "./climber-profile-ui.js";
import "./styles/index.css";
import "./styles/session-status-colors.css";
import "./styles/badges.css";
import "./styles/badges-image-fix.css";
import "./styles/climber-profile.css";
import "./styles/mobile-bottom-nav.css";
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
