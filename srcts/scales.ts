// Data-space mapping (device px -> native -> data, per panel) and the interval
// selection helpers built on it. No widget state.

import { asColumn } from "./elements";
import type { AxisScale, Bbox, ElemMeta, PanelInfo, SelDef } from "./types";

// --- data-space mapping (device px -> native -> data, per panel) ---
// Transforms this runtime can invert native -> data. vellumplot's built-in
// registry is exactly these four; a plot built with a custom `scales::transform_*`
// object (e.g. log2, pseudo_log) reports some other name, which we CANNOT invert —
// so we decline data-space mapping for that axis rather than return a native value
// as if it were data (which would be silently wrong).
export const INVERTIBLE: Record<string, boolean> = { identity: true, log10: true, sqrt: true, reverse: true };
// Glyph marks whose pixel size is decorative, so under axis-aware zoom they keep a
// constant size (position re-maps, size does not) — the "real chart" behaviour.
// Positional marks (rect/segment/line/path/polygon) instead scale with the data;
// only their stroke width is held constant (non-scaling-stroke). See
// `_docs/CONSTANT-SIZE-MARKS-DESIGN.md`.
export const GLYPH_MARKS: Record<string, boolean> = { point: true, circle: true, hexagon: true, sector: true };
export function canInvert(ax: AxisScale | undefined): ax is AxisScale {
  return !!ax && INVERTIBLE[ax.transform] === true;
}
// Map a native (transformed) coordinate back to a data value, inverting the axis
// transform. `reverse` maps data identically (the flip lives in a decreasing
// native domain), and identity / date / datetime pass through (date values are the
// numeric epoch). Only ever called for an invertible transform (see canInvert).
export function nativeToData(ax: AxisScale, nv: number): number {
  switch (ax.transform) {
    case "log10": return Math.pow(10, nv);
    case "sqrt": return nv * nv;
    case "reverse": return nv; // identity map; the reversal is the decreasing domain
    default: return nv; // identity (and date/datetime epochs)
  }
}
// Device-px x -> data, via the panel's x affine (px0->native_lo, px1->native_hi);
// null when the axis is absent, degenerate, or a transform we can't invert.
export function pxToDataX(p: PanelInfo, px: number): number | null {
  const ax = p.x;
  if (!canInvert(ax) || p.px1 === p.px0) return null;
  const nv = ax.native_lo + ((px - p.px0) / (p.px1 - p.px0)) * (ax.native_hi - ax.native_lo);
  return nativeToData(ax, nv);
}
// Device-px y -> data. Device y is top-down, so py0 (top) is the HIGH data value
// (native_hi) and py1 (bottom) the low.
export function pxToDataY(p: PanelInfo, py: number): number | null {
  const ax = p.y;
  if (!canInvert(ax) || p.py1 === p.py0) return null;
  const frac = (py - p.py0) / (p.py1 - p.py0); // 0 at top, 1 at bottom
  const nv = ax.native_hi + frac * (ax.native_lo - ax.native_hi);
  return nativeToData(ax, nv);
}

// --- interval selections (select_interval()): membership by data value ---
// One brushed channel: a data range [lo, hi] (continuous / date / datetime, in
// the axis's data units), plus -- on a discrete axis -- the levels whose band
// centre the brush covers.
export interface IntervalChannel { lo: number; hi: number; levels?: string[]; }
// The brushed data range of an interval selection, per encoding, and the panel
// it was resolved through.
export interface IntervalRange { panel: string; x?: IntervalChannel; y?: IntervalChannel; }

// The position channels an interval selection constrains: its `encodings`, else
// (an older spec) its `on` ("x" / "y" / "xy").
export function selEncodings(sel: SelDef): string[] {
  const enc = sel.encodings != null ? asColumn<string>(sel.encodings) : [];
  const out = enc.filter((e) => e === "x" || e === "y");
  if (out.length) return out;
  if (sel.on === "x" || sel.on === "y") return [sel.on];
  return ["x", "y"];
}
// The panel axis that shows aesthetic `enc`, and whether it runs horizontally.
// Matches the descriptor's `aes` (so coord_flip maps x to the vertical axis);
// without one, x is the horizontal axis and y the vertical.
export function axisForEncoding(p: PanelInfo, enc: string): { ax: AxisScale; horizontal: boolean } | null {
  if (p.x && p.x.aes === enc) return { ax: p.x, horizontal: true };
  if (p.y && p.y.aes === enc) return { ax: p.y, horizontal: false };
  if ((p.x && p.x.aes) || (p.y && p.y.aes)) return null; // described, but not this channel
  if (enc === "x" && p.x) return { ax: p.x, horizontal: true };
  if (enc === "y" && p.y) return { ax: p.y, horizontal: false };
  return null;
}
// Resolve a device-px brush rectangle in panel `p` to a data range on each of
// `encs`. Null when any channel can't be resolved (axis missing, a transform we
// can't invert, a discrete axis without levels) -- the caller then falls back to
// pixel hit-testing rather than guess.
export function intervalRangeOf(p: PanelInfo, rect: Bbox, encs: string[]): IntervalRange | null {
  const out: IntervalRange = { panel: p.name };
  for (let i = 0; i < encs.length; i++) {
    const enc = encs[i];
    const hit = axisForEncoding(p, enc);
    if (!hit) return null;
    const a = hit.horizontal ? pxToDataX(p, rect.x0) : pxToDataY(p, rect.y0);
    const b = hit.horizontal ? pxToDataX(p, rect.x1) : pxToDataY(p, rect.y1);
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
    const ch: IntervalChannel = { lo: Math.min(a, b), hi: Math.max(a, b) };
    if (hit.ax.type === "discrete") {
      // Native position i is level i (1-based): take the levels whose centre lies
      // inside the brushed native range.
      const levels = hit.ax.levels != null ? asColumn<string>(hit.ax.levels) : [];
      if (!levels.length) return null;
      ch.levels = [];
      for (let k = 0; k < levels.length; k++) {
        const pos = k + 1;
        if (pos >= ch.lo && pos <= ch.hi) ch.levels.push(String(levels[k]));
      }
    }
    (out as unknown as Record<string, IntervalChannel>)[enc] = ch;
  }
  return out;
}
// Is element `e` inside the interval on every brushed channel? A numeric value
// (or a series' [ix, ixh] span) must overlap the range; a discrete value must be
// one of the brushed levels. An element with no value on a channel is outside.
export function inInterval(e: ElemMeta, r: IntervalRange): boolean {
  const chans: ["x" | "y", IntervalChannel | undefined][] = [["x", r.x], ["y", r.y]];
  let tested = false;
  for (let i = 0; i < chans.length; i++) {
    const enc = chans[i][0], ch = chans[i][1];
    if (!ch) continue;
    tested = true;
    if (ch.levels) {
      const v = enc === "x" ? e.ixd : e.iyd;
      if (v == null || ch.levels.indexOf(v) < 0) return false;
    } else {
      const lo = enc === "x" ? e.ix : e.iy;
      if (typeof lo !== "number" || !isFinite(lo)) return false;
      const hi0 = enc === "x" ? e.ixh : e.iyh;
      const hi = typeof hi0 === "number" && isFinite(hi0) ? hi0 : lo;
      if (hi < ch.lo || lo > ch.hi) return false;
    }
  }
  return tested;
}
// Distinct keys of the elements inside the interval.
export function intervalKeys(elems: ElemMeta[], r: IntervalRange): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < elems.length; i++) {
    const e = elems[i];
    if (!seen[e.key] && inInterval(e, r)) {
      seen[e.key] = true;
      out.push(e.key);
    }
  }
  return out;
}
