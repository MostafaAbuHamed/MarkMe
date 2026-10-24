# Contract: client factory (`@markme/domain/client`)

Covers FR-004.

```ts
export interface CreateMarkMeClientOptions {
  url: string;
  publishableKey: string; // was: anonKey
  storage: AuthStorage;
  detectSessionInUrl?: boolean; // default false
}

export function createMarkMeClient(options: CreateMarkMeClientOptions): MarkMeClient;
```

- Calls `createClient<Database>(url, publishableKey, { auth: { storage, flowType: "pkce",
autoRefreshToken: true, persistSession: true, detectSessionInUrl } })`, exactly as before.
- No `anonKey` alias. The factory does not validate the key's shape (each app's env schema does).
- Existing tests keep their assertions; only the option name and fixture value change (fixture
  becomes a `sb_publishable_…`-shaped string).
