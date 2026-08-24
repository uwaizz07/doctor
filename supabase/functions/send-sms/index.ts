// supabase/functions/send-sms/index.ts
// Twilio SMS notification sender
// Deploy with: supabase functions deploy send-sms

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

function getSupabaseClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    },
  );
}

async function sendSMS(to: string, text: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn("Twilio credentials not configured");
    return { ok: false, error: "Twilio not configured" };
  }

  let formattedPhone = to.replace(/[^0-9+]/g, "");

  if (/^\d{10}$/.test(formattedPhone)) {
    formattedPhone = `+91${formattedPhone}`;
  } else if (/^91\d{10}$/.test(formattedPhone)) {
    formattedPhone = `+${formattedPhone}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(formattedPhone)) {
    return { ok: false, error: "Invalid phone number" };
  }

  try {
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const body = new URLSearchParams({
      From: TWILIO_PHONE_NUMBER,
      To: formattedPhone,
      Body: "sms_appointment_reminders",
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        error: result.message || result.error_message || "SMS send failed",
      };
    }
    return { ok: true, sid: result.sid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildNotificationMessage(
  type: string,
  data: Record<string, string>,
): string {
  switch (type) {
    case "booking_created":
      return `Hello ${data.patientName},\n\nYour appointment request with Dr. Arshadha has been received.\n\nDate: ${data.date}\nTime: ${data.time}\nService: ${data.service}\nStatus: Pending\n\nWe will notify you when your appointment is confirmed.`;

    case "appointment_confirmed":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha has been confirmed!\n\nDate: ${data.date}\nTime: ${data.time}\nService: ${data.service}\n\nClinic: 123 Medical Center Road\nThank you for choosing Dr. Arshadha Medical Clinic.`;

    case "appointment_cancelled":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha on ${data.date} at ${data.time} has been cancelled.\n\nPlease contact the clinic at +91 77083 23744 if you need to reschedule.`;

    case "appointment_rescheduled":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha has been rescheduled.\n\nNew Date: ${data.date}\nNew Time: ${data.time}\nService: ${data.service}\n\nPlease note the updated schedule.`;

    case "appointment_reminder":
      return `Reminder: You have an appointment with Dr. Arshadha tomorrow.\n\nDate: ${data.date}\nTime: ${data.time}\n\nPlease arrive 10 minutes early.`;

    default:
      return `Notification from Dr. Arshadha's clinic: ${data.message || "Update available."}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const {
      type,
      appointmentId,
      patientPhone,
      patientName,
      date,
      time,
      service,
      consultationType,
      patientNotes,
      paymentMethod,
    } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: string[] = [];

    let patientSent = false;
    let patientMessage = "";
    if (patientPhone) {
      patientMessage = buildNotificationMessage(type, {
        patientName: patientName || "Patient",
        date: date || "",
        time: time || "",
        service: service || "Consultation",
      });

      const patResult = await sendSMS(patientPhone, patientMessage);
      patientSent = patResult.ok;
      if (!patResult.ok && patResult.error) {
        errors.push(`Patient notification: ${patResult.error}`);
      }

      await supabase.from("notifications").insert({
        recipient_id: null,
        appointment_id: appointmentId || null,
        notification_type: type,
        channel: "sms",
        content: patientMessage,
        status: patResult.ok ? "sent" : "failed",
        error_message: patResult.ok ? null : patResult.error,
        sent_at: patResult.ok ? new Date().toISOString() : null,
      });
    }

    return new Response(
      JSON.stringify({
        success: patientSent,
        patientSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("SMS function error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
