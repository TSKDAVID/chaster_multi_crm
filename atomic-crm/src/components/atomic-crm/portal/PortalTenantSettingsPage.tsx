import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Copy, SlidersHorizontal } from "lucide-react";
import { PortalQuickNav } from "./PortalQuickNav";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useChasterAccess } from "../access/chasterAccessContext";
import { logAuditEvent } from "../access/logAuditEvent";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { buildChasterEmbedSnippet } from "./buildChasterEmbedSnippet";
import {
  CHASTER_PORTAL_EMBED_CHECKLIST_KEY,
  CHASTER_PORTAL_EMBED_COPIED_EVENT,
} from "./portalEmbedChecklist";
import { PortalWidgetPreview } from "./PortalWidgetPreview";
import { PortalSettingsSandbox } from "./PortalSettingsSandbox";

type SettingsRow = {
  id: string;
  tenant_id: string;
  ai_tone: string;
  escalation_threshold: number;
  business_hours_start: string;
  business_hours_end: string;
  timezone: string;
  widget_primary_color: string;
  widget_welcome_message: string;
  widget_position: string;
  crm_module_enabled: boolean;
  widget_module_enabled: boolean;
};

function timeInputValue(pg: string | null | undefined): string {
  if (!pg) return "09:00";
  return pg.slice(0, 5);
}

export function PortalTenantSettingsPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { tenantId } = useChasterAccess();
  const [saving, setSaving] = useState(false);

  const { data: row, isPending } = useQuery({
    queryKey: ["portal-tenant-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<SettingsRow | null> => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as SettingsRow | null;
    },
  });

  const [aiTone, setAiTone] = useState("professional");
  const [escalation, setEscalation] = useState(60);
  const [hStart, setHStart] = useState("09:00");
  const [hEnd, setHEnd] = useState("17:00");
  const [tz, setTz] = useState("UTC");
  const [color, setColor] = useState("#6366f1");
  const [welcome, setWelcome] = useState("");
  const [position, setPosition] = useState("bottom-right");

  useEffect(() => {
    if (!row) return;
    setAiTone(row.ai_tone);
    setEscalation(Math.round((row.escalation_threshold ?? 0.6) * 100));
    setHStart(timeInputValue(row.business_hours_start));
    setHEnd(timeInputValue(row.business_hours_end));
    setTz(row.timezone);
    setColor(row.widget_primary_color);
    setWelcome(row.widget_welcome_message);
    setPosition(row.widget_position);
  }, [row]);

  const embedSnippet =
    tenantId && row
      ? buildChasterEmbedSnippet({
          tenantId,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? "",
          supabaseAnonKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY?.trim() ?? "",
          primaryColor: color,
          welcomeMessage: welcome,
          position,
        })
      : "";

  const copyEmbed = useCallback(async () => {
    if (!embedSnippet) return;
    try {
      await navigator.clipboard.writeText(embedSnippet);
      try {
        localStorage.setItem(CHASTER_PORTAL_EMBED_CHECKLIST_KEY, "1");
        window.dispatchEvent(new Event(CHASTER_PORTAL_EMBED_COPIED_EVENT));
      } catch {
        /* ignore quota / private mode */
      }
      notify(translate("chaster.portal.settings_embed_copied"), { type: "success" });
    } catch {
      notify(translate("chaster.portal.settings_embed_copy_error"), { type: "error" });
    }
  }, [embedSnippet, notify, translate]);

  const save = useCallback(async () => {
    if (!tenantId || !row) return;
    setSaving(true);
    try {
      const payload = {
        ai_tone: aiTone,
        escalation_threshold: Math.min(100, Math.max(0, escalation)) / 100,
        business_hours_start: `${hStart}:00`,
        business_hours_end: `${hEnd}:00`,
        timezone: tz,
        widget_primary_color: color,
        widget_welcome_message: welcome,
        widget_position: position,
      };
      const { error } = await getSupabaseClient()
        .from("tenant_settings")
        .update(payload)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      await logAuditEvent({
        action: "tenant_settings_updated",
        tenantId,
        metadata: { fields: Object.keys(payload) },
      });

      await queryClient.invalidateQueries({ queryKey: ["portal-tenant-settings", tenantId] });
      await queryClient.invalidateQueries({
        queryKey: ["portal-tenant-home-flags", tenantId],
      });
      notify(translate("chaster.portal.settings_saved"), { type: "success" });
    } catch (e) {
      console.error(e);
      notify(translate("chaster.portal.settings_save_error"), { type: "error" });
    } finally {
      setSaving(false);
    }
  }, [
    tenantId,
    row,
    aiTone,
    escalation,
    hStart,
    hEnd,
    tz,
    color,
    welcome,
    position,
    queryClient,
    notify,
    translate,
  ]);

  return (
    <TenantPortalGuard>
      <div className="max-w-screen-xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <SlidersHorizontal className="h-7 w-7" />
            {translate("chaster.portal.settings_title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {translate("chaster.portal.settings_desc")}
          </p>
        </div>

        <PortalQuickNav />

        {isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : !row ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {translate("chaster.portal.settings_missing")}
            </CardContent>
          </Card>
        ) : (
          <>
            <PermissionGate
              permission="portal.tenant_settings"
              fallback={
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    {translate("chaster.portal.settings_readonly")}
                  </CardContent>
                </Card>
              }
            >
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {translate("chaster.portal.settings_ai_heading")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label>{translate("chaster.portal.settings_tone")}</Label>
                      <Select value={aiTone} onValueChange={setAiTone}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {translate("chaster.portal.settings_escalation")}: {escalation}%
                      </Label>
                      <Input
                        type="range"
                        min={0}
                        max={100}
                        value={escalation}
                        onChange={(e) => setEscalation(Number(e.target.value))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{translate("chaster.portal.settings_hours_start")}</Label>
                        <Input
                          type="time"
                          value={hStart}
                          onChange={(e) => setHStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{translate("chaster.portal.settings_hours_end")}</Label>
                        <Input
                          type="time"
                          value={hEnd}
                          onChange={(e) => setHEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{translate("chaster.portal.settings_timezone")}</Label>
                      <Input
                        value={tz}
                        onChange={(e) => setTz(e.target.value)}
                        placeholder="UTC"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {translate("chaster.portal.settings_widget_heading")}
                    </CardTitle>
                    <CardDescription>
                      {row.widget_module_enabled
                        ? translate("chaster.portal.checklist_widget")
                        : "Widget module is disabled for this subscription package."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {row.widget_module_enabled ? (
                      <>
                        <div className="grid gap-6 md:grid-cols-2 md:items-start">
                          <div className="space-y-4 max-w-md">
                            <div className="space-y-2">
                              <Label>{translate("chaster.portal.settings_widget_color")}</Label>
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="color"
                                  className="h-10 w-14 p-1 cursor-pointer"
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                />
                                <Input
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>{translate("chaster.portal.settings_widget_message")}</Label>
                              <Textarea
                                value={welcome}
                                onChange={(e) => setWelcome(e.target.value)}
                                rows={3}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{translate("chaster.portal.settings_widget_position")}</Label>
                              <Select value={position} onValueChange={setPosition}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bottom-right">
                                    {translate("chaster.portal.settings_pos_bottom_right")}
                                  </SelectItem>
                                  <SelectItem value="bottom-left">
                                    {translate("chaster.portal.settings_pos_bottom_left")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{translate("chaster.portal.settings_preview_heading")}</Label>
                            <PortalWidgetPreview
                              primaryColor={color}
                              welcomeMessage={welcome}
                              position={position}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor="chaster-embed-snippet">
                              {translate("chaster.portal.settings_embed_heading")}
                            </Label>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => void copyEmbed()}
                            >
                              <Copy className="h-4 w-4" />
                              {translate("chaster.portal.settings_embed_copy")}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {translate("chaster.portal.settings_embed_hint")}
                          </p>
                          <Textarea
                            id="chaster-embed-snippet"
                            readOnly
                            rows={6}
                            className="font-mono text-xs"
                            value={embedSnippet}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This tenant currently has CRM access only. Enable widget module from the
                        subscription test flow to configure and embed chat.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {translate("chaster.portal.settings_sandbox_heading")}
                    </CardTitle>
                    <CardDescription>
                      {translate("chaster.portal.settings_sandbox_desc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PortalSettingsSandbox />
                  </CardContent>
                </Card>

                <Button type="button" disabled={saving} onClick={() => void save()}>
                  {saving
                    ? translate("chaster.portal.settings_saving")
                    : translate("chaster.portal.settings_save")}
                </Button>
              </div>
            </PermissionGate>
          </>
        )}
      </div>
    </TenantPortalGuard>
  );
}
