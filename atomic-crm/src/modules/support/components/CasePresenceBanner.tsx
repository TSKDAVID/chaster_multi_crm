import { useTranslate } from "ra-core";
import { Eye } from "lucide-react";
import type { CasePresencePeer } from "../hooks/useCasePresence";

export function CasePresenceBanner({
  peers,
  variant,
}: {
  peers: CasePresencePeer[];
  variant: "portal" | "hq";
}) {
  const translate = useTranslate();
  if (peers.length === 0) return null;

  if (variant === "hq") {
    const names = peers.map((p) => p.display_name).join(", ");
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
        <Eye className="h-4 w-4 shrink-0" />
        <span>{translate("chaster.support.presence_staff", { names })}</span>
      </div>
    );
  }

  const tenantPeers = peers.filter((p) => !p.is_staff);
  const staffPresent = peers.some((p) => p.is_staff);

  if (tenantPeers.length > 0) {
    const names = tenantPeers.map((p) => p.display_name).join(", ");
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <span>{translate("chaster.support.presence_team", { names })}</span>
      </div>
    );
  }

  if (staffPresent) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <span>{translate("chaster.support.presence_chaster")}</span>
      </div>
    );
  }

  return null;
}
