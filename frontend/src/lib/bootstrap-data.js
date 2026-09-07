export const REALISATIONS_PAGE_SIZE = 200;
const MAX_REALISATIONS_OFFSET = 1_000_000;

export const BUSINESS_BOOTSTRAP_ENDPOINTS = Object.freeze([
  ["participants", "/participants"],
  ["sessions", "/sessions"],
  ["realisations", "/realisations"],
  ["ropes", "/ropes"],
  ["routes", "/routes"],
]);

export async function fetchPaginatedCollection(
  fetchPage,
  { pageSize = REALISATIONS_PAGE_SIZE, maxOffset = MAX_REALISATIONS_OFFSET } = {},
) {
  if (typeof fetchPage !== "function") {
    throw new TypeError("Chargeur de page invalide");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > REALISATIONS_PAGE_SIZE) {
    throw new RangeError(`pageSize doit être compris entre 1 et ${REALISATIONS_PAGE_SIZE}`);
  }
  if (!Number.isSafeInteger(maxOffset) || maxOffset < 0) {
    throw new RangeError("maxOffset invalide");
  }

  const items = [];
  const seenIds = new Set();

  for (let offset = 0; offset <= maxOffset; offset += pageSize) {
    const page = await fetchPage({ limit: pageSize, offset });
    if (!Array.isArray(page)) {
      throw new TypeError("La réponse paginée doit être une collection");
    }

    page.forEach((item) => {
      const rawId = item?.id;
      if (rawId === null || rawId === undefined || rawId === "") {
        items.push(item);
        return;
      }
      const id = String(rawId);
      if (seenIds.has(id)) return;
      seenIds.add(id);
      items.push(item);
    });

    if (page.length < pageSize) return items;
  }

  throw new RangeError("Trop de réalisations pour la fenêtre de pagination autorisée");
}

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
