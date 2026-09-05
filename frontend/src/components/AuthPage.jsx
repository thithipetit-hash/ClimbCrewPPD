import Button from "./Button.jsx";
import { PASSWORD_RULE_TEXT } from "../lib/password-policy.js";

const FORGOT_PASSWORD_HELP_TEXT = "Un code de réinitialisation valable une heure sera envoyé par e-mail si le compte est actif.";

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
}) {
  const switchView = (view) => {
    setAuthView(view);
    setAuthError("");
    setAuthMessage("");
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand auth-brand">
            <img src="/logo-climbcrew.png" alt="Logo CristalClimbClub" className="app-logo" />
            <div>
              <h1>CristalClimbClub</h1>
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
          <img src="/logo-climbcrew.png" alt="Logo CristalClimbClub" className="app-logo" />
          <div>
            <h1>CristalClimbClub</h1>
            <p className="small">Connexion requise pour accéder à l’application.</p>
          </div>
        </div>

        {authMessage && <div className="success" style={{ marginTop: 12 }}>{authMessage}</div>}
        {authError && <div className="error" style={{ marginTop: 12 }}>{authError}</div>}

        {authView === "login" && (
          <form className="grid two" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); handleLogin(); }}>
            <div>
              <label>Email</label>
              <input value={loginForm.email} onChange={(event) => setLoginForm((previous) => ({ ...previous, email: event.target.value }))} />
            </div>
            <div>
              <label>Mot de passe</label>
              <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))} />
            </div>
            <div className="auth-submit-row">
              <Button type="submit">Se connecter</Button>
            </div>
          </form>
        )}

        {authView === "request" && (
          <form className="grid two issue13-request-form" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); handleRequestAccess(); }}>
            <div><label>Prénom</label><input value={requestAccessForm.prenom} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, prenom: event.target.value }))} /></div>
            <div><label>Nom</label><input value={requestAccessForm.nom} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, nom: event.target.value }))} /></div>
            <div><label>Email</label><input type="email" value={requestAccessForm.email} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, email: event.target.value }))} /></div>
            <div><label>Mot de passe fort</label><input type="password" value={requestAccessForm.password} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, password: event.target.value }))} /></div>
            <div><label>Confirmation</label><input type="password" value={requestAccessForm.confirmPassword} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} /></div>
            <div>
              <label>Règles du mot de passe</label>
              <p className="small issue13-password-policy-text">{PASSWORD_RULE_TEXT}</p>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="issue13-consent-label">
                <input type="checkbox" checked={requestAccessForm.acceptTerms} onChange={(event) => setRequestAccessForm((previous) => ({ ...previous, acceptTerms: event.target.checked }))} />
                <span className="issue13-consent-copy"> J’accepte les conditions d’utilisation — <a className="issue13-consent-link" href="/rgpd.html" target="_blank" rel="noopener noreferrer">Consulter le texte RGPD</a></span>
              </label>
            </div>
            <div className="auth-submit-row"><Button type="submit">Création d’un compte</Button></div>
          </form>
        )}

        {authView === "forgot" && (
          <form className="grid two" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); handleForgotPassword(); }}>
            <div><label>Email</label><input type="email" value={forgotPasswordForm.email} onChange={(event) => setForgotPasswordForm({ email: event.target.value })} /></div>
            <div className="small" style={{ display: "flex", alignItems: "end" }}>{FORGOT_PASSWORD_HELP_TEXT}</div>
            <div className="auth-submit-row"><Button type="submit">Envoyer le code de réinitialisation</Button></div>
          </form>
        )}

        {authView === "reset" && (
          <form className="grid two" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); handleResetPassword(); }}>
            <div><label>Email</label><input type="email" value={resetPasswordForm.email} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, email: event.target.value }))} /></div>
            <div><label>Code de réinitialisation</label><input value={resetPasswordForm.token} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, token: event.target.value }))} /></div>
            <div><label>Nouveau mot de passe</label><input type="password" value={resetPasswordForm.password} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, password: event.target.value }))} /></div>
            <div><label>Confirmation</label><input type="password" value={resetPasswordForm.confirmPassword} onChange={(event) => setResetPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} /></div>
            <div>
              <label>Règles du mot de passe</label>
              <p className="small issue13-password-policy-text">{PASSWORD_RULE_TEXT}</p>
            </div>
            <div className="auth-submit-row"><Button type="submit">Mettre à jour le mot de passe</Button></div>
          </form>
        )}

        <div className="group auth-switcher" style={{ marginTop: 14 }}>
          {authView !== "login" && <Button type="button" variant="secondary" onClick={() => switchView("login")}>Connexion</Button>}
          {authView !== "request" && <Button type="button" variant="secondary" onClick={() => switchView("request")}>Création d’un compte</Button>}
          {authView !== "forgot" && authView !== "request" && <Button type="button" variant="secondary" onClick={() => switchView("forgot")}>Mot de passe perdu</Button>}
        </div>
      </div>
    </div>
  );
}
