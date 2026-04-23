import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useGetIdentity, useTranslate } from "ra-core";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Info,
  LayoutDashboard,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { useChasterAccess } from "../access/chasterAccessContext";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { Dashboard } from "../dashboard/Dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { isTenantAiCustomized } from "./tenantAiSettings";
import { TenantWorkspaceStats } from "./TenantWorkspaceStats";
import { useTenantWorkspaceCounts } from "./useTenantWorkspaceCounts";
import {
  CHASTER_PORTAL_EMBED_CHECKLIST_KEY,
  CHASTER_PORTAL_EMBED_COPIED_EVENT,
} from "./portalEmbedChecklist";

export const PortalHomePagePath = "/portal";

/** Client company home: welcome, Phase 5.1 placeholders, embedded CRM dashboard. */
export function PortalHomePage() {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const { tenantId } = useChasterAccess();
  const { can, isOwnerSide } = useCurrentUserRole();

  const rawName = identity?.fullName;
  const firstName =
    typeof rawName === "string"
      ? rawName.split(/\s+/).filter(Boolean)[0] ?? translate("chaster.portal.guest_name")
      : translate("chaster.portal.guest_name");

  const { data: tenantRow } = useQuery({
    queryKey: ["portal-tenant-name", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenants")
        .select("company_name")
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const companyName =
    typeof tenantRow?.company_name === "string" ? tenantRow.company_name : "…";

  const { teamCount, kbCount } = useTenantWorkspaceCounts(tenantId);

  const [embedCopied, setEmbedCopied] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setEmbedCopied(localStorage.getItem(CHASTER_PORTAL_EMBED_CHECKLIST_KEY) === "1");
      } catch {
        setEmbedCopied(false);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener(CHASTER_PORTAL_EMBED_COPIED_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(CHASTER_PORTAL_EMBED_COPIED_EVENT, read);
    };
  }, []);

  const { data: homeFlags } = useQuery({
    queryKey: ["portal-tenant-home-flags", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const [tRes, sRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("status, trial_ends_at")
          .eq("id", tenantId!)
          .maybeSingle(),
        supabase
          .from("tenant_settings")
          .select(
            "ai_tone, escalation_threshold, widget_primary_color, widget_welcome_message",
          )
          .eq("tenant_id", tenantId!)
          .maybeSingle(),
      ]);
      if (tRes.error) throw tRes.error;
      if (sRes.error) throw sRes.error;
      return { tenant: tRes.data, settings: sRes.data };
    },
  });

  const aiChecklistDone = isTenantAiCustomized(homeFlags?.settings ?? null);

  const trialBanner = useMemo(() => {
    if (homeFlags?.tenant?.status !== "trial") return null;
    const end = homeFlags.tenant.trial_ends_at;
    if (!end) return { kind: "generic" as const };
    const days = Math.ceil(
      (new Date(end).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (days < 0) return { kind: "over" as const };
    if (days <= 1) return { kind: "last" as const };
    return { kind: "days" as const, days };
  }, [homeFlags]);

  return (
    <TenantPortalGuard>
      <div className="max-w-screen-xl mx-auto space-y-6">
        <div className="px-4 pt-2 space-y-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-7 w-7" />
            {translate("chaster.portal.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {translate("chaster.portal.welcome", {
              name: firstName,
              company: companyName,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {translate("chaster.portal.subtitle")}
          </p>
        </div>

        {isOwnerSide ? (
          <div className="px-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{translate("chaster.portal.hq_staff_banner_title")}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  {translate("chaster.portal.hq_staff_banner_body")}
                </span>
                <Button asChild variant="secondary" size="sm" className="shrink-0">
                  <Link to="/hq">{translate("chaster.portal.hq_staff_banner_cta")}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {tenantId && trialBanner ? (
          <div className="px-4">
            <Alert className="border-amber-500/40 bg-amber-500/5">
              <Clock className="text-amber-700 dark:text-amber-400" />
              <AlertTitle>{translate("chaster.portal.trial_banner_title")}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {trialBanner.kind === "generic"
                    ? translate("chaster.portal.trial_banner_generic")
                    : trialBanner.kind === "over"
                      ? translate("chaster.portal.trial_banner_over")
                      : trialBanner.kind === "last"
                        ? translate("chaster.portal.trial_banner_last")
                        : translate("chaster.portal.trial_banner_days", {
                            count: trialBanner.days,
                          })}
                </span>
                <Button asChild size="sm" variant="secondary" className="shrink-0">
                  <Link to="/portal/subscription">
                    {translate("chaster.portal.trial_banner_cta")}
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {tenantId ? (
          <div className="px-4">
            <Card className="border-primary/25 bg-primary/5 dark:bg-primary/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {translate("chaster.portal.nav_strip_title")}
                </CardTitle>
                <CardDescription>
                  {translate("chaster.portal.nav_strip_hint")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to="/portal/knowledge-base"
                    className="inline-flex items-center gap-2"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {translate("chaster.portal.nav_kb")}
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to="/portal/team"
                    className="inline-flex items-center gap-2"
                  >
                    <Users className="h-4 w-4 shrink-0" />
                    {translate("chaster.portal.nav_team")}
                  </Link>
                </Button>
                {can("portal.messages.view") ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      to="/portal/messages"
                      className="inline-flex items-center gap-2"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      {translate("chaster.portal.nav_messages")}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to="/portal/settings"
                    className="inline-flex items-center gap-2"
                  >
                    <SlidersHorizontal className="h-4 w-4 shrink-0" />
                    {translate("chaster.portal.nav_settings")}
                  </Link>
                </Button>
                {can("portal.subscription") ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      to="/portal/subscription"
                      className="inline-flex items-center gap-2"
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      {translate("chaster.portal.nav_subscription")}
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tenantId ? (
          <div className="px-4 space-y-2">
            {isOwnerSide ? (
              <p className="text-sm font-medium text-muted-foreground">
                {translate("chaster.portal.stats_section_hq_staff")}
              </p>
            ) : null}
            <TenantWorkspaceStats tenantId={tenantId} />
          </div>
        ) : null}

        {tenantId ? (
          <div className="px-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {translate("chaster.portal.checklist_title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <ChecklistRow
                  done={kbCount > 0}
                  label={translate("chaster.portal.checklist_kb")}
                  to="/portal/knowledge-base"
                />
                <ChecklistRow
                  done={aiChecklistDone}
                  label={translate("chaster.portal.checklist_ai")}
                  to="/portal/settings"
                />
                <ChecklistRow
                  done={teamCount > 1}
                  label={translate("chaster.portal.checklist_invite")}
                  to="/portal/team"
                />
                <ChecklistRow
                  done={embedCopied}
                  label={translate("chaster.portal.checklist_widget")}
                  to="/portal/settings"
                />
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="px-4">
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {translate("chaster.portal.subscription_placeholder")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.portal.subscription_placeholder_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to="/portal/subscription">
                  {translate("chaster.portal.nav_subscription")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 pb-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link
              to="/portal/knowledge-base"
              className="inline-flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              {translate("chaster.portal.nav_kb")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/contacts" className="inline-flex items-center gap-2">
              {translate("chaster.portal.quick_contacts")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/companies">{translate("chaster.portal.quick_companies")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/deals">{translate("chaster.portal.quick_deals")}</Link>
          </Button>
        </div>

        <Dashboard />
      </div>
    </TenantPortalGuard>
  );
}

function ChecklistRow({
  done,
  label,
  to,
}: {
  done: boolean;
  label: string;
  to?: string;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  const text = to ? (
    <Link
      to={to}
      className={`underline-offset-2 hover:underline ${
        done ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 shrink-0 ${done ? "text-emerald-600" : ""}`} />
      {text}
    </div>
  );
}
