import Button from "./Button.jsx";
import { PASSWORD_RULE_TEXT } from "../lib/password-policy.js";

export default function AuthPage({
  loading = false,
  authView,
  authError,
  authMessage,
  loginForm,
  setLoginForm,
  requestAccessForm,
  setRequestAccessForm,
  forgotPasswordForm,
  setForgotPasswordForm,
  resetPasswordForm,
  setResetPasswordForm,
  handleLogin,
  handleRequestAccess,
  handleForgotPassword,
  handleResetPassword,
  setAuthView,
  setAuthError,
  setAuthMessage,
  appVersion,
}) {
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand auth-brand">
            <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" />
            <div>
              <h1>ClimbClubCristal</h1>
              <p className="small">Chargement de la session…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <img src="/logo-climbcrew.png" alt="Logo ClimbClubCristal" className="app-logo" />
          <div>
            <h1>ClimbClubCristal</h1>
            <p className="small">Connexion requise pour accéder à l’application.</p>
          </div>
        </div>

        {authMessage && <div className="success" style={{ marginTop: 12 }}>{authMessage}</div>}
        {authError && <div className="error" style={{ marginTop: 12 }}>{authError}</div>}

        {authView === "login" && (
          <div className="grid two" style={{ marginTop: 14 }}>
            <div>
              <label>Emails</label>
              <input value={loginForm.email} onChange={(event) => setLoginForm((previous) => ({ ...previous, email: event.target.value }))} />
            </div>
            <div>
              <label>Mot de passe</label>
              <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))} />
            </div>
            <div className="auth-submit-row">
              <Button onClick={handleLogin}>Se connecter</Button>
            </div>
          </div>
        )}

        {authView === "request" && (
          <div className="grid two" style={{ marginTop: 14 }}>
            <div><label>Prénom</label><input value={requestAccessForm.prenom} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, prenom: event.target.value }))} /></div>
            <div><label>Nom</label><input value={requestAccessForm.nom} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, nom: event.target.value }))} /></div>
            <div><label>Email</label><input value={requestAccessForm.email} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, email: event.target.value }))} /></div>
            <div><label>Mot de passe fort</label><input type="password" value={requestAccessForm.password} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, password: event.target.value }))} /></div>
            <div><label>Confirmation</label><input type="password" value={requestAccessForm.confirmPassword} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} /></div>
            <div><label>Politique mot de passe</label><input value={PASSWORD_RULE_TEXT} readOnly /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label><input type="checkbox" checked={requestAccessForm.acceptTerms} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, acceptTerms: event.target.checked }))} /> J’accepte les conditions d’utilisation et la journalisation des accès.</label>
            </div>
            <div className="auth-submit-row"><Button onClick={handleRequestAccess}>Envoyer la demande</Button></div>
          </div>
        )}

        {authView === "forgot" && (
          <div className="grid two" style={{ marginTop: 14 }}>
            <div><label>Email</label><input value={forgotPasswordForm.email} onChange={(event) => setForgotPasswordForm({ email: event.target.value })} /></div>
            <div className="small" style={{ display: "flex", alignItems: "end" }}>La demande sera journalisée. Un administrateur pourra générer un code de réinitialisation.</div>
            <div className="auth-submit-row"><Button onClick={handleForgotPassword}>Signaler la perte du mot de passsse</Button></div>
          </div>
        )}

        {authView === "reset" && (
          <div className="grid two" style={{ marginTop: 14 }}>
            <div><label>Email</label><input value={resetPasswordForm.email} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, email: event.target.value }))} /></div>
            <div><label>Code de réinitialisation</label><input value={resetPasswordForm.token} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, token: event.target.value }))} /></div>
            <div><label>Nouveau mot de passe</label><input type="password" value={resetPasswordForm.password} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, password: event.target.value }))} /></div>
            <div><label>Confirmation</label><input type="password" value={resetPasswordForm.confirmPassword} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} /></div>
            <div><label>Politique mot de passe</label><input value={PASSWORD_RULE_TEXT} readOnly /></div>
            <div className="auth-submit-row"><Button onClick={handleResetPassword}>Mettre à jour le mot de passe</Button></div>
          </div>
        )}

        <div className="group auth-switcher" style={{ marginTop: 14 }}>
          <Button variant={authView === "request" ? "primary" : "secondary"} onClick={() => { setAuthView("request"); setAuthError(""); setAuthMessage(""); }}>Demander un accès</Button>
          <Button variant={authView === "forgot" ? "primary" : "secondary"} onClick={() => { setAuthView("forgot"); setAuthError(""); setAuthMessage(""); }}>Mot de passe perdu</Button>
        </div>

        <div className="small" style={{ marginTop: 10, textAlign: "center", color: "#475569" }}>
          Version : {appVersion}
        </div>
      </div>
    </div>
  );
}
