import { useTranslate } from "ra-core";
import { MessageCircle } from "lucide-react";

type Props = {
  primaryColor: string;
  welcomeMessage: string;
  position: "bottom-left" | "bottom-right" | string;
};

/** In-page mock of the corner launcher + open panel (no network). */
export function PortalWidgetPreview({ primaryColor, welcomeMessage, position }: Props) {
  const translate = useTranslate();
  const isLeft = position === "bottom-left";
  const launcherSide = isLeft ? "left-3" : "right-3";
  const panelSide = isLeft ? "left-3" : "right-3";
  const panelOrigin = isLeft ? "origin-bottom-left" : "origin-bottom-right";

  const msg =
    welcomeMessage.trim() ||
    "Hi! How can we help?";

  return (
    <div
      className="relative rounded-lg border bg-muted/30 overflow-hidden min-h-[260px]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/50" />
      <p className="absolute top-2 left-3 text-[10px] uppercase tracking-wide text-muted-foreground">
        {translate("chaster.portal.settings_preview_badge")}
      </p>
      <div
        className={`absolute bottom-[4.5rem] ${panelSide} w-[min(100%-1.5rem,240px)] rounded-lg border bg-card shadow-md ${panelOrigin} animate-in fade-in zoom-in-95 duration-200`}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-lg text-primary-foreground text-sm font-medium"
          style={{ backgroundColor: primaryColor }}
        >
          <MessageCircle className="h-4 w-4 shrink-0 opacity-90" />
          <span className="truncate">
            {translate("chaster.portal.settings_preview_chat_label")}
          </span>
        </div>
        <div className="p-3 text-sm text-muted-foreground border-t bg-card rounded-b-lg min-h-[72px]">
          {msg}
        </div>
      </div>
      <button
        type="button"
        tabIndex={-1}
        className={`absolute bottom-3 ${launcherSide} h-12 w-12 rounded-full shadow-lg flex items-center justify-center text-primary-foreground pointer-events-none`}
        style={{ backgroundColor: primaryColor }}
        aria-hidden
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
