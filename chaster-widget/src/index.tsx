import { render } from "preact";

import { App } from "./App";
import { widgetStyles } from "./styles";
import type { ChasterWidgetConfig } from "./types";

export interface WidgetHandle {
  destroy: () => void;
}

function resolveContainer(container?: string | HTMLElement): HTMLElement {
  if (!container) {
    const div = document.createElement("div");
    div.id = "chaster-widget-root";
    document.body.appendChild(div);
    return div;
  }
  if (typeof container === "string") {
    const selected = document.querySelector(container);
    if (!(selected instanceof HTMLElement)) {
      throw new Error(`Container not found: ${container}`);
    }
    return selected;
  }
  return container;
}

export function init(config: ChasterWidgetConfig): WidgetHandle {
  const host = resolveContainer(config.container);
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = widgetStyles;
  shadowRoot.appendChild(styleEl);

  const appRoot = document.createElement("div");
  shadowRoot.appendChild(appRoot);
  render(<App config={config} />, appRoot);

  return {
    destroy: () => {
      render(null, appRoot);
      appRoot.remove();
    },
  };
}

function getCurrentScriptElement(): HTMLScriptElement | null {
  const script = document.currentScript;
  if (script instanceof HTMLScriptElement) {
    return script;
  }
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[data-app-id]");
  return scripts.length ? scripts[scripts.length - 1] : null;
}

function initFromScriptTag(): void {
  const script = getCurrentScriptElement();
  if (!script) {
    return;
  }
  const appId = script.dataset.appId;
  const tenantId = script.dataset.tenantId;
  const gatewayUrl = script.dataset.gatewayUrl;
  if (!appId || !tenantId || !gatewayUrl) {
    return;
  }
  if (!window.ChasterWidgetSigner) {
    throw new Error("window.ChasterWidgetSigner must be provided for secure signatures.");
  }

  init({
    appId,
    tenantId,
    gatewayUrl,
    mode: "anonymous",
    guestId: script.dataset.guestId,
    guestName: script.dataset.guestName,
    guestEmail: script.dataset.guestEmail,
    getSignatureHeaders: window.ChasterWidgetSigner,
  });
}

declare global {
  interface Window {
    ChasterWidget?: {
      init: (config: ChasterWidgetConfig) => WidgetHandle;
    };
    ChasterWidgetSigner?: ChasterWidgetConfig["getSignatureHeaders"];
  }
}

window.ChasterWidget = {
  init,
};

initFromScriptTag();
