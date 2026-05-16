import { useTranslate } from "ra-core";
import { cn } from "@/lib/utils";

export type HqSupportMetrics = {
  open: number;
  unassigned: number;
  unread: number;
  slaBreached: number;
  new7d: number;
};

export function HqSupportMetricsStrip({
  metrics,
  activeKey,
  onSelect,
}: {
  metrics: HqSupportMetrics;
  activeKey?: string | null;
  onSelect: (key: "open" | "unassigned" | "unread" | "sla" | "new7d" | null) => void;
}) {
  const translate = useTranslate();

  const items: {
    key: "open" | "unassigned" | "unread" | "sla" | "new7d";
    label: string;
    value: number | string;
    alert?: boolean;
  }[] = [
    {
      key: "open",
      label: translate("chaster.hq.support.kpi_open"),
      value: metrics.open,
    },
    {
      key: "unassigned",
      label: translate("chaster.hq.support.kpi_unassigned"),
      value: metrics.unassigned,
    },
    {
      key: "unread",
      label: translate("chaster.hq.support.kpi_unread_client"),
      value: metrics.unread,
    },
    {
      key: "sla",
      label: translate("chaster.hq.support.kpi_sla_breached"),
      value: metrics.slaBreached,
      alert: metrics.slaBreached > 0,
    },
    {
      key: "new7d",
      label: translate("chaster.hq.support.kpi_new_7d"),
      value: metrics.new7d,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(active ? null : item.key)}
            className={cn(
              "rounded-lg border px-2.5 py-2 text-left transition-colors",
              item.alert && !active && "border-red-500/30 bg-red-500/5",
              active
                ? "border-primary bg-primary/10"
                : "border-border/70 bg-muted/20 hover:bg-muted/40",
            )}
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {item.value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
