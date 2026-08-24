-- Allow guest patient profile creation (no auth required)
-- This enables the "no login required" booking flow for patients
CREATE POLICY "Guests can create patient profiles"
  ON profiles FOR INSERT
  WITH CHECK (role = 'patient');
