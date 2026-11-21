// SVG viewBox arithmetic: zoom, parse/format, and the pan transforms that map a
// viewBox change onto a pannable group. No widget state.

import type { ViewBox } from "./types";

// New viewBox after zooming by `factor` about user-space point (cx, cy) — the
// point under the cursor stays put (§6: the JS transforms the SVG viewport).
export function zoomViewBox(vb: ViewBox, factor: number, cx: number, cy: number): ViewBox {
  const w = vb.w / factor;
  const h = vb.h / factor;
  return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
}

// --- maximum zoom (VW-44) ---
// The zoom is capped per axis at `maxZoom` times the original view: past ~100x
// the scene's own 0.01 px coordinate grid (SVG mode) and the display list's
// compact columns (raster mode) are off by more than half a screen pixel, and
// past ~16,000x a 32-bit float can't place a mark at all. A zoom is the ratio
// vb0.w / vb.w (and vb0.h / vb.h); a `maxZoom` that isn't a finite number >= 1
// means no cap.
function zoomCap(maxZoom: number | undefined): number {
  return typeof maxZoom === "number" && isFinite(maxZoom) && maxZoom >= 1 ? maxZoom : 0;
}

// Relative tolerance at the cap, so a view the clamp itself produced (whose
// extent is vb0 / maxZoom up to rounding) counts as AT the cap, not past it,
// and a further zoom-in leaves it exactly as it is: no creep, no jitter.
const CAP_EPS = 1e-9;

// The factor to zoom `vb` in by, given a requested `factor`: the request cut
// down so that neither axis passes `maxZoom`. A zoom out (factor <= 1) is never
// cut; at the cap a zoom in returns exactly 1 (so the caller can skip the
// redraw and the anchor point stays where it is).
export function clampZoomFactor(vb: ViewBox, vb0: ViewBox, factor: number, maxZoom: number | undefined): number {
  const cap = zoomCap(maxZoom);
  if (!cap || !(factor > 1) || !(vb0.w > 0) || !(vb0.h > 0)) return factor;
  const room = Math.min((vb.w * cap) / vb0.w, (vb.h * cap) / vb0.h);
  if (!(room > 1 + CAP_EPS)) return 1;
  return Math.min(factor, room);
}

// `zoomViewBox` with the cap: the point under (cx, cy) stays put, and the last
// step before the cap lands exactly on it.
export function zoomViewBoxCapped(
  vb: ViewBox, vb0: ViewBox | null, factor: number, cx: number, cy: number, maxZoom: number | undefined
): ViewBox {
  const f = vb0 ? clampZoomFactor(vb, vb0, factor, maxZoom) : factor;
  return f === 1 ? vb : zoomViewBox(vb, f, cx, cy);
}

// A view set whole (box zoom, zoom-to, a linked peer's view, setView, a cell's
// stored view) held to the cap: an axis narrower than vb0 / maxZoom is widened
// to it about its centre. Returns `vb` itself when it is within the cap.
export function clampViewBox(vb: ViewBox, vb0: ViewBox | null, maxZoom: number | undefined): ViewBox {
  const cap = zoomCap(maxZoom);
  if (!cap || !vb0 || !(vb0.w > 0) || !(vb0.h > 0)) return vb;
  const wMin = vb0.w / cap, hMin = vb0.h / cap;
  const narrowW = vb.w < wMin * (1 - CAP_EPS), narrowH = vb.h < hMin * (1 - CAP_EPS);
  if (!narrowW && !narrowH) return vb;
  const out = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
  if (narrowW) { out.x = vb.x + vb.w / 2 - wMin / 2; out.w = wMin; }
  if (narrowH) { out.y = vb.y + vb.h / 2 - hMin / 2; out.h = hMin; }
  return out;
}

// Is `vb` at the cap on either axis?
export function atMaxZoom(vb: ViewBox, vb0: ViewBox | null, maxZoom: number | undefined): boolean {
  const cap = zoomCap(maxZoom);
  if (!cap || !vb0) return false;
  return vb.w <= (vb0.w / cap) * (1 + CAP_EPS) || vb.h <= (vb0.h / cap) * (1 + CAP_EPS);
}

export function parseViewBox(s: string | null): ViewBox | null {
  if (!s) return null;
  const p = s.trim().split(/[ ,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
  return { x: p[0], y: p[1], w: p[2], h: p[3] };
}

export function fmtViewBox(vb: ViewBox): string {
  return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
}

// Is the view zoomed IN relative to the original (so the base raster would be
// upscaled and blur)? Panning or zooming out keeps the image crisp, so the crisp
// canvas point-layer only engages when the view is narrower/shorter than original.
export function isZoomedIn(vb: ViewBox, vb0: ViewBox): boolean {
  return vb.w < vb0.w * 0.999 || vb.h < vb0.h * 0.999;
}

// Map a point in viewBox (user) space to canvas backing-store pixels for the
// current view (`cw`/`ch` are the canvas backing-store dimensions).
export function userToCanvas(vb: ViewBox, cw: number, ch: number, x: number, y: number): { px: number; py: number } {
  return { px: ((x - vb.x) / vb.w) * cw, py: ((y - vb.y) / vb.h) * ch };
}

// --- axis-aware zoom (Phase 2): scale only the pannable panel, not the viewBox ---
// Under axis_zoom the base SVG viewBox is held fixed at `vb0` (so the axes, titles
// and legend never move) and the data region is scaled by an affine T instead. T
// is exactly the transform the viewBox WOULD have applied to the whole scene: it
// maps the current view rect `vb` onto `vb0`, so marks inside the pan group appear
// identically zoomed while their clip and the surrounding furniture stay put. One
// matrix, and its inverse is the single hit-test seam (the device-px scene point
// under the cursor is T⁻¹(toUser)). See the pannable-panel contract in vellum.
export interface PanTransform { sx: number; sy: number; tx: number; ty: number; }
export function viewToPan(vb: ViewBox, vb0: ViewBox): PanTransform {
  const sx = vb.w ? vb0.w / vb.w : 1;
  const sy = vb.h ? vb0.h / vb.h : 1;
  return { sx: sx, sy: sy, tx: vb0.x - vb.x * sx, ty: vb0.y - vb.y * sy };
}
// Inverse of T: a point in the fixed base (vb0) user space -> the device-px scene
// coordinate under it (which mark sits there). This is what every gesture wants
// ("what scene point is under the cursor"); under normal zoom it equals toUser,
// under axis_zoom it is T⁻¹(toUser).
export function panToView(vb: ViewBox, vb0: ViewBox, x: number, y: number): { x: number; y: number } {
  const t = viewToPan(vb, vb0);
  return { x: t.sx ? vb.x + (x - vb0.x) / t.sx : x, y: t.sy ? vb.y + (y - vb0.y) / t.sy : y };
}
// Multi-panel axis zoom: the view `vb` is read in the frame of a REFERENCE panel
// (the first), and every other panel gets the same zoom about its corresponding
// point — the reference T conjugated by the affine A that maps the reference
// panel's rect onto this one's (x -> ax*x + bx, y -> ay*y + by): T_i = A T A⁻¹.
// The scale is unchanged (so constant-size glyphs share one inverse scale); only
// the translation moves. With A = identity (one panel) this is T itself.
export function conjugatePan(t: PanTransform, ax: number, bx: number, ay: number, by: number): PanTransform {
  return { sx: t.sx, sy: t.sy, tx: ax * t.tx + bx * (1 - t.sx), ty: ay * t.ty + by * (1 - t.sy) };
}
