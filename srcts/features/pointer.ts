// Pointer interaction: hover, brush / lasso / pan drags, touch pinch-zoom,
// click, double click, wheel and keyboard.

import { DRAG_THRESHOLD, keyOf } from "../dom";
import { SVGNS } from "./constants";
import { polyBounds } from "../spatial";
import type { WidgetFns, WidgetState } from "../state";
import type { Bbox } from "../types";
import { zoomViewBox } from "../viewbox";

export function pointerFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "clearLasso" | "onHoverMove" | "onDown" | "onClick" | "onDblClick" | "onWheel" | "onKey"
> {
  // --- brush overlay (screen coords for display; user coords for hit-test) ---
  function positionBrush(x: number, y: number, w: number, h: number): void {
    ws.brushBox.style.left = x + "px";
    ws.brushBox.style.top = y + "px";
    ws.brushBox.style.width = w + "px";
    ws.brushBox.style.height = h + "px";
    ws.brushBox.style.display = "block";
  }

  function hideBrush(): void {
    ws.brushBox.style.display = "none";
  }

  // --- lasso overlay (freehand select) ---
  // The lasso outline is drawn in the crosshair overlay's viewBox space (user
  // coords), so it tracks the marks exactly and needs no screen<->user mapping to
  // render. Points are appended in user coords as the pointer moves.
  function lassoPointsAttr(): string {
    let s = "";
    for (let i = 0; i < ws.lassoPts.length; i++) s += (i ? " " : "") + ws.lassoPts[i].x + "," + ws.lassoPts[i].y;
    return s;
  }

  function updateLassoPath(): void {
    if (!ws.crosshairLayer) return;
    if (!ws.lassoEl) {
      ws.lassoEl = document.createElementNS(SVGNS, "polygon") as SVGPolygonElement;
      ws.lassoEl.setAttribute("class", "vellumwidget-lasso");
      ws.lassoEl.setAttribute("vector-effect", "non-scaling-stroke");
      ws.crosshairLayer.appendChild(ws.lassoEl);
    }
    ws.lassoEl.setAttribute("points", lassoPointsAttr());
    if (ws.fx.azMulti() && ws.anchorPanel) ws.lassoEl.setAttribute("transform", ws.fx.fmtPan(ws.fx.azT(ws.anchorPanel)));
    else ws.lassoEl.removeAttribute("transform");
  }

  function clearLasso(): void {
    ws.lassoPts = [];
    if (ws.lassoEl && ws.lassoEl.parentNode) ws.lassoEl.parentNode.removeChild(ws.lassoEl);
    ws.lassoEl = null;
  }

 // > 0 while a two-pointer pinch is in progress

  // Hover is SVG-local (fires only over this widget's svg). While a press is
  // in progress the drag handlers (below) own movement, so hover backs off.
  function hoverAt(k: string | null, clientX: number, clientY: number): void {
    // An inert mark (legend-hidden or cross-filtered) can't intercept the pointer,
    // but the nearest/column scans work off the index, which still holds it — drop
    // it so a hidden datum is never silently hovered/tooltipped.
    if (k != null && ws.fx.inert(k)) k = null;
    if (k == null) {
      ws.fx.clearHover(); // emits hover = null
      return;
    }
    const hm = ws.opts.hoverMode || "closest";
    const unified = hm === "x" || hm === "y";
    const keys = ws.fx.dropInert(unified ? ws.fx.columnKeys(k, hm) : ws.fx.linkedKeys(k));
    if (!keys.length) { ws.fx.clearHover(); return; }
    // Same mark, same highlighted set as the last pass: the classes, conditions,
    // crosshair and tip content are all still right, so only follow the pointer.
    const sig = hm + "\u0001" + k + "\u0001" + keys.join("\u0001");
    if (sig === ws.hoverSig) {
      if (ws.opts.tooltip) ws.fx.moveTip(clientX, clientY, k);
      return;
    }
    // The `hover` input reports the primary (nearest) mark in every mode, so the
    // Shiny read-back contract is unchanged; unified mode adds the shared box.
    ws.fx.shinyInput("hover", k); // deduped -> re-fires only when the hovered key changes
    ws.hovering = true;
    ws.fx.setHoverKeys(keys);
    if (ws.opts.crosshair) ws.fx.drawCrosshair(k, unified ? hm : "closest");
    if (ws.opts.tooltip) {
      if (unified) ws.fx.showTipMulti(clientX, clientY, keys);
      else ws.fx.showTip(clientX, clientY, k);
    }
    ws.hoverSig = sig; // after setHoverKeys, which resets it
  }

  function onHoverMove(ev: MouseEvent): void {
    if (ws.down || ws.pinchDist > 0) return;
    const hm = ws.opts.hoverMode || "closest";
    // Directly over a mark: resolve synchronously (cheap, no scan).
    const k = keyOf(ev.target);
    if (k != null) {
      if (ws.hoverRAF) {
        cancelAnimationFrame(ws.hoverRAF);
        ws.hoverRAF = 0;
      }
      hoverAt(k, ev.clientX, ev.clientY);
      return;
    }
    // In open space, the closest-mark path needs `nearest`; unified hover always
    // seeds off the nearest position on its axis (that snapping is the point).
    if (!ws.elements.length || (hm === "closest" && !ws.opts.nearest)) {
      ws.fx.clearHover();
      return;
    }
    // The scan is O(n); throttle it to one per frame so fast pointer moves over a
    // large plot don't run it dozens of times.
    const cx = ev.clientX;
    const cy = ev.clientY;
    if (ws.hoverRAF) return;
    ws.hoverRAF = requestAnimationFrame(function () {
      ws.hoverRAF = 0;
      const u = ws.fx.clientToScene(cx, cy); // calibrated hit-test mapping (robust to CSS scaling)
      let seed: string | null;
      if (hm === "x") seed = ws.fx.nearestAxisKey("x", u.x);
      else if (hm === "y") seed = ws.fx.nearestAxisKey("y", u.y);
      else seed = ws.fx.nearestKeyAt(u.x, u.y, ws.vb ? ws.vb.w * 0.02 : 8); // ~2% of the view width
      hoverAt(seed, cx, cy);
    });
  }

  // Drag move/up are bound to `window` only for the lifetime of a press (added
  // in onDown, removed in onDragUp), so a drag that leaves the svg still
  // resolves without leaking global listeners across widgets.
  function onDragMove(ev: PointerEvent): void {
    if (ws.pointers.has(ev.pointerId)) {
      ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
    }
    // Two active pointers -> pinch-zoom about their midpoint.
    if (ws.pinchDist > 0 && ws.pointers.size >= 2 && ws.vb) {
      const pts = Array.from(ws.pointers.values());
      const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
      if (d > 0) {
        const u = ws.fx.toAnchor((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
        ws.vb = zoomViewBox(ws.vb, d / ws.pinchDist, u.x, u.y);
        ws.fx.applyViewBox();
        ws.pinchDist = d;
      }
      return;
    }
    if (!ws.down) return;
    if (!ws.dragging) {
      if (Math.abs(ev.clientX - ws.down.cx) + Math.abs(ev.clientY - ws.down.cy) <= DRAG_THRESHOLD) return;
      ws.dragging = ws.mode === "pan" && ws.opts.zoom ? "pan"
        : ws.mode === "lasso" && ws.opts.lasso ? "lasso"
        : ws.opts.brush ? "brush" : "";
      if (ws.dragging === "pan") ws.el.classList.add("vellumwidget-panning");
      if (ws.dragging === "lasso") ws.lassoPts = [ws.fx.clientToScene(ws.down.cx, ws.down.cy)]; // seed with the press point
      if (ws.dragging === "") return;
      ws.movedDuringDrag = true;
    }
    if (ws.dragging === "brush") {
      const box = ws.el.getBoundingClientRect();
      positionBrush(
        Math.min(ws.down.cx, ev.clientX) - box.left,
        Math.min(ws.down.cy, ev.clientY) - box.top,
        Math.abs(ev.clientX - ws.down.cx),
        Math.abs(ev.clientY - ws.down.cy)
      );
    } else if (ws.dragging === "lasso" && ws.vb) {
      ws.lassoPts.push(ws.fx.clientToScene(ev.clientX, ev.clientY));
      updateLassoPath();
    } else if (ws.dragging === "pan" && ws.vb) {
      const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
      ws.vb.x -= u.x - ws.down.ux;
      ws.vb.y -= u.y - ws.down.uy;
      ws.fx.applyViewBox();
      const u2 = ws.fx.toAnchor(ev.clientX, ev.clientY); // re-anchor: track cursor 1:1
      ws.down.ux = u2.x;
      ws.down.uy = u2.y;
    }
  }

  function onDown(ev: PointerEvent): void {
    // Ignore non-primary mouse buttons; touch/pen have button 0/-1.
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
    // Drag move/up bind to `window` for the lifetime of a press (addEventListener
    // dedups identical listeners, so repeated downs don't stack them).
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragUp);
    if (ws.pointers.size >= 2 && ws.opts.zoom) {
      // A second finger: start a pinch, abandoning any nascent single drag.
      const pts = Array.from(ws.pointers.values());
      ws.pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
      ws.down = null;
      ws.dragging = "";
      hideBrush();
      ws.el.classList.remove("vellumwidget-panning");
      return;
    }
    // Pin the press's panel so a pan that drifts across a facet keeps one frame.
    if (ws.axisZoomActive) { const pu = ws.fx.toUser(ev.clientX, ev.clientY); ws.anchorPanel = ws.fx.azNearest(pu.x, pu.y); }
    // With per-cell zoom the press's cell takes the gesture (VW-18).
    if (ws.anchorPanel) ws.fx.focusCell(ws.anchorPanel.p.cell);
    const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
    ws.down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
    ws.dragging = "";
    ws.movedDuringDrag = false;
  }

  function onDragUp(ev: PointerEvent): void {
    ws.pointers.delete(ev.pointerId);
    const wasPinch = ws.pinchDist > 0;
    if (ws.pointers.size < 2) ws.pinchDist = 0;
    if (ws.pointers.size === 0) {
      ws.anchorPanel = null;
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragUp);
      window.removeEventListener("pointercancel", onDragUp);
    }
    if (wasPinch) {
      ws.down = null;
      ws.dragging = "";
      ws.el.classList.remove("vellumwidget-panning");
      hideBrush();
      ws.fx.reportView(); // pinch settled -> report the final view
      return;
    }
    if (ws.dragging === "brush" && ws.down) {
      const p1 = ws.fx.clientToScene(ws.down.cx, ws.down.cy);
      const p2 = ws.fx.clientToScene(ev.clientX, ev.clientY);
      const rect: Bbox = {
        x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y),
        x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y)
      };
      // A declared select_interval() turns the brush into a data-value interval:
      // its members are the elements whose data fall in the brushed range.
      const iv = ws.fx.applyIntervalBrush(rect);
      ws.lastBrush = iv ? iv.band : rect;
      const hitKeys = iv ? iv.keys : ws.fx.dropInert(ws.fx.brushKeysIn(rect)); // never (re-)select hidden/filtered marks
      // A partly brushed line/area is a member (conditions, filters, `_brush`)
      // but is not selected: the selected style would restroke it (VW-19).
      if (ws.opts.select) ws.fx.setSelection(ws.fx.brushSelectable(hitKeys, iv ? iv.band : rect)); // also pushes _selected
      else if (iv) ws.fx.reevaluateInteractions(); // conditions/filters still react
      // The brushed region + keys, as a discrete gesture event; data-space bounds
      // (x0d/x1d/y0d/y1d + panel) added when a panel scale applies, and the
      // interval selection's name + data range when one is declared.
      ws.fx.shinyInput("brush", Object.assign(
        { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
        ws.fx.brushDataFields(rect),
        iv ? iv.fields : {}
      ), { priority: "event" });
      hideBrush();
    } else if (ws.dragging === "lasso") {
      // Close the freehand path and select every mark whose centre is inside it.
      const poly = ws.lassoPts.slice();
      const hitKeys = ws.fx.dropInert(ws.fx.lassoKeysIn(poly)); // never (re-)select hidden/filtered marks
      if (poly.length >= 3) {
        const b = polyBounds(poly);
        ws.lastBrush = b; // zoom-to-selection frames the lasso's bounds
        if (ws.opts.select) ws.fx.setSelection(ws.fx.brushSelectable(hitKeys, poly));
        // Report as a brush gesture (keys + the lasso's bounding box), with a
        // `lasso: true` flag so the server can tell the two apart, plus data-space
        // bounds when a panel scale applies.
        ws.fx.shinyInput("brush", Object.assign(
          { keys: hitKeys, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lasso: true },
          ws.fx.brushDataFields(b)
        ), { priority: "event" });
      }
      clearLasso();
    }
    // A pan reports once here (its per-frame applyViewBox calls skipped reporting).
    if (ws.dragging === "pan") ws.fx.reportView();
    ws.el.classList.remove("vellumwidget-panning");
    ws.down = null;
    ws.dragging = "";
  }

  function onClick(ev: MouseEvent): void {
    if (ws.movedDuringDrag) {
      ws.movedDuringDrag = false;
      return;
    } // a drag, not a click
    let k = keyOf(ev.target);
    // Raster mode has no per-element nodes, so resolve the click to the nearest
    // mark within a small radius (same snap the hover uses).
    if (k == null && ws.rasterMode && ws.opts.nearest !== false && ws.elements.length) {
      const u = ws.fx.clientToScene(ev.clientX, ev.clientY);
      const rad = ws.vb ? ws.vb.w * 0.02 : 8;
      k = ws.fx.nearestKeyAt(u.x, u.y, rad);
      if (k != null && ws.fx.inert(k)) k = null; // don't click-snap to a hidden/filtered mark
    }
    // A click is a discrete event (fires every time, even on the same mark);
    // `key` is null for an empty-space click.
    ws.fx.shinyInput("click", { key: k }, { priority: "event" });
    // Click-to-source: surface the data rows behind the clicked grob (keyed by
    // its data-vellum-id, which the SVG already carries). Opt-in via the plot's
    // inspect_source(); a no-op otherwise and on empty space / in raster mode
    // (no per-element node to read the id from).
    if (ws.provenance && ws.provenance.on === "click") ws.fx.emitSource(ev.target);
    // A legend swatch under the hide/mute policy toggles its series instead of
    // selecting it. The second click of a double-click (detail >= 2) is left for
    // onDblClick to turn into an isolate.
    const series = ws.fx.swatchSeries(k);
    if (series != null && ws.fx.legendPolicy() !== "select") {
      if (!(ev.detail && ev.detail >= 2)) ws.fx.legendToggle(series);
      return;
    }
    if (k != null) {
      if (ws.opts.select) ws.fx.toggleSelect(k);
    } else {
      ws.fx.clearSelection();
      ws.lastBrush = null;
    }
  }

  // Double-click a legend swatch (hide/mute policy) to isolate its series.
  function onDblClick(ev: MouseEvent): void {
    const series = ws.fx.swatchSeries(keyOf(ev.target));
    if (series != null && ws.fx.legendPolicy() !== "select") ws.fx.legendIsolate(series);
  }

  function onWheel(ev: WheelEvent): void {
    if (!ws.opts.zoom || !ws.vb) return;
    ev.preventDefault();
    ws.fx.focusCellAt(ev.clientX, ev.clientY); // per-cell zoom: the wheel's cell (VW-18)
    const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
    const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
    ws.vb = zoomViewBox(ws.vb, factor, u.x, u.y);
    ws.fx.applyViewBox();
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ws.fx.clearSelection();
      ws.fx.clearHover();
      ws.fx.clearClass("vellumwidget-focus");
      hideBrush();
      ws.lastBrush = null;
      // Leave mark-traversal mode, returning focus to the widget as a whole.
      if (ws.fx.markFocused() && typeof ws.el.focus === "function") ws.el.focus();
      ws.focusIdx = -1;
      return;
    }
    // Accessibility: while a mark has keyboard focus, arrows traverse marks
    // (roving tabindex) and Enter/Space toggles its selection — this takes
    // precedence over pan/zoom, which owns the arrows when no mark is focused.
    if (ws.opts.a11y && ws.fx.markFocused()) {
      const k = ws.focusables[ws.focusIdx].key;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        ws.fx.focusRoving(ws.focusIdx + 1);
        ev.preventDefault();
        return;
      }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
        ws.fx.focusRoving(ws.focusIdx - 1);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
        const series = ws.fx.swatchSeries(k);
        if (series != null && ws.fx.legendPolicy() !== "select") {
          ws.fx.legendToggle(series);
          ws.fx.announce(ws.fx.a11yLabel(k) + (ws.legendOff[series] ? ", hidden" : ", shown"));
        } else {
          if (ws.opts.select) ws.fx.toggleSelect(k);
          ws.fx.announce(ws.fx.a11yLabel(k) + (ws.selected[k] ? ", selected" : ", not selected"));
        }
        ev.preventDefault();
        return;
      }
    }
    // Keyboard pan/zoom (the root is focusable): arrows pan, +/- zoom, 0 resets.
    if (!ws.opts.zoom || !ws.vb) return;
    if (ev.key === "0") {
      ws.fx.resetZoom();
      ev.preventDefault();
      return;
    }
    const dx = ws.vb.w * 0.12;
    const dy = ws.vb.h * 0.12;
    const cx = ws.vb.x + ws.vb.w / 2;
    const cy = ws.vb.y + ws.vb.h / 2;
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft": ws.vb.x -= dx; break;
      case "ArrowRight": ws.vb.x += dx; break;
      case "ArrowUp": ws.vb.y -= dy; break;
      case "ArrowDown": ws.vb.y += dy; break;
      case "+": case "=": ws.vb = zoomViewBox(ws.vb, 1.2, cx, cy); break;
      case "-": case "_": ws.vb = zoomViewBox(ws.vb, 1 / 1.2, cx, cy); break;
      default: handled = false;
    }
    if (handled) {
      ws.fx.applyViewBox();
      ev.preventDefault();
    }
  }

  return { clearLasso, onHoverMove, onDown, onClick, onDblClick, onWheel, onKey };
}
