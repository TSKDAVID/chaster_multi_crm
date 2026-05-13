import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Send Case Reply Edge Function
 *
 * Sends an email reply from a support case thread to the requester.
 * Includes proper In-Reply-To and References headers for email threading.
 */

interface ReplyPayload {
  case_id: string;
  message_id: string;
  body: string;
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("SUPPORT_FROM_EMAIL") ?? "support@chaster.io";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const payload: ReplyPayload = await req.json();

    // Fetch the case
    const { data: caseRow, error: caseErr } = await supabaseAdmin
      .from("support_cases")
      .select(
        "id, case_number, subject, source_email, email_thread_id, support_requester_id",
      )
      .eq("id", payload.case_id)
      .single();

    if (caseErr || !caseRow) {
      return new Response(
        JSON.stringify({ error: "Case not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Determine recipient email
    let recipientEmail = caseRow.source_email as string | null;

    if (!recipientEmail && caseRow.support_requester_id) {
      const { data: requester } = await supabaseAdmin
        .from("support_requesters")
        .select("email")
        .eq("id", caseRow.support_requester_id)
        .single();
      recipientEmail = (requester?.email as string) ?? null;
    }

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "No recipient email found for this case" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build threading headers
    const threadId = caseRow.email_thread_id as string | null;
    const headers: Record<string, string> = {};
    if (threadId) {
      headers["In-Reply-To"] = threadId;
      headers["References"] = threadId;
    }

    // Generate a unique Message-ID for this outbound email
    const outboundMessageId = `<${crypto.randomUUID()}@chaster.io>`;

    // Send via Resend API
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject: `Re: ${(caseRow.subject as string) || caseRow.case_number}`,
        text: payload.body,
        headers: {
          ...headers,
          "Message-ID": outboundMessageId,
          "X-Case-Number": caseRow.case_number as string,
        },
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API error:", errText);
      return new Response(
        JSON.stringify({ error: `Email send failed: ${errText}` }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Update the message record with the outbound Message-ID for threading
    if (payload.message_id) {
      await supabaseAdmin
        .from("support_case_messages")
        .update({ email_message_id: outboundMessageId })
        .eq("id", payload.message_id);
    }

    // Update case email_thread_id if not set
    if (!threadId) {
      await supabaseAdmin
        .from("support_cases")
        .update({ email_thread_id: outboundMessageId })
        .eq("id", payload.case_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: outboundMessageId,
        recipient: recipientEmail,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send_case_reply error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
