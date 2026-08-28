/**
 * Version affichée dans l'interface.
 * La valeur est injectée par Vite depuis le fichier racine VERSION, unique source
 * de vérité du dépôt.
 */
export const APP_VERSION = String(import.meta.env?.VITE_APP_VERSION || "").trim();
export const APP_VERSION_PATTERN = /^\d{8}\.\d{3}$/;
