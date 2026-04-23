import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { logAuditEvent } from "@/components/atomic-crm/access/logAuditEvent";

export async function sendMessage(
  conversationId: string,
  body: string,
  replyToId?: string | null,
) {
  const supabase = getSupabaseClient();
  const trimmed = body.trim();
  if (!trimmed) return { data: null, error: new Error("empty body") as Error | null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed.slice(0, 2000),
      reply_to_id: replyToId ?? null,
    })
    .select("id")
    .single();

  return { data, error: error as Error | null };
}

export async function editMessage(messageId: string, newBody: string) {
  const supabase = getSupabaseClient();
  const trimmed = newBody.trim();
  if (!trimmed) return { error: new Error("empty body") as Error | null };
  const { error } = await supabase
    .from("messages")
    .update({
      body: trimmed.slice(0, 2000),
      edited_at: new Date().toISOString(),
    })
    .eq("id", messageId);
  return { error: error as Error | null };
}

export async function deleteMessage(messageId: string, conversationId: string) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { data: row, error: fetchErr } = await supabase
    .from("messages")
    .select("id, sender_id, is_deleted")
    .eq("id", messageId)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr as Error };
  if (!row || row.is_deleted) return { error: null };

  const { error } = await supabase
    .from("messages")
    .update({
      is_deleted: true,
      body: "This message was deleted.",
    })
    .eq("id", messageId);

  if (!error && row.sender_id !== user.id) {
    await logAuditEvent({
      action: "message_deleted_by_admin",
      tenantId: null,
      metadata: { message_id: messageId, conversation_id: conversationId },
    });
  }

  return { error: error as Error | null };
}

export async function getOrCreateDm(otherUserId: string, tenantId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_or_create_dm", {
    p_other_user_id: otherUserId,
    p_tenant_id: tenantId,
  });
  if (error) return { conversationId: null as string | null, error: error as Error };
  return { conversationId: data as string, error: null };
}

export async function getOrCreateHqClientDm(targetTenantId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_or_create_hq_client_dm", {
    p_target_tenant_id: targetTenantId,
  });
  if (error) return { conversationId: null as string | null, error: error as Error };
  return { conversationId: data as string, error: null };
}

export async function getOrCreateStaffDm(otherUserId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_or_create_staff_dm", {
    p_other_user_id: otherUserId,
  });
  if (error) return { conversationId: null as string | null, error: error as Error };
  return { conversationId: data as string, error: null };
}

export async function markConversationRead(conversationId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("update_last_read", {
    p_conversation_id: conversationId,
  });
  return { error: error as Error | null };
}
