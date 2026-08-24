// supabase/functions/send-whatsapp/index.ts
// WhatsApp Cloud API notification sender
// Deploy with: supabase functions deploy send-whatsapp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") || "v17.0";

function getSupabaseClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );
}

async function sendWhatsAppMessage(to: string, templateName: string, parameters: string[]) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn("WhatsApp credentials not configured");
    return { ok: false, error: "WhatsApp not configured" };
  }

  const formattedPhone = to.replace(/[^0-9]/g, "");
  if (formattedPhone.length < 10) {
    return { ok: false, error: "Invalid phone number" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: parameters.length
              ? [{ type: "body", parameters: parameters.map((p) => ({ type: "text", text: p })) }]
              : [],
          },
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      return { ok: false, error: result.error?.message || "Send failed" };
    }
    return { ok: true, messageId: result.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendTextMessage(to: string, text: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return { ok: false, error: "WhatsApp not configured" };
  }

  const formattedPhone = to.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      return { ok: false, error: result.error?.message || "Send failed" };
    }
    return { ok: true, messageId: result.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildNotificationMessage(type: string, data: Record<string, string>): string {
  switch (type) {
    case "booking_created":
      return `Hello ${data.patientName},\n\nYour appointment request with Dr. Arshadha has been received.\n\n📅 Date: ${data.date}\n⏰ Time: ${data.time}\n🩺 Service: ${data.service}\n📌 Status: Pending\n\nWe will notify you when your appointment is confirmed.`;

    case "appointment_confirmed":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha has been confirmed!\n\n📅 Date: ${data.date}\n⏰ Time: ${data.time}\n🩺 Service: ${data.service}\n\nClinic: 123 Medical Center Road\nThank you for choosing Dr. Arshadha Medical Clinic.`;

    case "appointment_cancelled":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha on ${data.date} at ${data.time} has been cancelled.\n\nPlease contact the clinic at +91 77083 23744 if you need to reschedule.`;

    case "appointment_rescheduled":
      return `Hello ${data.patientName},\n\nYour appointment with Dr. Arshadha has been rescheduled.\n\n📅 New Date: ${data.date}\n⏰ New Time: ${data.time}\n🩺 Service: ${data.service}\n\nPlease note the updated schedule.`;

    case "appointment_reminder":
      return `Reminder: You have an appointment with Dr. Arshadha tomorrow.\n\n📅 Date: ${data.date}\n⏰ Time: ${data.time}\n\nPlease arrive 10 minutes early.`;

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
      paymentMethod
    } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: string[] = [];

    // Send notification to Patient (if phone available)
    let patientSent = false;
    let patientMessage = "";
    if (patientPhone) {
      patientMessage = buildNotificationMessage(type, {
        patientName: patientName || "Patient",
        date: date || "",
        time: time || "",
        service: service || "Consultation"
      });

      const patResult = await sendTextMessage(patientPhone, patientMessage);
      patientSent = patResult.ok;
      if (!patResult.ok && patResult.error) {
        errors.push(`Patient notification: ${patResult.error}`);
      }

      // Log notification to Patient
      await supabase.from("notifications").insert({
        recipient_id: null,
        appointment_id: appointmentId || null,
        notification_type: type,
        channel: "whatsapp",
        content: patientMessage,
        status: patResult.ok ? "sent" : "failed",
        error_message: patResult.ok ? null : patResult.error,
        sent_at: patResult.ok ? new Date().toISOString() : null,
      });
    }

    return new Response(JSON.stringify({
      success: patientSent,
      patientSent,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("WhatsApp function error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
