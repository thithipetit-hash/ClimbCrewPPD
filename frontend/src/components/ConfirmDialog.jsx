import React from "react";
import Button from "./Button.jsx";

export default function ConfirmDialog({
  open,
  title = "Confirmer l’action",
  message = "",
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-panel">
        <div className="card-header">
          <h2 className="modal-title">{title}</h2>
        </div>
        {message && <div className="muted-box">{message}</div>}
        <div className="group" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "En cours…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
