import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { applyAppSourceAdjustments } from "./scripts/app-source-adjustments.mjs";

const rootVersionUrl = new URL("../VERSION", import.meta.url);
const appVersion = String(process.env.VITE_APP_VERSION || "").trim()
  || (existsSync(rootVersionUrl) ? readFileSync(rootVersionUrl, "utf8").trim() : "");

if (!/^\d{8}\.\d{3}$/.test(appVersion)) {
  throw new Error("VITE_APP_VERSION ou VERSION racine doit fournir une version AAAAMMJJ.NNN valide.");
}

function appSourceAdjustmentsPlugin() {
  return {
    name: "app-source-adjustments",
    enforce: "pre",
    transform(code, id) {
      const cleanId = String(id || "").split("?")[0];
      if (!cleanId.endsWith("/src/App.jsx")) return null;
      return applyAppSourceAdjustments(code);
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  plugins: [appSourceAdjustmentsPlugin(), react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend-dev:3000",
        changeOrigin: true,
      },
    },
  },
});
