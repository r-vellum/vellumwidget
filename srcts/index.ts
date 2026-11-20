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

import { ensureStyle } from "./css";
import { sourceTable } from "./dom";
import { normalizeElements, normalizePanels } from "./elements";
import { a11yFeature } from "./features/a11y";
import { axisZoomFeature } from "./features/axisZoom";
import { bindScalesFeature } from "./features/bindScales";
import { colorbarFeature } from "./features/colorbar";
import { coordsFeature } from "./features/coords";
import { declarativeFeature } from "./features/declarative";
import { highlightFeature } from "./features/highlight";
import { hoverFeature } from "./features/hover";
import { intervalFeature } from "./features/interval";
import { legendFeature } from "./features/legend";
import { navigatorFeature } from "./features/navigator";
import { pickingFeature } from "./features/picking";
import { pointerFeature } from "./features/pointer";
import { proxyFeature } from "./features/proxy";
import { rasterFeature } from "./features/raster";
import { renderFeature } from "./features/render";
import { selectionFeature } from "./features/selection";
import { sourceFeature } from "./features/source";
import { toolbarFeature } from "./features/toolbar";
import { viewportFeature } from "./features/viewport";
import { distToBbox, distToGeom, distToSegment2, rectsIntersect, unionBbox } from "./geometry";
import { boundPan, channelToNative } from "./binds";
import { axisForEncoding, inInterval, intervalKeys, intervalRangeOf, nativeToData, pxToDataX, pxToDataY, selEncodings } from "./scales";
import { cssEscape, cssEscapePolyfill, dispatchProxyCall, findWidgetById, idSelector, registerProxyHandler } from "./shiny";
import { brushKeys, columnTolerance, lassoKeys, nearestKey, nearestSortedIdx, pointInPolygon, polyBounds } from "./spatial";
import { vellumwidgetBus } from "./linking";
import { createState } from "./state";
import { axisRetickable, axisTicks, dataToNative, detectTimeFormat, fmtRNum, fmtTick, logTicks, niceTicks, parseSecLabels, secAxisMap, secTicks, strftimeUTC, timeTicks } from "./ticks";
import { sanitizeTip } from "./tooltip";
import type { Bbox, ViewBox } from "./types";
import { conjugatePan, fmtViewBox, isZoomedIn, panToView, parseViewBox, userToCanvas, viewToPan, zoomViewBox } from "./viewbox";

HTMLWidgets.widget({
  name: "vellumwidget",
  type: "output",

  factory: function (el: HTMLElement) {
    const ws = createState(el);
    Object.assign(
      ws.fx,
      coordsFeature(ws),
      highlightFeature(ws),
      legendFeature(ws),
      pickingFeature(ws),
      hoverFeature(ws),
      rasterFeature(ws),
      selectionFeature(ws),
      declarativeFeature(ws),
      intervalFeature(ws),
      bindScalesFeature(ws),
      proxyFeature(ws),
      viewportFeature(ws),
      axisZoomFeature(ws),
      navigatorFeature(ws),
      colorbarFeature(ws),
      pointerFeature(ws),
      sourceFeature(ws),
      toolbarFeature(ws),
      renderFeature(ws),
      a11yFeature(ws)
    );

    ensureStyle();
    el.classList.add("vellumwidget-root");
    ws.tip.className = "vellumwidget-tip";
    ws.brushBox.className = "vellumwidget-brush";

    return {
      renderValue: ws.fx.renderValue,
      resize: ws.fx.resize,

      // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
      // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
      _call: ws.fx.proxyCall,

      // Test seam: the index-backed query functions + hover-mode flags, so the
      // headless suite can verify the spatial index with explicit coordinates
      // (jsdom has no layout, so client->user coordinate mapping is degenerate).
      _test: {
        nearestKeyAt: ws.fx.nearestKeyAt,
        brushKeysIn: ws.fx.brushKeysIn,
        indexSize: function () { return ws.spatialIndex ? ws.spatialIndex.numItems : 0; },
        // True-geometry picking (WI-3): whether the payload carried geometry, and
        // the exact distance to one key, so the suite can assert the ranking that
        // the bbox distance would get wrong.
        haveGeometry: function () { return ws.haveGeometry; },
        geomVertexCount: function () { return ws.gx.length; },
        distToKey: function (x: number, y: number, key: string) {
          for (let i = 0; i < ws.elements.length; i++) {
            if (ws.elements[i].key === key) return ws.fx.distToElem(x, y, ws.elements[i]);
          }
          return Infinity;
        },
        largeDim: function () { return ws.largeDim; },
        rasterMode: function () { return ws.rasterMode; },
        hasCanvas: function () { return !!ws.canvasEl; },
        pointCount: function () { return ws.ptN; },
        hoverMode: function () { return ws.opts.hoverMode || "closest"; },
        columnKeys: ws.fx.columnKeys,
        nearestAxisKey: ws.fx.nearestAxisKey,
        legendOff: function () { return Object.keys(ws.legendOff).filter((s) => ws.legendOff[s]); },
        lassoKeysIn: ws.fx.lassoKeysIn,
        availableModes: ws.fx.availableModes,
        mode: function () { return ws.mode; },
        inert: ws.fx.inert,
        dropInert: ws.fx.dropInert,
        panelAt: ws.fx.panelAt,
        dataRangeOf: ws.fx.dataRangeOf,
        // Interval selections: the active ranges/members, and a completed brush
        // driven directly (device-px scene rect), bypassing pointer calibration.
        intervals: function () { return ws.intervals; },
        // Scale binds (bind_scale()): each bound panel's native domain + its driver.
        scaleBinds: function () { return { domains: ws.scaleBinds, by: ws.scaleBoundBy }; },
        brushInterval: function (rect: Bbox) {
          const iv = ws.fx.applyIntervalBrush(rect);
          if (!iv) return null;
          ws.lastBrush = iv.band;
          if (ws.opts.select) ws.fx.setSelection(iv.keys);
          else ws.fx.reevaluateInteractions();
          return iv;
        },
        intervalBand: function () {
          if (!ws.intervalEl || !ws.intervalEl.parentNode) return null;
          return {
            x: parseFloat(ws.intervalEl.getAttribute("x") || "NaN"), y: parseFloat(ws.intervalEl.getAttribute("y") || "NaN"),
            w: parseFloat(ws.intervalEl.getAttribute("width") || "NaN"), h: parseFloat(ws.intervalEl.getAttribute("height") || "NaN")
          };
        },
        clearSelection: ws.fx.clearSelection,
        brushDataFields: ws.fx.brushDataFields,
        hasNavigator: function () { return !!ws.navEl; },
        navToView: ws.fx.navToView,
        hasColorbar: function () { return !!ws.colorbarLayer; },
        setColorRange: ws.fx.setColorRange,
        colorHidden: function () { return Object.keys(ws.colorHiddenSet); },
        cbHandleCount: function () { return ws.colorbarLayer ? ws.colorbarLayer.querySelectorAll(".vellumwidget-cb-handle").length : 0; },
        navWindowFrac: function () {
          if (!ws.navWindow) return null;
          return { left: parseFloat(ws.navWindow.style.left) || 0, width: parseFloat(ws.navWindow.style.width) || 0 };
        },
        axisZoomActive: function () { return ws.axisZoomActive; },
        panTransform: function () { return ws.panGroup ? ws.panGroup.getAttribute("transform") : null; },
        panScaleVars: function () {
          if (!ws.panGroup) return null;
          return { ix: ws.panGroup.style.getPropertyValue("--vw-ix"), iy: ws.panGroup.style.getPropertyValue("--vw-iy") };
        },
        // Re-ticked axis labels (their text + device-px position), for asserting the
        // re-tick output without a real layout engine.
        retickLabels: function () {
          if (!ws.retickLayer) return [];
          return Array.prototype.map.call(ws.retickLayer.querySelectorAll("text"), function (t: Element) {
            return { text: t.textContent, x: parseFloat(t.getAttribute("x") || "NaN"), y: parseFloat(t.getAttribute("y") || "NaN") };
          });
        },
        retickGridCount: function () {
          let n = 0;
          for (let i = 0; i < ws.azPanels.length; i++) { const g = ws.azPanels[i].grid; if (g) n += g.querySelectorAll("line").length; }
          return n;
        },
        // Every zoomable panel's name + current pan transform (multi-panel axis zoom).
        panTransforms: function () {
          return ws.azPanels.map(function (a) { return { name: a.p.name, transform: a.pan.getAttribute("transform") }; });
        },
        // Per panel: which axes got a label anchor (outer facets) — interior ones none.
        axisAnchors: function () {
          return ws.azPanels.map(function (a) { return { name: a.p.name, x: a.xLab, y: a.yLab }; });
        },
        toAnchor: ws.fx.toAnchor,
        clientToScene: ws.fx.clientToScene,
        zoomTo: ws.fx.zoomTo,
        getView: function () { return ws.vb ? { x: ws.vb.x, y: ws.vb.y, w: ws.vb.w, h: ws.vb.h } : null; },
        staticAxesHidden: function () {
          if (!ws.svgEl) return null;
          const nodes = ws.svgEl.querySelectorAll('[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
          if (!nodes.length) return null;
          return Array.prototype.every.call(nodes, function (n: Element) { return (n as SVGElement).style.display === "none"; });
        },
        focusCell: ws.fx.focusCell,
        resetZoom: ws.fx.resetZoom,
        activeCell: function () { return ws.activeCell; },
        setView: function (nvb: ViewBox) { ws.vb = { x: nvb.x, y: nvb.y, w: nvb.w, h: nvb.h }; ws.fx.applyViewBox(); },
        toView: ws.fx.toView,
        // Graph neighbour highlighting: the projection a hover/click acts on, and
        // the reconstructed adjacency + the select_neighbours() config.
        linkedKeys: ws.fx.linkedKeys,
        graphAdjacency: function () {
          return {
            incidentEdges: ws.incidentEdges,
            neighbourNodes: ws.neighbourNodes,
            edgeEndpoints: ws.edgeEndpoints,
            neighbourExpand: ws.neighbourExpand
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
  cssEscape,
  cssEscapePolyfill,
  idSelector,
  findWidgetById,
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
  boundPan,
  channelToNative,
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
  parseSecLabels,
  secAxisMap,
  secTicks,
  sourceTable,
  bus: vellumwidgetBus
};
