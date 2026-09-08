import Button from "./Button.jsx";

export default function BroadcastMessageModal({ messages = [], error = "", onAcknowledge }) {
  if (messages.length === 0) return null;
  const message = messages[0];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="broadcast-message-title">
      <div className="modal-panel" style={{ maxWidth: 560 }}>
        <div className="card-header">
          <div>
            <div className="small">Message du club</div>
            <h2 id="broadcast-message-title" className="modal-title">{message.title}</h2>
          </div>
        </div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, margin: "18px 0" }}>{message.body}</div>
        {messages.length > 1 && (
          <div className="small" style={{ marginBottom: 12 }}>
            {messages.length - 1} autre{messages.length > 2 ? "s" : ""} message{messages.length > 2 ? "s" : ""} à lire ensuite.
          </div>
        )}
        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="group" style={{ justifyContent: "flex-end" }}>
          <Button onClick={() => onAcknowledge(message.id)}>J’ai lu</Button>
        </div>
      </div>
    </div>
  );
}
