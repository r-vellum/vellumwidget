// Coordinate mapping: client px -> SVG user space, the multi-panel axis-zoom
// frame, and the data-space helpers built on the `scales` panel payload.

import { hasBbox } from "../geometry";
import { pxToDataX, pxToDataY } from "../scales";
import type { WidgetFns, WidgetState } from "../state";
import type { AzPanel, Bbox, ElemMeta, PanelInfo, ViewBox } from "../types";
import { conjugatePan, panToView, parseViewBox, viewToPan } from "../viewbox";
import type { PanTransform } from "../viewbox";

export function coordsFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "currentViewBox" | "toUser" | "toView" | "toAnchor" | "azNearest" | "azT" | "azMulti"
  | "fmtPan" | "calibrateXform" | "clientToScene" | "panelAt" | "dataRangeOf"
  | "brushDataFields"
> {
 // crosstalk filter handle

  // --- coordinates: client px -> SVG user space (viewBox coords) ---
  // The live viewBox: the zoom/pan state `vb`, else the svg's viewBox attribute,
  // else the rendered box (a raw vellum scene may omit a viewBox).
  function currentViewBox(): ViewBox {
    // Under axis_zoom the svg itself stays at the base view (only the data region
    // moves), so client px map into vb0; toView/toAnchor then undo the pan.
    if (ws.vb) return ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb;
    const parsed = ws.svgEl ? parseViewBox(ws.svgEl.getAttribute("viewBox")) : null;
    if (parsed) return parsed;
    const r = (ws.svgEl || ws.el).getBoundingClientRect();
    return { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
  }

  // Client px -> SVG user (viewBox) space, via the ACTUAL rendered box + the
  // current viewBox. We deliberately do NOT use getScreenCTM(): for an svg with
  // width/height attributes that is then CSS-scaled (the widget's
  // `max-width:100%`), getScreenCTM() can report the attribute-based scale rather
  // than the rendered one, which under-maps the pointer toward the top-left — so
  // hover snapped to a mark up-and-left of the cursor while click (which uses the
  // DOM target) stayed correct. `height:auto` keeps the rendered box at the
  // viewBox aspect (no letterboxing), so this linear map is exact.
  function toUser(clientX: number, clientY: number): { x: number; y: number } {
    const r = (ws.svgEl || ws.el).getBoundingClientRect();
    const view = currentViewBox();
    const fx = r.width ? (clientX - r.left) / r.width : 0;
    const fy = r.height ? (clientY - r.top) / r.height : 0;
    return { x: view.x + fx * view.w, y: view.y + fy * view.h };
  }

  // The device-px scene point under a client position, accounting for axis_zoom's
  // panel transform. Under normal zoom this is just toUser; under axis_zoom the
  // marks are scaled by T within a fixed viewBox, so the point under the cursor is
  // T⁻¹(toUser). Every gesture/hit-test uses this, so the two modes share one path.
  function toView(clientX: number, clientY: number): { x: number; y: number } {
    const u = toUser(clientX, clientY);
    if (ws.axisZoomActive && ws.vb && ws.vb0) return azBaseToScene(u.x, u.y);
    return u;
  }

  // The gesture anchor for a client position: the point in `vb`'s own frame (the
  // reference panel's) that a zoom/pan should hold under the cursor. Equal to
  // toView for one panel; with several, the cursor's panel is first mapped back
  // onto the reference panel (A⁻¹) so zooming in panel 3 zooms about the cursor.
  function toAnchor(clientX: number, clientY: number): { x: number; y: number } {
    const u = toUser(clientX, clientY);
    if (!ws.axisZoomActive || !ws.vb || !ws.vb0) return u;
    const a = ws.anchorPanel || azNearest(u.x, u.y);
    if (!a) return panToView(ws.vb, ws.vb0, u.x, u.y);
    return panToView(ws.vb, ws.vb0, (u.x - a.bx) / a.ax, (u.y - a.by) / a.ay);
  }

  // --- multi-panel axis-zoom geometry ---
  // The zoomable panel whose (fixed) rect contains or is nearest to a point. The
  // rects are the same in scene and base coordinates (the clip never moves).
  function azNearest(x: number, y: number): AzPanel | null {
    let best: AzPanel | null = null, bestD = Infinity;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const p = ws.azPanels[i].p;
      const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
      const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = ws.azPanels[i]; }
    }
    return best;
  }

  // T_i for a panel at the current view.
  function azT(a: AzPanel): PanTransform {
    return conjugatePan(viewToPan(ws.vb || ws.vb0!, ws.vb0!), a.ax, a.bx, a.ay, a.by);
  }

  // A point in the fixed base (vb0) space -> the scene (device-px) point drawn
  // there: T_i⁻¹ for the panel under it.
  function azBaseToScene(x: number, y: number): { x: number; y: number } {
    const a = azNearest(x, y);
    if (!a) return ws.vb && ws.vb0 ? panToView(ws.vb, ws.vb0, x, y) : { x: x, y: y };
    const t = azT(a);
    return { x: t.sx ? (x - t.tx) / t.sx : x, y: t.sy ? (y - t.ty) / t.sy : y };
  }

  // Several panels zoom independently-translated (T_i differ), so overlays drawn
  // in scene coordinates must be placed per panel rather than by one viewBox.
  function azMulti(): boolean {
    return ws.axisZoomActive && ws.azPanels.length > 1 && !!ws.vb0;
  }

  function fmtPan(t: PanTransform): string {
    return "matrix(" + t.sx + " 0 0 " + t.sy + " " + t.tx + " " + t.ty + ")";
  }

  // Client px -> scene (element-bbox) coords, calibrated from the ACTUAL rendered
  // position of keyed elements versus their known scene bboxes. This is the
  // robust hit-test mapping: getScreenCTM() and rect+viewBox math both assume the
  // viewBox scales uniformly into the element's box, which is NOT how the content
  // is laid out when the svg carries width/height attributes and is CSS-scaled —
  // there the content renders ~1:1 and the viewBox math offsets the pointer (the
  // hover-picked-the-wrong-mark bug). Fitting screen<->bbox from real elements is
  // exact under any viewBox / width-attr / CSS-scale / zoom combination (the DOM
  // rects already reflect the current transform, incl. axis_zoom's mark scaling —
  // so no separate panToView is needed). Per-axis two-point fit over the
  // most-separated elements; falls back to toView() when it can't calibrate.
  function calibrateXform(): { sx: number; ox: number; sy: number; oy: number } | null {
    // Multi-panel axis zoom: each panel is translated differently, so fit client
    // -> BASE (vb0) space instead, using each element's on-screen base position
    // T_i(centre); clientToScene then undoes the T_i of the panel under the point.
    if (azMulti()) return calibrateBase();
    let xi: ElemMeta | null = null, xj: ElemMeta | null = null;
    let yi: ElemMeta | null = null, yj: ElemMeta | null = null;
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (!hasBbox(e)) continue;
      const scx = (e.x0! + e.x1!) / 2, scy = (e.y0! + e.y1!) / 2;
      if (!xi || scx < (xi.x0! + xi.x1!) / 2) xi = e;
      if (!xj || scx > (xj.x0! + xj.x1!) / 2) xj = e;
      if (!yi || scy < (yi.y0! + yi.y1!) / 2) yi = e;
      if (!yj || scy > (yj.y0! + yj.y1!) / 2) yj = e;
    }
    if (!xi || !xj || !yi || !yj) return null;
    const scr = (e: ElemMeta): { x: number; y: number } | null => {
      const n = ws.fx.elementsForKey(e.key)[0] as Element | undefined;
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const xa = scr(xi), xb = scr(xj), ya = scr(yi), yb = scr(yj);
    if (!xa || !xb || !ya || !yb) return null;
    const dScx = (xj.x0! + xj.x1!) / 2 - (xi.x0! + xi.x1!) / 2;
    const dScrx = xb.x - xa.x;
    const dScy = (yj.y0! + yj.y1!) / 2 - (yi.y0! + yi.y1!) / 2;
    const dScry = yb.y - ya.y;
    if (Math.abs(dScrx) < 1 || Math.abs(dScry) < 1) return null; // too close to fit
    const sx = dScx / dScrx, ox = (xi.x0! + xi.x1!) / 2 - xa.x * sx;
    const sy = dScy / dScry, oy = (yi.y0! + yi.y1!) / 2 - ya.y * sy;
    return { sx, ox, sy, oy };
  }

  function clientToScene(clientX: number, clientY: number): { x: number; y: number } {
    const f = calibrateXform();
    if (!f) return toView(clientX, clientY);
    if (azMulti()) return azBaseToScene(f.ox + clientX * f.sx, f.oy + clientY * f.sy);
    return { x: f.ox + clientX * f.sx, y: f.oy + clientY * f.sy };
  }

  // calibrateXform's multi-panel fit: client px -> base (vb0) user space, from
  // the extreme elements' rendered centres versus their T_i-mapped centres.
  function calibrateBase(): { sx: number; ox: number; sy: number; oy: number } | null {
    const base = function (e: ElemMeta): { x: number; y: number } {
      const cx = (e.x0! + e.x1!) / 2, cy = (e.y0! + e.y1!) / 2;
      const a = azNearest(cx, cy);
      if (!a) return { x: cx, y: cy };
      const t = azT(a);
      return { x: t.sx * cx + t.tx, y: t.sy * cy + t.ty };
    };
    type BasePt = { x: number; y: number; e: ElemMeta };
    let xi: BasePt | null = null, xj: BasePt | null = null, yi: BasePt | null = null, yj: BasePt | null = null;
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (!hasBbox(e)) continue;
      const b = { x: 0, y: 0, e: e };
      const q = base(e); b.x = q.x; b.y = q.y;
      if (!xi || b.x < xi.x) xi = b;
      if (!xj || b.x > xj.x) xj = b;
      if (!yi || b.y < yi.y) yi = b;
      if (!yj || b.y > yj.y) yj = b;
    }
    if (!xi || !xj || !yi || !yj) return null;
    const scr = (e: ElemMeta): { x: number; y: number } | null => {
      const n = ws.fx.elementsForKey(e.key)[0] as Element | undefined;
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const xa = scr(xi.e), xb = scr(xj.e), ya = scr(yi.e), yb = scr(yj.e);
    if (!xa || !xb || !ya || !yb) return null;
    const dScrx = xb.x - xa.x, dScry = yb.y - ya.y;
    if (Math.abs(dScrx) < 1 || Math.abs(dScry) < 1) return null;
    const sx = (xj.x - xi.x) / dScrx, sy = (yj.y - yi.y) / dScry;
    return { sx: sx, ox: xi.x - xa.x * sx, sy: sy, oy: yi.y - ya.y * sy };
  }

  // --- data-space mapping helpers (need the `scales` panel payload) ---
  // The panel whose device-px rect contains (x, y); else the sole cartesian
  // panel (the common single-panel case); else null. Data-space mapping is only
  // offered when unambiguous — with several panels and a point outside them all
  // we can't say which axes apply.
  function panelAt(x: number, y: number): PanelInfo | null {
    for (let i = 0; i < ws.panels.length; i++) {
      const p = ws.panels[i];
      if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return p;
    }
    return ws.panels.length === 1 ? ws.panels[0] : null;
  }

  // {x:[lo,hi], y:[lo,hi]} data-space extent of a device-px rectangle in panel
  // `p` (each axis ordered lo<=hi), or null if the panel lacks that axis.
  function dataRangeOf(p: PanelInfo, dx0: number, dy0: number, dx1: number, dy1: number):
    { x?: number[]; y?: number[]; panel: string } | null {
    const out: { x?: number[]; y?: number[]; panel: string } = { panel: p.name };
    if (p.x) {
      const a = pxToDataX(p, dx0), b = pxToDataX(p, dx1);
      if (a != null && b != null) out.x = [Math.min(a, b), Math.max(a, b)];
    }
    if (p.y) {
      const a = pxToDataY(p, dy0), b = pxToDataY(p, dy1);
      if (a != null && b != null) out.y = [Math.min(a, b), Math.max(a, b)];
    }
    return (out.x || out.y) ? out : null;
  }

  // Data-space fields to attach to a `_brush` event for a device-px region:
  // `panel` + `x0d,x1d,y0d,y1d` (data-space bounds), or `{}` when no panel scale
  // applies (raw scene, non-cartesian, or an ambiguous multi-panel region).
  function brushDataFields(bb: Bbox): Record<string, number | string> {
    const p = panelAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
    if (!p) return {};
    const d = dataRangeOf(p, bb.x0, bb.y0, bb.x1, bb.y1);
    if (!d) return {};
    const f: Record<string, number | string> = { panel: d.panel };
    if (d.x) { f.x0d = d.x[0]; f.x1d = d.x[1]; }
    if (d.y) { f.y0d = d.y[0]; f.y1d = d.y[1]; }
    return f;
  }

  return { currentViewBox, toUser, toView, toAnchor, azNearest, azT, azMulti, fmtPan, calibrateXform, clientToScene, panelAt, dataRangeOf, brushDataFields };
}
