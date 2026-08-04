const FIXED_SUPABASE_CONFIG = {
  url: 'https://ptlultrfkipwkrnwzaro.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0bHVsdHJma2lwd2tybnd6YXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NDE4ODIsImV4cCI6MjEwMTMxNzg4Mn0.0E7CjiyKIx6bVpaN-bQBqQklcjSZPTrb5S1NwUtOa04',
};

export function getSupabaseConfig() {
  return FIXED_SUPABASE_CONFIG;
}

export function setSupabaseConfig(url, anonKey) {
  localStorage.setItem(FIXED_SUPABASE_CONFIG.url, url.trim());
  localStorage.setItem(FIXED_SUPABASE_CONFIG.key, anonKey.trim());
}

export function clearSupabaseConfig() {
  localStorage.removeItem(FIXED_SUPABASE_CONFIG.url);
  localStorage.removeItem(FIXED_SUPABASE_CONFIG.key);
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
