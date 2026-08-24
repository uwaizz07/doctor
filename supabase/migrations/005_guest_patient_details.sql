-- ============================================================
-- Store guest patient details directly on the appointment row
-- Guest bookings have no profiles row (patient_id is NULL),
-- so the name/phone captured in the booking form must be kept
-- on appointments itself for the admin panel to display.
-- ============================================================

-- 1. Guests book without a profile row
ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;

-- 2. Columns holding the guest's entered details
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_phone TEXT;

-- 3. book_appointment: accept + persist guest details
CREATE OR REPLACE FUNCTION book_appointment(
  p_patient_id UUID,
  p_service_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_duration_minutes INTEGER,
  p_consultation_type TEXT,
  p_patient_notes TEXT,
  p_payment_status TEXT,
  p_consultation_fee INTEGER,
  p_patient_name TEXT DEFAULT NULL,
  p_patient_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_appointment_id UUID;
  v_token_number INTEGER;
BEGIN
  -- Next sequential token for the day (restarts daily).
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_token_number
  FROM appointments
  WHERE appointment_date = p_appointment_date
    AND status NOT IN ('cancelled', 'no_show');

  INSERT INTO appointments (
    patient_id, service_id, appointment_date, appointment_time,
    duration_minutes, consultation_type, patient_notes,
    status, payment_status, consultation_fee,
    start_at, end_at, token_number,
    patient_name, patient_phone
  ) VALUES (
    p_patient_id, p_service_id, p_appointment_date, p_appointment_time,
    p_duration_minutes, p_consultation_type, p_patient_notes,
    'pending', p_payment_status, p_consultation_fee,
    (p_appointment_date + p_appointment_time)::timestamptz,
    (p_appointment_date + p_appointment_time + (p_duration_minutes || ' minutes')::interval)::timestamptz,
    v_token_number,
    p_patient_name, p_patient_phone
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'token_number', v_token_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
