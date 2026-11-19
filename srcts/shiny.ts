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

// CSS.escape, or the CSSOM serialisation algorithm where it is missing (older
// browsers, jsdom). A Shiny id can hold "." or ":" (e.g. module ids), which a bare
// "#" + id selector would read as a class or a pseudo-class.
export function cssEscape(value: string): string {
  const C = (typeof window !== "undefined" ? (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS : undefined);
  if (C && typeof C.escape === "function") return C.escape(value);
  return cssEscapePolyfill(value);
}

export function cssEscapePolyfill(value: string): string {
  const s = String(value);
  const n = s.length;
  let out = "";
  const first = n ? s.charCodeAt(0) : 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) { out += "\uFFFD"; continue; }
    if ((c >= 0x1 && c <= 0x1f) || c === 0x7f ||
        (i === 0 && c >= 0x30 && c <= 0x39) ||
        (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d)) {
      out += "\\" + c.toString(16) + " ";
      continue;
    }
    if (i === 0 && n === 1 && c === 0x2d) { out += "\\" + s.charAt(i); continue; }
    if (c >= 0x80 || c === 0x2d || c === 0x5f ||
        (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      out += s.charAt(i);
      continue;
    }
    out += "\\" + s.charAt(i);
  }
  return out;
}

// The id selector for a widget's output id.
export function idSelector(id: string): string {
  return "#" + cssEscape(String(id));
}

// Resolve a proxy message's id to its mounted widget instance.
export function findWidgetById(id: string): WidgetInstance | null {
  return HTMLWidgets.find ? HTMLWidgets.find(idSelector(id)) : null;
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
    dispatchProxyCall(msg, findWidgetById);
  });
}
