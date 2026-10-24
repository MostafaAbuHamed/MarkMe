import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.join(import.meta.dirname, "..");

await rm(path.join(packageRoot, "dist"), { recursive: true, force: true });

await esbuild.build({
  entryPoints: [path.join(packageRoot, "src/server.ts")],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: path.join(packageRoot, "dist/server.mjs"),
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  sourcemap: false,
});
