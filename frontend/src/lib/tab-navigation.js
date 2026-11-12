export const ACTIVE_TAB_KEY = "climbcrew-active-tab";
export const TAB_CHANGE_EVENT = "climbcrew:tab-change";

export function getStoredActiveTab() {
  if (typeof window === "undefined") return "inscriptions";
  return window.sessionStorage.getItem(ACTIVE_TAB_KEY) || "inscriptions";
}

export function storeActiveTab(nextTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACTIVE_TAB_KEY, nextTab);
  window.dispatchEvent(new CustomEvent(TAB_CHANGE_EVENT, { detail: { tab: nextTab } }));
}
