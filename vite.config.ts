import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // `vite build --mode embedded` → one self-contained page for hosting inside a frame (see scripts/build-embedded.mjs)
  const embedded = mode === "embedded";
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    server: { port: 5173, strictPort: true, host: "127.0.0.1" },
    base: embedded ? "./" : "/",
    define: embedded ? { "import.meta.env.VITE_EMBEDDED": JSON.stringify("1"), "import.meta.env.VITE_DATA_MODE": JSON.stringify("demo") } : {},
    build: embedded
      ? {
          outDir: "dist-embedded",
          assetsInlineLimit: 1_000_000,
          cssCodeSplit: false,
          rolldownOptions: { input: path.resolve(import.meta.dirname, "artifact.html"), output: { inlineDynamicImports: true } },
        }
      : undefined,
  };
});
