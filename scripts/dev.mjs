import { spawn, spawnSync } from "node:child_process";
import { writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { appEnvValues, ensureEnvFile, fillExample, parseStatusEnv } from "./dev-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const turboArgs = [
  "exec",
  "turbo",
  "run",
  "dev",
  "--filter=@markme/preview-api",
  "--filter=@markme/extension",
  "--ui=stream",
];

function log(message) {
  writeSync(1, `[dev] ${message}\n`);
}

function fail(message) {
  writeSync(2, `[dev] ${message}\n`);
  process.exit(1);
}

function preflight() {
  const version = process.versions.node;
  const major = Number(version.split(".")[0]);
  if (major !== 24) {
    fail(`Node 24 is required (found ${version}). Run \`fnm use\` or \`nvm use\` (reads .nvmrc).`);
  }

  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.status !== 0) {
    fail(
      "Docker is not running or not installed. Start it (e.g. `sudo systemctl start docker`) and run pnpm dev again.",
    );
  }

  log(`node ${version} ✓   docker ✓`);
}

function supabaseStatus() {
  return spawnSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env", "--workdir", "packages/database"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function ensureDatabase() {
  const running = supabaseStatus();
  if (running.status === 0) {
    log("supabase: already running (reused)");
    return parseStatusEnv(running.stdout ?? "");
  }

  log("supabase: starting… (first run downloads images, ~5–10 min)");
  const started = spawnSync("pnpm", ["db:start"], { cwd: root, stdio: "inherit" });
  if (started.status !== 0) {
    fail("supabase failed to start, see above.");
  }

  const fresh = supabaseStatus();
  if (fresh.status !== 0) {
    fail("supabase failed to start, see above.");
  }

  return parseStatusEnv(fresh.stdout ?? "");
}

async function writeEnvFiles(status) {
  for (const app of ["preview-api", "extension"]) {
    const example = await readFile(join(root, "apps", app, ".env.example"), "utf8");
    const content = fillExample(example, appEnvValues(app, status));
    const result = await ensureEnvFile(join(root, "apps", app, ".env"), content);
    if (result === "created") {
      log(`created apps/${app}/.env`);
    } else {
      log(`found apps/${app}/.env (left unchanged)`);
    }
  }
}

function printSummary(status) {
  const rows = [
    ["Supabase API", status.API_URL],
    ["Studio", "http://127.0.0.1:54323"],
    ["Mailpit", "http://127.0.0.1:54324"],
    ["Preview API", "http://127.0.0.1:8787/healthz"],
    ["Extension", "load unpacked: apps/extension/.output/chrome-mv3-dev"],
  ];

  for (const [label, value] of rows) {
    log(`${label.padEnd(15)}${value}`);
  }

  log("Ctrl-C stops the API and extension build; `pnpm db:stop` stops the database.");
}

/**
 * @param {unknown} error
 * @param {string} code
 */
function isErrno(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Signal the dev-process group (pnpm → turbo → apps). Supabase is not in this group.
 * @param {import("node:child_process").ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function signalGroup(child, signal) {
  if (child.pid === undefined) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (isErrno(error, "ESRCH")) {
      return;
    }
    try {
      child.kill(signal);
    } catch {
      // The child already exited.
    }
  }
}

function runApps() {
  const child = spawn("pnpm", turboArgs, {
    cwd: root,
    stdio: "inherit",
    detached: true,
  });

  let sigint = false;
  let forceKillArmed = false;

  const forward = (signal) => {
    if (signal === "SIGINT") {
      sigint = true;
    }
    signalGroup(child, signal);
    if (forceKillArmed) {
      return;
    }
    forceKillArmed = true;
    const timer = setTimeout(() => {
      signalGroup(child, "SIGKILL");
    }, 8_000);
    child.once("exit", () => {
      clearTimeout(timer);
    });
  };

  process.on("SIGINT", () => {
    forward("SIGINT");
  });
  process.on("SIGTERM", () => {
    forward("SIGTERM");
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(code);
    };

    child.once("error", () => {
      finish(1);
    });
    child.once("exit", (code, signal) => {
      if (sigint || signal === "SIGINT") {
        finish(130);
        return;
      }
      finish(code ?? 1);
    });
  });
}

try {
  preflight();
  const status = ensureDatabase();
  await writeEnvFiles(status);
  printSummary(status);
  process.exit(await runApps());
} catch (error) {
  fail(error instanceof Error ? error.message : "unexpected failure");
}
