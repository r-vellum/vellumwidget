// Continuous colorbar filter.

import { SVGNS } from "./constants";
import type { WidgetFns, WidgetState } from "../state";
import { fmtViewBox } from "../viewbox";

export function colorbarFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "setColorRange" | "buildColorbar"
> {
  // --- continuous colorbar filter ---
  // Device-px position along the bar for a value (in the overlay's viewBox space),
  // and its inverse. `t` = value fraction (0 at lo, 1 at hi); orientation + reverse
  // decide which bar end is `lo`. Vertical bars put the high value at the top (y0).
  function cbPos(v: number): number {
    const cb = ws.colorbar!;
    const t = cb.hi === cb.lo ? 0 : (v - cb.lo) / (cb.hi - cb.lo);
    if (cb.orientation === "h") {
      const f = cb.reverse ? 1 - t : t;
      return cb.x0 + f * (cb.x1 - cb.x0);
    }
    const f = cb.reverse ? t : 1 - t;
    return cb.y0 + f * (cb.y1 - cb.y0);
  }

  function cbValueAt(pos: number): number {
    const cb = ws.colorbar!;
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
    if (!ws.colorbarLayer) return;
    while (ws.colorbarLayer.firstChild) ws.colorbarLayer.removeChild(ws.colorbarLayer.firstChild);
    if (!ws.colorbar || !ws.colorRange) return;
    const cb = ws.colorbar;
    const pa = cbPos(ws.colorRange.a);
    const pb = cbPos(ws.colorRange.b);
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
      ws.colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, lo - cb.x0, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
      ws.colorbarLayer.appendChild(cbRect(hi, cb.y0, cb.x1 - hi, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
    } else {
      ws.colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, cb.x1 - cb.x0, lo - cb.y0, "vellumwidget-cb-dim"));
      ws.colorbarLayer.appendChild(cbRect(cb.x0, hi, cb.x1 - cb.x0, cb.y1 - hi, "vellumwidget-cb-dim"));
    }
    ws.colorbarLayer.appendChild(mkHandle(pa, "a"));
    ws.colorbarLayer.appendChild(mkHandle(pb, "b"));
  }

  // Dim + make inert every mark whose continuous value is outside [a, b]; report
  // the range to Shiny. A full range clears the filter.
  function applyColorFilter(): void {
    ws.fx.clearClass("vellumwidget-colorfiltered");
    ws.colorHiddenSet = {};
    if (!ws.colorbar || !ws.colorRange) { ws.fx.shinyInput("colorfilter", null); return; }
    const a = ws.colorRange.a;
    const b = ws.colorRange.b;
    const full = a <= ws.colorbar.lo + 1e-9 && b >= ws.colorbar.hi - 1e-9;
    if (!full) {
      const outKeys: string[] = [];
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (typeof e.filter_value === "number" && (e.filter_value < a || e.filter_value > b) && !ws.colorHiddenSet[e.key]) {
          ws.colorHiddenSet[e.key] = true;
          outKeys.push(e.key);
        }
      }
      ws.fx.addClassForKeys(outKeys, "vellumwidget-colorfiltered");
    }
    ws.fx.shinyInput("colorfilter", full ? null : [a, b]);
  }

  // Set the selected value range (clamped, ordered) and apply. The runtime entry
  // point for a handle drag and the test seam.
  function setColorRange(a: number, b: number): void {
    if (!ws.colorbar) return;
    const lo = ws.colorbar.lo, hi = ws.colorbar.hi;
    a = Math.min(hi, Math.max(lo, a));
    b = Math.min(hi, Math.max(lo, b));
    ws.colorRange = { a: Math.min(a, b), b: Math.max(a, b) };
    drawColorbarControl();
    applyColorFilter();
  }

  function buildColorbar(): void {
    if (ws.colorbarLayer) { ws.colorbarLayer.remove(); ws.colorbarLayer = null; }
    ws.colorHiddenSet = {};
    ws.colorRange = null;
    ws.el.classList.remove("vellumwidget-cb-v", "vellumwidget-cb-h");
    // No control in raster mode (no per-element nodes to dim).
    if (!ws.colorbar || ws.rasterMode || !ws.stage) return;
    ws.colorbarLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
    ws.colorbarLayer.setAttribute("class", "vellumwidget-colorbar-layer");
    ws.colorbarLayer.setAttribute("aria-hidden", "true");
    if (ws.vb0) ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
    ws.stage.appendChild(ws.colorbarLayer);
    ws.el.classList.add(ws.colorbar.orientation === "h" ? "vellumwidget-cb-h" : "vellumwidget-cb-v");
    ws.colorRange = { a: ws.colorbar.lo, b: ws.colorbar.hi };
    drawColorbarControl();
    wireColorbar();
  }

  // Drag a handle -> update its end of the range; double-click the bar -> reset.
  function wireColorbar(): void {
    if (!ws.colorbarLayer) return;
    let dragWhich: "" | "a" | "b" = "";
    const onMove = (ev: PointerEvent): void => {
      if (!dragWhich || !ws.colorbar || !ws.colorRange) return;
      const u = ws.fx.toUser(ev.clientX, ev.clientY);
      const v = cbValueAt(ws.colorbar.orientation === "h" ? u.x : u.y);
      if (dragWhich === "a") setColorRange(v, ws.colorRange.b);
      else setColorRange(ws.colorRange.a, v);
    };
    const onUp = (): void => {
      dragWhich = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    ws.colorbarLayer.addEventListener("pointerdown", function (ev) {
      const w = (ev.target as Element).getAttribute && (ev.target as Element).getAttribute("data-cb");
      if (w !== "a" && w !== "b") return;
      ev.preventDefault();
      ev.stopPropagation();
      dragWhich = w;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
    ws.colorbarLayer.addEventListener("dblclick", function (ev) {
      if (!ws.colorbar) return;
      ev.preventDefault();
      setColorRange(ws.colorbar.lo, ws.colorbar.hi);
    });
  }

  return { setColorRange, buildColorbar };
}
