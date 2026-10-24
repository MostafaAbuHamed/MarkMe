// Writes the Vercel Build Output API tree (.vercel/output) around dist/vercel/index.mjs, so
// `vercel deploy --prebuilt` ships our esbuild bundle instead of building from source.
// Usage: node scripts/vercel-output.mjs [packageRoot]
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, ".."));
const outputDir = path.join(packageRoot, ".vercel/output");
const functionDir = path.join(outputDir, "functions/index.func");

const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) {
  process.stderr.write("vercel-output: SUPABASE_URL is required\n");
  process.exit(1);
}

const environment = { SUPABASE_URL: supabaseUrl };
if (process.env.CORS_ORIGINS) {
  environment.CORS_ORIGINS = process.env.CORS_ORIGINS;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(functionDir, { recursive: true });
await copyFile(
  path.join(packageRoot, "dist/vercel/index.mjs"),
  path.join(functionDir, "index.mjs"),
);

await writeJson(path.join(functionDir, ".vc-config.json"), {
  runtime: "nodejs24.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  regions: ["fra1"],
  maxDuration: 30,
  environment,
});

await writeJson(path.join(outputDir, "config.json"), {
  version: 3,
  routes: [{ src: "/(.*)", dest: "/index" }],
});

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
