import React from "react";
import { THEME_OPTIONS } from "../lib/theme.js";

export default function AppSidebar({
  open,
  visibleTabs,
  activeTab,
  onSelectTab,
  themePreference,
  onThemePreferenceChange,
  authUser,
  onLogout,
  onClose,
}) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Navigation ClimbClubCristal">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="sidebar-logo" />
            <span>ClimbClubCristal</span>
          </div>
          <button
            className="sidebar-close sidebar-logout"
            onClick={() => {
              onClose();
              onLogout();
            }}
            aria-label="Se déconnecter"
            title="Déconnexion"
          >
            <svg className="sidebar-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {visibleTabs.map((item) => (
          <button
            key={item.key}
            className={`side-tab ${activeTab === item.key ? "active" : ""}`}
            onClick={() => {
              onSelectTab(item.key);
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}

        <div className="sidebar-theme">
          <label htmlFor="sidebar-theme-selector">Ambiance</label>
          <select
            id="sidebar-theme-selector"
            value={themePreference}
            onChange={(event) => onThemePreferenceChange(event.target.value)}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {authUser && (
          <div className="sidebar-account">
            <div className="small">{authUser.email}</div>
          </div>
        )}

        {authUser && (
          <div className="sidebar-settings">
            <button
              className={`side-tab ${activeTab === "parametres" ? "active" : ""}`}
              onClick={() => {
                onSelectTab("parametres");
                onClose();
              }}
            >
              ⚙ Paramètres
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
