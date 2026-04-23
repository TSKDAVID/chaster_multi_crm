import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslate } from "ra-core";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const HqWorkspaceTeamPath = "/hq/workspace/team";
export const HqWorkspaceKbPath = "/hq/workspace/knowledge-base";

type Tab = "team" | "kb";

export function HqWorkspaceShell({
  active,
  children,
}: {
  active: Tab;
  children: ReactNode;
}) {
  const translate = useTranslate();

  return (
    <div className="max-w-screen-xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-1 -ml-2">
          <Link to="/hq">
            <ArrowLeft className="h-4 w-4" />
            {translate("chaster.hq.workspace_back")}
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground sm:max-w-md sm:text-right">
          {translate("chaster.hq.workspace_context_note")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Link
          to={HqWorkspaceTeamPath}
          className={cn(
            "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
            active === "team"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {translate("chaster.hq.workspace_tab_team")}
        </Link>
        <Link
          to={HqWorkspaceKbPath}
          className={cn(
            "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
            active === "kb"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {translate("chaster.hq.workspace_tab_kb")}
        </Link>
      </div>

      {children}
    </div>
  );
}
