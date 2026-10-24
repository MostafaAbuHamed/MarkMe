import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

// Vercel calls the default export for every request; env is read once per instance.
export default createApp({ env: loadEnv() });
