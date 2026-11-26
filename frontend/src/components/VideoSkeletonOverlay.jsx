import React from "react";
import { nearestPoseFrame, SKELETON_LINKS } from "../lib/video-analysis-display.js";

export default function VideoSkeletonOverlay({ videoRef, frames, sampleFps }) {
  const [enabled, setEnabled] = React.useState(true);
  const [pose, setPose] = React.useState(null);
  const [dimensions, setDimensions] = React.useState(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) return undefined;
    let callback;
    let active = true;
    function update() {
      if (!active) return;
      setPose(nearestPoseFrame(frames, video.currentTime, sampleFps));
      if (video.videoWidth && video.videoHeight) {
        setDimensions(old => old?.width === video.videoWidth && old?.height === video.videoHeight ? old : { width: video.videoWidth, height: video.videoHeight });
      }
    }
    function frame() {
      if (!active) return;
      update();
      callback = video.requestVideoFrameCallback(frame);
    }
    update();
    for (const event of ["timeupdate", "seeked", "loadedmetadata", "pause"]) video.addEventListener(event, update);
    if (video.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(frame);
    return () => {
      active = false;
      if (callback != null) video.cancelVideoFrameCallback?.(callback);
      for (const event of ["timeupdate", "seeked", "loadedmetadata", "pause"]) video.removeEventListener(event, update);
    };
  }, [videoRef, frames, sampleFps, enabled]);

  const w = dimensions?.width || 1;
  const h = dimensions?.height || 1;
  const points = pose?.points || [];
  return (
    <>
      {enabled && dimensions && <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {SKELETON_LINKS.map(([a,b]) => points[a] && points[b] && <line key={`${a}-${b}`} x1={points[a].x*w} y1={points[a].y*h} x2={points[b].x*w} y2={points[b].y*h} stroke="#30f5c0" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
        {points.map((p,i) => p && <circle key={i} cx={p.x*w} cy={p.y*h} r={Math.min(w,h)*0.006} fill="#f7dc5c" stroke="#17212b" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      </svg>}
      <label style={{ position: "absolute", top: 6, left: 6, background: "#17212b", color: "#fff", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5 }}>
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} style={{ width: "auto" }} /> Squelette 2D
      </label>
    </>
  );
}
