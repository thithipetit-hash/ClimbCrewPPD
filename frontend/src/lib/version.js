/**
 * Version affichée dans l'interface.
 * Format obligatoire : AAAAMMJJ.NNN (date de version + incrément du jour).
 * VERSION à la racine est la source de vérité du dépôt ; ce fallback doit rester
 * strictement synchronisé pour les builds locaux sans variable d'environnement.
 * La variable d'environnement permet au déploiement de la remplacer si nécessaire.
 */
const configuredVersion = String(import.meta.env?.VITE_APP_VERSION || "").trim();

export const APP_VERSION = configuredVersion || "20260828.023";
export const APP_VERSION_PATTERN = /^\d{8}\.\d{3}$/;