import React from "react";

export default function AdminSection({ title, summary, children }) {
  return (
    <details className="card admin-section-details">
      <summary className="card-header" style={{ cursor: "pointer", userSelect: "none", marginBottom: 0 }}>
        <div>
          <h2>{title}</h2>
          {summary ? <div className="small">{summary}</div> : null}
        </div>
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}
