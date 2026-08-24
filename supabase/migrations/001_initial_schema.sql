-- ============================================================
-- Dr. Arshadha Appointment System - Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES TABLE (linked to auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for username lookups (login)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================================
-- 2. SERVICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  consultation_fee INTEGER NOT NULL DEFAULT 500,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. DOCTORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  specialty TEXT,
  bio TEXT,
  qualifications TEXT,
  consultation_fee INTEGER DEFAULT 500,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. DOCTOR SCHEDULES (overrides per date)
-- ============================================================
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON doctor_schedules(schedule_date);

-- ============================================================
-- 5. BLOCKED SLOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocked_date DATE NOT NULL,
  blocked_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_date ON blocked_slots(blocked_date);

-- ============================================================
-- 6. CLINIC HOLIDAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holiday_date DATE UNIQUE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. APPOINTMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show')),
  consultation_type TEXT DEFAULT 'in_person' CHECK (consultation_type IN ('in_person', 'online', 'follow_up')),
  patient_notes TEXT,
  admin_notes TEXT,
  payment_status TEXT DEFAULT 'not_required' CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed', 'refunded', 'pay_at_clinic')),
  consultation_fee INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appt_payment_status ON appointments(payment_status);

-- CRITICAL: Prevent double-booking with a unique partial index
-- Only one active (non-cancelled) appointment per date + time slot
-- This works regardless of whether doctor_id is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot
  ON appointments(appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'no_show');

-- Also add a function to safely book with concurrency check
CREATE OR REPLACE FUNCTION book_appointment(
  p_patient_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_duration_minutes INTEGER,
  p_consultation_type TEXT,
  p_patient_notes TEXT,
  p_payment_status TEXT,
  p_consultation_fee INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_appointment_id UUID;
BEGIN
  -- Check if slot is already booked
  IF EXISTS (
    SELECT 1 FROM appointments
    WHERE appointment_date = p_appointment_date
      AND appointment_time = p_appointment_time
      AND status NOT IN ('cancelled', 'no_show')
  ) THEN
    RETURN jsonb_build_object('error', 'This time slot is no longer available.');
  END IF;

  -- Insert the appointment
  INSERT INTO appointments (
    patient_id, service_id, appointment_date, appointment_time,
    duration_minutes, consultation_type, patient_notes,
    status, payment_status, consultation_fee,
    start_at, end_at
  ) VALUES (
    p_patient_id, p_service_id, p_appointment_date, p_appointment_time,
    p_duration_minutes, p_consultation_type, p_patient_notes,
    'pending', p_payment_status, p_consultation_fee,
    (p_appointment_date + p_appointment_time)::timestamptz,
    (p_appointment_date + p_appointment_time + (p_duration_minutes || ' minutes')::interval)::timestamptz
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  provider TEXT,
  provider_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(appointment_id);

-- ============================================================
-- 9. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. CLINIC SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clinic_settings_updated_at BEFORE UPDATE ON clinic_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, email, phone, whatsapp_number, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', ''),
    'patient'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Helper function to check if current user is doctor or admin without RLS recursion
CREATE OR REPLACE FUNCTION public.is_doctor_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('doctor', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- Everyone can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (limited fields enforced in app)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Doctor/Admin can read all profiles
CREATE POLICY "Doctors can read all profiles"
  ON profiles FOR SELECT
  USING (public.is_doctor_or_admin());

-- Doctor/Admin can update any profile
CREATE POLICY "Doctors can update profiles"
  ON profiles FOR UPDATE
  USING (public.is_doctor_or_admin());

-- ============================================================
-- SERVICES POLICIES
-- ============================================================

-- Anyone can read active services
CREATE POLICY "Anyone can read active services"
  ON services FOR SELECT
  USING (is_active = true);

-- Doctor/Admin can manage services
CREATE POLICY "Doctors can manage services"
  ON services FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- DOCTORS POLICIES
-- ============================================================

-- Anyone can read active doctors
CREATE POLICY "Anyone can read active doctors"
  ON doctors FOR SELECT
  USING (is_active = true);

-- Doctor/Admin can manage
CREATE POLICY "Doctors can manage doctors"
  ON doctors FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- DOCTOR SCHEDULES POLICIES
-- ============================================================

-- Anyone can read schedules
CREATE POLICY "Anyone can read schedules"
  ON doctor_schedules FOR SELECT
  USING (true);

-- Doctor/Admin can manage
CREATE POLICY "Doctors can manage schedules"
  ON doctor_schedules FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- BLOCKED SLOTS POLICIES
-- ============================================================

-- Anyone can read blocked slots
CREATE POLICY "Anyone can read blocked slots"
  ON blocked_slots FOR SELECT
  USING (true);

-- Doctor/Admin can manage
CREATE POLICY "Doctors can manage blocked slots"
  ON blocked_slots FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- CLINIC HOLIDAYS POLICIES
-- ============================================================

-- Anyone can read holidays
CREATE POLICY "Anyone can read holidays"
  ON clinic_holidays FOR SELECT
  USING (true);

-- Doctor/Admin can manage
CREATE POLICY "Doctors can manage holidays"
  ON clinic_holidays FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- APPOINTMENTS POLICIES
-- ============================================================

-- Patients can read their own appointments
CREATE POLICY "Patients can read own appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = patient_id);

-- Patients can create their own appointments
CREATE POLICY "Patients can create own appointments"
  ON appointments FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Patients can cancel their own appointments (pending or confirmed)
CREATE POLICY "Patients can update own appointments"
  ON appointments FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

-- Doctor/Admin can read all appointments
CREATE POLICY "Doctors can read all appointments"
  ON appointments FOR SELECT
  USING (public.is_doctor_or_admin());

-- Doctor/Admin can manage all appointments
CREATE POLICY "Doctors can manage all appointments"
  ON appointments FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- PAYMENTS POLICIES
-- ============================================================

-- Patients can read their own payments
CREATE POLICY "Patients can read own payments"
  ON payments FOR SELECT
  USING (auth.uid() = patient_id);

-- Doctor/Admin can read all payments
CREATE POLICY "Doctors can read all payments"
  ON payments FOR SELECT
  USING (public.is_doctor_or_admin());

-- Doctor/Admin can manage payments
CREATE POLICY "Doctors can manage payments"
  ON payments FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- NOTIFICATIONS POLICIES
-- ============================================================

-- Users can read notifications sent to them
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = recipient_id);

-- Doctor/Admin can read all notifications
CREATE POLICY "Doctors can read all notifications"
  ON notifications FOR SELECT
  USING (public.is_doctor_or_admin());

-- System can insert notifications (via Edge Functions with service role)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- CLINIC SETTINGS POLICIES
-- ============================================================

-- Doctor/Admin can manage settings
CREATE POLICY "Doctors can manage settings"
  ON clinic_settings FOR ALL
  USING (public.is_doctor_or_admin());

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert default services
INSERT INTO services (name, description, duration_minutes, consultation_fee, is_active, sort_order) VALUES
  ('General Consultation', 'Comprehensive health assessment and treatment', 30, 500, true, 1),
  ('Follow-up Consultation', 'Continued care and monitoring visit', 20, 300, true, 2),
  ('Health Checkup', 'Complete wellness evaluation with screenings', 45, 1000, true, 3),
  ('Online Consultation', 'Virtual consultation via video call', 30, 400, true, 4),
  ('Preventive Care', 'Proactive health management and screenings', 30, 500, true, 5),
  ('Emergency Consultation', 'Urgent care for acute health concerns', 30, 800, true, 6)
ON CONFLICT DO NOTHING;

-- Insert default clinic settings
INSERT INTO clinic_settings (setting_key, setting_value) VALUES
  ('working_days', '["mon","tue","wed","thu","fri","sat"]'::jsonb),
  ('start_time', '"09:00"'::jsonb),
  ('end_time', '"17:00"'::jsonb),
  ('slot_duration', '30'::jsonb),
  ('break_start', '"13:00"'::jsonb),
  ('break_end', '"13:30"'::jsonb),
  ('currency', '"INR"'::jsonb),
  ('timezone', '"Asia/Kolkata"'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
