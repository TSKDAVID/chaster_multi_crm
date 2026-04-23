import type { ComponentType } from "react";
import { useEffect } from "react";
import {
  CircleHelp,
  Import,
  MessageSquare,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import { CanAccess, useTranslate, useUserMenu } from "ra-core";
import { Link, matchPath, useLocation, useNavigate } from "react-router";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { useMessagingUnreadTotal } from "@/modules/messaging/hooks/useMessagingUnread";
import { UnreadBadge } from "@/modules/messaging/components/UnreadBadge";
import {
  useSupportPortalUnreadTotal,
  useSupportStaffUnreadTotal,
} from "@/modules/support/hooks/useSupportUnread";

const Header = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const translate = useTranslate();
  const {
    isOwnerSide,
    tenantId,
    isLoading: accessLoading,
    can,
  } = useCurrentUserRole();

  const homeTo =
    accessLoading ? "/" : isOwnerSide ? "/hq" : tenantId ? "/portal" : "/";
  const path = location.pathname;
  const portalDashActive = path === "/portal" || path === "/portal/";
  const isHomeActive = !accessLoading && isOwnerSide
    ? Boolean(matchPath({ path: "/hq", end: false }, path)) ||
      (homeTo === "/hq" && Boolean(matchPath("/", path)))
    : tenantId
      ? portalDashActive
      : Boolean(matchPath("/", path));

  let currentPath: string | boolean = "/";
  if (matchPath("/", path)) {
    currentPath = "/";
  } else if (matchPath({ path: "/hq", end: false }, path)) {
    currentPath = "/hq";
  } else if (
    matchPath({ path: "/portal", end: true }, path) ||
    matchPath("/portal/*", path)
  ) {
    currentPath = "/portal";
  } else if (matchPath("/contacts/*", path)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", path)) {
    currentPath = "/companies";
  } else if (matchPath("/deals/*", path)) {
    currentPath = "/deals";
  } else {
    currentPath = false;
  }

  const showPortalNav = !accessLoading && !isOwnerSide && !!tenantId;
  const portalKbActive = path.startsWith("/portal/knowledge-base");
  const portalTeamActive = path.startsWith("/portal/team");
  const portalSettingsActive = path.startsWith("/portal/settings");
  const portalSubActive = path.startsWith("/portal/subscription");
  const portalMessagesActive = path.startsWith("/portal/messages");
  const portalSupportActive = path.startsWith("/portal/support");
  const hqMessagesActive = path.startsWith("/hq/messages");
  const hqSupportActive = path.startsWith("/hq/support");

  const messagingUnread = useMessagingUnreadTotal(
    !accessLoading && !isOwnerSide && !!tenantId && can("portal.messages.view"),
  );
  const hqMessagingUnread = useMessagingUnreadTotal(
    !accessLoading && isOwnerSide && can("hq.messages.view"),
  );

  const supportPortalUnread = useSupportPortalUnreadTotal(
    !accessLoading &&
      !isOwnerSide &&
      !!tenantId &&
      can("portal.support.view"),
  );
  const supportStaffUnread = useSupportStaffUnreadTotal(
    !accessLoading && isOwnerSide && can("hq.support.cases.read"),
  );

  useEffect(() => {
    const portalHelp =
      !accessLoading && !isOwnerSide && !!tenantId && can("portal.support.view");
    if (!portalHelp) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        navigate("/portal/support");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accessLoading, isOwnerSide, tenantId, can, navigate]);

  return (
    <>
      <nav className="grow">
        <header className="bg-secondary">
          <div className="px-4">
            <div className="flex justify-between items-center flex-1">
              <Link
                to={homeTo}
                className="flex items-center gap-2 text-secondary-foreground no-underline"
              >
                <img
                  className="[.light_&]:hidden h-6"
                  src={darkModeLogo}
                  alt={title}
                />
                <img
                  className="[.dark_&]:hidden h-6"
                  src={lightModeLogo}
                  alt={title}
                />
                <h1 className="text-xl font-semibold">{title}</h1>
              </Link>
              <div>
                <nav className="flex">
                  <NavigationTab
                    label={translate("ra.page.dashboard")}
                    to={homeTo}
                    isActive={isHomeActive}
                  />
                  {isOwnerSide || (!tenantId && !isOwnerSide) ? (
                    <NavigationTab
                      label={translate("chaster.header.portal")}
                      to="/portal"
                      isActive={currentPath === "/portal"}
                    />
                  ) : null}
                  <NavigationTab
                    label={translate("resources.contacts.name", {
                      smart_count: 2,
                    })}
                    to="/contacts"
                    isActive={currentPath === "/contacts"}
                  />
                  <NavigationTab
                    label={translate("resources.companies.name", {
                      smart_count: 2,
                    })}
                    to="/companies"
                    isActive={currentPath === "/companies"}
                  />
                  <NavigationTab
                    label={translate("resources.deals.name", {
                      smart_count: 2,
                    })}
                    to="/deals"
                    isActive={currentPath === "/deals"}
                  />
                  {isOwnerSide && can("hq.messages.view") ? (
                    <NavigationTab
                      label={translate("chaster.messages.client_conversations")}
                      to="/hq/messages"
                      isActive={hqMessagesActive}
                      badge={hqMessagingUnread.data ?? 0}
                    />
                  ) : null}
                  {isOwnerSide && can("hq.support.cases.read") ? (
                    <NavigationTab
                      label={translate("chaster.hq.support.cases_title")}
                      to="/hq/support/cases"
                      isActive={hqSupportActive}
                      badge={supportStaffUnread.data ?? 0}
                    />
                  ) : null}
                </nav>
              </div>
              <div className="flex items-center gap-1">
                {!accessLoading &&
                !isOwnerSide &&
                tenantId &&
                can("portal.support.view") ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-secondary-foreground shrink-0"
                    title={translate("chaster.portal.support.help_shortcut_title")}
                    aria-label={translate(
                      "chaster.portal.support.help_shortcut_title",
                    )}
                    onClick={() => navigate("/portal/support")}
                  >
                    <CircleHelp className="h-5 w-5" />
                  </Button>
                ) : null}
                <ThemeModeToggle />
                <RefreshButton />
                <UserMenu>
                  <ProfileMenu />
                  <CanAccess resource="sales" action="list">
                    <UsersMenu />
                  </CanAccess>
                  <CanAccess resource="configuration" action="edit">
                    <SettingsMenu />
                  </CanAccess>
                  <ImportFromJsonMenuItem />
                </UserMenu>
              </div>
            </div>
          </div>
          {showPortalNav ? (
            <div className="flex flex-wrap gap-1 px-4 py-2 border-t border-black/5 dark:border-white/10 text-xs sm:text-sm">
              <PortalNavLink
                to="/portal"
                label={translate("chaster.portal.nav_dashboard")}
                isActive={portalDashActive}
              />
              <PortalNavLink
                to="/portal/knowledge-base"
                label={translate("chaster.portal.nav_kb")}
                isActive={portalKbActive}
              />
              <PortalNavLink
                to="/portal/team"
                label={translate("chaster.portal.nav_team")}
                isActive={portalTeamActive}
              />
              {can("portal.messages.view") ? (
                <PortalNavLink
                  to="/portal/messages"
                  label={translate("chaster.portal.nav_messages")}
                  isActive={portalMessagesActive}
                  badge={messagingUnread.data ?? 0}
                  icon={MessageSquare}
                />
              ) : null}
              {can("portal.support.view") ? (
                <PortalNavLink
                  to="/portal/support"
                  label={translate("chaster.portal.nav_support")}
                  isActive={portalSupportActive}
                  badge={supportPortalUnread.data ?? 0}
                  icon={CircleHelp}
                />
              ) : null}
              <PortalNavLink
                to="/portal/settings"
                label={translate("chaster.portal.nav_settings")}
                isActive={portalSettingsActive}
              />
              {can("portal.subscription") ? (
                <PortalNavLink
                  to="/portal/subscription"
                  label={translate("chaster.portal.nav_subscription")}
                  isActive={portalSubActive}
                />
              ) : null}
            </div>
          ) : null}
        </header>
      </nav>
    </>
  );
};

const PortalNavLink = ({
  to,
  label,
  isActive,
  badge = 0,
  icon: Icon,
}: {
  to: string;
  label: string;
  isActive: boolean;
  badge?: number;
  icon?: ComponentType<{ className?: string }>;
}) => (
  <Link
    to={to}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
      isActive
        ? "bg-secondary-foreground/15 text-secondary-foreground"
        : "text-secondary-foreground/70 hover:text-secondary-foreground hover:bg-secondary-foreground/10"
    }`}
  >
    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
    {label}
    {badge > 0 ? <UnreadBadge count={badge} /> : null}
  </Link>
);

const NavigationTab = ({
  label,
  to,
  isActive,
  badge = 0,
}: {
  label: string;
  to: string;
  isActive: boolean;
  badge?: number;
}) => (
  <Link
    to={to}
    className={`inline-flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? "text-secondary-foreground border-secondary-foreground"
        : "text-secondary-foreground/70 border-transparent hover:text-secondary-foreground/80"
    }`}
  >
    {label}
    {badge > 0 ? <UnreadBadge count={badge} /> : null}
  </Link>
);

const UsersMenu = () => {
  const translate = useTranslate();
  const { isOwnerSide } = useCurrentUserRole();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <>
      {isOwnerSide ? (
        <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
          <Link to="/hq/platform-team" className="flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 opacity-80" />
            {translate("chaster.hq.menu_platform_team")}
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
        <Link to="/sales" className="flex items-center gap-2">
          <Users />
          {isOwnerSide
            ? translate("chaster.hq.menu_crm_users")
            : translate("resources.sales.name", { smart_count: 2 })}
        </Link>
      </DropdownMenuItem>
    </>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};
export default Header;
