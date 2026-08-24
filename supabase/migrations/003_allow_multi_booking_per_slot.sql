-- ============================================================
-- Allow multiple patients to book the same doctor/date/time
-- Booking is queue/token-based, not slot-exclusive.
-- Each patient receives a sequential daily token_number
-- (see 004_patient_token_queue.sql).
-- ============================================================

-- 1. Drop the unique partial index that prevented double-booking
DROP INDEX IF EXISTS idx_unique_active_slot;
