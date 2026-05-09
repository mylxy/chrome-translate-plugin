import { resolve } from "node:path";
import { build, defineConfig } from "vite";

const root = process.cwd();

await build();

await build(
  defineConfig({
    configFile: false,
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: true,
      lib: {
        entry: resolve(root, "src/content/index.ts"),
        formats: ["iife"],
        name: "DeepSeekTranslateContent",
        fileName: () => "assets/content.js"
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: "assets/[name][extname]"
        }
      }
    }
  })
);
