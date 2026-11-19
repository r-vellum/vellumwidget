// Server->client proxy (vellumwidget_proxy()): route Shiny custom messages to a
// mounted widget instance.

import type { ProxyMessage, WidgetInstance } from "./types";

// Route a server->client proxy message to its target widget instance. Split out
// (and given an injectable resolver) so it is unit-testable without a live Shiny.
export function dispatchProxyCall(
  msg: ProxyMessage | null | undefined,
  findInstance: (id: string) => WidgetInstance | null
): void {
  if (!msg || msg.id == null) return;
  const inst = findInstance(msg.id);
  if (inst && typeof inst._call === "function") inst._call(msg.method, msg.args);
}

// Register the "vellumwidget-calls" custom-message handler once, so a Shiny app can
// drive rendered widgets via vellumwidget_proxy(). Attempted at load and again on the
// first render, since Shiny may attach after this bundle evaluates; a module-level
// guard keeps it to a single registration.
export let proxyHandlerRegistered = false;
export function registerProxyHandler(): void {
  if (proxyHandlerRegistered) return;
  const sh = (window as unknown as {
    Shiny?: { addCustomMessageHandler?: (t: string, cb: (m: ProxyMessage) => void) => void };
  }).Shiny;
  if (!sh || typeof sh.addCustomMessageHandler !== "function") return;
  proxyHandlerRegistered = true;
  sh.addCustomMessageHandler("vellumwidget-calls", function (msg: ProxyMessage) {
    dispatchProxyCall(msg, function (id) {
      return HTMLWidgets.find ? HTMLWidgets.find("#" + id) : null;
    });
  });
}
