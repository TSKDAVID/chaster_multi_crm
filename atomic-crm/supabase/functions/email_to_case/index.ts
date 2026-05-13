import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Email-to-Case Edge Function
 *
 * Processes inbound emails through a 4-tier matching cascade:
 * 1. Exact header match (In-Reply-To / References)
 * 2. Subject alias match
 * 3. Fuzzy duplicate detection (same sender + similar subject)
 * 4. New case creation
 */

interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text_body: string;
  html_body?: string;
  message_id: string;
  in_reply_to?: string;
  references?: string;
  attachments?: Array<{
    name: string;
    content_type: string;
    content: string;
  }>;
}

function normalizeSubject(subject: string): string {
  return (subject ?? "")
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const trigramsOf = (s: string): Set<string> => {
    const padded = `  ${s} `;
    const t = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) {
      t.add(padded.substring(i, i + 3));
    }
    return t;
  };
  const tA = trigramsOf(a);
  const tB = trigramsOf(b);
  let intersection = 0;
  for (const t of tA) {
    if (tB.has(t)) intersection++;
  }
  const union = tA.size + tB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function findOrCreateRequester(
  senderEmail: string,
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("support_requesters")
    .select("id")
    .eq("email", senderEmail.toLowerCase())
    .limit(1)
    .single();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("support_requesters")
    .insert({
      email: senderEmail.toLowerCase(),
      organization_name: senderEmail.split("@")[1] ?? "Unknown",
      source_detail: "email_inbound",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create requester:", error);
    return null;
  }
  return created?.id ?? null;
}

async function appendMessageToCase(
  caseId: string,
  email: InboundEmail,
  senderId: string | null,
): Promise<void> {
  await supabaseAdmin.from("support_case_messages").insert({
    case_id: caseId,
    sender_id: senderId,
    body: email.text_body || email.html_body || "(empty email body)",
    is_system: false,
    email_message_id: email.message_id,
    metadata: { source: "email", from: email.from, subject: email.subject },
  });

  await supabaseAdmin
    .from("support_cases")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", caseId);
}

async function createNewCase(
  email: InboundEmail,
  requesterId: string | null,
  duplicateOf?: { id: string; confidence: number },
): Promise<string> {
  const normalized = normalizeSubject(email.subject);

  const { data: seqRow } = await supabaseAdmin.rpc("nextval", {
    seq_name: "support_case_number_seq",
  });
  const caseNumber = `CASE-${String(seqRow ?? Date.now()).padStart(6, "0")}`;

  const caseInsert: Record<string, unknown> = {
    case_number: caseNumber,
    subject: email.subject?.trim() || "(no subject)",
    category: "other",
    status: "open",
    priority: "medium",
    source: "email",
    source_email: email.from?.toLowerCase(),
    email_thread_id: email.message_id,
    support_requester_id: requesterId,
  };

  if (duplicateOf) {
    caseInsert.possible_duplicate_of = duplicateOf.id;
    caseInsert.duplicate_confidence = duplicateOf.confidence;
  }

  const { data: newCase, error } = await supabaseAdmin
    .from("support_cases")
    .insert(caseInsert)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create case: ${error.message}`);

  const caseId = newCase!.id as string;

  await supabaseAdmin.from("support_case_messages").insert({
    case_id: caseId,
    sender_id: null,
    body: email.text_body || email.html_body || "(empty email body)",
    is_system: false,
    email_message_id: email.message_id,
    metadata: { source: "email", from: email.from },
  });

  // Register subject alias for future threading
  if (normalized) {
    await supabaseAdmin
      .from("email_subject_aliases")
      .upsert(
        {
          case_id: caseId,
          subject_normalized: normalized,
          sender_email: email.from?.toLowerCase(),
        },
        { onConflict: "subject_normalized,sender_email" },
      );
  }

  return caseId;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const email: InboundEmail = await req.json();
    const senderEmail = email.from?.toLowerCase()?.trim();

    if (!senderEmail) {
      return new Response(JSON.stringify({ error: "Missing sender" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const requesterId = await findOrCreateRequester(senderEmail);

    // ------- TIER 1: Exact header match -------
    const replyHeaders = [email.in_reply_to, ...(email.references?.split(/\s+/) ?? [])].filter(
      Boolean,
    );

    if (replyHeaders.length > 0) {
      // Check message IDs
      const { data: msgMatch } = await supabaseAdmin
        .from("support_case_messages")
        .select("case_id")
        .in("email_message_id", replyHeaders)
        .limit(1)
        .single();

      if (msgMatch?.case_id) {
        await appendMessageToCase(msgMatch.case_id as string, email, null);
        return new Response(
          JSON.stringify({
            action: "appended",
            tier: 1,
            case_id: msgMatch.case_id,
            match: "header_message_id",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Check thread IDs
      const { data: threadMatch } = await supabaseAdmin
        .from("support_cases")
        .select("id")
        .in("email_thread_id", replyHeaders)
        .limit(1)
        .single();

      if (threadMatch?.id) {
        await appendMessageToCase(threadMatch.id as string, email, null);
        return new Response(
          JSON.stringify({
            action: "appended",
            tier: 1,
            case_id: threadMatch.id,
            match: "header_thread_id",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // ------- TIER 2: Subject alias match -------
    const normalizedSubject = normalizeSubject(email.subject);

    if (normalizedSubject) {
      const { data: aliasMatch } = await supabaseAdmin
        .from("email_subject_aliases")
        .select("case_id")
        .eq("subject_normalized", normalizedSubject)
        .eq("sender_email", senderEmail)
        .limit(1)
        .single();

      if (aliasMatch?.case_id) {
        await appendMessageToCase(aliasMatch.case_id as string, email, null);
        return new Response(
          JSON.stringify({
            action: "appended",
            tier: 2,
            case_id: aliasMatch.case_id,
            match: "subject_alias",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // ------- TIER 3: Fuzzy duplicate detection -------
    const { data: candidates } = await supabaseAdmin
      .from("support_cases")
      .select("id, subject, source_email")
      .eq("source_email", senderEmail)
      .in("status", ["open", "in_progress", "pending_client"])
      .order("created_at", { ascending: false })
      .limit(20);

    let bestMatch: { id: string; score: number } | null = null;

    if (candidates && normalizedSubject) {
      for (const c of candidates) {
        const candidateSubject = normalizeSubject(c.subject as string);
        const score = trigramSimilarity(normalizedSubject, candidateSubject);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: c.id as string, score };
        }
      }
    }

    if (bestMatch && bestMatch.score > 0.85) {
      // Check auto-merge setting
      const { data: settings } = await supabaseAdmin
        .from("tenant_settings")
        .select("email_auto_merge_enabled")
        .limit(1)
        .single();

      const autoMergeEnabled = settings?.email_auto_merge_enabled !== false;

      if (autoMergeEnabled) {
        // Auto-merge: append to existing case
        await appendMessageToCase(bestMatch.id, email, null);

        // Register subject alias
        if (normalizedSubject) {
          await supabaseAdmin
            .from("email_subject_aliases")
            .upsert(
              {
                case_id: bestMatch.id,
                subject_normalized: normalizedSubject,
                sender_email: senderEmail,
              },
              { onConflict: "subject_normalized,sender_email" },
            );
        }

        // Log auto-merge
        await supabaseAdmin.from("case_merge_log").insert({
          source_case_id: bestMatch.id,
          target_case_id: bestMatch.id,
          action: "auto_merge",
          reason: `Same sender + ${Math.round(bestMatch.score * 100)}% subject similarity`,
        });

        return new Response(
          JSON.stringify({
            action: "auto_merged",
            tier: 3,
            case_id: bestMatch.id,
            confidence: bestMatch.score,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } else {
        // Auto-merge disabled: create new case marked as possible duplicate
        const caseId = await createNewCase(email, requesterId, {
          id: bestMatch.id,
          confidence: bestMatch.score,
        });
        return new Response(
          JSON.stringify({
            action: "created_possible_duplicate",
            tier: 3,
            case_id: caseId,
            possible_duplicate_of: bestMatch.id,
            confidence: bestMatch.score,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (bestMatch && bestMatch.score >= 0.5) {
      // Medium confidence: create new case with suggestion
      const caseId = await createNewCase(email, requesterId, {
        id: bestMatch.id,
        confidence: bestMatch.score,
      });
      return new Response(
        JSON.stringify({
          action: "created_possible_duplicate",
          tier: 3,
          case_id: caseId,
          possible_duplicate_of: bestMatch.id,
          confidence: bestMatch.score,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // ------- TIER 4: New case -------
    const caseId = await createNewCase(email, requesterId);
    return new Response(
      JSON.stringify({ action: "created", tier: 4, case_id: caseId }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("email_to_case error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
