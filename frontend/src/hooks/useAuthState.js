import { useState } from "react";

export function useAuthState({ useApi, themePreferenceKey }) {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(useApi);
  const [authView, setAuthView] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [requestAccessForm, setRequestAccessForm] = useState({
    prenom: "", nom: "", email: "", password: "", confirmPassword: "", acceptTerms: false,
  });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ email: "" });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    email: "", token: "", password: "", confirmPassword: "",
  });
  const [adminAuthUsers, setAdminAuthUsers] = useState([]);
  const [adminAccessLogs, setAdminAccessLogs] = useState([]);
  const [generatedResetToken, setGeneratedResetToken] = useState("");
  const [pendingBroadcastMessages, setPendingBroadcastMessages] = useState([]);
  const [broadcastMessageError, setBroadcastMessageError] = useState("");
  const [themePreference, setThemePreference] = useState(() => localStorage.getItem(themePreferenceKey) || "auto");

  return {
    authUser, setAuthUser, authLoading, setAuthLoading,
    authView, setAuthView, authError, setAuthError, authMessage, setAuthMessage,
    loginForm, setLoginForm, requestAccessForm, setRequestAccessForm,
    forgotPasswordForm, setForgotPasswordForm, resetPasswordForm, setResetPasswordForm,
    adminAuthUsers, setAdminAuthUsers, adminAccessLogs, setAdminAccessLogs,
    generatedResetToken, setGeneratedResetToken, pendingBroadcastMessages, setPendingBroadcastMessages,
    broadcastMessageError, setBroadcastMessageError, themePreference, setThemePreference,
  };
}
