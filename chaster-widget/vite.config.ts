import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "ChasterWidget",
      formats: ["iife", "es"],
      fileName: (format) => `chaster-widget.${format}.js`,
    },
    sourcemap: true,
  },
});
