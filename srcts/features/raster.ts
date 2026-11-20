// Raster mode: the crisp-zoom canvas point layer and the overlay rings that
// stand in for per-node selection / hover classes.

import { OVERLAY_MARK_CAP, SVGNS } from "./constants";
import { hasBbox, isRoundMark } from "../geometry";
import type { WidgetFns, WidgetState } from "../state";
import { isZoomedIn, userToCanvas } from "../viewbox";

export function rasterFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "ensureCanvas" | "clearPointData" | "sampleBaseRaster" | "drawPoints" | "clearGroup"
  | "drawSelFeedback" | "setHoverKeys" | "setHover"
> {
  // --- crisp-zoom canvas point layer (raster mode, Phase 6) ---
  // Create the canvas once (sits above the base image, below the overlay rings).
  // `getContext` may be absent (jsdom / very old browsers) — then ctx stays null
  // and every draw is a no-op, leaving the faithful base image as the only layer.
  function ensureCanvas(): void {
    if (ws.canvasEl) return;
    ws.canvasEl = document.createElement("canvas");
    ws.canvasEl.className = "vellumwidget-canvas";
    ws.canvasEl.setAttribute("aria-hidden", "true");
    // Into the stage (not the root), so `inset:0` matches the svg box; see the
    // stage note in renderValue.
    (ws.stage || ws.el).appendChild(ws.canvasEl);
    ws.ctx = typeof ws.canvasEl.getContext === "function" ? ws.canvasEl.getContext("2d") : null;
  }

  function clearPointData(): void {
    ws.ptCx = ws.ptCy = ws.ptRad = null;
    ws.ptRGB = null;
    ws.ptN = 0;
    ws.ptAllRound = false;
    if (ws.canvasEl) ws.canvasEl.style.display = "none";
    showMarksLayer(true);
  }

  // Sample each keyed element's colour from the rendered base raster (its centre
  // pixel) and record centre + radius (from the index bbox). Done once per render,
  // asynchronously after the image decodes. No colour data crosses the wire — it is
  // read back from the pixels vellum already drew, so the crisp layer matches them.
  function sampleBaseRaster(): void {
    clearPointData();
    if (!ws.rasterMode || !ws.svgEl || !ws.vb0) return;
    // The split render's mark layer when there is one (furniture may carry its
    // own images), else the single base image.
    const imgNode = ws.svgEl.querySelector("image.vellumwidget-marks") || ws.svgEl.querySelector("image");
    const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
    if (!href) return;
    const off = document.createElement("canvas");
    const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
    if (!octx) return; // no 2D support -> canvas zoom disabled, image-only
    const iw = Math.max(1, Math.round(ws.vb0.w));
    const ih = Math.max(1, Math.round(ws.vb0.h));
    const els = ws.elements; // capture (a later re-render replaces `elements`)
    const v0 = ws.vb0;
    const img = new Image();
    img.onload = function () {
      // Guard against a re-render having happened before decode finished.
      if (els !== ws.elements || v0 !== ws.vb0) return;
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
      let allRound = true;
      for (let i = 0; i < els.length; i++) {
        const e = els[i];
        if (!hasBbox(e)) continue;
        const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
        const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
        const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
        const o = (sy * iw + sx) * 4;
        if (data[o + 3] < 8) continue; // transparent -> background, not a drawn mark
        if (!isRoundMark(e.mark)) allRound = false;
        cx.push(mx);
        cy.push(my);
        rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
        rgb.push(data[o], data[o + 1], data[o + 2]);
      }
      ws.ptN = cx.length;
      ws.ptCx = Float64Array.from(cx);
      ws.ptCy = Float64Array.from(cy);
      ws.ptRad = Float64Array.from(rad);
      ws.ptRGB = Uint8Array.from(rgb);
      ws.ptAllRound = allRound && cx.length > 0;
      drawPoints(); // in case the view is already zoomed
    };
    img.onerror = function () {};
    img.src = href;
  }

  // Redraw the crisp point layer for the current view. Engages only when zoomed in
  // (otherwise the faithful base image shows and the canvas is hidden). Points
  // outside the view are culled, so a deep zoom draws only a handful.
  //
  // Under axis zoom (split render, VW-14) the svg frame stays at vb0 and each
  // panel's marks move by their own T_i, so the points are drawn per panel:
  // through that panel's T and clipped to its fixed rect, never over the axes.
  function drawPoints(): void {
    if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const zoomed = az
      ? ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx > 1.0001 || t.sy > 1.0001; })
      : isZoomedIn(ws.vb, ws.vb0);
    if (!zoomed || !ws.ptCx || !ws.ptCy || !ws.ptRad || !ws.ptRGB || !ws.ptN) {
      ws.canvasEl.style.display = "none";
      showMarksLayer(true);
      return;
    }
    const rect = (ws.svgEl || ws.el).getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width || ws.vb0.w));
    const ch = Math.max(1, Math.round(rect.height || ws.vb0.h));
    const dpr = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
    if (ws.canvasEl.width !== cw * dpr || ws.canvasEl.height !== ch * dpr) {
      ws.canvasEl.width = cw * dpr;
      ws.canvasEl.height = ch * dpr;
    }
    ws.canvasEl.style.width = cw + "px";
    ws.canvasEl.style.height = ch + "px";
    ws.canvasEl.style.display = "block";
    const ctx = ws.ctx;
    const W = ws.canvasEl.width, H = ws.canvasEl.height;
    ctx.clearRect(0, 0, W, H);
    const cx = ws.ptCx, cy = ws.ptCy, rad = ws.ptRad, rgb = ws.ptRGB, n = ws.ptN;
    const dot = function (px: number, py: number, r: number, i: number): void {
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.75, r), 0, 6.283185307179586);
      ctx.fillStyle = "rgb(" + rgb[i * 3] + "," + rgb[i * 3 + 1] + "," + rgb[i * 3 + 2] + ")";
      ctx.fill();
    };
    if (az) {
      // The canvas redraws every panel's points, so when they are all round
      // (what it draws exactly) the mark image -- scaled up and blurred by T
      // -- is hidden rather than left showing through under the crisp dots.
      showMarksLayer(!ws.ptAllRound);
      const view = ws.vb0;
      const base = Math.min(W / view.w, H / view.h);
      for (let k = 0; k < ws.azPanels.length; k++) {
        const a = ws.azPanels[k], p = a.p, t = ws.fx.azT(a);
        const c0 = userToCanvas(view, W, H, p.px0, p.py0), c1 = userToCanvas(view, W, H, p.px1, p.py1);
        // "fixed" (default) keeps the full-view pixel size; "scale" grows with T.
        const rs = ws.opts.zoomMarks === "scale" ? base * Math.min(t.sx, t.sy) : base;
        ctx.save();
        ctx.beginPath();
        ctx.rect(c0.px, c0.py, c1.px - c0.px, c1.py - c0.py);
        ctx.clip();
        for (let i = 0; i < n; i++) {
          const px = cx[i], py = cy[i];
          if (px < p.px0 || px > p.px1 || py < p.py0 || py > p.py1) continue; // another panel's
          const bx = t.sx * px + t.tx, by = t.sy * py + t.ty;
          if (bx < p.px0 || bx > p.px1 || by < p.py0 || by > p.py1) continue; // panned out of view
          const q = userToCanvas(view, W, H, bx, by);
          dot(q.px, q.py, rad[i] * rs, i);
        }
        ctx.restore();
      }
      return;
    }
    // "fixed" (default): draw each point at its full-view pixel size (scale from
    // vb0), so zooming re-maps positions without growing the dots — parity with
    // the SVG axis_zoom constant-size glyphs. "scale": grow with the view (vb).
    const rScale = ws.opts.zoomMarks === "scale"
      ? Math.min(W / ws.vb.w, H / ws.vb.h)
      : Math.min(W / ws.vb0.w, H / ws.vb0.h);
    const x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
    for (let i = 0; i < n; i++) {
      const px = cx[i], py = cy[i];
      if (px < x0 || px > x1 || py < y0 || py > y1) continue; // cull off-view
      const q = userToCanvas(ws.vb, W, H, px, py);
      dot(q.px, q.py, rad[i] * rScale, i);
    }
  }

  // Show or hide the split render's mark-layer image (all its panel copies).
  function showMarksLayer(on: boolean): void {
    if (ws.svgEl && ws.marksLayer) ws.svgEl.classList.toggle("vellumwidget-marks-off", !on);
  }

  // A ring marking element `k`'s bbox, or null if it has no geometry. Drawn in the
  // overlay's viewBox space; `non-scaling-stroke` keeps it crisp under zoom.
  function ringFor(k: string, cls: string): SVGCircleElement | null {
    const m = ws.meta[k];
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
    clearGroup(ws.selGroup);
    if (!ws.selGroup) return;
    const keys = ws.fx.selectedKeys();
    if (keys.length > OVERLAY_MARK_CAP) return;
    for (let i = 0; i < keys.length; i++) {
      const c = ringFor(keys[i], "vellumwidget-fb-sel");
      if (c) ws.selGroup.appendChild(ws.fx.azOverlayWrap(c, keys[i]));
    }
  }

  function drawHovFeedback(keys: string[]): void {
    clearGroup(ws.hovGroup);
    if (!ws.hovGroup) return;
    for (let i = 0; i < keys.length; i++) {
      const c = ringFor(keys[i], "vellumwidget-fb-hov");
      if (c) ws.hovGroup.appendChild(ws.fx.azOverlayWrap(c, keys[i]));
    }
  }

  // Highlight an explicit set of keys (the shared path for closest-mark hover,
  // where keys = the mark's linked group, and unified hover, where keys = the
  // whole x-/y-column).
  function setHoverKeys(keys: string[]): void {
    ws.hoverSig = ""; // the pointer fast path must redraw after any other hover
    if (!ws.opts.hover) return;
    ws.hovering = true;
    // Raster mode: no per-element nodes — draw a hover ring on the overlay.
    if (ws.rasterMode) {
      drawHovFeedback(keys);
      return;
    }
    ws.lastHoverKeys = keys;
    ws.fx.clearClass("vellumwidget-hl");
    ws.fx.addClassForKeys(keys, "vellumwidget-hl");
    ws.fx.reevaluateInteractions(); // hover-triggered conditions react to the new set
    // Large scenes: dim via the holder + clone the hovered marks into the overlay
    // (O(hovered)); otherwise the CSS `.vellumwidget-hovering` rule dims per node.
    if (ws.largeDim) ws.fx.showHighlightOverlay(keys);
    else ws.el.classList.add("vellumwidget-hovering");
  }

  function setHover(k: string): void {
    setHoverKeys(ws.fx.linkedKeys(k));
  }

  return { ensureCanvas, clearPointData, sampleBaseRaster, drawPoints, clearGroup, drawSelFeedback, setHoverKeys, setHover };
}
