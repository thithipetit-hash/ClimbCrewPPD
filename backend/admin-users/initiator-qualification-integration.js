import express from "express";
import { requireAdmin } from "./security.js";
import { updateParticipantInitiatorQualifications } from "./initiator-qualification-service.js";

const PATCH_FLAG = Symbol.for("climbcrew.initiator-qualification-patch");
const ROUTE_FLAG = Symbol.for("climbcrew.initiator-qualification-route");

export function installInitiatorQualificationIntegration() {
  if (express.application[PATCH_FLAG]) return;
  express.application[PATCH_FLAG] = true;

  const originalListen = express.application.listen;
  express.application.listen = function listenWithInitiatorQualifications(...args) {
    if (!this[ROUTE_FLAG]) {
      this.put(
        "/admin/participants/:id/qualifications",
        requireAdmin,
        updateParticipantInitiatorQualifications,
      );
      this[ROUTE_FLAG] = true;
    }
    return originalListen.apply(this, args);
  };
}
