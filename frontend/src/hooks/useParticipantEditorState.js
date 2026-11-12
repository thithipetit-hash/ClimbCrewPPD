import { useState } from "react";

const EMPTY_PARTICIPANT = {
  nom: "", prenom: "", email: "", passport: "sans", passportDecouverte: false, passeportFfme: false, sexe: "", anneeNaissance: null,
  cotisation: false, ffme: false, canEncadrer: false, canReferer: false, canAdmin: false,
};

export function useParticipantEditorState() {
  const [newParticipant, setNewParticipant] = useState(EMPTY_PARTICIPANT);
  return { newParticipant, setNewParticipant };
}
