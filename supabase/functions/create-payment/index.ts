// supabase/functions/create-payment/index.ts
// Secure payment creation endpoint
// Deploy with: supabase functions deploy create-payment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { appointmentId, amount, currency = "INR" } = await req.json();

    if (!appointmentId || !amount) {
      return new Response(JSON.stringify({ error: "Missing appointmentId or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the appointment belongs to this user
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, patient_id, consultation_fee")
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .single();

    if (apptError || !appointment) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create payment record
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .insert({
        appointment_id: appointmentId,
        patient_id: user.id,
        amount: amount,
        currency: currency,
        payment_status: "pending",
        provider: "stripe",
      })
      .select()
      .single();

    if (payError) {
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // In production, initialize Stripe or Razorpay here:
    // const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    // const session = await stripe.checkout.sessions.create({...});

    // For now, return a placeholder payment URL
    return new Response(JSON.stringify({
      success: true,
      paymentId: payment.id,
      paymentUrl: `https://checkout.stripe.com/demo/${payment.id}`,
      message: "Payment initialized. Redirect to paymentUrl to complete.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Payment function error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
