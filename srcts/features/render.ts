// Rendering: per-render styling, event wiring, and the htmlwidgets
// renderValue / resize entry points.

import { normalizeElements, normalizePanels } from "../elements";
import { DIM_OVERLAY_MIN, SVGNS } from "./constants";
import { registerProxyHandler } from "../shiny";
import type { WidgetFns, WidgetState } from "../state";
import type { Payload } from "../types";
import { fmtViewBox, parseViewBox } from "../viewbox";

export function renderFeature(ws: WidgetState): Pick<WidgetFns, "renderValue" | "resize"> {
  // Apply the interaction styling: the widget-wide theme (Option 1) as CSS
  // variables on the root, and per-element grammar colours (Option 2) as CSS
  // variables on the elements themselves — which override the root by
  // custom-property inheritance. A mark only gains a hover stroke if some hover
  // colour applies to it (root `vellumwidget-hc-all` or its own `vellumwidget-hc`), so
  // hover-uncoloured shapes keep their own borders untouched.
  function applyStyling(): void {
    const s = ws.opts.style || {};
    const setRoot = (name: string, v: string | number | null | undefined) => {
      if (v != null && v !== "") ws.el.style.setProperty(name, String(v));
      else ws.el.style.removeProperty(name);
    };
    setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
    setRoot("--vellumwidget-selected-stroke", s.selectedColor);
    setRoot("--vellumwidget-tip-bg", s.tipBg);
    setRoot("--vellumwidget-tip-fg", s.tipFg);
    setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
    setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
    if (s.hoverColor != null && s.hoverColor !== "") {
      ws.el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
      ws.el.classList.add("vellumwidget-hc-all");
    } else {
      ws.el.style.removeProperty("--vellumwidget-hl-stroke");
      ws.el.classList.remove("vellumwidget-hc-all");
    }
    // Per-element overrides + legend-swatch tagging.
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
      const nodes = ws.fx.elementsForKey(e.key);
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

  function wire(svg: SVGSVGElement): void {
    // Pointer events cover mouse + touch + pen in one path.
    svg.addEventListener("pointermove", ws.fx.onHoverMove);
    svg.addEventListener("pointerleave", ws.fx.clearHover);
    svg.addEventListener("pointerdown", ws.fx.onDown);
    svg.addEventListener("click", ws.fx.onClick);
    svg.addEventListener("dblclick", ws.fx.onDblClick);
    if (ws.opts.zoom) svg.addEventListener("wheel", ws.fx.onWheel, { passive: false });
    // Touch drag/pinch shouldn't scroll the page over an interactive plot.
    if (ws.opts.zoom || ws.opts.brush) ws.el.classList.add("vellumwidget-gesture");
    ws.el.setAttribute("tabindex", "0");
    ws.el.addEventListener("keydown", ws.fx.onKey);
  }

  function renderValue(x: Payload) {
    ws.opts = Object.assign(
      // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
      // zoom are on unless the payload overrides them. (as_widget() no longer
      // exposes these as flags; the defaults live here.)
      { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed" },
      x.options || {}
    );
    ws.elements = normalizeElements(x.elements);
    ws.panels = normalizePanels(x.panels);
    ws.colorbar = x.colorbar || null;
    ws.interactions = x.interactions || null;
    ws.provenance = x.provenance || null;
    ws.condTagElems = {};
    ws.filtSelElems = {};
    ws.joinOf = {};
    ws.lastHoverKeys = [];
    ws.hoverSig = "";
    ws.calib = null;
    ws.meta = {};
    ws.groups = {};
    ws.incidentEdges = {};
    ws.neighbourNodes = {};
    ws.edgeEndpoints = {};
    ws.neighbourExpand = null;
    ws.legendIndex = {};
    ws.legendSwatch = {};
    ws.legendOff = {};
    ws.hiddenKeySet = {};
    ws.filteredKeySet = {};
    ws.selected = {};
    ws.lastBrush = null;
    ws.intervals = {};
    ws.intervalEl = null;
    ws.intervalBand = null;
    ws.mode = "brush";
    ws.group = ws.opts.group || null;
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      ws.meta[e.key] = e;
      if (e.hover_group != null) (ws.groups[e.hover_group] = ws.groups[e.hover_group] || []).push(e.key);
      // Graph adjacency: an edge (source+target present) links its two endpoint
      // nodes. Build node->edges, node->neighbours, edge->endpoints in one pass.
      if (e.source != null && e.target != null) {
        ws.edgeEndpoints[e.key] = [e.source, e.target];
        (ws.incidentEdges[e.source] = ws.incidentEdges[e.source] || []).push(e.key);
        (ws.incidentEdges[e.target] = ws.incidentEdges[e.target] || []).push(e.key);
        (ws.neighbourNodes[e.source] = ws.neighbourNodes[e.source] || []).push(e.target);
        (ws.neighbourNodes[e.target] = ws.neighbourNodes[e.target] || []).push(e.source);
      }
      if (e.legend != null) {
        const series = Array.isArray(e.legend) ? e.legend : [e.legend];
        for (let s = 0; s < series.length; s++) {
          (ws.legendIndex[series[s]] = ws.legendIndex[series[s]] || []).push(e.key);
        }
      }
      if (e.legend_for != null) (ws.legendSwatch[e.legend_for] = ws.legendSwatch[e.legend_for] || []).push(e.key);
    }
    // A declared select_neighbours() selection turns on graph-neighbourhood
    // projection in linkedKeys / selectionMembers.
    const sels = (ws.interactions && ws.interactions.selections) || [];
    for (let i = 0; i < sels.length; i++) {
      const ex = sels[i].expand;
      if (ex && ex.mode === "neighbours") {
        ws.neighbourExpand = {
          degree: Math.max(1, Math.floor(ex.degree || 1)),
          edges: ex.edges !== false,
        };
        break;
      }
    }

    if (!ws.holder) {
      // The stage shrink-wraps the base svg (both dims) so the absolute overlays
      // (dim layer, crisp-zoom canvas) fill the svg's box rather than the root's
      // — the root is often taller (htmlwidgets stamps an explicit height) and
      // can be wider (fluid layout), and sizing the overlays to it letterboxes
      // their viewBox, shifting every hover/select ring off the mark. brush box +
      // tip stay on the root (they position from the root rect, whose top-left
      // coincides with the svg's).
      ws.stage = document.createElement("div");
      ws.stage.className = "vellumwidget-stage";
      ws.el.appendChild(ws.stage);
      ws.holder = document.createElement("div");
      ws.holder.className = "vellumwidget-svg-holder";
      ws.stage.appendChild(ws.holder);
      // Overlay for the large-scene hover dim (sibling of the holder, so the
      // holder's dim opacity does not affect it). pointer-events:none, so it
      // never intercepts hit-testing on the base svg.
      ws.dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
      ws.dimLayer.setAttribute("class", "vellumwidget-dim-layer");
      ws.dimLayer.setAttribute("aria-hidden", "true");
      // Crosshair guide layer: own overlay (below the dim/highlight layer), so
      // the highlight-overlay clear/redraw never disturbs the guide and vice
      // versa. pointer-events:none, so it never intercepts hit-testing.
      ws.crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
      ws.crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
      ws.crosshairLayer.setAttribute("aria-hidden", "true");
      ws.stage.appendChild(ws.crosshairLayer);
      ws.stage.appendChild(ws.dimLayer);
      ws.el.appendChild(ws.brushBox);
      ws.el.appendChild(ws.tip);
      // Sticky-tooltip support: entering the tip cancels the pending hide (so a
      // link/button inside it stays reachable); leaving it hides. Inert unless
      // sticky is on (the tip is pointer-events:none otherwise, so these never fire).
      ws.tip.addEventListener("pointerenter", function () {
        if (ws.tipHideTimer) { clearTimeout(ws.tipHideTimer); ws.tipHideTimer = 0; }
      });
      ws.tip.addEventListener("pointerleave", function () { ws.fx.hideTip(); });
    }
    ws.holder.innerHTML = x.svg;
    ws.svgEl = ws.holder.querySelector("svg");
    // Cache key -> nodes once (the SVG is static after injection), so hover/
    // select highlighting avoids a `querySelectorAll` per key.
    ws.nodesByKey = {};
    if (ws.holder) {
      const keyed = ws.holder.querySelectorAll("[data-key]");
      for (let i = 0; i < keyed.length; i++) {
        const k = keyed[i].getAttribute("data-key");
        if (k != null) (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(keyed[i]);
      }
    }
    if (ws.svgEl) {
      ws.vb0 = parseViewBox(ws.svgEl.getAttribute("viewBox"));
      if (!ws.vb0) {
        const w = parseFloat(ws.svgEl.getAttribute("width") || "0");
        const h = parseFloat(ws.svgEl.getAttribute("height") || "0");
        if (w && h) ws.vb0 = { x: 0, y: 0, w: w, h: h };
      }
      ws.vb = ws.vb0 ? { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h } : null;
      // Reset any dim/feedback left by a prior render, then arm this render's
      // hover path and (re)build the spatial index over the new elements.
      ws.fx.hideHighlightOverlay(); // also empties the overlay (removes old feedback groups)
      ws.rasterMode = !!ws.opts.raster;
      ws.largeDim = !ws.rasterMode && ws.elements.length > DIM_OVERLAY_MIN;
      ws.selGroup = null;
      ws.hovGroup = null;
      if (ws.rasterMode && ws.dimLayer) {
        // Two overlay groups: persistent selection rings + a transient hover ring,
        // drawn from the index since there are no per-element DOM nodes to style.
        ws.selGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
        ws.hovGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
        ws.dimLayer.appendChild(ws.selGroup);
        ws.dimLayer.appendChild(ws.hovGroup);
      }
      if (ws.dimLayer && ws.vb0) ws.dimLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      if (ws.crosshairLayer && ws.vb0) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.fx.clearCrosshair(); // drop any guide left by a prior render
      // Crisp-zoom canvas: sample the base raster (raster mode only); otherwise
      // make sure any canvas from a prior render is hidden.
      if (ws.rasterMode) {
        ws.fx.ensureCanvas();
        ws.fx.sampleBaseRaster();
      } else {
        ws.fx.clearPointData();
      }
      ws.fx.buildSpatialIndex();
      ws.fx.buildGeometry(x.geometry);
      ws.fx.buildHoverAxis();
      wire(ws.svgEl);
      ws.fx.buildToolbar();
      ws.fx.buildNavigator();
      ws.fx.buildColorbar();
      ws.fx.setupInteractions(); // index the declarative interaction block (conditions/…)
      ws.fx.setupAxisZoom(); // scale the data region + re-tick (after the nav clone)
      // The range navigator drives an x-only zoom (the full y-range stays on
      // screen). Rendered through axis_zoom when it's active (fixed frame, crisp
      // re-ticked x-axis), else via a non-uniform stretch fallback. SVG only.
      ws.xZoom = !!ws.opts.navigator && !ws.rasterMode;
      ws.fx.applyAspect();
      ws.fx.setMode(ws.fx.availableModes()[0] || "brush"); // first enabled mode is the default
      ws.tip.classList.toggle("vellumwidget-tip-sticky", !!ws.opts.tooltipSticky);
      applyStyling();
      ws.fx.applyLegend(); // clears any stale legend-off state from a prior render
      ws.fx.setupA11y();
      ws.fx.setupLinking();
      // Publish the (empty) initial selection so a (re-)render clears any
      // stale value the server held from a previous instance.
      ws.fx.shinyInput("selected", ws.fx.selectedKeys());
      // In case Shiny attached after this bundle first evaluated.
      registerProxyHandler();
    }
  }

  function resize() {
    ws.calib = null;
    // The SVG scales via its viewBox; only the crisp-zoom canvas is sized in
    // device pixels, so re-fit it to the new box (no-op unless raster + zoomed).
    ws.fx.drawPoints();
  }

  return { renderValue, resize };
}
