// Axis-aware zoom: per-panel pan transforms, constant-size marks, and the
// client-side re-ticked axes and gridlines.

import { cssEscape } from "../css";
import { applyAffine6, parseTransformList } from "../geometry";
import { SVGNS } from "./constants";
import { GLYPH_MARKS } from "../scales";
import type { WidgetFns, WidgetState } from "../state";
import { axisRetickable, axisTicks, axisTicksAtDecimals, labelDecimals, minorBreaks, secAxisMap, secTicks, staticTicks } from "../ticks";
import type { Tick } from "../ticks";
import type { AxisAnchor, AxisScale, AxisTitle, AzPanel, LineStyle, PanelGridStyle, TickStyle } from "../types";
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
    // Raster mode zooms by axis only with the split render's mark layer inside
    // the pan groups (VW-14); a single base image bakes the axes in.
    if (!ws.opts.axisZoom || (ws.rasterMode && ws.marksLayer !== "pans") || !ws.svgEl || !ws.vb0 || !ws.stage || !ws.panels.length) return;
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
      const mirror = ws.aboveEl ? ws.aboveEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]') : null;
      found.push({
        p: p, pan: pan as SVGGElement, mirror: mirror as SVGGElement | null, outer: outer as SVGGElement, grid: null,
        ax: ax, bx: p.px0 - ax * ref.px0, ay: ay, by: p.py0 - ay * ref.py0,
        xLab: null, yLab: null, x2Lab: null, y2Lab: null, x2Map: null, y2Map: null,
        xTick: null, yTick: null,
        gridStyle: { xMajor: null, xMinor: null, yMajor: null, yMinor: null }
      });
    }
    ws.azPanels = found;
    ws.panGroup = found[0].pan;
    ws.axisZoomActive = true;
    scrapeAxisStyle();
    for (let i = 0; i < found.length; i++) scrapePanelGrid(found[i]);
    scrapeAxisAnchors();
    scrapeAxisTitles();
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
    setupConstantFurniture(); // the same for the unkeyed panel elements (VW-26)
    retick();
  }

  // Set every zoomable panel's T_i (and its constant-size inverse-scale vars).
  function applyPanTransforms(): void {
    if (!ws.vb0) return;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const t = ws.fx.azT(ws.azPanels[i]);
      ws.azPanels[i].pan.setAttribute("transform", ws.fx.fmtPan(t));
      setPanScaleVars(ws.azPanels[i].pan, t);
      const m = ws.azPanels[i].mirror; // the above-marks layer zooms with the panel
      if (m) { m.setAttribute("transform", ws.fx.fmtPan(t)); setPanScaleVars(m, t); }
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

  // Once per render, after setupConstantMarks: the unkeyed elements of every
  // pan group (a reference rule, an annotation, an unkeyed layer), in the base
  // svg and in the above-marks overlay (VW-21), get the constant-size treatment
  // the keyed marks have. Strokes stop thickening (non-scaling-stroke on each
  // shape: vector-effect is not inherited), an unkeyed glyph layer keeps its
  // pixel size, and text keeps its size anchored at its own position, so a
  // label stays beside the point it annotates. Text marks with a key get the
  // same, since text never reads well stretched. The gridlines and tick marks
  // are hidden and re-drawn by the re-tick, and the background has left the
  // pan group (adoptFurniture), so neither is affected.
  function setupConstantFurniture(): void {
    if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const a = ws.azPanels[i];
      constantFurnitureIn(a.pan);
      if (a.mirror) constantFurnitureIn(a.mirror);
    }
  }

  const SHAPES: Record<string, boolean> = { path: true, line: true, polyline: true, polygon: true, rect: true, circle: true, ellipse: true };

  function constantFurnitureIn(pan: Element): void {
    const all = pan.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const n = all[i] as SVGElement;
      const tag = n.tagName.toLowerCase();
      if (tag === "text") { constantText(n); continue; }
      if (!SHAPES[tag]) continue;
      if (n.closest(".vellumwidget-detail, [role=\"grid\"]")) continue;
      // A keyed glyph already counter-scales (setupConstantMarks).
      if (n.style.getPropertyValue("transform")) continue;
      if (!n.closest("[data-key]") && inGlyphLayer(n)) {
        n.style.setProperty("transform-box", "fill-box");
        n.style.setProperty("transform-origin", "center");
        const place = transAsCss(n);
        n.style.setProperty("transform", (place ? place + " " : "") + "scale(var(--vw-ix,1),var(--vw-iy,1))");
      } else {
        n.setAttribute("vector-effect", "non-scaling-stroke");
      }
    }
  }

  // An unkeyed layer of glyphs (vellumplot ids its layer groups
  // "layer-<i>-<mark>-g<j>").
  function inGlyphLayer(n: Element): boolean {
    const g = n.closest("[data-vellum-id]");
    const m = g ? /^layer-\d+-([a-z0-9_]+)-g\d+/.exec(g.getAttribute("data-vellum-id") || "") : null;
    return !!m && GLYPH_MARKS[m[1]] === true;
  }

  // Counter-scale a text node about its anchor: T re-maps the anchor, the
  // inverse-scale vars cancel T's size change around it. The anchor is the
  // node's (x, y) through its own placement transform, composed over the whole
  // list (vellum rotates a label with `matrix(...) rotate(a x y)`, VW-41), and
  // that transform is carried after the counter-scale so the label keeps its
  // rotation. A transform this can't read leaves the node as is.
  function constantText(n: SVGElement): void {
    if (n.style.getPropertyValue("transform")) return;
    const own = (n.getAttribute("transform") || "").trim();
    if (own && !parseTransformList(own)) return;
    const A = anchorThrough(n);
    const X = A.x, Y = A.y;
    if (!isFinite(X) || !isFinite(Y)) return;
    const place = transAsCss(n);
    // view-box origin 0 0 is the local origin for vellum's 0-based viewBox.
    n.style.setProperty("transform-box", "view-box");
    n.style.setProperty("transform-origin", "0px 0px");
    n.style.setProperty(
      "transform",
      "translate(" + X + "px," + Y + "px) scale(var(--vw-ix,1),var(--vw-iy,1)) translate(" + -X + "px," + -Y + "px)" + (place ? " " + place : "")
    );
  }

  // A node's own `transform` attribute, restated as a CSS transform function so
  // an inline CSS transform can carry it forward instead of silently replacing
  // it. CSS needs comma-separated arguments and px units on lengths, neither of
  // which the SVG attribute grammar requires. The whole list is composed into
  // one matrix, so a `matrix(...) rotate(...)` keeps its rotation (VW-41); a
  // translate-only list stays a px translate. "" when there is nothing to
  // carry (or nothing this can read).
  function transAsCss(node: Element): string {
    const t = (node.getAttribute("transform") || "").trim();
    const m = parseTransformList(t);
    if (!m) return "";
    if (/^(\s*translate\([^)]*\)\s*)+$/.test(t)) return "translate(" + m[4] + "px," + m[5] + "px)";
    return "matrix(" + m.join(",") + ")";
  }

  // A node's (x, y) anchor through its own transform list.
  function anchorThrough(node: Element): { x: number; y: number } {
    const x = parseFloat(node.getAttribute("x") || "") || 0, y = parseFloat(node.getAttribute("y") || "") || 0;
    const m = parseTransformList(node.getAttribute("transform"));
    return m ? applyAffine6(m, x, y) : { x: x, y: y };
  }

  // The rotation (degrees, SVG sense: clockwise in the y-down frame) a node's
  // transform list applies; 0 when none.
  function rotationOf(node: Element): number {
    const m = parseTransformList(node.getAttribute("transform"));
    if (!m) return 0;
    const r = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    return Math.abs(r) < 1e-6 ? 0 : Math.round(r * 1e6) / 1e6;
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

  // The static gridlines of one panel (VW-66): each role="grid" group inside it
  // is one batch of axis-aligned segments, vertical ones along x and horizontal
  // ones along y. vellumplot draws them minor x, minor y, major x, major y
  // (`.draw_panel_bg()`), so of two groups along an axis the first is the minor
  // set; a lone group is the major set unless the axis descriptor says this
  // panel has minor lines only.
  function scrapePanelGrid(a: AzPanel): void {
    const nodes = a.outer.querySelectorAll('[role="grid"] path, [role="grid"] line');
    const along: { x: LineStyle[]; y: LineStyle[] } = { x: [], y: [] };
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      let seg: number[] | null = null;
      if (n.tagName.toLowerCase() === "line") {
        seg = ["x1", "y1", "x2", "y2"].map(function (k) { return parseFloat(n.getAttribute(k) || ""); });
      } else {
        const segs = pathSegments(n.getAttribute("d") || "");
        seg = segs ? segs[0] : null;
      }
      if (!seg || !seg.every(isFinite)) continue;
      const st: LineStyle = {
        stroke: n.getAttribute("stroke") || ws.axisStyle.gridStroke,
        width: parseFloat(n.getAttribute("stroke-width") || "") || ws.axisStyle.gridWidth
      };
      if (Math.abs(seg[0] - seg[2]) < 0.01) along.x.push(st);
      else if (Math.abs(seg[1] - seg[3]) < 0.01) along.y.push(st);
    }
    const pick = function (sts: LineStyle[], ax: AxisScale | undefined): [LineStyle | null, LineStyle | null] {
      if (sts.length >= 2) return [sts[sts.length - 1], sts[0]];
      if (sts.length === 1) {
        const g = ax && ax.grid;
        return g && g.minor && !g.major ? [null, sts[0]] : [sts[0], null];
      }
      return [null, null];
    };
    const px = pick(along.x, a.p.x), py = pick(along.y, a.p.y);
    a.gridStyle = { xMajor: px[0], xMinor: px[1], yMajor: py[0], yMinor: py[1] };
  }

  // The gridline style to draw along one axis of a panel, or null for none. The
  // axis descriptor's `grid` flags decide (a blank panel.grid draws nothing).
  // A payload without them (an older vellumplot) keeps the earlier behaviour:
  // major lines always, minor ones where the static panel drew some. Style
  // from the panel's own static lines, else the scraped theme default.
  function gridFor(a: AzPanel, axis: "x" | "y", kind: "major" | "minor"): LineStyle | null {
    const ax = axis === "x" ? a.p.x : a.p.y;
    const key = (axis + (kind === "major" ? "Major" : "Minor")) as keyof PanelGridStyle;
    const scraped = a.gridStyle[key];
    const g = ax && ax.grid;
    if (g && (g.major !== undefined || g.minor !== undefined)) {
      if (!g[kind]) return null;
      if (kind === "minor" && ax && (ax.type === "discrete" || ax.type === "binned")) return null;
      return scraped || { stroke: ws.axisStyle.gridStroke, width: ws.axisStyle.gridWidth };
    }
    if (kind === "major") return scraped || { stroke: ws.axisStyle.gridStroke, width: ws.axisStyle.gridWidth };
    return scraped;
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
        const at = anchorThrough(texts[i]);
        const x = at.x, y = at.y;
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
      // Rotated tick labels (`axis.text.x = element_text(angle =)`) are re-drawn
      // rotated about their anchor with vellum's own anchoring (VW-41).
      const rot = rotationOf(t0);
      const anchor: AxisAnchor = {
        pos: isX ? first.y : first.x,
        // x labels centre on their tick (vellum centres wrapped lines itself, with
        // a start anchor and per-line offsets, so its anchor isn't reusable there).
        anchor: isX && !rot ? "middle" : (t0.getAttribute("text-anchor") || (isX ? "middle" : "end")),
        baseline: t0.getAttribute("dominant-baseline") || (isX ? "text-before-edge" : "central"),
        gap: rot ? 0 : gap,
        rot: rot
      };
      // A y axis records its widest static label, measured while still shown.
      if (!isX && !rot) {
        let w0 = 0;
        for (let i = 0; i < texts.length; i++) w0 = Math.max(w0, labelWidth(texts[i]));
        anchor.w0 = w0;
      }
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

  // Pair each static y-axis title (axis-title-y / axis-title-y2) with the y
  // label anchors it was laid out beside: the nearest title on the labels' outer
  // side (left of "end"-anchored labels, right of "start"-anchored ones). A
  // re-tick whose labels outgrow the static ones moves the title out by the
  // difference (VW-51), never past the canvas edge.
  function scrapeAxisTitles(): void {
    if (!ws.svgEl || !ws.vb0) return;
    const vb0 = ws.vb0;
    const groups = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-title-y"]');
    const titles: { t: AxisTitle; x: number; y: number }[] = [];
    for (let g = 0; g < groups.length; g++) {
      const node = groups[g].querySelector("text");
      if (!node) continue;
      const at = anchorThrough(node);
      const fs = parseFloat(node.getAttribute("font-size") || "") || ws.axisStyle.fontSize;
      // A rotated title is about one line tall across; a flat one its width.
      const half = rotationOf(node) ? fs / 2 : labelWidth(node as SVGTextElement) / 2;
      const sec = /^axis-title-y2/.test(groups[g].getAttribute("data-vellum-panel") || "");
      const room = sec ? vb0.x + vb0.w - (at.x + half) : at.x - half - vb0.x;
      titles.push({
        t: { node: node, orig: node.getAttribute("transform"), room: Math.max(0, room), dir: sec ? 1 : -1, need: 0, shift: 0 },
        x: at.x, y: at.y
      });
    }
    if (!titles.length) return;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const a = ws.azPanels[i];
      const labs = [a.yLab, a.y2Lab];
      for (let j = 0; j < labs.length; j++) {
        const lab = labs[j];
        if (!lab || lab.w0 === undefined) continue;
        const dir = lab.anchor === "end" ? -1 : lab.anchor === "start" ? 1 : 0;
        if (!dir) continue;
        let best: AxisTitle | null = null, bestD = Infinity;
        for (let k = 0; k < titles.length; k++) {
          const c = titles[k];
          if (c.t.dir !== dir || (c.x - lab.pos) * dir <= 0) continue;
          const dy = c.y < a.p.py0 ? a.p.py0 - c.y : c.y > a.p.py1 ? c.y - a.p.py1 : 0;
          const d = Math.abs(c.x - lab.pos) + dy;
          if (d < bestD) { bestD = d; best = c.t; }
        }
        lab.title = best;
      }
    }
  }

  // A text node's advance width in device px: the browser's own measure, or,
  // with no layout to ask (jsdom), 0.6 em per character.
  function labelWidth(t: Element): number {
    const f = (t as SVGTextElement).getComputedTextLength;
    if (typeof f === "function") {
      try {
        const w = f.call(t);
        if (w > 0) return w;
      } catch (e) { /* not laid out */ }
    }
    const fs = parseFloat(t.getAttribute("font-size") || "") || ws.axisStyle.fontSize;
    return (t.textContent || "").length * 0.6 * fs;
  }

  // Move each y title out by what its widest re-ticked labels need beyond the
  // static ones (capped at its room), or back home when they fit again.
  function placeAxisTitles(): void {
    const seen: AxisTitle[] = [];
    for (let i = 0; i < ws.azPanels.length; i++) {
      const labs = [ws.azPanels[i].yLab, ws.azPanels[i].y2Lab];
      for (let j = 0; j < labs.length; j++) {
        const t = labs[j] && labs[j]!.title;
        if (t && seen.indexOf(t) < 0) seen.push(t);
      }
    }
    for (let i = 0; i < seen.length; i++) {
      const t = seen[i];
      const shift = Math.min(t.room, Math.max(0, t.need));
      t.need = 0;
      if (Math.abs(shift - t.shift) < 0.01) continue;
      t.shift = shift;
      if (shift > 0) {
        t.node.setAttribute("transform", "translate(" + t.dir * shift + " 0)" + (t.orig ? " " + t.orig : ""));
      } else if (t.orig !== null) {
        t.node.setAttribute("transform", t.orig);
      } else {
        t.node.removeAttribute("transform");
      }
    }
  }

  // Note how far a y axis's re-ticked labels outgrow its static ones.
  function noteLabelWidth(lab: AxisAnchor, w: number): void {
    if (lab.title && lab.w0 !== undefined) lab.title.need = Math.max(lab.title.need, w - lab.w0);
  }

  // The second step after the title shift (VW-59): when a y axis's re-ticked
  // labels outgrow the static ones by more than its title can move out (the
  // shift stops at the canvas edge), re-tick with one decimal fewer at a time,
  // a coarser step whose labels stay exact and distinct, until they fit, two
  // ticks would no longer be in view, or there are no decimals left. A linear
  // axis only; any other keeps its ticks.
  function fitYTicks(lab: AxisAnchor, ax: AzPanel["p"]["y"], lo: number, hi: number, ticks: Tick[]): Tick[] {
    const title = lab.title;
    if (!ax || !title || lab.w0 === undefined || !ws.retickLayer) return ticks;
    const over = function (tk: Tick[]): number {
      let w = 0;
      for (let i = 0; i < tk.length; i++) w = Math.max(w, measureLabel(tk[i].label, lab));
      return w - lab.w0! - title.room;
    };
    if (over(ticks) <= 0.5) return ticks;
    let best = ticks;
    for (let dec = labelDecimals(ticks.map(function (x) { return x.label; })) - 1; dec >= 0; dec--) {
      const tk = axisTicksAtDecimals(ax, lo, hi, 5, dec);
      if (!tk) break;
      best = tk;
      if (over(tk) <= 0.5) break;
    }
    return best;
  }

  // A y label's width as the re-ticker would draw it (laid out in the retick
  // layer for the measure, then removed).
  function measureLabel(text: string, lab: AxisAnchor): number {
    const t = axisLabel(text, lab.pos, 0, lab.anchor, lab.baseline, lab.rot);
    ws.retickLayer!.appendChild(t);
    const w = labelWidth(t);
    ws.retickLayer!.removeChild(t);
    return w;
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
  function gridLine(x1: number, y1: number, x2: number, y2: number, st: LineStyle): SVGLineElement {
    const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
    l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
    l.setAttribute("stroke", st.stroke);
    l.setAttribute("stroke-width", String(st.width));
    return l;
  }

  function axisLabel(text: string, x: number, y: number, anchor: string, baseline: string, rot?: number): SVGTextElement {
    const t = document.createElementNS(SVGNS, "text") as SVGTextElement;
    t.setAttribute("x", String(x)); t.setAttribute("y", String(y));
    t.setAttribute("fill", ws.axisStyle.textFill);
    t.setAttribute("font-family", ws.axisStyle.fontFamily);
    t.setAttribute("font-size", String(ws.axisStyle.fontSize));
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    if (rot) t.setAttribute("transform", "rotate(" + rot + " " + x + " " + y + ")");
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
    placeAxisTitles();
  }

  // Does the axis descriptor carry the static render's breaks (an older payload,
  // or a hand-made one, may not)?
  function hasStatic(ax: AxisScale): boolean {
    const b = ax.breaks;
    return b !== undefined && b !== null && (!Array.isArray(b) || b.length > 0);
  }

  function retickPanel(a: AzPanel): void {
    const p = a.p, grid = a.grid, layer = ws.retickLayer;
    if (!grid || !layer) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const t = ws.fx.azT(a);
    // At the unzoomed view the axes show the static render's own breaks and
    // labels, so the widget opens identical to the static plot; re-ticking
    // starts with the first zoom (VW-66). (Nice ticks over the expanded native
    // range could add a break the static axis left out, e.g. 400 on a 0-398 axis.)
    const identity = Math.abs(t.sx - 1) < 1e-9 && Math.abs(t.sy - 1) < 1e-9 && Math.abs(t.tx) < 1e-6 && Math.abs(t.ty) < 1e-6;
    const ticks_: SVGLineElement[] = []; // tick marks go on top of every gridline
    const minors: SVGLineElement[] = []; // minor gridlines go under the major ones
    const majors: SVGLineElement[] = [];
    // Visible native range: invert the panel's fixed screen rect through T_i to
    // the device px now sitting there, then px -> native via the panel affine.
    if (p.x && p.px1 !== p.px0) {
      const ax = p.x;
      const k = (ax.native_hi - ax.native_lo) / (p.px1 - p.px0);
      const nA = ax.native_lo + ((p.px0 - t.tx) / t.sx - p.px0) * k;
      const nB = ax.native_lo + ((p.px1 - t.tx) / t.sx - p.px0) * k;
      const ticks = identity && hasStatic(ax) ? staticTicks(ax, Math.min(nA, nB), Math.max(nA, nB)) : axisTicks(ax, Math.min(nA, nB), Math.max(nA, nB), 5);
      const toSx = function (n: number): number { return t.sx * (p.px0 + (n - ax.native_lo) / k) + t.tx; };
      const gMaj = gridFor(a, "x", "major"), gMin = gridFor(a, "x", "minor");
      if (gMin) {
        const mb = minorBreaks(ticks.map(function (x) { return x.n; }));
        for (let i = 0; i < mb.length; i++) {
          const sx = toSx(mb[i]);
          if (isFinite(sx) && sx >= p.px0 - 0.5 && sx <= p.px1 + 0.5) minors.push(gridLine(sx, p.py0, sx, p.py1, gMin));
        }
      }
      for (let i = 0; i < ticks.length; i++) {
        const sx = toSx(ticks[i].n); // screen device-px
        if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
        if (gMaj) majors.push(gridLine(sx, p.py0, sx, p.py1, gMaj));
        if (a.xTick) ticks_.push(tickLine(a.xTick, sx, p));
        if (a.xLab) {
          const lab = axisLabel(ticks[i].label, sx, a.xLab.pos, a.xLab.anchor, a.xLab.baseline, a.xLab.rot);
          if (a.xLab.gap > 0) wrapLabel(lab, ticks[i].label, sx, a.xLab.gap);
          layer.appendChild(lab);
        }
      }
      if (a.x2Lab && a.x2Map) {
        const st = secTicks(a.x2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < st.length; i++) {
          const sx = t.sx * (p.px0 + (st[i].n - ax.native_lo) / k) + t.tx;
          if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
          layer.appendChild(axisLabel(st[i].label, sx, a.x2Lab.pos, a.x2Lab.anchor, a.x2Lab.baseline, a.x2Lab.rot));
        }
      }
    }
    if (p.y && p.py1 !== p.py0) {
      const ay = p.y;
      // device y is top-down: native_hi at py0 (top), native_lo at py1 (bottom)
      const k = (ay.native_hi - ay.native_lo) / (p.py1 - p.py0);
      const nA = ay.native_hi - ((p.py0 - t.ty) / t.sy - p.py0) * k;
      const nB = ay.native_hi - ((p.py1 - t.ty) / t.sy - p.py0) * k;
      const fromStatic = identity && hasStatic(ay);
      let ticks = fromStatic ? staticTicks(ay, Math.min(nA, nB), Math.max(nA, nB)) : axisTicks(ay, Math.min(nA, nB), Math.max(nA, nB), 5);
      if (a.yLab && !fromStatic) ticks = fitYTicks(a.yLab, ay, Math.min(nA, nB), Math.max(nA, nB), ticks);
      const toSy = function (n: number): number { return t.sy * (p.py0 + (ay.native_hi - n) / k) + t.ty; };
      const gMaj = gridFor(a, "y", "major"), gMin = gridFor(a, "y", "minor");
      if (gMin) {
        const mb = minorBreaks(ticks.map(function (x) { return x.n; }));
        for (let i = 0; i < mb.length; i++) {
          const sy = toSy(mb[i]);
          if (isFinite(sy) && sy >= p.py0 - 0.5 && sy <= p.py1 + 0.5) minors.push(gridLine(p.px0, sy, p.px1, sy, gMin));
        }
      }
      for (let i = 0; i < ticks.length; i++) {
        const sy = toSy(ticks[i].n);
        if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
        if (gMaj) majors.push(gridLine(p.px0, sy, p.px1, sy, gMaj));
        if (a.yTick) ticks_.push(tickLine(a.yTick, sy, p));
        if (a.yLab) {
          const lab = axisLabel(ticks[i].label, a.yLab.pos, sy, a.yLab.anchor, a.yLab.baseline, a.yLab.rot);
          layer.appendChild(lab);
          noteLabelWidth(a.yLab, labelWidth(lab));
        }
      }
      if (a.y2Lab && a.y2Map) {
        const st = secTicks(a.y2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < st.length; i++) {
          const sy = t.sy * (p.py0 + (ay.native_hi - st[i].n) / k) + t.ty;
          if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
          const lab = axisLabel(st[i].label, a.y2Lab.pos, sy, a.y2Lab.anchor, a.y2Lab.baseline, a.y2Lab.rot);
          layer.appendChild(lab);
          noteLabelWidth(a.y2Lab, labelWidth(lab));
        }
      }
    }
    for (let i = 0; i < minors.length; i++) grid.appendChild(minors[i]);
    for (let i = 0; i < majors.length; i++) grid.appendChild(majors[i]);
    for (let i = 0; i < ticks_.length; i++) grid.appendChild(ticks_[i]);
  }

  return { setupAxisZoom, applyPanTransforms, retick };
}
