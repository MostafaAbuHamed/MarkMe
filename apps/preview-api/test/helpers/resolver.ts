import type { ResolvedAddress, Resolver } from "../../src/ssrf/resolve.js";

export interface ScriptedResolver extends Resolver {
  calls(host?: string): number;
}

export function enotfound(host: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${host}`);
  error.code = "ENOTFOUND";
  return error;
}

export function scriptedResolver(
  answers: Record<string, ResolvedAddress[][] | Error>,
): ScriptedResolver {
  const counts = new Map<string, number>();

  const resolve = ((host: string): Promise<ResolvedAddress[]> => {
    const seen = counts.get(host) ?? 0;
    counts.set(host, seen + 1);
    const script = answers[host];
    if (script instanceof Error) {
      return Promise.reject(script);
    }
    if (script === undefined) {
      return Promise.reject(enotfound(host));
    }
    const list = script[Math.min(seen, script.length - 1)];
    if (list === undefined) {
      return Promise.reject(enotfound(host));
    }
    return Promise.resolve(list);
  }) as ScriptedResolver;

  resolve.calls = (host?: string) => {
    if (host === undefined) {
      let total = 0;
      for (const count of counts.values()) total += count;
      return total;
    }
    return counts.get(host) ?? 0;
  };

  return resolve;
}
