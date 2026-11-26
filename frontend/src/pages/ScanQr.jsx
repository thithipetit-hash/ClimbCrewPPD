import React from "react";
import Button from "../components/Button.jsx";

function extractRouteId(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (value.startsWith("climbcrew:voie:")) return decodeURIComponent(value.slice("climbcrew:voie:".length));
  try {
    const url = new URL(value);
    return url.searchParams.get("qrRoute") || "";
  } catch {
    return "";
  }
}

export default function ScanQr({ routes = [], onScanRoute }) {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const frameRef = React.useRef(0);
  const [status, setStatus] = React.useState("");
  const [running, setRunning] = React.useState(false);

  const routeIds = React.useMemo(() => new Set(routes.map((route) => String(route.id))), [routes]);

  const stopCamera = React.useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    stopCamera();
    setStatus("");
    if (!("BarcodeDetector" in window)) {
      setStatus("Le scan QR n’est pas pris en charge par ce navigateur. Utilisez un navigateur mobile récent.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("La caméra n’est pas disponible dans ce navigateur.");
      return;
    }

    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setRunning(true);
      setStatus("Présentez le QR code d’une voie devant la caméra.");

      const detect = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const rawValue = codes?.[0]?.rawValue || "";
          const routeId = extractRouteId(rawValue);
          if (routeId) {
            if (!routeIds.has(String(routeId))) {
              setStatus("Ce QR code correspond à une voie inconnue ou supprimée.");
            } else {
              stopCamera();
              onScanRoute?.(routeId);
              return;
            }
          }
        } catch {
          // Une image vidéo intermédiaire peut être momentanément illisible : on continue le scan.
        }
        frameRef.current = requestAnimationFrame(detect);
      };
      frameRef.current = requestAnimationFrame(detect);
    } catch (error) {
      stopCamera();
      setStatus(`Impossible d’utiliser la caméra : ${error.message || error}`);
    }
  }

  return (
    <div className="scan-qr-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Scan QR code</h2>
            <div className="small">Scannez le QR code affiché sur une voie pour ouvrir directement l’enregistrement d’une réalisation du jour.</div>
          </div>
          {running
            ? <Button variant="secondary" onClick={stopCamera}>Arrêter</Button>
            : <Button onClick={startCamera}>Démarrer le scan</Button>}
        </div>

        <div className="qr-scanner-frame">
          <video ref={videoRef} playsInline muted aria-label="Caméra de scan QR" />
          {!running && <div className="qr-scanner-placeholder">Caméra arrêtée</div>}
        </div>
        {status && <div className="muted-box" role="status">{status}</div>}
      </div>
    </div>
  );
}
