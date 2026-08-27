import { supabase, getCurrentUser, getCurrentProfile } from "./supabase.js";
import { clinicConfig } from "./config.js";
import { defaultServices } from "./availability.js";

export async function createAppointment({
  serviceId,
  appointmentDate,
  appointmentTime,
  patientName,
  patientPhone,
  consultationType,
  patientNotes,
  paymentMethod,
}) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (e) {
    // Guest booking - no user logged in
  }

  let patientId = null;
  let profile = null;

  if (user) {
    profile = await getCurrentProfile();
    patientId = user.id;
  } else {
    // Guest booking: no authenticated Supabase user
    patientId = null;

    profile = {
      id: null,
      full_name: patientName || "Patient",
      phone: patientPhone || "",
      role: "patient",
      username: null,
    };
  }

  if (isSunday(appointmentDate)) {
    return {
      error: "The clinic is closed on Sundays. Please select another date.",
    };
  }

  if (isPastDate(appointmentDate)) {
    return { error: "Cannot book appointments in the past." };
  }

  let service = null;
  let isDbService = false;
  try {
    const { data: dbService } = await supabase
      .from("services")
      .select("id, name, duration_minutes, consultation_fee")
      .eq("id", serviceId)
      .maybeSingle();

    if (dbService) {
      service = dbService;
      isDbService = true;
    }
  } catch (e) {
    console.warn("Could not query service from database:", e);
  }

  if (!service) {
    service =
      defaultServices.find((s) => s.id === serviceId) || defaultServices[0];
  }

  const duration =
    service.duration_minutes || clinicConfig.schedule.slotDuration;
  const paymentStatus =
    paymentMethod === "online"
      ? "pending"
      : paymentMethod === "clinic"
        ? "pay_at_clinic"
        : "not_required";
  const consultationFee =
    service.consultation_fee || clinicConfig.payment.consultationFee;
  const formattedTime =
    appointmentTime.length === 5 ? appointmentTime + ":00" : appointmentTime;

  let apptId = null;
  let tokenNumber = null;
  try {
    const { data, error } = await supabase.rpc("book_appointment", {
      p_patient_id: patientId,
      p_service_id: isDbService ? serviceId : null,
      p_appointment_date: appointmentDate,
      p_appointment_time: formattedTime,
      p_duration_minutes: duration,
      p_consultation_type: consultationType || "in_person",
      p_patient_notes: patientNotes || "",
      p_payment_status: paymentStatus,
      p_consultation_fee: consultationFee,
      p_patient_name: patientId ? null : patientName || "Patient",
      p_patient_phone: patientId ? null : patientPhone || "",
    });

      if (error || data?.error) {
      if (data?.error) return { error: data.error };
      // Try direct insert fallback
      // Compute token_number (whole-day daily sequence) for fallback path
      const { data: existingTokens } = await supabase
        .from("appointments")
        .select("token_number")
        .eq("appointment_date", appointmentDate)
        .not("status", "in", '("cancelled","no_show")')
        .order("token_number", { ascending: false })
        .limit(1);
      tokenNumber = (existingTokens?.[0]?.token_number || 0) + 1;

      const { data: directData, error: insertError } = await supabase
        .from("appointments")
        .insert({
          patient_id: patientId,
          service_id: isDbService ? serviceId : null,
          appointment_date: appointmentDate,
          appointment_time: formattedTime,
          duration_minutes: duration,
          consultation_type: consultationType || "in_person",
          patient_notes: patientNotes || "",
          status: "pending",
          payment_status: paymentStatus,
          consultation_fee: consultationFee,
          start_at: new Date(
            `${appointmentDate}T${formattedTime}`,
          ).toISOString(),
          end_at: new Date(
            new Date(`${appointmentDate}T${formattedTime}`).getTime() +
              duration * 60000,
          ).toISOString(),
          token_number: tokenNumber,
          patient_name: patientId ? null : patientName || "Patient",
          patient_phone: patientId ? null : patientPhone || "",
        })
        .select()
        .single();

      if (insertError) {
        return {
          error:
            insertError.message ||
            "Failed to book appointment. Please try again.",
        };
      }
      apptId = directData?.id;
    } else {
      apptId = data?.appointment_id;
      tokenNumber = data?.token_number;
    }
  } catch (e) {
    return {
      error: e.message || "Failed to book appointment. Please try again.",
    };
  }

  let appointment = null;
  if (apptId) {
    const { data: appt } = await supabase
      .from("appointments")
      .select()
      .eq("id", apptId)
      .maybeSingle();
    appointment = appt;
    if (appointment && !appointment.token_number && tokenNumber) {
      appointment.token_number = tokenNumber;
    }
  }

  try {
    const { data: smsResult, error: smsError } =
      await supabase.functions.invoke("send-sms", {
        body: {
          type: "booking_created",
          appointmentId: apptId,
          patientPhone: patientPhone || "",
          patientName: patientName || "Patient",
          date: appointmentDate,
          time: appointmentTime,
          service: service.name,
          consultationType: consultationType || "in_person",
          patientNotes: patientNotes || "",
          paymentMethod: paymentMethod || "clinic",
        },
      });

    if (smsError) {
      console.error("SMS function error:", smsError);
    } else if (!smsResult?.success) {
      console.error("SMS sending failed:", JSON.stringify(smsResult, null, 2));
    } else {
      console.log("SMS sent successfully:", smsResult);
    }
  } catch (e) {
    console.error("SMS notification exception:", e);
  }
  return { success: true, appointment: appointment, tokenNumber: tokenNumber };
}

export async function getQueueStatus(appointmentId) {
  try {
    const { data, error } = await supabase.rpc("get_patient_queue_status", {
      p_appointment_id: appointmentId,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return data;
  } catch (e) {
    return { error: e.message || "Failed to load queue status." };
  }
}

export async function getQueueByPhone(phone) {
  try {
    const { data, error } = await supabase.rpc("get_patient_queue_by_phone", {
      p_phone: phone,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return data;
  } catch (e) {
    return { error: e.message || "Failed to load queue status." };
  }
}

export async function getAppointments(userId, status = null, upcoming = null) {
  try {
    let query = supabase
      .from("appointments")
      .select(
        `
        *,
        service:services(name)
      `,
      )
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (userId) query = query.eq("patient_id", userId);
    if (status) query = query.eq("status", status);

    const today = new Date().toISOString().split("T")[0];
    if (upcoming === true) {
      query = query.gte("appointment_date", today);
    } else if (upcoming === false) {
      query = query.lt("appointment_date", today);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(
        "Appointments query with join failed, falling back to simple select:",
        error,
      );
      let rawQuery = supabase
        .from("appointments")
        .select("*")
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });

      if (userId) rawQuery = rawQuery.eq("patient_id", userId);
      if (status) rawQuery = rawQuery.eq("status", status);
      if (upcoming === true) rawQuery = rawQuery.gte("appointment_date", today);
      else if (upcoming === false)
        rawQuery = rawQuery.lt("appointment_date", today);

      const { data: rawData, error: rawError } = await rawQuery;
      if (rawError) {
        console.warn("Raw appointments query error:", rawError);
        return [];
      }
      return rawData || [];
    }

    return data || [];
  } catch (e) {
    console.error("getAppointments exception:", e);
    return [];
  }
}

export async function getAppointmentById(appointmentId) {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
        *,
        service:services(name, description)
      `,
      )
      .eq("id", appointmentId)
      .maybeSingle();

    if (error) {
      const { data: raw } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .maybeSingle();
      return raw;
    }
    return data;
  } catch (e) {
    console.error("getAppointmentById exception:", e);
    return null;
  }
}

export async function updateAppointmentStatus(
  appointmentId,
  newStatus,
  adminNotes = "",
) {
  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select(
      "*, patient:profiles!appointments_patient_id_fkey(full_name, phone)",
    )
    .eq("id", appointmentId)
    .single();

  if (fetchError) return { error: "Appointment not found." };

  const updateData = { status: newStatus };
  if (adminNotes) updateData.admin_notes = adminNotes;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", appointmentId);

  if (error) return { error: "Failed to update appointment." };

  const smsType = {
    confirmed: "appointment_confirmed",
    cancelled: "appointment_cancelled",
    rescheduled: "appointment_rescheduled",
  };

  if (smsType[newStatus]) {
    try {
      const { data: service } = await supabase
        .from("services")
        .select("name")
        .eq("id", appointment.service_id)
        .maybeSingle();

      await supabase.functions.invoke("send-sms", {
        body: {
          type: smsType[newStatus],
          appointmentId: appointment.id,
          patientPhone: appointment.patient?.phone || appointment.patient_phone || "",
          patientName: appointment.patient?.full_name || appointment.patient_name || "Patient",
          date: appointment.appointment_date,
          time: appointment.appointment_time?.substring(0, 5),
          service: service?.name || "Consultation",
          consultationType: appointment.consultation_type,
          adminNotes: adminNotes,
        },
      });
    } catch (e) {
      console.warn("SMS notification failed:", e);
    }
  }

  return { success: true };
}

export async function cancelAppointment(appointmentId) {
  return updateAppointmentStatus(appointmentId, "cancelled");
}

export async function rescheduleAppointment(appointmentId, newDate, newTime) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) return { error: "Appointment not found." };

  const duration = appointment.duration_minutes || 30;
  const [h, m] = newTime.split(":").map(Number);
  const endMinutes = h * 60 + m + duration;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const updateData = {
    appointment_date: newDate,
    appointment_time: newTime + ":00",
    start_at: new Date(`${newDate}T${newTime}:00`).toISOString(),
    end_at: new Date(`${newDate}T${endTime}:00`).toISOString(),
    status: "rescheduled",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", appointmentId);

  if (error) return { error: "Failed to reschedule." };
  return { success: true };
}

export async function getTodayAppointments(doctorId = null) {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      service:services(name),
      patient:profiles!appointments_patient_id_fkey(full_name, phone)
    `,
    )
    .eq("appointment_date", today)
    .not("status", "eq", "cancelled")
    .order("appointment_time");

  if (error) throw new Error("Failed to load today's appointments");
  return data || [];
}

export async function getAppointmentStats() {
  const today = new Date().toISOString().split("T")[0];

  const [
    todayResult,
    pendingResult,
    confirmedResult,
    totalPatientsResult,
    revenueResult,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", today)
      .not("status", "eq", "cancelled"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed")
      .gte("appointment_date", today),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "patient"),
    supabase
      .from("appointments")
      .select("consultation_fee")
      .eq("payment_status", "paid"),
  ]);

  const totalRevenue = (revenueResult.data || []).reduce(
    (sum, a) => sum + (a.consultation_fee || 0),
    0,
  );

  return {
    todayAppointments: todayResult.count || 0,
    pendingAppointments: pendingResult.count || 0,
    confirmedAppointments: confirmedResult.count || 0,
    totalPatients: totalPatientsResult.count || 0,
    revenue: totalRevenue,
  };
}

function isSunday(dateStr) {
  return new Date(dateStr + "T00:00:00").getDay() === 0;
}

function isPastDate(dateStr) {
  const today = new Date().toISOString().split("T")[0];
  return dateStr < today;
}

function getSessionForTime(timeStr) {
  const hour = parseInt(timeStr.split(":")[0], 10);
  if (hour >= 10 && hour < 14) return "morning";
  if (hour >= 17 && hour < 21) return "evening";
  return "morning";
}

export async function addWalkinPatient(patientName, patientPhone) {
  if (!patientName || !patientName.trim()) {
    return { error: "Patient name is required." };
  }

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  let sessionStartMinutes, sessionEndMinutes;

  if (currentHour >= 10 && currentHour < 14) {
    sessionStartMinutes = 600;
    sessionEndMinutes = 840;
  } else if (currentHour >= 17 && currentHour < 21) {
    sessionStartMinutes = 1020;
    sessionEndMinutes = 1260;
  } else if (currentHour < 10) {
    sessionStartMinutes = 600;
    sessionEndMinutes = 840;
  } else if (currentHour >= 14 && currentHour < 17) {
    sessionStartMinutes = 1020;
    sessionEndMinutes = 1260;
  } else {
    return { error: "Clinic is closed. Morning: 10 AM - 1:30 PM, Evening: 5 PM - 8:30 PM." };
  }

  const sessionStart = `${String(Math.floor(sessionStartMinutes / 60)).padStart(2, "0")}:00:00`;
  const sessionEnd = `${String(Math.floor(sessionEndMinutes / 60)).padStart(2, "0")}:00:00`;

  let existingTimes = new Set();
  try {
    const { data } = await supabase
      .from("appointments")
      .select("appointment_time")
      .eq("appointment_date", today)
      .gte("appointment_time", sessionStart)
      .lt("appointment_time", sessionEnd)
      .not("status", "in", '("cancelled","no_show")');
    (data || []).forEach(a => {
      const t = a.appointment_time?.substring(0, 5);
      if (t) existingTimes.add(t);
    });
  } catch (e) {
    console.warn("Failed to fetch existing appointments:", e);
  }

  let assignedMinutes = Math.max(currentTotalMinutes, sessionStartMinutes);

  if (assignedMinutes % 30 !== 0) {
    assignedMinutes = Math.ceil(assignedMinutes / 30) * 30;
  }

  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  if (existingTimes.has(fmt(assignedMinutes))) {
    assignedMinutes += 30;
  }

  while (assignedMinutes < sessionEndMinutes && existingTimes.has(fmt(assignedMinutes))) {
    assignedMinutes += 30;
  }

  if (assignedMinutes >= sessionEndMinutes) {
    return { error: "No available slots left in this session." };
  }

  const assignedTime = `${fmt(assignedMinutes)}:00`;
  const duration = clinicConfig.schedule.slotDuration;

  const { data: existingTokens } = await supabase
    .from("appointments")
    .select("token_number")
    .eq("appointment_date", today)
    .not("status", "in", '("cancelled","no_show")')
    .order("token_number", { ascending: false })
    .limit(1);
  const tokenNumber = (existingTokens?.[0]?.token_number || 0) + 1;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      appointment_date: today,
      appointment_time: assignedTime,
      duration_minutes: duration,
      consultation_type: "in_person",
      patient_notes: "Walk-in patient",
      status: "pending",
      payment_status: "not_required",
      consultation_fee: clinicConfig.payment.consultationFee,
      start_at: new Date(`${today}T${assignedTime}`).toISOString(),
      end_at: new Date(new Date(`${today}T${assignedTime}`).getTime() + duration * 60000).toISOString(),
      token_number: tokenNumber,
      patient_name: patientName.trim(),
      patient_phone: patientPhone || "",
    })
    .select()
    .single();

  if (error) {
    return { error: error.message || "Failed to add walk-in patient." };
  }

  return {
    success: true,
    appointmentId: data?.id,
    tokenNumber: tokenNumber,
    assignedTime: fmt(assignedMinutes),
  };
}
