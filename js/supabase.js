import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 'https://sqsruehfhcuyusevfogf.supabase.co';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || 'sb_publishable_Wm6g61Fc4y9ZLqWxb4iwKA_krDS-lU2';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.user;
}

export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) return data;
  } catch (e) {
    console.warn('Could not fetch profile from DB:', e);
  }

  // Fallback to current user metadata if DB query fails or profile row does not exist yet
  try {
    const user = await getCurrentUser();
    if (user && user.id === userId) {
      const fallbackProfile = {
        id: user.id,
        email: user.email,
        username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.substring(0, 8)}`,
        full_name: user.user_metadata?.full_name || 'Patient',
        phone: user.user_metadata?.phone || '',
        whatsapp_number: user.user_metadata?.whatsapp_number || user.user_metadata?.phone || '',
        role: user.user_metadata?.role || 'patient',
        created_at: user.created_at || new Date().toISOString()
      };

      // Try to auto-create profile record in database to satisfy foreign keys
      try {
        await supabase.from('profiles').upsert(fallbackProfile, { onConflict: 'id' });
      } catch (err) {
        // ignore
      }

      return fallbackProfile;
    }
  } catch (e) {
    console.warn('Error constructing fallback profile:', e);
  }

  return null;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return await getProfile(user.id);
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html')) {
    if (!user && !window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('index.html')) {
      window.location.href = '/login.html';
      return null;
    }
  }
  return user;
}

export async function requireRole(role) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== role) {
    window.location.href = '/login.html';
    return null;
  }
  return profile;
}
