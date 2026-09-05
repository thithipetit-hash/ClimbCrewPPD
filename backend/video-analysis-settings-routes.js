const DEFAULT_RULES = Object.freeze({
  sampleFps: 4,
  minVisibility: 0.5,
  pauseSpeedTorsoPerSecond: 0.08,
  pauseMinSeconds: 2.5,
  longPauseMinSeconds: 5,
  bentArmAngleDegrees: 120,
  bentArmMinSeconds: 2,
  lockOffAngleDegrees: 100,
  lockOffMinSeconds: 1,
  footAdjustmentSpeedTorsoPerSecond: 0.12,
  footAdjustmentMaxDistanceTorso: 0.35,
  footAdjustmentMinGapSeconds: 0.7,
  dynamicSpeedTorsoPerSecond: 1.6,
  armAsymmetryRatio: 0.25,
});

const LIMITS = Object.freeze({
  sampleFps: [2, 8],
  minVisibility: [0.2, 0.9],
  pauseSpeedTorsoPerSecond: [0.02, 0.3],
  pauseMinSeconds: [1, 8],
  longPauseMinSeconds: [2, 15],
  bentArmAngleDegrees: [80, 150],
  bentArmMinSeconds: [0.5, 8],
  lockOffAngleDegrees: [60, 130],
  lockOffMinSeconds: [0.5, 5],
  footAdjustmentSpeedTorsoPerSecond: [0.04, 0.8],
  footAdjustmentMaxDistanceTorso: [0.1, 1],
  footAdjustmentMinGapSeconds: [0.2, 3],
  dynamicSpeedTorsoPerSecond: [0.5, 4],
  armAsymmetryRatio: [0.05, 0.8],
});

function normalizeRules(candidate = {}) {
  const rules = {};
  for (const [key, fallback] of Object.entries(DEFAULT_RULES)) {
    const number = Number(candidate?.[key]);
    const value = Number.isFinite(number) ? number : fallback;
    const [min, max] = LIMITS[key];
    if (value < min || value > max) {
      const error = new Error(`Valeur hors limites pour ${key}`);
      error.status = 400;
      throw error;
    }
    rules[key] = value;
  }
  if (rules.longPauseMinSeconds < rules.pauseMinSeconds) {
    const error = new Error("La longue immobilité doit être au moins aussi longue que l’immobilité minimale.");
    error.status = 400;
    throw error;
  }
  if (rules.lockOffAngleDegrees > rules.bentArmAngleDegrees) {
    const error = new Error("L’angle lock-off doit être inférieur ou égal à l’angle bras fléchi.");
    error.status = 400;
    throw error;
  }
  return rules;
}

async function readRules(pool) {
  const result = await pool.query(
    "select rules, updated_at from video_analysis_settings where id = 1 limit 1",
  );
  if (result.rowCount === 0) {
    return { rules: { ...DEFAULT_RULES }, updatedAt: null };
  }
  return {
    rules: normalizeRules(result.rows[0].rules || {}),
    updatedAt: result.rows[0].updated_at || null,
  };
}

export function installVideoAnalysisSettingsRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/video-analysis/rules", requireAuth, async (_req, res) => {
    try {
      res.json(await readRules(pool));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error) });
    }
  });

  app.put("/admin/video-analysis/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const rules = normalizeRules(req.body?.rules || req.body || {});
      const result = await pool.query(
        `
          insert into video_analysis_settings (id, rules, updated_at)
          values (1, $1::jsonb, now())
          on conflict (id) do update set rules = excluded.rules, updated_at = now()
          returning rules, updated_at
        `,
        [JSON.stringify(rules)],
      );
      res.json({ rules: normalizeRules(result.rows[0].rules), updatedAt: result.rows[0].updated_at });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || String(error) });
    }
  });
}
