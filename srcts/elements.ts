// Payload normalisation: the R side ships columnar element / panel tables that
// htmlwidgets may auto-unbox; these turn them into plain per-element records.

import type { ColumnElements, ElemMeta, PanelInfo } from "./types";

// Read a payload column as an array: htmlwidgets auto-unboxes a length-1 vector to
// a scalar, so wrap those back into a one-element array; `null`/absent -> `[]`.
export function asColumn<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Reconstruct the per-element `ElemMeta[]` view the runtime uses from whichever
// shape R sent: a columnar `ColumnElements` (the current wire format) or a legacy
// `ElemMeta[]` (also what the empty case `[]` and the test harness use). Purely a
// decode step — the resulting objects are identical to the old per-record payload,
// so nothing downstream changes.
export function normalizeElements(raw: ElemMeta[] | ColumnElements | null | undefined): ElemMeta[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw; // legacy per-record payload (and the empty [])
  const c = raw as ColumnElements;
  const key = asColumn<string>(c.key);
  const n = key.length;
  if (!n) return [];
  const x0 = asColumn<number | null>(c.x0);
  const y0 = asColumn<number | null>(c.y0);
  const x1 = asColumn<number | null>(c.x1);
  const y1 = asColumn<number | null>(c.y1);
  const mark = c.mark != null ? asColumn<string | null>(c.mark) : null;
  const tooltip = c.tooltip != null ? asColumn<string | null>(c.tooltip) : null;
  const hoverGroup = c.hover_group != null ? asColumn<string | null>(c.hover_group) : null;
  const hoverColor = c.hover_color != null ? asColumn<string | null>(c.hover_color) : null;
  const selectedColor = c.selected_color != null ? asColumn<string | null>(c.selected_color) : null;
  const legendFor = c.legend_for != null ? asColumn<string | null>(c.legend_for) : null;
  const legend = c.legend != null ? asColumn<string[] | string | null>(c.legend) : null;
  const filterValue = c.filter_value != null ? asColumn<number | null>(c.filter_value) : null;
  const cond = c.cond != null ? asColumn<string[] | string | null>(c.cond) : null;
  const filt = c.filt != null ? asColumn<string[] | string | null>(c.filt) : null;
  const join = c.join != null ? asColumn<string | null>(c.join) : null;
  const source = c.source != null ? asColumn<string | null>(c.source) : null;
  const target = c.target != null ? asColumn<string | null>(c.target) : null;
  const ivNum: [keyof ElemMeta, (number | null)[] | null][] = (["ix", "ixh", "iy", "iyh"] as const).map(
    (f) => [f, c[f] != null ? asColumn<number | null>(c[f]) : null] as [keyof ElemMeta, (number | null)[] | null]
  );
  const ixd = c.ixd != null ? asColumn<string | null>(c.ixd) : null;
  const iyd = c.iyd != null ? asColumn<string | null>(c.iyd) : null;
  const out: ElemMeta[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e: ElemMeta = { key: String(key[i]) };
    if (mark && mark[i] != null) e.mark = String(mark[i]);
    // Assign bbox only when numeric — a `null` (R `NA`) means "no geometry", which
    // `hasBbox` must continue to reject.
    if (typeof x0[i] === "number") e.x0 = x0[i] as number;
    if (typeof y0[i] === "number") e.y0 = y0[i] as number;
    if (typeof x1[i] === "number") e.x1 = x1[i] as number;
    if (typeof y1[i] === "number") e.y1 = y1[i] as number;
    if (tooltip && tooltip[i] != null) e.tooltip = String(tooltip[i]);
    if (hoverGroup && hoverGroup[i] != null) e.hover_group = String(hoverGroup[i]);
    if (hoverColor && hoverColor[i] != null) e.hover_color = String(hoverColor[i]);
    if (selectedColor && selectedColor[i] != null) e.selected_color = String(selectedColor[i]);
    if (legendFor && legendFor[i] != null) e.legend_for = String(legendFor[i]);
    if (legend) {
      const v = legend[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) e.legend = v;
    }
    if (filterValue && typeof filterValue[i] === "number") e.filter_value = filterValue[i] as number;
    if (cond) {
      const v = cond[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        e.cond = Array.isArray(v) ? (v as string[]) : [String(v)];
      }
    }
    if (filt) {
      const v = filt[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        e.filt = Array.isArray(v) ? (v as string[]) : [String(v)];
      }
    }
    if (join && join[i] != null) e.join = String(join[i]);
    if (source && source[i] != null) e.source = String(source[i]);
    if (target && target[i] != null) e.target = String(target[i]);
    for (let f = 0; f < ivNum.length; f++) {
      const col = ivNum[f][1];
      if (col && typeof col[i] === "number") (e as unknown as Record<string, number>)[ivNum[f][0]] = col[i] as number;
    }
    if (ixd && ixd[i] != null) e.ixd = String(ixd[i]);
    if (iyd && iyd[i] != null) e.iyd = String(iyd[i]);
    out[i] = e;
  }
  return out;
}

// The panels payload as an array (htmlwidgets may unbox a length-1 list to a
// single object). Absent/`null` -> `[]` (a scene with no cartesian scale
// descriptors — the widget stays pixel-only).
export function normalizePanels(raw: PanelInfo[] | PanelInfo | null | undefined): PanelInfo[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}
