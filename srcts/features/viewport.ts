// viewBox pan / zoom: linked views, aspect, apply / reset / zoom-to.

import { busPublishView } from "../linking";
import type { ViewFraction } from "../linking";
import type { WidgetFns, WidgetState } from "../state";
import type { Bbox } from "../types";
import { fmtViewBox, isZoomedIn, panToView } from "../viewbox";

export function viewportFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "reportView" | "applyLinkedView" | "applyAspect" | "applyViewBox" | "resetZoom" | "zoomTo"
> {
  // --- viewBox pan/zoom ---
  // Report the current view to Shiny as `input$<id>_zoom` (a deduped state input):
  // the current viewBox in device-px (`x`/`y`/`w`/`h`) + a `zoomed` flag, and —
  // when the scene carries a single cartesian panel's scale descriptor — the
  // visible range in `data` coordinates (`data.x`/`data.y`/`data.panel`).
  function reportView(): void {
    if (!ws.vb) return;
    const payload: {
      x: number; y: number; w: number; h: number; zoomed: boolean;
      data?: { x?: number[]; y?: number[]; panel: string };
    } = { x: ws.vb.x, y: ws.vb.y, w: ws.vb.w, h: ws.vb.h, zoomed: ws.vb0 ? isZoomedIn(ws.vb, ws.vb0) : false };
    if (ws.panels.length === 1) {
      // Visible data range: over the whole view normally; over the panel's own
      // (T-inverted) corners under axis_zoom, where only the data region scales.
      let d;
      if (ws.axisZoomActive && ws.vb0) {
        const p = ws.panels[0];
        const a = panToView(ws.vb, ws.vb0, p.px0, p.py0);
        const b = panToView(ws.vb, ws.vb0, p.px1, p.py1);
        d = ws.fx.dataRangeOf(p, a.x, a.y, b.x, b.y);
      } else {
        d = ws.fx.dataRangeOf(ws.panels[0], ws.vb.x, ws.vb.y, ws.vb.x + ws.vb.w, ws.vb.y + ws.vb.h);
      }
      if (d) payload.data = d;
    }
    ws.fx.shinyInput("zoom", payload);
    // Linked pan/zoom: broadcast the view as a fraction of our own original
    // viewBox to the group's other members. Suppressed while we are *applying* a
    // peer's view (feedback-loop guard).
    if (ws.group && ws.vb0 && !ws.receivingView && ws.vb0.w && ws.vb0.h) {
      busPublishView(ws.group, ws.selfToken, {
        x: (ws.vb.x - ws.vb0.x) / ws.vb0.w, y: (ws.vb.y - ws.vb0.y) / ws.vb0.h,
        w: ws.vb.w / ws.vb0.w, h: ws.vb.h / ws.vb0.h
      });
    }
  }

  // Apply a linked view from a peer: map its view-fraction onto our own viewBox.
  // Guarded so re-emitting (Shiny) is fine but we do not re-broadcast to the bus.
  function applyLinkedView(v: ViewFraction): void {
    if (!ws.vb0) return;
    const next = {
      x: ws.vb0.x + v.x * ws.vb0.w, y: ws.vb0.y + v.y * ws.vb0.h,
      w: v.w * ws.vb0.w, h: v.h * ws.vb0.h
    };
    if (!(next.w > 0) || !(next.h > 0)) return;
    // No-op if unchanged (avoids redundant work and ping-pong on equal views).
    if (ws.vb && Math.abs(next.x - ws.vb.x) < 1e-6 && Math.abs(next.y - ws.vb.y) < 1e-6 &&
        Math.abs(next.w - ws.vb.w) < 1e-6 && Math.abs(next.h - ws.vb.h) < 1e-6) return;
    ws.receivingView = true;
    ws.vb = next;
    applyViewBox(); // reportView() here emits _zoom but skips the bus (guarded)
    ws.receivingView = false;
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
    const par = (ws.xZoom && !ws.axisZoomActive) ? "none" : "xMidYMid meet";
    if (ws.svgEl) ws.svgEl.setAttribute("preserveAspectRatio", par);
    if (ws.dimLayer) ws.dimLayer.setAttribute("preserveAspectRatio", par);
    if (ws.crosshairLayer) ws.crosshairLayer.setAttribute("preserveAspectRatio", par);
    if (ws.colorbarLayer) ws.colorbarLayer.setAttribute("preserveAspectRatio", par);
  }

  function applyViewBox(): void {
    ws.calib = null; // the marks moved: re-measure the hover calibration
    ws.hoverSig = ""; // a moved view moves the crosshair and hover overlay: redraw on the next move
    // x-only range zoom: keep the full y-extent on screen (never crop the y-axis),
    // so every zoom/pan path (nav, wheel, pinch, keyboard, linked) is 1-D in x.
    if (ws.xZoom && ws.vb && ws.vb0) { ws.vb.y = ws.vb0.y; ws.vb.h = ws.vb0.h; }
    if (ws.axisZoomActive && ws.panGroup && ws.vb && ws.vb0) {
      // Axis-aware zoom: hold the base frame at vb0 and scale only the data region
      // by T (so axes/titles/legend stay put), then re-tick for the visible range.
      // Each panel gets T conjugated onto its own rect (T itself for one panel).
      ws.fx.applyPanTransforms();
      if (ws.svgEl) ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.fx.retick();
    } else if (ws.svgEl && ws.vb) {
      ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb));
    }
    // Overlays that sit over the panel marks track the view (their device-px
    // content zooms with the marks); the colorbar overlay tracks the FIXED base
    // under axis_zoom (the colorbar is furniture outside the panel, so it stays put).
    // With several zoomed panels no single viewBox fits them all, so the overlays
    // hold the base view and place their content per panel (azOverlayWrap).
    const overlayVb = ws.fx.azMulti() ? ws.vb0 : ws.vb;
    if (ws.dimLayer && overlayVb) ws.dimLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
    if (ws.crosshairLayer && overlayVb) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
    ws.fx.placeIntervalBand(); // an active interval band follows the per-panel zoom
    if (ws.colorbarLayer && (ws.vb || ws.vb0)) {
      ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb!));
    }
    // Redraw the crisp point layer for the new view (no-op unless raster + zoomed in).
    ws.fx.drawPoints();
    ws.fx.updateNav(); // keep the navigator window in sync with the view
    // Report on settle: a continuous pan/pinch reports once on release (from
    // onDragUp), not per frame; discrete zooms (wheel, keys, reset, zoom-to) land
    // here with no drag in progress and report immediately.
    if (ws.dragging !== "pan" && ws.pinchDist === 0) reportView();
  }

  function resetZoom(): void {
    if (ws.vb0) {
      ws.vb = { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h };
      applyViewBox();
    }
  }

  function zoomTo(rect: Bbox, pad = 0.05): void {
    if (!ws.vb) return;
    // Multi-panel axis zoom: `vb` is in the reference panel's frame, so map a
    // region in another panel back onto the reference rect first (A⁻¹).
    if (ws.fx.azMulti()) {
      const a = ws.fx.azNearest((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
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
    ws.vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
    applyViewBox();
  }

  return { reportView, applyLinkedView, applyAspect, applyViewBox, resetZoom, zoomTo };
}
