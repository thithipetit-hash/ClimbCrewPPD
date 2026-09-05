import React from "react";
import VideoTechnicalAnalysis from "./VideoTechnicalAnalysis.jsx";

function isLocalVideoUrl(url) {
  return /^\/routes\/[^/]+\/videos\/[^/]+$/.test(String(url || ""));
}

export default function RealisationVideoAnalysis({
  realisation,
  route,
  editable = false,
  onUpdate,
}) {
  const routeVideoUrls = Array.isArray(route?.videoUrls) ? route.videoUrls : [];
  const selectedVideoUrls = Array.isArray(realisation?.videoUrls) ? realisation.videoUrls : [];

  return (
    <>
      <div className="subcard" style={{ marginTop: 10 }}>
        <strong>Vidéos de cette réalisation</strong>
        {routeVideoUrls.length === 0 ? (
          <div className="small" style={{ marginTop: 6 }}>Aucune vidéo n’est encore associée à cette voie.</div>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {routeVideoUrls.map((url, index) => {
              const checked = selectedVideoUrls.includes(url);
              const limitReached = selectedVideoUrls.length >= 3;
              return (
                <label className="checkbox-field" key={url}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!editable || (!checked && limitReached)}
                    onChange={(event) => {
                      if (!editable || typeof onUpdate !== "function") return;
                      const next = event.target.checked
                        ? [...selectedVideoUrls, url].slice(0, 3)
                        : selectedVideoUrls.filter((item) => item !== url);
                      onUpdate({ videoUrls: next });
                    }}
                  />
                  <span>Vidéo {index + 1}{isLocalVideoUrl(url) ? " · chargée dans ClimbCrew" : " · lien externe"}</span>
                </label>
              );
            })}
          </div>
        )}
        <div className="small" style={{ marginTop: 6 }}>Jusqu’à 3 vidéos peuvent être rattachées précisément à ce passage.</div>
      </div>

      <VideoTechnicalAnalysis videoUrls={selectedVideoUrls} />
    </>
  );
}
