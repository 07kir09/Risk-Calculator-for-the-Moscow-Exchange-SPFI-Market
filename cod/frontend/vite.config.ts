import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Фронт обращается к /api/*, а Vite проксирует на бекенд (FastAPI) на :8000
      "/api": {
        // Важно: используем IPv4 loopback, чтобы не ловить ECONNREFUSED на ::1 (macOS часто резолвит localhost в IPv6).
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
