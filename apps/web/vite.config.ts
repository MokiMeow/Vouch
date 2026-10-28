import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
  build: {
    sourcemap: true,
    minify: process.env.VOUCH_COVERAGE === "1" ? false : true,
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});
