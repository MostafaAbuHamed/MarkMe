import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.join(import.meta.dirname, "..");

await rm(path.join(packageRoot, "dist"), { recursive: true, force: true });

await esbuild.build({
  entryPoints: {
    server: path.join(packageRoot, "src/server.ts"),
    "vercel/index": path.join(packageRoot, "src/vercel.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outdir: path.join(packageRoot, "dist"),
  outExtension: { ".js": ".mjs" },
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  sourcemap: false,
});
