export const BUSINESS_BOOTSTRAP_ENDPOINTS = Object.freeze([
  ["participants", "/participants"],
  ["sessions", "/sessions"],
  ["realisations", "/realisations"],
  ["ropes", "/ropes"],
  ["routes", "/routes"],
]);

export function settledCollection(result, previous = []) {
  if (result?.status !== "fulfilled" || !Array.isArray(result.value)) return previous;
  return result.value;
}

export function mergeBootstrapCollections(previous, settledResults) {
  const next = { ...previous };
  BUSINESS_BOOTSTRAP_ENDPOINTS.forEach(([key], index) => {
    next[key] = settledCollection(settledResults?.[index], previous?.[key] || []);
  });
  return next;
}

export function summarizeBootstrapResults(settledResults = []) {
  const failures = settledResults.filter((result) => result?.status === "rejected");
  return {
    failureCount: failures.length,
    allFailed: settledResults.length > 0 && failures.length === settledResults.length,
    firstError: failures[0]?.reason || null,
  };
}
