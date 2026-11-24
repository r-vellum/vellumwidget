// Raster mode: the crisp-zoom canvas point layer and the overlay rings that
// stand in for per-node selection / hover classes.

import { LIVE_DRAW_MAX, OVERLAY_MARK_CAP, RUN_BOX_PAD, SETTLE_MS, SVGNS } from "./constants";
import { asColumn, dlColumn } from "../elements";
import { hasBbox, isRoundMark } from "../geometry";
import { DL_POINT, DL_RECT, fillGradient, isLineGlyph, traceClipPath, tracePoint, traceShape } from "../dlist";
import { MS_DIM, MS_HIDDEN, MS_MUTED, MUTED_ALPHA } from "./markState";
import type { Affine, DisplayList } from "../dlist";
import type { WidgetFns, WidgetState } from "../state";
import type { MarkColors } from "../types";
import type { RunPatch, RunSplit } from "./runStyle";
import { isZoomedIn, userToCanvas } from "../viewbox";
import { createGLPainter, glHasPaths, glLastError, glStyleReadable, glUnsupported, GL_AUTO_MIN } from "./webgl";
import type { GLPainter } from "./webgl";

// Ids of the rings' panel clips (VW-48), unique across the page's widgets.
let ringClipSeq = 0;

export function rasterFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "ensureCanvas" | "clearPointData" | "sampleBaseRaster" | "drawPoints" | "clearGroup"
  | "drawSelFeedback" | "setHoverKeys" | "setHover" | "showMarksLayer" | "exportMarksImage" | "hideCanvas" | "glState"
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
    ws.ptShape = null;
    ws.ptHollow = null;
    ws.ptN = 0;
    ws.ptAllRound = false;
    hideCanvas();
    showMarksLayer(true);
  }

  // Sample each keyed element's colour from the rendered base raster (its centre
  // pixel) and record centre + radius (from the index bbox). Done once per render,
  // asynchronously after the image decodes. Under heavy overplotting the centre
  // pixel belongs to whichever mark was painted last there, so above `max_marks`
  // R ships each element's own colour (`colors`, VW-50) and the pixel is read
  // only for an element without one.
  function sampleBaseRaster(colors?: MarkColors | null): void {
    clearPointData();
    // The display list (VW-15) carries every covered mark's exact geometry and
    // paint, so there is nothing to read back from the pixels.
    if (ws.dl) { drawPoints(); return; }
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
      const cx: number[] = [], cy: number[] = [], rad: number[] = [], rgb: number[] = [], shp: number[] = [], hol: number[] = [];
      let allRound = true;
      const known = markColorTable(colors, els.length);
      const shapes = markShapes(colors, els.length);
      const hollow = markHollow(colors, els.length);
      for (let i = 0; i < els.length; i++) {
        const e = els[i];
        if (!hasBbox(e)) continue;
        const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
        const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
        const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
        const o = (sy * iw + sx) * 4;
        // A transparent centre is background, not a drawn mark -- unless R
        // says the mark is hollow and knows its colour (VW-63).
        const isHollow = !!(hollow && hollow[i] && known && known.pal[known.idx[i]]);
        if (data[o + 3] < 8 && !isHollow) continue;
        if (!isRoundMark(e.mark)) allRound = false;
        cx.push(mx);
        cy.push(my);
        rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
        const c = known ? known.pal[known.idx[i]] : null;
        if (c) rgb.push(c[0], c[1], c[2], c[3]);
        else rgb.push(data[o], data[o + 1], data[o + 2], 255);
        if (shapes) shp.push(shapes[i] ? shapes[i] - 1 : 0);
        if (hollow) hol.push(isHollow ? 1 : 0);
      }
      ws.ptN = cx.length;
      ws.ptCx = Float64Array.from(cx);
      ws.ptCy = Float64Array.from(cy);
      ws.ptRad = Float64Array.from(rad);
      ws.ptRGB = Uint8Array.from(rgb);
      ws.ptShape = shapes ? Uint8Array.from(shp) : null;
      ws.ptHollow = hollow ? Uint8Array.from(hol) : null;
      ws.ptAllRound = allRound && cx.length > 0;
      drawPoints(); // in case the view is already zoomed
    };
    img.onerror = function () {};
    img.src = href;
  }

  // The fallback dot colours (VW-50) as RGBA quads per palette entry (index 0,
  // and any entry that isn't a hex colour, is null: sample the pixel) and the
  // per-element index; null when R sent none or it doesn't fit the elements.
  function markColorTable(colors: MarkColors | null | undefined, n: number): { pal: (number[] | null)[]; idx: ArrayLike<number> } | null {
    if (!colors || !colors.idx) return null;
    const idx = dlColumn(colors.idx);
    if (idx.length !== n) return null;
    const pal: (number[] | null)[] = [null];
    const src = asColumn(colors.pal);
    for (let k = 0; k < src.length; k++) pal.push(hexRGBA(String(src[k])));
    return { pal: pal, idx: idx };
  }

  // The fallback dots' markers (VW-58): per element 1 + vellum's shape code,
  // 0 for none (a round dot); null when R sent none or it doesn't fit.
  function markShapes(colors: MarkColors | null | undefined, n: number): ArrayLike<number> | null {
    if (!colors || !colors.shape) return null;
    const s = dlColumn(colors.shape);
    return s.length === n ? s : null;
  }

  // The fallback dots' hollow flags (VW-63): per element 1 for a stroke-only
  // mark; null when R sent none (no mark is hollow) or it doesn't fit.
  function markHollow(colors: MarkColors | null | undefined, n: number): ArrayLike<number> | null {
    if (!colors || !colors.hollow) return null;
    const h = dlColumn(colors.hollow);
    return h.length === n ? h : null;
  }

  // "#rgb", "#rrggbb" or "#rrggbbaa" -> [r, g, b, a] (0-255), else null.
  function hexRGBA(s: string): number[] | null {
    const h = /^#([0-9a-f]+)$/i.exec(s.trim());
    if (!h) return null;
    let v = h[1];
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    if (v.length === 6) v += "ff";
    if (v.length !== 8) return null;
    const out = [0, 2, 4, 6].map(function (k) { return parseInt(v.slice(k, k + 2), 16); });
    return out.every(isFinite) ? out : null;
  }

  // Redraw the crisp point layer for the current view. Engages only when zoomed in
  // (otherwise the faithful base image shows and the canvas is hidden). Points
  // outside the view are culled, so a deep zoom draws only a handful.
  //
  // Under axis zoom (split render, VW-14) the svg frame stays at vb0 and each
  // panel's marks move by their own T_i, so the points are drawn per panel:
  // through that panel's T and clipped to its fixed rect, never over the axes.
  // `stateOnly`: only the marks' style state changed (VW-22), not the view.
  function drawPoints(stateOnly?: boolean): void {
    if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
    if (ws.dl) {
      // The detail tier's SVG nodes stand in for the canvas and the image.
      if (ws.markTier === "detail") { hideCanvas(); showMarksLayer(false); return; }
      drawList(ws.dl, false, !!stateOnly);
      return;
    }
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
    const shp = ws.ptShape && ws.ptShape.length === n ? ws.ptShape : null;
    const hol = ws.ptHollow && ws.ptHollow.length === n ? ws.ptHollow : null;
    // Each dot in its own marker (VW-58): a circle without shapes, else the
    // shape the display list would draw (the line glyphs plus / cross
    // stroked, the rest filled), at the same radius: a marker's box is 2r
    // wide whatever its shape.
    const dot = function (px: number, py: number, r: number, i: number): void {
      const a = rgb[i * 4 + 3];
      const style = a === 255
        ? "rgb(" + rgb[i * 4] + "," + rgb[i * 4 + 1] + "," + rgb[i * 4 + 2] + ")"
        : "rgba(" + rgb[i * 4] + "," + rgb[i * 4 + 1] + "," + rgb[i * 4 + 2] + "," + (a / 255) + ")";
      const rr = Math.max(0.75, r);
      const sh = shp ? shp[i] : 0;
      ctx.beginPath();
      if (!sh) {
        ctx.arc(px, py, rr, 0, 6.283185307179586);
      } else {
        tracePoint(ctx, sh, px, py, rr);
      }
      // Line glyphs (plus / cross) and hollow markers (a transparent fill,
      // VW-63) are stroked; the rest filled.
      if (isLineGlyph(sh) || (hol && hol[i])) {
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, rr / 4);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = style;
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
    // ViewBox zoom (no axis zoom: raw scenes, polar and void panels) scales
    // the whole scene, glyphs included, as the SVG mode and the mark image do,
    // so the dots grow with the view (VW-29). Constant-size glyphs
    // (`zoomMarks`) are an axis-zoom rule, handled above.
    const rScale = Math.min(W / ws.vb.w, H / ws.vb.h);
    const x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
    for (let i = 0; i < n; i++) {
      const px = cx[i], py = cy[i];
      if (px < x0 || px > x1 || py < y0 || py > y1) continue; // cull off-view
      const q = userToCanvas(ws.vb, W, H, px, py);
      dot(q.px, q.py, rad[i] * rScale, i);
    }
  }

  // Size the canvas backing store to the svg box (device-pixel ratio aware) and
  // show it; returns [W, H] in backing-store px.
  function fitCanvas(): [number, number] {
    const c = ws.canvasEl!;
    const rect = (ws.svgEl || ws.el).getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width || ws.vb0!.w));
    const ch = Math.max(1, Math.round(rect.height || ws.vb0!.h));
    const dpr = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
    if (c.width !== cw * dpr || c.height !== ch * dpr) { c.width = cw * dpr; c.height = ch * dpr; }
    c.style.width = cw + "px";
    c.style.height = ch + "px";
    c.style.display = "block";
    return [c.width, c.height];
  }

  // The exact mid-zoom tier (VW-15): redraw the display list's marks for the
  // current view, with their own shape, fill, stroke, width, dash and alpha, in
  // the engine's paint order. Under axis zoom each record goes through its
  // panel's T_i and is clipped to that panel; its own clip rect applies too.
  // Glyphs keep their pixel size ("fixed") or grow with T ("scale"); strokes
  // keep their width, like the SVG mode's non-scaling strokes. Consecutive
  // opaque points and rects of one paint are batched into one path.
  //
  // Per-key style state (VW-22, ws.msFlags/msColor): a hidden key is skipped,
  // a dimmed or muted one is drawn at the dim alpha, a recoloured one with
  // its condition colour. While any such state is active the canvas also
  // stands in for the mark PNG at the overview zoom, when the list is exact
  // (a flagged record exists only in the image, which can't be restyled).
  // The WebGL painter (F-25), created on the first list it can draw; `glOff`
  // once WebGL2 is missing or its context was lost (the canvas then paints).
  let glp: GLPainter | null = null, glOff = false;
  // The eligibility of the list last asked about. Keyed on the run images
  // too: attachRuns() sets them on the same list object once they load, and
  // a list with run images is not the GL painter's (review of #124).
  let glForDl: DisplayList | null = null, glForRuns: CanvasImageSource[] | null = null, glWhy: string | null = null;
  let glPaths = false; // the list has paths: its painter needs MSAA
  // Why the last drawList() did not draw with GL (null when it did).
  let glLast: string | null = "not drawn yet";
  function glReason(dl: DisplayList): string | null {
    const mode = ws.opts.webgl || "auto";
    if (glOff) return "unavailable" + (glLastError ? ": " + glLastError : "");
    if (mode === "never") return "never";
    if (mode === "auto" && dl.n < GL_AUTO_MIN) return "small";
    if (glForDl !== dl || glForRuns !== dl.runImgs) {
      glForDl = dl; glForRuns = dl.runImgs; glWhy = glUnsupported(dl);
      glPaths = !glWhy && glHasPaths(dl);
    }
    if (glWhy) return glWhy;
    if (ws.msActive && ws.msColor) {
      if (glStyleRev !== ws.msRev) { glStyleRev = ws.msRev; glStyleOk = glStyleReadable(ws.msColor, ws.msPalette); }
      if (!glStyleOk) return "condition colours";
    }
    return null;
  }
  let glStyleRev = -1, glStyleOk = true;
  // The list, draw order and style the GL painter last failed to draw (e.g.
  // a raise order interleaving marks and paths too finely): the canvas paints
  // that state, through the LIVE_DRAW_MAX deferral like any canvas draw.
  let glFail: { dl: DisplayList; ord: Uint32Array | null } | null = null;
  function glUsable(dl: DisplayList): boolean {
    const why = glReason(dl);
    if (!why && glFail && glFail.dl === dl && glFail.ord === ws.fx.raiseOrder(dl)) {
      // the batches don't depend on the style: keep the painter's mesh for
      // the next draw order
      glLast = "draw failed";
      return false;
    }
    if (why) {
      // a list the painter can't draw: let go of the last one's buffers
      if (glp) glp.release();
      glLast = why;
      return false;
    }
    // a painter with the wrong MSAA setting for this list: replace it
    if (glp && glp.msaa !== glPaths) { glp.dispose(); glp = null; }
    if (!glp) {
      const base = ws.canvasEl;
      glp = base && base.parentNode ? createGLPainter(function () {
        glOff = true;
        if (glp) glp.canvas.style.display = "none";
        drawPoints();
      }, glPaths) : null;
      if (!glp) { glOff = true; glLast = glReason(dl) || "unavailable"; return false; }
      base!.parentNode!.insertBefore(glp.canvas, base!.nextSibling);
    }
    if (!glp.alive()) { glOff = true; glLast = glReason(dl) || "unavailable"; return false; }
    return true;
  }
  // For tests: whether the GL layer shows, and why the last drawList() did
  // not draw with it (null when it did).
  function glState(): { on: boolean; why: string | null } {
    return { on: !!(glp && glp.canvas.style.display === "block"), why: glLast };
  }

  let settleTimer = 0;
  function drawList(dl: DisplayList, settled?: boolean, stateOnly?: boolean): void {
    const ctx = ws.ctx!, vb = ws.vb!, vb0 = ws.vb0!;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const zoomed = az
      ? ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx > 1.0001 || t.sy > 1.0001; })
      : isZoomedIn(vb, vb0);
    const styled = ws.msActive && !!ws.msFlags && !!ws.msColor;
    // Runs composited with a blend mode (VW-32) blend with the furniture
    // beneath, which the mark PNG (blended against a transparent page) can't
    // show: the canvas stands in for it at the overview zoom too.
    const blending = dl.exact && !!dl.runImgs && dl.blendRuns;
    // A selection whose marks a non-member partly covers (VW-53): the
    // canvas draws them above it, standing in for the image (which can't
    // reorder its pixels) at the overview zoom too.
    const raising = dl.exact && !!ws.fx.raiseOrder(dl);
    if (!(zoomed || (styled && dl.exact) || blending || raising) || !dl.n) {
      glLast = "image shown";
      hideCanvas();
      showMarksLayer(true);
      return;
    }
    const wasShown = ws.canvasEl!.style.display === "block" || !!(glp && glp.canvas.style.display === "block");
    const [W, H] = fitCanvas();
    const L = listLayout(dl, W, H);
    const useGL = !blending && glUsable(dl);
    if (blending) glLast = "blend runs";
    // Too many marks in view to redraw within a frame: keep the scaled image
    // up while the view is moving and draw once it settles. (The GL painter
    // draws them all within a frame.)
    if (!settled && !useGL && dl.n > LIVE_DRAW_MAX) {
      let vis = 0;
      const np = dl.panels.length;
      for (let i = 0; i < dl.n && vis <= LIVE_DRAW_MAX; i++) {
        const A = L.aff[dl.panel[i] <= np ? dl.panel[i] : 0], pc = L.pclip[dl.panel[i] <= np ? dl.panel[i] : 0];
        const x = A.ax * (dl.bx0[i] + dl.bx1[i]) / 2 + A.bx, y = A.ay * (dl.by0[i] + dl.by1[i]) / 2 + A.by;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        if (pc && (x < pc[0] || x > pc[2] || y < pc[1] || y > pc[3])) continue;
        vis++;
      }
      if (vis > LIVE_DRAW_MAX) {
        // A style-only change leaves the view (and so a drawn canvas) where it
        // was: keep it up until the redraw rather than flash the plain image.
        if (!(stateOnly && wasShown)) {
          hideCanvas();
          showMarksLayer(true);
        }
        settleTimer = window.setTimeout(function () { settleTimer = 0; if (ws.dl === dl) { fitCanvas(); drawList(dl, true); } }, SETTLE_MS);
        return;
      }
    }
    // Every mark is redrawn exactly, so the scaled mark image goes; flagged
    // marks (gradients, groups, text) are only in the image, which then stays.
    showMarksLayer(!dl.exact);
    if (useGL && glp) {
      const st = styled ? {
        flags: ws.msFlags!, color: ws.msColor!, palette: ws.msPalette, dimAlpha: ws.msDimAlpha,
        alpha: ws.msAlpha, alphaPal: ws.msAlphaPal
      } : null;
      const ord = ws.fx.raiseOrder(dl);
      if (glp.draw(dl, L, W, H, ord, st, ws.msRev)) {
        glLast = null;
        const c = glp.canvas;
        c.style.width = ws.canvasEl!.style.width;
        c.style.height = ws.canvasEl!.style.height;
        c.style.display = "block";
        ws.canvasEl!.style.display = "none";
        hideLayers(0);
        return;
      }
    }
    if (glp) glp.canvas.style.display = "none";
    if (useGL) {
      // GL couldn't draw this state: redraw it the canvas way (deferral included)
      glFail = { dl: dl, ord: ws.fx.raiseOrder(dl) };
      drawList(dl, settled, stateOnly);
      return;
    }
    // Blend runs (VW-32): each is drawn on a canvas of its own stacked over
    // the marks before it, with the run's CSS mix-blend-mode, so it blends
    // with the furniture and the marks beneath as in SVG mode; the marks
    // after it go on the next canvas up. The stage isolates the blending.
    let used = 0;
    const sink: LayerSink | undefined = blending ? {
      next: function (mode: string): CanvasRenderingContext2D | null {
        const c = blendLayer(used);
        if (!c) return null;
        const x = typeof c.getContext === "function" ? c.getContext("2d") : null;
        if (!x) return null;
        used++;
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
        c.style.width = ws.canvasEl!.style.width;
        c.style.height = ws.canvasEl!.style.height;
        c.style.mixBlendMode = mode === "normal" ? "" : mode;
        c.style.display = "block";
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, W, H);
        return x;
      }
    } : undefined;
    paintList(ctx, dl, W, H, L, styled, sink);
    hideLayers(used);
  }

  // The stacked canvases for blend runs (VW-32), created on demand right
  // above the marks canvas (under the above-marks furniture), in order.
  const layers: HTMLCanvasElement[] = [];
  function blendLayer(k: number): HTMLCanvasElement | null {
    const base = ws.canvasEl;
    if (!base || !base.parentNode) return null;
    while (layers.length <= k) {
      const c = document.createElement("canvas");
      c.className = "vellumwidget-canvas-layer";
      c.setAttribute("aria-hidden", "true");
      const prev = layers.length ? layers[layers.length - 1] : base;
      base.parentNode.insertBefore(c, prev.nextSibling);
      layers.push(c);
    }
    return layers[k];
  }
  // Hide the stacked canvases from the `keep`-th on; with none in use the
  // stage stops isolating its blending.
  function hideLayers(keep: number): void {
    for (let k = keep; k < layers.length; k++) { layers[k].style.display = "none"; layers[k].style.mixBlendMode = ""; }
    const stage = ws.stage || ws.el;
    if (stage && stage.classList) stage.classList.toggle("vellumwidget-blend-iso", keep > 0);
  }
  // Hide the marks canvas and its stacked layers.
  function hideCanvas(): void {
    if (ws.canvasEl) ws.canvasEl.style.display = "none";
    if (glp) glp.canvas.style.display = "none";
    hideLayers(0);
  }

  // Where the list's records land on a W x H canvas covering the svg's current
  // frame (vb0 under axis zoom, else the zoomed viewBox): per display-list
  // panel its affine, its glyph scale and (axis zoom) its fixed canvas clip.
  // `base` is the stroke scale (canvas px per scene px of stroke width).
  //
  // One rule for the mid (canvas) and detail (SVG node) tiers, matching the
  // SVG mode (VW-29): under axis zoom, glyphs keep their pixel size (unless
  // zoomMarks = "scale") and strokes their width, as the constant-size glyphs
  // and non-scaling strokes do; under viewBox zoom the whole scene scales,
  // glyph radii and stroke widths with it, as the detail tier's nodes (and
  // the SVG mode's) do in the zoomed viewBox.
  // `cst[p]`: panel p is axis-zoomed with constant-size marks at a scale
  // other than 1, so a flagged run's text and glyphs are drawn at their
  // pixel size there (VW-35); `kx`/`ky` are canvas px per scene px at the
  // full view.
  interface ListLayout { aff: Affine[]; gs: number[]; pclip: (number[] | null)[]; base: number; cst: boolean[]; kx: number; ky: number; }
  function listLayout(dl: DisplayList, W: number, H: number): ListLayout {
    const vb = ws.vb!, vb0 = ws.vb0!;
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const frame = az ? vb0 : vb;
    const q0 = userToCanvas(frame, W, H, 0, 0), q1 = userToCanvas(frame, W, H, 1, 1);
    const kx = q1.px - q0.px, ky = q1.py - q0.py;
    const base = Math.min(W / vb0.w, H / vb0.h); // canvas px per scene px at the full view
    const scaleMarks = ws.opts.zoomMarks === "scale";
    const np = dl.panels.length;
    const aff: Affine[] = [], gs: number[] = [], pclip: (number[] | null)[] = [], cst: boolean[] = [];
    const ident: Affine = { ax: kx, bx: q0.px, ay: ky, by: q0.py };
    for (let p = 0; p <= np; p++) {
      let A = ident, g = az && !scaleMarks ? base : kx, c: number[] | null = null;
      const a = az && p > 0 ? ws.azPanels.filter((q) => q.p.name === dl.panels[p - 1])[0] : null;
      if (a) {
        const t = ws.fx.azT(a);
        A = { ax: kx * t.sx, bx: kx * t.tx + q0.px, ay: ky * t.sy, by: ky * t.ty + q0.py };
        g = scaleMarks ? base * Math.min(t.sx, t.sy) : base;
        c = [kx * a.p.px0 + q0.px, ky * a.p.py0 + q0.py, kx * a.p.px1 + q0.px, ky * a.p.py1 + q0.py];
      }
      aff.push(A); gs.push(g); pclip.push(c);
      let k = false;
      if (a && !scaleMarks) { const t = ws.fx.azT(a); k = Math.abs(t.sx - 1) > 1e-9 || Math.abs(t.sy - 1) > 1e-9; }
      cst.push(k);
    }
    return { aff: aff, gs: gs, pclip: pclip, base: az ? base : kx, cst: cst, kx: kx, ky: ky };
  }

  // Paint every unflagged record onto `ctx` (W x H backing px) through layout
  // `L`, with the per-key style state when `styled`. Shared by the on-screen
  // canvas and the export image.
  //
  // A run with a blend mode (VW-32) is drawn on a fresh layer from `sink`
  // composited with that mode, and the records after it on another fresh
  // layer composited normally. Without a sink it is drawn onto `ctx` with the
  // mode as its composite operation (it then blends with `ctx` alone).
  function paintList(ctx0: CanvasRenderingContext2D, dl: DisplayList, W: number, H: number, L: ListLayout, styled: boolean, sink?: LayerSink): void {
    const aff = L.aff, gs = L.gs, pclip = L.pclip, base = L.base, np = dl.panels.length;
    let ctx = ctx0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const flags = styled ? ws.msFlags! : null, recol = styled ? ws.msColor! : null, pal = ws.msPalette;
    const dimA = ws.msDimAlpha, am = styled ? ws.msAlpha : null, apal = ws.msAlphaPal;
    // Opacity groups (display list v2, VW-23): a group's records are drawn
    // into a layer of their own, composited onto its parent at the group's
    // alpha when the group ends, as the engine composites an isolated group.
    // `tgt` is where records currently draw: the canvas or the open layer.
    let tgt = ctx;
    const open_: { g: number; c: HTMLCanvasElement; x: CanvasRenderingContext2D }[] = [];
    // The current paint's fill/stroke (with a condition colour standing in).
    let curFill: string | null = null, curStroke: string | null = null, curGrad = 0;
    let curState = -1, curPaint = -1, curOv = 0, curAlpha = 1, open = false, batch = false;
    let curA: Affine = aff[0];
    const flush = function (): void {
      if (!open) return;
      const pt = dl.paints[curPaint];
      if (curGrad > 0) fillGradient(tgt, dl.gradients[curGrad - 1], curA, "nonzero");
      else if (curFill) { tgt.fillStyle = curFill; tgt.fill(); }
      if (curStroke && pt.width > 0) tgt.stroke();
      open = false;
    };
    const setPaint = function (pi: number, ov: number): void {
      const pt = dl.paints[pi];
      tgt.lineWidth = pt.width * base;
      tgt.setLineDash(pt.dash ? pt.dash.map((d) => d * base) : []);
      tgt.lineCap = pt.cap;
      tgt.lineJoin = pt.join;
      const oc = ov ? pal[ov - 1] : null;
      // A condition colour replaces a gradient fill outright.
      curGrad = pt.grad > 0 && !oc ? pt.grad : 0;
      curFill = pt.grad > 0 ? (oc || null) : pt.fill && oc ? withAlphaOf(oc, pt.fill) : pt.fill;
      curStroke = pt.stroke && oc ? withAlphaOf(oc, pt.stroke) : pt.stroke;
      if (curStroke) tgt.strokeStyle = curStroke;
    };
    // Close layers down to the first `keep`, compositing each onto its parent.
    const closeTo = function (keep: number): void {
      while (open_.length > keep) {
        const lay = open_.pop()!;
        const dst = open_.length ? open_[open_.length - 1].x : ctx;
        dst.save();
        dst.setTransform(1, 0, 0, 1, 0, 0);
        dst.globalAlpha = dl.groups[lay.g - 1].alpha;
        dst.drawImage(lay.c, 0, 0);
        dst.restore();
        layerPool.push(lay.c);
      }
    };
    // Make record group `g`'s chain of layers the open one.
    const enterGroup = function (g: number): void {
      const want: number[] = [];
      for (let q = g; q > 0 && want.length < 64; q = dl.groups[q - 1] ? dl.groups[q - 1].parent : 0) want.unshift(q);
      let k = 0;
      while (k < open_.length && k < want.length && open_[k].g === want[k]) k++;
      if (k === open_.length && k === want.length) return;
      flush();
      tgt.restore();
      closeTo(k);
      while (open_.length < want.length) {
        const c = layerPool.pop() || document.createElement("canvas");
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
        const x = typeof c.getContext === "function" ? c.getContext("2d") : null;
        if (!x) break; // no layer: draw into the parent (alpha lost), as before
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, W, H);
        open_.push({ g: want[open_.length], c: c, x: x });
      }
      tgt = open_.length ? open_[open_.length - 1].x : ctx;
      tgt.save();
      curState = -1; curPaint = -1; curAlpha = 1; tgt.globalAlpha = 1;
    };
    // A flagged run (VW-30) as its raster, in the scene px frame, through
    // the transform of each panel holding its marks and clipped to the
    // panel's fixed rect (as the mark image's <use> in each pan group), or
    // once through the view's. Under axis zoom, the run's marks in a panel
    // without a transform of its own (no axis-zoom entry, or no panel) are
    // drawn untransformed, as the exact records there are, clipped to their
    // boxes so the image's other panels don't show through twice (VW-34).
    const runImgs = dl.runImgs;
    const drawnRun: boolean[] = [];
    const runPanels: Record<number, boolean>[] = [];
    const runLoose: number[][] = [];
    const anyPclip = pclip.some((c) => !!c);
    if (runImgs && anyPclip) {
      for (let i = 0; i < dl.n; i++) {
        const r = dl.run[i];
        if (!(r > 0)) continue;
        const p = dl.panel[i] <= np ? dl.panel[i] : 0;
        if (pclip[p]) (runPanels[r] = runPanels[r] || {})[p] = true;
        else (runLoose[r] = runLoose[r] || []).push(dl.bx0[i], dl.by0[i], dl.bx1[i], dl.by1[i]);
      }
    }
    // The image holds every panel's part of the run: in panel p it is
    // clipped to the panel's fixed rect and to the panel's own area mapped
    // through its transform, so a pan past the panel's data does not bring
    // a neighbouring panel's part into view (VW-36). Null when they don't meet.
    const ownClip = function (p: number): number[] | null {
      const pc = pclip[p], A = aff[p];
      const nm = dl.panels[p - 1];
      const pn = ws.panels.filter((q) => q.name === nm)[0];
      if (!pc || !pn) return pc;
      const x0 = Math.max(pc[0], Math.min(A.ax * pn.px0 + A.bx, A.ax * pn.px1 + A.bx));
      const x1 = Math.min(pc[2], Math.max(A.ax * pn.px0 + A.bx, A.ax * pn.px1 + A.bx));
      const y0 = Math.max(pc[1], Math.min(A.ay * pn.py0 + A.by, A.ay * pn.py1 + A.by));
      const y1 = Math.min(pc[3], Math.max(A.ay * pn.py0 + A.by, A.ay * pn.py1 + A.by));
      return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
    };
    let op = ""; // a blend mode drawn straight onto ctx (no sink)
    // Run r's PNG through A, after `clip` (which also sets the composite
    // operation) -- or, with a patch (VW-37, runStyle.ts runPatch), the PNG
    // with the patch's boxes cleared (on a scratch layer), then the patch's
    // re-rendered run inside those boxes.
    const paintRun = function (r: number, A: Affine, clip: (x: CanvasRenderingContext2D) => void, patch: RunPatch | null): void {
      const png = dl.runImgs![r - 1];
      if (!png) return;
      if (!patch || !patch.cut.length) {
        ctx.save(); clip(ctx); ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by); ctx.drawImage(png, 0, 0, dl.runW, dl.runH); ctx.restore();
        return;
      }
      const cut = patch.cut;
      const lc = layerPool.pop() || document.createElement("canvas");
      if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
      const x = typeof lc.getContext === "function" ? lc.getContext("2d") : null;
      if (x) {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, W, H);
        x.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
        x.drawImage(png, 0, 0, dl.runW, dl.runH);
        for (let q = 0; q < cut.length; q += 4) x.clearRect(cut[q], cut[q + 1], cut[q + 2] - cut[q], cut[q + 3] - cut[q + 1]);
        ctx.save(); clip(ctx); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lc, 0, 0); ctx.restore();
      }
      layerPool.push(lc);
      if (patch.fill) {
        ctx.save(); clip(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        for (let q = 0; q < cut.length; q += 4) {
          ctx.rect(A.ax * cut[q] + A.bx, A.ay * cut[q + 1] + A.by, A.ax * (cut[q + 2] - cut[q]), A.ay * (cut[q + 3] - cut[q + 1]));
        }
        ctx.clip();
        ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
        ctx.drawImage(patch.fill.img, 0, 0, dl.runW, dl.runH);
        ctx.restore();
      }
    };
    // A run taken apart for zoomed panel p (VW-35, runStyle.ts runSplit):
    // the rest of the run scaled through the panel's transform, then each
    // constant-size mark's cell at its anchor (mapped through the transform)
    // with its offsets unscaled, all clipped to `c`.
    const drawSplit = function (r: number, sp: RunSplit, p: number, c: number[]): void {
      const A = aff[p];
      const clipTo = function (x: CanvasRenderingContext2D): void {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.beginPath(); x.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]); x.clip();
        if (op) x.globalCompositeOperation = op as GlobalCompositeOperation;
      };
      if (sp.rest) paintRun(r, A, clipTo, sp.rest);
      ctx.save(); clipTo(ctx);
      const kx = L.kx, ky = L.ky;
      for (let q = 0; q < sp.marks.length; q++) {
        const m = sp.marks[q];
        if (m.p !== p || !m.src) continue;
        const dx = A.ax * m.ax + A.bx + kx * (m.x0 - m.ax), dy = A.ay * m.ay + A.by + ky * (m.y0 - m.ay);
        const dw = kx * (m.x1 - m.x0), dh = ky * (m.y1 - m.y0);
        if (dx > c[2] || dy > c[3] || dx + dw < c[0] || dy + dh < c[1]) continue;
        ctx.drawImage(m.src, m.sx * m.ks, m.sy * m.ks, (m.x1 - m.x0) * m.ks, (m.y1 - m.y0) * m.ks, dx, dy, dw, dh);
      }
      ctx.restore();
    };
    const drawRun = function (r: number): void {
      // its PNG, patched with the state of its marks (VW-37)
      const patch = ws.fx.runPatch(r);
      const one = function (A: Affine, pc: number[] | null, boxes?: number[]): void {
        paintRun(r, A, function (x: CanvasRenderingContext2D): void {
          x.setTransform(1, 0, 0, 1, 0, 0);
          if (pc) { x.beginPath(); x.rect(pc[0], pc[1], pc[2] - pc[0], pc[3] - pc[1]); x.clip(); }
          if (boxes) {
            x.beginPath();
            for (let q = 0; q < boxes.length; q += 4) {
              const x0 = A.ax * (boxes[q] - RUN_BOX_PAD) + A.bx, y0 = A.ay * (boxes[q + 1] - RUN_BOX_PAD) + A.by;
              x.rect(x0, y0, A.ax * (boxes[q + 2] - boxes[q] + 2 * RUN_BOX_PAD), A.ay * (boxes[q + 3] - boxes[q + 1] + 2 * RUN_BOX_PAD));
            }
            x.clip();
          }
          if (op) x.globalCompositeOperation = op as GlobalCompositeOperation;
        }, patch);
      };
      if (!anyPclip) { one(aff[0], null); return; }
      const hosted = runPanels[r];
      if (hosted) {
        for (let p = 1; p <= np; p++) {
          if (!hosted[p]) continue;
          const c = ownClip(p);
          if (!c) continue;
          // a zoomed panel: the run's text and glyphs at constant size (VW-35)
          const sp = L.cst[p] ? ws.fx.runSplit(r) : null;
          if (sp) drawSplit(r, sp, p, c); else one(aff[p], c);
        }
      }
      if (runLoose[r]) one(aff[0], null, runLoose[r]);
    };
    let curGroup = 0;
    tgt.save();
    // Selected marks after the rest of their segment (VW-53, raise.ts).
    const ord = ws.fx.raiseOrder(dl);
    for (let q = 0; q < dl.n; q++) {
      const i = ord ? ord[q] : q;
      if (runImgs && dl.run[i] > 0) {
        // The run's records are all in its image, drawn where the run starts.
        // The image carries its own groups (a run takes whole opacity groups),
        // so it goes onto the canvas itself, after closing any open layer.
        const r = dl.run[i];
        if (!drawnRun[r]) {
          drawnRun[r] = true;
          if (curGroup !== 0) { enterGroup(0); curGroup = 0; }
          flush();
          tgt.restore();
          const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
          const lay = mode !== "normal" && sink ? sink.next(mode) : null;
          if (lay) {
            // the run alone on its blend layer, then a normal layer for what follows
            ctx = lay;
            drawRun(r);
            ctx = sink!.next("normal") || lay;
            tgt = ctx;
          } else {
            op = mode !== "normal" ? mode : "";
            drawRun(r);
            op = "";
          }
          tgt.save();
          curState = -1; curPaint = -1; curAlpha = 1; tgt.globalAlpha = 1;
        }
        continue;
      }
      if (dl.flags[i]) continue; // not reproducible here: the image draws it
      let ov = 0, alpha = 1;
      if (flags) {
        const k = dl.key[i], f = flags[k];
        if (f & MS_HIDDEN) continue;
        // As the CSS: a condition's dim wins over the legend mute.
        // An alpha condition's own opacity, else the theme dim (VW-52).
        if (f & MS_DIM) alpha = am && am[k] ? apal[am[k] - 1] : dimA;
        else if (f & MS_MUTED) alpha = MUTED_ALPHA;
        ov = recol![k];
      }
      const p = dl.panel[i] <= np ? dl.panel[i] : 0;
      const A = aff[p];
      // Cull: the record's box on the canvas, against the canvas and panel.
      let x0 = A.ax * dl.bx0[i] + A.bx, x1 = A.ax * dl.bx1[i] + A.bx;
      let y0 = A.ay * dl.by0[i] + A.by, y1 = A.ay * dl.by1[i] + A.by;
      const kd = dl.kind[i];
      if (kd === DL_POINT) {
        const j = dl.row[i], cx = A.ax * dl.cx[j] + A.bx, cy = A.ay * dl.cy[j] + A.by, rr = dl.r[j] * gs[p];
        x0 = cx - rr; x1 = cx + rr; y0 = cy - rr; y1 = cy + rr;
      }
      const pc = pclip[p];
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      if (pc && (x1 < pc[0] || x0 > pc[2] || y1 < pc[1] || y0 > pc[3])) continue;
      if (dl.group[i] !== curGroup) { enterGroup(dl.group[i]); curGroup = dl.group[i]; }
      // Clip state: the panel's fixed rect and the record's own clip (its
      // rect, and with list v2 its clip paths).
      const st = p * 65536 + dl.clip[i];
      if (st !== curState) {
        flush();
        tgt.restore(); tgt.save();
        if (pc) { tgt.beginPath(); tgt.rect(pc[0], pc[1], pc[2] - pc[0], pc[3] - pc[1]); tgt.clip(); }
        const cr = dl.clip[i] > 0 ? dl.clips[dl.clip[i] - 1] : null;
        if (cr) {
          const cx0 = A.ax * cr.x0 + A.bx, cy0 = A.ay * cr.y0 + A.by;
          tgt.beginPath(); tgt.rect(cx0, cy0, A.ax * (cr.x1 - cr.x0), A.ay * (cr.y1 - cr.y0)); tgt.clip();
          for (let q = 0; q < cr.pn; q++) {
            tgt.beginPath();
            traceClipPath(tgt, dl, cr.ps + q, A);
            tgt.clip(dl.cpEvenodd[cr.ps + q] === 1 ? "evenodd" : "nonzero");
          }
        }
        curState = st; curPaint = -1; curAlpha = 1; tgt.globalAlpha = 1;
      }
      const pi = dl.paint[i], pt = dl.paints[pi];
      // Batch only what composites identically when merged into one path: an
      // opaque paint whose fill and stroke cannot overlap differently.
      // A condition colour paints fill and stroke alike; a dimmed mark is
      // drawn alone so overlapping dimmed marks compound as SVG nodes do. A
      // gradient is placed per record, so never batched.
      const canBatch = kd !== 2 && !pt.grad && pt.opaque && alpha === 1 && (ov ? isOpaqueHex(pal[ov - 1]) : (!pt.fill || !pt.stroke || pt.fill === pt.stroke));
      if (!(open && batch && canBatch && pi === curPaint && ov === curOv)) {
        flush();
        if (pi !== curPaint || ov !== curOv) { setPaint(pi, ov); curPaint = pi; curOv = ov; }
        if (alpha !== curAlpha) { tgt.globalAlpha = alpha; curAlpha = alpha; }
        tgt.beginPath();
        open = true;
        batch = canBatch;
      }
      curA = A;
      if (kd === DL_POINT) {
        const j = dl.row[i], sh = dl.shape[j];
        tracePoint(tgt, sh, A.ax * dl.cx[j] + A.bx, A.ay * dl.cy[j] + A.by, dl.r[j] * gs[p]);
      } else if (kd === DL_RECT) {
        traceShape(tgt, dl, i, A);
      } else {
        traceShape(tgt, dl, i, A);
        if (dl.closed[dl.row[i]] === 1) {
          const rule: CanvasFillRule = dl.evenodd[dl.row[i]] === 1 ? "evenodd" : "nonzero";
          if (curGrad > 0) fillGradient(tgt, dl.gradients[curGrad - 1], A, rule);
          else if (curFill) { tgt.fillStyle = curFill; tgt.fill(rule); }
        }
        if (curStroke && pt.width > 0) tgt.stroke();
        open = false;
      }
      if (!batch) flush();
    }
    flush();
    tgt.restore();
    if (open_.length) closeTo(0);
    ctx.globalAlpha = 1;
  }
  const layerPool: HTMLCanvasElement[] = [];
  // Hands paintList a fresh, cleared W x H layer stacked over the previous
  // one, composited with `mode` ("normal" or a CSS blend mode), or null.
  interface LayerSink { next: (mode: string) => CanvasRenderingContext2D | null }

  // The marks as currently drawn, for export (VW-25): the display list
  // redrawn at export resolution over the svg's current frame, with the
  // per-key state (condition colours, dimming, filters, legend hide/mute),
  // as a PNG data URI and the frame rect it covers. `scale` is output px per
  // scene px (at least 2, capped so a big export stays within ~32 Mpx). Null
  // when the list can't stand in for the mark image (no list, or flagged
  // records that exist only in the image) or there is no 2D canvas: the
  // exporter then keeps the mark PNG.
  //
  // With blend runs (VW-32) the redraw is split into stacked images like the
  // screen's canvases: `href` holds the marks up to the first blend run, and
  // `layers` the rest in order, each with its blend mode, for the exporter to
  // stack with mix-blend-mode.
  function exportMarksImage(scale: number): { href: string; x: number; y: number; w: number; h: number; layers?: { href: string; blend: string }[] } | null {
    const dl = ws.dl;
    if (!ws.rasterMode || !dl || !dl.exact || !ws.vb || !ws.vb0) return null;
    const vb0 = ws.vb0;
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const frame = az ? vb0 : ws.vb;
    let s = Math.max(2, scale || 1);
    const MAX_PX = 32e6;
    if (vb0.w * vb0.h * s * s > MAX_PX) s = Math.sqrt(MAX_PX / (vb0.w * vb0.h));
    const W = Math.max(1, Math.round(vb0.w * s)), H = Math.max(1, Math.round(vb0.h * s));
    const c = document.createElement("canvas");
    const ctx = typeof c.getContext === "function" ? c.getContext("2d") : null;
    if (!ctx) return null;
    c.width = W; c.height = H;
    const styled = ws.msActive && !!ws.msFlags && !!ws.msColor;
    const extra: { c: HTMLCanvasElement; blend: string }[] = [];
    let failed = false;
    const sink: LayerSink | undefined = dl.blendRuns && dl.runImgs ? {
      next: function (mode: string): CanvasRenderingContext2D | null {
        const lc = document.createElement("canvas");
        const lx = typeof lc.getContext === "function" ? lc.getContext("2d") : null;
        if (!lx) { failed = true; return null; }
        lc.width = W; lc.height = H;
        lx.setTransform(1, 0, 0, 1, 0, 0);
        lx.clearRect(0, 0, W, H);
        extra.push({ c: lc, blend: mode });
        return lx;
      }
    } : undefined;
    if (dl.n) paintList(ctx, dl, W, H, listLayout(dl, W, H), styled, sink);
    if (failed) return null;
    const url = function (cv: HTMLCanvasElement): string | null {
      let h = "";
      try { h = cv.toDataURL("image/png"); } catch (e) { return null; }
      return /^data:image\/png/.test(h || "") ? h : null;
    };
    const href = url(c);
    if (!href) return null;
    const out: { href: string; x: number; y: number; w: number; h: number; layers?: { href: string; blend: string }[] } =
      { href: href, x: frame.x, y: frame.y, w: frame.w, h: frame.h };
    if (extra.length) {
      out.layers = [];
      for (let k = 0; k < extra.length; k++) {
        const h = url(extra[k].c);
        if (!h) return null;
        out.layers.push({ href: h, blend: extra[k].blend });
      }
    }
    return out;
  }

  // A condition colour carries the alpha of the paint it replaces, as the
  // SVG mode's inline fill keeps a node's fill-opacity.
  function withAlphaOf(c: string, ref: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(c) && /^#[0-9a-fA-F]{8}$/.test(ref)) {
      const a = ref.slice(7, 9).toLowerCase();
      return a === "ff" ? c : c + a;
    }
    return c;
  }

  function isOpaqueHex(c: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(c) || (/^#[0-9a-fA-F]{8}$/.test(c) && /ff$/i.test(c));
  }

  // Show or hide the split render's mark-layer image (all its panel copies).
  function showMarksLayer(on: boolean): void {
    if (!ws.svgEl || !ws.marksLayer) return;
    // Inline on each drawn copy (the <use>s, or the root image), so the
    // shared image definition is never styled and an export clone can simply
    // clear it. The svg class only records the state.
    ws.svgEl.classList.toggle("vellumwidget-marks-off", !on);
    const drawn = ws.svgEl.querySelectorAll("use.vellumwidget-marks, svg > image.vellumwidget-marks");
    for (let i = 0; i < drawn.length; i++) (drawn[i] as SVGElement).style.visibility = on ? "" : "hidden";
  }

  // A ring marking element `k`'s bbox, or null if it has no geometry. Drawn in the
  // overlay's viewBox space; `non-scaling-stroke` keeps it crisp under zoom.
  // A constant-size mark under axis zoom (VW-42) is ringed where it is drawn,
  // at its pixel size: an ellipse whose radii undo the panel's scale, so it is
  // a circle of the 1x radius on screen.
  function ringFor(k: string, cls: string): SVGElement | null {
    const m = ws.meta[k];
    if (!m || !hasBbox(m)) return null;
    const cb = ws.fx.constBox(m);
    const b = cb || m;
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
    let c: SVGElement;
    if (cb) {
      c = document.createElementNS(SVGNS, "ellipse") as SVGElement;
      c.setAttribute("rx", String(r / cb.sx));
      c.setAttribute("ry", String(r / cb.sy));
    } else {
      c = document.createElementNS(SVGNS, "circle") as SVGElement;
      c.setAttribute("r", String(r));
    }
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("class", cls);
    c.setAttribute("vector-effect", "non-scaling-stroke");
    return c;
  }

  // The clip that keeps a ring inside its mark's panel under axis zoom
  // (VW-48), as the panel's clip keeps the mark: the panel's fixed rect taken
  // back through T to the ring's own (scene) coordinates, which a ring has
  // both under the single-panel overlay viewBox and inside azOverlayWrap's
  // per-panel transform. One <clipPath> per panel per redraw, kept in `g`
  // (`made`: panel index -> its url). Null when nothing zooms by axis.
  function ringClip(g: SVGGElement, k: string, made: Record<number, string>): string | null {
    if (!ws.axisZoomActive) return null;
    const m = ws.meta[k];
    if (!m || !hasBbox(m)) return null;
    const a = ws.fx.azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
    if (!a) return null;
    const i = ws.azPanels.indexOf(a);
    if (made[i]) return made[i];
    const t = ws.fx.azT(a), p = a.p;
    if (!(t.sx > 0) || !(t.sy > 0)) return null;
    const id = "vw-ring-" + (++ringClipSeq);
    const cp = document.createElementNS(SVGNS, "clipPath");
    cp.setAttribute("id", id);
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const rc = document.createElementNS(SVGNS, "rect");
    rc.setAttribute("x", String((p.px0 - t.tx) / t.sx));
    rc.setAttribute("y", String((p.py0 - t.ty) / t.sy));
    rc.setAttribute("width", String((p.px1 - p.px0) / t.sx));
    rc.setAttribute("height", String((p.py1 - p.py0) / t.sy));
    cp.appendChild(rc);
    g.appendChild(cp);
    return (made[i] = "url(#" + id + ")");
  }

  // Rings for `keys` into `g`, each clipped to its panel (VW-48).
  function drawRings(g: SVGGElement, keys: string[], cls: string): void {
    const made: Record<number, string> = {};
    for (let i = 0; i < keys.length; i++) {
      const c = ringFor(keys[i], cls);
      if (!c) continue;
      const cl = ringClip(g, keys[i], made);
      if (cl) c.setAttribute("clip-path", cl);
      g.appendChild(ws.fx.azOverlayWrap(c, keys[i]));
    }
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
    drawRings(ws.selGroup, keys, "vellumwidget-fb-sel");
  }

  function drawHovFeedback(keys: string[]): void {
    clearGroup(ws.hovGroup);
    if (!ws.hovGroup) return;
    drawRings(ws.hovGroup, keys, "vellumwidget-fb-hov");
  }

  // Highlight an explicit set of keys (the shared path for closest-mark hover,
  // where keys = the mark's linked group, and unified hover, where keys = the
  // whole x-/y-column).
  function setHoverKeys(keys: string[]): void {
    ws.hoverSig = ""; // the pointer fast path must redraw after any other hover
    if (!ws.opts.hover) return;
    ws.hovering = true;
    // Raster mode: no per-element nodes — draw a hover ring on the overlay
    // (except in the detail tier, whose visible marks are real nodes).
    if (ws.fx.ringMode()) {
      drawHovFeedback(keys);
      // A hover-driven condition/filter still reacts, on the canvas (VW-22).
      if (ws.dl && hoverDriven()) { ws.lastHoverKeys = keys; ws.fx.reevaluateInteractions(); }
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

  // Whether a condition or filter reads a hover selection.
  function hoverDriven(): boolean {
    const ix = ws.interactions;
    if (!ix || !ix.selections) return false;
    const used: Record<string, boolean> = {};
    (ix.conditions || []).forEach((c) => (used[c.selection] = true));
    (ix.filters || []).forEach((f) => (used[f.selection] = true));
    return ix.selections.some((s) => s.on === "hover" && used[s.name]);
  }

  function setHover(k: string): void {
    setHoverKeys(ws.fx.linkedKeys(k));
  }

  return { ensureCanvas, clearPointData, sampleBaseRaster, drawPoints, clearGroup, drawSelFeedback, setHoverKeys, setHover, showMarksLayer, exportMarksImage, hideCanvas, glState };
}
