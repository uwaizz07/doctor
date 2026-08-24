-- ============================================================
-- Phone-number queue lookup + repair of reference-ID lookup
-- ============================================================
-- 1) The previously deployed get_patient_queue_status referenced a
--    nonexistent field ("queue_number") and required exact full UUIDs.
--    It is replaced here with a correct version that also accepts the
--    short codes shown on the booking confirmation screen.
-- 2) New get_patient_queue_by_phone lets patients check their live
--    queue using just the mobile number they booked with.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Reference-ID lookup (fixed)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_patient_queue_status(UUID);
DROP FUNCTION IF EXISTS public.get_patient_queue_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_patient_queue_status(
  p_appointment_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_input TEXT;
  v_appt appointments%ROWTYPE;
  v_attended INTEGER;
  v_ahead INTEGER;
  v_serving INTEGER;
BEGIN
  v_input := lower(btrim(COALESCE(p_appointment_id, '')));

  IF v_input ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_appt FROM appointments WHERE id = v_input::uuid;
  ELSIF v_input ~ '^[0-9a-f]{6,32}$' THEN
    -- Short code from the confirmation screen: resolve by prefix
    SELECT * INTO v_appt
    FROM appointments
    WHERE id::text LIKE v_input || '%'
    ORDER BY id
    LIMIT 1;
  ELSE
    RETURN jsonb_build_object('error', 'Invalid reference ID.');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Appointment not found. Check your reference ID.');
  END IF;

  SELECT COUNT(*) INTO v_attended
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status = 'completed';

  SELECT COUNT(*) INTO v_ahead
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status IN ('pending', 'confirmed')
    AND token_number < v_appt.token_number;

  SELECT MIN(token_number) INTO v_serving
  FROM appointments
  WHERE appointment_date = v_appt.appointment_date
    AND status IN ('pending', 'confirmed');

  RETURN jsonb_build_object(
    'success', true,
    'token_number', v_appt.token_number,
    'status', v_appt.status,
    'attended_count', v_attended,
    'ahead_count', v_ahead,
    'current_serving_token', v_serving,
    'appointment_date', v_appt.appointment_date,
    'appointment_time', v_appt.appointment_time,
    'consultation_type', v_appt.consultation_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. Phone-number lookup (today's queue)
-- Matches guest bookings (appointments.patient_phone) and
-- registered accounts (profiles.phone via patient_id).
-- Phones are normalized to their last 10 digits.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_patient_queue_by_phone(
  p_phone TEXT,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
  v_digits TEXT;
  v_day DATE := COALESCE(p_date, CURRENT_DATE);
  r RECORD;
  v_attended INTEGER;
  v_ahead INTEGER;
  v_serving INTEGER;
  v_list JSONB := '[]'::jsonb;
  v_next RECORD;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_digits) > 10 THEN
    v_digits := right(v_digits, 10);
  END IF;
  IF length(v_digits) <> 10 THEN
    RETURN jsonb_build_object('error', 'Please enter a valid 10-digit mobile number.');
  END IF;

  FOR r IN
    SELECT a.id, a.token_number, a.status, a.appointment_date, a.appointment_time
    FROM appointments a
    LEFT JOIN profiles pr ON pr.id = a.patient_id
    WHERE a.appointment_date = v_day
      AND a.status IN ('pending', 'confirmed', 'completed')
      AND (
        right(regexp_replace(COALESCE(a.patient_phone, ''), '[^0-9]', '', 'g'), 10) = v_digits
        OR right(regexp_replace(COALESCE(pr.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits
      )
    ORDER BY a.token_number
  LOOP
    SELECT COUNT(*) INTO v_attended
    FROM appointments
    WHERE appointment_date = r.appointment_date
      AND status = 'completed';

    SELECT COUNT(*) INTO v_ahead
    FROM appointments
    WHERE appointment_date = r.appointment_date
      AND status IN ('pending', 'confirmed')
      AND token_number < r.token_number;

    SELECT MIN(token_number) INTO v_serving
    FROM appointments
    WHERE appointment_date = r.appointment_date
      AND status IN ('pending', 'confirmed');

    v_list := v_list || jsonb_build_object(
      'id', r.id,
      'token_number', r.token_number,
      'status', r.status,
      'attended_count', v_attended,
      'ahead_count', v_ahead,
      'current_serving_token', v_serving,
      'appointment_date', r.appointment_date,
      'appointment_time', r.appointment_time
    );
  END LOOP;

  IF jsonb_array_length(v_list) > 0 THEN
    RETURN jsonb_build_object('success', true, 'appointments', v_list);
  END IF;

  -- Nothing today: point them to their nearest upcoming booking, if any
  SELECT a.appointment_date, a.appointment_time, a.token_number INTO v_next
  FROM appointments a
  LEFT JOIN profiles pr ON pr.id = a.patient_id
  WHERE a.appointment_date > v_day
    AND a.status IN ('pending', 'confirmed')
    AND (
      right(regexp_replace(COALESCE(a.patient_phone, ''), '[^0-9]', '', 'g'), 10) = v_digits
      OR right(regexp_replace(COALESCE(pr.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits
    )
  ORDER BY a.appointment_date, a.appointment_time
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'appointments', '[]'::jsonb,
      'next', jsonb_build_object(
        'appointment_date', v_next.appointment_date,
        'appointment_time', v_next.appointment_time,
        'token_number', v_next.token_number
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'appointments', '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
