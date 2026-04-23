import { useMemo, useState } from "react";
import { useTranslate, useNotify } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { errorMessage } from "@/lib/errorMessage";
import { getOrCreateDm } from "../utils/messagingClient";

type Member = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  myUserId: string;
  existingDmPeerIds: Set<string>;
  onConversationCreated: (id: string) => void;
};

export function NewDmModal({
  open,
  onOpenChange,
  tenantId,
  myUserId,
  existingDmPeerIds,
  onConversationCreated,
}: Props) {
  const translate = useTranslate();
  const notify = useNotify();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: members = [], isPending } = useQuery({
    queryKey: ["messaging-new-dm-members", tenantId],
    enabled: open && !!tenantId,
    queryFn: async (): Promise<Member[]> => {
      const supabase = getSupabaseClient();
      const { data: tms, error: e1 } = await supabase
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", tenantId);
      if (e1) throw e1;
      const ids = (tms ?? [])
        .map((r: { user_id: string }) => r.user_id)
        .filter((id: string) => id !== myUserId);
      if (ids.length === 0) return [];
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (e2) throw e2;
      return (sales ?? []) as Member[];
    },
  });

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = members.map((m) => ({
      ...m,
      display: [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email,
    }));
    list.sort((a, b) => {
      const ae = existingDmPeerIds.has(a.user_id) ? 0 : 1;
      const be = existingDmPeerIds.has(b.user_id) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.display.localeCompare(b.display);
    });
    if (!n) return list;
    return list.filter(
      (m) =>
        m.display.toLowerCase().includes(n) || m.email.toLowerCase().includes(n),
    );
  }, [members, q, existingDmPeerIds]);

  const startDm = async (userId: string) => {
    setBusy(userId);
    try {
      const { conversationId, error } = await getOrCreateDm(userId, tenantId);
      if (error || !conversationId) throw error ?? new Error("DM failed");
      onConversationCreated(conversationId);
      onOpenChange(false);
      setQ("");
    } catch (e) {
      notify(errorMessage(e), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{translate("chaster.messages.new_message")}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder={translate("chaster.messages.search_members")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-3"
        />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {isPending ? (
            <p className="text-sm text-muted-foreground">{translate("ra.message.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("chaster.messages.no_members_found")}
            </p>
          ) : (
            filtered.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/80"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-[10px]">
                    {m.display.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.display}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  {existingDmPeerIds.has(m.user_id) ? (
                    <div className="text-[10px] text-muted-foreground">
                      {translate("chaster.messages.existing_dm")}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void startDm(m.user_id)}
                >
                  {busy === m.user_id
                    ? translate("chaster.messages.sending")
                    : translate("chaster.messages.open")}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
