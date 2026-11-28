// Rendering: per-render styling, event wiring, and the htmlwidgets
// renderValue / resize entry points.

import { asColumn, normalizeElements, normalizePanels } from "../elements";
import { attachRuns, decodeDisplayList, fillBboxes } from "../dlist";
import { isScalesBound } from "./bindScales";
import { runSvgsOf } from "./runStyle";
import { DEFAULT_MAX_ZOOM, DIM_OVERLAY_MIN, SVGNS } from "./constants";
import { cssEscape } from "../css";
import { isDarkBg, sceneBackgrounds } from "../ink";
import { registerProxyHandler } from "../shiny";
import type { WidgetFns, WidgetState } from "../state";
import type { FlaggedLayer, MarksLayer, Payload } from "../types";
import { fmtViewBox, parseViewBox } from "../viewbox";

// Page-unique ids for the split render's mark image (several widgets per page).
let marksSeq = 0;
let aboveSeq = 0;
let clipSeq = 0;

export function renderFeature(ws: WidgetState): Pick<WidgetFns, "renderValue" | "resize" | "panelClip"> {
  // The clip-path value that confines a copy of a whole-scene image in panel
  // `name`'s pan group to that panel's own area (VW-36). The pan group is
  // transformed by the panel's T, and a userSpaceOnUse clip on an element
  // inside it is read in the pan group's (scene) space, so the panel's own
  // clip -- on its outer group, in the same scene space -- trims the image
  // to the panel's marks wherever T takes them. Without it, a pan past the
  // panel's data would bring a neighbouring panel's part of the image into
  // view: the outer clip only bounds the panel's fixed rect on screen. A
  // panel with no clip of its own (vellumplot leaves a boundary-only panel
  // unclipped) gets its described rect.
  let clipSvg: SVGSVGElement | null = null;
  let clipMade: Record<string, string> = {};
  function panelClip(name: string): string | null {
    if (!ws.svgEl) return null;
    if (clipSvg !== ws.svgEl) { clipSvg = ws.svgEl; clipMade = {}; }
    if (clipMade[name]) return clipMade[name];
    const pan = ws.svgEl.querySelector('[data-vellum-pan="' + cssEscape(name) + '"]');
    if (!pan) return null;
    for (let up = pan.parentNode as Element | null; up && up !== ws.svgEl; up = up.parentNode as Element | null) {
      if (!up.hasAttribute || !up.hasAttribute("data-vellum-panel")) continue;
      const c = up.getAttribute("clip-path");
      if (c) return c;
      break;
    }
    const p = ws.panels.filter(function (q) { return q.name === name; })[0];
    if (!p || !(p.px1 > p.px0) || !(p.py1 > p.py0)) return null;
    let defs = ws.svgEl.querySelector("defs.vellumwidget-clip-defs");
    if (!defs) {
      defs = document.createElementNS(SVGNS, "defs");
      defs.setAttribute("class", "vellumwidget-clip-defs");
      ws.svgEl.insertBefore(defs, ws.svgEl.firstChild);
    }
    const id = "vw-own-" + (++clipSeq);
    const cp = document.createElementNS(SVGNS, "clipPath");
    cp.setAttribute("id", id);
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const rc = document.createElementNS(SVGNS, "rect");
    rc.setAttribute("x", String(p.px0)); rc.setAttribute("y", String(p.py0));
    rc.setAttribute("width", String(p.px1 - p.px0)); rc.setAttribute("height", String(p.py1 - p.py0));
    cp.appendChild(rc);
    defs.appendChild(cp);
    return (clipMade[name] = "url(#" + id + ")");
  }

  // Split render (VW-14): place the keyed-mark PNG under the SVG furniture. The
  // image is defined once and drawn by a <use> in each listed panel's pan group,
  // so axis zoom moves it with that panel's T and the panel's clip trims it to
  // the panel; the furniture (axes, gridlines, legend, text) stays real SVG.
  // When a listed panel has no pan group (or none are listed: a raw vellum
  // scene), one image goes over the whole scene instead, like the old base image.
  // The furniture vellum painted after the marks (VW-21) as an overlay svg in
  // the stage, above the marks canvas. Its ids are made page-unique (both
  // layers come from one scene, so they share vellum's id prefix) and it is
  // hidden from assistive technology (the base svg carries the title/desc).
  function placeAbove(src: string): SVGSVGElement | null {
    if (!ws.stage) return null;
    const pre = "vw-above" + (++aboveSeq) + "-";
    const fixed = src
      .replace(/<\?xml[^>]*\?>/, "")
      .replace(/(\s)id="([^"]+)"/g, '$1id="' + pre + '$2"')
      .replace(/url\(#([^)]+)\)/g, "url(#" + pre + "$1)")
      .replace(/(\s(?:xlink:)?href)="#([^"]+)"/g, '$1="#' + pre + '$2"');
    const tmp = document.createElement("div");
    tmp.innerHTML = fixed;
    const svg = tmp.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return null;
    const meta = svg.querySelectorAll("title, desc");
    for (let i = 0; i < meta.length; i++) meta[i].remove();
    svg.removeAttribute("role");
    svg.removeAttribute("aria-labelledby");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "vellumwidget-above-layer");
    // The panel clip belongs on the panel group, outside the pan group that
    // axis zoom transforms (where the base svg has it); on the pan group it
    // would move and scale with the data.
    const pans = svg.querySelectorAll("[data-vellum-pan][clip-path]");
    for (let i = 0; i < pans.length; i++) {
      const up = pans[i].parentNode as Element | null;
      if (up && up.hasAttribute("data-vellum-panel") && !up.hasAttribute("clip-path")) {
        up.setAttribute("clip-path", pans[i].getAttribute("clip-path") || "");
        pans[i].removeAttribute("clip-path");
      }
    }
    if (ws.svgEl) svg.setAttribute("viewBox", ws.svgEl.getAttribute("viewBox") || "");
    ws.stage.appendChild(svg);
    return svg;
  }

  function placeMarks(svg: SVGSVGElement, m: MarksLayer): "pans" | "root" {
    const img = document.createElementNS(SVGNS, "image");
    img.setAttribute("class", "vellumwidget-marks");
    img.setAttribute("x", "0");
    img.setAttribute("y", "0");
    img.setAttribute("width", String(m.width));
    img.setAttribute("height", String(m.height));
    img.setAttribute("preserveAspectRatio", "none");
    img.setAttribute("href", m.href);
    const names = asColumn(m.panels);
    const pans: Element[] = [];
    for (let i = 0; i < names.length; i++) {
      const g = svg.querySelector('[data-vellum-pan="' + cssEscape(names[i]) + '"]');
      if (!g) { pans.length = 0; break; }
      pans.push(g);
    }
    if (!pans.length) {
      svg.appendChild(img);
      return "root";
    }
    const id = "vw-marks-" + (++marksSeq);
    img.setAttribute("id", id);
    const defs = document.createElementNS(SVGNS, "defs");
    defs.setAttribute("class", "vellumwidget-marks-defs");
    defs.appendChild(img);
    svg.insertBefore(defs, svg.firstChild);
    for (let i = 0; i < pans.length; i++) {
      const u = document.createElementNS(SVGNS, "use");
      u.setAttribute("class", "vellumwidget-marks");
      u.setAttribute("href", "#" + id);
      const cp = panelClip(names[i]);
      if (cp) u.setAttribute("clip-path", cp);
      pans[i].appendChild(u);
    }
    return "pans";
  }

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
    // Feedback ink from the plot's own background, whatever the OS scheme
    // (VW-20): dark ink on a light panel, light ink on a dark one (theme_dark).
    // A user selectedColor / crosshair colour still wins (it sets the outer var).
    const bg = ws.svgEl ? sceneBackgrounds(ws.svgEl) : { panel: null, plot: null };
    const panelBg = bg.panel || bg.plot, plotBg = bg.plot || bg.panel;
    const darkPanel = !!panelBg && isDarkBg(panelBg);
    ws.el.style.setProperty("--vellumwidget-ink", darkPanel ? "#f9fafb" : "#111827");
    ws.el.style.setProperty("--vellumwidget-ink-soft", darkPanel ? "rgba(209,213,219,0.85)" : "rgba(75,85,99,0.85)");
    ws.el.style.setProperty("--vellumwidget-wash", plotBg && isDarkBg(plotBg) ? "rgba(17,24,39,0.66)" : "rgba(255,255,255,0.66)");
    ws.el.classList.toggle("vellumwidget-dark-panel", darkPanel);
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

  // The default drag: the first enabled mode, except that a plot whose interval
  // selections are all scales-bound (select_interval(bind = "scales")) pans,
  // since such a selection is written by panning/zooming, not by a brush.
  function defaultMode(): "brush" | "pan" | "lasso" {
    const modes = ws.fx.availableModes();
    const ivs = asColumn((ws.interactions && ws.interactions.selections) || []).filter((s) => s.kind === "interval");
    if (ivs.length && ivs.every(isScalesBound) && modes.indexOf("pan") >= 0) return "pan";
    return modes[0] || "brush";
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

  // The mixed tier (VW-30): with a vellum that renders the display list's
  // flagged marks as their own rasters (one per run in paint order), the list
  // is drawn in full anyway -- the exact records on the canvas or as detail
  // nodes, each run as its image where it falls in paint order -- so one
  // flagged mark no longer keeps every mark on the PNG. Until the images have
  // loaded (or when they don't match the list) nothing changes: the list
  // stays inexact and the mark PNG is kept, as with an older vellum.
  function loadFlagged(f: FlaggedLayer): void {
    const dl = ws.dl;
    if (!dl || !dl.covered || !dl.nRuns) return;
    const hrefs = asColumn(f.runs).map(String);
    if (hrefs.length !== dl.nRuns) return;
    ws.runSvg = runSvgsOf(f.svg, dl.nRuns);
    const imgs: HTMLImageElement[] = [];
    let left = hrefs.length;
    for (let k = 0; k < hrefs.length; k++) {
      const im = document.createElement("img");
      im.onload = function () {
        if (--left > 0 || ws.dl !== dl) return;
        if (attachRuns(dl, imgs, hrefs, Number(f.width), Number(f.height))) {
          ws.fx.restyleRuns(); // state active before the runs loaded (VW-33)
          ws.fx.drawPoints();
          ws.fx.scheduleTier();
        }
      };
      imgs.push(im);
      im.src = hrefs[k];
    }
  }

  // Add `vals` to `into[key]`, keeping each value once (X-15).
  function unionInto(into: Record<string, string[]>, key: string, vals: string[]): void {
    const cur = into[key];
    if (!cur) { into[key] = vals.slice(); return; }
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < cur.length; i++) seen[cur[i]] = true;
    for (let i = 0; i < vals.length; i++) if (!seen[vals[i]]) { seen[vals[i]] = true; cur.push(vals[i]); }
  }

  function renderValue(x: Payload) {
    ws.opts = Object.assign(
      // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
      // zoom are on unless the payload overrides them. (as_widget() no longer
      // exposes these as flags; the defaults live here.)
      { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed", maxZoom: DEFAULT_MAX_ZOOM },
      x.options || {}
    );
    // An animated SVG has no interaction index, so wheel/pinch zoom, pan and the
    // brush/lasso drags only magnify or box a moving picture, and with no toolbar
    // there was no way back (VW-70). They are off; the page scrolls over it.
    if (ws.opts.animated) { ws.opts.zoom = false; ws.opts.brush = false; ws.opts.lasso = false; }
    // A widget sized from its scene follows the svg's height (VW-69). Not a
    // Shiny output, where the output's own height (vellumwidgetOutput()) is the
    // layout; a static widget on a Shiny page still fits.
    const shinyOutput = ws.el.classList.contains("html-widget-output") || ws.el.classList.contains("shiny-bound-output");
    ws.el.classList.toggle("vellumwidget-fit", !!ws.opts.fitHeight && !shinyOutput);
    ws.elements = normalizeElements(x.elements);
    // The marks-only display list (raster mode, VW-15): the covered marks ship
    // without bboxes, which are derived here from their exact geometry.
    // Its records may index the element table's keys (VR-22).
    ws.dl = x.options && x.options.raster && x.displayList
      ? decodeDisplayList(x.displayList, ws.elements.map((e) => e.key))
      : null;
    ws.runSvg = null;
    if (ws.dl) fillBboxes(ws.elements, ws.dl);
    ws.panels = normalizePanels(x.panels);
    ws.colorbar = x.colorbar || null;
    ws.interactions = x.interactions || null;
    ws.provenance = x.provenance || null;
    ws.condTagElems = {};
    ws.condTagVals = {};
    ws.filtSelElems = {};
    ws.joinOf = {};
    ws.byJoin = {};
    ws.dataIds = {};
    ws.linkedMsg = null;
    ws.rowOwners = {};
    ws.rowKeysOf = {};
    ws.rowJoinsOf = {};
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
    ws.emptySwatchSet = {};
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
      // A composition cell's element carries its cross-view id (`join`, the
      // data_id without the cell's key prefix): crosstalk, the bus and
      // vw_select()/vw_filter() speak in those ids (VW-74).
      if (e.join != null) {
        ws.joinOf[e.key] = e.join;
        const js = ws.byJoin[e.join] || (ws.byJoin[e.join] = []);
        if (js.indexOf(e.key) < 0) js.push(e.key);
      }
      // A row is owned by its multi-row marks under its key and, in a
      // composition, under its join too.
      const own = function (rk: string): void {
        const o = ws.rowOwners[rk] || (ws.rowOwners[rk] = []);
        if (o.indexOf(e.key) < 0) o.push(e.key);
      };
      if (e.row_keys) {
        for (let r = 0; r < e.row_keys.length; r++) own(e.row_keys[r]);
        unionInto(ws.rowKeysOf, e.key, e.row_keys);
      }
      if (e.row_joins) {
        for (let r = 0; r < e.row_joins.length; r++) own(e.row_joins[r]);
        unionInto(ws.rowJoinsOf, e.key, e.row_joins);
      }
      // The data ids this widget draws (VW-77): a mark's id, or a multi-row
      // mark's rows; never a legend swatch.
      if (e.legend_for == null) {
        const rows = e.row_joins || e.row_keys;
        if (rows) for (let r = 0; r < rows.length; r++) ws.dataIds[rows[r]] = true;
        else ws.dataIds[e.join != null ? e.join : e.key] = true;
      }
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
    if (ws.aboveEl) { ws.aboveEl.remove(); ws.aboveEl = null; }
    ws.holder.innerHTML = x.svg;
    ws.markTier = "overview"; ws.detailGroups = []; ws.detailKeys = []; // the new svg has no detail nodes
    ws.svgEl = ws.holder.querySelector("svg");
    ws.marksLayer = ws.svgEl && x.marks && x.options && x.options.raster ? placeMarks(ws.svgEl, x.marks) : null;
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
      ws.cellViews = {}; ws.activeCell = null; // per-cell zoom starts over (VW-18)
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
        ws.fx.sampleBaseRaster(x.markColors);
        if (ws.marksLayer && x.flagged) loadFlagged(x.flagged);
      } else {
        ws.fx.clearPointData();
      }
      // After the canvas, so the above-marks layer stacks over it (VW-21).
      if (ws.rasterMode && ws.marksLayer && x.above) ws.aboveEl = placeAbove(x.above);
      ws.fx.buildSpatialIndex();
      ws.fx.buildGeometry(x.geometry);
      ws.fx.buildHoverAxis();
      wire(ws.svgEl);
      ws.fx.buildToolbar();
      ws.fx.buildAnimControls(); // play/pause + scrubber for an animated SVG (VW-55); no-op otherwise
      ws.fx.buildNavigator();
      ws.fx.buildColorbar();
      ws.fx.setupInteractions(); // index the declarative interaction block (conditions/…)
      ws.fx.setupAxisZoom(); // scale the data region + re-tick (after the nav clone)
      // The range navigator drives an x-only zoom (the full y-range stays on
      // screen). Rendered through axis_zoom when it's active (fixed frame, crisp
      // re-ticked x-axis), else via a non-uniform stretch fallback. SVG only.
      ws.xZoom = !!ws.opts.navigator && (!ws.rasterMode || ws.marksLayer === "pans");
      ws.fx.applyAspect();
      ws.fx.setMode(defaultMode()); // first enabled mode, or pan for a scales-bound view
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

  return { renderValue, resize, panelClip };
}
