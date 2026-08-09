/**
 * Source unique de la version affichée par ClimbClubCristal.
 *
 * VITE_APP_VERSION permet à une chaîne de build de fournir la version.
 * La valeur de repli reste utilisable en développement, sous Docker et sur Render.
 */
const configuredVersion = String(import.meta.env?.VITE_APP_VERSION || "").trim();

export const APP_VERSION = configuredVersion || "260809.085";
export const APP_VERSION_PATTERN = /^\d{6}\.\d{3}$/;
