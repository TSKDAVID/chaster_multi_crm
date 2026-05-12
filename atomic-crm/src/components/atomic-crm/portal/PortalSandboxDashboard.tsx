import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslate } from "ra-core";
import {
  CheckSquare,
  Clock,
  FlaskConical,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  coercePortalSandboxPayload,
  defaultPortalSandboxPayload,
  type PortalSandboxPayload,
} from "./portalSandboxTypes";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SANDBOX_QUERY_KEY = "portal-hq-dashboard-sandbox";

async function upsertSandbox(userId: string, payload: PortalSandboxPayload) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("portal_hq_dashboard_sandbox").upsert(
    {
      user_id: userId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

function samplePayload(): PortalSandboxPayload {
  const now = new Date().toISOString();
  return {
    hotContacts: [
      {
        id: crypto.randomUUID(),
        name: "Alex Demo",
        subtitle: "Product lead · Acme Test Co.",
      },
    ],
    activities: [
      {
        id: crypto.randomUUID(),
        body: "Sample: lead qualified for follow-up",
        detail: "This line only exists in your portal sandbox — not real CRM.",
        occurredAt: now,
      },
    ],
    tasks: [
      {
        id: crypto.randomUUID(),
        text: "Try adding your own sandbox tasks below",
      },
    ],
  };
}

type Props = { userId: string };

/** HQ-only scratch dashboard backed by portal_hq_dashboard_sandbox — no CRM rows. */
export function PortalSandboxDashboard({ userId }: Props) {
  const translate = useTranslate();
  const qc = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: [SANDBOX_QUERY_KEY, userId],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data: row, error: err } = await supabase
        .from("portal_hq_dashboard_sandbox")
        .select("payload, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (err) throw err;
      return row;
    },
    enabled: !!userId,
  });

  const payload = useMemo(
    () =>
      coercePortalSandboxPayload(
        data && typeof data === "object" && data !== null && "payload" in data
          ? (data as { payload: unknown }).payload
          : null,
      ),
    [data],
  );

  const sortedActivities = useMemo(
    () =>
      [...payload.activities].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    [payload.activities],
  );

  const commit = useMutation({
    mutationFn: (next: PortalSandboxPayload) => upsertSandbox(userId, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [SANDBOX_QUERY_KEY, userId] });
    },
  });

  const patch = (updater: (p: PortalSandboxPayload) => PortalSandboxPayload) => {
    commit.mutate(updater(payload));
  };

  const [activityOpen, setActivityOpen] = useState(false);
  const [activityBody, setActivityBody] = useState("");
  const [activityDetail, setActivityDetail] = useState("");

  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactSubtitle, setContactSubtitle] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const busy = commit.isPending;

  return (
    <div className="px-4 pb-10 space-y-4">
      <Card className="border-dashed bg-muted/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <FlaskConical className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">
                {translate("chaster.portal.sandbox_banner_title")}
              </p>
              <p className="text-muted-foreground">
                {translate("chaster.portal.sandbox_banner_body")}
              </p>
              {error ? (
                <p className="text-destructive text-xs">{String(error)}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || isPending}
              onClick={() => patch(samplePayload)}
            >
              {translate("chaster.portal.sandbox_seed")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || isPending}
              onClick={() => patch(() => defaultPortalSandboxPayload())}
            >
              {translate("chaster.portal.sandbox_reset")}
            </Button>
          </div>
        </div>
      </Card>

      {isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="md:col-span-4 space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-1">
          <div className="md:col-span-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Users className="text-muted-foreground w-6 h-6 shrink-0" />
                <h2 className="text-xl font-semibold text-muted-foreground flex-1">
                  {translate("resources.contacts.hot.title")}
                </h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground shrink-0"
                        onClick={() => setContactOpen(true)}
                        disabled={busy}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {translate("chaster.portal.sandbox_add_contact")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Card className="py-0">
                {payload.hotContacts.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {translate("chaster.portal.sandbox_empty_hot")}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {payload.hotContacts.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs">
                            {c.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          {c.subtitle ? (
                            <p className="text-xs text-muted-foreground truncate">
                              {c.subtitle}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            patch((p) => ({
                              ...p,
                              hotContacts: p.hotContacts.filter((x) => x.id !== c.id),
                            }))
                          }
                          disabled={busy}
                          aria-label={translate("chaster.portal.sandbox_remove_row")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <div className="md:col-span-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center mb-2 md:mb-2 gap-3">
                <Clock className="text-muted-foreground w-6 h-6 shrink-0" />
                <h2 className="text-xl font-semibold text-muted-foreground flex-1">
                  {translate("crm.dashboard.latest_activity", {
                    _: "Latest Activity",
                  })}
                </h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActivityOpen(true)}
                        disabled={busy}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {translate("chaster.portal.sandbox_add_activity")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {translate("chaster.portal.sandbox_activity_hint")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Card className="p-6 mb-2">
                {sortedActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {translate("chaster.portal.sandbox_empty_activity")}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sortedActivities.map((a, idx) => (
                      <div key={a.id}>
                        <div className="flex gap-3 items-start justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm">{a.body}</p>
                            {a.detail ? (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                {a.detail}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(a.occurredAt).toLocaleDateString()}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                patch((p) => ({
                                  ...p,
                                  activities: p.activities.filter((x) => x.id !== a.id),
                                }))
                              }
                              disabled={busy}
                              aria-label={translate("chaster.portal.sandbox_remove_row")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {idx < sortedActivities.length - 1 ? <Separator className="mt-4" /> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          <div className="md:col-span-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <CheckSquare className="text-muted-foreground w-6 h-6 shrink-0" />
                <h2 className="text-xl font-semibold text-muted-foreground flex-1">
                  {translate("crm.dashboard.upcoming_tasks", {
                    _: "Upcoming Tasks",
                  })}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground shrink-0"
                  onClick={() => setTaskOpen(true)}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Card className="p-4 mb-2">
                {payload.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {translate("chaster.portal.sandbox_empty_tasks")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {payload.tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start gap-2 text-sm justify-between"
                      >
                        <div className="min-w-0">
                          <p>{t.text}</p>
                          {t.dueAt ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {translate("chaster.portal.sandbox_task_due", {
                                date: new Date(t.dueAt).toLocaleDateString(),
                              })}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            patch((p) => ({
                              ...p,
                              tasks: p.tasks.filter((x) => x.id !== t.id),
                            }))
                          }
                          disabled={busy}
                          aria-label={translate("chaster.portal.sandbox_remove_row")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("chaster.portal.sandbox_add_activity")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={activityBody}
              onChange={(e) => setActivityBody(e.target.value)}
              placeholder={translate("chaster.portal.sandbox_activity_placeholder")}
            />
            <Input
              value={activityDetail}
              onChange={(e) => setActivityDetail(e.target.value)}
              placeholder={translate("chaster.portal.sandbox_activity_detail_ph")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActivityOpen(false)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!activityBody.trim() || busy}
              onClick={() => {
                patch((p) => ({
                  ...p,
                  activities: [
                    {
                      id: crypto.randomUUID(),
                      body: activityBody.trim(),
                      detail: activityDetail.trim() || undefined,
                      occurredAt: new Date().toISOString(),
                    },
                    ...p.activities,
                  ].slice(0, 50),
                }));
                setActivityBody("");
                setActivityDetail("");
                setActivityOpen(false);
              }}
            >
              {translate("ra.action.save", { _: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("chaster.portal.sandbox_add_contact")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={translate("chaster.portal.sandbox_contact_name_ph")}
            />
            <Input
              value={contactSubtitle}
              onChange={(e) => setContactSubtitle(e.target.value)}
              placeholder={translate("chaster.portal.sandbox_contact_sub_ph")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!contactName.trim() || busy}
              onClick={() => {
                patch((p) => ({
                  ...p,
                  hotContacts: [
                    {
                      id: crypto.randomUUID(),
                      name: contactName.trim(),
                      subtitle: contactSubtitle.trim() || undefined,
                    },
                    ...p.hotContacts,
                  ].slice(0, 50),
                }));
                setContactName("");
                setContactSubtitle("");
                setContactOpen(false);
              }}
            >
              {translate("ra.action.save", { _: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("chaster.portal.sandbox_add_task")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder={translate("chaster.portal.sandbox_task_text_ph")}
            />
            <Input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTaskOpen(false)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!taskText.trim() || busy}
              onClick={() => {
                const dueIso = taskDue
                  ? `${taskDue}T12:00:00.000Z`
                  : undefined;
                patch((p) => ({
                  ...p,
                  tasks: [
                    {
                      id: crypto.randomUUID(),
                      text: taskText.trim(),
                      dueAt: dueIso,
                    },
                    ...p.tasks,
                  ].slice(0, 50),
                }));
                setTaskText("");
                setTaskDue("");
                setTaskOpen(false);
              }}
            >
              {translate("ra.action.save", { _: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
