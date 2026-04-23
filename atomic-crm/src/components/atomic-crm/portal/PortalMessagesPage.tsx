import { useMemo, useState } from "react";
import { useTranslate } from "ra-core";
import { useGetIdentity } from "ra-core";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useAuthUserId } from "../access/useAuthUserId";
import { useChasterAccess } from "../access/chasterAccessContext";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { PortalQuickNav } from "./PortalQuickNav";
import { ConversationList, type ListRow } from "@/modules/messaging/components/ConversationList";
import { MessageThread } from "@/modules/messaging/components/MessageThread";
import { NewDmModal } from "@/modules/messaging/components/NewDmModal";
import {
  useTeamConversations,
  useClientHqConversation,
  type ConversationRow,
} from "@/modules/messaging/hooks/useConversations";
import { usePresence } from "@/modules/messaging/hooks/usePresence";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { cn } from "@/lib/utils";

function otherDmPeer(c: ConversationRow, myId: string): string | null {
  if (c.type !== "team_dm") return null;
  if (c.participant_a === myId) return c.participant_b;
  if (c.participant_b === myId) return c.participant_a;
  return null;
}

export function PortalMessagesPage() {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const { data: authUserId, isPending: authUserLoading } = useAuthUserId();
  const myId = authUserId ?? "";
  const { tenantId } = useChasterAccess();
  const { can } = useCurrentUserRole();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);

  const myName =
    identity && "fullName" in identity && identity.fullName
      ? String(identity.fullName)
      : identity && "email" in identity && identity.email
        ? String(identity.email)
        : "Me";

  const teamQ = useTeamConversations(tenantId, myId);
  const hqQ = useClientHqConversation(tenantId, myId);

  const dmPeerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of teamQ.conversations) {
      const p = otherDmPeer(c, myId);
      if (p) ids.add(p);
    }
    return ids;
  }, [teamQ.conversations, myId]);

  const teamPeerIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of teamQ.conversations) {
      const p = otherDmPeer(c, myId);
      if (p) s.add(p);
    }
    return [...s];
  }, [teamQ.conversations, myId]);

  const salesQ = useQuery({
    queryKey: ["messaging-portal-names", teamPeerIds],
    enabled: teamPeerIds.length > 0,
    queryFn: async () => {
      const ids = teamPeerIds;
      if (ids.length === 0) return {};
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const r = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        map[r.user_id] = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
      }
      return map;
    },
  });

  const namesByUserId = useMemo(() => salesQ.data ?? {}, [salesQ.data]);

  const hqThreadNamesQ = useQuery({
    queryKey: ["messaging-portal-hq-thread-names", selectedId],
    enabled:
      !!selectedId &&
      !!teamQ.conversations.concat(hqQ.conversation ? [hqQ.conversation] : []).find((c) => c.id === selectedId && c.type === "hq_client"),
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = getSupabaseClient();
      const { data: mem, error } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", selectedId!);
      if (error) throw error;
      const ids = [...new Set((mem ?? []).map((m: { user_id: string }) => m.user_id))];
      if (ids.length === 0) return {};
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (e2) throw e2;
      const map: Record<string, string> = {};
      for (const row of sales ?? []) {
        const r = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        map[r.user_id] = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
      }
      return map;
    },
  });

  const displayNames = useMemo(
    () => ({
      ...namesByUserId,
      ...(hqThreadNamesQ.data ?? {}),
      [myId]: myName,
    }),
    [namesByUserId, hqThreadNamesQ.data, myId, myName],
  );

  const presenceMap = usePresence(tenantId, myId, myName);

  const sections = useMemo(() => {
    const teamRows: ListRow[] = teamQ.conversations.map((c) => {
      const peer = otherDmPeer(c, myId);
      const title =
        peer && namesByUserId[peer]
          ? namesByUserId[peer]
          : peer
            ? translate("chaster.messages.direct_peer_fallback")
            : c.name ?? translate("chaster.messages.group_chat");
      return {
        id: c.id,
        title,
        preview: c.last_message_preview,
        timeIso: c.last_message_at,
        unread: c.unreadCount,
        otherUserId: peer,
      };
    });

    const hqRows: ListRow[] = [];
    if (hqQ.conversation && can("portal.messages.hq_thread")) {
      hqRows.push({
        id: hqQ.conversation.id,
        title: translate("chaster.messages.from_chaster"),
        preview: hqQ.conversation.last_message_preview,
        timeIso: hqQ.conversation.last_message_at,
        unread: hqQ.unreadCount,
        isChaster: true,
        otherUserId: null,
      });
    }

    return [
      { label: translate("chaster.messages.direct_messages"), rows: teamRows },
      { label: translate("chaster.messages.from_chaster"), rows: hqRows },
    ];
  }, [teamQ.conversations, hqQ, namesByUserId, myId, translate, can]);

  const selectedConv = useMemo(() => {
    const all = [
      ...teamQ.conversations,
      ...(hqQ.conversation ? [hqQ.conversation] : []),
    ];
    return all.find((c) => c.id === selectedId) ?? null;
  }, [teamQ.conversations, hqQ.conversation, selectedId]);

  const threadTitle =
    selectedConv?.type === "hq_client"
      ? translate("chaster.messages.from_chaster")
      : selectedConv
        ? (() => {
            const peer = otherDmPeer(selectedConv, myId);
            return peer && namesByUserId[peer]
              ? namesByUserId[peer]
              : peer
                ? translate("chaster.messages.direct_peer_fallback")
                : selectedConv.name ?? translate("chaster.messages.group_chat");
          })()
        : "";

  const otherUserId =
    selectedConv && selectedConv.type === "team_dm"
      ? otherDmPeer(selectedConv, myId)
      : null;

  const presenceForOther =
    otherUserId && selectedConv?.type !== "hq_client"
      ? presenceMap.get(otherUserId) ?? null
      : null;

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setMobileThread(true);
  };

  return (
    <TenantPortalGuard>
      <PermissionGate
        permission="portal.messages.view"
        fallback={
          <div className="p-8 max-w-screen-xl mx-auto text-muted-foreground text-sm">
            {translate("chaster.messages.access_denied")}
          </div>
        }
      >
        <div className="max-w-screen-xl mx-auto p-4 md:p-6">
          <PortalQuickNav />
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            {translate("chaster.portal.messages_scope_hint")}
          </p>
          <div className="mt-6 flex flex-col md:flex-row gap-4 h-[calc(100dvh-12rem)] min-h-[420px]">
            <div
              className={cn(
                "flex flex-col border border-border rounded-lg bg-card min-h-0 md:w-[320px] shrink-0",
                mobileThread ? "hidden md:flex" : "flex flex-1 md:flex-none",
              )}
            >
              <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
                <h2 className="text-lg font-semibold">{translate("chaster.messages.title")}</h2>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={translate("chaster.messages.new_message")}
                  disabled={!myId}
                  onClick={() => setNewDmOpen(true)}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </div>
              <ConversationList
                loading={authUserLoading || !myId || teamQ.isLoading || hqQ.isLoading}
                sections={sections}
                selectedId={selectedId}
                onSelect={selectConversation}
                presenceByUserId={presenceMap}
              />
            </div>

            <div
              className={cn(
                "flex flex-col flex-1 min-h-0 min-w-0",
                !mobileThread ? "hidden md:flex" : "flex",
              )}
            >
              <div className="md:hidden flex items-center gap-2 mb-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setMobileThread(false)}>
                  ← {translate("chaster.messages.back_to_list")}
                </Button>
              </div>
              <MessageThread
                conversationId={selectedId}
                threadTitle={threadTitle}
                isChaster={selectedConv?.type === "hq_client"}
                hqBanner={selectedConv?.type === "hq_client" ? "client" : null}
                myUserId={myId}
                myDisplayName={myName}
                namesByUserId={displayNames}
                presenceForOther={presenceForOther}
              />
            </div>
          </div>
        </div>

        {tenantId && myId ? (
          <NewDmModal
            open={newDmOpen}
            onOpenChange={setNewDmOpen}
            tenantId={tenantId}
            myUserId={myId}
            existingDmPeerIds={dmPeerIds}
            onConversationCreated={(id) => {
              setSelectedId(id);
              setMobileThread(true);
              void teamQ.refetch();
            }}
          />
        ) : null}
      </PermissionGate>
    </TenantPortalGuard>
  );
}
