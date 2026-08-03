const STORAGE_KEYS = {
  url: 'alberlet_supabase_url',
  key: 'alberlet_supabase_anon_key',
};

export function getSupabaseConfig() {
  return {
    url: localStorage.getItem(STORAGE_KEYS.url) || '',
    anonKey: localStorage.getItem(STORAGE_KEYS.key) || '',
  };
}

export function setSupabaseConfig(url, anonKey) {
  localStorage.setItem(STORAGE_KEYS.url, url.trim());
  localStorage.setItem(STORAGE_KEYS.key, anonKey.trim());
}

export function clearSupabaseConfig() {
  localStorage.removeItem(STORAGE_KEYS.url);
  localStorage.removeItem(STORAGE_KEYS.key);
}

export function hasSupabaseConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

let supabaseClient = null;

export async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey) {
    throw new Error('A Supabase kapcsolat nincs beállítva.');
  }

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

export async function resetSupabaseClient() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  supabaseClient = null;
}
