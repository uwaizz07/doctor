import { createClient } from '@supabase/supabase-js';

const URL = 'https://sqsruehfhcuyusevfogf.supabase.co';
const KEY = 'sb_publishable_Wm6g61Fc4y9ZLqWxb4iwKA_krDS-lU2';

const supabase = createClient(URL, KEY);

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'uwaizz07@gmail.com',
  password: '1234567890'
});

if (error) {
  console.error('SIGN-IN FAILED:', error.message);
  process.exit(1);
}
console.log('SIGN-IN OK, user id:', data.user.id);

const { data: profile, error: pErr } = await supabase
  .from('profiles')
  .select('id, username, full_name, email, role')
  .eq('id', data.user.id)
  .maybeSingle();

if (pErr) {
  console.error('PROFILE FETCH ERROR:', pErr.message);
  process.exit(1);
}

console.log('PROFILE:', JSON.stringify(profile));

if (profile?.role === 'doctor' || profile?.role === 'admin') {
  console.log('PASS: login.html will redirect this account to /admin/index.html');
} else {
  console.log('FAIL: role is "' + profile?.role + '" - login will be rejected');
}

await supabase.auth.signOut();
