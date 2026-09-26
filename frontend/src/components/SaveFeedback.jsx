import React from "react";

export default function SaveFeedback({ status = "idle", message = "", className = "" }) {
  if (!message || status === "idle") return null;

  const role = status === "error" ? "alert" : "status";
  return (
    <div className={`save-feedback ${status} ${className}`.trim()} role={role} aria-live={status === "error" ? "assertive" : "polite"}>
      {message}
    </div>
  );
}
