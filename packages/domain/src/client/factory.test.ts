import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const m = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...m, createClient: vi.fn(m.createClient) };
});

import { createClient } from "@supabase/supabase-js";

import { createMarkMeClient, type AuthStorage, type MarkMeClient } from "./factory";

const PROJECT_URL = "https://abcdefghijklmnop.supabase.co";
const ANON_KEY = "anon";
const STORAGE_KEY = "sb-abcdefghijklmnop-auth-token";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const AUTH_KEYS = [
  "autoRefreshToken",
  "detectSessionInUrl",
  "flowType",
  "persistSession",
  "storage",
] as const;

function createMemoryStorage() {
  const map = new Map<string, string>();
  const getItem = vi.fn((key: string) => Promise.resolve(map.get(key) ?? null));
  const setItem = vi.fn((key: string, value: string) => {
    map.set(key, value);
    return Promise.resolve();
  });
  const removeItem = vi.fn((key: string) => {
    map.delete(key);
    return Promise.resolve();
  });
  const storage: AuthStorage = { getItem, setItem, removeItem };
  return { map, storage, getItem, setItem, removeItem };
}

function makeUser() {
  return {
    id: USER_ID,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function makeSession(accessToken: string, expiresAtSec: number) {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAtSec,
    user: makeUser(),
  };
}

describe("createMarkMeClient", () => {
  const clients: MarkMeClient[] = [];

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("unexpected fetch"))),
    );
  });

  afterEach(async () => {
    for (const client of clients) {
      await client.auth.stopAutoRefresh();
    }
    clients.length = 0;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function trackClient(client: MarkMeClient) {
    clients.push(client);
    return client;
  }

  it.each([
    {
      name: "defaults detectSessionInUrl to false",
      detectSessionInUrl: undefined,
      expected: false,
    },
    { name: "passes detectSessionInUrl: true through", detectSessionInUrl: true, expected: true },
  ])("$name with the fixed auth options", ({ detectSessionInUrl, expected }) => {
    const { storage } = createMemoryStorage();
    const opts = { url: PROJECT_URL, anonKey: ANON_KEY, storage };

    trackClient(
      createMarkMeClient(detectSessionInUrl === undefined ? opts : { ...opts, detectSessionInUrl }),
    );

    expect(createClient).toHaveBeenCalledWith(PROJECT_URL, ANON_KEY, {
      auth: {
        storage,
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: expected,
      },
    });
  });

  it("does not pass through extra auth options", () => {
    const { storage } = createMemoryStorage();
    const opts = { url: PROJECT_URL, anonKey: ANON_KEY, storage };
    const lock = vi.fn();

    trackClient(createMarkMeClient({ ...opts, lock } as never));

    const authArg = vi.mocked(createClient).mock.calls.at(-1)?.[2]?.auth;
    expect(authArg).toBeDefined();
    expect(Object.keys(authArg!).sort()).toEqual([...AUTH_KEYS].sort());

    // @ts-expect-error lock is not an option
    createMarkMeClient({ ...opts, lock: vi.fn() });
  });

  it("reads an unexpired session from storage without fetch", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { map, storage, getItem } = createMemoryStorage();
    const accessToken = "stored-access-token";
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    map.set(STORAGE_KEY, JSON.stringify(makeSession(accessToken, expiresAt)));

    const client = trackClient(
      createMarkMeClient({ url: PROJECT_URL, anonKey: ANON_KEY, storage }),
    );

    const { data } = await client.auth.getSession();

    expect(data.session?.access_token).toBe(accessToken);
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired session and persists the new tokens", async () => {
    const newAccessToken = "new-access-token";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: newAccessToken,
              refresh_token: "new-refresh-token",
              expires_in: 3600,
              token_type: "bearer",
              user: makeUser(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { map, storage, setItem } = createMemoryStorage();
    const expiresAt = Math.floor(Date.now() / 1000) - 3600;
    map.set(STORAGE_KEY, JSON.stringify(makeSession("old-access-token", expiresAt)));

    const client = trackClient(
      createMarkMeClient({ url: PROJECT_URL, anonKey: ANON_KEY, storage }),
    );

    await client.auth.getSession();

    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining(newAccessToken));
    const refreshCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url.includes("/auth/v1/token?grant_type=refresh_token");
    });
    expect(refreshCall).toBeDefined();
  });

  it("removes the session from storage on local signOut", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);

    const { map, storage, removeItem } = createMemoryStorage();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    map.set(STORAGE_KEY, JSON.stringify(makeSession("stored-access-token", expiresAt)));

    const client = trackClient(
      createMarkMeClient({ url: PROJECT_URL, anonKey: ANON_KEY, storage }),
    );

    await client.auth.signOut({ scope: "local" });

    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("returns a new client per call, each reading only its own storage", async () => {
    const storageA = createMemoryStorage();
    const storageB = createMemoryStorage();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    storageA.map.set(STORAGE_KEY, JSON.stringify(makeSession("token-a", expiresAt)));
    const opts = { url: PROJECT_URL, anonKey: ANON_KEY };

    const clientA = trackClient(createMarkMeClient({ ...opts, storage: storageA.storage }));
    const clientB = trackClient(createMarkMeClient({ ...opts, storage: storageB.storage }));

    expect(clientA).not.toBe(clientB);
    expect((await clientA.auth.getSession()).data.session?.access_token).toBe("token-a");
    expect((await clientB.auth.getSession()).data.session).toBeNull();
  });
});
