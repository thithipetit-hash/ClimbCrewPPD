import { useState } from "react";

export function useConfirmationDialog() {
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  function requestConfirmation({ title, message, confirmLabel = "Supprimer", onConfirm }) {
    setPendingConfirmation({ title, message, confirmLabel, onConfirm, busy: false });
  }

  async function runPendingConfirmation() {
    const pending = pendingConfirmation;
    if (!pending || pending.busy) return;
    setPendingConfirmation((current) => current ? { ...current, busy: true } : current);
    try {
      await pending.onConfirm();
      setPendingConfirmation(null);
    } catch (error) {
      setPendingConfirmation((current) => current ? { ...current, busy: false } : current);
      throw error;
    }
  }

  return {
    pendingConfirmation,
    setPendingConfirmation,
    requestConfirmation,
    runPendingConfirmation,
  };
}
