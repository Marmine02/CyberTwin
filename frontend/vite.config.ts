import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.CT_BACKEND_URL ?? "http://127.0.0.1:8000";
const port = Number(process.env.CT_FRONTEND_PORT ?? 5173);
// `vite preview` (used by the E2E suite) must proxy /api exactly like the dev server does
const proxy = { "/api": { target: backend, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port,
    strictPort: true,
    proxy,
  },
  preview: { port, strictPort: true, proxy },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
