import { loadVideoAnalysisRules, normalizeVideoAnalysisRules } from "./video-analysis-rules.js";

const MEDIAPIPE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const MAX_ANALYSIS_SECONDS = 8 * 60;

const LANDMARK = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
});

let poseLandmarkerPromise = null;

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleDegrees(a, b, c) {
  if (!a || !b || !c) return null;
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const denominator = Math.hypot(bax, bay) * Math.hypot(bcx, bcy);
  if (!denominator) return null;
  const cosine = Math.min(1, Math.max(-1, ((bax * bcx) + (bay * bcy)) / denominator));
  return Math.acos(cosine) * (180 / Math.PI);
}

function visibleLandmark(landmarks, index, minVisibility) {
  const point = landmarks?.[index];
  if (!point) return null;
  const visibility = Number(point.visibility ?? 1);
  return Number.isFinite(visibility) && visibility >= minVisibility ? point : null;
}

function formatSeconds(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest} s`;
}

function finishInterval(intervals, start, end, minimumSeconds) {
  if (start == null || end == null) return;
  const duration = Math.max(0, end - start);
  if (duration >= minimumSeconds) intervals.push({ start, end, duration });
}

function normalizeSpeed(previous, current, torsoLength, dt) {
  if (!previous || !current || !torsoLength || !dt) return 0;
  return distance(previous, current) / torsoLength / dt;
}

function buildFramePose(landmarks, rules) {
  const point = (index) => visibleLandmark(landmarks, index, rules.minVisibility);
  const leftShoulder = point(LANDMARK.LEFT_SHOULDER);
  const rightShoulder = point(LANDMARK.RIGHT_SHOULDER);
  const leftHip = point(LANDMARK.LEFT_HIP);
  const rightHip = point(LANDMARK.RIGHT_HIP);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const torsoLength = distance(shoulderCenter, hipCenter);

  if (!shoulderCenter || !hipCenter || torsoLength < 0.01) return null;

  return {
    hipCenter,
    torsoLength,
    leftWrist: point(LANDMARK.LEFT_WRIST),
    rightWrist: point(LANDMARK.RIGHT_WRIST),
    leftAnkle: point(LANDMARK.LEFT_ANKLE),
    rightAnkle: point(LANDMARK.RIGHT_ANKLE),
    leftElbowAngle: angleDegrees(leftShoulder, point(LANDMARK.LEFT_ELBOW), point(LANDMARK.LEFT_WRIST)),
    rightElbowAngle: angleDegrees(rightShoulder, point(LANDMARK.RIGHT_ELBOW), point(LANDMARK.RIGHT_WRIST)),
  };
}

export async function getPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    })().catch((error) => {
      poseLandmarkerPromise = null;
      throw error;
    });
  }
  return poseLandmarkerPromise;
}

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Délai dépassé pendant la lecture vidéo (${eventName}).`));
    }, 12000);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("La vidéo ne peut pas être décodée pour l’analyse."));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function ensureMetadata(video) {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return;
  await waitForEvent(video, "loadedmetadata");
}

async function seekVideo(video, timeSeconds) {
  if (Math.abs(video.currentTime - timeSeconds) < 0.005) return;
  const waiting = waitForEvent(video, "seeked");
  video.currentTime = timeSeconds;
  await waiting;
}

function pushRecommendation(recommendations, code, severity, title, detail) {
  recommendations.push({ code, severity, title, detail });
}

function buildRecommendations(metrics, rules) {
  const recommendations = [];
  const analyzedSeconds = Math.max(metrics.analyzedSeconds, 1);
  const bentLeftRatio = metrics.bentArmSeconds.left / analyzedSeconds;
  const bentRightRatio = metrics.bentArmSeconds.right / analyzedSeconds;

  if (metrics.longPauses.length) {
    pushRecommendation(
      recommendations,
      "long-pauses",
      "warning",
      "Anticipation / fluidité",
      `${metrics.longPauses.length} immobilisation${metrics.longPauses.length > 1 ? "s" : ""} de plus de ${rules.longPauseMinSeconds} s détectée${metrics.longPauses.length > 1 ? "s" : ""}.`,
    );
  } else if (metrics.pauses.length) {
    pushRecommendation(
      recommendations,
      "pauses",
      "info",
      "Rythme",
      `${metrics.pauses.length} pause${metrics.pauses.length > 1 ? "s" : ""} technique${metrics.pauses.length > 1 ? "s" : ""} détectée${metrics.pauses.length > 1 ? "s" : ""}.`,
    );
  }

  if (Math.max(bentLeftRatio, bentRightRatio) >= 0.18) {
    const side = bentLeftRatio > bentRightRatio ? "gauche" : "droit";
    pushRecommendation(
      recommendations,
      "bent-arm",
      "warning",
      "Économie des bras",
      `Le bras ${side} reste fléchi une part importante du temps analysé. Vérifier si des positions bras plus tendus sont possibles.`,
    );
  }

  if (metrics.armAsymmetryRatio >= rules.armAsymmetryRatio) {
    pushRecommendation(
      recommendations,
      "arm-asymmetry",
      "info",
      "Symétrie",
      `Différence notable d’utilisation bras gauche / bras droit (${Math.round(metrics.armAsymmetryRatio * 100)} %). À interpréter selon la voie.`,
    );
  }

  if (metrics.footAdjustments.total >= 5) {
    const side = metrics.footAdjustments.left > metrics.footAdjustments.right ? "gauche" : "droit";
    pushRecommendation(
      recommendations,
      "foot-adjustments",
      "warning",
      "Précision des pieds",
      `${metrics.footAdjustments.total} ajustements courts de pieds détectés, davantage à ${side}. Revoir les passages correspondants avant de conclure à une imprécision.`,
    );
  }

  if (metrics.dynamicMoves >= 3) {
    pushRecommendation(
      recommendations,
      "dynamic-moves",
      "info",
      "Dynamisme",
      `${metrics.dynamicMoves} pics de vitesse corporelle détectés. Ils peuvent correspondre à des mouvements dynamiques ou à des corrections rapides.`,
    );
  }

  if (!recommendations.length) {
    pushRecommendation(
      recommendations,
      "no-major-signal",
      "success",
      "Analyse stable",
      "Aucun signal mécanique majeur n’a dépassé les seuils actuels. Cela ne signifie pas que la technique est optimale.",
    );
  }

  return recommendations;
}

export async function analyzeClimbingVideo(video, options = {}) {
  if (!video) throw new Error("Vidéo absente.");
  const rules = normalizeVideoAnalysisRules(options.rules || loadVideoAnalysisRules());
  await ensureMetadata(video);

  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Durée vidéo invalide.");
  if (duration > MAX_ANALYSIS_SECONDS) throw new Error("Analyse limitée aux vidéos de 8 minutes maximum.");

  const poseLandmarker = await getPoseLandmarker();
  const sampleStep = 1 / Math.max(1, rules.sampleFps);
  const sampleTimes = [];
  for (let time = 0; time < duration; time += sampleStep) sampleTimes.push(time);
  if (!sampleTimes.length || sampleTimes.at(-1) < duration - 0.05) sampleTimes.push(Math.max(0, duration - 0.001));

  const originalTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();

  let previousPose = null;
  let previousTime = null;
  let validSamples = 0;
  let pauseStart = null;
  let leftBentStart = null;
  let rightBentStart = null;
  let leftLockStart = null;
  let rightLockStart = null;
  let leftBentSeconds = 0;
  let rightBentSeconds = 0;
  let leftLockSeconds = 0;
  let rightLockSeconds = 0;
  let lastLeftFootAdjustment = -Infinity;
  let lastRightFootAdjustment = -Infinity;
  let leftFootAdjustments = 0;
  let rightFootAdjustments = 0;
  let dynamicMoves = 0;
  let previousDynamic = false;
  const pauses = [];

  try {
    for (let index = 0; index < sampleTimes.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException("Analyse annulée", "AbortError");
      const time = sampleTimes[index];
      await seekVideo(video, time);
      const result = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const pose = buildFramePose(result?.landmarks?.[0], rules);
      options.onProgress?.((index + 1) / sampleTimes.length);

      if (!pose) {
        previousPose = null;
        previousTime = null;
        continue;
      }

      validSamples += 1;
      if (previousPose && previousTime != null) {
        const dt = Math.max(0.001, time - previousTime);
        const torsoLength = Math.max(0.01, (pose.torsoLength + previousPose.torsoLength) / 2);
        const hipSpeed = normalizeSpeed(previousPose.hipCenter, pose.hipCenter, torsoLength, dt);
        const leftWristSpeed = normalizeSpeed(previousPose.leftWrist, pose.leftWrist, torsoLength, dt);
        const rightWristSpeed = normalizeSpeed(previousPose.rightWrist, pose.rightWrist, torsoLength, dt);
        const leftAnkleSpeed = normalizeSpeed(previousPose.leftAnkle, pose.leftAnkle, torsoLength, dt);
        const rightAnkleSpeed = normalizeSpeed(previousPose.rightAnkle, pose.rightAnkle, torsoLength, dt);
        const availableSpeeds = [hipSpeed, leftWristSpeed, rightWristSpeed, leftAnkleSpeed, rightAnkleSpeed].filter(Number.isFinite);
        const bodySpeed = availableSpeeds.length ? availableSpeeds.reduce((sum, value) => sum + value, 0) / availableSpeeds.length : 0;

        if (bodySpeed <= rules.pauseSpeedTorsoPerSecond) {
          if (pauseStart == null) pauseStart = previousTime;
        } else if (pauseStart != null) {
          finishInterval(pauses, pauseStart, time, rules.pauseMinSeconds);
          pauseStart = null;
        }

        const leftFootDistance = distance(previousPose.leftAnkle, pose.leftAnkle) / torsoLength;
        const rightFootDistance = distance(previousPose.rightAnkle, pose.rightAnkle) / torsoLength;
        const feetContextIsStable = hipSpeed <= Math.max(0.2, rules.pauseSpeedTorsoPerSecond * 3);
        if (
          feetContextIsStable
          && leftAnkleSpeed >= rules.footAdjustmentSpeedTorsoPerSecond
          && leftFootDistance <= rules.footAdjustmentMaxDistanceTorso
          && time - lastLeftFootAdjustment >= rules.footAdjustmentMinGapSeconds
        ) {
          leftFootAdjustments += 1;
          lastLeftFootAdjustment = time;
        }
        if (
          feetContextIsStable
          && rightAnkleSpeed >= rules.footAdjustmentSpeedTorsoPerSecond
          && rightFootDistance <= rules.footAdjustmentMaxDistanceTorso
          && time - lastRightFootAdjustment >= rules.footAdjustmentMinGapSeconds
        ) {
          rightFootAdjustments += 1;
          lastRightFootAdjustment = time;
        }

        const dynamicNow = Math.max(hipSpeed, leftWristSpeed, rightWristSpeed) >= rules.dynamicSpeedTorsoPerSecond;
        if (dynamicNow && !previousDynamic) dynamicMoves += 1;
        previousDynamic = dynamicNow;
      }

      const accumulateAngleDuration = (angle, threshold, currentStart, setter) => {
        if (angle != null && angle < threshold) {
          return currentStart == null ? time : currentStart;
        }
        if (currentStart != null) setter(Math.max(0, time - currentStart));
        return null;
      };

      leftBentStart = accumulateAngleDuration(pose.leftElbowAngle, rules.bentArmAngleDegrees, leftBentStart, (value) => { leftBentSeconds += value; });
      rightBentStart = accumulateAngleDuration(pose.rightElbowAngle, rules.bentArmAngleDegrees, rightBentStart, (value) => { rightBentSeconds += value; });
      leftLockStart = accumulateAngleDuration(pose.leftElbowAngle, rules.lockOffAngleDegrees, leftLockStart, (value) => { if (value >= rules.lockOffMinSeconds) leftLockSeconds += value; });
      rightLockStart = accumulateAngleDuration(pose.rightElbowAngle, rules.lockOffAngleDegrees, rightLockStart, (value) => { if (value >= rules.lockOffMinSeconds) rightLockSeconds += value; });

      previousPose = pose;
      previousTime = time;

      if (index % 12 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    finishInterval(pauses, pauseStart, duration, rules.pauseMinSeconds);
    if (leftBentStart != null) leftBentSeconds += Math.max(0, duration - leftBentStart);
    if (rightBentStart != null) rightBentSeconds += Math.max(0, duration - rightBentStart);
    if (leftLockStart != null) {
      const value = Math.max(0, duration - leftLockStart);
      if (value >= rules.lockOffMinSeconds) leftLockSeconds += value;
    }
    if (rightLockStart != null) {
      const value = Math.max(0, duration - rightLockStart);
      if (value >= rules.lockOffMinSeconds) rightLockSeconds += value;
    }
  } finally {
    try {
      await seekVideo(video, Math.min(originalTime, duration - 0.001));
      if (!wasPaused) await video.play();
    } catch {
      // La restauration de lecture ne doit pas masquer le résultat de l’analyse.
    }
  }

  const detectionRatio = sampleTimes.length ? validSamples / sampleTimes.length : 0;
  if (detectionRatio < 0.35) {
    throw new Error("Le grimpeur n’est pas détecté assez souvent. Utiliser une vidéo où le corps entier reste davantage visible.");
  }

  const longPauses = pauses.filter((pause) => pause.duration >= rules.longPauseMinSeconds);
  const maxBent = Math.max(leftBentSeconds, rightBentSeconds, 0.001);
  const armAsymmetryRatio = Math.abs(leftBentSeconds - rightBentSeconds) / maxBent;
  const metrics = {
    duration,
    analyzedSeconds: duration * detectionRatio,
    sampleCount: sampleTimes.length,
    validSamples,
    detectionRatio,
    pauses,
    longPauses,
    bentArmSeconds: { left: leftBentSeconds, right: rightBentSeconds },
    lockOffSeconds: { left: leftLockSeconds, right: rightLockSeconds },
    footAdjustments: { left: leftFootAdjustments, right: rightFootAdjustments, total: leftFootAdjustments + rightFootAdjustments },
    dynamicMoves,
    armAsymmetryRatio,
  };

  return {
    engine: "MediaPipe Pose Landmarker Lite",
    engineVersion: "1.0.1",
    localProcessing: true,
    rules,
    metrics,
    recommendations: buildRecommendations(metrics, rules),
    display: {
      duration: formatSeconds(duration),
      detection: `${Math.round(detectionRatio * 100)} %`,
      bentLeft: formatSeconds(leftBentSeconds),
      bentRight: formatSeconds(rightBentSeconds),
      lockLeft: formatSeconds(leftLockSeconds),
      lockRight: formatSeconds(rightLockSeconds),
    },
  };
}
