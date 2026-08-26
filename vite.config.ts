import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend and API share an origin in production. In development, /api/* falls through to the
// proxy below so the browser keeps that same-origin contract while Express runs on its own port.
const devApiTarget = process.env.VITE_DEV_API_TARGET ?? "http://localhost:5066";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    // Development only, and only ever bound to a private network by the compose stack: Vite blocks
    // requests whose Host header it does not recognise, which is every LAN address the app is opened
    // from. The production build is static files served by Express and never sees this setting.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      },
      // The local storage emulator. Proxied rather than addressed directly so asset URLs stay
      // relative — "localhost:4443" is unreachable from any machine other than the host. It only
      // serves plain object paths when the Host matches its -public-host, which changeOrigin sets.
      "/local-gcs": {
        target: process.env.VITE_DEV_GCS_TARGET ?? "http://gcs:4443",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/local-gcs/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    // Production bundles are public artifacts. Keeping source maps beside them exposes the
    // original TypeScript and makes it much easier to reconstruct private implementation details.
    // Non-production builds retain maps for local diagnostics.
    sourcemap: mode !== "production",
  },
}));
