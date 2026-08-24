import { supabase, getProfile } from './supabase.js';

export async function registerUser({ fullName, username, email, phone, whatsapp, password }) {
  const cleanUsername = username.toLowerCase().trim();

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (existing) {
    return { error: 'Username is already taken. Please choose another.' };
  }

  const { data, error: authError } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        username: cleanUsername,
        phone: phone.trim(),
        whatsapp_number: whatsapp.trim()
      }
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { error: 'An account with this email already exists.' };
    }
    return { error: authError.message };
  }

  if (data.user && !data.session) {
    return { success: true, message: 'Registration successful! Please check your email to verify your account.' };
  }

  return { success: true, user: data.user, session: data.session };
}

export async function loginUser(email, password) {
  const cleanEmail = email.toLowerCase().trim();

  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password
  });

  if (authError) {
    return { error: authError.message };
  }

  return { success: true, user: data.user, session: data.session };
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Logout error:', error);
  window.location.href = '/login.html';
}

export async function updateProfile(userId, updates) {
  const allowedFields = ['full_name', 'phone', 'whatsapp_number'];
  const safeUpdates = {};

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      safeUpdates[key] = updates[key];
    }
  }

  safeUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update(safeUpdates)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, profile: data };
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { success: true };
}

export function initAuthStateListener(callback) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const profile = await getProfile(session.user.id);
      callback(session.user, profile);
    } else {
      callback(null, null);
    }
  });
}
