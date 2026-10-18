import { existsSync } from "node:fs";

import { EnvError } from "@markme/domain";

import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

let env: ReturnType<typeof loadEnv>;
try {
  env = loadEnv();
} catch (error) {
  if (error instanceof EnvError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const port = env.PORT;

const server = createApp().listen(port);

server.on("listening", () => {
  console.log(`preview-api listening on http://127.0.0.1:${port}`);
});

server.on("error", (error: Error) => {
  if (isAddrInUse(error)) {
    process.stderr.write(`preview-api: port ${port} is already in use\n`);
    process.exit(1);
  }
  throw error;
});

function isAddrInUse(error: Error): boolean {
  return "code" in error && error.code === "EADDRINUSE";
}
