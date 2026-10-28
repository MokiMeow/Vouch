import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const apiPort = Number(env.PORT ?? 4000);
  const apiHost = env.HOST ?? "127.0.0.1";
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)
    throw new Error("PORT must be a valid API port");
  if (!["127.0.0.1", "localhost"].includes(apiHost))
    throw new Error("The development API proxy must use a loopback host");
  return {
    root: "apps/web",
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": `http://${apiHost}:${apiPort}` },
    },
    build: {
      sourcemap: process.env.VOUCH_COVERAGE === "1",
      minify: process.env.VOUCH_COVERAGE === "1" ? false : true,
      outDir: "../../dist/web",
      emptyOutDir: true,
    },
  };
});
