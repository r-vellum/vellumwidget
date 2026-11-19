// Interval selections (select_interval()): the data-value brush and its band.

import { SVGNS } from "./constants";
import { axisForEncoding, intervalKeys, intervalRangeOf, selEncodings } from "../scales";
import type { IntervalRange } from "../scales";
import type { WidgetFns, WidgetState } from "../state";
import type { Bbox, PanelInfo, SelDef } from "../types";

export function intervalFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "applyIntervalBrush" | "placeIntervalBand" | "clearIntervals"
> {
  // --- interval selections (select_interval()) ---
  // The declared brush-driven interval selections (a lasso interval keeps the
  // pixel selection path).
  function rectIntervalSels(): SelDef[] {
    const sels = (ws.interactions && ws.interactions.selections) || [];
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
    const p = ws.fx.panelAt((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
    // A legend- or colorbar-hidden mark is never a member; a mark hidden by this
    // selection's own filter_by() must stay eligible, or widening the brush could
    // never bring it back.
    const eligible = (k: string): boolean => !ws.hiddenKeySet[k] && !ws.colorHiddenSet[k];
    ws.intervals = {};
    const union: string[] = [];
    const seen: Record<string, boolean> = {};
    const ranges: Record<string, IntervalRange | null> = {};
    let band = rect;
    for (let i = 0; i < sels.length; i++) {
      const encs = selEncodings(sels[i]);
      const locked = lockRect(p, rect, encs);
      if (i === 0) band = locked;
      const r = p ? intervalRangeOf(p, rect, encs) : null;
      const ks = r ? intervalKeys(ws.elements, r).filter(eligible) : ws.fx.dropInert(ws.fx.brushKeysIn(locked));
      ws.intervals[sels[i].name] = { keys: ks, range: r };
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
    ws.intervalBand = b;
    placeIntervalBand();
  }

  // Place the band for the current view. The overlay tracks the view, so scene
  // coords line up, except under multi-panel axis zoom: there the overlay holds
  // the base view and each panel has its own T_i, so map the band through the
  // brushed panel's transform and clip it to that panel's frame.
  function placeIntervalBand(): void {
    const sb = ws.intervalBand;
    if (!ws.crosshairLayer || !sb) return;
    let b = sb;
    if (ws.fx.azMulti()) {
      const a = ws.fx.azNearest((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2);
      if (a) {
        const t = ws.fx.azT(a);
        const p = a.p;
        b = {
          x0: Math.max(Math.min(p.px0, p.px1), t.sx * sb.x0 + t.tx),
          x1: Math.min(Math.max(p.px0, p.px1), t.sx * sb.x1 + t.tx),
          y0: Math.max(Math.min(p.py0, p.py1), t.sy * sb.y0 + t.ty),
          y1: Math.min(Math.max(p.py0, p.py1), t.sy * sb.y1 + t.ty)
        };
      }
    }
    if (!ws.intervalEl) {
      ws.intervalEl = document.createElementNS(SVGNS, "rect") as SVGRectElement;
      ws.intervalEl.setAttribute("class", "vellumwidget-interval");
      ws.intervalEl.setAttribute("vector-effect", "non-scaling-stroke");
    }
    if (ws.intervalEl.parentNode !== ws.crosshairLayer) ws.crosshairLayer.appendChild(ws.intervalEl);
    ws.intervalEl.setAttribute("x", String(b.x0));
    // (b may be empty once the brushed range is panned out of its panel)
    ws.intervalEl.setAttribute("y", String(b.y0));
    ws.intervalEl.setAttribute("width", String(Math.max(0, b.x1 - b.x0)));
    ws.intervalEl.setAttribute("height", String(Math.max(0, b.y1 - b.y0)));
  }

  // Empty every interval selection and remove its band. True if one was active.
  function clearIntervals(): boolean {
    const had = Object.keys(ws.intervals).length > 0;
    ws.intervals = {};
    ws.intervalBand = null;
    if (ws.intervalEl && ws.intervalEl.parentNode) ws.intervalEl.parentNode.removeChild(ws.intervalEl);
    return had;
  }

  return { applyIntervalBrush, placeIntervalBand, clearIntervals };
}
