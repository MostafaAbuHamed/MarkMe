import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {"secret-key" | "service-role-name" | "legacy-jwt-anon" | "legacy-jwt-service_role"} FindingKind */

const SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{20,}/g;
const SERVICE_ROLE_PATTERN = /SERVICE_ROLE/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const DEFAULT_BUNDLE_DIR = "apps/extension/.output/chrome-mv3";

/**
 * @param {string} token
 * @returns {FindingKind | undefined}
 */
function jwtFindingKind(token) {
  const payloadSegment = token.split(".")[1];

  try {
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) {
      return undefined;
    }
    if (payload.role === "anon") {
      return "legacy-jwt-anon";
    }
    if (payload.role === "service_role") {
      return "legacy-jwt-service_role";
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * @param {string} text
 * @returns {Array<{ kind: FindingKind }>}
 */
export function scanText(text) {
  /** @type {Array<{ kind: FindingKind }>} */
  const findings = [];

  for (const _match of text.matchAll(SECRET_KEY_PATTERN)) {
    findings.push({ kind: "secret-key" });
  }

  for (const _match of text.matchAll(SERVICE_ROLE_PATTERN)) {
    findings.push({ kind: "service-role-name" });
  }

  for (const match of text.matchAll(JWT_PATTERN)) {
    const kind = jwtFindingKind(match[0]);
    if (kind !== undefined) {
      findings.push({ kind });
    }
  }

  return findings;
}

/**
 * Walks `dir` recursively, reads every file as UTF-8, returns findings with relative paths.
 * @param {string} dir
 * @returns {Promise<Array<{ file: string, kind: FindingKind }>>}
 */
export async function scanDirectory(dir) {
  /** @type {Array<{ file: string, kind: FindingKind }>} */
  const findings = [];

  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = join(entry.parentPath, entry.name);
    const file = relative(dir, fullPath).split("\\").join("/");
    const text = await readFile(fullPath, "utf8");

    for (const { kind } of scanText(text)) {
      findings.push({ file, kind });
    }
  }

  findings.sort((left, right) => {
    const byFile = left.file.localeCompare(right.file);
    if (byFile !== 0) {
      return byFile;
    }
    return left.kind.localeCompare(right.kind);
  });

  return findings;
}

/**
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
async function runCli(targetDir) {
  try {
    await access(targetDir, constants.F_OK);
  } catch {
    console.error(
      `bundle-secrets: directory not found: ${targetDir}. Build the extension first (pnpm --filter @markme/extension build).`,
    );
    process.exit(2);
  }

  const findings = await scanDirectory(targetDir);
  if (findings.length === 0) {
    console.log(`bundle-secrets: no findings in ${targetDir}`);
    process.exit(0);
  }

  for (const { file, kind } of findings) {
    console.log(`bundle-secrets: ${kind} in ${file}`);
  }
  process.exit(1);
}

const isDirectExecution =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  const targetDir = process.argv[2] ?? DEFAULT_BUNDLE_DIR;
  runCli(targetDir).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
