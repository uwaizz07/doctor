// supabase/functions/payment-webhook/index.ts
// Payment webhook handler for Stripe/Razorpay
// Deploy with: supabase functions deploy payment-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const body = await req.text();

    // In production, verify webhook signature:
    // const sig = req.headers.get("stripe-signature");
    // const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    const event = JSON.parse(body);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data?.object;
        if (!session?.metadata?.payment_id) break;

        // Update payment status
        await supabase
          .from("payments")
          .update({
            payment_status: "paid",
            provider_reference: session.payment_intent || session.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.metadata.payment_id);

        // Update appointment payment status
        if (session.metadata.appointment_id) {
          await supabase
            .from("appointments")
            .update({
              payment_status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.metadata.appointment_id);
        }

        console.log(`Payment ${session.metadata.payment_id} completed`);
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data?.object;
        if (!intent?.metadata?.payment_id) break;

        await supabase
          .from("payments")
          .update({
            payment_status: "failed",
            error_message: intent.last_payment_error?.message || "Payment failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.metadata.payment_id);

        console.log(`Payment ${intent.metadata.payment_id} failed`);
        break;
      }

      case "charge.refunded": {
        const charge = event.data?.object;
        // Handle refund logic
        console.log("Refund processed:", charge.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: "Webhook handler failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
