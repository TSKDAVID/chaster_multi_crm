import { Component, type ErrorInfo, type ReactNode } from "react";
import { SupportComposer } from "./SupportComposer";
import type { SupportReplySnippetRow } from "../supportTypes";

type ComposerProps = React.ComponentProps<typeof SupportComposer>;

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
        <SupportComposer
          {...this.props}
          snippets={[]}
          canManageSnippets={false}
          onSuggest={undefined}
        />
      );
    }
    return <SupportComposer {...this.props} />;
  }
}

export function SafeSupportComposer(props: ComposerProps & { snippets: SupportReplySnippetRow[] }) {
  return <SupportComposerErrorBoundary {...props} />;
}
