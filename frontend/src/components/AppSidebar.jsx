export default function AppSidebar({
  open,
  visibleTabs,
  activeTab,
  onSelectTab,
  authUser,
  onLogout,
  onClose,
}) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Navigation CristalClimbClub">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img src="/logo-climbcrew.png" alt="Logo CristalClimbClub" className="sidebar-logo" />
          <span>CristalClimbClub</span>
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
  );
}
