// Raster mode: the crisp-zoom canvas point layer and the overlay rings that
// stand in for per-node selection / hover classes.

import { LIVE_DRAW_MAX, OVERLAY_MARK_CAP, SETTLE_MS, SVGNS } from "./constants";
import { hasBbox, isRoundMark } from "../geometry";
import { DL_POINT, DL_RECT, fillGradient, traceClipPath, tracePoint, traceShape } from "../dlist";
import { MS_DIM, MS_HIDDEN, MS_MUTED, MUTED_ALPHA } from "./markState";
import type { Affine, DisplayList } from "../dlist";
import type { WidgetFns, WidgetState } from "../state";
import { isZoomedIn, userToCanvas } from "../viewbox";

export function rasterFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "ensureCanvas" | "clearPointData" | "sampleBaseRaster" | "drawPoints" | "clearGroup"
  | "drawSelFeedback" | "setHoverKeys" | "setHover" | "showMarksLayer" | "exportMarksImage"
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
  // `stateOnly`: only the marks' style state changed (VW-22), not the view.
  function drawPoints(stateOnly?: boolean): void {
    if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
    if (ws.dl) {
      // The detail tier's SVG nodes stand in for the canvas and the image.
      if (ws.markTier === "detail") { ws.canvasEl.style.display = "none"; showMarksLayer(false); return; }
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
  let settleTimer = 0;
  function drawList(dl: DisplayList, settled?: boolean, stateOnly?: boolean): void {
    const ctx = ws.ctx!, vb = ws.vb!, vb0 = ws.vb0!;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const zoomed = az
      ? ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx > 1.0001 || t.sy > 1.0001; })
      : isZoomedIn(vb, vb0);
    const styled = ws.msActive && !!ws.msFlags && !!ws.msColor;
    if (!(zoomed || (styled && dl.exact)) || !dl.n) {
      ws.canvasEl!.style.display = "none";
      showMarksLayer(true);
      return;
    }
    const wasShown = ws.canvasEl!.style.display === "block";
    const [W, H] = fitCanvas();
    const L = listLayout(dl, W, H);
    // Too many marks in view to redraw within a frame: keep the scaled image
    // up while the view is moving and draw once it settles.
    if (!settled && dl.n > LIVE_DRAW_MAX) {
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
          ws.canvasEl!.style.display = "none";
          showMarksLayer(true);
        }
        settleTimer = window.setTimeout(function () { settleTimer = 0; if (ws.dl === dl) { fitCanvas(); drawList(dl, true); } }, SETTLE_MS);
        return;
      }
    }
    // Every mark is redrawn exactly, so the scaled mark image goes; flagged
    // marks (gradients, groups, text) are only in the image, which then stays.
    showMarksLayer(!dl.exact);
    paintList(ctx, dl, W, H, L, styled);
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
  interface ListLayout { aff: Affine[]; gs: number[]; pclip: (number[] | null)[]; base: number; }
  function listLayout(dl: DisplayList, W: number, H: number): ListLayout {
    const vb = ws.vb!, vb0 = ws.vb0!;
    const az = ws.axisZoomActive && ws.azPanels.length > 0;
    const frame = az ? vb0 : vb;
    const q0 = userToCanvas(frame, W, H, 0, 0), q1 = userToCanvas(frame, W, H, 1, 1);
    const kx = q1.px - q0.px, ky = q1.py - q0.py;
    const base = Math.min(W / vb0.w, H / vb0.h); // canvas px per scene px at the full view
    const scaleMarks = ws.opts.zoomMarks === "scale";
    const np = dl.panels.length;
    const aff: Affine[] = [], gs: number[] = [], pclip: (number[] | null)[] = [];
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
    }
    return { aff: aff, gs: gs, pclip: pclip, base: az ? base : kx };
  }

  // Paint every unflagged record onto `ctx` (W x H backing px) through layout
  // `L`, with the per-key style state when `styled`. Shared by the on-screen
  // canvas and the export image.
  function paintList(ctx: CanvasRenderingContext2D, dl: DisplayList, W: number, H: number, L: ListLayout, styled: boolean): void {
    const aff = L.aff, gs = L.gs, pclip = L.pclip, base = L.base, np = dl.panels.length;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const flags = styled ? ws.msFlags! : null, recol = styled ? ws.msColor! : null, pal = ws.msPalette;
    const dimA = ws.msDimAlpha;
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
    let curGroup = 0;
    tgt.save();
    for (let i = 0; i < dl.n; i++) {
      if (dl.flags[i]) continue; // not reproducible here: the image draws it
      let ov = 0, alpha = 1;
      if (flags) {
        const k = dl.key[i], f = flags[k];
        if (f & MS_HIDDEN) continue;
        // As the CSS: a condition's dim wins over the legend mute.
        if (f & MS_DIM) alpha = dimA; else if (f & MS_MUTED) alpha = MUTED_ALPHA;
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

  // The marks as currently drawn, for export (VW-25): the display list
  // redrawn at export resolution over the svg's current frame, with the
  // per-key state (condition colours, dimming, filters, legend hide/mute),
  // as a PNG data URI and the frame rect it covers. `scale` is output px per
  // scene px (at least 2, capped so a big export stays within ~32 Mpx). Null
  // when the list can't stand in for the mark image (no list, or flagged
  // records that exist only in the image) or there is no 2D canvas: the
  // exporter then keeps the mark PNG.
  function exportMarksImage(scale: number): { href: string; x: number; y: number; w: number; h: number } | null {
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
    if (dl.n) paintList(ctx, dl, W, H, listLayout(dl, W, H), styled);
    let href = "";
    try { href = c.toDataURL("image/png"); } catch (e) { return null; }
    if (!/^data:image\/png/.test(href || "")) return null;
    return { href: href, x: frame.x, y: frame.y, w: frame.w, h: frame.h };
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

  return { ensureCanvas, clearPointData, sampleBaseRaster, drawPoints, clearGroup, drawSelFeedback, setHoverKeys, setHover, showMarksLayer, exportMarksImage };
}
