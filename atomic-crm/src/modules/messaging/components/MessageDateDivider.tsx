import { useTranslate } from "ra-core";

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function isToday(d: Date): boolean {
  return startOfLocalDay(d) === startOfLocalDay(new Date());
}

function isYesterday(d: Date): boolean {
  const t = new Date();
  t.setDate(t.getDate() - 1);
  return startOfLocalDay(d) === startOfLocalDay(t);
}

export function MessageDateDivider({ iso }: { iso: string }) {
  const translate = useTranslate();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  let text: string;
  if (isToday(d)) text = translate("chaster.messages.divider_today");
  else if (isYesterday(d)) text = translate("chaster.messages.divider_yesterday");
  else
    text = d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });

  return (
    <div className="flex justify-center py-3">
      <span className="text-xs text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}
