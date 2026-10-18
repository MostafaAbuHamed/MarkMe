import { loadExtensionEnv } from "./env-schema";

// The extension bundle replaces `import.meta.env`. `wxt.config.ts` must not
// import this module: Node loads the config with `import.meta.env` undefined,
// so this call would throw a TypeError instead of EnvError.
export const env = loadExtensionEnv(import.meta.env);
