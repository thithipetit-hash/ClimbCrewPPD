import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootVersionUrl = new URL("../VERSION", import.meta.url);
const appVersion = String(process.env.VITE_APP_VERSION || "").trim()
  || (existsSync(rootVersionUrl) ? readFileSync(rootVersionUrl, "utf8").trim() : "");

if (!/^\d{8}\.\d{3}$/.test(appVersion)) {
  throw new Error("VITE_APP_VERSION ou VERSION racine doit fournir une version AAAAMMJJ.NNN valide.");
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  plugins: [react()],
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
