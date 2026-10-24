import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@markme/database";

export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface CreateMarkMeClientOptions {
  url: string;
  publishableKey: string;
  storage: AuthStorage;
  detectSessionInUrl?: boolean;
}

export type MarkMeClient = SupabaseClient<Database>;

export function createMarkMeClient({
  url,
  publishableKey,
  storage,
  detectSessionInUrl = false,
}: CreateMarkMeClientOptions): MarkMeClient {
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage,
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl,
    },
  });
}
