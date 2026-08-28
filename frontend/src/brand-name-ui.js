const LEGACY_BRAND = "ClimbClubCristal";
const CURRENT_BRAND = "CristalClimbClub";

function replaceBrandText(value) {
  return typeof value === "string" && value.includes(LEGACY_BRAND)
    ? value.replaceAll(LEGACY_BRAND, CURRENT_BRAND)
    : value;
}

function updateBranding(root = document) {
  if (document.title.includes(LEGACY_BRAND)) {
    document.title = replaceBrandText(document.title);
  }

  document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach((meta) => {
    const next = replaceBrandText(meta.getAttribute("content") || "");
    if (next !== meta.getAttribute("content")) meta.setAttribute("content", next);
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const next = replaceBrandText(node.nodeValue || "");
    if (next !== node.nodeValue) node.nodeValue = next;
  });

  root.querySelectorAll?.("[alt], [aria-label], [title]").forEach((element) => {
    ["alt", "aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute) || "";
      const next = replaceBrandText(current);
      if (next !== current) element.setAttribute(attribute, next);
    });
  });
}

let scheduled = false;
function scheduleBrandingUpdate() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    updateBranding(document);
  });
}

scheduleBrandingUpdate();
new MutationObserver(scheduleBrandingUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["alt", "aria-label", "title"],
});
