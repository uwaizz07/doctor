import { supabase } from './supabase.js';
import { clinicConfig } from './config.js';
import { formatTime } from './ui.js';

export const defaultServices = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'General Consultation', description: 'Comprehensive health assessment and treatment', duration_minutes: 30, consultation_fee: 500, is_active: true, sort_order: 1 },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Follow-up Consultation', description: 'Continued care and monitoring visit', duration_minutes: 20, consultation_fee: 300, is_active: true, sort_order: 2 },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Health Checkup', description: 'Complete wellness evaluation with screenings', duration_minutes: 45, consultation_fee: 1000, is_active: true, sort_order: 3 },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Online Consultation', description: 'Virtual consultation via video call', duration_minutes: 30, consultation_fee: 400, is_active: true, sort_order: 4 },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Preventive Care', description: 'Proactive health management and screenings', duration_minutes: 30, consultation_fee: 500, is_active: true, sort_order: 5 },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Emergency Consultation', description: 'Urgent care for acute health concerns', duration_minutes: 30, consultation_fee: 800, is_active: true, sort_order: 6 }
];

export async function getServices() {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      console.warn('Could not fetch services from database, using fallback:', error);
      return defaultServices;
    }
    if (data && data.length > 0) return data;
    return defaultServices;
  } catch (e) {
    console.warn('Error loading services, using fallback:', e);
    return defaultServices;
  }
}

export async function getAvailableSlots(date, serviceId) {
  let existingAppointments = [];
  try {
    const { data, error: apptError } = await supabase
      .from('appointments')
      .select('appointment_time, duration_minutes')
      .eq('appointment_date', date)
      .neq('status', 'cancelled')
      .neq('status', 'no_show');

    if (!apptError && data) {
      existingAppointments = data;
    }
  } catch (e) {
    console.warn('Error fetching appointments for availability:', e);
  }

  const { data: blockedSlots } = await supabase
    .from('blocked_slots')
    .select('blocked_time, duration_minutes')
    .eq('blocked_date', date);

  const { data: holidays } = await supabase
    .from('clinic_holidays')
    .select('holiday_date')
    .eq('holiday_date', date)
    .maybeSingle();

  if (holidays) return [];

  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  if (!clinicConfig.schedule.workingDays.includes(dayOfWeek)) return [];

  const duration = clinicConfig.schedule.slotDuration;

  const { data: specialSchedule } = await supabase
    .from('doctor_schedules')
    .select('start_time, end_time')
    .eq('schedule_date', date)
    .maybeSingle();

  let sessions = clinicConfig.schedule.sessions;
  if (specialSchedule) {
    sessions = [{ label: "Default", startTime: specialSchedule.start_time, endTime: specialSchedule.end_time }];
  }

  const allSlots = [];
  for (const session of sessions) {
    const sessionSlots = generateTimeSlots(session.startTime, session.endTime, duration);
    sessionSlots.forEach(s => allSlots.push({ ...s, session: session.label }));
  }

  const bookedCounts = {};
  (existingAppointments || []).forEach(a => {
    const t = a.appointment_time?.substring(0, 5);
    if (t) bookedCounts[t] = (bookedCounts[t] || 0) + 1;
  });

  const blockedTimes = new Set();
  (blockedSlots || []).forEach(b => {
    const bStart = b.blocked_time?.substring(0, 5);
    if (bStart) blockedTimes.add(bStart);
  });

  const now = new Date();
  const isToday = date === now.toISOString().split('T')[0];

  return allSlots.filter(slot => {
    if (blockedTimes.has(slot.value)) return false;
    if (isToday) {
      const [h, m] = slot.value.split(':').map(Number);
      const slotDate = new Date();
      slotDate.setHours(h, m, 0, 0);
      if (slotDate <= now) return false;
    }
    return true;
  }).map(slot => ({
    ...slot,
    bookedCount: bookedCounts[slot.value] || 0
  }));
}

function generateTimeSlots(startTime, endTime, durationMinutes) {
  const slots = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + durationMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    slots.push({
      value: timeStr,
      label: formatTime(timeStr)
    });
    currentMinutes += durationMinutes;
  }

  return slots;
}

export function getMinBookingDate() {
  return new Date().toISOString().split('T')[0];
}

export function getMaxBookingDate() {
  const max = new Date();
  max.setDate(max.getDate() + 30);
  return max.toISOString().split('T')[0];
}

export function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

export function isPastDate(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr < today;
}
