// Hover feedback: the large-scene dim overlay, the crosshair guide, and the
// tooltip (placement, delay, sticky).

import { SVGNS, TIP_MULTI_CAP } from "./constants";
import { hasBbox } from "../geometry";
import type { WidgetFns, WidgetState } from "../state";
import { sanitizeTip } from "../tooltip";

export function hoverFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "showHighlightOverlay" | "hideHighlightOverlay" | "clearCrosshair" | "drawCrosshair"
  | "showTip" | "showTipMulti" | "hideTip" | "moveTip" | "clearHover"
> {
  // --- large-scene hover dim (overlay, O(hovered)) ---
  function dimOpacityVal(): string {
    const d = ws.opts.style && ws.opts.style.dimOpacity;
    return d == null || (d as unknown) === "" ? "0.28" : String(d);
  }

  // Dim the whole plot once (holder opacity) and clone the highlighted marks into
  // the overlay so they stay crisp above the dim — O(hovered), not O(n).
  function showHighlightOverlay(keys: string[]): void {
    if (!ws.holder || !ws.dimLayer) return;
    ws.holder.style.opacity = dimOpacityVal();
    while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
    for (let i = 0; i < keys.length; i++) {
      const nodes = ws.fx.elementsForKey(keys[i]);
      for (let j = 0; j < nodes.length; j++) {
        const c = nodes[j].cloneNode(true) as Element;
        c.classList.add("vellumwidget-hl");
        ws.dimLayer.appendChild(azOverlayWrap(c, keys[i]));
      }
    }
  }

  // Multi-panel axis zoom: the overlay sits at the fixed base view, so a clone
  // drawn in scene coordinates is wrapped in its own panel's T_i. (One panel:
  // the overlay's viewBox tracks `vb`, which already applies T.)
  function azOverlayWrap(node: Element, key: string): Element {
    if (!ws.fx.azMulti()) return node;
    const m = ws.meta[key];
    if (!m || !hasBbox(m)) return node;
    const a = ws.fx.azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
    if (!a) return node;
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("transform", ws.fx.fmtPan(ws.fx.azT(a)));
    g.appendChild(node);
    return g;
  }

  function hideHighlightOverlay(): void {
    if (ws.holder) ws.holder.style.opacity = "";
    if (ws.dimLayer) while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
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
    if (!ws.crosshairLayer) return;
    // Keep the persistent interval-selection band; it is cleared with its selection.
    const kids = Array.prototype.slice.call(ws.crosshairLayer.childNodes) as Node[];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i] !== ws.intervalEl) ws.crosshairLayer.removeChild(kids[i]);
    }
  }

  // Draw the guide rule(s) through mark `k`'s centre: a vertical rule for "x"
  // mode, horizontal for "y", and a full cross for "closest". Spans the visible
  // view (the current viewBox), which the layer's viewBox tracks.
  function drawCrosshair(k: string, hm: "closest" | "x" | "y"): void {
    clearCrosshair();
    if (!ws.crosshairLayer) return;
    const m = ws.meta[k];
    if (!m || !hasBbox(m)) return;
    const view = ws.vb || ws.vb0;
    if (!view) return;
    let cx = (m.x0 + m.x1) / 2;
    let cy = (m.y0 + m.y1) / 2;
    let x0 = view.x, x1 = view.x + view.w, y0 = view.y, y1 = view.y + view.h;
    if (ws.fx.azMulti()) {
      // Several panels: the layer is at the base view, so place the mark's centre
      // through its panel's T_i and span that panel's rect.
      const a = ws.fx.azNearest(cx, cy);
      if (a) {
        const t = ws.fx.azT(a);
        cx = t.sx * cx + t.tx; cy = t.sy * cy + t.ty;
        x0 = a.p.px0; x1 = a.p.px1; y0 = a.p.py0; y1 = a.p.py1;
      }
    }
    if (hm !== "y") ws.crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
    if (hm !== "x") ws.crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
  }

 // pending sticky hide grace
  function tipDelay(): number {
    const d = ws.opts.tooltipDelay;
    return typeof d === "number" && d > 0 ? d : 0;
  }

  // The hovered mark's centre in client px (for anchor-to-mark placement), or null.
  function markClient(k: string): { x: number; y: number } | null {
    const m = ws.meta[k];
    if (!m || !hasBbox(m)) return null;
    // Most robust: the mark's own rendered node gives its client position directly
    // (no coordinate math). SVG mode always has a node; raster mode has none, so
    // fall back to the calibrated scene->client inverse, then rect+viewBox.
    const nodes = ws.fx.elementsForKey(k);
    if (nodes.length) {
      const r = (nodes[0] as Element).getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const cx = (m.x0! + m.x1!) / 2;
    const cy = (m.y0! + m.y1!) / 2;
    const f = ws.fx.calibrateXform();
    if (f && f.sx && f.sy) return { x: (cx - f.ox) / f.sx, y: (cy - f.oy) / f.sy };
    if (!ws.svgEl) return null;
    const r = ws.svgEl.getBoundingClientRect();
    const view = ws.fx.currentViewBox();
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
    const box = ws.el.getBoundingClientRect();
    let ax = clientX - box.left;
    let ay = clientY - box.top;
    if (ws.opts.tooltipFollow === false && anchorKey) {
      const c = markClient(anchorKey);
      if (c) { ax = c.x - box.left; ay = c.y - box.top; }
    }
    const tw = ws.tip.offsetWidth || 0;
    const th = ws.tip.offsetHeight || 0;
    const below = ay - th - 12 < 0; // not enough room above -> flip below
    if (tw && box.width) ax = Math.max(tw / 2, Math.min(box.width - tw / 2, ax));
    ws.tip.style.transform =
      "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px) " +
      (below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))");
  }

  // Reveal the tip: `build()` sets its content, then it is placed and shown. When
  // hidden and a delay is set, the reveal waits `tooltip_delay` ms (cancelled if
  // the hover changes first); an already-visible tip updates instantly (no
  // re-delay while moving between marks).
  // The latest pointer position for a reveal still waiting on its delay, so a
  // pointer that keeps moving over the same mark shows the tip where it is now.
  let pendX = 0, pendY = 0;

  function revealTip(build: () => void, clientX: number, clientY: number, anchorKey: string | null): void {
    if (ws.tipHideTimer) { clearTimeout(ws.tipHideTimer); ws.tipHideTimer = 0; }
    pendX = clientX; pendY = clientY;
    const doShow = () => {
      ws.tipShowTimer = 0;
      build();
      placeTip(pendX, pendY, anchorKey);
      ws.tip.classList.add("vellumwidget-show");
    };
    const d = tipDelay();
    if (d > 0 && !ws.tip.classList.contains("vellumwidget-show")) {
      if (ws.tipShowTimer) clearTimeout(ws.tipShowTimer);
      ws.tipShowTimer = (setTimeout(doShow, d) as unknown) as number;
    } else {
      doShow();
    }
  }

  function showTip(clientX: number, clientY: number, k: string): void {
    const m = ws.meta[k];
    revealTip(() => { ws.tip.innerHTML = sanitizeTip((m && m.tooltip) || k); }, clientX, clientY, k);
  }

  function showTipMulti(clientX: number, clientY: number, keys: string[]): void {
    revealTip(() => {
      const rows: string[] = [];
      for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
        const m = ws.meta[keys[i]];
        rows.push(sanitizeTip((m && m.tooltip) || keys[i]));
      }
      if (keys.length > TIP_MULTI_CAP) rows.push("…");
      ws.tip.innerHTML = rows.join("<br>");
    }, clientX, clientY, keys[0] || null);
  }

  // The pointer moved but the hovered mark didn't: keep the content, follow the
  // pointer (a no-op when anchored to the mark). A reveal still waiting on its
  // delay picks up the new position when it fires.
  function moveTip(clientX: number, clientY: number, anchorKey: string | null): void {
    pendX = clientX; pendY = clientY;
    if (ws.tip.classList.contains("vellumwidget-show")) placeTip(clientX, clientY, anchorKey);
  }

  function hideTip(): void {
    if (ws.tipShowTimer) { clearTimeout(ws.tipShowTimer); ws.tipShowTimer = 0; }
    if (ws.tipHideTimer) { clearTimeout(ws.tipHideTimer); ws.tipHideTimer = 0; }
    ws.tip.classList.remove("vellumwidget-show");
  }

  // Hide on hover-out. When sticky, linger briefly so the pointer can travel into
  // the tip (to click a link); entering the tip cancels this (see wireStickyTip).
  function scheduleHideTip(): void {
    if (ws.tipShowTimer) { clearTimeout(ws.tipShowTimer); ws.tipShowTimer = 0; }
    if (ws.opts.tooltipSticky) {
      if (ws.tipHideTimer) clearTimeout(ws.tipHideTimer);
      ws.tipHideTimer = (setTimeout(() => { ws.tipHideTimer = 0; ws.tip.classList.remove("vellumwidget-show"); }, 260) as unknown) as number;
    } else {
      ws.tip.classList.remove("vellumwidget-show");
    }
  }

  function clearHover(): void {
    // Nothing hovered: skip the class sweep, the tip and the condition pass.
    if (!ws.hovering) return;
    ws.hovering = false;
    ws.hoverSig = "";
    if (ws.rasterMode) ws.fx.clearGroup(ws.hovGroup);
    if (ws.largeDim) hideHighlightOverlay();
    ws.el.classList.remove("vellumwidget-hovering");
    ws.fx.clearClass("vellumwidget-hl");
    clearCrosshair();
    scheduleHideTip(); // immediate, unless sticky (then a short grace to reach the tip)
    ws.fx.shinyInput("hover", null); // hover ended -> input$<id>_hover = NULL (deduped)
    if (ws.lastHoverKeys.length) {
      ws.lastHoverKeys = [];
      ws.fx.reevaluateInteractions(); // hover-triggered conditions revert
    }
  }

  return { showHighlightOverlay, hideHighlightOverlay, clearCrosshair, drawCrosshair, showTip, showTipMulti, hideTip, moveTip, clearHover };
}
