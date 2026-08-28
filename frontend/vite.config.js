import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { applyAppSourceAdjustments } from "./scripts/app-source-adjustments.mjs";

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
