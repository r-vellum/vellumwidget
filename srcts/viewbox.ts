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
