const FIXED_SUPABASE_CONFIG = {
  url: 'https://supabase.torokhomelab.cloud',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2MDg4NjEyLCJleHAiOjE5NDM3Njg2MTJ9.jhDyUd8Ah3Yx8FiqQ3IQQ0DXAr1hMANW1Aao4SwwQAI',
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
