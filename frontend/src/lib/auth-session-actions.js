import { apiFetch } from "./api.js";

export function createAuthSessionActions({
  request = apiFetch,
  loginForm,
  reloadApiState,
  setAuthError,
  setAuthMessage,
  setAuthUser,
  setThemePreference,
  setAdminUnlocked,
  setAuthView,
  setGeneratedResetToken,
  setAdminAuthUsers,
  setAdminAccessLogs,
  setPendingBroadcastMessages,
  setBroadcastMessageError,
  setSyncMessage,
}) {
  async function handleLogin() {
    try {
      setAuthError("");
      setAuthMessage("");

      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      setAuthUser(data.user);
      if (data.user?.theme_preference) setThemePreference(data.user.theme_preference);
      if (data.user?.role === "admin") setAdminUnlocked(true);
      setAuthView("login");
      setGeneratedResetToken("");
      setAuthMessage("Connexion réussie.");

      try {
        await reloadApiState({ isMounted: () => true });
      } catch (error) {
        console.error("Synchronisation après connexion impossible :", error);
        setSyncMessage(`Erreur de synchronisation après connexion : ${error.message || error}`);
      }
    } catch (error) {
      setAuthError(String(error.message || error));
    }
  }

  async function handleLogout() {
    setAuthError("");
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Déconnexion serveur impossible :", error);
      setAuthError(`Déconnexion impossible : ${error.message || error}`);
      return false;
    }

    setAuthUser(null);
    setAdminUnlocked(false);
    setGeneratedResetToken("");
    setAdminAuthUsers([]);
    setAdminAccessLogs([]);
    setPendingBroadcastMessages([]);
    setBroadcastMessageError("");
    setAuthMessage("Déconnexion réussie.");
    return true;
  }

  return { handleLogin, handleLogout };
}
