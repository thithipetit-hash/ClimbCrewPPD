import React, { useState } from "react";
import Button from "../components/Button.jsx";

export default function Parametres({
  USE_API,
  authUser,
  changePassword,
  requestEmailChange,
  themePreference,
  onThemePreferenceChange,
  themeOptions = [],
}) {
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  if (!USE_API) {
    return <div className="card"><div className="muted-box">Les paramètres du compte sont disponibles avec le backend API.</div></div>;
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPasswordForPassword, newPassword);
      setPasswordMessage("Mot de passe mis à jour.");
      setCurrentPasswordForPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      setPasswordError(String(error.message || error));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function submitEmailChange(event) {
    event.preventDefault();
    setEmailMessage("");
    setEmailError("");
    setEmailSaving(true);
    try {
      const result = await requestEmailChange(newEmail, currentPasswordForEmail);
      setEmailMessage(result?.message || "Un e-mail de confirmation a été envoyé à la nouvelle adresse.");
      setPendingEmail(newEmail);
      setNewEmail("");
      setCurrentPasswordForEmail("");
    } catch (error) {
      setEmailError(String(error.message || error));
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>Paramètres</h2>
        </div>
        <div>
          <label htmlFor="settings-theme-selector">Ambiance</label>
          <select
            id="settings-theme-selector"
            value={themePreference}
            onChange={(event) => onThemePreferenceChange(event.target.value)}
          >
            {themeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <details className="subcard" open>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Changer le mot de passe</summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={submitPasswordChange}>
          <div>
            <label>Mot de passe actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPasswordForPassword}
              onChange={(e) => setCurrentPasswordForPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Nouveau mot de passe</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label>Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="small">8 caractères minimum, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.</div>
          {passwordError && <div className="error">{passwordError}</div>}
          {passwordMessage && <div className="success">{passwordMessage}</div>}
          <div>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Enregistrement..." : "Mettre à jour le mot de passe"}
            </Button>
          </div>
        </form>
      </details>

      <details className="subcard">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Changer l'adresse e-mail</summary>
        <div className="small" style={{ marginTop: 10 }}>
          Un e-mail de confirmation est envoyé à la nouvelle adresse. Le changement n'est appliqué qu'après avoir cliqué sur le lien reçu, afin d'éviter toute perte d'accès au compte.
        </div>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={submitEmailChange}>
          <div>
            <label>Nouvelle adresse e-mail</label>
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Mot de passe actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPasswordForEmail}
              onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
              required
            />
          </div>
          {emailError && <div className="error">{emailError}</div>}
          {emailMessage && <div className="success">{emailMessage}</div>}
          {pendingEmail && (
            <div className="muted-box">
              Une confirmation est en attente pour <strong>{pendingEmail}</strong>. Vérifie la boîte de réception (et les indésirables) de cette adresse.
            </div>
          )}
          <div>
            <Button type="submit" disabled={emailSaving}>
              {emailSaving ? "Envoi..." : "Envoyer la confirmation"}
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
