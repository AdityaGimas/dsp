import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Dev: Vite serves on :5173 and proxies /api -> FastAPI on :8000.
// Prod: the built dist/ is served by FastAPI itself, so /api is same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
})
