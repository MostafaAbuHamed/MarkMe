import { EnvError } from "@markme/domain";
import { loadEnv } from "vite";
import { defineConfig } from "wxt";
import { loadExtensionEnv } from "./src/lib/env-schema";

// `wxt prepare` loads this file for postinstall and typecheck, before a filled
// `.env` exists. Bundling commands validate here, as the config module loads,
// so `wxt` and `wxt build` fail before any output directory is created.
const SKIP_ENV_COMMANDS = new Set(["prepare", "clean", "init", "submit"]);

function firstPositional(argv: readonly string[]): string | undefined {
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return undefined;
}

function readOption(argv: readonly string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) {
      const value = argv[index + 1];
      if (value !== undefined && !value.startsWith("-")) {
        return value;
      }
    }
    if (arg !== undefined && arg.startsWith(`${name}=`)) {
      const value = arg.slice(name.length + 1);
      if (value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function modeFor(argv: readonly string[]): string {
  const flagged = readOption(argv, "--mode") ?? readOption(argv, "-m");
  if (flagged !== undefined) {
    return flagged;
  }
  const command = firstPositional(argv);
  if (command === "build" || command === "zip") {
    return "production";
  }
  return "development";
}

function assertExtensionEnv(argv: readonly string[]): void {
  const command = firstPositional(argv);
  if (command !== undefined && SKIP_ENV_COMMANDS.has(command)) {
    return;
  }

  try {
    loadExtensionEnv(loadEnv(modeFor(argv), process.cwd(), "WXT_"));
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

assertExtensionEnv(process.argv);

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: { disabled: true },
  manifest: { name: "MarkMe" },
});
