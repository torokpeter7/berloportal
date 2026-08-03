import { getSupabaseClient } from '../config/supabase.js';
import { showToast } from './utils.js';

export async function getSession() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function getCurrentProfile() {
  const supabase = await getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, apartment_id, is_active, avatar_url, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createCurrentProfile(user) {
  const supabase = await getSupabaseClient();
  const metadata = user?.user_metadata || {};
  const email = user?.email || '';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email,
      full_name: metadata.full_name || email.split('@')[0] || 'Felhasználó',
      phone: metadata.phone || null,
      role: 'tenant',
      is_active: true,
    })
    .select('id, email, full_name, phone, role, apartment_id, is_active, avatar_url, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword({ email, password, fullName, phone, role = 'tenant' }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        role,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function updateCurrentUser({ email, password, metadata = {} }) {
  const supabase = await getSupabaseClient();
  const payload = {};

  if (email) payload.email = email;
  if (password) payload.password = password;
  if (Object.keys(metadata).length > 0) payload.data = metadata;

  const { data, error } = await supabase.auth.updateUser(payload);
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = './login.html';
    return null;
  }
  return session;
}

export async function requireActiveProfile() {
  const supabase = await getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    await signOut();
    window.location.href = './login.html';
    return null;
  }

  let profile = await getCurrentProfile();
  if (!profile) {
    profile = await createCurrentProfile(user);
  }

  if (!profile) {
    await signOut();
    showToast('A felhasználói profil nem érhető el.', 'error');
    window.location.href = './login.html';
    return null;
  }

  if (!profile.is_active) {
    await signOut();
    showToast('A fiók inaktív.', 'warning');
    window.location.href = './login.html';
    return null;
  }

  return profile;
}

export function isAdmin(profile) {
  return profile?.role === 'admin';
}

export function isTenant(profile) {
  return profile?.role === 'tenant';
}
