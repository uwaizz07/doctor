-- ============================================================
-- Session-aware token numbering
-- Morning session (10:00-14:00) tokens start from 1
-- Evening session (17:00-21:00) tokens start from 1
-- ============================================================

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
  v_hour INTEGER;
  v_session_start TIME;
  v_session_end TIME;
BEGIN
  v_hour := EXTRACT(HOUR FROM p_appointment_time)::INTEGER;

  IF v_hour >= 10 AND v_hour < 14 THEN
    v_session_start := '10:00';
    v_session_end := '14:00';
  ELSE
    v_session_start := '17:00';
    v_session_end := '21:00';
  END IF;

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_token_number
  FROM appointments
  WHERE appointment_date = p_appointment_date
    AND appointment_time >= v_session_start
    AND appointment_time < v_session_end
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
