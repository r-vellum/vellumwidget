// Server -> client proxy (vellumwidget_proxy()): the instance's `_call` seam.

import { unionBbox } from "../geometry";
import type { WidgetFns, WidgetState } from "../state";

export function proxyFeature(ws: WidgetState): Pick<WidgetFns, "proxyCall"> {
  // --- server -> client proxy (vellumwidget_proxy) ---
  // Route a command from the Shiny server onto this instance, without a
  // re-render. `args` is normalised to a key array (Shiny may auto-unbox a
  // length-1 vector to a scalar, so accept scalar/array/absent uniformly).
  function proxyCall(method: string, args: unknown): void {
    const keys: string[] = Array.isArray(args)
      ? (args as string[])
      : args == null ? [] : [String(args)];
    switch (method) {
      case "select": ws.fx.setSelection(keys); break;
      case "clearSelection": ws.fx.clearSelection(); break;
      case "filter": ws.fx.applyFilter(keys); break;
      case "clearFilter": ws.fx.applyFilter(null); break;
      case "zoom": proxyZoomToKeys(keys); break;
      case "resetZoom": ws.fx.resetZoom(); break;
      default: break; // ignore unknown methods (forward-compatible)
    }
  }

  // Frame the given keys' union bbox; empty keys reset to the full view.
  function proxyZoomToKeys(keys: string[]): void {
    if (!keys.length) { ws.fx.resetZoom(); return; }
    const sel: Record<string, boolean> = {};
    for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
    const bb = unionBbox(ws.elements, sel);
    if (bb) ws.fx.zoomTo(bb);
  }

  return { proxyCall };
}
