import fs from "node:fs";

const appPath = "frontend/src/AppCore.jsx";
const versionPath = "VERSION";
let source = fs.readFileSync(appPath, "utf8");

const importAnchor = 'import Button from "./components/Button.jsx";\n';
if (!source.includes('import AuthPage from "./components/AuthPage.jsx";')) {
  source = source.replace(importAnchor, `${importAnchor}import AuthPage from "./components/AuthPage.jsx";\n`);
}

const start = source.indexOf('  if (USE_API && authLoading) {');
const endMarker = '\n\n\n  return (\n    <div className="app">';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Bloc authentification introuvable");

const replacement = `  if (USE_API && authLoading) {\n    return <AuthPage loading appVersion={APP_VERSION} />;\n  }\n\n  if (USE_API && !authUser) {\n    return (\n      <AuthPage\n        authView={authView}\n        authError={authError}\n        authMessage={authMessage}\n        loginForm={loginForm}\n        setLoginForm={setLoginForm}\n        requestAccessForm={requestAccessForm}\n        setRequestAccessForm={setRequestAccessForm}\n        forgotPasswordForm={forgotPasswordForm}\n        setForgotPasswordForm={setForgotPasswordForm}\n        resetPasswordForm={resetPasswordForm}\n        setResetPasswordForm={setResetPasswordForm}\n        handleLogin={handleLogin}\n        handleRequestAccess={handleRequestAccess}\n        handleForgotPassword={handleForgotPassword}\n        handleResetPassword={handleResetPassword}\n        setAuthView={setAuthView}\n        setAuthError={setAuthError}\n        setAuthMessage={setAuthMessage}\n        appVersion={APP_VERSION}\n      />\n    );\n  }`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(appPath, source);

const version = fs.readFileSync(versionPath, "utf8").trim();
const match = version.match(/^(\d{8})\.(\d{3})$/);
if (!match) throw new Error(`Version invalide: ${version}`);
const next = `${match[1]}.${String(Number(match[2]) + 1).padStart(3, "0")}`;
fs.writeFileSync(versionPath, `${next}\n`);
console.log(`Version ${version} -> ${next}`);
