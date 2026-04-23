import { useTranslate } from "ra-core";
import { cn } from "@/lib/utils";
import type { TypingPeer } from "../hooks/useTypingIndicator";

export function TypingIndicator({ peers }: { peers: TypingPeer[] }) {
  const translate = useTranslate();
  if (peers.length === 0) return null;

  let label: string;
  if (peers.length === 1) {
    label = translate("chaster.messages.typing_one", {
      name: peers[0].display_name,
    });
  } else if (peers.length === 2) {
    label = translate("chaster.messages.typing_two", {
      name1: peers[0].display_name,
      name2: peers[1].display_name,
    });
  } else {
    label = translate("chaster.messages.typing_many");
  }

  return (
    <div className="flex items-end gap-2 px-1 py-2">
      <div
        className={cn(
          "rounded-2xl rounded-bl-md px-3 py-2 bg-muted text-muted-foreground text-sm",
          "max-w-[85%]",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          <span>{label}</span>
        </div>
      </div>
      <style>{`
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        .typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: currentColor;
          opacity: 0.7;
          animation: typingBounce 1.2s infinite;
        }
        .typing-dot:nth-child(1) { animation-delay: 0s; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
    </div>
  );
}
