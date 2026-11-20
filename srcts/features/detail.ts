// The detail tier (VW-16): when a raster-mode view is zoomed in until only a
// few thousand marks are visible, the visible marks become real keyed SVG nodes
// (built from the display list, inside each panel's pan group), so hover,
// selection, conditions, filters and keyboard focus work exactly as in SVG
// mode. Zooming back out past the exit threshold returns to the canvas.
//
// Three tiers (ws.markTier): "overview" (the mark PNG), "mid" (the exact
// canvas, VW-15) and "detail" (SVG nodes). The swap happens when the view
// settles (SETTLE_MS without a view change), never per wheel tick, and with
// hysteresis: enter below `detailMarks` visible marks, leave above 1.5x that.

import { SETTLE_MS, SVGNS } from "./constants";
import { DL_POINT, DL_RECT, isLineGlyph, markerRing } from "../dlist";
import type { DisplayList } from "../dlist";
import { cssEscape } from "../css";
import type { WidgetFns, WidgetState } from "../state";
import { isZoomedIn } from "../viewbox";

export const DETAIL_DEFAULT = 3000;

export function detailFeature(
  ws: WidgetState
): Pick<WidgetFns, "scheduleTier" | "evalTier" | "ringMode" | "leaveDetail"> {
  let timer = 0;

  // Raster feedback by rings (no nodes to style) -- every raster tier but detail.
  function ringMode(): boolean {
    return ws.rasterMode && ws.markTier !== "detail";
  }

  function enterAt(): number {
    const v = ws.opts.detailMarks;
    return v == null ? DETAIL_DEFAULT : v;
  }

  function scheduleTier(): void {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!ws.rasterMode || !ws.dl) return;
    timer = window.setTimeout(function () { timer = 0; evalTier(); }, SETTLE_MS);
  }

  function zoomed(): boolean {
    if (!ws.vb || !ws.vb0) return false;
    if (ws.axisZoomActive && ws.azPanels.length) {
      return ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx > 1.0001 || t.sy > 1.0001; });
    }
    return isZoomedIn(ws.vb, ws.vb0);
  }

  // The records whose centre is in view, in paint order, or null when there
  // are more than `cap`. Under axis zoom a record is in view when its centre,
  // moved by its panel's T, lands inside that panel's fixed rect.
  function visibleRecords(dl: DisplayList, cap: number): number[] | null {
    const out: number[] = [];
    const np = dl.panels.length;
    const T: ({ sx: number; sy: number; tx: number; ty: number; r: number[] } | null)[] = [null];
    for (let p = 1; p <= np; p++) {
      const a = ws.axisZoomActive ? ws.azPanels.filter((q) => q.p.name === dl.panels[p - 1])[0] : null;
      if (a) {
        const t = ws.fx.azT(a);
        T.push({ sx: t.sx, sy: t.sy, tx: t.tx, ty: t.ty, r: [a.p.px0, a.p.py0, a.p.px1, a.p.py1] });
      } else T.push(null);
    }
    const vb = ws.vb!;
    for (let i = 0; i < dl.n; i++) {
      let x = (dl.bx0[i] + dl.bx1[i]) / 2, y = (dl.by0[i] + dl.by1[i]) / 2;
      const t = dl.panel[i] <= np ? T[dl.panel[i]] : null;
      if (t) {
        x = t.sx * x + t.tx; y = t.sy * y + t.ty;
        if (x < t.r[0] || x > t.r[2] || y < t.r[1] || y > t.r[3]) continue;
      } else if (ws.axisZoomActive) {
        if (x < ws.vb0!.x || x > ws.vb0!.x + ws.vb0!.w || y < ws.vb0!.y || y > ws.vb0!.y + ws.vb0!.h) continue;
      } else if (x < vb.x || x > vb.x + vb.w || y < vb.y || y > vb.y + vb.h) continue;
      out.push(i);
      if (out.length > cap) return null;
    }
    return out;
  }

  // Decide the tier for the settled view, and (re)build the detail nodes.
  function evalTier(): void {
    const dl = ws.dl;
    const enter = enterAt();
    if (!ws.rasterMode || !dl || !dl.exact || !(enter > 0) || !ws.svgEl) {
      if (ws.markTier === "detail") leaveDetail();
      if (ws.rasterMode) ws.markTier = zoomed() ? "mid" : "overview";
      return;
    }
    if (!zoomed()) {
      if (ws.markTier === "detail") leaveDetail();
      ws.markTier = "overview";
      return;
    }
    const exit = Math.round(enter * 1.5);
    const vis = visibleRecords(dl, ws.markTier === "detail" ? exit : enter - 1);
    if (vis == null) {
      if (ws.markTier === "detail") leaveDetail();
      ws.markTier = "mid";
      return;
    }
    buildDetail(dl, vis); // entering, or a pan/zoom within detail: rebuild for the new view
  }

  // A hex colour with alpha ("#rrggbbaa") as [rgb, opacity].
  function splitHex(c: string): [string, string | null] {
    if (/^#[0-9a-fA-F]{8}$/.test(c)) {
      const a = parseInt(c.slice(7, 9), 16) / 255;
      return [c.slice(0, 7), a >= 1 ? null : String(Math.round(a * 1000) / 1000)];
    }
    return [c, null];
  }

  // One record as an SVG node in scene (device px) coordinates.
  function nodeFor(dl: DisplayList, i: number): SVGElement {
    const j = dl.row[i], kd = dl.kind[i];
    let n: SVGElement;
    let glyph = false;
    if (kd === DL_POINT) {
      const sh = dl.shape[j], cx = dl.cx[j], cy = dl.cy[j], r = dl.r[j];
      glyph = true;
      if (sh === 0 || (!isLineGlyph(sh) && !markerRing(sh))) {
        n = document.createElementNS(SVGNS, "circle") as SVGElement;
        n.setAttribute("cx", String(cx)); n.setAttribute("cy", String(cy)); n.setAttribute("r", String(r));
      } else {
        n = document.createElementNS(SVGNS, "path") as SVGElement;
        let d = "";
        if (sh === 4) d = "M" + cx + " " + (cy - r) + "V" + (cy + r) + "M" + (cx - r) + " " + cy + "H" + (cx + r);
        else if (sh === 5) {
          const q = r * Math.SQRT1_2;
          d = "M" + (cx - q) + " " + (cy - q) + "L" + (cx + q) + " " + (cy + q) + "M" + (cx - q) + " " + (cy + q) + "L" + (cx + q) + " " + (cy - q);
        } else {
          const m = markerRing(sh)!;
          for (let k = 0; k < m.length; k += 2) d += (k ? "L" : "M") + (cx + m[k] * r) + " " + (cy + m[k + 1] * r);
          d += "Z";
        }
        n.setAttribute("d", d);
      }
    } else if (kd === DL_RECT) {
      n = document.createElementNS(SVGNS, "rect") as SVGElement;
      const x = dl.rx[j], y = dl.ry[j], w = dl.rw[j], h = dl.rh[j];
      n.setAttribute("x", String(Math.min(x, x + w))); n.setAttribute("y", String(Math.min(y, y + h)));
      n.setAttribute("width", String(Math.abs(w))); n.setAttribute("height", String(Math.abs(h)));
    } else {
      n = document.createElementNS(SVGNS, "path") as SVGElement;
      let d = "";
      const closed = dl.closed[j] === 1;
      for (let run = dl.pathOff[j]; run < dl.pathOff[j + 1]; run++) {
        for (let v = dl.runOff[run]; v < dl.runOff[run + 1]; v++) {
          d += (v === dl.runOff[run] ? "M" : "L") + dl.xy[2 * v] + " " + dl.xy[2 * v + 1];
        }
        if (closed) d += "Z";
      }
      n.setAttribute("d", d);
      if (dl.evenodd[j] === 1) n.setAttribute("fill-rule", "evenodd");
    }
    const pt = dl.paints[dl.paint[i]];
    const fillable = kd !== 2 || dl.closed[j] === 1;
    if (pt.fill && fillable && !(kd === DL_POINT && isLineGlyph(dl.shape[j]))) {
      const f = splitHex(pt.fill);
      n.setAttribute("fill", f[0]);
      if (f[1] != null) n.setAttribute("fill-opacity", f[1]);
    } else n.setAttribute("fill", "none");
    if (pt.stroke && pt.width > 0) {
      const s = splitHex(pt.stroke);
      n.setAttribute("stroke", s[0]);
      if (s[1] != null) n.setAttribute("stroke-opacity", s[1]);
      n.setAttribute("stroke-width", String(pt.width));
      if (pt.dash) n.setAttribute("stroke-dasharray", pt.dash.join(" "));
      n.setAttribute("stroke-linecap", pt.cap);
      n.setAttribute("stroke-linejoin", pt.join);
    }
    n.setAttribute("data-key", dl.keys[dl.key[i]]);
    // Constant glyph size and stroke width under axis zoom, as setupConstantMarks
    // does for the SVG mode's marks.
    if (ws.axisZoomActive) {
      if (glyph && ws.opts.zoomMarks !== "scale") {
        n.style.setProperty("transform-box", "fill-box");
        n.style.setProperty("transform-origin", "center");
        n.style.setProperty("transform", "scale(var(--vw-ix,1),var(--vw-iy,1))");
      } else n.setAttribute("vector-effect", "non-scaling-stroke");
    }
    return n;
  }

  // Remove this render's detail nodes (and their key index entries).
  function dropNodes(): void {
    for (let i = 0; i < ws.detailGroups.length; i++) ws.detailGroups[i].remove();
    ws.detailGroups = [];
    for (let i = 0; i < ws.detailKeys.length; i++) {
      const k = ws.detailKeys[i], nodes = ws.nodesByKey[k];
      if (!nodes) continue;
      const keep = nodes.filter((n) => !(n as Element).closest || !(n as Element).closest(".vellumwidget-detail"));
      if (keep.length) ws.nodesByKey[k] = keep; else delete ws.nodesByKey[k];
    }
    ws.detailKeys = [];
  }

  function buildDetail(dl: DisplayList, vis: number[]): void {
    const svg = ws.svgEl!;
    dropNodes();
    // One group per panel pan group (or the svg itself for a panel without
    // one), appended after the mark image so the nodes draw where it did.
    const groups: Record<number, SVGGElement> = {};
    const groupFor = function (p: number): SVGGElement {
      if (groups[p]) return groups[p];
      const g = document.createElementNS(SVGNS, "g") as SVGGElement;
      g.setAttribute("class", "vellumwidget-detail");
      const name = p > 0 ? dl.panels[p - 1] : null;
      const host = (name && svg.querySelector('[data-vellum-pan="' + cssEscape(name) + '"]')) || svg;
      host.appendChild(g);
      ws.detailGroups.push(g);
      groups[p] = g;
      return g;
    };
    const seen: Record<string, boolean> = {};
    for (let v = 0; v < vis.length; v++) {
      const i = vis[v];
      const n = nodeFor(dl, i);
      groupFor(dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0).appendChild(n);
      const k = dl.keys[dl.key[i]];
      (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(n);
      if (!seen[k]) { seen[k] = true; ws.detailKeys.push(k); }
    }
    const was = ws.markTier;
    ws.markTier = "detail";
    ws.calib = null;
    ws.hoverSig = "";
    // The nodes replace the image and the canvas.
    if (ws.canvasEl) ws.canvasEl.style.display = "none";
    ws.fx.showMarksLayer(false);
    ws.fx.clearGroup(ws.selGroup);
    ws.fx.clearGroup(ws.hovGroup);
    // Re-apply the keyed state to the new nodes.
    ws.fx.refreshSelected(); // selection classes + conditions/filters (reevaluateInteractions)
    ws.fx.applyLegend();
    for (let i = 0; i < ws.detailKeys.length; i++) {
      if (ws.filteredKeySet[ws.detailKeys[i]]) ws.fx.addClassForKeys([ws.detailKeys[i]], "vellumwidget-filtered");
    }
    if (ws.hovering && ws.lastHoverKeys.length) ws.fx.addClassForKeys(ws.lastHoverKeys, "vellumwidget-hl");
    ws.fx.setupA11y();
    if (was !== "detail") ws.fx.announce(ws.detailKeys.length + " marks in view");
  }

  function leaveDetail(): void {
    if (ws.markTier !== "detail") return;
    dropNodes();
    ws.markTier = "mid";
    ws.calib = null;
    ws.hoverSig = "";
    ws.el.classList.remove("vellumwidget-hovering");
    ws.fx.refreshSelected(); // back to rings
    ws.fx.setupA11y();
    ws.fx.showMarksLayer(true); // the image is back, unless the canvas below covers it
    ws.fx.drawPoints(); // the canvas (or the image) takes over again
  }

  return { scheduleTier, evalTier, ringMode, leaveDetail };
}
