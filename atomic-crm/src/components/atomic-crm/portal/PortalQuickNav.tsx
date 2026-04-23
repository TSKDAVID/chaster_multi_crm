import type { ComponentType } from "react";
import { Link, useLocation } from "react-router";
import { useTranslate } from "ra-core";
import {
  BookOpen,
  CreditCard,
  Home,
  MessageSquare,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUserRole } from "../access/useCurrentUserRole";

/**
 * Horizontal portal section links — use under the page title on /portal/* sub-routes.
 */
export function PortalQuickNav() {
  const translate = useTranslate();
  const { can } = useCurrentUserRole();
  const { pathname } = useLocation();

  const Item = ({
    to,
    label,
    icon: Icon,
  }: {
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }) => {
    const active =
      to === "/portal"
        ? pathname === "/portal" || pathname === "/portal/"
        : pathname === to || pathname.startsWith(`${to}/`);
    return (
      <Button
        asChild
        variant={active ? "secondary" : "outline"}
        size="sm"
        className={cn(active && "pointer-events-none")}
      >
        <Link to={to} className="inline-flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </Link>
      </Button>
    );
  };

  return (
    <div
      className="flex flex-wrap gap-2 pb-4 border-b border-border/80"
      aria-label={translate("chaster.portal.nav_strip_title")}
    >
      <Item
        to="/portal"
        label={translate("chaster.portal.nav_dashboard")}
        icon={Home}
      />
      <Item
        to="/portal/knowledge-base"
        label={translate("chaster.portal.nav_kb")}
        icon={BookOpen}
      />
      <Item
        to="/portal/team"
        label={translate("chaster.portal.nav_team")}
        icon={Users}
      />
      {can("portal.messages.view") ? (
        <Item
          to="/portal/messages"
          label={translate("chaster.portal.nav_messages")}
          icon={MessageSquare}
        />
      ) : null}
      <Item
        to="/portal/settings"
        label={translate("chaster.portal.nav_settings")}
        icon={SlidersHorizontal}
      />
      {can("portal.subscription") ? (
        <Item
          to="/portal/subscription"
          label={translate("chaster.portal.nav_subscription")}
          icon={CreditCard}
        />
      ) : null}
    </div>
  );
}
