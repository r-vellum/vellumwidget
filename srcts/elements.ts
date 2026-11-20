// Payload normalisation: the R side ships columnar element / panel tables that
// htmlwidgets may auto-unbox; these turn them into plain per-element records.

import type { ColumnElements, ElemMeta, PanelInfo } from "./types";

// Read a payload column as an array: htmlwidgets auto-unboxes a length-1 vector to
// a scalar, so wrap those back into a one-element array; `null`/absent -> `[]`.
export function asColumn<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// A column in the compact wire encoding (raster mode, `.encode_elements()` in R):
// a sparse `{at, v}` (0-based indices that carry a value, and the values) or a
// dictionary `{levels, codes}` (each level once, a 0-based code per element,
// `null` for none).
interface SparseColumn<T> {
  at: number[] | number;
  v: T[] | T;
}
interface DictColumn<T> {
  levels: T[] | T;
  codes?: (number | null)[] | number | null;
  rv?: number[] | number; // run-length form: run codes (-1 = none) ...
  rl?: number[] | number; // ... and run lengths
}
export type EncodedColumn<T> = T[] | T | SparseColumn<T> | DictColumn<T> | null | undefined;

// Decode one payload column to a plain length-`n` array (`null` where unset):
// expands the sparse / dictionary encodings, and otherwise behaves as `asColumn`.
// Returns `null` when the column is absent.
export function decodeColumn<T>(v: EncodedColumn<T>, n: number): (T | null)[] | null {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Partial<SparseColumn<T> & DictColumn<T>>;
    if (o.at !== undefined && o.v !== undefined) {
      const at = asColumn<number>(o.at);
      const vals = asColumn<T>(o.v as T[] | T);
      const out: (T | null)[] = new Array(n).fill(null);
      for (let i = 0; i < at.length; i++) out[at[i]] = vals[i];
      return out;
    }
    if (o.levels !== undefined && o.rv !== undefined && o.rl !== undefined) {
      const levels = asColumn<T>(o.levels as T[] | T);
      const rv = asColumn<number>(o.rv), rl = asColumn<number>(o.rl);
      const out: (T | null)[] = new Array(n);
      let k = 0;
      for (let r = 0; r < rv.length; r++) {
        const val = rv[r] < 0 ? null : levels[rv[r]];
        for (let m = 0; m < rl[r]; m++) out[k++] = val;
      }
      return out;
    }
    if (o.levels !== undefined && o.codes !== undefined) {
      const levels = asColumn<T>(o.levels as T[] | T);
      const codes = asColumn<number | null>(o.codes);
      const out: (T | null)[] = new Array(codes.length);
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        out[i] = c == null ? null : levels[c];
      }
      return out;
    }
  }
  return asColumn<T>(v as T[] | T);
}

// The key column: plain strings, or (raster mode, `.encode_keys()` in R) mostly
// integer-suffixed keys as `{delta, at, v, pre?}` -- a running sum of `delta`
// for the integer suffixes, each after its text prefix from `pre` (runs, one
// per integer key; "" when absent), with the other keys `v` at their 0-based
// positions `at`.
export function decodeKeys(v: unknown): string[] {
  if (v != null && typeof v === "object" && !Array.isArray(v) && "delta" in (v as object)) {
    const o = v as {
      delta: number[] | number; at?: number[] | number; v?: string[] | string;
      pre?: EncodedColumn<string>;
    };
    const delta = asColumn(o.delta), at = asColumn(o.at), other = asColumn(o.v);
    const pre = o.pre != null ? decodeColumn<string>(o.pre, delta.length) : null;
    const n = delta.length + at.length;
    const out: string[] = new Array(n);
    let j = 0, a = 0, run = 0;
    for (let i = 0; i < n; i++) {
      if (a < at.length && at[a] === i) { out[i] = String(other[a++]); continue; }
      const p = pre ? pre[j] : null;
      run += delta[j++];
      out[i] = (p == null ? "" : p) + String(run);
    }
    return out;
  }
  return asColumn(v as string[] | string).map(String);
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
  const key = decodeKeys(c.key as unknown);
  const n = key.length;
  if (!n) return [];
  const x0 = asColumn<number | null>(c.x0);
  const y0 = asColumn<number | null>(c.y0);
  const x1 = asColumn<number | null>(c.x1);
  const y1 = asColumn<number | null>(c.y1);
  // Every non-key column may arrive in the compact encoding (see decodeColumn).
  const col = <T>(f: keyof ColumnElements): (T | null)[] | null =>
    decodeColumn<T>((c as unknown as Record<string, EncodedColumn<T>>)[f as string], n);
  const mark = col<string>("mark");
  const tooltip = col<string>("tooltip");
  const hoverGroup = col<string>("hover_group");
  const hoverColor = col<string>("hover_color");
  const selectedColor = col<string>("selected_color");
  const legendFor = col<string>("legend_for");
  const legend = col<string[] | string>("legend");
  const filterValue = col<number>("filter_value");
  const cond = col<string[] | string>("cond");
  const filt = col<string[] | string>("filt");
  const join = col<string>("join");
  const source = col<string>("source");
  const target = col<string>("target");
  const ivNum: [keyof ElemMeta, (number | null)[] | null][] = (["ix", "ixh", "iy", "iyh"] as const).map(
    (f) => [f, col<number>(f)] as [keyof ElemMeta, (number | null)[] | null]
  );
  const ixd = col<string>("ixd");
  const iyd = col<string>("iyd");
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
