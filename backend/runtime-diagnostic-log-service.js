const MAX_RUNTIME_DIAGNOSTIC_LOGS = 500;
const SENSITIVE_KEY_PATTERN = /(password|token|authorization|cookie|secret)/i;

let nextRuntimeLogId = 1;
const runtimeDiagnosticLogs = [];

function sanitizeDiagnosticValue(value, depth = 0) {
  if (depth > 4) return "[profondeur limitée]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 4000);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .slice(0, 50)
      .map(([key, nestedValue]) => [key, sanitizeDiagnosticValue(nestedValue, depth + 1)]),
  );
}

export function writeRuntimeDiagnosticLog({
  req = null,
  eventType,
  success = true,
  details = {},
}) {
  const sanitizedDetails = sanitizeDiagnosticValue(details);
  const entry = {
    id: `runtime-${nextRuntimeLogId++}`,
    event_type: String(eventType || "runtime_diagnostic"),
    success: Boolean(success),
    ip_address: req?.ip || null,
    user_agent: req?.headers?.["user-agent"] || null,
    created_at: new Date().toISOString(),
    details: sanitizedDetails,
    email: null,
    details_text: JSON.stringify(sanitizedDetails),
  };

  runtimeDiagnosticLogs.unshift(entry);
  if (runtimeDiagnosticLogs.length > MAX_RUNTIME_DIAGNOSTIC_LOGS) {
    runtimeDiagnosticLogs.length = MAX_RUNTIME_DIAGNOSTIC_LOGS;
  }
  return entry;
}

export function getRuntimeDiagnosticLogs(limit = 200) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, MAX_RUNTIME_DIAGNOSTIC_LOGS));
  return runtimeDiagnosticLogs.slice(0, safeLimit).map((entry) => ({
    ...entry,
    details: { ...entry.details },
  }));
}
