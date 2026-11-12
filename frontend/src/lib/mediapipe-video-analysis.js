import { loadVideoAnalysisRules, normalizeVideoAnalysisRules } from "./video-analysis-rules.js";

const MEDIAPIPE_MODULE_URL = "/mediapipe-runtime/vision_bundle.mjs";
const MEDIAPIPE_WASM_URL = "/mediapipe-runtime/wasm";
const POSE_MODEL_URL = "/mediapipe-runtime/models/pose_landmarker_lite.task";
const MAX_ANALYSIS_SECONDS = 8 * 60;
const MAX_TRAJECTORY_POINTS = 240;

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

let visionRuntimePromise = null;

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

export function normalizeObservedSpeed(previous, current, torsoLength, dt) {
  if (!previous || !current || !torsoLength || !dt) return null;
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
    leftHip,
    rightHip,
    shoulderCenter,
    leftShoulder,
    rightShoulder,
    leftElbowAngle: angleDegrees(leftShoulder, point(LANDMARK.LEFT_ELBOW), point(LANDMARK.LEFT_WRIST)),
    rightElbowAngle: angleDegrees(rightShoulder, point(LANDMARK.RIGHT_ELBOW), point(LANDMARK.RIGHT_WRIST)),
    leftKneeAngle: angleDegrees(leftHip, point(LANDMARK.LEFT_KNEE), point(LANDMARK.LEFT_ANKLE)),
    rightKneeAngle: angleDegrees(rightHip, point(LANDMARK.RIGHT_KNEE), point(LANDMARK.RIGHT_ANKLE)),
  };
}

async function getVisionRuntime() {
  if (!visionRuntimePromise) {
    visionRuntimePromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      return { vision, PoseLandmarker };
    })().catch((error) => {
      visionRuntimePromise = null;
      throw error;
    });
  }
  return visionRuntimePromise;
}

export async function getPoseLandmarker() {
  const { vision, PoseLandmarker } = await getVisionRuntime();
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
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

  // Un PoseLandmarker VIDEO conserve la dernière position temporelle reçue.
  // Chaque analyse utilise donc sa propre instance afin que sa timeline puisse
  // repartir de 0 sans provoquer de Packet timestamp mismatch lors d'une relance.
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
  let partialSamples = 0;
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
  let hipTravelTorso = 0;
  let hipVerticalProgressTorso = 0;
  let hipSpeedSum = 0;
  let hipSpeedSamples = 0;
  let maxHipSpeed = 0;
  let kneeAngleSum = 0;
  let kneeAngleSamples = 0;
  let hipLateralSum = 0;
  let hipLateralSamples = 0;
  let hipLateralMax = 0;
  const hipLateralValues = [];
  let shoulderHipOffsetSum = 0;
  let shoulderHipOffsetSamples = 0;
  let shoulderHipOffsetMax = 0;
  let compactSeconds = 0;
  const pauses = [];
  const events = [];
  const hipTrajectory = [];
  let lastCrossEvent = -Infinity;
  let lastFlagEvent = -Infinity;
  let lastFootSwitchEvent = -Infinity;
  let movementStart = null;
  let movementPeakTime = null;
  let movementPeakSpeed = 0;
  const movementSegments = [];

  const finishTrackedIntervals = (endTime) => {
    if (endTime == null) return;
    finishInterval(pauses, pauseStart, endTime, rules.pauseMinSeconds);
    pauseStart = null;

    if (leftBentStart != null) leftBentSeconds += Math.max(0, endTime - leftBentStart);
    if (rightBentStart != null) rightBentSeconds += Math.max(0, endTime - rightBentStart);
    leftBentStart = null;
    rightBentStart = null;

    if (leftLockStart != null) {
      const value = Math.max(0, endTime - leftLockStart);
      if (value >= rules.lockOffMinSeconds) leftLockSeconds += value;
    }
    if (rightLockStart != null) {
      const value = Math.max(0, endTime - rightLockStart);
      if (value >= rules.lockOffMinSeconds) rightLockSeconds += value;
    }
    leftLockStart = null;
    rightLockStart = null;
    previousDynamic = false;
  };

  try {
    for (let index = 0; index < sampleTimes.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException("Analyse annulée", "AbortError");
      const time = sampleTimes[index];
      await seekVideo(video, time);
      const result = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const landmarks = result?.landmarks?.[0];
      let pose = buildFramePose(landmarks, rules);
      if (!pose && landmarks?.length) {
        // Second passage plus tolérant : utile quand le grimpeur est petit dans
        // une image large ou brièvement occulté. Les mesures restent marquées
        // par la confiance globale et ne sont acceptées que si le tronc existe.
        pose = buildFramePose(landmarks, { ...rules, minVisibility: Math.min(rules.minVisibility, 0.25) });
        if (pose) partialSamples += 1;
      }
      options.onProgress?.((index + 1) / sampleTimes.length);

      if (!pose) {
        // Une zone non détectée n'est pas une zone immobile : on ferme les
        // intervalles au dernier instant réellement observé et on repart à zéro.
        finishTrackedIntervals(previousTime);
        previousPose = null;
        previousTime = null;
        continue;
      }

      validSamples += 1;
      if (hipTrajectory.length < MAX_TRAJECTORY_POINTS && (validSamples === 1 || validSamples % Math.max(1, Math.ceil(sampleTimes.length / MAX_TRAJECTORY_POINTS)) === 0)) {
        hipTrajectory.push({ t: time, x: pose.hipCenter.x, y: pose.hipCenter.y });
      }
      const kneeAngles = [pose.leftKneeAngle, pose.rightKneeAngle].filter(Number.isFinite);
      if (kneeAngles.length) {
        kneeAngleSum += kneeAngles.reduce((sum, value) => sum + value, 0) / kneeAngles.length;
        kneeAngleSamples += 1;
        if ((kneeAngles.reduce((sum, value) => sum + value, 0) / kneeAngles.length) < 105) compactSeconds += sampleStep;
      }
      const hipWidth = distance(pose.leftHip, pose.rightHip);
      const hipWidthToTorso = hipWidth / Math.max(0.01, pose.torsoLength);
      if (hipWidth > 0.005 && hipWidthToTorso >= 0.25 && hipWidthToTorso <= 1.6) {
        const lateral = Math.abs((pose.hipCenter.x || 0) - (pose.shoulderCenter.x || 0)) / hipWidth;
        if (Number.isFinite(lateral) && lateral <= 6) {
          hipLateralSum += lateral;
          hipLateralSamples += 1;
          hipLateralValues.push(lateral);
          hipLateralMax = Math.max(hipLateralMax, lateral);
        }
        const offset = distance(pose.hipCenter, pose.shoulderCenter) / Math.max(0.01, pose.torsoLength);
        shoulderHipOffsetSum += offset;
        shoulderHipOffsetSamples += 1;
        shoulderHipOffsetMax = Math.max(shoulderHipOffsetMax, offset);
      }
      if (previousPose && previousTime != null) {
        const dt = Math.max(0.001, time - previousTime);
        const torsoLength = Math.max(0.01, (pose.torsoLength + previousPose.torsoLength) / 2);
        const hipSpeed = normalizeObservedSpeed(previousPose.hipCenter, pose.hipCenter, torsoLength, dt);
        const leftWristSpeed = normalizeObservedSpeed(previousPose.leftWrist, pose.leftWrist, torsoLength, dt);
        const rightWristSpeed = normalizeObservedSpeed(previousPose.rightWrist, pose.rightWrist, torsoLength, dt);
        const leftAnkleSpeed = normalizeObservedSpeed(previousPose.leftAnkle, pose.leftAnkle, torsoLength, dt);
        const rightAnkleSpeed = normalizeObservedSpeed(previousPose.rightAnkle, pose.rightAnkle, torsoLength, dt);
        const availableSpeeds = [hipSpeed, leftWristSpeed, rightWristSpeed, leftAnkleSpeed, rightAnkleSpeed]
          .filter(Number.isFinite);
        const bodySpeed = availableSpeeds.length ? availableSpeeds.reduce((sum, value) => sum + value, 0) / availableSpeeds.length : 0;
        const movementThreshold = Math.max(rules.pauseSpeedTorsoPerSecond * 2.2, 0.18);
        if (bodySpeed >= movementThreshold) {
          if (movementStart == null) { movementStart = previousTime; movementPeakTime = time; movementPeakSpeed = bodySpeed; }
          if (bodySpeed > movementPeakSpeed) { movementPeakSpeed = bodySpeed; movementPeakTime = time; }
        } else if (movementStart != null && time - movementStart >= 0.35) {
          movementSegments.push({ start: movementStart, peak: movementPeakTime, end: time, peakSpeed: movementPeakSpeed });
          movementStart = null; movementPeakTime = null; movementPeakSpeed = 0;
        }
        if (Number.isFinite(hipSpeed)) {
          hipSpeedSum += hipSpeed;
          hipSpeedSamples += 1;
          maxHipSpeed = Math.max(maxHipSpeed, hipSpeed);
          hipTravelTorso += distance(previousPose.hipCenter, pose.hipCenter) / torsoLength;
          hipVerticalProgressTorso += Math.abs((pose.hipCenter.y || 0) - (previousPose.hipCenter.y || 0)) / torsoLength;
        }

        if (bodySpeed <= rules.pauseSpeedTorsoPerSecond) {
          if (pauseStart == null) pauseStart = previousTime;
        } else if (pauseStart != null) {
          finishInterval(pauses, pauseStart, time, rules.pauseMinSeconds);
          pauseStart = null;
        }

        const leftFootDistance = previousPose.leftAnkle && pose.leftAnkle
          ? distance(previousPose.leftAnkle, pose.leftAnkle) / torsoLength
          : null;
        const rightFootDistance = previousPose.rightAnkle && pose.rightAnkle
          ? distance(previousPose.rightAnkle, pose.rightAnkle) / torsoLength
          : null;
        const feetContextIsStable = Number.isFinite(hipSpeed)
          && hipSpeed <= Math.max(0.2, rules.pauseSpeedTorsoPerSecond * 3);
        if (
          feetContextIsStable
          && Number.isFinite(leftAnkleSpeed)
          && Number.isFinite(leftFootDistance)
          && leftAnkleSpeed >= rules.footAdjustmentSpeedTorsoPerSecond
          && leftFootDistance <= rules.footAdjustmentMaxDistanceTorso
          && time - lastLeftFootAdjustment >= rules.footAdjustmentMinGapSeconds
        ) {
          leftFootAdjustments += 1;
          lastLeftFootAdjustment = time;
          events.push({ type: "foot-adjustment", side: "left", time, confidence: 0.8 });
        }
        if (
          feetContextIsStable
          && Number.isFinite(rightAnkleSpeed)
          && Number.isFinite(rightFootDistance)
          && rightAnkleSpeed >= rules.footAdjustmentSpeedTorsoPerSecond
          && rightFootDistance <= rules.footAdjustmentMaxDistanceTorso
          && time - lastRightFootAdjustment >= rules.footAdjustmentMinGapSeconds
        ) {
          rightFootAdjustments += 1;
          lastRightFootAdjustment = time;
          events.push({ type: "foot-adjustment", side: "right", time, confidence: 0.8 });
        }

        const dynamicSpeeds = [hipSpeed, leftWristSpeed, rightWristSpeed].filter(Number.isFinite);
        const dynamicNow = dynamicSpeeds.some((speed) => speed >= rules.dynamicSpeedTorsoPerSecond);
        if (dynamicNow && !previousDynamic) {
          dynamicMoves += 1;
          events.push({ type: "dynamic", time, confidence: 0.75 });
        }
        previousDynamic = dynamicNow;

        const shoulderWidth = distance(pose.leftShoulder, pose.rightShoulder);
        if (shoulderWidth > 0.005 && time - lastCrossEvent >= 1.2) {
          const leftCross = pose.leftWrist && pose.rightShoulder && pose.leftWrist.x > pose.rightShoulder.x + shoulderWidth * 0.08;
          const rightCross = pose.rightWrist && pose.leftShoulder && pose.rightWrist.x < pose.leftShoulder.x - shoulderWidth * 0.08;
          if (leftCross || rightCross) {
            events.push({ type: "cross", side: leftCross ? "left" : "right", time, confidence: 0.7 });
            lastCrossEvent = time;
          }
        }
        if (pose.leftAnkle && pose.rightAnkle && time - lastFootSwitchEvent >= 1.0) {
          const previousOrder = (previousPose.leftAnkle?.x ?? 0) - (previousPose.rightAnkle?.x ?? 0);
          const currentOrder = pose.leftAnkle.x - pose.rightAnkle.x;
          if (Math.abs(previousOrder) > 0.025 && Math.abs(currentOrder) > 0.025 && Math.sign(previousOrder) !== Math.sign(currentOrder)) {
            events.push({ type: "foot-switch", time, confidence: 0.68 });
            lastFootSwitchEvent = time;
          }
        }
        if (hipWidth > 0.005 && pose.leftAnkle && pose.rightAnkle && time - lastFlagEvent >= 1.2) {
          const leftFlag = pose.leftAnkle.x > pose.rightHip.x + hipWidth * 0.45;
          const rightFlag = pose.rightAnkle.x < pose.leftHip.x - hipWidth * 0.45;
          if (leftFlag || rightFlag) {
            events.push({ type: "flag-candidate", side: leftFlag ? "left" : "right", time, confidence: 0.58 });
            lastFlagEvent = time;
          }
        }
      }

      const accumulateAngleDuration = (angle, threshold, currentStart, setter) => {
        if (angle == null) {
          // Si le coude/poignet disparaît seul, ne pas attribuer au grimpeur le
          // temps entre la dernière mesure fiable et le retour du repère.
          if (currentStart != null && previousTime != null) {
            setter(Math.max(0, previousTime - currentStart));
          }
          return null;
        }
        if (angle < threshold) {
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

    // Ne ferme jamais une mesure jusqu'à la durée totale si la fin de la vidéo
    // n'était plus observable. Seul le dernier échantillon valide compte.
    finishTrackedIntervals(previousTime);
  } finally {
    try {
      await seekVideo(video, Math.min(originalTime, duration - 0.001));
      if (!wasPaused) await video.play();
    } catch {
      // La restauration de lecture ne doit pas masquer le résultat de l’analyse.
    }
    try {
      poseLandmarker.close?.();
    } catch {
      // La fermeture du graphe ne doit pas masquer le résultat de l’analyse.
    }
  }

  const detectionRatio = sampleTimes.length ? validSamples / sampleTimes.length : 0;
  // Une analyse reste exploitable avec des occultations temporaires. Le seuil
  // historique de 35 % rejetait notamment les plans larges de SAE alors que le
  // tronc était suivi sur une partie significative de la voie.
  if (validSamples < Math.min(12, sampleTimes.length) || detectionRatio < 0.15) {
    throw new Error("Le grimpeur est trop peu détecté pour produire une analyse fiable. Rapprocher le cadrage ou garder le tronc visible plus longtemps.");
  }

  if (movementStart != null && previousTime != null && previousTime - movementStart >= 0.35) movementSegments.push({ start: movementStart, peak: movementPeakTime, end: previousTime, peakSpeed: movementPeakSpeed });
  for (const segment of movementSegments.slice(0, 500)) {
    events.push({ type: "movement", time: segment.start, end: segment.end, confidence: Math.min(0.92, 0.55 + segment.peakSpeed / 8), phase: "preparation" });
    events.push({ type: "movement-peak", time: segment.peak ?? segment.start, confidence: Math.min(0.95, 0.6 + segment.peakSpeed / 7), phase: "execution" });
    events.push({ type: "stabilization", time: segment.end, confidence: 0.65, phase: "stabilization" });
  }
  const longPauses = pauses.filter((pause) => pause.duration >= rules.longPauseMinSeconds);
  const maxBent = Math.max(leftBentSeconds, rightBentSeconds, 0.001);
  const armAsymmetryRatio = Math.abs(leftBentSeconds - rightBentSeconds) / maxBent;
  for (const pause of pauses) events.push({ type: "pause", time: pause.start, end: pause.end, confidence: detectionRatio });
  events.sort((a, b) => a.time - b.time);
  const hipPathEfficiency = hipTravelTorso > 0 ? Math.min(1, hipVerticalProgressTorso / hipTravelTorso) : 0;
  const observationConfidence = Math.max(0, Math.min(1, detectionRatio * (validSamples >= 20 ? 1 : validSamples / 20)));
  // Un maximum brut est très sensible à une seule frame MediaPipe aberrante.
  // On conserve donc un maximum robuste (98e percentile) sur les observations
  // anatomiquement plausibles ; la moyenne utilise le même ensemble filtré.
  if (hipLateralValues.length) {
    const sortedHipLateral = [...hipLateralValues].sort((a, b) => a - b);
    hipLateralMax = sortedHipLateral[Math.min(sortedHipLateral.length - 1, Math.floor((sortedHipLateral.length - 1) * 0.98))];
  }
  const metrics = {
    duration,
    analyzedSeconds: duration * detectionRatio,
    sampleCount: sampleTimes.length,
    validSamples,
    partialSamples,
    detectionRatio,
    pauses,
    longPauses,
    bentArmSeconds: { left: leftBentSeconds, right: rightBentSeconds },
    lockOffSeconds: { left: leftLockSeconds, right: rightLockSeconds },
    footAdjustments: { left: leftFootAdjustments, right: rightFootAdjustments, total: leftFootAdjustments + rightFootAdjustments },
    dynamicMoves,
    armAsymmetryRatio,
    hipMotion: {
      travelTorso: hipTravelTorso,
      verticalProgressTorso: hipVerticalProgressTorso,
      pathEfficiency: hipPathEfficiency,
      meanSpeedTorsoPerSecond: hipSpeedSamples ? hipSpeedSum / hipSpeedSamples : 0,
      maxSpeedTorsoPerSecond: maxHipSpeed,
    },
    meanKneeAngleDegrees: kneeAngleSamples ? kneeAngleSum / kneeAngleSamples : null,
    bodyPosition: {
      meanHipLateralOffsetHipWidths: hipLateralSamples ? hipLateralSum / hipLateralSamples : 0,
      maxHipLateralOffsetHipWidths: hipLateralMax,
      meanShoulderHipOffsetTorso: shoulderHipOffsetSamples ? shoulderHipOffsetSum / shoulderHipOffsetSamples : 0,
      maxShoulderHipOffsetTorso: shoulderHipOffsetMax,
      compactSeconds: Math.min(duration, compactSeconds),
    },
    observationConfidence,
    events: events.slice(0, 1000),
    movementSegments: movementSegments.slice(0, 500),
    hipTrajectory,
  };

  return {
    engine: "MediaPipe Pose Landmarker Lite",
    engineVersion: "1.3.2",
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
