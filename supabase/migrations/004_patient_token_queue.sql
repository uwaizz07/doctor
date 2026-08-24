-- ============================================================
-- Daily patient tokens + public queue status
-- Booking is fully queue/token-based:
--   - Multiple patients CAN book the same doctor/date/time.
--   - No slot availability check is performed.
--   - Every new appointment gets the next sequential token_number,
--     restarting at 1 each day (per doctor; single-doctor clinic).
-- ============================================================

-- 1. Daily token number column (sequential across the day)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS token_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_appt_token ON appointments(appointment_date, token_number);

-- 2. Backfill tokens for existing appointments (per day, ordered by time then creation)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY appointment_date
      ORDER BY appointment_time ASC, created_at ASC
    ) AS rn
  FROM appointments
  WHERE status NOT IN ('cancelled', 'no_show')
)
UPDATE appointments a
SET token_number = ranked.rn
FROM ranked
WHERE a.id = ranked.id AND a.token_number IS NULL;

-- 3. book_appointment: no slot-conflict check, assigns next daily token
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
  v_appointment_id UUID;
  v_token_number INTEGER;
BEGIN
  -- Next sequential token for the day (restarts daily).
  -- Single-doctor clinic: all rows share one daily sequence.
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_token_number
  FROM appointments
  WHERE appointment_date = p_appointment_date
    AND status NOT IN ('cancelled', 'no_show');

  INSERT INTO appointments (
    patient_id, service_id, appointment_date, appointment_time,
    duration_minutes, consultation_type, patient_notes,
    status, payment_status, consultation_fee,
    start_at, end_at, token_number
  ) VALUES (
    p_patient_id, p_service_id, p_appointment_date, p_appointment_time,
    p_duration_minutes, p_consultation_type, p_patient_notes,
    'pending', p_payment_status, p_consultation_fee,
    (p_appointment_date + p_appointment_time)::timestamptz,
    (p_appointment_date + p_appointment_time + (p_duration_minutes || ' minutes')::interval)::timestamptz,
    v_token_number
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'token_number', v_token_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Public queue status lookup (works for guests - keyed by unguessable appointment id)
-- Returns ONLY what a patient needs:
--   - their token number
--   - how many tokens the doctor has already attended today
--   - how many patients are ahead of them
--   - the token currently being served
CREATE OR REPLACE FUNCTION get_patient_queue_status(
  p_appointment_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_appt appointments%ROWTYPE;
  v_attended INTEGER;
  v_ahead INTEGER;
  v_serving INTEGER;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Appointment not found. Check your reference ID.');
  END IF;

  -- Tokens attended by the doctor that day (completed appointments)
  SELECT COUNT(*) INTO v_attended
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status = 'completed';

  -- Active appointments earlier in the day not yet attended
  SELECT COUNT(*) INTO v_ahead
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status IN ('pending', 'confirmed')
    AND token_number < v_appt.token_number;

  -- Token currently being served: lowest active token of the day
  SELECT MIN(token_number) INTO v_serving
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status IN ('pending', 'confirmed');

  RETURN jsonb_build_object(
    'success', true,
    'token_number', v_appt.token_number,
    'attended_count', v_attended,
    'ahead_count', v_ahead,
    'current_serving_token', v_serving,
    'status', v_appt.status,
    'appointment_date', v_appt.appointment_date,
    'appointment_time', v_appt.appointment_time,
    'consultation_type', v_appt.consultation_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
