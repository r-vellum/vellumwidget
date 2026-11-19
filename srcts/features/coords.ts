// Coordinate mapping: client px -> SVG user space, the multi-panel axis-zoom
// frame, and the data-space helpers built on the `scales` panel payload.

import { hasBbox } from "../geometry";
import { pxToDataX, pxToDataY } from "../scales";
import type { CalibCache, CalibFit, CalibGroup, WidgetFns, WidgetState } from "../state";
import type { AzPanel, Bbox, ElemMeta, PanelInfo, ViewBox } from "../types";
import { conjugatePan, panToView, parseViewBox, viewToPan } from "../viewbox";
import type { PanTransform } from "../viewbox";

export function coordsFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "currentViewBox" | "toUser" | "toView" | "toAnchor" | "azNearest" | "azT" | "azMulti"
  | "fmtPan" | "calibrateXform" | "sceneToClient" | "clientToScene" | "panelAt" | "dataRangeOf"
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
  // exact under any viewBox / width-attr / CSS-scale / zoom combination, because
  // the DOM rects already reflect the current transform, axis_zoom's included.
  //
  // The fit is made per data panel, from that panel's own marks (VW-3): under
  // axis zoom each facet carries its own transform and the legend none, so one
  // global fit across marks and swatches is wrong once zoomed. Legend swatches
  // and inert (hidden/filtered) marks never take part. The fits are measured in
  // svg-local px and cached until a render, a view change, a resize or a
  // legend/filter change, so a hover frame costs one getBoundingClientRect.
  function calibGroups(): CalibCache | null {
    if (!ws.svgEl) return null;
    const r = ws.svgEl.getBoundingClientRect();
    if (ws.calib && ws.calib.w === r.width && ws.calib.h === r.height) return ws.calib;
    ws.calib = buildCalib(r);
    return ws.calib;
  }

  function panelOfScene(x: number, y: number): number {
    for (let i = 0; i < ws.panels.length; i++) {
      const p = ws.panels[i];
      if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return i;
    }
    return -1;
  }

  function buildCalib(r: DOMRect | ClientRect): CalibCache {
    const nGroups = Math.max(1, ws.panels.length);
    // Per group, the extreme marks on each axis: [minX, maxX, minY, maxY].
    const ext: (ElemMeta | null)[][] = [];
    for (let g = 0; g < nGroups; g++) ext.push([null, null, null, null]);
    const all: (ElemMeta | null)[] = [null, null, null, null];
    const cxOf = (e: ElemMeta) => (e.x0! + e.x1!) / 2;
    const cyOf = (e: ElemMeta) => (e.y0! + e.y1!) / 2;
    const take = (q: (ElemMeta | null)[], e: ElemMeta) => {
      const cx = cxOf(e), cy = cyOf(e);
      if (!q[0] || cx < cxOf(q[0])) q[0] = e;
      if (!q[1] || cx > cxOf(q[1])) q[1] = e;
      if (!q[2] || cy < cyOf(q[2])) q[2] = e;
      if (!q[3] || cy > cyOf(q[3])) q[3] = e;
    };
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (!hasBbox(e) || e.legend_for != null || ws.fx.inert(e.key)) continue;
      let g = 0;
      if (ws.panels.length) {
        g = panelOfScene(cxOf(e), cyOf(e));
        if (g < 0) continue; // outside every data panel: annotation, furniture
      }
      take(ext[g], e);
      take(all, e);
    }
    // A mark's rendered centre in svg-local px (cached: extremes repeat).
    const seen: Record<string, { x: number; y: number } | null> = {};
    const scr = (e: ElemMeta): { x: number; y: number } | null => {
      if (e.key in seen) return seen[e.key];
      let out: { x: number; y: number } | null = null;
      const n = ws.fx.elementsForKey(e.key)[0] as Element | undefined;
      if (n) {
        const b = n.getBoundingClientRect();
        if (b.width || b.height) out = { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2 };
      }
      seen[e.key] = out;
      return out;
    };
    // One axis of the fit from its two extreme marks, or null if unmeasurable.
    const axis = (q: (ElemMeta | null)[], lo: number, hi: number, isX: boolean): { s: number; o: number } | null => {
      const a = q[lo], b = q[hi];
      if (!a || !b) return null;
      const pa = scr(a), pb = scr(b);
      if (!pa || !pb) return null;
      const da = isX ? pb.x - pa.x : pb.y - pa.y;
      if (Math.abs(da) < 1) return null; // too close to fit
      const sa = isX ? cxOf(a) : cyOf(a);
      const sd = (isX ? cxOf(b) : cyOf(b)) - sa;
      const s = sd / da;
      return { s: s, o: sa - (isX ? pa.x : pa.y) * s };
    };
    // Panels that share one transform (no axis zoom, or a single zoomable panel)
    // may borrow an axis they cannot fit alone (a one-row facet) from the fit
    // over every data mark. Independently zoomed facets may not.
    const shared = !azMulti();
    const gx = shared ? axis(all, 0, 1, true) : null;
    const gy = shared ? axis(all, 2, 3, false) : null;
    const groups: CalibGroup[] = [];
    for (let g = 0; g < nGroups; g++) {
      const panel = ws.panels.length ? ws.panels[g] : null;
      let az: AzPanel | null = null;
      if (panel && ws.axisZoomActive) {
        for (let j = 0; j < ws.azPanels.length; j++) if (ws.azPanels[j].p.name === panel.name) az = ws.azPanels[j];
      }
      const fx = axis(ext[g], 0, 1, true) || gx;
      const fy = axis(ext[g], 2, 3, false) || gy;
      groups.push({ panel: panel, az: az, fit: fx && fy ? { sx: fx.s, ox: fx.o, sy: fy.s, oy: fy.o } : null });
    }
    return { w: r.width, h: r.height, groups: groups };
  }

  // A fit (svg-local px -> scene) shifted to take client px.
  function toClientFit(f: CalibFit, left: number, top: number): CalibFit {
    return { sx: f.sx, ox: f.ox - left * f.sx, sy: f.sy, oy: f.oy - top * f.sy };
  }

  // The fit for the data panel under a client point: each panel's fit maps the
  // point into scene space, and its own T_i back onto the fixed frame, where the
  // panel's rect is tested; the containing (else nearest) panel wins.
  function calibrateXform(clientX: number, clientY: number): CalibFit | null {
    const c = calibGroups();
    if (!c || !ws.svgEl) return null;
    const r = ws.svgEl.getBoundingClientRect();
    const lx = clientX - r.left, ly = clientY - r.top;
    let best: CalibFit | null = null, bestD = Infinity;
    for (let g = 0; g < c.groups.length; g++) {
      const G = c.groups[g];
      if (!G.fit) continue;
      if (!G.panel || c.groups.length === 1) { best = G.fit; break; }
      let x = G.fit.ox + lx * G.fit.sx, y = G.fit.oy + ly * G.fit.sy;
      if (G.az) { const t = azT(G.az); x = t.sx * x + t.tx; y = t.sy * y + t.ty; }
      const p = G.panel;
      const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
      const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = G.fit; if (d === 0) break; }
    }
    return best ? toClientFit(best, r.left, r.top) : null;
  }

  // Scene point -> client px through the fit of the panel holding it (raster
  // tooltip anchoring), or null when that panel has no fit.
  function sceneToClient(x: number, y: number): { x: number; y: number } | null {
    const c = calibGroups();
    if (!c || !ws.svgEl) return null;
    let g = 0;
    if (ws.panels.length) { g = panelOfScene(x, y); if (g < 0) return null; }
    const f = c.groups[g] && c.groups[g].fit;
    if (!f || !f.sx || !f.sy) return null;
    const r = ws.svgEl.getBoundingClientRect();
    return { x: r.left + (x - f.ox) / f.sx, y: r.top + (y - f.oy) / f.sy };
  }

  function clientToScene(clientX: number, clientY: number): { x: number; y: number } {
    const f = calibrateXform(clientX, clientY);
    if (!f) return toView(clientX, clientY);
    return { x: f.ox + clientX * f.sx, y: f.oy + clientY * f.sy };
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

  return { currentViewBox, toUser, toView, toAnchor, azNearest, azT, azMulti, fmtPan, calibrateXform, sceneToClient, clientToScene, panelAt, dataRangeOf, brushDataFields };
}
