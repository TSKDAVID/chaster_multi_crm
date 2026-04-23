import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslate, useGetIdentity, useNotify } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useAuthUserId } from "../access/useAuthUserId";
import { errorMessage } from "@/lib/errorMessage";
import { ConversationList, type ListRow } from "@/modules/messaging/components/ConversationList";
import { MessageThread } from "@/modules/messaging/components/MessageThread";
import {
  useHqClientConversations,
  useHqStaffDmConversations,
} from "@/modules/messaging/hooks/useConversations";
import { getOrCreateHqClientDm, getOrCreateStaffDm } from "@/modules/messaging/utils/messagingClient";
import { useHqTenantDirectory } from "./useHqQueries";
import type { HqTenantDirectoryRow } from "./hqTypes";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { cn } from "@/lib/utils";

type HqMsgTab = "clients" | "internal";

type StaffPickerRow = {
  user_id: string;
  display_name: string;
  email: string;
};

export function HqMessagesPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const { data: identity } = useGetIdentity();
  const { data: authUserId, isPending: authUserLoading } = useAuthUserId();
  const myId = authUserId ?? "";
  const myName =
    identity && "fullName" in identity && identity.fullName
      ? String(identity.fullName)
      : identity && "email" in identity && identity.email
        ? String(identity.email)
        : "Chaster";

  const { can } = useCurrentUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: HqMsgTab =
    searchParams.get("tab") === "internal" ? "internal" : "clients";
  const setTab = (next: HqMsgTab) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next === "internal") n.set("tab", "internal");
        else n.delete("tab");
        return n;
      },
      { replace: true },
    );
  };
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [staffQ, setStaffQ] = useState("");
  const [mobileThread, setMobileThread] = useState(false);
  const [startBusy, setStartBusy] = useState<string | null>(null);

  const convClients = useHqClientConversations(myId);
  const convInternal = useHqStaffDmConversations(myId);
  const dirQ = useHqTenantDirectory(true);

  const selectedId = tab === "clients" ? selectedClientId : selectedInternalId;
  const setSelectedForTab = (id: string) => {
    if (tab === "clients") setSelectedClientId(id);
    else setSelectedInternalId(id);
  };

  const selectedClient = useMemo(
    () => convClients.conversations.find((c) => c.id === selectedClientId) ?? null,
    [convClients.conversations, selectedClientId],
  );
  const selectedInternal = useMemo(
    () => convInternal.conversations.find((c) => c.id === selectedInternalId) ?? null,
    [convInternal.conversations, selectedInternalId],
  );

  const memberNamesQ = useQuery({
    queryKey: ["hq-conversation-member-names", selectedId],
    enabled: !!selectedId,
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

  const namesByUserId = useMemo(
    () => ({
      ...(memberNamesQ.data ?? {}),
      [myId]: myName,
    }),
    [memberNamesQ.data, myId, myName],
  );

  const staffDirQ = useQuery({
    queryKey: ["hq-chaster-team-dm-picker", myId],
    enabled: staffPickerOpen && !!myId,
    queryFn: async (): Promise<StaffPickerRow[]> => {
      const supabase = getSupabaseClient();
      const { data: team, error } = await supabase.from("chaster_team").select("user_id");
      if (error) throw error;
      const ids = (team ?? [])
        .map((t: { user_id: string }) => t.user_id)
        .filter((uid: string) => uid !== myId);
      if (ids.length === 0) return [];
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (e2) throw e2;
      const rows: StaffPickerRow[] = (sales ?? []).map((row) => {
        const r = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        const display_name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
        return { user_id: r.user_id, display_name, email: r.email };
      });
      rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
      return rows;
    },
  });

  const sections = useMemo((): { label: string; rows: ListRow[] }[] => {
    if (tab === "clients") {
      const rows: ListRow[] = convClients.conversations.map((c) => ({
        id: c.id,
        title: c.companyName,
        subtitle: c.ownerLabel?.name ?? null,
        preview: c.last_message_preview,
        timeIso: c.last_message_at,
        unread: c.unreadCount,
      }));
      return [{ label: translate("chaster.messages.client_conversations"), rows }];
    }
    const rows: ListRow[] = convInternal.conversations.map((c) => ({
      id: c.id,
      title: c.peerDisplayName,
      subtitle: null,
      preview: c.last_message_preview,
      timeIso: c.last_message_at,
      unread: c.unreadCount,
    }));
    return [{ label: translate("chaster.messages.internal_conversations"), rows }];
  }, [tab, convClients.conversations, convInternal.conversations, translate]);

  const listLoading =
    authUserLoading ||
    !myId ||
    (tab === "clients" ? convClients.isLoading : convInternal.isLoading);

  const filteredTenants = useMemo(() => {
    const rows = dirQ.data ?? [];
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(
      (r: HqTenantDirectoryRow) =>
        r.company_name.toLowerCase().includes(n) ||
        (r.primary_contact_email ?? "").toLowerCase().includes(n),
    );
  }, [dirQ.data, q]);

  const filteredStaff = useMemo(() => {
    const rows = staffDirQ.data ?? [];
    const n = staffQ.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(
      (r) =>
        r.display_name.toLowerCase().includes(n) || r.email.toLowerCase().includes(n),
    );
  }, [staffDirQ.data, staffQ]);

  const startWithTenant = async (tenantId: string) => {
    setStartBusy(tenantId);
    try {
      const { conversationId, error } = await getOrCreateHqClientDm(tenantId);
      if (error || !conversationId) throw error ?? new Error("start failed");
      setTab("clients");
      setSelectedClientId(conversationId);
      setMobileThread(true);
      setPickerOpen(false);
      void convClients.refetch();
    } catch (e) {
      notify(errorMessage(e), { type: "error" });
    } finally {
      setStartBusy(null);
    }
  };

  const startWithStaff = async (otherUserId: string) => {
    setStartBusy(otherUserId);
    try {
      const { conversationId, error } = await getOrCreateStaffDm(otherUserId);
      if (error || !conversationId) throw error ?? new Error("start failed");
      setTab("internal");
      setSelectedInternalId(conversationId);
      setMobileThread(true);
      setStaffPickerOpen(false);
      void convInternal.refetch();
    } catch (e) {
      notify(errorMessage(e), { type: "error" });
    } finally {
      setStartBusy(null);
    }
  };

  const threadTitle =
    tab === "clients"
      ? (selectedClient?.companyName ?? translate("chaster.messages.title"))
      : (selectedInternal?.peerDisplayName ?? translate("chaster.messages.title"));
  const threadSubtitle = tab === "clients" ? (selectedClient?.ownerLabel?.name ?? null) : null;
  const hqBanner = tab === "clients" ? ("hq" as const) : null;

  const pageSubtitle =
    tab === "clients"
      ? translate("chaster.messages.hq_page_subtitle")
      : translate("chaster.messages.hq_internal_page_subtitle");

  const openStartPicker = () => {
    if (tab === "clients") {
      setPickerOpen(true);
    } else {
      setStaffPickerOpen(true);
    }
  };

  return (
    <ChasterHQGuard>
      <PermissionGate
        permission="hq.messages.view"
        fallback={
          <div className="p-8 max-w-screen-xl mx-auto text-muted-foreground text-sm">
            {translate("chaster.messages.access_denied")}
          </div>
        }
      >
        <div className="max-w-screen-xl mx-auto p-4 md:p-6 h-[calc(100dvh-8rem)] min-h-[420px] flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="h-7 w-7" />
              {translate("chaster.messages.hq_messages_title")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{pageSubtitle}</p>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v as HqMsgTab);
                setMobileThread(false);
              }}
              className="mt-4 w-full max-w-md"
            >
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="clients" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {translate("chaster.messages.hq_tab_clients")}
                </TabsTrigger>
                <TabsTrigger value="internal" className="gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {translate("chaster.messages.hq_tab_internal")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
            <div
              className={cn(
                "flex flex-col border border-border rounded-lg bg-card min-h-0 md:w-[320px] shrink-0",
                mobileThread ? "hidden md:flex" : "flex flex-1 md:flex-none",
              )}
            >
              <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0 gap-2">
                <span className="font-semibold text-sm truncate">
                  {tab === "clients"
                    ? translate("chaster.messages.client_conversations")
                    : translate("chaster.messages.internal_conversations")}
                </span>
                {can("hq.messages.send") ? (
                  <Button type="button" size="sm" onClick={openStartPicker}>
                    {translate("chaster.messages.start_conversation")}
                  </Button>
                ) : null}
              </div>
              <ConversationList
                loading={listLoading}
                sections={sections}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedForTab(id);
                  setMobileThread(true);
                }}
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
                threadSubtitle={threadSubtitle}
                hqBanner={hqBanner}
                myUserId={myId}
                myDisplayName={myName}
                namesByUserId={namesByUserId}
              />
            </div>
          </div>
        </div>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{translate("chaster.messages.start_client_thread")}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder={translate("chaster.messages.search_companies")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mb-3"
            />
            <div className="max-h-80 overflow-y-auto space-y-1">
              {dirQ.isPending ? (
                <p className="text-sm text-muted-foreground">{translate("ra.message.loading")}</p>
              ) : filteredTenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate("chaster.messages.no_companies_found")}
                </p>
              ) : (
                filteredTenants.map((r: HqTenantDirectoryRow) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.company_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.primary_contact_email ?? "—"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={startBusy !== null}
                      onClick={() => void startWithTenant(r.id)}
                    >
                      {startBusy === r.id
                        ? translate("chaster.messages.sending")
                        : translate("chaster.messages.open")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={staffPickerOpen}
          onOpenChange={(o) => {
            setStaffPickerOpen(o);
            if (!o) setStaffQ("");
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{translate("chaster.messages.start_internal_dm")}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder={translate("chaster.messages.search_staff")}
              value={staffQ}
              onChange={(e) => setStaffQ(e.target.value)}
              className="mb-3"
            />
            <div className="max-h-80 overflow-y-auto space-y-1">
              {staffDirQ.isPending ? (
                <p className="text-sm text-muted-foreground">{translate("ra.message.loading")}</p>
              ) : filteredStaff.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate("chaster.messages.no_staff_found")}
                </p>
              ) : (
                filteredStaff.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.display_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={startBusy !== null}
                      onClick={() => void startWithStaff(r.user_id)}
                    >
                      {startBusy === r.user_id
                        ? translate("chaster.messages.sending")
                        : translate("chaster.messages.open")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PermissionGate>
    </ChasterHQGuard>
  );
}
