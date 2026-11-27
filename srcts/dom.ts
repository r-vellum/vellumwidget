// Small DOM helpers: data-key / data-vellum-id lookup from an event target, the
// provenance source-table resolver, a file download, and the drag threshold.

import type { Provenance } from "./types";

export function keyOf(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  const hit = el.closest("[data-key]");
  return hit ? hit.getAttribute("data-key") : null;
}

// The stable grob id (`data-vellum-id`) of the drawn element under `target`, or
// null. This is the provenance join key (matches scene_model()$id); the SVG
// carries it on each emitted grob.
export function vellumIdOf(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  const hit = el.closest("[data-vellum-id]");
  return hit ? hit.getAttribute("data-vellum-id") : null;
}

// The source table an element's provenance rows index: its `sourceOf` table
// when the payload has one (a layer drawn from its own `data =`), else the plot
// data at the top level. An older payload (no sourceOf/sources) or an untagged
// element reads the plot data, as before.
export function sourceTable(
  prov: Provenance,
  id: string,
): { source: string; fields: string[]; values?: Record<string, unknown>[] } {
  const name = (prov.sourceOf && prov.sourceOf[id]) || "plot";
  const tbl = name !== "plot" && prov.sources ? prov.sources[name] : undefined;
  if (!tbl) return { source: "plot", fields: prov.fields, values: prov.values };
  // htmlwidgets auto-unboxes a length-1 vector: a one-column table's fields may
  // arrive as a bare string.
  const fields = Array.isArray(tbl.fields) ? tbl.fields : tbl.fields == null ? [] : [tbl.fields];
  return { source: name, fields, values: tbl.values };
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const DRAG_THRESHOLD = 3; // px before a mousedown becomes a drag (vs a click)

// A key as people see it (X-15): vellumplot keys a multi-row mark (a line
// series) "<first row key>\u241fs<layer>", apart from its rows; a tooltip
// fallback, a screen-reader label and the hover / click inputs show its first
// row's key, as they did before series keys.
export function shownKey(k: string): string;
export function shownKey(k: string | null): string | null;
export function shownKey(k: string | null): string | null {
  if (k == null) return k;
  const i = k.indexOf("\u241f");
  return i < 0 ? k : k.slice(0, i);
}
