import { Component, type ErrorInfo } from "react";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SupportComposer } from "./SupportComposer";
import type { SupportReplySnippetRow } from "../supportTypes";

type ComposerProps = React.ComponentProps<typeof SupportComposer>;

function MinimalSupportComposer({
  body,
  onBodyChange,
  files,
  onFilesChange,
  onSend,
  sending,
  disabled,
}: Pick<
  ComposerProps,
  "body" | "onBodyChange" | "files" | "onFilesChange" | "onSend" | "sending" | "disabled"
>) {
  const translate = useTranslate();
  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4">
      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={translate("chaster.portal.support.thread_placeholder")}
        rows={4}
        disabled={disabled}
        className="min-h-[6rem] resize-y bg-background"
      />
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={onSend} disabled={disabled || sending}>
          {translate("chaster.portal.support.thread_send")}
        </Button>
      </div>
    </div>
  );
}

/** Isolates composer toolbar failures so the case thread still renders. */
export class SupportComposerErrorBoundary extends Component<
  ComposerProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SupportComposer crashed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <MinimalSupportComposer
          body={this.props.body}
          onBodyChange={this.props.onBodyChange}
          files={this.props.files}
          onFilesChange={this.props.onFilesChange}
          onSend={this.props.onSend}
          sending={this.props.sending}
          disabled={this.props.disabled}
        />
      );
    }
    return <SupportComposer {...this.props} />;
  }
}

export function SafeSupportComposer(
  props: ComposerProps & { snippets: SupportReplySnippetRow[] },
) {
  return <SupportComposerErrorBoundary {...props} />;
}
