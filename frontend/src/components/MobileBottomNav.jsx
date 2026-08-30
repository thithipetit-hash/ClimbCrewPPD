export default function MobileBottomNav({ visibleTabs, activeTab, onSelectTab }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation mobile ClimbClubCristal">
      {visibleTabs.map((item) => (
        <button
          key={item.key}
          className={`bottom-tab ${activeTab === item.key ? "active" : ""}`}
          onClick={() => onSelectTab(item.key)}
          title={item.label}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
