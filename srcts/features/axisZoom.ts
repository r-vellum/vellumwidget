// Axis-aware zoom: per-panel pan transforms, constant-size marks, and the
// client-side re-ticked axes and gridlines.

import { cssEscape } from "../css";
import { SVGNS } from "./constants";
import { GLYPH_MARKS } from "../scales";
import type { WidgetFns, WidgetState } from "../state";
import { axisRetickable, axisTicks, secAxisMap, secTicks } from "../ticks";
import type { AxisAnchor, AzPanel, TickStyle } from "../types";
import { fmtViewBox } from "../viewbox";
import type { PanTransform } from "../viewbox";

export function axisZoomFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "setupAxisZoom" | "applyPanTransforms" | "retick"
> {
  // --- axis-aware zoom (Phase 2, opt-in) ---
  // Decide whether this render can do axis-aware zoom, wire its DOM once, and hide
  // vellum's static axes/gridlines (which would go stale under a zoom that only
  // re-scales the data region). Gated to: opt-in on, SVG (not raster), and every
  // pannable group in the scene backed by a cartesian panel whose x and y axes the
  // re-ticker can follow (linear/sqrt/reverse, log10, date/datetime, or discrete/
  // binned/other with their static breaks). Several panels (facets) zoom together:
  // the first is the reference frame of `vb`, the rest follow by conjugation.
  // Anything else leaves axisZoomActive false and the ordinary viewBox zoom stands.
  function setupAxisZoom(): void {
    for (let i = 0; i < ws.azPanels.length; i++) {
      const g = ws.azPanels[i].grid;
      if (g && g.parentNode) g.parentNode.removeChild(g);
    }
    ws.azPanels = []; ws.panGroup = null; ws.axisZoomActive = false; ws.anchorPanel = null;
    if (ws.retickLayer) { ws.retickLayer.remove(); ws.retickLayer = null; }
    if (!ws.opts.axisZoom || ws.rasterMode || !ws.svgEl || !ws.vb0 || !ws.stage || !ws.panels.length) return;
    for (let i = 0; i < ws.panels.length; i++) {
      if (!axisRetickable(ws.panels[i].x) || !axisRetickable(ws.panels[i].y)) return;
    }
    // A void panel (a graph's aspect-locked layout, or theme_void) has no static
    // axes in the frozen scene. There is nothing to re-tick, and re-ticking would
    // invent axes the render never had; the independent-axis pan transform would
    // also shear an aspect-locked graph. Fall back to plain viewBox zoom.
    if (!ws.svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text')) return;
    // Every pannable group must belong to a described panel: one the widget can't
    // re-tick (e.g. a polar panel in a composition) would freeze while the rest zoom.
    const pans = ws.svgEl.querySelectorAll("[data-vellum-pan]");
    for (let i = 0; i < pans.length; i++) {
      const nm = pans[i].getAttribute("data-vellum-pan");
      if (!ws.panels.some(function (p) { return p.name === nm; })) return;
    }
    const ref = ws.panels[0];
    const rw = ref.px1 - ref.px0, rh = ref.py1 - ref.py0;
    if (!rw || !rh) return;
    const found: AzPanel[] = [];
    for (let i = 0; i < ws.panels.length; i++) {
      const p = ws.panels[i];
      const pan = ws.svgEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]');
      const outer = ws.svgEl.querySelector('[data-vellum-panel="' + cssEscape(p.name) + '"]');
      if (!pan || !outer) return; // upstream not pannable (older vellum/vellumplot)
      const ax = (p.px1 - p.px0) / rw, ay = (p.py1 - p.py0) / rh;
      if (!(ax > 0) || !(ay > 0)) return;
      found.push({
        p: p, pan: pan as SVGGElement, outer: outer as SVGGElement, grid: null,
        ax: ax, bx: p.px0 - ax * ref.px0, ay: ay, by: p.py0 - ay * ref.py0,
        xLab: null, yLab: null, x2Lab: null, y2Lab: null, x2Map: null, y2Map: null,
        xTick: null, yTick: null
      });
    }
    ws.azPanels = found;
    ws.panGroup = found[0].pan;
    ws.axisZoomActive = true;
    scrapeAxisStyle();
    scrapeAxisAnchors();
    hideStaticAxes();
    // Re-ticked gridlines: a group inside each clipped panel, before its pan group,
    // so they render under the marks and are clipped to the panel (like vellum's).
    // The panel background leaves the pan group first (adoptFurniture), so the
    // order is background, re-ticked grid, marks -- inserted before the pan group
    // alone, the grid would sit under an opaque background that also scales with
    // T (VW-17).
    for (let i = 0; i < ws.azPanels.length; i++) {
      const a = ws.azPanels[i];
      adoptFurniture(a);
      const g = document.createElementNS(SVGNS, "g") as SVGGElement;
      g.setAttribute("class", "vellumwidget-retick-grid");
      a.outer.insertBefore(g, a.pan);
      a.grid = g;
    }
    // Re-ticked axis labels: an overlay pinned to the fixed base coordinate space.
    ws.retickLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
    ws.retickLayer.setAttribute("class", "vellumwidget-retick-layer");
    ws.retickLayer.setAttribute("aria-hidden", "true");
    ws.retickLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
    ws.stage.appendChild(ws.retickLayer);
    // Seed the transforms + inverse-scale vars and the initial ticks for the
    // current view, so the pan groups are transform-ready before the first gesture.
    applyPanTransforms();
    setupConstantMarks(); // fixed-size glyphs (default) + crisp strokes
    retick();
  }

  // Set every zoomable panel's T_i (and its constant-size inverse-scale vars).
  function applyPanTransforms(): void {
    if (!ws.vb0) return;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const t = ws.fx.azT(ws.azPanels[i]);
      ws.azPanels[i].pan.setAttribute("transform", ws.fx.fmtPan(t));
      setPanScaleVars(ws.azPanels[i].pan, t);
    }
  }

  // The inverse of the pan-group scale, published as CSS custom properties so
  // constant-size glyphs (which carry `scale(var(--vw-ix),var(--vw-iy))`) cancel
  // it and keep their pixel size while their position still re-maps with T.
  function setPanScaleVars(g: SVGGElement, t: PanTransform): void {
    g.style.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
    g.style.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
  }

  // Once per render (axis_zoom active, SVG): keep glyph marks a constant pixel
  // size by counter-scaling them about their own centre from the shared vars, and
  // hold every positional mark's stroke width constant. Skipped for zoom_marks =
  // "scale" (glyphs then scale with the pan group, the older behaviour).
  function setupConstantMarks(): void {
    if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale" || !ws.panGroup) return;
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (!e.mark) continue;
      const nodes = ws.nodesByKey[e.key];
      if (!nodes) continue;
      const glyph = GLYPH_MARKS[e.mark] === true;
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j] as SVGElement;
        // Only marks inside a pan group are scaled by T, so only they need
        // the counter-scale.
        if (!ws.azPanels.some(function (a) { return a.pan.contains(node); })) continue;
        if (glyph) {
          // Counter-scale about the glyph's own bbox centre (transform-box:
          // fill-box makes transform-origin resolve there), so T re-maps the
          // position but the shared inverse-scale vars cancel T's size change.
          //
          // The node may already be POSITIONED by a `transform` attribute (a
          // panel-offset matrix, say). An inline CSS transform outranks the
          // presentation attribute, so it has to carry that placement itself
          // or the mark collapses onto its untranslated geometry. Prepending
          // it is exact for the translate-only matrices vellum emits here:
          // transform-origin makes the scale resolve about the glyph's own
          // centre, and translations commute with that.
          node.style.setProperty("transform-box", "fill-box");
          node.style.setProperty("transform-origin", "center");
          const place = transAsCss(node);
          node.style.setProperty(
            "transform",
            (place ? place + " " : "") + "scale(var(--vw-ix,1),var(--vw-iy,1))"
          );
        } else {
          node.setAttribute("vector-effect", "non-scaling-stroke");
        }
      }
    }
  }

  // A node's own `transform` attribute, restated as a CSS transform function so
  // an inline CSS transform can carry it forward instead of silently replacing
  // it. CSS needs comma-separated arguments and px units on lengths, neither of
  // which the SVG attribute grammar requires. "" when there is nothing to carry.
  function transAsCss(node: Element): string {
    const t = (node.getAttribute("transform") || "").trim();
    if (!t) return "";
    const N = "([-+\\d.eE]+)";
    const m = new RegExp(
      "matrix\\(\\s*" + [N, N, N, N, N, N].join("[\\s,]+") + "\\s*\\)"
    ).exec(t);
    if (m) {
      const v = m.slice(1, 7).map(Number);
      if (v.some(function (x) { return !isFinite(x); })) return "";
      return "matrix(" + v.join(",") + ")";
    }
    const tr = new RegExp(
      "translate\\(\\s*" + N + "(?:[\\s,]+" + N + ")?\\s*\\)"
    ).exec(t);
    if (tr) {
      const tx = Number(tr[1]), ty = tr[2] === undefined ? 0 : Number(tr[2]);
      if (!isFinite(tx) || !isFinite(ty)) return "";
      return "translate(" + tx + "px," + ty + "px)";
    }
    return "";
  }

  // Translate component of a node's `transform` (matrix e/f or translate x/y).
  function transTranslate(node: Element): { tx: number; ty: number } {
    const t = node.getAttribute("transform") || "";
    const m = /matrix\(\s*[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(t) ||
      /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/.exec(t);
    return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
  }

  // Scrape the axis text + gridline presentation from vellum's own nodes, so the
  // re-tick matches the active theme. Falls back to sensible defaults (grey text,
  // white gridlines) if a node is absent.
  function scrapeAxisStyle(): void {
    if (!ws.svgEl) return;
    const xText = ws.svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text');
    if (xText) {
      ws.axisStyle.textFill = xText.getAttribute("fill") || ws.axisStyle.textFill;
      ws.axisStyle.fontFamily = xText.getAttribute("font-family") || ws.axisStyle.fontFamily;
      const fs = parseFloat(xText.getAttribute("font-size") || "");
      if (fs) ws.axisStyle.fontSize = fs;
    }
    const grid = ws.svgEl.querySelector('[role="grid"] path, [role="grid"] line');
    if (grid) {
      ws.axisStyle.gridStroke = grid.getAttribute("stroke") || ws.axisStyle.gridStroke;
      const sw = parseFloat(grid.getAttribute("stroke-width") || "");
      if (sw) ws.axisStyle.gridWidth = sw;
    }
  }

  // Assign each static tick-label group (axis-x-* / axis-y-*) to the panel it
  // labels, and record where its labels sit: an x group labels the nearest panel
  // above (or below, for a top axis) whose x-extent holds its labels; a y group
  // the nearest panel to its right (or left) whose y-extent holds them. Facets
  // label only their outer panels, so an interior panel keeps no anchor and is
  // re-ticked with gridlines only, exactly as the static render drew it.
  function scrapeAxisAnchors(): void {
    if (!ws.svgEl) return;
    const groups = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
    for (let g = 0; g < groups.length; g++) {
      const gname = groups[g].getAttribute("data-vellum-panel") || "";
      const isX = /^axis-x/.test(gname);
      // A secondary axis (vellumplot names it axis-x2-* / axis-y2-*): re-ticked
      // through the transform its own static labels imply (VW-10b).
      const isSec = /^axis-[xy]2-/.test(gname);
      const texts = groups[g].querySelectorAll("text");
      if (!texts.length) continue;
      let sx = 0, sy = 0, n = 0, gap = 0;
      let first: { x: number; y: number } | null = null;
      const along: number[] = [], labs: string[] = [];
      for (let i = 0; i < texts.length; i++) {
        const tr = transTranslate(texts[i]);
        const x = tr.tx + (parseFloat(texts[i].getAttribute("x") || "") || 0);
        const y = tr.ty + (parseFloat(texts[i].getAttribute("y") || "") || 0);
        along.push(isX ? x : y);
        labs.push(texts[i].textContent || "");
        if (!first) first = { x: x, y: y };
        else if (isX && !gap && y - first.y > 1) gap = y - first.y; // a wrapped second line
        sx += x; sy += y; n++;
      }
      if (!first || !n) continue;
      const mx = sx / n, my = sy / n;
      let best: AzPanel | null = null, bestD = Infinity;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const p = ws.azPanels[i].p;
        let d: number;
        // The labels' mean anchor must fall within the panel's extent, give or
        // take a quarter panel (start-anchored / wrapped labels sit left of
        // their tick, so a lone edge label can start outside the panel).
        if (isX) {
          const slack = (p.px1 - p.px0) / 4;
          if (mx < p.px0 - slack || mx > p.px1 + slack) continue;
          d = first.y >= p.py1 - 1 ? first.y - p.py1 : first.y <= p.py0 + 1 ? p.py0 - first.y : Infinity;
        } else {
          const slack = (p.py1 - p.py0) / 4;
          if (my < p.py0 - slack || my > p.py1 + slack) continue;
          d = first.x <= p.px0 + 1 ? p.px0 - first.x : first.x >= p.px1 - 1 ? first.x - p.px1 : Infinity;
        }
        if (d < bestD) { bestD = d; best = ws.azPanels[i]; }
      }
      if (!best) continue;
      const t0 = texts[0];
      const anchor: AxisAnchor = {
        pos: isX ? first.y : first.x,
        // x labels centre on their tick (vellum centres wrapped lines itself, with
        // a start anchor and per-line offsets, so its anchor isn't reusable there).
        anchor: isX ? "middle" : (t0.getAttribute("text-anchor") || "end"),
        baseline: t0.getAttribute("dominant-baseline") || (isX ? "text-before-edge" : "central"),
        gap: gap
      };
      if (isSec) {
        // Read the secondary transform back off the static labels: each label sits
        // at its break's primary position, so (primary native, label value) pairs
        // sample the transform. Needs a tick-centred label (x) and numeric text.
        const p = best.p;
        const sc = isX ? p.x : p.y;
        if (!sc || (isX && (t0.getAttribute("text-anchor") || "middle") !== "middle")) continue;
        const k = isX ? (sc.native_hi - sc.native_lo) / (p.px1 - p.px0) : (sc.native_hi - sc.native_lo) / (p.py1 - p.py0);
        if (!isFinite(k) || !k) continue;
        const native = along.map(function (v) { return isX ? sc.native_lo + (v - p.px0) * k : sc.native_hi - (v - p.py0) * k; });
        const map = secAxisMap(native, labs);
        if (!map) continue; // not a plain numeric axis: leave it hidden, as before
        if (isX && !best.x2Lab) { best.x2Lab = anchor; best.x2Map = map; }
        if (!isX && !best.y2Lab) { best.y2Lab = anchor; best.y2Map = map; }
        continue;
      }
      // First primary group wins.
      if (isX && !best.xLab) best.xLab = anchor;
      if (!isX && !best.yLab) best.yLab = anchor;
    }
  }

  // Hide vellum's gridlines (role="grid", inside the pan group -> would stretch
  // with T) and its axis tick-label groups (axis-x-*/axis-y-*, outside the panel
  // -> would go stale). Axis TITLES (axis-title-*) are left visible, and so is an
  // axis line (theme_classic draws it in the axis group as one straight segment
  // along the panel edge, which no zoom moves).
  function hideStaticAxes(): void {
    if (!ws.svgEl) return;
    const grids = ws.svgEl.querySelectorAll('[role="grid"]');
    for (let i = 0; i < grids.length; i++) (grids[i] as SVGElement).style.display = "none";
    const axes = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
    for (let i = 0; i < axes.length; i++) {
      const kids = axes[i].children;
      let line = false;
      for (let j = 0; j < kids.length; j++) if (isAxisLine(kids[j])) line = true;
      if (!line) { (axes[i] as SVGElement).style.display = "none"; continue; }
      for (let j = 0; j < kids.length; j++) {
        if (!isAxisLine(kids[j])) (kids[j] as SVGElement).style.display = "none";
      }
    }
  }

  // One straight horizontal or vertical segment ("M x y L x y"): an axis line.
  function isAxisLine(n: Element): boolean {
    if (n.tagName.toLowerCase() !== "path") return false;
    const s = pathSegments(n.getAttribute("d") || "");
    return s !== null && s.length === 1 && (s[0][0] === s[0][2] || s[0][1] === s[0][3]);
  }

  // A path of plain "M x y L x y" segments -> [[x1, y1, x2, y2], ...]; null for
  // anything else (curves, closed shapes, relative commands).
  function pathSegments(d: string): number[][] | null {
    const re = /M\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*L\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*/g;
    const out: number[][] = [];
    let m: RegExpExecArray | null, end = 0;
    const t = d.trim();
    while ((m = re.exec(t)) !== null) {
      if (m.index !== end) return null;
      const v = [+m[1], +m[2], +m[3], +m[4]];
      if (!v.every(isFinite)) return null;
      out.push(v);
      end = re.lastIndex;
    }
    return end === t.length && out.length ? out : null;
  }

  // The panel furniture vellumplot draws at the start of each pan group, before
  // the first mark: an un-roled background rect, role="grid" gridlines (hidden by
  // hideStaticAxes) and role="presentation" tick marks growing inward from the
  // panel edges. Inside the pan group all three would stretch with T. Move the
  // background out (just before the pan group, still inside the clipped panel)
  // so it stays fixed and the re-ticked grid can sit on top of it; hide the ticks
  // and remember their look, so retickPanel re-draws them at the new breaks.
  function adoptFurniture(a: AzPanel): void {
    const p = a.p;
    const kids = Array.prototype.slice.call(a.pan.children) as Element[];
    const near = function (v: number, w: number): boolean { return Math.abs(v - w) < 0.5; };
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.hasAttribute("data-vellum-id") || c.hasAttribute("data-key")) break; // first mark
      const role = c.getAttribute("role");
      if (role === "grid") continue;
      const tag = c.tagName.toLowerCase();
      if (i === 0 && !role && (tag === "path" || tag === "rect")) {
        c.setAttribute("data-vw-panel-bg", "");
        a.outer.insertBefore(c, a.pan);
        continue;
      }
      if (role !== "presentation" || tag !== "g") break;
      // A tick group: every child a path of axis-aligned segments, each with one
      // end on a panel edge. Anything else (an annotation, say) ends the scan.
      const paths = c.children;
      let tick: TickStyle | null = null, isX = false;
      for (let j = 0; j < paths.length && paths.length; j++) {
        const segs = pathSegments(paths[j].getAttribute("d") || "");
        if (!segs) { tick = null; break; }
        for (let k = 0; k < segs.length; k++) {
          const s = segs[k];
          let edge: TickStyle["edge"] | null = null, len = 0, vx = false;
          if (s[0] === s[2]) {
            vx = true; len = Math.abs(s[3] - s[1]);
            edge = near(s[1], p.py1) || near(s[3], p.py1) ? "bottom" : near(s[1], p.py0) || near(s[3], p.py0) ? "top" : null;
          } else if (s[1] === s[3]) {
            len = Math.abs(s[2] - s[0]);
            edge = near(s[0], p.px0) || near(s[2], p.px0) ? "left" : near(s[0], p.px1) || near(s[2], p.px1) ? "right" : null;
          }
          if (!edge || !(len > 0) || (tick && (tick.edge !== edge))) { tick = null; break; }
          if (!tick) {
            isX = vx;
            tick = {
              stroke: paths[j].getAttribute("stroke") || ws.axisStyle.textFill,
              width: parseFloat(paths[j].getAttribute("stroke-width") || "") || 1,
              len: len, edge: edge
            };
          } else if (len > tick.len) tick.len = len;
        }
        if (!tick) break;
      }
      if (!tick) break;
      (c as SVGElement).style.display = "none";
      // Minor / log ticks are shorter than the major ones: keep the longest.
      if (isX) { if (!a.xTick || tick.len > a.xTick.len) a.xTick = tick; }
      else if (!a.yTick || tick.len > a.yTick.len) a.yTick = tick;
    }
  }

  // A re-ticked tick mark at a break, growing inward from the panel edge.
  function tickLine(ts: TickStyle, at: number, p: AzPanel["p"]): SVGLineElement {
    const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
    let x1 = at, x2 = at, y1 = at, y2 = at;
    if (ts.edge === "bottom") { y1 = p.py1; y2 = p.py1 - ts.len; }
    else if (ts.edge === "top") { y1 = p.py0; y2 = p.py0 + ts.len; }
    else if (ts.edge === "left") { x1 = p.px0; x2 = p.px0 + ts.len; }
    else { x1 = p.px1; x2 = p.px1 - ts.len; }
    l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
    l.setAttribute("stroke", ts.stroke);
    l.setAttribute("stroke-width", String(ts.width));
    l.setAttribute("class", "vellumwidget-retick-tick");
    return l;
  }

  // A gridline / an axis label, styled to match the scraped theme.
  function gridLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
    const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
    l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
    l.setAttribute("stroke", ws.axisStyle.gridStroke);
    l.setAttribute("stroke-width", String(ws.axisStyle.gridWidth));
    return l;
  }

  function axisLabel(text: string, x: number, y: number, anchor: string, baseline: string): SVGTextElement {
    const t = document.createElementNS(SVGNS, "text") as SVGTextElement;
    t.setAttribute("x", String(x)); t.setAttribute("y", String(y));
    t.setAttribute("fill", ws.axisStyle.textFill);
    t.setAttribute("font-family", ws.axisStyle.fontFamily);
    t.setAttribute("font-size", String(ws.axisStyle.fontSize));
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    t.textContent = text;
    return t;
  }

  // Break a label onto two lines at its first space (as vellum wrapped the static
  // axis): "2020-01-01 06:00:00" -> "2020-01-01" over "06:00:00".
  function wrapLabel(t: SVGTextElement, text: string, x: number, gap: number): void {
    const sp = text.indexOf(" ");
    if (sp < 0) return;
    t.textContent = "";
    const parts = [text.slice(0, sp), text.slice(sp + 1)];
    for (let i = 0; i < parts.length; i++) {
      const ts = document.createElementNS(SVGNS, "tspan");
      ts.setAttribute("x", String(x));
      if (i > 0) ts.setAttribute("dy", String(gap));
      ts.textContent = parts[i];
      t.appendChild(ts);
    }
  }

  // Redraw the re-ticked gridlines + axis labels for each panel's currently
  // visible range. Called on every applyViewBox while axis_zoom is active.
  function retick(): void {
    if (!ws.axisZoomActive || !ws.vb || !ws.vb0 || !ws.retickLayer) return;
    while (ws.retickLayer.firstChild) ws.retickLayer.removeChild(ws.retickLayer.firstChild);
    for (let i = 0; i < ws.azPanels.length; i++) retickPanel(ws.azPanels[i]);
  }

  function retickPanel(a: AzPanel): void {
    const p = a.p, grid = a.grid, layer = ws.retickLayer;
    if (!grid || !layer) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const t = ws.fx.azT(a);
    const ticks_: SVGLineElement[] = []; // tick marks go on top of every gridline
    // Visible native range: invert the panel's fixed screen rect through T_i to
    // the device px now sitting there, then px -> native via the panel affine.
    if (p.x && p.px1 !== p.px0) {
      const ax = p.x;
      const k = (ax.native_hi - ax.native_lo) / (p.px1 - p.px0);
      const nA = ax.native_lo + ((p.px0 - t.tx) / t.sx - p.px0) * k;
      const nB = ax.native_lo + ((p.px1 - t.tx) / t.sx - p.px0) * k;
      const ticks = axisTicks(ax, Math.min(nA, nB), Math.max(nA, nB), 5);
      for (let i = 0; i < ticks.length; i++) {
        const px = p.px0 + (ticks[i].n - ax.native_lo) / k;
        const sx = t.sx * px + t.tx; // screen device-px
        if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
        grid.appendChild(gridLine(sx, p.py0, sx, p.py1));
        if (a.xTick) ticks_.push(tickLine(a.xTick, sx, p));
        if (a.xLab) {
          const lab = axisLabel(ticks[i].label, sx, a.xLab.pos, a.xLab.anchor, a.xLab.baseline);
          if (a.xLab.gap > 0) wrapLabel(lab, ticks[i].label, sx, a.xLab.gap);
          layer.appendChild(lab);
        }
      }
      if (a.x2Lab && a.x2Map) {
        const st = secTicks(a.x2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < st.length; i++) {
          const sx = t.sx * (p.px0 + (st[i].n - ax.native_lo) / k) + t.tx;
          if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
          layer.appendChild(axisLabel(st[i].label, sx, a.x2Lab.pos, a.x2Lab.anchor, a.x2Lab.baseline));
        }
      }
    }
    if (p.y && p.py1 !== p.py0) {
      const ay = p.y;
      // device y is top-down: native_hi at py0 (top), native_lo at py1 (bottom)
      const k = (ay.native_hi - ay.native_lo) / (p.py1 - p.py0);
      const nA = ay.native_hi - ((p.py0 - t.ty) / t.sy - p.py0) * k;
      const nB = ay.native_hi - ((p.py1 - t.ty) / t.sy - p.py0) * k;
      const ticks = axisTicks(ay, Math.min(nA, nB), Math.max(nA, nB), 5);
      for (let i = 0; i < ticks.length; i++) {
        const py = p.py0 + (ay.native_hi - ticks[i].n) / k;
        const sy = t.sy * py + t.ty;
        if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
        grid.appendChild(gridLine(p.px0, sy, p.px1, sy));
        if (a.yTick) ticks_.push(tickLine(a.yTick, sy, p));
        if (a.yLab) {
          layer.appendChild(axisLabel(ticks[i].label, a.yLab.pos, sy, a.yLab.anchor, a.yLab.baseline));
        }
      }
      if (a.y2Lab && a.y2Map) {
        const st = secTicks(a.y2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < st.length; i++) {
          const sy = t.sy * (p.py0 + (ay.native_hi - st[i].n) / k) + t.ty;
          if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
          layer.appendChild(axisLabel(st[i].label, a.y2Lab.pos, sy, a.y2Lab.anchor, a.y2Lab.baseline));
        }
      }
    }
    for (let i = 0; i < ticks_.length; i++) grid.appendChild(ticks_[i]);
  }

  return { setupAxisZoom, applyPanTransforms, retick };
}
