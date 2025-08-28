// sensor-server/apps/todo/frontend/vite.config.js

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/todo/",                 // ← 本番で /todo 配下に置くため
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5176, proxy: { "/api": "http://localhost:3000" } },
  build: { outDir: "dist" },
});
