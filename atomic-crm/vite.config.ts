import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import createHtmlPlugin from "vite-plugin-simple-html";
import { VitePWA } from "vite-plugin-pwa";

const envDir = path.resolve(__dirname);

/** Embed selected `VITE_*` vars from `.env` / `.env.[mode]` so the client always receives them (avoids empty `import.meta.env` on some Node/Vite combos). */
function viteEnvDefine(mode: string) {
  const env = loadEnv(mode, envDir, "");
  const s = (v: string | undefined) => JSON.stringify(v ?? "");
  return {
    "import.meta.env.VITE_SUPABASE_URL": s(env.VITE_SUPABASE_URL),
    "import.meta.env.VITE_SB_PUBLISHABLE_KEY": s(env.VITE_SB_PUBLISHABLE_KEY),
    "import.meta.env.VITE_IS_DEMO": s(env.VITE_IS_DEMO),
    "import.meta.env.VITE_INBOUND_EMAIL": s(env.VITE_INBOUND_EMAIL),
    "import.meta.env.VITE_ATTACHMENTS_BUCKET": s(env.VITE_ATTACHMENTS_BUCKET),
    "import.meta.env.VITE_GOOGLE_WORKPLACE_DOMAIN": s(
      env.VITE_GOOGLE_WORKPLACE_DOMAIN,
    ),
    "import.meta.env.VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION": s(
      env.VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION,
    ),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      open: process.env.NODE_ENV !== "CI",
      filename: "./dist/stats.html",
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          mainScript: `src/main.tsx`,
        },
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
      manifest: false, // Use existing manifest.json from public/
    }),
  ],
  define: viteEnvDefine(mode),
  base: "./",
  esbuild: {
    keepNames: true,
  },
  build: {
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
