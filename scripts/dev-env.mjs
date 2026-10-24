import { writeFile } from "node:fs/promises";

const STATUS_KEYS = ["API_URL", "PUBLISHABLE_KEY"];

/**
 * Allowlist parse of `supabase status -o env` text.
 * Only `API_URL` and `PUBLISHABLE_KEY` are read. One pair of surrounding double quotes is stripped.
 * @param {string} text
 * @returns {{ API_URL: string, PUBLISHABLE_KEY: string }}
 */
export function parseStatusEnv(text) {
  /** @type {Partial<Record<(typeof STATUS_KEYS)[number], string>>} */
  const found = {};

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator);
    if (key !== "API_URL" && key !== "PUBLISHABLE_KEY") {
      continue;
    }

    let value = line.slice(separator + 1);
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    found[key] = value;
  }

  const missing = STATUS_KEYS.filter((key) => found[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }

  return {
    API_URL: /** @type {string} */ (found.API_URL),
    PUBLISHABLE_KEY: /** @type {string} */ (found.PUBLISHABLE_KEY),
  };
}

/**
 * Map allowlisted status values onto one app's env keys.
 * @param {string} app
 * @param {{ API_URL: string, PUBLISHABLE_KEY: string }} status
 * @returns {Record<string, string>}
 */
export function appEnvValues(app, status) {
  if (app === "preview-api") {
    return { SUPABASE_URL: status.API_URL };
  }

  if (app === "extension") {
    return {
      WXT_SUPABASE_URL: status.API_URL,
      WXT_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      WXT_PREVIEW_API_URL: "http://127.0.0.1:8787",
    };
  }

  throw new Error(`Unknown app: ${app}`);
}

/**
 * Replace values of `KEY=` lines whose key is in `values`.
 * Every other line stays byte-for-byte. Keys that are not already in the example are not appended.
 * @param {string} example
 * @param {Readonly<Record<string, string>>} values
 * @returns {string}
 */
export function fillExample(example, values) {
  return example
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator === -1) {
        return line;
      }

      const key = line.slice(0, separator);
      if (!Object.hasOwn(values, key)) {
        return line;
      }

      return `${key}=${values[key]}`;
    })
    .join("\n");
}

/**
 * Create `path` only when it is absent (`wx`). An existing file is left untouched.
 * @param {string} path
 * @param {string} content
 * @returns {Promise<"created" | "found">}
 */
export async function ensureEnvFile(path, content) {
  try {
    await writeFile(path, content, { flag: "wx" });
    return "created";
  } catch (error) {
    if (isFileExistsError(error)) {
      return "found";
    }
    throw error;
  }
}

/**
 * @param {unknown} error
 * @returns {error is NodeJS.ErrnoException}
 */
function isFileExistsError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
