// vellumwidget — client-side interactivity runtime for vellum SVG scenes.
//
// A vellum scene renders to SVG where each interactive element carries a
// `data-key` (its datum's identity); the R side ships a `scene_model()` element
// table (key -> tooltip / hover-group / device-px bbox). This runtime wires the
// interactions onto that, entirely in the browser (no Shiny, no round-trip):
//   Phase 3: hover -> tooltip, hover -> highlight, click -> select.
//   Phase 4: nearest-mark hover snap, rectangular brush -> select, pan/zoom via
//            the SVG viewBox, and an on-hover toolbar (reset, zoom-to-selection,
//            save SVG/PNG, fullscreen).
// Element bboxes live in the SVG's viewBox coordinate space (device px), so the
// same coordinates drive rendering, brushing, and nearest-mark queries.

import Flatbush from "flatbush";
import { cssEscape, ensureStyle } from "./css";
import { DRAG_THRESHOLD, download, keyOf, sourceTable, vellumIdOf } from "./dom";
import { asColumn, normalizeElements, normalizePanels } from "./elements";
import { distToBbox, distToGeom, distToSegment2, hasBbox, isRoundMark, rectsIntersect, unionBbox } from "./geometry";
import type { Geom, GeometryPayload } from "./geometry";
import { busJoin, busPublish, busPublishView, getCrosstalk } from "./linking";
import type { CrosstalkHandle, ViewFraction } from "./linking";
import { GLYPH_MARKS, axisForEncoding, inInterval, intervalKeys, intervalRangeOf, nativeToData, pxToDataX, pxToDataY, selEncodings } from "./scales";
import type { IntervalRange } from "./scales";
import { dispatchProxyCall, registerProxyHandler } from "./shiny";
import { brushKeys, columnTolerance, lassoKeys, nearestKey, nearestSortedIdx, pointInPolygon, polyBounds } from "./spatial";
import type { Pt } from "./spatial";
import { axisRetickable, axisTicks, dataToNative, detectTimeFormat, fmtRNum, fmtTick, logTicks, niceTicks, strftimeUTC, timeTicks } from "./ticks";
import { sanitizeTip, stripTags } from "./tooltip";
import type { AxisAnchor, AzPanel, Bbox, ColorbarInfo, ElemMeta, InteractionSpec, Options, PanelInfo, Payload, Provenance, SelDef, ViewBox } from "./types";
import { conjugatePan, fmtViewBox, isZoomedIn, panToView, parseViewBox, userToCanvas, viewToPan, zoomViewBox } from "./viewbox";
import type { PanTransform } from "./viewbox";

HTMLWidgets.widget({
  name: "vellumwidget",
  type: "output",

  factory: function (el: HTMLElement) {
    ensureStyle();
    el.classList.add("vellumwidget-root");

    const tip = document.createElement("div");
    tip.className = "vellumwidget-tip";
    const brushBox = document.createElement("div");
    brushBox.className = "vellumwidget-brush";

    let holder: HTMLElement | null = null;
    let stage: HTMLElement | null = null; // shrink-wraps the base svg; overlays fill it
    let svgEl: SVGSVGElement | null = null;
    let toolbarEl: HTMLElement | null = null;
    // Overview navigator (opt-in): a strip below the plot with a draggable window
    // marking the visible x-range. Built once per render when opts.navigator.
    let navEl: HTMLElement | null = null;
    let navWindow: HTMLElement | null = null;
    // Continuous colorbar filter: the descriptor + its overlay layer, the current
    // selected value range (null = full), and the set of marks currently filtered
    // out (dimmed + inert), so hit-testing skips them like any other filter.
    let colorbar: ColorbarInfo | null = null;
    let colorbarLayer: SVGSVGElement | null = null;
    // Declarative interactivity (spec-driven): the interaction block + derived
    // indexes. `condTagElems` maps a "<sel>:<aes>" tag to the keys carrying it;
    // `lastHoverKeys` is the current hover set (a hover-triggered selection reads
    // it). Reset per render; empty when the plot declares no interaction.
    let interactions: InteractionSpec | null = null;
    // Click-to-source (from inspect_source()): rows per grob id, read on click.
    let provenance: Provenance | null = null;
    let condTagElems: Record<string, string[]> = {};
    let filtSelElems: Record<string, string[]> = {}; // filter selection -> keys of its target view
    let joinOf: Record<string, string> = {}; // key -> cross-view join id (compositions)
    let lastHoverKeys: string[] = [];
    let colorRange: { a: number; b: number } | null = null;
    let colorHiddenSet: Record<string, boolean> = {};
    let meta: Record<string, ElemMeta> = {};
    let groups: Record<string, string[]> = {};
    // Graph adjacency, reconstructed once per render from edge source/target meta
    // (empty for a non-graph scene): node -> its incident edge keys, node -> its
    // neighbour node keys, edge -> its two endpoint node keys. Drives neighbour
    // highlighting (linkedKeys) without any per-node link list in the payload.
    let incidentEdges: Record<string, string[]> = {};
    let neighbourNodes: Record<string, string[]> = {};
    let edgeEndpoints: Record<string, [string, string]> = {};
    // The select_neighbours() projection, if declared (else null): a node/edge
    // gesture expands to its graph neighbourhood.
    let neighbourExpand: { degree: number; edges: boolean } | null = null;
    let legendIndex: Record<string, string[]> = {}; // series key -> member element keys
    let legendSwatch: Record<string, string[]> = {}; // series key -> its legend swatch element keys
    let legendOff: Record<string, boolean> = {}; // series toggled off via a legend-click (hide/mute)
    let hiddenKeySet: Record<string, boolean> = {}; // member keys currently hidden (legendClick="hide")
    let filteredKeySet: Record<string, boolean> = {}; // keys hidden by a cross-filter (crosstalk / vw_filter)
    let elements: ElemMeta[] = [];
    let panels: PanelInfo[] = []; // cartesian data panels with scale descriptors (data-space mapping)
    let selected: Record<string, boolean> = {};
    let nodesByKey: Record<string, Element[]> = {}; // key -> SVG nodes (built once per render)
    let hoverRAF = 0; // rAF handle throttling the nearest-mark scan
    // Spatial index over element bboxes (built once per render), so nearest-mark
    // hover and brush hit-testing are O(log n)/O(k) instead of O(n) linear scans —
    // the per-frame cost that made hover laggy on a large plot. Falls back to the
    // pure scans when absent (0 bboxed elements).
    let spatialIndex: Flatbush | null = null;
    let indexToElem: number[] = []; // flatbush item id -> index into `elements`
    // True geometry per key (WI-3), when the payload carries it. The R-tree over
    // boxes still does the shortlisting -- a bbox distance is never greater than
    // the true distance, so nothing within range is missed -- and these rank the
    // shortlist exactly. Empty when the payload has no `geometry` block (an older
    // payload, or a scene above the vertex limit), in which case picking stays
    // bbox-only exactly as before.
    let geomByKey: Record<string, Geom[]> = {};
    let gx: Float64Array = new Float64Array(0);
    let gy: Float64Array = new Float64Array(0);
    let haveGeometry = false;
    // Above this many elements, dim on hover via the holder's opacity + a clone
    // overlay (O(hovered)) rather than the CSS rule that restyles every keyed node.
    const DIM_OVERLAY_MIN = 2000;
    let largeDim = false; // this render uses the overlay dim path
    let dimLayer: SVGSVGElement | null = null; // overlay carrying the crisp hovered clones
    // Unified-hover axis index (built once per render): element centres sorted by
    // x and by y, so the shared readout can seed off the nearest position on one
    // axis, plus the per-axis column tolerance (see columnTolerance).
    let crosshairLayer: SVGSVGElement | null = null; // overlay carrying the guide rule(s)
    let sortedCx: number[] = [];
    let sortedCxKeys: string[] = [];
    let sortedCy: number[] = [];
    let sortedCyKeys: string[] = [];
    let tolX = 1;
    let tolY = 1;
    // Raster mode: the marks are a single base <image>, so there are no per-element
    // DOM nodes. Hover/click/brush resolve against the spatial index and draw
    // feedback rings into two overlay groups instead of toggling classes on marks.
    let rasterMode = false;
    let selGroup: SVGGElement | null = null; // persistent selection rings
    let hovGroup: SVGGElement | null = null; // transient hover ring(s)
    // Crisp-zoom canvas (Phase 6): when the view is zoomed in, the base image would
    // upscale and blur, so the points are redrawn crisp on this canvas from data
    // sampled off the base raster (centre + radius from the index bbox, colour from
    // the rendered pixel). Falls back to image-only when no 2D context is available.
    let canvasEl: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let ptCx: Float64Array | null = null; // sampled point centres (viewBox space)
    let ptCy: Float64Array | null = null;
    let ptRad: Float64Array | null = null; // sampled point radii (viewBox units)
    let ptRGB: Uint8Array | null = null; // packed [r,g,b, r,g,b, …] per sampled point
    let ptN = 0; // number of sampled (drawable) points
    // Cap on how many selection rings to draw: a huge brush selects thousands of
    // points, and drawing a ring per point would reintroduce the DOM blowup raster
    // mode exists to avoid. The selection set itself is always fully tracked and
    // reported; only the on-canvas rings are bounded.
    const OVERLAY_MARK_CAP = 2000;
    let opts: Options = {
      tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true,
      toolbar: true, nearest: true, a11y: true, selectMode: "multiple",
      hoverMode: "closest", crosshair: false, navigator: false
    };
    // --- accessibility state ---
    let liveRegion: HTMLElement | null = null; // aria-live announcer
    let tableEl: HTMLElement | null = null; // hidden data-table fallback
    let focusables: { key: string; node: Element }[] = []; // roving-tabindex marks, in draw order
    let focusIdx = -1; // index into focusables of the currently-focused mark, or -1
    let vb0: ViewBox | null = null; // original viewBox (for reset)
    let vb: ViewBox | null = null; // current viewBox
    // Axis-aware zoom (opt-in). When active, applyViewBox scales `panGroup` by T
    // instead of moving the base viewBox, and hit-testing routes through panToView.
    let azPanels: AzPanel[] = []; // the zoomable panels (the first is the reference frame of `vb`)
    let panGroup: SVGGElement | null = null; // the first panel's pannable group (transformed by T)
    let axisZoomActive = false; // opt-in on + every cartesian panel pannable with re-tickable axes
    let retickLayer: SVGSVGElement | null = null; // overlay carrying re-ticked axis labels (fixed at vb0)
    let anchorPanel: AzPanel | null = null; // the panel a press started in (pins the gesture's frame)
    // Range-navigator x-only zoom: with the navigator on, zoom/pan is 1-D along x
    // (the selected x-range fills the width; the full y-range stays on screen), the
    // way a time-series range selector behaves. Implemented as a non-uniform
    // (`preserveAspectRatio="none"`) view with y pinned to the full extent.
    let xZoom = false;
    const axisStyle = { // presentation scraped from vellum's own axis/grid nodes so the re-tick matches the theme
      textFill: "#333333", fontFamily: "sans-serif", fontSize: 12,
      gridStroke: "#ffffff", gridWidth: 1
    };
    let mode: "brush" | "pan" | "lasso" = "brush";
    let lastBrush: Bbox | null = null; // last brushed region (user coords)
    // Active interval selections (select_interval()), by name: the member keys and
    // the brushed data range (null when it fell back to pixel hit-testing).
    let intervals: Record<string, { keys: string[]; range: IntervalRange | null }> = {};
    let intervalEl: SVGRectElement | null = null; // the persistent brush band (in crosshairLayer)
    let intervalBand: Bbox | null = null; // that band in scene (device-px) coords
    let lassoPts: Pt[] = []; // in-progress lasso path (user/viewBox coords)
    let lassoEl: SVGPolygonElement | null = null; // the drawn lasso outline (in crosshairLayer)
    // Linking state.
    const selfToken = {}; // identity on the own bus
    let group: string | null = null; // own-bus group
    let receivingView = false; // applying a peer's linked view (suppresses re-broadcast)
    let joined = false; // joined the own bus already (guard re-render)
    let ctSel: CrosstalkHandle | null = null; // crosstalk selection handle
    let ctFilt: CrosstalkHandle | null = null; // crosstalk filter handle

    // --- coordinates: client px -> SVG user space (viewBox coords) ---
    // The live viewBox: the zoom/pan state `vb`, else the svg's viewBox attribute,
    // else the rendered box (a raw vellum scene may omit a viewBox).
    function currentViewBox(): ViewBox {
      // Under axis_zoom the svg itself stays at the base view (only the data region
      // moves), so client px map into vb0; toView/toAnchor then undo the pan.
      if (vb) return axisZoomActive && vb0 ? vb0 : vb;
      const parsed = svgEl ? parseViewBox(svgEl.getAttribute("viewBox")) : null;
      if (parsed) return parsed;
      const r = (svgEl || el).getBoundingClientRect();
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
      const r = (svgEl || el).getBoundingClientRect();
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
      if (axisZoomActive && vb && vb0) return azBaseToScene(u.x, u.y);
      return u;
    }
    // The gesture anchor for a client position: the point in `vb`'s own frame (the
    // reference panel's) that a zoom/pan should hold under the cursor. Equal to
    // toView for one panel; with several, the cursor's panel is first mapped back
    // onto the reference panel (A⁻¹) so zooming in panel 3 zooms about the cursor.
    function toAnchor(clientX: number, clientY: number): { x: number; y: number } {
      const u = toUser(clientX, clientY);
      if (!axisZoomActive || !vb || !vb0) return u;
      const a = anchorPanel || azNearest(u.x, u.y);
      if (!a) return panToView(vb, vb0, u.x, u.y);
      return panToView(vb, vb0, (u.x - a.bx) / a.ax, (u.y - a.by) / a.ay);
    }
    // --- multi-panel axis-zoom geometry ---
    // The zoomable panel whose (fixed) rect contains or is nearest to a point. The
    // rects are the same in scene and base coordinates (the clip never moves).
    function azNearest(x: number, y: number): AzPanel | null {
      let best: AzPanel | null = null, bestD = Infinity;
      for (let i = 0; i < azPanels.length; i++) {
        const p = azPanels[i].p;
        const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
        const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = azPanels[i]; }
      }
      return best;
    }
    // T_i for a panel at the current view.
    function azT(a: AzPanel): PanTransform {
      return conjugatePan(viewToPan(vb || vb0!, vb0!), a.ax, a.bx, a.ay, a.by);
    }
    // A point in the fixed base (vb0) space -> the scene (device-px) point drawn
    // there: T_i⁻¹ for the panel under it.
    function azBaseToScene(x: number, y: number): { x: number; y: number } {
      const a = azNearest(x, y);
      if (!a) return vb && vb0 ? panToView(vb, vb0, x, y) : { x: x, y: y };
      const t = azT(a);
      return { x: t.sx ? (x - t.tx) / t.sx : x, y: t.sy ? (y - t.ty) / t.sy : y };
    }
    // Several panels zoom independently-translated (T_i differ), so overlays drawn
    // in scene coordinates must be placed per panel rather than by one viewBox.
    function azMulti(): boolean {
      return axisZoomActive && azPanels.length > 1 && !!vb0;
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
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        const scx = (e.x0! + e.x1!) / 2, scy = (e.y0! + e.y1!) / 2;
        if (!xi || scx < (xi.x0! + xi.x1!) / 2) xi = e;
        if (!xj || scx > (xj.x0! + xj.x1!) / 2) xj = e;
        if (!yi || scy < (yi.y0! + yi.y1!) / 2) yi = e;
        if (!yj || scy > (yj.y0! + yj.y1!) / 2) yj = e;
      }
      if (!xi || !xj || !yi || !yj) return null;
      const scr = (e: ElemMeta): { x: number; y: number } | null => {
        const n = elementsForKey(e.key)[0] as Element | undefined;
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
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
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
        const n = elementsForKey(e.key)[0] as Element | undefined;
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

    // --- highlight / tooltip (Phase 3) ---
    // Nodes are cached per render (built in renderValue), so a hover/select that
    // touches many keys is O(keys) map lookups instead of a `querySelectorAll`
    // per key — the main per-interaction cost at large N. The DOM is static after
    // render, so the cache stays valid.
    function elementsForKey(k: string): Element[] {
      const cached = nodesByKey[k];
      if (cached) return cached;
      if (!holder) return [];
      return Array.prototype.slice.call(holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
    }
    function addClassForKeys(keys: string[], cls: string): void {
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
      }
    }
    function clearClass(cls: string): void {
      if (!holder) return;
      const nodes = holder.querySelectorAll("." + cls);
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
    }
    // The graph neighbourhood of node `k` out to `degree` hops: the node, its
    // neighbour nodes, and (when `edges`) its incident edges, collected by BFS over
    // the reconstructed adjacency. Used by select_neighbours().
    function graphNeighbourhood(k: string, degree: number, edges: boolean): string[] {
      const seen: Record<string, boolean> = { [k]: true };
      const out: string[] = [k];
      let frontier = [k];
      for (let d = 0; d < degree; d++) {
        const next: string[] = [];
        for (let i = 0; i < frontier.length; i++) {
          const u = frontier[i];
          if (edges) {
            const inc = incidentEdges[u] || [];
            for (let j = 0; j < inc.length; j++) {
              if (!seen[inc[j]]) {
                seen[inc[j]] = true;
                out.push(inc[j]);
              }
            }
          }
          const nb = neighbourNodes[u] || [];
          for (let j = 0; j < nb.length; j++) {
            if (!seen[nb[j]]) {
              seen[nb[j]] = true;
              out.push(nb[j]);
              next.push(nb[j]);
            }
          }
        }
        frontier = next;
      }
      return out;
    }
    // The keys a hover or click on `k` acts on: a legend swatch drives its whole
    // series (`legend_for` -> the marks whose `legend` contains it). Under a
    // select_neighbours() preset, a graph edge drives its two endpoint nodes and a
    // graph node drives its neighbourhood. Otherwise a mark projects by its
    // `hover_group`, else just itself.
    function linkedKeys(k: string): string[] {
      const m = meta[k];
      if (m && m.legend_for != null) return (legendIndex[m.legend_for] || []).concat([k]);
      if (neighbourExpand) {
        const ep = edgeEndpoints[k];
        if (ep) return [k, ep[0], ep[1]]; // an edge -> its endpoints
        if (incidentEdges[k] || neighbourNodes[k]) {
          return graphNeighbourhood(k, neighbourExpand.degree, neighbourExpand.edges);
        }
      }
      const g = m && m.hover_group;
      return g && groups[g] ? groups[g] : [k];
    }
    // --- legend click-to-hide / -isolate ---
    function legendPolicy(): "select" | "hide" | "mute" {
      return opts.legendClick || "select";
    }
    // The series a legend swatch `k` drives, or null if `k` is not a swatch.
    function swatchSeries(k: string | null): string | null {
      if (k == null) return null;
      const m = meta[k];
      return m && m.legend_for != null ? m.legend_for : null;
    }
    // Reflect `legendOff` in the DOM: hide (or mute) each toggled-off series' marks
    // and dim its swatch. Rebuilds `hiddenKeySet` (the marks the hover path skips so
    // a hidden point isn't silently hovered). A no-op under the "select" policy.
    function applyLegend(): void {
      clearClass("vellumwidget-legend-hidden");
      clearClass("vellumwidget-legend-muted");
      clearClass("vellumwidget-legend-off");
      hiddenKeySet = {};
      const pol = legendPolicy();
      if (pol === "select") return;
      const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
      for (const s in legendOff) {
        if (!legendOff[s]) continue;
        const members = legendIndex[s] || [];
        addClassForKeys(members, cls);
        if (pol === "hide") for (let i = 0; i < members.length; i++) hiddenKeySet[members[i]] = true;
        addClassForKeys(legendSwatch[s] || [], "vellumwidget-legend-off");
      }
    }
    // Single click: toggle one series on/off.
    function legendToggle(series: string): void {
      legendOff[series] = !legendOff[series];
      applyLegend();
    }
    // Double click: isolate this series (turn every other off); if it is already
    // the only one on, restore all — the plotly/echarts legend convention.
    function legendIsolate(series: string): void {
      const all = Object.keys(legendIndex);
      const others = all.filter((s) => s !== series);
      const isolated = !legendOff[series] && others.every((s) => legendOff[s]);
      legendOff = {};
      if (!isolated) for (let i = 0; i < others.length; i++) legendOff[others[i]] = true;
      applyLegend();
    }
    // --- spatial index (nearest / brush) ---
    // Rebuild the Flatbush index from the current elements' bboxes. Only bboxed
    // elements are indexed; `indexToElem` maps a flatbush item id back to its
    // `elements` position. No index (0 bboxed) -> queries fall back to the pure
    // linear scans, which are correct at any size.
    function buildSpatialIndex(): void {
      spatialIndex = null;
      indexToElem = [];
      let count = 0;
      for (let i = 0; i < elements.length; i++) if (hasBbox(elements[i])) count++;
      if (!count) return;
      const idx = new Flatbush(count);
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        idx.add(e.x0, e.y0, e.x1, e.y1);
        indexToElem.push(i);
      }
      idx.finish();
      spatialIndex = idx;
    }
    // Unpack the columnar geometry block into flat coordinate arrays plus, per
    // key, the slices that belong to it. A key may own several geometry elements
    // (a datum drawn as a fill and a stroke; a series' line and its end label),
    // and its distance is the minimum over them.
    function buildGeometry(g: GeometryPayload | undefined): void {
      geomByKey = {};
      gx = new Float64Array(0);
      gy = new Float64Array(0);
      haveGeometry = false;
      if (!g) return;
      const keys = asColumn<string>(g.key);
      const kinds = asColumn<string>(g.kind);
      const ns = asColumn<number>(g.n);
      const xs = asColumn<number>(g.x);
      const ys = asColumn<number>(g.y);
      if (!keys.length || xs.length !== ys.length) return;
      gx = Float64Array.from(xs);
      gy = Float64Array.from(ys);
      // Ring boundaries of a multi-ring path. Absent (an older payload, or a
      // scene whose every element is one ring) means one ring per element,
      // which is what the whole vertex run already describes.
      const nrs = g.nr != null ? asColumn<number>(g.nr) : null;
      const rls = g.rl != null ? asColumn<number>(g.rl) : null;
      const eos = g.eo != null ? asColumn<number>(g.eo) : null;
      let at = 0, ra = 0;
      for (let i = 0; i < keys.length; i++) {
        const n = ns[i] | 0;
        if (n <= 0 || at + n > gx.length) break; // malformed: keep what parsed
        const rec: Geom = { kind: kinds[i], at: at, n: n };
        if (eos && eos[i] === 1) rec.evenodd = true;
        if (nrs && rls) {
          const k = nrs[i] | 0;
          if (k > 1) {
            const lens: number[] = [];
            for (let j = 0; j < k; j++) lens.push(rls[ra + j] | 0);
            rec.rings = lens;
          }
          ra += k > 0 ? k : 1;
        }
        (geomByKey[keys[i]] || (geomByKey[keys[i]] = [])).push(rec);
        at += n;
      }
      haveGeometry = at > 0;
    }
    // Distance from (x, y) to an element's true shape.
    //
    // The payload ships vertices only for the kinds whose shape is not their box
    // (segment/line/polygon/path). For everything else the box is the shape --
    // exactly so for a rect or a label, and for a round mark the inscribed disc,
    // which is reconstructed here rather than shipped as a centre per point.
    function distToElem(x: number, y: number, e: ElemMeta): number {
      const box = hasBbox(e) ? e : null;
      const gs = geomByKey[e.key];
      if (!gs) {
        if (!box) return Infinity;
        if (isRoundMark(e.mark)) {
          const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
          const r = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2;
          const dx = x - cx, dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          return d > r ? d - r : 0;
        }
        return distToBbox(x, y, box);
      }
      let best = Infinity;
      for (let i = 0; i < gs.length; i++) {
        const d = distToGeom(x, y, gs[i], gx, gy, box);
        if (d < best) best = d;
      }
      return best;
    }
    // Build the unified-hover axis index: element centres sorted by x and by y
    // (each paired with its key), plus the per-axis grouping tolerances. Cheap and
    // only used when hoverMode is "x"/"y"; harmless to build unconditionally.
    function buildHoverAxis(): void {
      const cx: { c: number; k: string }[] = [];
      const cy: { c: number; k: string }[] = [];
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        cx.push({ c: (e.x0 + e.x1) / 2, k: e.key });
        cy.push({ c: (e.y0 + e.y1) / 2, k: e.key });
      }
      cx.sort((a, b) => a.c - b.c);
      cy.sort((a, b) => a.c - b.c);
      sortedCx = cx.map((p) => p.c);
      sortedCxKeys = cx.map((p) => p.k);
      sortedCy = cy.map((p) => p.c);
      sortedCyKeys = cy.map((p) => p.k);
      tolX = columnTolerance(sortedCx);
      tolY = columnTolerance(sortedCy);
    }
    // Key of the mark nearest the cursor on a single axis (x or y), ignoring the
    // other — the seed for unified hover in open space, so the shared readout
    // tracks the cursor along the axis regardless of vertical (or horizontal)
    // distance. No radius cap: the pointer is already inside the plot.
    function nearestAxisKey(axis: "x" | "y", coord: number): string | null {
      const sorted = axis === "x" ? sortedCx : sortedCy;
      const keys = axis === "x" ? sortedCxKeys : sortedCyKeys;
      const i = nearestSortedIdx(sorted, coord);
      return i >= 0 ? keys[i] : null;
    }
    // The keys forming mark `primary`'s column: every mark whose centre is within
    // the axis tolerance of `primary`'s centre on that axis. Reuses the spatial
    // index via a thin strip query (a huge perpendicular span catches the whole
    // column), so it is O(k) in the column size. Falls back to just `primary`.
    function columnKeys(primary: string, axis: "x" | "y"): string[] {
      const m = meta[primary];
      if (!m || !hasBbox(m)) return [primary];
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const SPAN = 1e7; // effectively the full perpendicular extent
      const rect: Bbox = axis === "x"
        ? { x0: cx - tolX, x1: cx + tolX, y0: -SPAN, y1: SPAN }
        : { x0: -SPAN, x1: SPAN, y0: cy - tolY, y1: cy + tolY };
      const ks = brushKeysIn(rect);
      return ks.length ? ks : [primary];
    }
    // How many bbox-shortlisted candidates the exact pass ranks. A bbox distance
    // never exceeds the true distance, so the shortlist cannot miss anything in
    // range; the cap only bounds the work when many boxes are equally close (a
    // pile of long lines whose boxes all contain the cursor). Well above the
    // number of marks that overlap one cursor position in practice.
    const PICK_CANDIDATES = 256;
    // Nearest element key within `maxDist` of (x, y) — index-backed when available.
    //
    // Ranks by distance to the mark's true shape (WI-3), not to its box: an
    // edge's distance is to the line rather than to the rectangle its endpoints
    // span, a point inside a filled polygon is at distance zero, and a round mark
    // is measured to the disc. The R-tree still shortlists, since a box distance
    // is never greater than the true distance and so cannot hide anything in
    // range.
    function nearestKeyAt(x: number, y: number, maxDist: number): string | null {
      let best: string | null = null;
      let bestD = maxDist;
      const rank = (e: ElemMeta) => {
        // A graph edge is skipped only when nothing better than its box is
        // available for it — the box being the whole rectangle between its
        // endpoints is exactly why the exclusion existed. With vertices, the
        // distance is to the line and the edge competes on its merits.
        if (e.source != null && !geomByKey[e.key]) return;
        const d = distToElem(x, y, e);
        if (d <= bestD) {
          bestD = d;
          best = e.key;
        }
      };
      if (spatialIndex) {
        const ids = spatialIndex.neighbors(x, y, PICK_CANDIDATES, maxDist);
        for (let i = 0; i < ids.length; i++) rank(elements[indexToElem[ids[i]]]);
      } else {
        for (let i = 0; i < elements.length; i++) rank(elements[i]);
      }
      return best;
    }
    // Distinct keys whose bbox intersects `rect` — index-backed when available.
    // Item ids are mapped back to element order and de-duplicated so a key spanning
    // several elements is returned once (parity with the pure `brushKeys`).
    function brushKeysIn(rect: Bbox): string[] {
      if (!spatialIndex) return brushKeys(elements, rect);
      const eids = spatialIndex.search(rect.x0, rect.y0, rect.x1, rect.y1)
        .map((id) => indexToElem[id])
        .sort((a, b) => a - b);
      const out: string[] = [];
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < eids.length; i++) {
        const k = elements[eids[i]].key;
        if (!seen[k]) {
          seen[k] = true;
          out.push(k);
        }
      }
      return out;
    }
    // Distinct keys whose centre is inside the lasso polygon — index-backed when
    // available (prefilter by the polygon's bounds, then centre-in-polygon), else
    // the pure `lassoKeys` scan.
    function lassoKeysIn(poly: Pt[]): string[] {
      if (poly.length < 3) return [];
      if (!spatialIndex) return lassoKeys(elements, poly);
      const b = polyBounds(poly);
      const eids = spatialIndex.search(b.x0, b.y0, b.x1, b.y1)
        .map((id) => indexToElem[id])
        .sort((a, b) => a - b);
      const out: string[] = [];
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < eids.length; i++) {
        const e = elements[eids[i]];
        if (seen[e.key] || !hasBbox(e)) continue;
        if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
          seen[e.key] = true;
          out.push(e.key);
        }
      }
      return out;
    }

    // --- large-scene hover dim (overlay, O(hovered)) ---
    function dimOpacityVal(): string {
      const d = opts.style && opts.style.dimOpacity;
      return d == null || (d as unknown) === "" ? "0.28" : String(d);
    }
    // Dim the whole plot once (holder opacity) and clone the highlighted marks into
    // the overlay so they stay crisp above the dim — O(hovered), not O(n).
    function showHighlightOverlay(keys: string[]): void {
      if (!holder || !dimLayer) return;
      holder.style.opacity = dimOpacityVal();
      while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) {
          const c = nodes[j].cloneNode(true) as Element;
          c.classList.add("vellumwidget-hl");
          dimLayer.appendChild(azOverlayWrap(c, keys[i]));
        }
      }
    }
    // Multi-panel axis zoom: the overlay sits at the fixed base view, so a clone
    // drawn in scene coordinates is wrapped in its own panel's T_i. (One panel:
    // the overlay's viewBox tracks `vb`, which already applies T.)
    function azOverlayWrap(node: Element, key: string): Element {
      if (!azMulti()) return node;
      const m = meta[key];
      if (!m || !hasBbox(m)) return node;
      const a = azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
      if (!a) return node;
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("transform", fmtPan(azT(a)));
      g.appendChild(node);
      return g;
    }
    function hideHighlightOverlay(): void {
      if (holder) holder.style.opacity = "";
      if (dimLayer) while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
    }

    // --- crisp-zoom canvas point layer (raster mode, Phase 6) ---
    // Create the canvas once (sits above the base image, below the overlay rings).
    // `getContext` may be absent (jsdom / very old browsers) — then ctx stays null
    // and every draw is a no-op, leaving the faithful base image as the only layer.
    function ensureCanvas(): void {
      if (canvasEl) return;
      canvasEl = document.createElement("canvas");
      canvasEl.className = "vellumwidget-canvas";
      canvasEl.setAttribute("aria-hidden", "true");
      // Into the stage (not the root), so `inset:0` matches the svg box; see the
      // stage note in renderValue.
      (stage || el).appendChild(canvasEl);
      ctx = typeof canvasEl.getContext === "function" ? canvasEl.getContext("2d") : null;
    }
    function clearPointData(): void {
      ptCx = ptCy = ptRad = null;
      ptRGB = null;
      ptN = 0;
      if (canvasEl) canvasEl.style.display = "none";
    }
    // Sample each keyed element's colour from the rendered base raster (its centre
    // pixel) and record centre + radius (from the index bbox). Done once per render,
    // asynchronously after the image decodes. No colour data crosses the wire — it is
    // read back from the pixels vellum already drew, so the crisp layer matches them.
    function sampleBaseRaster(): void {
      clearPointData();
      if (!rasterMode || !svgEl || !vb0) return;
      const imgNode = svgEl.querySelector("image");
      const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
      if (!href) return;
      const off = document.createElement("canvas");
      const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
      if (!octx) return; // no 2D support -> canvas zoom disabled, image-only
      const iw = Math.max(1, Math.round(vb0.w));
      const ih = Math.max(1, Math.round(vb0.h));
      const els = elements; // capture (a later re-render replaces `elements`)
      const v0 = vb0;
      const img = new Image();
      img.onload = function () {
        // Guard against a re-render having happened before decode finished.
        if (els !== elements || v0 !== vb0) return;
        off.width = iw;
        off.height = ih;
        octx.drawImage(img, 0, 0, iw, ih);
        let data: Uint8ClampedArray;
        try {
          data = octx.getImageData(0, 0, iw, ih).data;
        } catch (e) {
          return; // tainted canvas (shouldn't happen for a same-origin data: URI)
        }
        const cx: number[] = [], cy: number[] = [], rad: number[] = [], rgb: number[] = [];
        for (let i = 0; i < els.length; i++) {
          const e = els[i];
          if (!hasBbox(e)) continue;
          const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
          const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
          const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
          const o = (sy * iw + sx) * 4;
          if (data[o + 3] < 8) continue; // transparent -> background, not a drawn mark
          cx.push(mx);
          cy.push(my);
          rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
          rgb.push(data[o], data[o + 1], data[o + 2]);
        }
        ptN = cx.length;
        ptCx = Float64Array.from(cx);
        ptCy = Float64Array.from(cy);
        ptRad = Float64Array.from(rad);
        ptRGB = Uint8Array.from(rgb);
        drawPoints(); // in case the view is already zoomed
      };
      img.onerror = function () {};
      img.src = href;
    }
    // Redraw the crisp point layer for the current view. Engages only when zoomed in
    // (otherwise the faithful base image shows and the canvas is hidden). Points
    // outside the view are culled, so a deep zoom draws only a handful.
    function drawPoints(): void {
      if (!rasterMode || !canvasEl || !ctx || !vb || !vb0) return;
      if (!isZoomedIn(vb, vb0) || !ptCx || !ptCy || !ptRad || !ptRGB || !ptN) {
        canvasEl.style.display = "none";
        return;
      }
      const rect = (svgEl || el).getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width || vb0.w));
      const ch = Math.max(1, Math.round(rect.height || vb0.h));
      const dpr = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
      if (canvasEl.width !== cw * dpr || canvasEl.height !== ch * dpr) {
        canvasEl.width = cw * dpr;
        canvasEl.height = ch * dpr;
      }
      canvasEl.style.width = cw + "px";
      canvasEl.style.height = ch + "px";
      canvasEl.style.display = "block";
      const W = canvasEl.width, H = canvasEl.height;
      ctx.clearRect(0, 0, W, H);
      // "fixed" (default): draw each point at its full-view pixel size (scale from
      // vb0), so zooming re-maps positions without growing the dots — parity with
      // the SVG axis_zoom constant-size glyphs. "scale": grow with the view (vb).
      const rScale = opts.zoomMarks === "scale"
        ? Math.min(W / vb.w, H / vb.h)
        : Math.min(W / vb0.w, H / vb0.h);
      const x0 = vb.x, y0 = vb.y, x1 = vb.x + vb.w, y1 = vb.y + vb.h;
      for (let i = 0; i < ptN; i++) {
        const px = ptCx[i], py = ptCy[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue; // cull off-view
        const p = userToCanvas(vb, W, H, px, py);
        ctx.beginPath();
        ctx.arc(p.px, p.py, Math.max(0.75, ptRad[i] * rScale), 0, 6.283185307179586);
        ctx.fillStyle = "rgb(" + ptRGB[i * 3] + "," + ptRGB[i * 3 + 1] + "," + ptRGB[i * 3 + 2] + ")";
        ctx.fill();
      }
    }

    // --- raster-mode feedback (rings drawn on the overlay, index-driven) ---
    const SVGNS = "http://www.w3.org/2000/svg";
    // A ring marking element `k`'s bbox, or null if it has no geometry. Drawn in the
    // overlay's viewBox space; `non-scaling-stroke` keeps it crisp under zoom.
    function ringFor(k: string, cls: string): SVGCircleElement | null {
      const m = meta[k];
      if (!m || !hasBbox(m)) return null;
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
      const c = document.createElementNS(SVGNS, "circle") as SVGCircleElement;
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      c.setAttribute("class", cls);
      c.setAttribute("vector-effect", "non-scaling-stroke");
      return c;
    }
    function clearGroup(g: SVGGElement | null): void {
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
    }
    // Redraw the persistent selection rings from the current `selected` set (bounded
    // by OVERLAY_MARK_CAP; the set itself is always fully tracked/reported).
    function drawSelFeedback(): void {
      clearGroup(selGroup);
      if (!selGroup) return;
      const keys = selectedKeys();
      if (keys.length > OVERLAY_MARK_CAP) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-sel");
        if (c) selGroup.appendChild(c);
      }
    }
    function drawHovFeedback(keys: string[]): void {
      clearGroup(hovGroup);
      if (!hovGroup) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-hov");
        if (c) hovGroup.appendChild(c);
      }
    }

    // Highlight an explicit set of keys (the shared path for closest-mark hover,
    // where keys = the mark's linked group, and unified hover, where keys = the
    // whole x-/y-column).
    function setHoverKeys(keys: string[]): void {
      if (!opts.hover) return;
      // Raster mode: no per-element nodes — draw a hover ring on the overlay.
      if (rasterMode) {
        drawHovFeedback(keys);
        return;
      }
      lastHoverKeys = keys;
      clearClass("vellumwidget-hl");
      addClassForKeys(keys, "vellumwidget-hl");
      reevaluateInteractions(); // hover-triggered conditions react to the new set
      // Large scenes: dim via the holder + clone the hovered marks into the overlay
      // (O(hovered)); otherwise the CSS `.vellumwidget-hovering` rule dims per node.
      if (largeDim) showHighlightOverlay(keys);
      else el.classList.add("vellumwidget-hovering");
    }
    function setHover(k: string): void {
      setHoverKeys(linkedKeys(k));
    }
    // --- crosshair guide (unified / details-on-demand hover) ---
    // A guide line in the overlay's viewBox space, spanning the current view.
    // `non-scaling-stroke` keeps it a crisp 1px under zoom.
    function crosshairLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
      const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", "vellumwidget-crosshair-line");
      l.setAttribute("vector-effect", "non-scaling-stroke");
      return l;
    }
    function clearCrosshair(): void {
      if (!crosshairLayer) return;
      // Keep the persistent interval-selection band; it is cleared with its selection.
      const kids = Array.prototype.slice.call(crosshairLayer.childNodes) as Node[];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] !== intervalEl) crosshairLayer.removeChild(kids[i]);
      }
    }
    // Draw the guide rule(s) through mark `k`'s centre: a vertical rule for "x"
    // mode, horizontal for "y", and a full cross for "closest". Spans the visible
    // view (the current viewBox), which the layer's viewBox tracks.
    function drawCrosshair(k: string, hm: "closest" | "x" | "y"): void {
      clearCrosshair();
      if (!crosshairLayer) return;
      const m = meta[k];
      if (!m || !hasBbox(m)) return;
      const view = vb || vb0;
      if (!view) return;
      let cx = (m.x0 + m.x1) / 2;
      let cy = (m.y0 + m.y1) / 2;
      let x0 = view.x, x1 = view.x + view.w, y0 = view.y, y1 = view.y + view.h;
      if (azMulti()) {
        // Several panels: the layer is at the base view, so place the mark's centre
        // through its panel's T_i and span that panel's rect.
        const a = azNearest(cx, cy);
        if (a) {
          const t = azT(a);
          cx = t.sx * cx + t.tx; cy = t.sy * cy + t.ty;
          x0 = a.p.px0; x1 = a.p.px1; y0 = a.p.py0; y1 = a.p.py1;
        }
      }
      if (hm !== "y") crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
      if (hm !== "x") crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
    }
    // --- tooltip: placement, delay, sticky (#14) ---
    let tipShowTimer = 0; // pending delayed reveal
    let tipHideTimer = 0; // pending sticky hide grace
    function tipDelay(): number {
      const d = opts.tooltipDelay;
      return typeof d === "number" && d > 0 ? d : 0;
    }
    // The hovered mark's centre in client px (for anchor-to-mark placement), or null.
    function markClient(k: string): { x: number; y: number } | null {
      const m = meta[k];
      if (!m || !hasBbox(m)) return null;
      // Most robust: the mark's own rendered node gives its client position directly
      // (no coordinate math). SVG mode always has a node; raster mode has none, so
      // fall back to the calibrated scene->client inverse, then rect+viewBox.
      const nodes = elementsForKey(k);
      if (nodes.length) {
        const r = (nodes[0] as Element).getBoundingClientRect();
        if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      const cx = (m.x0! + m.x1!) / 2;
      const cy = (m.y0! + m.y1!) / 2;
      const f = calibrateXform();
      if (f && f.sx && f.sy) return { x: (cx - f.ox) / f.sx, y: (cy - f.oy) / f.sy };
      if (!svgEl) return null;
      const r = svgEl.getBoundingClientRect();
      const view = currentViewBox();
      if (!view.w || !view.h || !r.width || !r.height) return null;
      return {
        x: r.left + ((cx - view.x) / view.w) * r.width,
        y: r.top + ((cy - view.y) / view.h) * r.height
      };
    }
    // Position the tip: at the cursor (follow, default) or anchored above the mark
    // (`tooltip_follow = FALSE`). Auto-flips below when there isn't room above, and
    // clamps horizontally so it doesn't overflow the widget.
    function placeTip(clientX: number, clientY: number, anchorKey: string | null): void {
      const box = el.getBoundingClientRect();
      let ax = clientX - box.left;
      let ay = clientY - box.top;
      if (opts.tooltipFollow === false && anchorKey) {
        const c = markClient(anchorKey);
        if (c) { ax = c.x - box.left; ay = c.y - box.top; }
      }
      const tw = tip.offsetWidth || 0;
      const th = tip.offsetHeight || 0;
      const below = ay - th - 12 < 0; // not enough room above -> flip below
      if (tw && box.width) ax = Math.max(tw / 2, Math.min(box.width - tw / 2, ax));
      tip.style.transform =
        "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px) " +
        (below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))");
    }
    // Reveal the tip: `build()` sets its content, then it is placed and shown. When
    // hidden and a delay is set, the reveal waits `tooltip_delay` ms (cancelled if
    // the hover changes first); an already-visible tip updates instantly (no
    // re-delay while moving between marks).
    function revealTip(build: () => void, clientX: number, clientY: number, anchorKey: string | null): void {
      if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
      const doShow = () => {
        tipShowTimer = 0;
        build();
        placeTip(clientX, clientY, anchorKey);
        tip.classList.add("vellumwidget-show");
      };
      const d = tipDelay();
      if (d > 0 && !tip.classList.contains("vellumwidget-show")) {
        if (tipShowTimer) clearTimeout(tipShowTimer);
        tipShowTimer = (setTimeout(doShow, d) as unknown) as number;
      } else {
        doShow();
      }
    }
    function showTip(clientX: number, clientY: number, k: string): void {
      const m = meta[k];
      revealTip(() => { tip.innerHTML = sanitizeTip((m && m.tooltip) || k); }, clientX, clientY, k);
    }
    // Unified tooltip: one box listing every mark in the hovered column, one row
    // per mark (its tooltip, or its key). Rows are capped so a dense column can't
    // build a runaway box.
    const TIP_MULTI_CAP = 30;
    function showTipMulti(clientX: number, clientY: number, keys: string[]): void {
      revealTip(() => {
        const rows: string[] = [];
        for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
          const m = meta[keys[i]];
          rows.push(sanitizeTip((m && m.tooltip) || keys[i]));
        }
        if (keys.length > TIP_MULTI_CAP) rows.push("…");
        tip.innerHTML = rows.join("<br>");
      }, clientX, clientY, keys[0] || null);
    }
    function hideTip(): void {
      if (tipShowTimer) { clearTimeout(tipShowTimer); tipShowTimer = 0; }
      if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
      tip.classList.remove("vellumwidget-show");
    }
    // Hide on hover-out. When sticky, linger briefly so the pointer can travel into
    // the tip (to click a link); entering the tip cancels this (see wireStickyTip).
    function scheduleHideTip(): void {
      if (tipShowTimer) { clearTimeout(tipShowTimer); tipShowTimer = 0; }
      if (opts.tooltipSticky) {
        if (tipHideTimer) clearTimeout(tipHideTimer);
        tipHideTimer = (setTimeout(() => { tipHideTimer = 0; tip.classList.remove("vellumwidget-show"); }, 260) as unknown) as number;
      } else {
        tip.classList.remove("vellumwidget-show");
      }
    }
    function clearHover(): void {
      if (rasterMode) clearGroup(hovGroup);
      if (largeDim) hideHighlightOverlay();
      el.classList.remove("vellumwidget-hovering");
      clearClass("vellumwidget-hl");
      clearCrosshair();
      scheduleHideTip(); // immediate, unless sticky (then a short grace to reach the tip)
      shinyInput("hover", null); // hover ended -> input$<id>_hover = NULL (deduped)
      if (lastHoverKeys.length) {
        lastHoverKeys = [];
        reevaluateInteractions(); // hover-triggered conditions revert
      }
    }

    // --- Shiny read-back ---
    // Push an interaction to a Shiny input (`input$<outputId>_<event>`). A no-op
    // outside a live Shiny app: HTMLWidgets.shinyMode is false in static HTML /
    // knitr / pkgdown, so those renders never touch Shiny. `el.id` equals the
    // output id (already module-namespaced), read lazily here. Use
    // {priority:"event"} for discrete events (click/brush); omit it for state
    // (the selection set) so re-setting the same value is a server no-op.
    function shinyInput(event: string, value: unknown, opts?: { priority?: string }): void {
      const hw = HTMLWidgets as unknown as { shinyMode?: boolean };
      const sh = (window as unknown as {
        Shiny?: { setInputValue?: (id: string, v: unknown, o?: unknown) => void };
      }).Shiny;
      if (hw.shinyMode && sh && sh.setInputValue && el.id) {
        sh.setInputValue(el.id + "_" + event, value, opts);
      }
    }

    // --- selection (+ linking) ---
    function refreshSelected(): void {
      if (rasterMode) {
        drawSelFeedback();
        return;
      }
      clearClass("vellumwidget-selected");
      for (const k in selected) if (selected[k]) addClassForKeys([k], "vellumwidget-selected");
      reevaluateInteractions(); // click/select-triggered conditions react
    }
    function selectedKeys(): string[] {
      return Object.keys(selected).filter((k) => selected[k]);
    }
    // Publish the current selection to linked views (own bus + crosstalk). Called
    // only from local mutations; the incoming appliers below never broadcast, so
    // there is no feedback loop.
    function broadcast(): void {
      const keys = selectedKeys();
      if (group) busPublish(group, selfToken, keys);
      if (ctSel) ctSel.set(keys);
      shinyInput("selected", keys); // deduped state -> input$<id>_selected
    }
    function toggleSelect(k: string): void {
      const ks = linkedKeys(k);
      if (opts.selectMode === "single") {
        const allOn = ks.every((x) => selected[x]) && selectedKeys().length === ks.length;
        selected = {};
        if (!allOn) ks.forEach((x) => (selected[x] = true));
      } else {
        const turnOn = !ks.every((x) => selected[x]);
        ks.forEach((x) => (selected[x] = turnOn));
      }
      refreshSelected();
      broadcast();
    }
    function setSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
      broadcast();
    }
    function clearSelection(): void {
      selected = {};
      const hadInterval = clearIntervals();
      refreshSelected();
      broadcast();
      // Clearing the brush clears the interval selection: tell Shiny too.
      if (hadInterval) shinyInput("brush", null, { priority: "event" });
    }
    // A selection arriving from a linked view — apply WITHOUT re-broadcasting to
    // the JS bus (feedback-loop guard), but still surface it to Shiny so the
    // server sees this widget's true current selection regardless of source.
    function applyLinkedSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
      shinyInput("selected", selectedKeys());
    }
    // Cross-filter (display tier): hide keyed elements whose key is not in the
    // shown set. `null` clears the filter (show everything).
    function applyFilter(showKeys: string[] | null): void {
      clearClass("vellumwidget-filtered");
      filteredKeySet = {};
      if (showKeys == null) return;
      const show: Record<string, boolean> = {};
      for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
      for (let i = 0; i < elements.length; i++) {
        const key = elements[i].key;
        if (!show[key]) {
          addClassForKeys([key], "vellumwidget-filtered");
          filteredKeySet[key] = true;
        }
      }
    }
    // A mark is "inert" when it is hidden by a legend-click (`hide`) or by a
    // cross-filter: display:none, so it can't be a pointer target, but it is still
    // in the spatial index. Every geometry-driven hit test (nearest-hover, brush,
    // lasso, raster click-snap) and keyboard traversal must skip it — otherwise a
    // hidden datum can be hovered, tooltipped, or (re-)selected. Muted legend marks
    // stay visible and are NOT inert.
    function inert(k: string): boolean {
      return !!hiddenKeySet[k] || !!filteredKeySet[k] || !!colorHiddenSet[k];
    }
    function dropInert(keys: string[]): string[] {
      return keys.filter((k) => !inert(k));
    }

    // --- declarative interactivity (spec-driven; DECLARATIVE-INTERACTIVITY) ---
    // Build the per-render indexes from the interaction block: which keys carry
    // each condition tag ("<sel>:<aes>"). Called once per render.
    function setupInteractions(): void {
      condTagElems = {};
      filtSelElems = {};
      joinOf = {};
      if (!interactions) return;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.cond) {
          for (let t = 0; t < e.cond.length; t++) {
            (condTagElems[e.cond[t]] = condTagElems[e.cond[t]] || []).push(e.key);
          }
        }
        if (e.filt) {
          for (let t = 0; t < e.filt.length; t++) {
            (filtSelElems[e.filt[t]] = filtSelElems[e.filt[t]] || []).push(e.key);
          }
        }
        if (e.join != null) joinOf[e.key] = e.join;
      }
    }
    // The member key set of a selection given the current gesture state. A
    // hover-triggered selection reads the current hover set; a click/point one
    // reads the persistent selection. (Interval selections are wired in a later
    // stage.)
    function selectionMembers(sel: SelDef): Record<string, boolean> {
      const set: Record<string, boolean> = {};
      // A brushed interval selection is its own member set (by data value), set by
      // the brush and emptied when the brush is cleared. A lasso interval keeps the
      // gesture's pixel selection.
      if (sel.kind === "interval" && sel.region !== "lasso") {
        const iv = intervals[sel.name];
        const ks = iv ? iv.keys : [];
        for (let i = 0; i < ks.length; i++) set[ks[i]] = true;
        return set;
      }
      let keys = sel.on === "hover" ? lastHoverKeys : selectedKeys();
      // A click-driven select_neighbours() expands the raw clicked nodes to their
      // neighbourhood so a condition/filter reacts to the whole set. Hover keys are
      // already the linkedKeys() projection, so they are left as-is.
      if (
        sel.on !== "hover" &&
        sel.expand &&
        sel.expand.mode === "neighbours" &&
        neighbourExpand
      ) {
        const out: string[] = [];
        const seen: Record<string, boolean> = {};
        for (let i = 0; i < keys.length; i++) {
          const proj = linkedKeys(keys[i]);
          for (let j = 0; j < proj.length; j++) {
            if (!seen[proj[j]]) {
              seen[proj[j]] = true;
              out.push(proj[j]);
            }
          }
        }
        keys = out;
      }
      for (let i = 0; i < keys.length; i++) set[keys[i]] = true;
      return set;
    }
    // Apply an active condition's `if_false` to a non-member node: an explicit
    // colour recolours the fill/stroke it actually uses (never the fill:none twin
    // of a point); no colour falls back to the theme-dim class.
    function styleCondNode(node: Element, color: string | null | undefined): void {
      if (color == null) {
        node.classList.add("vellumwidget-cond-dim");
        return;
      }
      const n = node as unknown as { style: CSSStyleDeclaration };
      const f = node.getAttribute("fill");
      if (f && f !== "none") n.style.fill = color;
      const s = node.getAttribute("stroke");
      if (s && s !== "none") n.style.stroke = color;
    }
    function clearCondNode(node: Element): void {
      node.classList.remove("vellumwidget-cond-dim");
      const n = node as unknown as { style: CSSStyleDeclaration };
      if (n.style.fill) n.style.fill = "";
      if (n.style.stroke) n.style.stroke = "";
    }
    // Re-evaluate every conditional encoding against the current selection state:
    // members keep `if_true` (already drawn), non-members get `if_false`. With an
    // empty selection and `empty !== false`, the whole plot stays `if_true`
    // (spotlight semantics — matches the static render). SVG mode only.
    function applyConditions(): void {
      if (rasterMode || !interactions || !interactions.conditions) return;
      const selByName: Record<string, SelDef> = {};
      (interactions.selections || []).forEach((s) => (selByName[s.name] = s));
      for (let ci = 0; ci < interactions.conditions.length; ci++) {
        const c = interactions.conditions[ci];
        const tag = c.selection + ":" + c.aes;
        const tagged = condTagElems[tag] || [];
        const sel = selByName[c.selection];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || c.empty === false;
        for (let i = 0; i < tagged.length; i++) {
          const nodes = elementsForKey(tagged[i]);
          const member = !!members[tagged[i]];
          for (let j = 0; j < nodes.length; j++) {
            clearCondNode(nodes[j]);
            if (active && !member) styleCondNode(nodes[j], c.if_false);
          }
        }
      }
    }
    // Enact declared filters: show only the union of the filter selections'
    // members (hiding the rest via the existing cross-filter path). A filter whose
    // selection is empty imposes no restriction when empty !== false (spotlight),
    // so an untouched plot shows everything. Only runs when the plot declares a
    // filter, so it never clobbers a crosstalk/legend filter on a plain plot.
    // A selection's members as cross-view *join* ids (so a gesture in one cell
    // maps to matching rows in another). Falls back to the key itself when there
    // is no join (a single view), preserving single-view filtering.
    function memberJoins(members: Record<string, boolean>): Record<string, boolean> {
      const js: Record<string, boolean> = {};
      for (const k in members) js[joinOf[k] != null ? joinOf[k] : k] = true;
      return js;
    }
    function applyFilters(): void {
      const ix = interactions;
      if (rasterMode || !ix || !ix.filters || !ix.filters.length) return;
      const filters = ix.filters;
      const selByName: Record<string, SelDef> = {};
      (ix.selections || []).forEach((s) => (selByName[s.name] = s));
      // Hide only the *filtered view's* elements (those tagged with the filter's
      // selection) whose join id is not selected — scoped by the per-cell-unique
      // key, so the source view stays fully visible. An empty selection with
      // empty !== false imposes no restriction.
      const hide: Record<string, boolean> = {};
      let restrict = false;
      for (let i = 0; i < filters.length; i++) {
        const selName = filters[i].selection;
        const sel = selByName[selName];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || (sel && sel.empty === false);
        if (!active) continue;
        restrict = true;
        const keep = memberJoins(members);
        const targets = filtSelElems[selName] || [];
        for (let t = 0; t < targets.length; t++) {
          const k = targets[t];
          const j = joinOf[k] != null ? joinOf[k] : k;
          if (!keep[j]) hide[k] = true;
        }
      }
      if (!restrict) {
        applyFilter(null);
        return;
      }
      // Translate the hide set into the show set applyFilter() expects (keys unique,
      // so hiding a target-cell key never touches the source cell).
      const show: string[] = [];
      for (let i = 0; i < elements.length; i++) {
        if (!hide[elements[i].key]) show.push(elements[i].key);
      }
      applyFilter(show);
    }
    // The single re-evaluation hook: called whenever a selection's member set can
    // change (hover move/clear, click/select/brush). Conditions + filters today;
    // scale binds add their reaction here in a later stage.
    function reevaluateInteractions(): void {
      applyConditions();
      applyFilters();
    }
    // --- interval selections (select_interval()) ---
    // The declared brush-driven interval selections (a lasso interval keeps the
    // pixel selection path).
    function rectIntervalSels(): SelDef[] {
      const sels = (interactions && interactions.selections) || [];
      return sels.filter((s) => s.kind === "interval" && s.region !== "lasso");
    }
    // The band a brush covers once locked to its encodings: an axis the selection
    // does not constrain spans the whole panel (an x-only brush is full height).
    function lockRect(p: PanelInfo | null, rect: Bbox, encs: string[]): Bbox {
      if (!p) return rect;
      let h = false, v = false;
      for (let i = 0; i < encs.length; i++) {
        const hit = axisForEncoding(p, encs[i]);
        if (hit) { if (hit.horizontal) h = true; else v = true; }
      }
      if (!h && !v) return rect;
      return {
        x0: h ? rect.x0 : Math.min(p.px0, p.px1), x1: h ? rect.x1 : Math.max(p.px0, p.px1),
        y0: v ? rect.y0 : Math.min(p.py0, p.py1), y1: v ? rect.y1 : Math.max(p.py0, p.py1)
      };
    }
    // Fill every brush-driven interval selection from a completed brush (device-px
    // scene rect): resolve it through the panel's scales to a data range per
    // encoding and take the elements whose data values fall inside. Falls back to
    // pixel hit-testing of the locked band when the scales can't be inverted (a raw
    // scene, a composition, a custom transform). Returns the union of members plus
    // the fields the `_brush` event carries, or null when none is declared.
    function applyIntervalBrush(rect: Bbox): { keys: string[]; band: Bbox; fields: Record<string, unknown> } | null {
      const sels = rectIntervalSels();
      if (!sels.length) return null;
      const p = panelAt((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
      // A legend- or colorbar-hidden mark is never a member; a mark hidden by this
      // selection's own filter_by() must stay eligible, or widening the brush could
      // never bring it back.
      const eligible = (k: string): boolean => !hiddenKeySet[k] && !colorHiddenSet[k];
      intervals = {};
      const union: string[] = [];
      const seen: Record<string, boolean> = {};
      const ranges: Record<string, IntervalRange | null> = {};
      let band = rect;
      for (let i = 0; i < sels.length; i++) {
        const encs = selEncodings(sels[i]);
        const locked = lockRect(p, rect, encs);
        if (i === 0) band = locked;
        const r = p ? intervalRangeOf(p, rect, encs) : null;
        const ks = r ? intervalKeys(elements, r).filter(eligible) : dropInert(brushKeysIn(locked));
        intervals[sels[i].name] = { keys: ks, range: r };
        ranges[sels[i].name] = r;
        for (let j = 0; j < ks.length; j++) {
          if (!seen[ks[j]]) { seen[ks[j]] = true; union.push(ks[j]); }
        }
      }
      const first = sels[0].name;
      const fields: Record<string, unknown> = { selection: first };
      const r0 = ranges[first];
      if (r0) {
        const iv: Record<string, unknown> = {};
        if (r0.x) iv.x = r0.x.levels ? r0.x.levels : [r0.x.lo, r0.x.hi];
        if (r0.y) iv.y = r0.y.levels ? r0.y.levels : [r0.y.lo, r0.y.hi];
        fields.interval = iv;
      }
      drawIntervalBand(band);
      return { keys: union, band: band, fields: fields };
    }
    // Draw (or move) the persistent brush band in the view-tracking overlay, in
    // scene coords, so it stays on the brushed data through pan/zoom.
    function drawIntervalBand(b: Bbox): void {
      intervalBand = b;
      placeIntervalBand();
    }
    // Place the band for the current view. The overlay tracks the view, so scene
    // coords line up, except under multi-panel axis zoom: there the overlay holds
    // the base view and each panel has its own T_i, so map the band through the
    // brushed panel's transform and clip it to that panel's frame.
    function placeIntervalBand(): void {
      const sb = intervalBand;
      if (!crosshairLayer || !sb) return;
      let b = sb;
      if (azMulti()) {
        const a = azNearest((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2);
        if (a) {
          const t = azT(a);
          const p = a.p;
          b = {
            x0: Math.max(Math.min(p.px0, p.px1), t.sx * sb.x0 + t.tx),
            x1: Math.min(Math.max(p.px0, p.px1), t.sx * sb.x1 + t.tx),
            y0: Math.max(Math.min(p.py0, p.py1), t.sy * sb.y0 + t.ty),
            y1: Math.min(Math.max(p.py0, p.py1), t.sy * sb.y1 + t.ty)
          };
        }
      }
      if (!intervalEl) {
        intervalEl = document.createElementNS(SVGNS, "rect") as SVGRectElement;
        intervalEl.setAttribute("class", "vellumwidget-interval");
        intervalEl.setAttribute("vector-effect", "non-scaling-stroke");
      }
      if (intervalEl.parentNode !== crosshairLayer) crosshairLayer.appendChild(intervalEl);
      intervalEl.setAttribute("x", String(b.x0));
      // (b may be empty once the brushed range is panned out of its panel)
      intervalEl.setAttribute("y", String(b.y0));
      intervalEl.setAttribute("width", String(Math.max(0, b.x1 - b.x0)));
      intervalEl.setAttribute("height", String(Math.max(0, b.y1 - b.y0)));
    }
    // Empty every interval selection and remove its band. True if one was active.
    function clearIntervals(): boolean {
      const had = Object.keys(intervals).length > 0;
      intervals = {};
      intervalBand = null;
      if (intervalEl && intervalEl.parentNode) intervalEl.parentNode.removeChild(intervalEl);
      return had;
    }

    // --- server -> client proxy (vellumwidget_proxy) ---
    // Route a command from the Shiny server onto this instance, without a
    // re-render. `args` is normalised to a key array (Shiny may auto-unbox a
    // length-1 vector to a scalar, so accept scalar/array/absent uniformly).
    function proxyCall(method: string, args: unknown): void {
      const keys: string[] = Array.isArray(args)
        ? (args as string[])
        : args == null ? [] : [String(args)];
      switch (method) {
        case "select": setSelection(keys); break;
        case "clearSelection": clearSelection(); break;
        case "filter": applyFilter(keys); break;
        case "clearFilter": applyFilter(null); break;
        case "zoom": proxyZoomToKeys(keys); break;
        case "resetZoom": resetZoom(); break;
        default: break; // ignore unknown methods (forward-compatible)
      }
    }
    // Frame the given keys' union bbox; empty keys reset to the full view.
    function proxyZoomToKeys(keys: string[]): void {
      if (!keys.length) { resetZoom(); return; }
      const sel: Record<string, boolean> = {};
      for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
      const bb = unionBbox(elements, sel);
      if (bb) zoomTo(bb);
    }

    // Join the linking channels for this widget's groups (once).
    function setupLinking(): void {
      if (joined) return;
      joined = true;
      if (group) busJoin(group, { token: selfToken, onSelect: applyLinkedSelection, onView: applyLinkedView });
      const ct = getCrosstalk();
      if (opts.crosstalk && ct) {
        ctSel = new ct.SelectionHandle(opts.crosstalk);
        ctFilt = new ct.FilterHandle(opts.crosstalk);
        ctSel.on("change", function (e) {
          if (e.sender !== ctSel) applyLinkedSelection(e.value || []);
        });
        ctFilt.on("change", function (e) {
          applyFilter(e.value);
        });
      }
    }

    // --- data-space mapping helpers (need the `scales` panel payload) ---
    // The panel whose device-px rect contains (x, y); else the sole cartesian
    // panel (the common single-panel case); else null. Data-space mapping is only
    // offered when unambiguous — with several panels and a point outside them all
    // we can't say which axes apply.
    function panelAt(x: number, y: number): PanelInfo | null {
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return p;
      }
      return panels.length === 1 ? panels[0] : null;
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

    // --- viewBox pan/zoom ---
    // Report the current view to Shiny as `input$<id>_zoom` (a deduped state input):
    // the current viewBox in device-px (`x`/`y`/`w`/`h`) + a `zoomed` flag, and —
    // when the scene carries a single cartesian panel's scale descriptor — the
    // visible range in `data` coordinates (`data.x`/`data.y`/`data.panel`).
    function reportView(): void {
      if (!vb) return;
      const payload: {
        x: number; y: number; w: number; h: number; zoomed: boolean;
        data?: { x?: number[]; y?: number[]; panel: string };
      } = { x: vb.x, y: vb.y, w: vb.w, h: vb.h, zoomed: vb0 ? isZoomedIn(vb, vb0) : false };
      if (panels.length === 1) {
        // Visible data range: over the whole view normally; over the panel's own
        // (T-inverted) corners under axis_zoom, where only the data region scales.
        let d;
        if (axisZoomActive && vb0) {
          const p = panels[0];
          const a = panToView(vb, vb0, p.px0, p.py0);
          const b = panToView(vb, vb0, p.px1, p.py1);
          d = dataRangeOf(p, a.x, a.y, b.x, b.y);
        } else {
          d = dataRangeOf(panels[0], vb.x, vb.y, vb.x + vb.w, vb.y + vb.h);
        }
        if (d) payload.data = d;
      }
      shinyInput("zoom", payload);
      // Linked pan/zoom: broadcast the view as a fraction of our own original
      // viewBox to the group's other members. Suppressed while we are *applying* a
      // peer's view (feedback-loop guard).
      if (group && vb0 && !receivingView && vb0.w && vb0.h) {
        busPublishView(group, selfToken, {
          x: (vb.x - vb0.x) / vb0.w, y: (vb.y - vb0.y) / vb0.h,
          w: vb.w / vb0.w, h: vb.h / vb0.h
        });
      }
    }
    // Apply a linked view from a peer: map its view-fraction onto our own viewBox.
    // Guarded so re-emitting (Shiny) is fine but we do not re-broadcast to the bus.
    function applyLinkedView(v: ViewFraction): void {
      if (!vb0) return;
      const next = {
        x: vb0.x + v.x * vb0.w, y: vb0.y + v.y * vb0.h,
        w: v.w * vb0.w, h: v.h * vb0.h
      };
      if (!(next.w > 0) || !(next.h > 0)) return;
      // No-op if unchanged (avoids redundant work and ping-pong on equal views).
      if (vb && Math.abs(next.x - vb.x) < 1e-6 && Math.abs(next.y - vb.y) < 1e-6 &&
          Math.abs(next.w - vb.w) < 1e-6 && Math.abs(next.h - vb.h) < 1e-6) return;
      receivingView = true;
      vb = next;
      applyViewBox(); // reportView() here emits _zoom but skips the bus (guarded)
      receivingView = false;
    }
    // Set the aspect policy on the base svg + overlays. In x-only (navigator) mode
    // the view maps non-uniformly (`none`) so a narrow x-range fills the width while
    // the full-height y-range still fills the height; otherwise the scene keeps its
    // aspect (`meet`). At the full view the two are visually identical (the viewBox
    // aspect equals the box aspect); the stretch only appears once x is zoomed.
    function applyAspect(): void {
      // Stretch (non-uniform) only for x-only zoom WITHOUT axis_zoom: axis_zoom holds
      // the frame at vb0 and re-ticks, so it renders the x-only view (via a pan-group
      // transform whose y-scale is 1) with no stretch and crisp, re-numbered axes.
      const par = (xZoom && !axisZoomActive) ? "none" : "xMidYMid meet";
      if (svgEl) svgEl.setAttribute("preserveAspectRatio", par);
      if (dimLayer) dimLayer.setAttribute("preserveAspectRatio", par);
      if (crosshairLayer) crosshairLayer.setAttribute("preserveAspectRatio", par);
      if (colorbarLayer) colorbarLayer.setAttribute("preserveAspectRatio", par);
    }
    function applyViewBox(): void {
      // x-only range zoom: keep the full y-extent on screen (never crop the y-axis),
      // so every zoom/pan path (nav, wheel, pinch, keyboard, linked) is 1-D in x.
      if (xZoom && vb && vb0) { vb.y = vb0.y; vb.h = vb0.h; }
      if (axisZoomActive && panGroup && vb && vb0) {
        // Axis-aware zoom: hold the base frame at vb0 and scale only the data region
        // by T (so axes/titles/legend stay put), then re-tick for the visible range.
        // Each panel gets T conjugated onto its own rect (T itself for one panel).
        applyPanTransforms();
        if (svgEl) svgEl.setAttribute("viewBox", fmtViewBox(vb0));
        retick();
      } else if (svgEl && vb) {
        svgEl.setAttribute("viewBox", fmtViewBox(vb));
      }
      // Overlays that sit over the panel marks track the view (their device-px
      // content zooms with the marks); the colorbar overlay tracks the FIXED base
      // under axis_zoom (the colorbar is furniture outside the panel, so it stays put).
      // With several zoomed panels no single viewBox fits them all, so the overlays
      // hold the base view and place their content per panel (azOverlayWrap).
      const overlayVb = azMulti() ? vb0 : vb;
      if (dimLayer && overlayVb) dimLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      if (crosshairLayer && overlayVb) crosshairLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      placeIntervalBand(); // an active interval band follows the per-panel zoom
      if (colorbarLayer && (vb || vb0)) {
        colorbarLayer.setAttribute("viewBox", fmtViewBox(axisZoomActive && vb0 ? vb0 : vb!));
      }
      // Redraw the crisp point layer for the new view (no-op unless raster + zoomed in).
      drawPoints();
      updateNav(); // keep the navigator window in sync with the view
      // Report on settle: a continuous pan/pinch reports once on release (from
      // onDragUp), not per frame; discrete zooms (wheel, keys, reset, zoom-to) land
      // here with no drag in progress and report immediately.
      if (dragging !== "pan" && pinchDist === 0) reportView();
    }
    function resetZoom(): void {
      if (vb0) {
        vb = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h };
        applyViewBox();
      }
    }
    function zoomTo(rect: Bbox, pad = 0.05): void {
      if (!vb) return;
      // Multi-panel axis zoom: `vb` is in the reference panel's frame, so map a
      // region in another panel back onto the reference rect first (A⁻¹).
      if (azMulti()) {
        const a = azNearest((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
        if (a) {
          rect = {
            x0: (rect.x0 - a.bx) / a.ax, x1: (rect.x1 - a.bx) / a.ax,
            y0: (rect.y0 - a.by) / a.ay, y1: (rect.y1 - a.by) / a.ay
          };
        }
      }
      const w = Math.max(rect.x1 - rect.x0, 1e-6);
      const h = Math.max(rect.y1 - rect.y0, 1e-6);
      const px = w * pad;
      const py = h * pad;
      vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
      applyViewBox();
    }

    // --- axis-aware zoom (Phase 2, opt-in) ---
    // Decide whether this render can do axis-aware zoom, wire its DOM once, and hide
    // vellum's static axes/gridlines (which would go stale under a zoom that only
    // re-scales the data region). Gated to: opt-in on, SVG (not raster), and every
    // pannable group in the scene backed by a cartesian panel whose x and y axes the
    // re-ticker can follow (linear/sqrt/reverse, log10, date/datetime, or discrete/
    // binned/other with their static breaks). Several panels (facets) zoom together:
    // the first is the reference frame of `vb`, the rest follow by conjugation.
    // Anything else leaves axisZoomActive false and the ordinary viewBox zoom stands.
    function setupAxisZoom(): void {
      for (let i = 0; i < azPanels.length; i++) {
        const g = azPanels[i].grid;
        if (g && g.parentNode) g.parentNode.removeChild(g);
      }
      azPanels = []; panGroup = null; axisZoomActive = false; anchorPanel = null;
      if (retickLayer) { retickLayer.remove(); retickLayer = null; }
      if (!opts.axisZoom || rasterMode || !svgEl || !vb0 || !stage || !panels.length) return;
      for (let i = 0; i < panels.length; i++) {
        if (!axisRetickable(panels[i].x) || !axisRetickable(panels[i].y)) return;
      }
      // A void panel (a graph's aspect-locked layout, or theme_void) has no static
      // axes in the frozen scene. There is nothing to re-tick, and re-ticking would
      // invent axes the render never had; the independent-axis pan transform would
      // also shear an aspect-locked graph. Fall back to plain viewBox zoom.
      if (!svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text')) return;
      // Every pannable group must belong to a described panel: one the widget can't
      // re-tick (e.g. a polar panel in a composition) would freeze while the rest zoom.
      const pans = svgEl.querySelectorAll("[data-vellum-pan]");
      for (let i = 0; i < pans.length; i++) {
        const nm = pans[i].getAttribute("data-vellum-pan");
        if (!panels.some(function (p) { return p.name === nm; })) return;
      }
      const ref = panels[0];
      const rw = ref.px1 - ref.px0, rh = ref.py1 - ref.py0;
      if (!rw || !rh) return;
      const found: AzPanel[] = [];
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const pan = svgEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]');
        const outer = svgEl.querySelector('[data-vellum-panel="' + cssEscape(p.name) + '"]');
        if (!pan || !outer) return; // upstream not pannable (older vellum/vellumplot)
        const ax = (p.px1 - p.px0) / rw, ay = (p.py1 - p.py0) / rh;
        if (!(ax > 0) || !(ay > 0)) return;
        found.push({
          p: p, pan: pan as SVGGElement, outer: outer as SVGGElement, grid: null,
          ax: ax, bx: p.px0 - ax * ref.px0, ay: ay, by: p.py0 - ay * ref.py0,
          xLab: null, yLab: null
        });
      }
      azPanels = found;
      panGroup = found[0].pan;
      axisZoomActive = true;
      scrapeAxisStyle();
      scrapeAxisAnchors();
      hideStaticAxes();
      // Re-ticked gridlines: a group inside each clipped panel, before its pan group,
      // so they render under the marks and are clipped to the panel (like vellum's).
      for (let i = 0; i < azPanels.length; i++) {
        const a = azPanels[i];
        const g = document.createElementNS(SVGNS, "g") as SVGGElement;
        g.setAttribute("class", "vellumwidget-retick-grid");
        a.outer.insertBefore(g, a.pan);
        a.grid = g;
      }
      // Re-ticked axis labels: an overlay pinned to the fixed base coordinate space.
      retickLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
      retickLayer.setAttribute("class", "vellumwidget-retick-layer");
      retickLayer.setAttribute("aria-hidden", "true");
      retickLayer.setAttribute("viewBox", fmtViewBox(vb0));
      stage.appendChild(retickLayer);
      // Seed the transforms + inverse-scale vars and the initial ticks for the
      // current view, so the pan groups are transform-ready before the first gesture.
      applyPanTransforms();
      setupConstantMarks(); // fixed-size glyphs (default) + crisp strokes
      retick();
    }
    // Set every zoomable panel's T_i (and its constant-size inverse-scale vars).
    function applyPanTransforms(): void {
      if (!vb0) return;
      for (let i = 0; i < azPanels.length; i++) {
        const t = azT(azPanels[i]);
        azPanels[i].pan.setAttribute("transform", fmtPan(t));
        setPanScaleVars(azPanels[i].pan, t);
      }
    }
    // The inverse of the pan-group scale, published as CSS custom properties so
    // constant-size glyphs (which carry `scale(var(--vw-ix),var(--vw-iy))`) cancel
    // it and keep their pixel size while their position still re-maps with T.
    function setPanScaleVars(g: SVGGElement, t: PanTransform): void {
      g.style.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
      g.style.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
    }
    // Once per render (axis_zoom active, SVG): keep glyph marks a constant pixel
    // size by counter-scaling them about their own centre from the shared vars, and
    // hold every positional mark's stroke width constant. Skipped for zoom_marks =
    // "scale" (glyphs then scale with the pan group, the older behaviour).
    function setupConstantMarks(): void {
      if (!axisZoomActive || opts.zoomMarks === "scale" || !panGroup) return;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!e.mark) continue;
        const nodes = nodesByKey[e.key];
        if (!nodes) continue;
        const glyph = GLYPH_MARKS[e.mark] === true;
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j] as SVGElement;
          // Only marks inside a pan group are scaled by T, so only they need
          // the counter-scale.
          if (!azPanels.some(function (a) { return a.pan.contains(node); })) continue;
          if (glyph) {
            // Counter-scale about the glyph's own bbox centre (transform-box:
            // fill-box makes transform-origin resolve there), so T re-maps the
            // position but the shared inverse-scale vars cancel T's size change.
            //
            // The node may already be POSITIONED by a `transform` attribute (a
            // panel-offset matrix, say). An inline CSS transform outranks the
            // presentation attribute, so it has to carry that placement itself
            // or the mark collapses onto its untranslated geometry. Prepending
            // it is exact for the translate-only matrices vellum emits here:
            // transform-origin makes the scale resolve about the glyph's own
            // centre, and translations commute with that.
            node.style.setProperty("transform-box", "fill-box");
            node.style.setProperty("transform-origin", "center");
            const place = transAsCss(node);
            node.style.setProperty(
              "transform",
              (place ? place + " " : "") + "scale(var(--vw-ix,1),var(--vw-iy,1))"
            );
          } else {
            node.setAttribute("vector-effect", "non-scaling-stroke");
          }
        }
      }
    }
    // A node's own `transform` attribute, restated as a CSS transform function so
    // an inline CSS transform can carry it forward instead of silently replacing
    // it. CSS needs comma-separated arguments and px units on lengths, neither of
    // which the SVG attribute grammar requires. "" when there is nothing to carry.
    function transAsCss(node: Element): string {
      const t = (node.getAttribute("transform") || "").trim();
      if (!t) return "";
      const N = "([-+\\d.eE]+)";
      const m = new RegExp(
        "matrix\\(\\s*" + [N, N, N, N, N, N].join("[\\s,]+") + "\\s*\\)"
      ).exec(t);
      if (m) {
        const v = m.slice(1, 7).map(Number);
        if (v.some(function (x) { return !isFinite(x); })) return "";
        return "matrix(" + v.join(",") + ")";
      }
      const tr = new RegExp(
        "translate\\(\\s*" + N + "(?:[\\s,]+" + N + ")?\\s*\\)"
      ).exec(t);
      if (tr) {
        const tx = Number(tr[1]), ty = tr[2] === undefined ? 0 : Number(tr[2]);
        if (!isFinite(tx) || !isFinite(ty)) return "";
        return "translate(" + tx + "px," + ty + "px)";
      }
      return "";
    }
    // Translate component of a node's `transform` (matrix e/f or translate x/y).
    function transTranslate(node: Element): { tx: number; ty: number } {
      const t = node.getAttribute("transform") || "";
      const m = /matrix\(\s*[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(t) ||
        /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/.exec(t);
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
    }
    // Scrape the axis text + gridline presentation from vellum's own nodes, so the
    // re-tick matches the active theme. Falls back to sensible defaults (grey text,
    // white gridlines) if a node is absent.
    function scrapeAxisStyle(): void {
      if (!svgEl) return;
      const xText = svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text');
      if (xText) {
        axisStyle.textFill = xText.getAttribute("fill") || axisStyle.textFill;
        axisStyle.fontFamily = xText.getAttribute("font-family") || axisStyle.fontFamily;
        const fs = parseFloat(xText.getAttribute("font-size") || "");
        if (fs) axisStyle.fontSize = fs;
      }
      const grid = svgEl.querySelector('[role="grid"] path, [role="grid"] line');
      if (grid) {
        axisStyle.gridStroke = grid.getAttribute("stroke") || axisStyle.gridStroke;
        const sw = parseFloat(grid.getAttribute("stroke-width") || "");
        if (sw) axisStyle.gridWidth = sw;
      }
    }
    // Assign each static tick-label group (axis-x-* / axis-y-*) to the panel it
    // labels, and record where its labels sit: an x group labels the nearest panel
    // above (or below, for a top axis) whose x-extent holds its labels; a y group
    // the nearest panel to its right (or left) whose y-extent holds them. Facets
    // label only their outer panels, so an interior panel keeps no anchor and is
    // re-ticked with gridlines only, exactly as the static render drew it.
    function scrapeAxisAnchors(): void {
      if (!svgEl) return;
      const groups = svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let g = 0; g < groups.length; g++) {
        const isX = /^axis-x/.test(groups[g].getAttribute("data-vellum-panel") || "");
        const texts = groups[g].querySelectorAll("text");
        if (!texts.length) continue;
        let sx = 0, sy = 0, n = 0, gap = 0;
        let first: { x: number; y: number } | null = null;
        for (let i = 0; i < texts.length; i++) {
          const tr = transTranslate(texts[i]);
          const x = tr.tx + (parseFloat(texts[i].getAttribute("x") || "") || 0);
          const y = tr.ty + (parseFloat(texts[i].getAttribute("y") || "") || 0);
          if (!first) first = { x: x, y: y };
          else if (isX && !gap && y - first.y > 1) gap = y - first.y; // a wrapped second line
          sx += x; sy += y; n++;
        }
        if (!first || !n) continue;
        const mx = sx / n, my = sy / n;
        let best: AzPanel | null = null, bestD = Infinity;
        for (let i = 0; i < azPanels.length; i++) {
          const p = azPanels[i].p;
          let d: number;
          // The labels' mean anchor must fall within the panel's extent, give or
          // take a quarter panel (start-anchored / wrapped labels sit left of
          // their tick, so a lone edge label can start outside the panel).
          if (isX) {
            const slack = (p.px1 - p.px0) / 4;
            if (mx < p.px0 - slack || mx > p.px1 + slack) continue;
            d = first.y >= p.py1 - 1 ? first.y - p.py1 : first.y <= p.py0 + 1 ? p.py0 - first.y : Infinity;
          } else {
            const slack = (p.py1 - p.py0) / 4;
            if (my < p.py0 - slack || my > p.py1 + slack) continue;
            d = first.x <= p.px0 + 1 ? p.px0 - first.x : first.x >= p.px1 - 1 ? first.x - p.px1 : Infinity;
          }
          if (d < bestD) { bestD = d; best = azPanels[i]; }
        }
        if (!best) continue;
        const t0 = texts[0];
        const anchor: AxisAnchor = {
          pos: isX ? first.y : first.x,
          // x labels centre on their tick (vellum centres wrapped lines itself, with
          // a start anchor and per-line offsets, so its anchor isn't reusable there).
          anchor: isX ? "middle" : (t0.getAttribute("text-anchor") || "end"),
          baseline: t0.getAttribute("dominant-baseline") || (isX ? "text-before-edge" : "central"),
          gap: gap
        };
        // First group wins (the primary axis; a secondary axis is hidden with it).
        if (isX && !best.xLab) best.xLab = anchor;
        if (!isX && !best.yLab) best.yLab = anchor;
      }
    }
    // Hide vellum's gridlines (role="grid", inside the pan group -> would stretch
    // with T) and its axis tick-label groups (axis-x-*/axis-y-*, outside the panel
    // -> would go stale). Axis TITLES (axis-title-*) are left visible.
    function hideStaticAxes(): void {
      if (!svgEl) return;
      const hide = svgEl.querySelectorAll(
        '[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let i = 0; i < hide.length; i++) (hide[i] as SVGElement).style.display = "none";
    }
    // A gridline / an axis label, styled to match the scraped theme.
    function gridLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
      const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
      l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", axisStyle.gridStroke);
      l.setAttribute("stroke-width", String(axisStyle.gridWidth));
      return l;
    }
    function axisLabel(text: string, x: number, y: number, anchor: string, baseline: string): SVGTextElement {
      const t = document.createElementNS(SVGNS, "text") as SVGTextElement;
      t.setAttribute("x", String(x)); t.setAttribute("y", String(y));
      t.setAttribute("fill", axisStyle.textFill);
      t.setAttribute("font-family", axisStyle.fontFamily);
      t.setAttribute("font-size", String(axisStyle.fontSize));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("dominant-baseline", baseline);
      t.textContent = text;
      return t;
    }
    // Break a label onto two lines at its first space (as vellum wrapped the static
    // axis): "2020-01-01 06:00:00" -> "2020-01-01" over "06:00:00".
    function wrapLabel(t: SVGTextElement, text: string, x: number, gap: number): void {
      const sp = text.indexOf(" ");
      if (sp < 0) return;
      t.textContent = "";
      const parts = [text.slice(0, sp), text.slice(sp + 1)];
      for (let i = 0; i < parts.length; i++) {
        const ts = document.createElementNS(SVGNS, "tspan");
        ts.setAttribute("x", String(x));
        if (i > 0) ts.setAttribute("dy", String(gap));
        ts.textContent = parts[i];
        t.appendChild(ts);
      }
    }
    // Redraw the re-ticked gridlines + axis labels for each panel's currently
    // visible range. Called on every applyViewBox while axis_zoom is active.
    function retick(): void {
      if (!axisZoomActive || !vb || !vb0 || !retickLayer) return;
      while (retickLayer.firstChild) retickLayer.removeChild(retickLayer.firstChild);
      for (let i = 0; i < azPanels.length; i++) retickPanel(azPanels[i]);
    }
    function retickPanel(a: AzPanel): void {
      const p = a.p, grid = a.grid, layer = retickLayer;
      if (!grid || !layer) return;
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      const t = azT(a);
      // Visible native range: invert the panel's fixed screen rect through T_i to
      // the device px now sitting there, then px -> native via the panel affine.
      if (p.x && p.px1 !== p.px0) {
        const ax = p.x;
        const k = (ax.native_hi - ax.native_lo) / (p.px1 - p.px0);
        const nA = ax.native_lo + ((p.px0 - t.tx) / t.sx - p.px0) * k;
        const nB = ax.native_lo + ((p.px1 - t.tx) / t.sx - p.px0) * k;
        const ticks = axisTicks(ax, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const px = p.px0 + (ticks[i].n - ax.native_lo) / k;
          const sx = t.sx * px + t.tx; // screen device-px
          if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
          grid.appendChild(gridLine(sx, p.py0, sx, p.py1));
          if (a.xLab) {
            const lab = axisLabel(ticks[i].label, sx, a.xLab.pos, a.xLab.anchor, a.xLab.baseline);
            if (a.xLab.gap > 0) wrapLabel(lab, ticks[i].label, sx, a.xLab.gap);
            layer.appendChild(lab);
          }
        }
      }
      if (p.y && p.py1 !== p.py0) {
        const ay = p.y;
        // device y is top-down: native_hi at py0 (top), native_lo at py1 (bottom)
        const k = (ay.native_hi - ay.native_lo) / (p.py1 - p.py0);
        const nA = ay.native_hi - ((p.py0 - t.ty) / t.sy - p.py0) * k;
        const nB = ay.native_hi - ((p.py1 - t.ty) / t.sy - p.py0) * k;
        const ticks = axisTicks(ay, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const py = p.py0 + (ay.native_hi - ticks[i].n) / k;
          const sy = t.sy * py + t.ty;
          if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
          grid.appendChild(gridLine(p.px0, sy, p.px1, sy));
          if (a.yLab) {
            layer.appendChild(axisLabel(ticks[i].label, a.yLab.pos, sy, a.yLab.anchor, a.yLab.baseline));
          }
        }
      }
    }

    // --- overview navigator (opt-in x-range strip) ---
    // Set the visible x-range from window fractions of the full extent (0..1), then
    // apply — reused by the drag handlers and the test seam. `xFrac` = left edge,
    // `wFrac` = width, both fractions of vb0's width; clamped to keep the window
    // on-strip and a minimum width so it stays grabbable.
    function navToView(xFrac: number, wFrac: number): void {
      if (!vb0) return;
      wFrac = Math.min(1, Math.max(0.02, wFrac));
      xFrac = Math.min(1 - wFrac, Math.max(0, xFrac));
      const w = wFrac * vb0.w;
      if (xZoom) {
        // x-only (the normal SVG navigator): the selected x-range fills the width and
        // the full y-range stays on screen (a non-uniform view; see applyAspect).
        vb = { x: vb0.x + xFrac * vb0.w, y: vb0.y, w: w, h: vb0.h };
      } else {
        // Fallback for contexts that keep an aspect-locked view (raster, axis_zoom):
        // zoom both dimensions by the same fraction, centred vertically, so a
        // width-only change isn't swallowed by the `meet` fit.
        const cy = vb ? vb.y + vb.h / 2 : vb0.y + vb0.h / 2;
        const h = wFrac * vb0.h;
        vb = { x: vb0.x + xFrac * vb0.w, y: cy - h / 2, w: w, h: h };
      }
      applyViewBox();
    }
    // Reflect the current view in the window's position/size (x only). Called from
    // applyViewBox so wheel/keyboard/brush/linked changes all move the window too.
    function updateNav(): void {
      if (!navWindow || !vb || !vb0 || !vb0.w) return;
      const xFrac = (vb.x - vb0.x) / vb0.w;
      const wFrac = vb.w / vb0.w;
      navWindow.style.left = (xFrac * 100) + "%";
      navWindow.style.width = (wFrac * 100) + "%";
    }
    // Build the navigator strip once: a squashed mini-render of the whole scene
    // (an inert clone of the base svg at the full viewBox) plus a draggable window
    // with two resize handles. Drag body -> pan x; drag a handle -> zoom x.
    function buildNavigator(): void {
      if (navEl) { navEl.remove(); navEl = null; navWindow = null; }
      if (!opts.navigator || !svgEl || !vb0) return;
      const h = opts.navigatorHeight && opts.navigatorHeight > 0 ? opts.navigatorHeight : 56;
      navEl = document.createElement("div");
      navEl.className = "vellumwidget-nav";
      navEl.style.height = h + "px";
      navEl.setAttribute("aria-hidden", "true"); // the main chart is the accessible view
      // Mini-render: clone the base svg at the full extent, squashed to fill, inert.
      const mini = document.createElement("div");
      mini.className = "vellumwidget-nav-mini";
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("viewBox", fmtViewBox(vb0));
      clone.setAttribute("preserveAspectRatio", "none");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      // Drop defs/clip-paths (duplicate ids would clash with the live svg) and any
      // interactivity/a11y hooks — this is a static backdrop.
      const defs = clone.querySelector("defs");
      if (defs) defs.remove();
      const clipped = clone.querySelectorAll("[clip-path]");
      for (let i = 0; i < clipped.length; i++) clipped[i].removeAttribute("clip-path");
      const keyed = clone.querySelectorAll("[data-key],[tabindex],[role]");
      for (let i = 0; i < keyed.length; i++) {
        keyed[i].removeAttribute("data-key");
        keyed[i].removeAttribute("tabindex");
        keyed[i].removeAttribute("role");
      }
      clone.removeAttribute("id");
      mini.appendChild(clone);
      navEl.appendChild(mini);
      navWindow = document.createElement("div");
      navWindow.className = "vellumwidget-nav-window";
      const hL = document.createElement("div");
      hL.className = "vellumwidget-nav-handle vellumwidget-nav-handle-l";
      const hR = document.createElement("div");
      hR.className = "vellumwidget-nav-handle vellumwidget-nav-handle-r";
      navWindow.appendChild(hL);
      navWindow.appendChild(hR);
      navEl.appendChild(navWindow);
      el.appendChild(navEl);
      wireNavigator(hL, hR);
      updateNav();
    }
    // Pointer drag on the window (pan) and handles (resize). All math in strip
    // fractions from the strip's client rect, so it is size-independent.
    function wireNavigator(hL: HTMLElement, hR: HTMLElement): void {
      if (!navEl || !navWindow) return;
      let mode: "" | "pan" | "l" | "r" = "";
      let startFracX = 0, startFracW = 0, startPointer = 0;
      const stripFrac = (clientX: number): number => {
        const r = navEl!.getBoundingClientRect();
        return r.width ? (clientX - r.left) / r.width : 0;
      };
      const onMove = (ev: PointerEvent): void => {
        if (!mode || !vb0) return;
        const d = stripFrac(ev.clientX) - startPointer;
        if (mode === "pan") navToView(startFracX + d, startFracW);
        else if (mode === "l") { const nx = startFracX + d; navToView(nx, startFracW + (startFracX - nx)); }
        else if (mode === "r") navToView(startFracX, startFracW + d);
      };
      const onUp = (ev: PointerEvent): void => {
        mode = "";
        navWindow!.classList.remove("vellumwidget-nav-grabbing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (ev && (ev.target as Element).releasePointerCapture) { /* no-op */ }
      };
      const start = (m: "pan" | "l" | "r") => (ev: PointerEvent): void => {
        if (!vb0) return;
        ev.preventDefault();
        ev.stopPropagation();
        mode = m;
        startFracX = (vb!.x - vb0.x) / vb0.w;
        startFracW = vb!.w / vb0.w;
        startPointer = stripFrac(ev.clientX);
        if (m === "pan") navWindow!.classList.add("vellumwidget-nav-grabbing");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };
      navWindow.addEventListener("pointerdown", start("pan"));
      hL.addEventListener("pointerdown", start("l"));
      hR.addEventListener("pointerdown", start("r"));
    }

    // --- continuous colorbar filter ---
    // Device-px position along the bar for a value (in the overlay's viewBox space),
    // and its inverse. `t` = value fraction (0 at lo, 1 at hi); orientation + reverse
    // decide which bar end is `lo`. Vertical bars put the high value at the top (y0).
    function cbPos(v: number): number {
      const cb = colorbar!;
      const t = cb.hi === cb.lo ? 0 : (v - cb.lo) / (cb.hi - cb.lo);
      if (cb.orientation === "h") {
        const f = cb.reverse ? 1 - t : t;
        return cb.x0 + f * (cb.x1 - cb.x0);
      }
      const f = cb.reverse ? t : 1 - t;
      return cb.y0 + f * (cb.y1 - cb.y0);
    }
    function cbValueAt(pos: number): number {
      const cb = colorbar!;
      if (cb.orientation === "h") {
        let f = cb.x1 === cb.x0 ? 0 : (pos - cb.x0) / (cb.x1 - cb.x0);
        const t = cb.reverse ? 1 - f : f;
        return cb.lo + t * (cb.hi - cb.lo);
      }
      let f = cb.y1 === cb.y0 ? 0 : (pos - cb.y0) / (cb.y1 - cb.y0);
      const t = cb.reverse ? f : 1 - f;
      return cb.lo + t * (cb.hi - cb.lo);
    }
    function cbRect(x: number, y: number, w: number, h: number, cls: string): SVGRectElement {
      const r = document.createElementNS(SVGNS, "rect") as SVGRectElement;
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(Math.max(0, w)));
      r.setAttribute("height", String(Math.max(0, h)));
      r.setAttribute("class", cls);
      return r;
    }
    // Redraw the colorbar overlay for the current `colorRange`: two dim rects over
    // the out-of-range ends of the bar, and two draggable handles at the range ends.
    function drawColorbarControl(): void {
      if (!colorbarLayer) return;
      while (colorbarLayer.firstChild) colorbarLayer.removeChild(colorbarLayer.firstChild);
      if (!colorbar || !colorRange) return;
      const cb = colorbar;
      const pa = cbPos(colorRange.a);
      const pb = cbPos(colorRange.b);
      const lo = Math.min(pa, pb);
      const hi = Math.max(pa, pb);
      const mkHandle = (pos: number, which: string): SVGRectElement => {
        const H = 4; // handle thickness along the bar axis
        const r = cb.orientation === "h"
          ? cbRect(pos - H / 2, cb.y0 - 2, H, cb.y1 - cb.y0 + 4, "vellumwidget-cb-handle")
          : cbRect(cb.x0 - 2, pos - H / 2, cb.x1 - cb.x0 + 4, H, "vellumwidget-cb-handle");
        r.setAttribute("vector-effect", "non-scaling-stroke");
        r.setAttribute("data-cb", which);
        return r;
      };
      if (cb.orientation === "h") {
        colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, lo - cb.x0, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
        colorbarLayer.appendChild(cbRect(hi, cb.y0, cb.x1 - hi, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
      } else {
        colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, cb.x1 - cb.x0, lo - cb.y0, "vellumwidget-cb-dim"));
        colorbarLayer.appendChild(cbRect(cb.x0, hi, cb.x1 - cb.x0, cb.y1 - hi, "vellumwidget-cb-dim"));
      }
      colorbarLayer.appendChild(mkHandle(pa, "a"));
      colorbarLayer.appendChild(mkHandle(pb, "b"));
    }
    // Dim + make inert every mark whose continuous value is outside [a, b]; report
    // the range to Shiny. A full range clears the filter.
    function applyColorFilter(): void {
      clearClass("vellumwidget-colorfiltered");
      colorHiddenSet = {};
      if (!colorbar || !colorRange) { shinyInput("colorfilter", null); return; }
      const a = colorRange.a;
      const b = colorRange.b;
      const full = a <= colorbar.lo + 1e-9 && b >= colorbar.hi - 1e-9;
      if (!full) {
        const outKeys: string[] = [];
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (typeof e.filter_value === "number" && (e.filter_value < a || e.filter_value > b) && !colorHiddenSet[e.key]) {
            colorHiddenSet[e.key] = true;
            outKeys.push(e.key);
          }
        }
        addClassForKeys(outKeys, "vellumwidget-colorfiltered");
      }
      shinyInput("colorfilter", full ? null : [a, b]);
    }
    // Set the selected value range (clamped, ordered) and apply. The runtime entry
    // point for a handle drag and the test seam.
    function setColorRange(a: number, b: number): void {
      if (!colorbar) return;
      const lo = colorbar.lo, hi = colorbar.hi;
      a = Math.min(hi, Math.max(lo, a));
      b = Math.min(hi, Math.max(lo, b));
      colorRange = { a: Math.min(a, b), b: Math.max(a, b) };
      drawColorbarControl();
      applyColorFilter();
    }
    function buildColorbar(): void {
      if (colorbarLayer) { colorbarLayer.remove(); colorbarLayer = null; }
      colorHiddenSet = {};
      colorRange = null;
      el.classList.remove("vellumwidget-cb-v", "vellumwidget-cb-h");
      // No control in raster mode (no per-element nodes to dim).
      if (!colorbar || rasterMode || !stage) return;
      colorbarLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
      colorbarLayer.setAttribute("class", "vellumwidget-colorbar-layer");
      colorbarLayer.setAttribute("aria-hidden", "true");
      if (vb0) colorbarLayer.setAttribute("viewBox", fmtViewBox(vb0));
      stage.appendChild(colorbarLayer);
      el.classList.add(colorbar.orientation === "h" ? "vellumwidget-cb-h" : "vellumwidget-cb-v");
      colorRange = { a: colorbar.lo, b: colorbar.hi };
      drawColorbarControl();
      wireColorbar();
    }
    // Drag a handle -> update its end of the range; double-click the bar -> reset.
    function wireColorbar(): void {
      if (!colorbarLayer) return;
      let dragWhich: "" | "a" | "b" = "";
      const onMove = (ev: PointerEvent): void => {
        if (!dragWhich || !colorbar || !colorRange) return;
        const u = toUser(ev.clientX, ev.clientY);
        const v = cbValueAt(colorbar.orientation === "h" ? u.x : u.y);
        if (dragWhich === "a") setColorRange(v, colorRange.b);
        else setColorRange(colorRange.a, v);
      };
      const onUp = (): void => {
        dragWhich = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      colorbarLayer.addEventListener("pointerdown", function (ev) {
        const w = (ev.target as Element).getAttribute && (ev.target as Element).getAttribute("data-cb");
        if (w !== "a" && w !== "b") return;
        ev.preventDefault();
        ev.stopPropagation();
        dragWhich = w;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
      colorbarLayer.addEventListener("dblclick", function (ev) {
        if (!colorbar) return;
        ev.preventDefault();
        setColorRange(colorbar.lo, colorbar.hi);
      });
    }

    // --- brush overlay (screen coords for display; user coords for hit-test) ---
    function positionBrush(x: number, y: number, w: number, h: number): void {
      brushBox.style.left = x + "px";
      brushBox.style.top = y + "px";
      brushBox.style.width = w + "px";
      brushBox.style.height = h + "px";
      brushBox.style.display = "block";
    }
    function hideBrush(): void {
      brushBox.style.display = "none";
    }

    // --- lasso overlay (freehand select) ---
    // The lasso outline is drawn in the crosshair overlay's viewBox space (user
    // coords), so it tracks the marks exactly and needs no screen<->user mapping to
    // render. Points are appended in user coords as the pointer moves.
    function lassoPointsAttr(): string {
      let s = "";
      for (let i = 0; i < lassoPts.length; i++) s += (i ? " " : "") + lassoPts[i].x + "," + lassoPts[i].y;
      return s;
    }
    function updateLassoPath(): void {
      if (!crosshairLayer) return;
      if (!lassoEl) {
        lassoEl = document.createElementNS(SVGNS, "polygon") as SVGPolygonElement;
        lassoEl.setAttribute("class", "vellumwidget-lasso");
        lassoEl.setAttribute("vector-effect", "non-scaling-stroke");
        crosshairLayer.appendChild(lassoEl);
      }
      lassoEl.setAttribute("points", lassoPointsAttr());
      if (azMulti() && anchorPanel) lassoEl.setAttribute("transform", fmtPan(azT(anchorPanel)));
      else lassoEl.removeAttribute("transform");
    }
    function clearLasso(): void {
      lassoPts = [];
      if (lassoEl && lassoEl.parentNode) lassoEl.parentNode.removeChild(lassoEl);
      lassoEl = null;
    }

    // --- pointer interaction (hover + drag: brush or pan; touch pinch-zoom) ---
    // Pointer events unify mouse, touch, and pen, so one code path drives desktop
    // and mobile. Active pointers are tracked so two down at once = pinch-zoom.
    let down: { cx: number; cy: number; ux: number; uy: number } | null = null;
    let dragging: "" | "brush" | "pan" | "lasso" = "";
    let movedDuringDrag = false;
    const pointers = new Map<number, { cx: number; cy: number }>();
    let pinchDist = 0; // > 0 while a two-pointer pinch is in progress

    // Hover is SVG-local (fires only over this widget's svg). While a press is
    // in progress the drag handlers (below) own movement, so hover backs off.
    function hoverAt(k: string | null, clientX: number, clientY: number): void {
      // An inert mark (legend-hidden or cross-filtered) can't intercept the pointer,
      // but the nearest/column scans work off the index, which still holds it — drop
      // it so a hidden datum is never silently hovered/tooltipped.
      if (k != null && inert(k)) k = null;
      if (k == null) {
        clearHover(); // emits hover = null
        return;
      }
      // The `hover` input reports the primary (nearest) mark in every mode, so the
      // Shiny read-back contract is unchanged; unified mode adds the shared box.
      shinyInput("hover", k); // deduped -> re-fires only when the hovered key changes
      const hm = opts.hoverMode || "closest";
      if (hm === "x" || hm === "y") {
        const keys = dropInert(columnKeys(k, hm));
        if (!keys.length) { clearHover(); return; }
        setHoverKeys(keys);
        if (opts.crosshair) drawCrosshair(k, hm);
        if (opts.tooltip) showTipMulti(clientX, clientY, keys);
      } else {
        const keys = dropInert(linkedKeys(k));
        if (!keys.length) { clearHover(); return; }
        setHoverKeys(keys);
        if (opts.crosshair) drawCrosshair(k, "closest");
        if (opts.tooltip) showTip(clientX, clientY, k);
      }
    }
    function onHoverMove(ev: MouseEvent): void {
      if (down || pinchDist > 0) return;
      const hm = opts.hoverMode || "closest";
      // Directly over a mark: resolve synchronously (cheap, no scan).
      const k = keyOf(ev.target);
      if (k != null) {
        if (hoverRAF) {
          cancelAnimationFrame(hoverRAF);
          hoverRAF = 0;
        }
        hoverAt(k, ev.clientX, ev.clientY);
        return;
      }
      // In open space, the closest-mark path needs `nearest`; unified hover always
      // seeds off the nearest position on its axis (that snapping is the point).
      if (!elements.length || (hm === "closest" && !opts.nearest)) {
        clearHover();
        return;
      }
      // The scan is O(n); throttle it to one per frame so fast pointer moves over a
      // large plot don't run it dozens of times.
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (hoverRAF) return;
      hoverRAF = requestAnimationFrame(function () {
        hoverRAF = 0;
        const u = clientToScene(cx, cy); // calibrated hit-test mapping (robust to CSS scaling)
        let seed: string | null;
        if (hm === "x") seed = nearestAxisKey("x", u.x);
        else if (hm === "y") seed = nearestAxisKey("y", u.y);
        else seed = nearestKeyAt(u.x, u.y, vb ? vb.w * 0.02 : 8); // ~2% of the view width
        hoverAt(seed, cx, cy);
      });
    }

    // Drag move/up are bound to `window` only for the lifetime of a press (added
    // in onDown, removed in onDragUp), so a drag that leaves the svg still
    // resolves without leaking global listeners across widgets.
    function onDragMove(ev: PointerEvent): void {
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      }
      // Two active pointers -> pinch-zoom about their midpoint.
      if (pinchDist > 0 && pointers.size >= 2 && vb) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        if (d > 0) {
          const u = toAnchor((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
          vb = zoomViewBox(vb, d / pinchDist, u.x, u.y);
          applyViewBox();
          pinchDist = d;
        }
        return;
      }
      if (!down) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
        dragging = mode === "pan" && opts.zoom ? "pan"
          : mode === "lasso" && opts.lasso ? "lasso"
          : opts.brush ? "brush" : "";
        if (dragging === "pan") el.classList.add("vellumwidget-panning");
        if (dragging === "lasso") lassoPts = [clientToScene(down.cx, down.cy)]; // seed with the press point
        if (dragging === "") return;
        movedDuringDrag = true;
      }
      if (dragging === "brush") {
        const box = el.getBoundingClientRect();
        positionBrush(
          Math.min(down.cx, ev.clientX) - box.left,
          Math.min(down.cy, ev.clientY) - box.top,
          Math.abs(ev.clientX - down.cx),
          Math.abs(ev.clientY - down.cy)
        );
      } else if (dragging === "lasso" && vb) {
        lassoPts.push(clientToScene(ev.clientX, ev.clientY));
        updateLassoPath();
      } else if (dragging === "pan" && vb) {
        const u = toAnchor(ev.clientX, ev.clientY);
        vb.x -= u.x - down.ux;
        vb.y -= u.y - down.uy;
        applyViewBox();
        const u2 = toAnchor(ev.clientX, ev.clientY); // re-anchor: track cursor 1:1
        down.ux = u2.x;
        down.uy = u2.y;
      }
    }

    function onDown(ev: PointerEvent): void {
      // Ignore non-primary mouse buttons; touch/pen have button 0/-1.
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      // Drag move/up bind to `window` for the lifetime of a press (addEventListener
      // dedups identical listeners, so repeated downs don't stack them).
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      if (pointers.size >= 2 && opts.zoom) {
        // A second finger: start a pinch, abandoning any nascent single drag.
        const pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        down = null;
        dragging = "";
        hideBrush();
        el.classList.remove("vellumwidget-panning");
        return;
      }
      // Pin the press's panel so a pan that drifts across a facet keeps one frame.
      if (axisZoomActive) { const pu = toUser(ev.clientX, ev.clientY); anchorPanel = azNearest(pu.x, pu.y); }
      const u = toAnchor(ev.clientX, ev.clientY);
      down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      dragging = "";
      movedDuringDrag = false;
    }

    function onDragUp(ev: PointerEvent): void {
      pointers.delete(ev.pointerId);
      const wasPinch = pinchDist > 0;
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        anchorPanel = null;
        window.removeEventListener("pointermove", onDragMove);
        window.removeEventListener("pointerup", onDragUp);
        window.removeEventListener("pointercancel", onDragUp);
      }
      if (wasPinch) {
        down = null;
        dragging = "";
        el.classList.remove("vellumwidget-panning");
        hideBrush();
        reportView(); // pinch settled -> report the final view
        return;
      }
      if (dragging === "brush" && down) {
        const p1 = clientToScene(down.cx, down.cy);
        const p2 = clientToScene(ev.clientX, ev.clientY);
        const rect: Bbox = {
          x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y),
          x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y)
        };
        // A declared select_interval() turns the brush into a data-value interval:
        // its members are the elements whose data fall in the brushed range.
        const iv = applyIntervalBrush(rect);
        lastBrush = iv ? iv.band : rect;
        const hitKeys = iv ? iv.keys : dropInert(brushKeysIn(rect)); // never (re-)select hidden/filtered marks
        if (opts.select) setSelection(hitKeys); // also pushes _selected
        else if (iv) reevaluateInteractions(); // conditions/filters still react
        // The brushed region + keys, as a discrete gesture event; data-space bounds
        // (x0d/x1d/y0d/y1d + panel) added when a panel scale applies, and the
        // interval selection's name + data range when one is declared.
        shinyInput("brush", Object.assign(
          { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
          brushDataFields(rect),
          iv ? iv.fields : {}
        ), { priority: "event" });
        hideBrush();
      } else if (dragging === "lasso") {
        // Close the freehand path and select every mark whose centre is inside it.
        const poly = lassoPts.slice();
        const hitKeys = dropInert(lassoKeysIn(poly)); // never (re-)select hidden/filtered marks
        if (poly.length >= 3) {
          const b = polyBounds(poly);
          lastBrush = b; // zoom-to-selection frames the lasso's bounds
          if (opts.select) setSelection(hitKeys);
          // Report as a brush gesture (keys + the lasso's bounding box), with a
          // `lasso: true` flag so the server can tell the two apart, plus data-space
          // bounds when a panel scale applies.
          shinyInput("brush", Object.assign(
            { keys: hitKeys, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lasso: true },
            brushDataFields(b)
          ), { priority: "event" });
        }
        clearLasso();
      }
      // A pan reports once here (its per-frame applyViewBox calls skipped reporting).
      if (dragging === "pan") reportView();
      el.classList.remove("vellumwidget-panning");
      down = null;
      dragging = "";
    }

    // Resolve the clicked grob's source rows and announce them: a Shiny input
    // (`input$<id>_source`) and a bubbling `vellum:source` DOM event any host can
    // listen for, plus a lightweight popover when values are shipped.
    function emitSource(target: EventTarget | null): void {
      if (!provenance) return;
      const pid = vellumIdOf(target);
      const raw = pid ? provenance.byId[pid] : undefined;
      // Be robust to a single-element group serialising as a scalar rather than a
      // one-element array (htmlwidgets auto-unboxes length-1 vectors).
      const rows: number[] = Array.isArray(raw) ? raw : raw == null ? [] : [raw as number];
      if (!pid || !rows.length) {
        hideSourcePopover();
        return;
      }
      const tbl = sourceTable(provenance, pid);
      shinyInput(
        "source",
        { id: pid, source: tbl.source, rows, fields: tbl.fields },
        { priority: "event" },
      );
      const values = tbl.values ? rows.map((r) => tbl.values![r - 1]).filter(Boolean) : null;
      el.dispatchEvent(
        new window.CustomEvent("vellum:source", {
          detail: { id: pid, source: tbl.source, rows, fields: tbl.fields, values },
          bubbles: true,
        }),
      );
      if (values) showSourcePopover(target as Element, tbl.fields, values);
    }

    let sourcePopover: HTMLElement | null = null;
    function hideSourcePopover(): void {
      if (sourcePopover) {
        sourcePopover.remove();
        sourcePopover = null;
      }
    }
    // A minimal, self-styled popover listing the clicked element's rows. Kept
    // deliberately plain; a host can suppress it by handling `vellum:source` and
    // using inspect_source(values = FALSE).
    function showSourcePopover(
      node: Element,
      fields: string[],
      values: Record<string, unknown>[],
    ): void {
      hideSourcePopover();
      // Built node by node with textContent: field names and row values are
      // arbitrary data, so none of it may be parsed as HTML.
      const pop = document.createElement("div");
      pop.className = "vellumwidget-source";
      pop.setAttribute("role", "dialog");
      pop.style.cssText =
        "position:absolute;z-index:20;max-height:220px;overflow:auto;background:var(--vw-bg,#fff);" +
        "color:var(--vw-fg,#111);border:1px solid rgba(0,0,0,.2);border-radius:6px;padding:6px 8px;" +
        "font:11px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);max-width:320px;";
      const table = document.createElement("table");
      table.style.borderCollapse = "collapse";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const f of fields) {
        const th = document.createElement("th");
        th.textContent = String(f);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of values.slice(0, 12)) {
        const tr = document.createElement("tr");
        for (const f of fields) {
          const td = document.createElement("td");
          td.textContent = String(row[f] ?? "");
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      pop.appendChild(table);
      if (values.length > 12) {
        const more = document.createElement("div");
        more.className = "vw-src-more";
        more.textContent = "+" + (values.length - 12) + " more";
        pop.appendChild(more);
      }
      // position near the clicked node, clamped to the container.
      const nb = (node as SVGGraphicsElement).getBoundingClientRect();
      const cb = el.getBoundingClientRect();
      pop.style.left = Math.min(nb.left - cb.left + 8, Math.max(0, cb.width - 220)) + "px";
      pop.style.top = Math.max(0, nb.top - cb.top + 8) + "px";
      el.appendChild(pop);
      sourcePopover = pop;
    }

    function onClick(ev: MouseEvent): void {
      if (movedDuringDrag) {
        movedDuringDrag = false;
        return;
      } // a drag, not a click
      let k = keyOf(ev.target);
      // Raster mode has no per-element nodes, so resolve the click to the nearest
      // mark within a small radius (same snap the hover uses).
      if (k == null && rasterMode && opts.nearest !== false && elements.length) {
        const u = clientToScene(ev.clientX, ev.clientY);
        const rad = vb ? vb.w * 0.02 : 8;
        k = nearestKeyAt(u.x, u.y, rad);
        if (k != null && inert(k)) k = null; // don't click-snap to a hidden/filtered mark
      }
      // A click is a discrete event (fires every time, even on the same mark);
      // `key` is null for an empty-space click.
      shinyInput("click", { key: k }, { priority: "event" });
      // Click-to-source: surface the data rows behind the clicked grob (keyed by
      // its data-vellum-id, which the SVG already carries). Opt-in via the plot's
      // inspect_source(); a no-op otherwise and on empty space / in raster mode
      // (no per-element node to read the id from).
      if (provenance && provenance.on === "click") emitSource(ev.target);
      // A legend swatch under the hide/mute policy toggles its series instead of
      // selecting it. The second click of a double-click (detail >= 2) is left for
      // onDblClick to turn into an isolate.
      const series = swatchSeries(k);
      if (series != null && legendPolicy() !== "select") {
        if (!(ev.detail && ev.detail >= 2)) legendToggle(series);
        return;
      }
      if (k != null) {
        if (opts.select) toggleSelect(k);
      } else {
        clearSelection();
        lastBrush = null;
      }
    }
    // Double-click a legend swatch (hide/mute policy) to isolate its series.
    function onDblClick(ev: MouseEvent): void {
      const series = swatchSeries(keyOf(ev.target));
      if (series != null && legendPolicy() !== "select") legendIsolate(series);
    }

    function onWheel(ev: WheelEvent): void {
      if (!opts.zoom || !vb) return;
      ev.preventDefault();
      const u = toAnchor(ev.clientX, ev.clientY);
      const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
      vb = zoomViewBox(vb, factor, u.x, u.y);
      applyViewBox();
    }

    function onKey(ev: KeyboardEvent): void {
      if (ev.key === "Escape") {
        clearSelection();
        clearHover();
        clearClass("vellumwidget-focus");
        hideBrush();
        lastBrush = null;
        // Leave mark-traversal mode, returning focus to the widget as a whole.
        if (markFocused() && typeof el.focus === "function") el.focus();
        focusIdx = -1;
        return;
      }
      // Accessibility: while a mark has keyboard focus, arrows traverse marks
      // (roving tabindex) and Enter/Space toggles its selection — this takes
      // precedence over pan/zoom, which owns the arrows when no mark is focused.
      if (opts.a11y && markFocused()) {
        const k = focusables[focusIdx].key;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
          focusRoving(focusIdx + 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
          focusRoving(focusIdx - 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          const series = swatchSeries(k);
          if (series != null && legendPolicy() !== "select") {
            legendToggle(series);
            announce(a11yLabel(k) + (legendOff[series] ? ", hidden" : ", shown"));
          } else {
            if (opts.select) toggleSelect(k);
            announce(a11yLabel(k) + (selected[k] ? ", selected" : ", not selected"));
          }
          ev.preventDefault();
          return;
        }
      }
      // Keyboard pan/zoom (the root is focusable): arrows pan, +/- zoom, 0 resets.
      if (!opts.zoom || !vb) return;
      if (ev.key === "0") {
        resetZoom();
        ev.preventDefault();
        return;
      }
      const dx = vb.w * 0.12;
      const dy = vb.h * 0.12;
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      let handled = true;
      switch (ev.key) {
        case "ArrowLeft": vb.x -= dx; break;
        case "ArrowRight": vb.x += dx; break;
        case "ArrowUp": vb.y -= dy; break;
        case "ArrowDown": vb.y += dy; break;
        case "+": case "=": vb = zoomViewBox(vb, 1.2, cx, cy); break;
        case "-": case "_": vb = zoomViewBox(vb, 1 / 1.2, cx, cy); break;
        default: handled = false;
      }
      if (handled) {
        applyViewBox();
        ev.preventDefault();
      }
    }

    // --- toolbar ---
    // The drag modes enabled for this widget, in cycle order (selection tools
    // adjacent, then pan). The toolbar's mode button cycles through this list.
    const MODE_ICON: Record<string, string> = { brush: "▭", lasso: "◌", pan: "✋" };
    const MODE_LABEL: Record<string, string> = { brush: "brush-select", lasso: "lasso-select", pan: "pan" };
    function availableModes(): ("brush" | "lasso" | "pan")[] {
      const m: ("brush" | "lasso" | "pan")[] = [];
      if (opts.brush) m.push("brush");
      if (opts.lasso) m.push("lasso");
      if (opts.zoom) m.push("pan");
      return m;
    }
    function setMode(m: "brush" | "pan" | "lasso"): void {
      mode = m;
      el.classList.toggle("vellumwidget-mode-pan", m === "pan");
      el.classList.toggle("vellumwidget-mode-lasso", m === "lasso");
      if (m !== "lasso") clearLasso(); // leaving lasso drops any in-progress outline
      if (toolbarEl) {
        const b = toolbarEl.querySelector('[data-act="mode"]');
        if (b) {
          const modes = availableModes();
          const next = modes[(modes.indexOf(m) + 1) % modes.length];
          b.textContent = MODE_ICON[m];
          (b as HTMLElement).title =
            MODE_LABEL[m][0].toUpperCase() + MODE_LABEL[m].slice(1) + " mode" +
            (next && next !== m ? " (click for " + MODE_LABEL[next] + ")" : "");
          b.classList.toggle("vellumwidget-active", m !== "brush");
        }
      }
    }
    function cycleMode(): void {
      const modes = availableModes();
      if (modes.length < 2) return;
      setMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
    }
    // Export filename base (no extension) and PNG resolution scale, both
    // overridable via `as_widget(export = ...)`. The serialized SVG always
    // reflects the *current* viewBox, so a zoomed/panned view exports as shown.
    function exportName(): string {
      const n = opts.export && opts.export.filename;
      return n && String(n).length ? String(n) : "plot";
    }
    function exportScale(): number {
      const s = opts.export && opts.export.scale;
      return s && s > 0 ? s : 1;
    }
    function saveSvg(): void {
      if (!svgEl) return;
      const s = new XMLSerializer().serializeToString(svgEl);
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
    }
    // Rasterise the current SVG to a canvas; `then(canvas)` on success, `fail()`
    // if the canvas is tainted/unsupported. Shared by savePng + copyPng.
    function toCanvas(then: (c: HTMLCanvasElement) => void, fail: () => void): void {
      if (!svgEl) return fail();
      const s = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function () {
        const k = exportScale();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((vb0 ? vb0.w : img.width) * k);
        canvas.height = Math.round((vb0 ? vb0.h : img.height) * k);
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(url);
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          then(canvas);
        } else {
          fail();
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fail();
      };
      img.src = url;
    }
    function savePng(): void {
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (b) download(b, exportName() + ".png");
          });
        },
        saveSvg // canvas tainted / unsupported -> fall back to SVG
      );
    }
    // Copy the current view to the clipboard as a PNG (secure-context only).
    function canCopy(): boolean {
      const nav = navigator as unknown as { clipboard?: { write?: unknown } };
      return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
    }
    function copyPng(): void {
      if (!canCopy()) return;
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (!b) return;
            const nav = navigator as unknown as {
              clipboard: { write: (items: unknown[]) => Promise<void> };
            };
            nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function () {});
          });
        },
        function () {}
      );
    }
    function toggleFullscreen(): void {
      const anyEl = el as unknown as { requestFullscreen?: () => void };
      const anyDoc = document as unknown as { fullscreenElement?: Element; exitFullscreen?: () => void };
      if (anyDoc.fullscreenElement) {
        if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
      } else if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      }
    }
    function zoomToSelection(): void {
      const rect = lastBrush || unionBbox(elements, selected);
      if (rect) zoomTo(rect);
    }

    function buildToolbar(): void {
      if (toolbarEl) {
        toolbarEl.remove();
        toolbarEl = null;
      }
      if (!opts.toolbar) return;
      const bar = document.createElement("div");
      bar.className = "vellumwidget-toolbar";
      const btn = (act: string, label: string, title: string, fn: () => void) => {
        const b = document.createElement("button");
        b.setAttribute("data-act", act);
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          fn();
        });
        bar.appendChild(b);
        return b;
      };
      // One mode button cycles the enabled drag modes (brush / lasso / pan);
      // shown only when at least two are enabled. setMode() fills its icon + title.
      if (availableModes().length >= 2) btn("mode", MODE_ICON[mode], "Drag mode", cycleMode);
      if (opts.zoom) {
        btn("zoomsel", "⌖", "Zoom to selection", zoomToSelection);
        btn("reset", "⟲", "Reset zoom", resetZoom);
      }
      btn("svg", "SVG", "Download SVG", saveSvg);
      btn("png", "PNG", "Download PNG", savePng);
      if (canCopy()) btn("copy", "⧉", "Copy PNG to clipboard", copyPng);
      btn("full", "⛶", "Fullscreen", toggleFullscreen);
      el.appendChild(bar);
      toolbarEl = bar;
    }

    // Apply the interaction styling: the widget-wide theme (Option 1) as CSS
    // variables on the root, and per-element grammar colours (Option 2) as CSS
    // variables on the elements themselves — which override the root by
    // custom-property inheritance. A mark only gains a hover stroke if some hover
    // colour applies to it (root `vellumwidget-hc-all` or its own `vellumwidget-hc`), so
    // hover-uncoloured shapes keep their own borders untouched.
    function applyStyling(): void {
      const s = opts.style || {};
      const setRoot = (name: string, v: string | number | null | undefined) => {
        if (v != null && v !== "") el.style.setProperty(name, String(v));
        else el.style.removeProperty(name);
      };
      setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
      setRoot("--vellumwidget-selected-stroke", s.selectedColor);
      setRoot("--vellumwidget-tip-bg", s.tipBg);
      setRoot("--vellumwidget-tip-fg", s.tipFg);
      setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
      setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
      if (s.hoverColor != null && s.hoverColor !== "") {
        el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
        el.classList.add("vellumwidget-hc-all");
      } else {
        el.style.removeProperty("--vellumwidget-hl-stroke");
        el.classList.remove("vellumwidget-hc-all");
      }
      // Per-element overrides + legend-swatch tagging.
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
        const nodes = elementsForKey(e.key);
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j] as unknown as HTMLElement;
          if (e.hover_color != null) {
            n.style.setProperty("--vellumwidget-hl-stroke", e.hover_color);
            n.classList.add("vellumwidget-hc");
          }
          if (e.selected_color != null) {
            n.style.setProperty("--vellumwidget-selected-stroke", e.selected_color);
          }
          // A legend swatch stays fully visible during hover (not dimmed with the
          // rest), so the legend remains readable while a series is emphasised.
          if (e.legend_for != null) n.classList.add("vellumwidget-legend");
        }
      }
    }

    // --- accessibility (screen reader + keyboard traversal) ---
    // A stable, plain-text label for a mark: its tooltip (tags stripped) or key.
    function a11yLabel(k: string): string {
      const m = meta[k];
      return m && m.tooltip ? stripTags(m.tooltip) : k;
    }
    // The label plus current selection state, for a spoken announcement.
    function focusLabel(k: string): string {
      return a11yLabel(k) + (selected[k] ? ", selected" : "");
    }
    // Speak `msg` through the polite live region (no-op if a11y is off). Skip a
    // repeat of the current text: focusRoving() announces and then moves DOM
    // focus, whose focus handler announces the same label again — the guard stops
    // some screen readers speaking it twice.
    function announce(msg: string): void {
      if (liveRegion && liveRegion.textContent !== msg) liveRegion.textContent = msg;
    }
    // Reflect that mark `focusables[i]` is the focused one: roving index, focus
    // ring + highlight, and a spoken announcement. Pure state/DOM update — does
    // not itself move DOM focus (callers decide), so it is reliable regardless of
    // how focus arrived (Tab, arrow keys, or assistive tech).
    function showMarkFocus(i: number): void {
      focusIdx = i;
      const k = focusables[i].key;
      clearClass("vellumwidget-focus");
      addClassForKeys([k], "vellumwidget-focus");
      setHover(k);
      announce(focusLabel(k));
    }
    // A mark received DOM focus (Tab or assistive tech): adopt it as the cursor.
    function onMarkFocus(ev: FocusEvent): void {
      const k = keyOf(ev.target);
      if (k == null) return;
      const i = focusables.findIndex((f) => f.key === k);
      if (i >= 0) showMarkFocus(i);
    }
    // Focus left a mark: if it did not move to another mark, exit traversal mode.
    function onMarkBlur(ev: FocusEvent): void {
      const to = keyOf((ev as unknown as { relatedTarget: EventTarget | null }).relatedTarget);
      if (to == null) {
        focusIdx = -1;
        clearClass("vellumwidget-focus");
      }
    }
    // Move the roving tabindex to focusable `i` (clamped), update state, and move
    // DOM focus to it.
    function focusRoving(i: number): void {
      if (!focusables.length) return;
      const dir = i < focusIdx ? -1 : 1;
      if (i < 0) i = 0;
      if (i >= focusables.length) i = focusables.length - 1;
      // Skip inert marks (cross-filtered or legend-hidden -> display:none): focusing
      // one is a no-op, so keep moving in the travel direction; if there is no
      // visible mark that way, stay put.
      while (focusables[i] && inert(focusables[i].key)) {
        i += dir;
        if (i < 0 || i >= focusables.length) return;
      }
      if (focusIdx >= 0 && focusables[focusIdx]) {
        focusables[focusIdx].node.setAttribute("tabindex", "-1");
      }
      const f = focusables[i];
      f.node.setAttribute("tabindex", "0");
      showMarkFocus(i);
      const n = f.node as unknown as HTMLElement;
      if (typeof n.focus === "function") n.focus();
    }
    // In mark-traversal mode? (a mark is the current keyboard cursor). Driven by
    // focusIdx rather than document.activeElement so it is robust across browsers
    // and assistive tech.
    function markFocused(): boolean {
      return opts.a11y && focusIdx >= 0 && !!focusables[focusIdx];
    }
    // A visually-hidden data table listing every mark (key + description), so a
    // screen-reader user gets the underlying data even without traversing marks.
    function buildDataTable(): void {
      if (tableEl) {
        tableEl.remove();
        tableEl = null;
      }
      if (!opts.a11y || !elements.length) return;
      const tbl = document.createElement("table");
      tbl.className = "vellumwidget-sr-only vellumwidget-data-table";
      const cap = document.createElement("caption");
      cap.textContent = "Data table";
      tbl.appendChild(cap);
      const head = document.createElement("tr");
      const h1 = document.createElement("th");
      h1.setAttribute("scope", "col");
      h1.textContent = "Item";
      const h2 = document.createElement("th");
      h2.setAttribute("scope", "col");
      h2.textContent = "Description";
      head.appendChild(h1);
      head.appendChild(h2);
      tbl.appendChild(head);
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
        if (seen[k]) continue;
        seen[k] = true;
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.setAttribute("scope", "row");
        th.textContent = k;
        const td = document.createElement("td");
        td.textContent = a11yLabel(k);
        tr.appendChild(th);
        tr.appendChild(td);
        tbl.appendChild(tr);
      }
      el.appendChild(tbl);
      tableEl = tbl;
    }
    // Make the rendered scene an accessible, keyboard-navigable chart: label the
    // svg, expose an aria-live announcer + a data-table fallback, and make each
    // mark a focusable graphics-symbol carrying a roving tabindex. All gated on
    // opts.a11y so the default output is unchanged when it is off.
    function setupA11y(): void {
      focusables = [];
      focusIdx = -1;
      if (!opts.a11y || !svgEl) {
        buildDataTable(); // (a no-op when a11y is off — also clears a stale table)
        return;
      }
      if (rasterMode) {
        // No per-element DOM nodes to focus, and a data table of the (large) element
        // set would reintroduce the DOM blowup raster mode exists to avoid. Present
        // the chart as a labelled image; the scene's <title>/<desc> (or `alt`) name it.
        svgEl.setAttribute("role", "img");
        if (opts.alt) {
          svgEl.removeAttribute("aria-labelledby");
          svgEl.setAttribute("aria-label", opts.alt);
        } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
          svgEl.setAttribute("aria-label", "Chart");
        }
        return;
      }
      // The widget is an interactive chart, not a static image (role="img"
      // would hide the focusable marks from assistive tech).
      svgEl.setAttribute("role", "graphics-document");
      svgEl.setAttribute("aria-roledescription", "interactive chart");
      if (opts.alt) {
        // Drop the name vellum referenced via aria-labelledby (its <title>/<desc>);
        // aria-labelledby outranks aria-label, so it would otherwise defeat `alt`.
        svgEl.removeAttribute("aria-labelledby");
        svgEl.setAttribute("aria-label", opts.alt);
      } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
        // No name from vellum's <title>/<desc> and none given: label generically.
        svgEl.setAttribute("aria-label", "Interactive chart");
      }

      if (!liveRegion) {
        liveRegion = document.createElement("div");
        liveRegion.className = "vellumwidget-sr-only";
        liveRegion.setAttribute("role", "status");
        liveRegion.setAttribute("aria-live", "polite");
        el.appendChild(liveRegion);
      } else {
        liveRegion.textContent = "";
      }

      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
        if (seen[k]) continue;
        const nodes = nodesByKey[k];
        if (!nodes || !nodes.length) continue;
        seen[k] = true;
        const node = nodes[0];
        node.setAttribute("role", "graphics-symbol");
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-label", a11yLabel(k));
        node.addEventListener("focus", onMarkFocus as EventListener);
        node.addEventListener("blur", onMarkBlur as EventListener);
        focusables.push({ key: k, node });
      }
      // The first mark carries tabindex=0 so a Tab press enters the mark set.
      if (focusables.length) focusables[0].node.setAttribute("tabindex", "0");

      buildDataTable();
    }

    function wire(svg: SVGSVGElement): void {
      // Pointer events cover mouse + touch + pen in one path.
      svg.addEventListener("pointermove", onHoverMove);
      svg.addEventListener("pointerleave", clearHover);
      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("click", onClick);
      svg.addEventListener("dblclick", onDblClick);
      if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
      // Touch drag/pinch shouldn't scroll the page over an interactive plot.
      if (opts.zoom || opts.brush) el.classList.add("vellumwidget-gesture");
      el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", onKey);
    }

    return {
      renderValue: function (x: Payload) {
        opts = Object.assign(
          // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
          // zoom are on unless the payload overrides them. (as_widget() no longer
          // exposes these as flags; the defaults live here.)
          { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed" },
          x.options || {}
        );
        elements = normalizeElements(x.elements);
        panels = normalizePanels(x.panels);
        colorbar = x.colorbar || null;
        interactions = x.interactions || null;
        provenance = x.provenance || null;
        condTagElems = {};
        filtSelElems = {};
        joinOf = {};
        lastHoverKeys = [];
        meta = {};
        groups = {};
        incidentEdges = {};
        neighbourNodes = {};
        edgeEndpoints = {};
        neighbourExpand = null;
        legendIndex = {};
        legendSwatch = {};
        legendOff = {};
        hiddenKeySet = {};
        filteredKeySet = {};
        selected = {};
        lastBrush = null;
        intervals = {};
        intervalEl = null;
        intervalBand = null;
        mode = "brush";
        group = opts.group || null;
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          meta[e.key] = e;
          if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
          // Graph adjacency: an edge (source+target present) links its two endpoint
          // nodes. Build node->edges, node->neighbours, edge->endpoints in one pass.
          if (e.source != null && e.target != null) {
            edgeEndpoints[e.key] = [e.source, e.target];
            (incidentEdges[e.source] = incidentEdges[e.source] || []).push(e.key);
            (incidentEdges[e.target] = incidentEdges[e.target] || []).push(e.key);
            (neighbourNodes[e.source] = neighbourNodes[e.source] || []).push(e.target);
            (neighbourNodes[e.target] = neighbourNodes[e.target] || []).push(e.source);
          }
          if (e.legend != null) {
            const series = Array.isArray(e.legend) ? e.legend : [e.legend];
            for (let s = 0; s < series.length; s++) {
              (legendIndex[series[s]] = legendIndex[series[s]] || []).push(e.key);
            }
          }
          if (e.legend_for != null) (legendSwatch[e.legend_for] = legendSwatch[e.legend_for] || []).push(e.key);
        }
        // A declared select_neighbours() selection turns on graph-neighbourhood
        // projection in linkedKeys / selectionMembers.
        const sels = (interactions && interactions.selections) || [];
        for (let i = 0; i < sels.length; i++) {
          const ex = sels[i].expand;
          if (ex && ex.mode === "neighbours") {
            neighbourExpand = {
              degree: Math.max(1, Math.floor(ex.degree || 1)),
              edges: ex.edges !== false,
            };
            break;
          }
        }

        if (!holder) {
          // The stage shrink-wraps the base svg (both dims) so the absolute overlays
          // (dim layer, crisp-zoom canvas) fill the svg's box rather than the root's
          // — the root is often taller (htmlwidgets stamps an explicit height) and
          // can be wider (fluid layout), and sizing the overlays to it letterboxes
          // their viewBox, shifting every hover/select ring off the mark. brush box +
          // tip stay on the root (they position from the root rect, whose top-left
          // coincides with the svg's).
          stage = document.createElement("div");
          stage.className = "vellumwidget-stage";
          el.appendChild(stage);
          holder = document.createElement("div");
          holder.className = "vellumwidget-svg-holder";
          stage.appendChild(holder);
          // Overlay for the large-scene hover dim (sibling of the holder, so the
          // holder's dim opacity does not affect it). pointer-events:none, so it
          // never intercepts hit-testing on the base svg.
          dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
          dimLayer.setAttribute("class", "vellumwidget-dim-layer");
          dimLayer.setAttribute("aria-hidden", "true");
          // Crosshair guide layer: own overlay (below the dim/highlight layer), so
          // the highlight-overlay clear/redraw never disturbs the guide and vice
          // versa. pointer-events:none, so it never intercepts hit-testing.
          crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
          crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
          crosshairLayer.setAttribute("aria-hidden", "true");
          stage.appendChild(crosshairLayer);
          stage.appendChild(dimLayer);
          el.appendChild(brushBox);
          el.appendChild(tip);
          // Sticky-tooltip support: entering the tip cancels the pending hide (so a
          // link/button inside it stays reachable); leaving it hides. Inert unless
          // sticky is on (the tip is pointer-events:none otherwise, so these never fire).
          tip.addEventListener("pointerenter", function () {
            if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
          });
          tip.addEventListener("pointerleave", function () { hideTip(); });
        }
        holder.innerHTML = x.svg;
        svgEl = holder.querySelector("svg");
        // Cache key -> nodes once (the SVG is static after injection), so hover/
        // select highlighting avoids a `querySelectorAll` per key.
        nodesByKey = {};
        if (holder) {
          const keyed = holder.querySelectorAll("[data-key]");
          for (let i = 0; i < keyed.length; i++) {
            const k = keyed[i].getAttribute("data-key");
            if (k != null) (nodesByKey[k] = nodesByKey[k] || []).push(keyed[i]);
          }
        }
        if (svgEl) {
          vb0 = parseViewBox(svgEl.getAttribute("viewBox"));
          if (!vb0) {
            const w = parseFloat(svgEl.getAttribute("width") || "0");
            const h = parseFloat(svgEl.getAttribute("height") || "0");
            if (w && h) vb0 = { x: 0, y: 0, w: w, h: h };
          }
          vb = vb0 ? { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h } : null;
          // Reset any dim/feedback left by a prior render, then arm this render's
          // hover path and (re)build the spatial index over the new elements.
          hideHighlightOverlay(); // also empties the overlay (removes old feedback groups)
          rasterMode = !!opts.raster;
          largeDim = !rasterMode && elements.length > DIM_OVERLAY_MIN;
          selGroup = null;
          hovGroup = null;
          if (rasterMode && dimLayer) {
            // Two overlay groups: persistent selection rings + a transient hover ring,
            // drawn from the index since there are no per-element DOM nodes to style.
            selGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
            hovGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
            dimLayer.appendChild(selGroup);
            dimLayer.appendChild(hovGroup);
          }
          if (dimLayer && vb0) dimLayer.setAttribute("viewBox", fmtViewBox(vb0));
          if (crosshairLayer && vb0) crosshairLayer.setAttribute("viewBox", fmtViewBox(vb0));
          clearCrosshair(); // drop any guide left by a prior render
          // Crisp-zoom canvas: sample the base raster (raster mode only); otherwise
          // make sure any canvas from a prior render is hidden.
          if (rasterMode) {
            ensureCanvas();
            sampleBaseRaster();
          } else {
            clearPointData();
          }
          buildSpatialIndex();
          buildGeometry(x.geometry);
          buildHoverAxis();
          wire(svgEl);
          buildToolbar();
          buildNavigator();
          buildColorbar();
          setupInteractions(); // index the declarative interaction block (conditions/…)
          setupAxisZoom(); // scale the data region + re-tick (after the nav clone)
          // The range navigator drives an x-only zoom (the full y-range stays on
          // screen). Rendered through axis_zoom when it's active (fixed frame, crisp
          // re-ticked x-axis), else via a non-uniform stretch fallback. SVG only.
          xZoom = !!opts.navigator && !rasterMode;
          applyAspect();
          setMode(availableModes()[0] || "brush"); // first enabled mode is the default
          tip.classList.toggle("vellumwidget-tip-sticky", !!opts.tooltipSticky);
          applyStyling();
          applyLegend(); // clears any stale legend-off state from a prior render
          setupA11y();
          setupLinking();
          // Publish the (empty) initial selection so a (re-)render clears any
          // stale value the server held from a previous instance.
          shinyInput("selected", selectedKeys());
          // In case Shiny attached after this bundle first evaluated.
          registerProxyHandler();
        }
      },

      resize: function () {
        // The SVG scales via its viewBox; only the crisp-zoom canvas is sized in
        // device pixels, so re-fit it to the new box (no-op unless raster + zoomed).
        drawPoints();
      },

      // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
      // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
      _call: proxyCall,

      // Test seam: the index-backed query functions + hover-mode flags, so the
      // headless suite can verify the spatial index with explicit coordinates
      // (jsdom has no layout, so client->user coordinate mapping is degenerate).
      _test: {
        nearestKeyAt: nearestKeyAt,
        brushKeysIn: brushKeysIn,
        indexSize: function () { return spatialIndex ? spatialIndex.numItems : 0; },
        // True-geometry picking (WI-3): whether the payload carried geometry, and
        // the exact distance to one key, so the suite can assert the ranking that
        // the bbox distance would get wrong.
        haveGeometry: function () { return haveGeometry; },
        geomVertexCount: function () { return gx.length; },
        distToKey: function (x: number, y: number, key: string) {
          for (let i = 0; i < elements.length; i++) {
            if (elements[i].key === key) return distToElem(x, y, elements[i]);
          }
          return Infinity;
        },
        largeDim: function () { return largeDim; },
        rasterMode: function () { return rasterMode; },
        hasCanvas: function () { return !!canvasEl; },
        pointCount: function () { return ptN; },
        hoverMode: function () { return opts.hoverMode || "closest"; },
        columnKeys: columnKeys,
        nearestAxisKey: nearestAxisKey,
        legendOff: function () { return Object.keys(legendOff).filter((s) => legendOff[s]); },
        lassoKeysIn: lassoKeysIn,
        availableModes: availableModes,
        mode: function () { return mode; },
        inert: inert,
        dropInert: dropInert,
        panelAt: panelAt,
        dataRangeOf: dataRangeOf,
        // Interval selections: the active ranges/members, and a completed brush
        // driven directly (device-px scene rect), bypassing pointer calibration.
        intervals: function () { return intervals; },
        brushInterval: function (rect: Bbox) {
          const iv = applyIntervalBrush(rect);
          if (!iv) return null;
          lastBrush = iv.band;
          if (opts.select) setSelection(iv.keys);
          else reevaluateInteractions();
          return iv;
        },
        intervalBand: function () {
          if (!intervalEl || !intervalEl.parentNode) return null;
          return {
            x: parseFloat(intervalEl.getAttribute("x") || "NaN"), y: parseFloat(intervalEl.getAttribute("y") || "NaN"),
            w: parseFloat(intervalEl.getAttribute("width") || "NaN"), h: parseFloat(intervalEl.getAttribute("height") || "NaN")
          };
        },
        clearSelection: clearSelection,
        brushDataFields: brushDataFields,
        hasNavigator: function () { return !!navEl; },
        navToView: navToView,
        hasColorbar: function () { return !!colorbarLayer; },
        setColorRange: setColorRange,
        colorHidden: function () { return Object.keys(colorHiddenSet); },
        cbHandleCount: function () { return colorbarLayer ? colorbarLayer.querySelectorAll(".vellumwidget-cb-handle").length : 0; },
        navWindowFrac: function () {
          if (!navWindow) return null;
          return { left: parseFloat(navWindow.style.left) || 0, width: parseFloat(navWindow.style.width) || 0 };
        },
        axisZoomActive: function () { return axisZoomActive; },
        panTransform: function () { return panGroup ? panGroup.getAttribute("transform") : null; },
        panScaleVars: function () {
          if (!panGroup) return null;
          return { ix: panGroup.style.getPropertyValue("--vw-ix"), iy: panGroup.style.getPropertyValue("--vw-iy") };
        },
        // Re-ticked axis labels (their text + device-px position), for asserting the
        // re-tick output without a real layout engine.
        retickLabels: function () {
          if (!retickLayer) return [];
          return Array.prototype.map.call(retickLayer.querySelectorAll("text"), function (t: Element) {
            return { text: t.textContent, x: parseFloat(t.getAttribute("x") || "NaN"), y: parseFloat(t.getAttribute("y") || "NaN") };
          });
        },
        retickGridCount: function () {
          let n = 0;
          for (let i = 0; i < azPanels.length; i++) { const g = azPanels[i].grid; if (g) n += g.querySelectorAll("line").length; }
          return n;
        },
        // Every zoomable panel's name + current pan transform (multi-panel axis zoom).
        panTransforms: function () {
          return azPanels.map(function (a) { return { name: a.p.name, transform: a.pan.getAttribute("transform") }; });
        },
        // Per panel: which axes got a label anchor (outer facets) — interior ones none.
        axisAnchors: function () {
          return azPanels.map(function (a) { return { name: a.p.name, x: a.xLab, y: a.yLab }; });
        },
        toAnchor: toAnchor,
        clientToScene: clientToScene,
        zoomTo: zoomTo,
        getView: function () { return vb ? { x: vb.x, y: vb.y, w: vb.w, h: vb.h } : null; },
        staticAxesHidden: function () {
          if (!svgEl) return null;
          const nodes = svgEl.querySelectorAll('[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
          if (!nodes.length) return null;
          return Array.prototype.every.call(nodes, function (n: Element) { return (n as SVGElement).style.display === "none"; });
        },
        setView: function (nvb: ViewBox) { vb = { x: nvb.x, y: nvb.y, w: nvb.w, h: nvb.h }; applyViewBox(); },
        toView: toView,
        // Graph neighbour highlighting: the projection a hover/click acts on, and
        // the reconstructed adjacency + the select_neighbours() config.
        linkedKeys: linkedKeys,
        graphAdjacency: function () {
          return {
            incidentEdges: incidentEdges,
            neighbourNodes: neighbourNodes,
            edgeEndpoints: edgeEndpoints,
            neighbourExpand: neighbourExpand
          };
        }
      }
    };
  }
});

registerProxyHandler();

// Test seam: expose the pure helpers for the headless behaviour suite.
(window as unknown as { __vellumwidgetTest?: unknown }).__vellumwidgetTest = {
  rectsIntersect,
  distToBbox,
  distToSegment2,
  distToGeom,
  brushKeys,
  nearestKey,
  zoomViewBox,
  parseViewBox,
  fmtViewBox,
  unionBbox,
  sanitizeTip,
  dispatchProxyCall,
  normalizeElements,
  isZoomedIn,
  userToCanvas,
  nearestSortedIdx,
  columnTolerance,
  pointInPolygon,
  lassoKeys,
  polyBounds,
  nativeToData,
  pxToDataX,
  selEncodings,
  axisForEncoding,
  intervalRangeOf,
  inInterval,
  intervalKeys,
  pxToDataY,
  normalizePanels,
  viewToPan,
  panToView,
  conjugatePan,
  niceTicks,
  fmtTick,
  dataToNative,
  logTicks,
  fmtRNum,
  strftimeUTC,
  timeTicks,
  detectTimeFormat,
  axisTicks,
  axisRetickable,
  sourceTable
};
