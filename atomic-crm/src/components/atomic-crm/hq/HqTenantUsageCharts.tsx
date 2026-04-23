import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";
import { useMemo } from "react";

export type HqUsageMessagesPoint = { day: string; messages: number };
export type HqUsageResolutionRow = { segment: string; rate: number };
export type HqUsageDocsPoint = { week: string; docs: number };

export type HqTenantUsageChartsProps = {
  messagesPerDay?: HqUsageMessagesPoint[];
  resolutionRates?: HqUsageResolutionRow[];
  documentsByWeek?: HqUsageDocsPoint[];
};

const defaultMessages: HqUsageMessagesPoint[] = Array.from(
  { length: 14 },
  (_, i) => ({
    day: `D${i + 1}`,
    messages: Math.max(0, Math.round(8 + Math.sin(i / 2) * 5)),
  }),
);

const defaultResolution: HqUsageResolutionRow[] = [
  { segment: "AI", rate: 62 },
  { segment: "Human", rate: 38 },
];

const defaultDocs: HqUsageDocsPoint[] = [
  { week: "W1", docs: 2 },
  { week: "W2", docs: 4 },
  { week: "W3", docs: 3 },
  { week: "W4", docs: 5 },
];

/**
 * Placeholder charts (ideas §4.2). Pass real series when product analytics exist.
 */
export function HqTenantUsageCharts({
  messagesPerDay = defaultMessages,
  resolutionRates = defaultResolution,
  documentsByWeek = defaultDocs,
}: HqTenantUsageChartsProps) {
  const translate = useTranslate();

  const messagesData = useMemo(
    () => messagesPerDay.map((p) => ({ day: p.day, messages: p.messages })),
    [messagesPerDay],
  );

  const resolutionData = useMemo(
    () =>
      resolutionRates.map((r) => ({
        segment: r.segment,
        rate: r.rate,
      })),
    [resolutionRates],
  );

  const docsData = useMemo(
    () => documentsByWeek.map((p) => ({ week: p.week, docs: p.docs })),
    [documentsByWeek],
  );

  const axisMuted = {
    ticks: { text: { fill: "var(--color-muted-foreground)" } },
    legend: { text: { fill: "var(--color-muted-foreground)" } },
  };

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground">
        {translate("chaster.hq.usage_mock_hint")}
      </p>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {translate("chaster.hq.usage_chart_messages")}
          </h3>
          <div className="h-48 w-full">
            <ResponsiveBar
              data={messagesData}
              keys={["messages"]}
              indexBy="day"
              margin={{ top: 8, right: 8, bottom: 32, left: 36 }}
              padding={0.35}
              colors={["#6366f1"]}
              axisBottom={{ tickRotation: -35, ...axisMuted }}
              axisLeft={{ ...axisMuted }}
              enableLabel={false}
            />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {translate("chaster.hq.usage_chart_resolution")}
          </h3>
          <div className="h-48 w-full">
            <ResponsiveBar
              data={resolutionData}
              keys={["rate"]}
              indexBy="segment"
              layout="horizontal"
              margin={{ top: 8, right: 24, bottom: 8, left: 72 }}
              padding={0.45}
              colors={["#22c55e", "#f97316"]}
              axisBottom={{ format: (v) => `${v}%`, ...axisMuted }}
              axisLeft={{ ...axisMuted }}
              enableLabel={false}
            />
          </div>
        </div>
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {translate("chaster.hq.usage_chart_documents")}
          </h3>
          <div className="h-48 w-full max-w-2xl">
            <ResponsiveBar
              data={docsData}
              keys={["docs"]}
              indexBy="week"
              margin={{ top: 8, right: 8, bottom: 32, left: 36 }}
              padding={0.4}
              colors={["#94a3b8"]}
              axisBottom={{ ...axisMuted }}
              axisLeft={{ ...axisMuted }}
              enableLabel={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
