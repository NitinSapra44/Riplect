import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let supabaseConfigured = false;
let googleOAuthClientId: string | null = null;
let initPromise: Promise<void> | null = null;

async function initSupabase(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/config/supabase', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn('Failed to fetch Supabase configuration');
        return;
      }
      
      const config = await response.json();
      
      if (typeof config.googleOAuthClientId === 'string' && config.googleOAuthClientId.length > 0) {
        googleOAuthClientId = config.googleOAuthClientId;
      }

      if (config.url && config.anonKey) {
        supabaseClient = createClient(config.url, config.anonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          }
        });
        supabaseConfigured = true;
      } else {
        console.warn('Supabase credentials not configured. Authentication features will not work.');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn('Failed to initialize Supabase:', error);
    }
  })();
  
  return initPromise;
}

/**
 * Returns the public Google OAuth client ID exposed by `/api/config/supabase`,
 * waiting for the initial config fetch to complete first. Returns `null` when
 * Google sign-in is not configured on this server.
 */
export async function getGoogleOAuthClientId(): Promise<string | null> {
  // Use initSupabase() (not the bare `initPromise` variable) so this works
  // even if the consumer imports `getGoogleOAuthClientId` before `initSupabase`
  // has had a chance to run — same pattern as `waitForSupabase()`.
  await initSupabase();
  return googleOAuthClientId;
}

initSupabase();

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!supabaseClient) {
      throw new Error('Supabase client not initialized');
    }
    return (supabaseClient as any)[prop];
  }
});

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfigured;
}

export async function waitForSupabase(): Promise<SupabaseClient | null> {
  await initSupabase();
  return supabaseClient;
}

/**
 * Robust sign-out helper.
 *
 * Calls Supabase signOut with scope 'local' (clears localStorage immediately
 * and notifies listeners — no network round-trip required), then explicitly
 * deletes any leftover `sb-*-auth-token*` entries from localStorage and
 * sessionStorage. This prevents a stale session from being restored after a
 * hard navigation if the network-bound default signOut is interrupted.
 */
export async function signOutCompletely(): Promise<void> {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut({ scope: 'local' });
    }
  } catch (e) {
    console.error('Supabase local signOut error:', e);
  }
  try {
    const purge = (storage: Storage) => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith('sb-') && k.includes('-auth-token')) {
          keys.push(k);
        }
      }
      keys.forEach((k) => storage.removeItem(k));
    };
    purge(window.localStorage);
    purge(window.sessionStorage);
  } catch (e) {
    console.error('Storage purge error:', e);
  }
}
