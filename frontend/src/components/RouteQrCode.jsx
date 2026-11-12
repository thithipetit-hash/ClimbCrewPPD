import React from "react";
import Button from "./Button.jsx";
import { formatRouteName, normalizeRopeNumber } from "../lib/domain.js";
import { qrcode } from "../vendor/qrcode.mjs";

export function routeQrPayload(routeId, origin = window.location.origin) {
  const url = new URL("/", origin);
  url.searchParams.set("qrRoute", String(routeId || ""));
  return url.toString();
}

export function routeQrSvg(routeId) {
  const qr = qrcode(0, "M");
  qr.addData(routeQrPayload(routeId), "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

export function routeQrImageUrl(routeId) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(routeQrSvg(routeId))}`;
}

export default function RouteQrCode({ route, onClose }) {
  if (!route) return null;
  const imageUrl = routeQrImageUrl(route.id);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="QR code de la voie">
      <div className="modal-panel route-qr-modal">
        <div className="card-header">
          <div>
            <h2>QR code de la voie</h2>
            <div className="small">Corde {normalizeRopeNumber(route.numeroCorde)} · {route.cotationAjustee} · {formatRouteName(route)}</div>
          </div>
          <Button variant="dangerGhost" className="modal-close" onClick={onClose} aria-label="Fermer">×</Button>
        </div>
        <div className="route-qr-content">
          <img src={imageUrl} alt={`QR code de ${formatRouteName(route)}`} width="260" height="260" />
          <div className="small">Le QR code ouvre ClimbCrew directement sur l’enregistrement de cette voie.</div>
          <a className="qr-download-link" href={imageUrl} download={`climbcrew-voie-${route.id}.svg`}>Télécharger le QR code</a>
        </div>
      </div>
    </div>
  );
}
