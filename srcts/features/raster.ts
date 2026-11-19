// Raster mode: the crisp-zoom canvas point layer and the overlay rings that
// stand in for per-node selection / hover classes.

import { OVERLAY_MARK_CAP, SVGNS } from "./constants";
import { hasBbox } from "../geometry";
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
    if (ws.canvasEl) ws.canvasEl.style.display = "none";
  }

  // Sample each keyed element's colour from the rendered base raster (its centre
  // pixel) and record centre + radius (from the index bbox). Done once per render,
  // asynchronously after the image decodes. No colour data crosses the wire — it is
  // read back from the pixels vellum already drew, so the crisp layer matches them.
  function sampleBaseRaster(): void {
    clearPointData();
    if (!ws.rasterMode || !ws.svgEl || !ws.vb0) return;
    const imgNode = ws.svgEl.querySelector("image");
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
      ws.ptN = cx.length;
      ws.ptCx = Float64Array.from(cx);
      ws.ptCy = Float64Array.from(cy);
      ws.ptRad = Float64Array.from(rad);
      ws.ptRGB = Uint8Array.from(rgb);
      drawPoints(); // in case the view is already zoomed
    };
    img.onerror = function () {};
    img.src = href;
  }

  // Redraw the crisp point layer for the current view. Engages only when zoomed in
  // (otherwise the faithful base image shows and the canvas is hidden). Points
  // outside the view are culled, so a deep zoom draws only a handful.
  function drawPoints(): void {
    if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
    if (!isZoomedIn(ws.vb, ws.vb0) || !ws.ptCx || !ws.ptCy || !ws.ptRad || !ws.ptRGB || !ws.ptN) {
      ws.canvasEl.style.display = "none";
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
    const W = ws.canvasEl.width, H = ws.canvasEl.height;
    ws.ctx.clearRect(0, 0, W, H);
    // "fixed" (default): draw each point at its full-view pixel size (scale from
    // vb0), so zooming re-maps positions without growing the dots — parity with
    // the SVG axis_zoom constant-size glyphs. "scale": grow with the view (vb).
    const rScale = ws.opts.zoomMarks === "scale"
      ? Math.min(W / ws.vb.w, H / ws.vb.h)
      : Math.min(W / ws.vb0.w, H / ws.vb0.h);
    const x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
    for (let i = 0; i < ws.ptN; i++) {
      const px = ws.ptCx[i], py = ws.ptCy[i];
      if (px < x0 || px > x1 || py < y0 || py > y1) continue; // cull off-view
      const p = userToCanvas(ws.vb, W, H, px, py);
      ws.ctx.beginPath();
      ws.ctx.arc(p.px, p.py, Math.max(0.75, ws.ptRad[i] * rScale), 0, 6.283185307179586);
      ws.ctx.fillStyle = "rgb(" + ws.ptRGB[i * 3] + "," + ws.ptRGB[i * 3 + 1] + "," + ws.ptRGB[i * 3 + 2] + ")";
      ws.ctx.fill();
    }
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
      if (c) ws.selGroup.appendChild(c);
    }
  }

  function drawHovFeedback(keys: string[]): void {
    clearGroup(ws.hovGroup);
    if (!ws.hovGroup) return;
    for (let i = 0; i < keys.length; i++) {
      const c = ringFor(keys[i], "vellumwidget-fb-hov");
      if (c) ws.hovGroup.appendChild(c);
    }
  }

  // Highlight an explicit set of keys (the shared path for closest-mark hover,
  // where keys = the mark's linked group, and unified hover, where keys = the
  // whole x-/y-column).
  function setHoverKeys(keys: string[]): void {
    if (!ws.opts.hover) return;
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
