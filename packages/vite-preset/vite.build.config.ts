// Bundles the preset into a single ESM file: the dist is imported by bare
// Node when vite loads a user config, so it must not contain relative
// specifiers — bundling removes them instead of forcing .js extensions onto
// the sources.
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    },
    outDir: "dist",
    minify: false,
    sourcemap: true,
  },
})
