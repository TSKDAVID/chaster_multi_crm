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

  const maxMessages = Math.max(1, ...messagesData.map((p) => p.messages));
  const maxDocs = Math.max(1, ...docsData.map((p) => p.docs));
  const maxRate = Math.max(1, ...resolutionData.map((p) => p.rate));

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
          <div className="w-full rounded-md border p-3">
            <div className="flex h-40 items-end gap-1">
              {messagesData.map((point) => (
                <div key={point.day} className="flex-1 min-w-0">
                  <div
                    className="w-full rounded-sm bg-indigo-500/80"
                    style={{ height: `${Math.max(6, (point.messages / maxMessages) * 140)}px` }}
                    title={`${point.day}: ${point.messages}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {messagesData.map((point) => point.day).join(" · ")}
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {translate("chaster.hq.usage_chart_resolution")}
          </h3>
          <div className="space-y-3 rounded-md border p-3">
            {resolutionData.map((row, idx) => (
              <div key={row.segment} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{row.segment}</span>
                  <span className="tabular-nums text-muted-foreground">{row.rate}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={idx % 2 === 0 ? "h-full bg-green-500" : "h-full bg-orange-500"}
                    style={{ width: `${Math.max(2, (row.rate / maxRate) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {translate("chaster.hq.usage_chart_documents")}
          </h3>
          <div className="w-full max-w-2xl rounded-md border p-3">
            <div className="flex h-40 items-end gap-3">
              {docsData.map((point) => (
                <div key={point.week} className="flex-1 min-w-0">
                  <div
                    className="mx-auto w-8 max-w-full rounded-t-sm bg-slate-500/80"
                    style={{ height: `${Math.max(8, (point.docs / maxDocs) * 140)}px` }}
                    title={`${point.week}: ${point.docs}`}
                  />
                  <div className="mt-1 text-center text-[11px] text-muted-foreground">
                    {point.week}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
