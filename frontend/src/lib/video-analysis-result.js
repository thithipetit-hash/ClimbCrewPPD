// La sélection explicite prime, sinon une analyse sauvegardée est ouverte en priorité.
export function selectAnalysisUrl(requestedUrl, selectionUrls, savedUrls) {
  return selectionUrls.includes(requestedUrl) ? requestedUrl : savedUrls[0] || selectionUrls[0] || "";
}

// Le résultat calculé doit survivre au rafraîchissement des props, même si sa sauvegarde échoue.
export function resolveDisplayedAnalysis(selectedUrl, computedResult, storedVideos) {
  if (!selectedUrl) return null;
  return computedResult?.url === selectedUrl ? computedResult.analysis : storedVideos[selectedUrl] || null;
}
