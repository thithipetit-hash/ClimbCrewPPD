import { loadVideoAnalysisRules, normalizeVideoAnalysisRules } from "./video-analysis-rules.js";
import { correctImageAspect, hasMotionCoverage } from "./video-analysis-observations.js";
import { SKELETON_JOINTS } from "./video-analysis-display.js";
import { createCameraTracker } from "./video-camera-motion.js";
import { createMotionTracker } from "./video-motion-tracking.js";

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

function buildFramePose(landmarks, rules, aspectRatio) {
  const point = (index) => correctImageAspect(visibleLandmark(landmarks, index, rules.minVisibility), aspectRatio);
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

  if (hasMotionCoverage(metrics, "pauseSeconds") && metrics.longPauses.length) {
    pushRecommendation(
      recommendations,
      "long-pauses",
      "warning",
      "Anticipation / fluidité",
      `${metrics.longPauses.length} immobilisation${metrics.longPauses.length > 1 ? "s" : ""} de plus de ${rules.longPauseMinSeconds} s détectée${metrics.longPauses.length > 1 ? "s" : ""}.`,
    );
  } else if (hasMotionCoverage(metrics, "pauseSeconds") && metrics.pauses.length) {
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

  if (hasMotionCoverage(metrics, "feetSeconds") && metrics.footAdjustments.total >= 5) {
    const side = metrics.footAdjustments.left > metrics.footAdjustments.right ? "gauche" : "droit";
    pushRecommendation(
      recommendations,
      "foot-adjustments",
      "warning",
      "Précision des pieds",
      `${metrics.footAdjustments.total} repositionnements courts candidats, davantage à ${side}. Les contacts avec les prises ne sont pas vérifiés ; revoir les passages avant de conclure à une imprécision.`,
    );
  }

  if (hasMotionCoverage(metrics, "motionSeconds") && metrics.dynamicMoves >= 3) {
    pushRecommendation(
      recommendations,
      "dynamic-moves",
      "info",
      "Dynamisme",
      `${metrics.dynamicMoves} pics de vitesse corporelle détectés. Ils peuvent correspondre à des mouvements dynamiques ou à des corrections rapides.`,
    );
  }

  if (metrics.motionObservation && !["motionSeconds", "pauseSeconds", "feetSeconds"].every(key => hasMotionCoverage(metrics, key))) {
    pushRecommendation(recommendations, "limited-motion-coverage", "info", "Couverture temporelle partielle", "Les intervalles où le fond ou les articulations ne sont pas assez stables sont exclus. L’absence de signal ne démontre pas l’absence de mouvement ou de repos.");
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
  const aspectRatio = video.videoWidth / video.videoHeight;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new Error("Dimensions vidéo invalides.");
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

  const camera = createCameraTracker(video);
  const motionTracker = createMotionTracker(rules, video.videoHeight);
  let reliableCameraPairs = 0;
  let motionSeconds = 0;
  let pauseSeconds = 0;
  let feetSeconds = 0;
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
  let leftFootAdjustments = 0;
  let rightFootAdjustments = 0;
  let dynamicMoves = 0;
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
  let previousCrossSide = null;
  let previousFlagSide = null;
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
    previousCrossSide = null;
    previousFlagSide = null;
  };

  try {
    for (let index = 0; index < sampleTimes.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException("Analyse annulée", "AbortError");
      const time = sampleTimes[index];
      await seekVideo(video, time);
      const cameraTranslation = camera.capture();
      if (cameraTranslation) reliableCameraPairs += 1;
      const result = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const landmarks = result?.landmarks?.[0];
      if (options.onPoseFrame) {
        const points = SKELETON_JOINTS.map((id) => {
          const point = visibleLandmark(landmarks, id, rules.minVisibility);
          return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
        });
        options.onPoseFrame({ time, points });
      }
      let pose = buildFramePose(landmarks, rules, aspectRatio);
      const strictPose = pose;
      if (!pose && landmarks?.length) {
        // Second passage plus tolérant : utile quand le grimpeur est petit dans
        // une image large ou brièvement occulté. Les mesures restent marquées
        // par la confiance globale et ne sont acceptées que si le tronc existe.
        pose = buildFramePose(landmarks, { ...rules, minVisibility: Math.min(rules.minVisibility, 0.25) }, aspectRatio);
        if (pose) partialSamples += 1;
      }
      options.onProgress?.((index + 1) / sampleTimes.length);

      if (!pose) {
        // Une zone non détectée n'est pas une zone immobile : on ferme les
        // intervalles au dernier instant réellement observé et on repart à zéro.
        finishTrackedIntervals(previousTime);
        motionTracker.reset();
        movementStart = null; movementPeakTime = null; movementPeakSpeed = 0;
        previousPose = null;
        previousTime = null;
        continue;
      }

      validSamples += 1;
      if (hipTrajectory.length < MAX_TRAJECTORY_POINTS && (validSamples === 1 || validSamples % Math.max(1, Math.ceil(sampleTimes.length / MAX_TRAJECTORY_POINTS)) === 0)) {
        hipTrajectory.push({ t: time, x: pose.hipCenter.x / aspectRatio, y: pose.hipCenter.y });
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
      const motion = motionTracker.update(strictPose, time, cameraTranslation);
      if (!motion) {
        finishInterval(pauses, pauseStart, previousTime, rules.pauseMinSeconds);
        pauseStart = null;
        movementStart = null; movementPeakTime = null; movementPeakSpeed = 0;
        previousCrossSide = null; previousFlagSide = null;
      } else {
        const { dt, hipSpeed, bodySpeed, stabilitySpeed, pauseSpeed } = motion;
        motionSeconds += dt;
        if (motion.feetKnown) feetSeconds += dt;
        if (stabilitySpeed !== null) pauseSeconds += dt;
        const movementThreshold = Math.max(pauseSpeed * 2.2, 0.18);
        if (bodySpeed !== null && bodySpeed >= movementThreshold) {
          if (movementStart == null) { movementStart = motion.previousTime; movementPeakTime = time; movementPeakSpeed = bodySpeed; }
          if (bodySpeed > movementPeakSpeed) { movementPeakSpeed = bodySpeed; movementPeakTime = time; }
        } else if (movementStart != null) {
          if (motion.previousTime - movementStart >= 0.35) movementSegments.push({ start: movementStart, peak: movementPeakTime, end: motion.previousTime, peakSpeed: movementPeakSpeed });
          movementStart = null; movementPeakTime = null; movementPeakSpeed = 0;
        }
        if (Number.isFinite(hipSpeed)) {
          hipSpeedSum += hipSpeed;
          hipSpeedSamples += 1;
          maxHipSpeed = Math.max(maxHipSpeed, hipSpeed);
          const travel = hipSpeed * dt;
          const rawDistance = distance(motion.previous.hipCenter, motion.pose.hipCenter);
          hipTravelTorso += travel;
          if (rawDistance > 0) hipVerticalProgressTorso += travel * Math.abs(motion.pose.hipCenter.y-motion.previous.hipCenter.y)/rawDistance;
        }

        if (stabilitySpeed !== null && stabilitySpeed <= (pauseStart == null ? pauseSpeed : pauseSpeed * 1.8)) {
          if (pauseStart == null) pauseStart = motion.previousTime;
        } else if (pauseStart != null) {
          finishInterval(pauses, pauseStart, motion.previousTime, rules.pauseMinSeconds);
          pauseStart = null;
        }

        for (const side of motion.feet) {
          if (side === "left") leftFootAdjustments += 1;
          else rightFootAdjustments += 1;
          events.push({ type: "foot-adjustment", side, time, confidence: 0.65 });
        }
        if (motion.dynamic) {
          dynamicMoves += 1;
          events.push({ type: "dynamic", time, confidence: 0.65 });
        }
      }

      if (motion && previousPose && previousTime != null) {
        const shoulderWidth = distance(pose.leftShoulder, pose.rightShoulder);
        if (shoulderWidth > 0.005) {
          const leftCross = pose.leftWrist && pose.rightShoulder && pose.leftWrist.x > pose.rightShoulder.x + shoulderWidth * 0.08;
          const rightCross = pose.rightWrist && pose.leftShoulder && pose.rightWrist.x < pose.leftShoulder.x - shoulderWidth * 0.08;
          const side = leftCross ? "left" : rightCross ? "right" : null;
          if (side && side !== previousCrossSide && time - lastCrossEvent >= 1.2) {
            events.push({ type: "cross", side, time, confidence: 0.55 });
            lastCrossEvent = time;
          }
          previousCrossSide = side;
        }
        if (previousPose.leftAnkle && pose.leftAnkle && previousPose.rightAnkle && pose.rightAnkle && time - lastFootSwitchEvent >= 1.0) {
          const previousOrder = (previousPose.leftAnkle?.x ?? 0) - (previousPose.rightAnkle?.x ?? 0);
          const currentOrder = pose.leftAnkle.x - pose.rightAnkle.x;
          if (Math.abs(previousOrder) > 0.025 && Math.abs(currentOrder) > 0.025 && Math.sign(previousOrder) !== Math.sign(currentOrder)) {
            events.push({ type: "foot-switch", time, confidence: 0.68 });
            lastFootSwitchEvent = time;
          }
        }
        if (hipWidth > 0.005 && pose.leftAnkle && pose.rightAnkle) {
          const leftFlag = pose.leftAnkle.x > pose.rightHip.x + hipWidth * 0.45;
          const rightFlag = pose.rightAnkle.x < pose.leftHip.x - hipWidth * 0.45;
          const side = leftFlag ? "left" : rightFlag ? "right" : null;
          if (side && side !== previousFlagSide && time - lastFlagEvent >= 1.2) {
            events.push({ type: "flag-candidate", side, time, confidence: 0.55 });
            lastFlagEvent = time;
          }
          previousFlagSide = side;
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
    motionObservation: {
      cameraPairs: Math.max(0, sampleTimes.length - 1),
      reliableCameraPairs,
      motionSeconds: Math.min(duration, motionSeconds),
      pauseSeconds: Math.min(duration, pauseSeconds),
      feetSeconds: Math.min(duration, feetSeconds),
    },
    events: events.slice(0, 1000),
    movementSegments: movementSegments.slice(0, 500),
    hipTrajectory,
  };

  return {
    engine: "MediaPipe Pose Landmarker Lite",
    engineVersion: "1.5.0",
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
