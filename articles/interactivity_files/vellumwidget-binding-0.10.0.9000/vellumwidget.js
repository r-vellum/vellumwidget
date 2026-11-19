// Generated from srcts/index.ts by esbuild — do not edit by hand.
"use strict";
(() => {
  // srcts/css.ts
  var STYLE_ID = "vellumwidget-style";
  var VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
/* The stage shrink-wraps the base svg in BOTH dimensions (inline-block sizes to
   content), so its box equals the svg's rendered box. The absolute overlays below
   fill THIS box, not the root's \u2014 the root can be taller AND wider than the svg
   (htmlwidgets stamps an explicit height; a fluid layout can stretch the width),
   and sizing the overlays to the root would letterbox their viewBox and shift
   every ring (down if the root is taller, sideways if it is wider). */
.vellumwidget-root .vellumwidget-stage { position: relative; display: inline-block; }
.vellumwidget-root .vellumwidget-svg-holder svg { max-width: 100%; height: auto; display: block; }
.vellumwidget-gesture .vellumwidget-svg-holder svg { touch-action: none; }
.vellumwidget-root.vellumwidget-mode-pan .vellumwidget-svg-holder svg { cursor: grab; }
.vellumwidget-root.vellumwidget-panning .vellumwidget-svg-holder svg { cursor: grabbing; }
.vellumwidget-root [data-key] { cursor: pointer; }
[data-key].vellumwidget-filtered { display: none; }
/* Legend click-to-hide / -mute (independent of the crosstalk cross-filter above,
   so the two never clobber each other). hidden removes the series' marks; muted
   keeps them but fades them right back; legend-off dims the toggled-off swatch
   so the legend shows which series are on. */
[data-key].vellumwidget-legend-hidden { display: none; }
[data-key].vellumwidget-legend-muted { opacity: 0.12; }
[data-key].vellumwidget-legend.vellumwidget-legend-off { opacity: 0.4; }
.vellumwidget-hovering [data-key]:not(.vellumwidget-legend) { opacity: var(--vellumwidget-dim-opacity, 0.28); }
.vellumwidget-hovering [data-key].vellumwidget-hl { opacity: 1; }
/* Conditional encoding (condition()): a non-member of an active selection with no
   explicit if_false is dimmed to the theme's dim opacity (the spotlight). An
   explicit if_false colour is applied inline (see applyConditions()). */
[data-key].vellumwidget-cond-dim { opacity: var(--vellumwidget-dim-opacity, 0.28); }
/* Large-scene hover: instead of the CSS rule above restyling every keyed node
   (O(n) per hover), the whole plot is dimmed once via the holder's opacity and the
   hovered marks are re-drawn crisp in this overlay (O(hovered)). See setHover(). */
.vellumwidget-root .vellumwidget-svg-holder { transition: none; }
/* Crisp-zoom point layer: above the base image, below the overlay rings. Never
   intercepts hit-testing (that stays on the base svg). Hidden until zoomed in. */
.vellumwidget-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
.vellumwidget-dim-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
/* Continuous colorbar filter: an overlay on the gradient bar. The dim rects cover
   the out-of-range ends; the handles are draggable. Out-of-range marks fade. */
.vellumwidget-colorbar-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 6; overflow: visible;
}
.vellumwidget-cb-dim { fill: rgba(255,255,255,0.66); pointer-events: none; }
@media (prefers-color-scheme: dark) { .vellumwidget-cb-dim { fill: rgba(17,24,39,0.66); } }
.vellumwidget-cb-handle {
  fill: #ffffff; stroke: #2563eb; stroke-width: 1.5px; pointer-events: auto;
}
.vellumwidget-root.vellumwidget-cb-v .vellumwidget-cb-handle { cursor: ns-resize; }
.vellumwidget-root.vellumwidget-cb-h .vellumwidget-cb-handle { cursor: ew-resize; }
[data-key].vellumwidget-colorfiltered { opacity: var(--vellumwidget-colorfilter-opacity, 0.12); }
/* Crosshair guide rule(s) for unified hover \u2014 above the base image / canvas,
   below the highlight rings so a highlighted mark still reads on top. */
.vellumwidget-crosshair-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 4; overflow: visible;
}
/* Axis-aware zoom: re-ticked axis LABELS overlay (gridlines are drawn inside the
   base svg's panel, under the marks). Pinned to the fixed base coordinate space. */
.vellumwidget-retick-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 3; overflow: visible;
}
.vellumwidget-crosshair-line {
  stroke: var(--vellumwidget-crosshair-stroke, rgba(75,85,99,0.85));
  stroke-width: 1px; stroke-dasharray: 4 3;
}
@media (prefers-color-scheme: dark) {
  .vellumwidget-crosshair-line { stroke: var(--vellumwidget-crosshair-stroke, rgba(209,213,219,0.85)); }
}
/* Raster-mode feedback rings (hover / selection), drawn on the overlay since the
   marks are a base image with no per-element nodes. Colours reuse the same CSS
   variables as the SVG-mode highlight/selection so theming carries over. */
.vellumwidget-fb-hov { fill: none; stroke: var(--vellumwidget-hl-stroke, #2563eb); stroke-width: 2px; }
.vellumwidget-fb-sel { fill: none; stroke: var(--vellumwidget-selected-stroke, #111827); stroke-width: 1.6px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-fb-sel { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
}
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var). */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: stroke fill;
}
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, #111827);
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: stroke fill;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: stroke fill;
}
[data-key]:focus { outline: none; }
[data-key]:focus-visible { outline: 2px solid var(--vellumwidget-focus-stroke, #2563eb); outline-offset: 1px; }
/* Visually-hidden but exposed to assistive technology (live region + data table). */
.vellumwidget-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; border: 0;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
.vellumwidget-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: var(--vellumwidget-tip-bg, rgba(17,24,39,0.94)); color: var(--vellumwidget-tip-fg, #fff);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: var(--vellumwidget-tip-fontsize, 12px); line-height: 1.45;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap;
  max-width: var(--vellumwidget-tip-maxwidth, 320px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.vellumwidget-tip.vellumwidget-show { opacity: 1; }
/* Sticky tooltip: accepts pointer events so links/buttons inside it are usable. */
.vellumwidget-tip.vellumwidget-tip-sticky { pointer-events: auto; }
.vellumwidget-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
/* Overview navigator: a full-width strip below the plot (a squashed mini-render
   of the whole scene) with a draggable/resizable window marking the visible x-range. */
.vellumwidget-nav {
  position: relative; width: 100%; margin-top: 4px; box-sizing: border-box;
  border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; overflow: hidden;
  background: rgba(0,0,0,0.02); touch-action: none; user-select: none;
}
.vellumwidget-nav-mini { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.85; }
.vellumwidget-nav-mini svg { width: 100%; height: 100%; display: block; }
/* The two regions outside the window are dimmed; the window itself is clear. */
.vellumwidget-nav-window {
  position: absolute; top: 0; bottom: 0; z-index: 2; cursor: grab;
  border-left: 1px solid #2563eb; border-right: 1px solid #2563eb;
  background: rgba(37,99,235,0.10); box-shadow: 0 0 0 100vmax rgba(0,0,0,0.12);
}
.vellumwidget-nav-window.vellumwidget-nav-grabbing { cursor: grabbing; }
.vellumwidget-nav-handle {
  position: absolute; top: 0; bottom: 0; width: 8px; z-index: 3; cursor: ew-resize;
  background: #2563eb; opacity: 0.35;
}
.vellumwidget-nav-handle-l { left: -1px; }
.vellumwidget-nav-handle-r { right: -1px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-nav { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.03); }
}
.vellumwidget-root.vellumwidget-mode-lasso .vellumwidget-svg-holder svg { cursor: crosshair; }
.vellumwidget-lasso {
  fill: rgba(37,99,235,0.10); stroke: #2563eb; stroke-width: 1px; stroke-dasharray: 4 3;
}
/* The persistent band of an active interval selection (select_interval()). */
.vellumwidget-interval {
  fill: rgba(37,99,235,0.10); stroke: #2563eb; stroke-width: 1px;
}
.vellumwidget-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.vellumwidget-root:hover .vellumwidget-toolbar { opacity: 1; }
.vellumwidget-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.vellumwidget-toolbar button:hover { background: rgba(0,0,0,0.08); }
.vellumwidget-toolbar button.vellumwidget-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .vellumwidget-tip { background: var(--vellumwidget-tip-bg, rgba(243,244,246,0.96)); color: var(--vellumwidget-tip-fg, #111827); }
  [data-key].vellumwidget-selected { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
  .vellumwidget-toolbar { background: rgba(31,41,55,0.9); }
  .vellumwidget-toolbar button { color: #f3f4f6; }
  .vellumwidget-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = VELLUMWIDGET_CSS;
    document.head.appendChild(s);
  }
  function cssEscape(value) {
    const anyCss = window.CSS;
    if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
    return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
  }

  // srcts/dom.ts
  function keyOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-key]");
    return hit ? hit.getAttribute("data-key") : null;
  }
  function vellumIdOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-vellum-id]");
    return hit ? hit.getAttribute("data-vellum-id") : null;
  }
  function sourceTable(prov, id) {
    const name = prov.sourceOf && prov.sourceOf[id] || "plot";
    const tbl = name !== "plot" && prov.sources ? prov.sources[name] : void 0;
    if (!tbl) return { source: "plot", fields: prov.fields, values: prov.values };
    const fields = Array.isArray(tbl.fields) ? tbl.fields : tbl.fields == null ? [] : [tbl.fields];
    return { source: name, fields, values: tbl.values };
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  var DRAG_THRESHOLD = 3;

  // srcts/elements.ts
  function asColumn(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
  function normalizeElements(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    const c = raw;
    const key = asColumn(c.key);
    const n = key.length;
    if (!n) return [];
    const x0 = asColumn(c.x0);
    const y0 = asColumn(c.y0);
    const x1 = asColumn(c.x1);
    const y1 = asColumn(c.y1);
    const mark = c.mark != null ? asColumn(c.mark) : null;
    const tooltip = c.tooltip != null ? asColumn(c.tooltip) : null;
    const hoverGroup = c.hover_group != null ? asColumn(c.hover_group) : null;
    const hoverColor = c.hover_color != null ? asColumn(c.hover_color) : null;
    const selectedColor = c.selected_color != null ? asColumn(c.selected_color) : null;
    const legendFor = c.legend_for != null ? asColumn(c.legend_for) : null;
    const legend = c.legend != null ? asColumn(c.legend) : null;
    const filterValue = c.filter_value != null ? asColumn(c.filter_value) : null;
    const cond = c.cond != null ? asColumn(c.cond) : null;
    const filt = c.filt != null ? asColumn(c.filt) : null;
    const join = c.join != null ? asColumn(c.join) : null;
    const source = c.source != null ? asColumn(c.source) : null;
    const target = c.target != null ? asColumn(c.target) : null;
    const ivNum = ["ix", "ixh", "iy", "iyh"].map(
      (f) => [f, c[f] != null ? asColumn(c[f]) : null]
    );
    const ixd = c.ixd != null ? asColumn(c.ixd) : null;
    const iyd = c.iyd != null ? asColumn(c.iyd) : null;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = { key: String(key[i]) };
      if (mark && mark[i] != null) e.mark = String(mark[i]);
      if (typeof x0[i] === "number") e.x0 = x0[i];
      if (typeof y0[i] === "number") e.y0 = y0[i];
      if (typeof x1[i] === "number") e.x1 = x1[i];
      if (typeof y1[i] === "number") e.y1 = y1[i];
      if (tooltip && tooltip[i] != null) e.tooltip = String(tooltip[i]);
      if (hoverGroup && hoverGroup[i] != null) e.hover_group = String(hoverGroup[i]);
      if (hoverColor && hoverColor[i] != null) e.hover_color = String(hoverColor[i]);
      if (selectedColor && selectedColor[i] != null) e.selected_color = String(selectedColor[i]);
      if (legendFor && legendFor[i] != null) e.legend_for = String(legendFor[i]);
      if (legend) {
        const v = legend[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) e.legend = v;
      }
      if (filterValue && typeof filterValue[i] === "number") e.filter_value = filterValue[i];
      if (cond) {
        const v = cond[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) {
          e.cond = Array.isArray(v) ? v : [String(v)];
        }
      }
      if (filt) {
        const v = filt[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) {
          e.filt = Array.isArray(v) ? v : [String(v)];
        }
      }
      if (join && join[i] != null) e.join = String(join[i]);
      if (source && source[i] != null) e.source = String(source[i]);
      if (target && target[i] != null) e.target = String(target[i]);
      for (let f = 0; f < ivNum.length; f++) {
        const col = ivNum[f][1];
        if (col && typeof col[i] === "number") e[ivNum[f][0]] = col[i];
      }
      if (ixd && ixd[i] != null) e.ixd = String(ixd[i]);
      if (iyd && iyd[i] != null) e.iyd = String(iyd[i]);
      out[i] = e;
    }
    return out;
  }
  function normalizePanels(raw) {
    if (raw == null) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  // srcts/tooltip.ts
  var TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
  function sanitizeTip(s) {
    let out = String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const t of TIP_TAGS) {
      out = out.replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">").replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">").replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
    }
    return out;
  }
  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  // srcts/features/a11y.ts
  function a11yFeature(ws) {
    function a11yLabel(k) {
      const m = ws.meta[k];
      return m && m.tooltip ? stripTags(m.tooltip) : k;
    }
    function focusLabel(k) {
      return a11yLabel(k) + (ws.selected[k] ? ", selected" : "");
    }
    function announce(msg) {
      if (ws.liveRegion && ws.liveRegion.textContent !== msg) ws.liveRegion.textContent = msg;
    }
    function showMarkFocus(i) {
      ws.focusIdx = i;
      const k = ws.focusables[i].key;
      ws.fx.clearClass("vellumwidget-focus");
      ws.fx.addClassForKeys([k], "vellumwidget-focus");
      ws.fx.setHover(k);
      announce(focusLabel(k));
    }
    function onMarkFocus(ev) {
      const k = keyOf(ev.target);
      if (k == null) return;
      const i = ws.focusables.findIndex((f) => f.key === k);
      if (i >= 0) showMarkFocus(i);
    }
    function onMarkBlur(ev) {
      const to = keyOf(ev.relatedTarget);
      if (to == null) {
        ws.focusIdx = -1;
        ws.fx.clearClass("vellumwidget-focus");
      }
    }
    function focusRoving(i) {
      if (!ws.focusables.length) return;
      const dir = i < ws.focusIdx ? -1 : 1;
      if (i < 0) i = 0;
      if (i >= ws.focusables.length) i = ws.focusables.length - 1;
      while (ws.focusables[i] && ws.fx.inert(ws.focusables[i].key)) {
        i += dir;
        if (i < 0 || i >= ws.focusables.length) return;
      }
      if (ws.focusIdx >= 0 && ws.focusables[ws.focusIdx]) {
        ws.focusables[ws.focusIdx].node.setAttribute("tabindex", "-1");
      }
      const f = ws.focusables[i];
      f.node.setAttribute("tabindex", "0");
      showMarkFocus(i);
      const n = f.node;
      if (typeof n.focus === "function") n.focus();
    }
    function markFocused() {
      return ws.opts.a11y && ws.focusIdx >= 0 && !!ws.focusables[ws.focusIdx];
    }
    function buildDataTable() {
      if (ws.tableEl) {
        ws.tableEl.remove();
        ws.tableEl = null;
      }
      if (!ws.opts.a11y || !ws.elements.length) return;
      const tbl = document.createElement("table");
      tbl.className = "vellumwidget-sr-only vellumwidget-data-table";
      const cap = document.createElement("caption");
      cap.textContent = "Data table";
      tbl.appendChild(cap);
      const head = document.createElement("tr");
      const h1 = document.createElement("th");
      h1.setAttribute("scope", "col");
      h1.textContent = "Item";
      const h2 = document.createElement("th");
      h2.setAttribute("scope", "col");
      h2.textContent = "Description";
      head.appendChild(h1);
      head.appendChild(h2);
      tbl.appendChild(head);
      const seen = {};
      for (let i = 0; i < ws.elements.length; i++) {
        const k = ws.elements[i].key;
        if (seen[k]) continue;
        seen[k] = true;
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.setAttribute("scope", "row");
        th.textContent = k;
        const td = document.createElement("td");
        td.textContent = a11yLabel(k);
        tr.appendChild(th);
        tr.appendChild(td);
        tbl.appendChild(tr);
      }
      ws.el.appendChild(tbl);
      ws.tableEl = tbl;
    }
    function setupA11y() {
      ws.focusables = [];
      ws.focusIdx = -1;
      if (!ws.opts.a11y || !ws.svgEl) {
        buildDataTable();
        return;
      }
      if (ws.rasterMode) {
        ws.svgEl.setAttribute("role", "img");
        if (ws.opts.alt) {
          ws.svgEl.removeAttribute("aria-labelledby");
          ws.svgEl.setAttribute("aria-label", ws.opts.alt);
        } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
          ws.svgEl.setAttribute("aria-label", "Chart");
        }
        return;
      }
      ws.svgEl.setAttribute("role", "graphics-document");
      ws.svgEl.setAttribute("aria-roledescription", "interactive chart");
      if (ws.opts.alt) {
        ws.svgEl.removeAttribute("aria-labelledby");
        ws.svgEl.setAttribute("aria-label", ws.opts.alt);
      } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
        ws.svgEl.setAttribute("aria-label", "Interactive chart");
      }
      if (!ws.liveRegion) {
        ws.liveRegion = document.createElement("div");
        ws.liveRegion.className = "vellumwidget-sr-only";
        ws.liveRegion.setAttribute("role", "status");
        ws.liveRegion.setAttribute("aria-live", "polite");
        ws.el.appendChild(ws.liveRegion);
      } else {
        ws.liveRegion.textContent = "";
      }
      const seen = {};
      for (let i = 0; i < ws.elements.length; i++) {
        const k = ws.elements[i].key;
        if (seen[k]) continue;
        const nodes = ws.nodesByKey[k];
        if (!nodes || !nodes.length) continue;
        seen[k] = true;
        const node = nodes[0];
        node.setAttribute("role", "graphics-symbol");
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-label", a11yLabel(k));
        node.addEventListener("focus", onMarkFocus);
        node.addEventListener("blur", onMarkBlur);
        ws.focusables.push({ key: k, node });
      }
      if (ws.focusables.length) ws.focusables[0].node.setAttribute("tabindex", "0");
      buildDataTable();
    }
    return { a11yLabel, announce, focusRoving, markFocused, setupA11y };
  }

  // srcts/features/constants.ts
  var DIM_OVERLAY_MIN = 2e3;
  var OVERLAY_MARK_CAP = 2e3;
  var PICK_CANDIDATES = 256;
  var SVGNS = "http://www.w3.org/2000/svg";
  var TIP_MULTI_CAP = 30;
  var MODE_ICON = { brush: "\u25AD", lasso: "\u25CC", pan: "\u270B" };
  var MODE_LABEL = { brush: "brush-select", lasso: "lasso-select", pan: "pan" };

  // srcts/scales.ts
  var INVERTIBLE = { identity: true, log10: true, sqrt: true, reverse: true };
  var GLYPH_MARKS = { point: true, circle: true, hexagon: true, sector: true };
  function canInvert(ax) {
    return !!ax && INVERTIBLE[ax.transform] === true;
  }
  function nativeToData(ax, nv) {
    switch (ax.transform) {
      case "log10":
        return Math.pow(10, nv);
      case "sqrt":
        return nv * nv;
      case "reverse":
        return nv;
      // identity map; the reversal is the decreasing domain
      default:
        return nv;
    }
  }
  function pxToDataX(p, px) {
    const ax = p.x;
    if (!canInvert(ax) || p.px1 === p.px0) return null;
    const nv = ax.native_lo + (px - p.px0) / (p.px1 - p.px0) * (ax.native_hi - ax.native_lo);
    return nativeToData(ax, nv);
  }
  function pxToDataY(p, py) {
    const ax = p.y;
    if (!canInvert(ax) || p.py1 === p.py0) return null;
    const frac = (py - p.py0) / (p.py1 - p.py0);
    const nv = ax.native_hi + frac * (ax.native_lo - ax.native_hi);
    return nativeToData(ax, nv);
  }
  function selEncodings(sel) {
    const enc = sel.encodings != null ? asColumn(sel.encodings) : [];
    const out = enc.filter((e) => e === "x" || e === "y");
    if (out.length) return out;
    if (sel.on === "x" || sel.on === "y") return [sel.on];
    return ["x", "y"];
  }
  function axisForEncoding(p, enc) {
    if (p.x && p.x.aes === enc) return { ax: p.x, horizontal: true };
    if (p.y && p.y.aes === enc) return { ax: p.y, horizontal: false };
    if (p.x && p.x.aes || p.y && p.y.aes) return null;
    if (enc === "x" && p.x) return { ax: p.x, horizontal: true };
    if (enc === "y" && p.y) return { ax: p.y, horizontal: false };
    return null;
  }
  function intervalRangeOf(p, rect, encs) {
    const out = { panel: p.name };
    for (let i = 0; i < encs.length; i++) {
      const enc = encs[i];
      const hit = axisForEncoding(p, enc);
      if (!hit) return null;
      const a = hit.horizontal ? pxToDataX(p, rect.x0) : pxToDataY(p, rect.y0);
      const b = hit.horizontal ? pxToDataX(p, rect.x1) : pxToDataY(p, rect.y1);
      if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
      const ch = { lo: Math.min(a, b), hi: Math.max(a, b) };
      if (hit.ax.type === "discrete") {
        const levels = hit.ax.levels != null ? asColumn(hit.ax.levels) : [];
        if (!levels.length) return null;
        ch.levels = [];
        for (let k = 0; k < levels.length; k++) {
          const pos = k + 1;
          if (pos >= ch.lo && pos <= ch.hi) ch.levels.push(String(levels[k]));
        }
      }
      out[enc] = ch;
    }
    return out;
  }
  function inInterval(e, r) {
    const chans = [["x", r.x], ["y", r.y]];
    let tested = false;
    for (let i = 0; i < chans.length; i++) {
      const enc = chans[i][0], ch = chans[i][1];
      if (!ch) continue;
      tested = true;
      if (ch.levels) {
        const v = enc === "x" ? e.ixd : e.iyd;
        if (v == null || ch.levels.indexOf(v) < 0) return false;
      } else {
        const lo = enc === "x" ? e.ix : e.iy;
        if (typeof lo !== "number" || !isFinite(lo)) return false;
        const hi0 = enc === "x" ? e.ixh : e.iyh;
        const hi = typeof hi0 === "number" && isFinite(hi0) ? hi0 : lo;
        if (hi < ch.lo || lo > ch.hi) return false;
      }
    }
    return tested;
  }
  function intervalKeys(elems, r) {
    const out = [];
    const seen = {};
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!seen[e.key] && inInterval(e, r)) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }

  // srcts/ticks.ts
  function niceTicks(lo, hi, count) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo || count < 1) return [];
    const step0 = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }
  function fmtTick(v, step) {
    if (v === 0) return "0";
    const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-9)));
    let s = v.toFixed(decimals);
    if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
    return s;
  }
  function dataToNative(ax, d) {
    switch (ax.transform) {
      case "log10":
        return Math.log10(d);
      case "sqrt":
        return Math.sqrt(d);
      default:
        return d;
    }
  }
  function fmtRNum(vals) {
    let dec = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (!isFinite(v) || v === 0) continue;
      const target = Number(v.toPrecision(7));
      let d = 0;
      while (d < 15 && Math.abs(Number(v.toFixed(d)) - target) > Math.abs(target) * 1e-9) d++;
      if (d > dec) dec = d;
    }
    return vals.map(function(v) {
      return isFinite(v) ? v.toFixed(dec) : String(v);
    });
  }
  function logTicks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return { ticks: [], linear: false };
    const need = Math.max(2, n - 2);
    const p0 = Math.ceil(lo - 1e-9), p1 = Math.floor(hi + 1e-9);
    if (p1 - p0 + 1 >= need) {
      const by = Math.floor((hi - lo) / n) + 1;
      const out = [];
      for (let k = Math.ceil(p0 / by) * by; k <= p1; k += by) {
        out.push({ n: k, d: Number(Math.pow(10, k).toPrecision(12)) });
      }
      if (out.length >= need || by === 1) return { ticks: out, linear: false };
    }
    const sets = [[1, 3], [1, 2, 5], [1, 2, 3, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
    for (let s = 0; s < sets.length; s++) {
      const out = [];
      for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
        for (let j = 0; j < sets[s].length; j++) {
          const m = sets[s][j];
          const nv = k + Math.log10(m);
          if (nv < lo - 1e-9 || nv > hi + 1e-9) continue;
          out.push({ n: nv, d: Number((m * Math.pow(10, k)).toPrecision(12)) });
        }
      }
      if (out.length >= need) return { ticks: out, linear: false };
    }
    const dlo = Math.pow(10, lo), dhi = Math.pow(10, hi);
    const lin = niceTicks(dlo, dhi, n).filter(function(d) {
      return d > 0;
    }).map(function(d) {
      return { n: Math.log10(d), d };
    });
    return { ticks: lin, linear: true };
  }
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  var WDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function pad2(v) {
    return v < 10 ? "0" + v : String(v);
  }
  function strftimeUTC(fmt, ms) {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return fmt.replace(/%([a-zA-Z%])/g, function(_m, c) {
      switch (c) {
        case "Y":
          return String(d.getUTCFullYear());
        case "y":
          return pad2((d.getUTCFullYear() % 100 + 100) % 100);
        case "m":
          return pad2(d.getUTCMonth() + 1);
        case "d":
          return pad2(d.getUTCDate());
        case "e":
          return (d.getUTCDate() < 10 ? " " : "") + d.getUTCDate();
        case "H":
          return pad2(d.getUTCHours());
        case "I":
          return pad2((d.getUTCHours() + 11) % 12 + 1);
        case "p":
          return d.getUTCHours() < 12 ? "AM" : "PM";
        case "M":
          return pad2(d.getUTCMinutes());
        case "S":
          return pad2(d.getUTCSeconds());
        case "b":
        case "h":
          return MONTHS[d.getUTCMonth()].slice(0, 3);
        case "B":
          return MONTHS[d.getUTCMonth()];
        case "a":
          return WDAYS[d.getUTCDay()].slice(0, 3);
        case "A":
          return WDAYS[d.getUTCDay()];
        case "j": {
          const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
          return (doy < 10 ? "00" : doy < 100 ? "0" : "") + doy;
        }
        case "%":
          return "%";
        default:
          return "%" + c;
      }
    });
  }
  function fmtRank(fmt) {
    if (/%S/.test(fmt)) return 0;
    if (/%M/.test(fmt)) return 1;
    if (/%[HIp]/.test(fmt)) return 2;
    if (/%[deja]|%A/.test(fmt)) return 3;
    if (/%[mbBh]/.test(fmt)) return 4;
    return 5;
  }
  var TIME_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%H:%M:%S",
    "%H:%M",
    "%b %d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d.%m.%Y",
    "%m/%d",
    "%d/%m",
    "%b %d",
    "%d %b",
    "%b %d %Y",
    "%d %b %Y",
    "%B %d",
    "%d %B",
    "%B %d, %Y",
    "%e %b",
    "%Y-%m",
    "%b %Y",
    "%B %Y",
    "%b %y",
    "%m/%Y",
    "%b",
    "%B",
    "%Y",
    "%y"
  ];
  var TZ_OFFSETS = function() {
    const out = [0];
    for (let q = 1; q <= 56; q++) out.push(q * 9e5, -q * 9e5);
    return out;
  }();
  var timeFmtCache = /* @__PURE__ */ new WeakMap();
  function detectTimeFormat(ax) {
    const hit = timeFmtCache.get(ax);
    if (hit) return hit;
    const breaks = asColumn(ax.breaks), labels = asColumn(ax.labels).map(String);
    const unitMs = ax.time_unit === "second" ? 1e3 : 864e5;
    let info = { fmt: null, off: 0 };
    if (breaks.length && breaks.length === labels.length) {
      const offs = ax.time_unit === "second" ? TZ_OFFSETS : [0];
      search:
        for (let o = 0; o < offs.length; o++) {
          for (let f = 0; f < TIME_FORMATS.length; f++) {
            let all = true;
            for (let i = 0; i < breaks.length && all; i++) {
              all = strftimeUTC(TIME_FORMATS[f], Number(breaks[i]) * unitMs + offs[o]) === labels[i].trim();
            }
            if (all) {
              info = { fmt: TIME_FORMATS[f], off: offs[o] };
              break search;
            }
          }
        }
    }
    timeFmtCache.set(ax, info);
    return info;
  }
  var TIME_STEPS = function() {
    const s = 1e3, mi = 60 * s, h = 60 * mi, d = 24 * h;
    const out = [];
    [1, 2, 5, 10, 15, 30].forEach(function(k) {
      out.push({ rank: 0, ms: k * s });
    });
    [1, 2, 5, 10, 15, 30].forEach(function(k) {
      out.push({ rank: 1, ms: k * mi });
    });
    [1, 3, 6, 12].forEach(function(k) {
      out.push({ rank: 2, ms: k * h });
    });
    [1, 2, 7].forEach(function(k) {
      out.push({ rank: 3, ms: k * d });
    });
    [1, 2, 3, 6].forEach(function(k) {
      out.push({ rank: 4, ms: k * 30.4375 * d, mo: k });
    });
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1e3].forEach(function(k) {
      out.push({ rank: 5, ms: k * 365.25 * d, yr: k });
    });
    return out;
  }();
  function timeTicks(ax, lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [];
    const isDate = ax.time_unit !== "second";
    const unitMs = isDate ? 864e5 : 1e3;
    const info = detectTimeFormat(ax);
    const off = info.off;
    const slo = lo * unitMs + off, shi = hi * unitMs + off;
    const span = shi - slo;
    let step = null;
    for (let i = 0; i < TIME_STEPS.length; i++) {
      const st = TIME_STEPS[i];
      if (isDate && st.rank < 3) continue;
      if (span / st.ms <= n) {
        step = st;
        break;
      }
    }
    if (!step) {
      const yrs = span / (365.25 * 864e5);
      const raw = yrs / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const k = (raw / mag < 2 ? 2 : raw / mag < 5 ? 5 : 10) * mag;
      step = { rank: 5, ms: k * 365.25 * 864e5, yr: k };
    }
    const walls = [];
    if (step.yr) {
      const y0 = new Date(slo).getUTCFullYear(), y1 = new Date(shi).getUTCFullYear();
      for (let y = Math.ceil(y0 / step.yr) * step.yr; y <= y1; y += step.yr) walls.push(Date.UTC(y, 0, 1));
    } else if (step.mo) {
      const a = new Date(slo), b = new Date(shi);
      let mIdx = a.getUTCFullYear() * 12 + a.getUTCMonth();
      mIdx = Math.ceil(mIdx / step.mo) * step.mo;
      const mEnd = b.getUTCFullYear() * 12 + b.getUTCMonth();
      for (; mIdx <= mEnd; mIdx += step.mo) walls.push(Date.UTC(Math.floor(mIdx / 12), mIdx % 12, 1));
    } else {
      const origin = step.ms === 7 * 864e5 ? 4 * 864e5 : 0;
      for (let t = Math.ceil((slo - origin) / step.ms - 1e-9) * step.ms + origin; t <= shi + 1e-6; t += step.ms) {
        walls.push(t);
      }
    }
    const defFmt = step.rank >= 5 ? "%Y" : step.rank === 4 ? "%Y-%m" : step.rank === 3 ? "%Y-%m-%d" : step.rank === 0 ? "%H:%M:%S" : "%H:%M";
    const useStatic = info.fmt != null && fmtRank(info.fmt) <= step.rank;
    const out = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w < slo - 1e-6 || w > shi + 1e-6) continue;
      let fmt = useStatic ? info.fmt : defFmt;
      if (!useStatic && step.rank <= 2 && w % 864e5 === 0) fmt = "%Y-%m-%d";
      out.push({ n: (w - off) / unitMs, label: strftimeUTC(fmt, w) });
    }
    return out;
  }
  var NICE_TRANSFORMS = { identity: true, reverse: true, sqrt: true };
  function hasStaticBreaks(ax) {
    const b = asColumn(ax.breaks), l = asColumn(ax.labels);
    return b.length > 0 && b.length === l.length;
  }
  function axisRetickable(ax) {
    if (!ax) return true;
    if (ax.type === "discrete" || ax.type === "binned") return hasStaticBreaks(ax);
    if (ax.time_unit === "day" || ax.time_unit === "second") return true;
    if (ax.transform === "log10") return true;
    if (ax.type === "continuous" && NICE_TRANSFORMS[ax.transform]) return true;
    return hasStaticBreaks(ax);
  }
  function axisTicks(ax, lo, hi, n) {
    if (!(hi > lo)) return [];
    const statics = function() {
      const b = asColumn(ax.breaks), l = asColumn(ax.labels);
      const tol = (hi - lo) * 1e-6;
      const out = [];
      for (let i = 0; i < b.length && i < l.length; i++) {
        const v = Number(b[i]);
        if (isFinite(v) && v >= lo - tol && v <= hi + tol) out.push({ n: v, label: String(l[i]) });
      }
      return out;
    };
    if (ax.type === "discrete" || ax.type === "binned") return statics();
    if (ax.time_unit === "day" || ax.time_unit === "second") return timeTicks(ax, lo, hi, n);
    if (ax.transform === "log10") {
      const lt = logTicks(lo, hi, n), t = lt.ticks;
      const step = t.length > 1 ? t[1].d - t[0].d : 1;
      const labs = lt.linear ? t.map(function(x) {
        return fmtTick(x.d, step);
      }) : fmtRNum(t.map(function(x) {
        return x.d;
      }));
      return t.map(function(x, i) {
        return { n: x.n, label: labs[i] };
      });
    }
    if (NICE_TRANSFORMS[ax.transform]) {
      const sq = ax.transform === "sqrt";
      const a = nativeToData(ax, sq ? Math.max(lo, 0) : lo), b = nativeToData(ax, sq ? Math.max(hi, 0) : hi);
      const dlo = Math.min(a, b), dhi = Math.max(a, b);
      const ticks = niceTicks(dlo, dhi, n);
      const step = ticks.length > 1 ? ticks[1] - ticks[0] : dhi - dlo;
      return ticks.map(function(d) {
        return { n: dataToNative(ax, d), label: fmtTick(d, step) };
      });
    }
    return statics();
  }

  // srcts/viewbox.ts
  function zoomViewBox(vb, factor, cx, cy) {
    const w = vb.w / factor;
    const h = vb.h / factor;
    return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
  }
  function parseViewBox(s) {
    if (!s) return null;
    const p = s.trim().split(/[ ,]+/).map(Number);
    if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
    return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  function fmtViewBox(vb) {
    return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
  }
  function isZoomedIn(vb, vb0) {
    return vb.w < vb0.w * 0.999 || vb.h < vb0.h * 0.999;
  }
  function userToCanvas(vb, cw, ch, x, y) {
    return { px: (x - vb.x) / vb.w * cw, py: (y - vb.y) / vb.h * ch };
  }
  function viewToPan(vb, vb0) {
    const sx = vb.w ? vb0.w / vb.w : 1;
    const sy = vb.h ? vb0.h / vb.h : 1;
    return { sx, sy, tx: vb0.x - vb.x * sx, ty: vb0.y - vb.y * sy };
  }
  function panToView(vb, vb0, x, y) {
    const t = viewToPan(vb, vb0);
    return { x: t.sx ? vb.x + (x - vb0.x) / t.sx : x, y: t.sy ? vb.y + (y - vb0.y) / t.sy : y };
  }
  function conjugatePan(t, ax, bx, ay, by) {
    return { sx: t.sx, sy: t.sy, tx: ax * t.tx + bx * (1 - t.sx), ty: ay * t.ty + by * (1 - t.sy) };
  }

  // srcts/features/axisZoom.ts
  function axisZoomFeature(ws) {
    function setupAxisZoom() {
      for (let i = 0; i < ws.azPanels.length; i++) {
        const g = ws.azPanels[i].grid;
        if (g && g.parentNode) g.parentNode.removeChild(g);
      }
      ws.azPanels = [];
      ws.panGroup = null;
      ws.axisZoomActive = false;
      ws.anchorPanel = null;
      if (ws.retickLayer) {
        ws.retickLayer.remove();
        ws.retickLayer = null;
      }
      if (!ws.opts.axisZoom || ws.rasterMode || !ws.svgEl || !ws.vb0 || !ws.stage || !ws.panels.length) return;
      for (let i = 0; i < ws.panels.length; i++) {
        if (!axisRetickable(ws.panels[i].x) || !axisRetickable(ws.panels[i].y)) return;
      }
      if (!ws.svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text')) return;
      const pans = ws.svgEl.querySelectorAll("[data-vellum-pan]");
      for (let i = 0; i < pans.length; i++) {
        const nm = pans[i].getAttribute("data-vellum-pan");
        if (!ws.panels.some(function(p) {
          return p.name === nm;
        })) return;
      }
      const ref = ws.panels[0];
      const rw = ref.px1 - ref.px0, rh = ref.py1 - ref.py0;
      if (!rw || !rh) return;
      const found = [];
      for (let i = 0; i < ws.panels.length; i++) {
        const p = ws.panels[i];
        const pan = ws.svgEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]');
        const outer = ws.svgEl.querySelector('[data-vellum-panel="' + cssEscape(p.name) + '"]');
        if (!pan || !outer) return;
        const ax = (p.px1 - p.px0) / rw, ay = (p.py1 - p.py0) / rh;
        if (!(ax > 0) || !(ay > 0)) return;
        found.push({
          p,
          pan,
          outer,
          grid: null,
          ax,
          bx: p.px0 - ax * ref.px0,
          ay,
          by: p.py0 - ay * ref.py0,
          xLab: null,
          yLab: null
        });
      }
      ws.azPanels = found;
      ws.panGroup = found[0].pan;
      ws.axisZoomActive = true;
      scrapeAxisStyle();
      scrapeAxisAnchors();
      hideStaticAxes();
      for (let i = 0; i < ws.azPanels.length; i++) {
        const a = ws.azPanels[i];
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-retick-grid");
        a.outer.insertBefore(g, a.pan);
        a.grid = g;
      }
      ws.retickLayer = document.createElementNS(SVGNS, "svg");
      ws.retickLayer.setAttribute("class", "vellumwidget-retick-layer");
      ws.retickLayer.setAttribute("aria-hidden", "true");
      ws.retickLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.stage.appendChild(ws.retickLayer);
      applyPanTransforms();
      setupConstantMarks();
      retick();
    }
    function applyPanTransforms() {
      if (!ws.vb0) return;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const t = ws.fx.azT(ws.azPanels[i]);
        ws.azPanels[i].pan.setAttribute("transform", ws.fx.fmtPan(t));
        setPanScaleVars(ws.azPanels[i].pan, t);
      }
    }
    function setPanScaleVars(g, t) {
      g.style.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
      g.style.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
    }
    function setupConstantMarks() {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale" || !ws.panGroup) return;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!e.mark) continue;
        const nodes = ws.nodesByKey[e.key];
        if (!nodes) continue;
        const glyph = GLYPH_MARKS[e.mark] === true;
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j];
          if (!ws.azPanels.some(function(a) {
            return a.pan.contains(node);
          })) continue;
          if (glyph) {
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
    function transAsCss(node) {
      const t = (node.getAttribute("transform") || "").trim();
      if (!t) return "";
      const N = "([-+\\d.eE]+)";
      const m = new RegExp(
        "matrix\\(\\s*" + [N, N, N, N, N, N].join("[\\s,]+") + "\\s*\\)"
      ).exec(t);
      if (m) {
        const v = m.slice(1, 7).map(Number);
        if (v.some(function(x) {
          return !isFinite(x);
        })) return "";
        return "matrix(" + v.join(",") + ")";
      }
      const tr = new RegExp(
        "translate\\(\\s*" + N + "(?:[\\s,]+" + N + ")?\\s*\\)"
      ).exec(t);
      if (tr) {
        const tx = Number(tr[1]), ty = tr[2] === void 0 ? 0 : Number(tr[2]);
        if (!isFinite(tx) || !isFinite(ty)) return "";
        return "translate(" + tx + "px," + ty + "px)";
      }
      return "";
    }
    function transTranslate(node) {
      const t = node.getAttribute("transform") || "";
      const m = /matrix\(\s*[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(t) || /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/.exec(t);
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
    }
    function scrapeAxisStyle() {
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
    function scrapeAxisAnchors() {
      if (!ws.svgEl) return;
      const groups = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let g = 0; g < groups.length; g++) {
        const isX = /^axis-x/.test(groups[g].getAttribute("data-vellum-panel") || "");
        const texts = groups[g].querySelectorAll("text");
        if (!texts.length) continue;
        let sx = 0, sy = 0, n = 0, gap = 0;
        let first = null;
        for (let i = 0; i < texts.length; i++) {
          const tr = transTranslate(texts[i]);
          const x = tr.tx + (parseFloat(texts[i].getAttribute("x") || "") || 0);
          const y = tr.ty + (parseFloat(texts[i].getAttribute("y") || "") || 0);
          if (!first) first = { x, y };
          else if (isX && !gap && y - first.y > 1) gap = y - first.y;
          sx += x;
          sy += y;
          n++;
        }
        if (!first || !n) continue;
        const mx = sx / n, my = sy / n;
        let best = null, bestD = Infinity;
        for (let i = 0; i < ws.azPanels.length; i++) {
          const p = ws.azPanels[i].p;
          let d;
          if (isX) {
            const slack = (p.px1 - p.px0) / 4;
            if (mx < p.px0 - slack || mx > p.px1 + slack) continue;
            d = first.y >= p.py1 - 1 ? first.y - p.py1 : first.y <= p.py0 + 1 ? p.py0 - first.y : Infinity;
          } else {
            const slack = (p.py1 - p.py0) / 4;
            if (my < p.py0 - slack || my > p.py1 + slack) continue;
            d = first.x <= p.px0 + 1 ? p.px0 - first.x : first.x >= p.px1 - 1 ? first.x - p.px1 : Infinity;
          }
          if (d < bestD) {
            bestD = d;
            best = ws.azPanels[i];
          }
        }
        if (!best) continue;
        const t0 = texts[0];
        const anchor = {
          pos: isX ? first.y : first.x,
          // x labels centre on their tick (vellum centres wrapped lines itself, with
          // a start anchor and per-line offsets, so its anchor isn't reusable there).
          anchor: isX ? "middle" : t0.getAttribute("text-anchor") || "end",
          baseline: t0.getAttribute("dominant-baseline") || (isX ? "text-before-edge" : "central"),
          gap
        };
        if (isX && !best.xLab) best.xLab = anchor;
        if (!isX && !best.yLab) best.yLab = anchor;
      }
    }
    function hideStaticAxes() {
      if (!ws.svgEl) return;
      const hide = ws.svgEl.querySelectorAll(
        '[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]'
      );
      for (let i = 0; i < hide.length; i++) hide[i].style.display = "none";
    }
    function gridLine(x1, y1, x2, y2) {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", ws.axisStyle.gridStroke);
      l.setAttribute("stroke-width", String(ws.axisStyle.gridWidth));
      return l;
    }
    function axisLabel(text, x, y, anchor, baseline) {
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      t.setAttribute("fill", ws.axisStyle.textFill);
      t.setAttribute("font-family", ws.axisStyle.fontFamily);
      t.setAttribute("font-size", String(ws.axisStyle.fontSize));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("dominant-baseline", baseline);
      t.textContent = text;
      return t;
    }
    function wrapLabel(t, text, x, gap) {
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
    function retick() {
      if (!ws.axisZoomActive || !ws.vb || !ws.vb0 || !ws.retickLayer) return;
      while (ws.retickLayer.firstChild) ws.retickLayer.removeChild(ws.retickLayer.firstChild);
      for (let i = 0; i < ws.azPanels.length; i++) retickPanel(ws.azPanels[i]);
    }
    function retickPanel(a) {
      const p = a.p, grid = a.grid, layer = ws.retickLayer;
      if (!grid || !layer) return;
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      const t = ws.fx.azT(a);
      if (p.x && p.px1 !== p.px0) {
        const ax = p.x;
        const k = (ax.native_hi - ax.native_lo) / (p.px1 - p.px0);
        const nA = ax.native_lo + ((p.px0 - t.tx) / t.sx - p.px0) * k;
        const nB = ax.native_lo + ((p.px1 - t.tx) / t.sx - p.px0) * k;
        const ticks = axisTicks(ax, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const px = p.px0 + (ticks[i].n - ax.native_lo) / k;
          const sx = t.sx * px + t.tx;
          if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
          grid.appendChild(gridLine(sx, p.py0, sx, p.py1));
          if (a.xLab) {
            const lab = axisLabel(ticks[i].label, sx, a.xLab.pos, a.xLab.anchor, a.xLab.baseline);
            if (a.xLab.gap > 0) wrapLabel(lab, ticks[i].label, sx, a.xLab.gap);
            layer.appendChild(lab);
          }
        }
      }
      if (p.y && p.py1 !== p.py0) {
        const ay = p.y;
        const k = (ay.native_hi - ay.native_lo) / (p.py1 - p.py0);
        const nA = ay.native_hi - ((p.py0 - t.ty) / t.sy - p.py0) * k;
        const nB = ay.native_hi - ((p.py1 - t.ty) / t.sy - p.py0) * k;
        const ticks = axisTicks(ay, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const py = p.py0 + (ay.native_hi - ticks[i].n) / k;
          const sy = t.sy * py + t.ty;
          if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
          grid.appendChild(gridLine(p.px0, sy, p.px1, sy));
          if (a.yLab) {
            layer.appendChild(axisLabel(ticks[i].label, a.yLab.pos, sy, a.yLab.anchor, a.yLab.baseline));
          }
        }
      }
    }
    return { setupAxisZoom, applyPanTransforms, retick };
  }

  // srcts/features/colorbar.ts
  function colorbarFeature(ws) {
    function cbPos(v) {
      const cb = ws.colorbar;
      const t = cb.hi === cb.lo ? 0 : (v - cb.lo) / (cb.hi - cb.lo);
      if (cb.orientation === "h") {
        const f2 = cb.reverse ? 1 - t : t;
        return cb.x0 + f2 * (cb.x1 - cb.x0);
      }
      const f = cb.reverse ? t : 1 - t;
      return cb.y0 + f * (cb.y1 - cb.y0);
    }
    function cbValueAt(pos) {
      const cb = ws.colorbar;
      if (cb.orientation === "h") {
        let f2 = cb.x1 === cb.x0 ? 0 : (pos - cb.x0) / (cb.x1 - cb.x0);
        const t2 = cb.reverse ? 1 - f2 : f2;
        return cb.lo + t2 * (cb.hi - cb.lo);
      }
      let f = cb.y1 === cb.y0 ? 0 : (pos - cb.y0) / (cb.y1 - cb.y0);
      const t = cb.reverse ? f : 1 - f;
      return cb.lo + t * (cb.hi - cb.lo);
    }
    function cbRect(x, y, w, h, cls) {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(Math.max(0, w)));
      r.setAttribute("height", String(Math.max(0, h)));
      r.setAttribute("class", cls);
      return r;
    }
    function drawColorbarControl() {
      if (!ws.colorbarLayer) return;
      while (ws.colorbarLayer.firstChild) ws.colorbarLayer.removeChild(ws.colorbarLayer.firstChild);
      if (!ws.colorbar || !ws.colorRange) return;
      const cb = ws.colorbar;
      const pa = cbPos(ws.colorRange.a);
      const pb = cbPos(ws.colorRange.b);
      const lo = Math.min(pa, pb);
      const hi = Math.max(pa, pb);
      const mkHandle = (pos, which) => {
        const H = 4;
        const r = cb.orientation === "h" ? cbRect(pos - H / 2, cb.y0 - 2, H, cb.y1 - cb.y0 + 4, "vellumwidget-cb-handle") : cbRect(cb.x0 - 2, pos - H / 2, cb.x1 - cb.x0 + 4, H, "vellumwidget-cb-handle");
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
    function applyColorFilter() {
      ws.fx.clearClass("vellumwidget-colorfiltered");
      ws.colorHiddenSet = {};
      if (!ws.colorbar || !ws.colorRange) {
        ws.fx.shinyInput("colorfilter", null);
        return;
      }
      const a = ws.colorRange.a;
      const b = ws.colorRange.b;
      const full = a <= ws.colorbar.lo + 1e-9 && b >= ws.colorbar.hi - 1e-9;
      if (!full) {
        const outKeys = [];
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
    function setColorRange(a, b) {
      if (!ws.colorbar) return;
      const lo = ws.colorbar.lo, hi = ws.colorbar.hi;
      a = Math.min(hi, Math.max(lo, a));
      b = Math.min(hi, Math.max(lo, b));
      ws.colorRange = { a: Math.min(a, b), b: Math.max(a, b) };
      drawColorbarControl();
      applyColorFilter();
    }
    function buildColorbar() {
      if (ws.colorbarLayer) {
        ws.colorbarLayer.remove();
        ws.colorbarLayer = null;
      }
      ws.colorHiddenSet = {};
      ws.colorRange = null;
      ws.el.classList.remove("vellumwidget-cb-v", "vellumwidget-cb-h");
      if (!ws.colorbar || ws.rasterMode || !ws.stage) return;
      ws.colorbarLayer = document.createElementNS(SVGNS, "svg");
      ws.colorbarLayer.setAttribute("class", "vellumwidget-colorbar-layer");
      ws.colorbarLayer.setAttribute("aria-hidden", "true");
      if (ws.vb0) ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.stage.appendChild(ws.colorbarLayer);
      ws.el.classList.add(ws.colorbar.orientation === "h" ? "vellumwidget-cb-h" : "vellumwidget-cb-v");
      ws.colorRange = { a: ws.colorbar.lo, b: ws.colorbar.hi };
      drawColorbarControl();
      wireColorbar();
    }
    function wireColorbar() {
      if (!ws.colorbarLayer) return;
      let dragWhich = "";
      const onMove = (ev) => {
        if (!dragWhich || !ws.colorbar || !ws.colorRange) return;
        const u = ws.fx.toUser(ev.clientX, ev.clientY);
        const v = cbValueAt(ws.colorbar.orientation === "h" ? u.x : u.y);
        if (dragWhich === "a") setColorRange(v, ws.colorRange.b);
        else setColorRange(ws.colorRange.a, v);
      };
      const onUp = () => {
        dragWhich = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      ws.colorbarLayer.addEventListener("pointerdown", function(ev) {
        const w = ev.target.getAttribute && ev.target.getAttribute("data-cb");
        if (w !== "a" && w !== "b") return;
        ev.preventDefault();
        ev.stopPropagation();
        dragWhich = w;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
      ws.colorbarLayer.addEventListener("dblclick", function(ev) {
        if (!ws.colorbar) return;
        ev.preventDefault();
        setColorRange(ws.colorbar.lo, ws.colorbar.hi);
      });
    }
    return { setColorRange, buildColorbar };
  }

  // srcts/geometry.ts
  function rectsIntersect(a, b) {
    return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  }
  function distToBbox(x, y, b) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function hasBbox(e) {
    return typeof e.x0 === "number" && typeof e.y0 === "number";
  }
  function isRoundMark(mark) {
    return mark === "point" || mark === "points" || mark === "circle" || mark === "circles";
  }
  function distToSegment2(x, y, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
    return dx * dx + dy * dy;
  }
  function distToGeom(x, y, g, gx, gy, box) {
    const at = g.at, n = g.n;
    if (n <= 0) return Infinity;
    if (g.kind === "point") {
      const dx = x - gx[at], dy = y - gy[at];
      const d = Math.sqrt(dx * dx + dy * dy);
      const r = box ? Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2 : 0;
      return d > r ? d - r : 0;
    }
    if (n === 1) {
      const dx = x - gx[at], dy = y - gy[at];
      return Math.sqrt(dx * dx + dy * dy);
    }
    if (g.kind === "rect" || g.kind === "text" || g.kind === "roundrect") {
      return distToBbox(x, y, {
        x0: Math.min(gx[at], gx[at + 1]),
        x1: Math.max(gx[at], gx[at + 1]),
        y0: Math.min(gy[at], gy[at + 1]),
        y1: Math.max(gy[at], gy[at + 1])
      });
    }
    const closed = g.kind === "polygon" || g.kind === "path" || g.kind === "hexagon" || g.kind === "sector";
    const rings = g.rings || [n];
    let best = Infinity;
    let cross = 0;
    let wind = 0;
    let ra = at;
    for (let r = 0; r < rings.length; r++) {
      const rn = rings[r] | 0;
      if (rn <= 0) continue;
      if (closed && rn >= 3) {
        for (let i = 0, j = rn - 1; i < rn; j = i++) {
          const xi = gx[ra + i], yi = gy[ra + i];
          const xj = gx[ra + j], yj = gy[ra + j];
          if (yi > y !== yj > y) {
            if (x < (xj - xi) * (y - yi) / (yj - yi) + xi) cross++;
            const side = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
            if (yi > yj) {
              if (side > 0) wind++;
            } else if (side < 0) wind--;
          }
        }
      }
      for (let i = 1; i < rn; i++) {
        const d2 = distToSegment2(x, y, gx[ra + i - 1], gy[ra + i - 1], gx[ra + i], gy[ra + i]);
        if (d2 < best) best = d2;
      }
      if (closed && rn >= 3) {
        const d2 = distToSegment2(x, y, gx[ra + rn - 1], gy[ra + rn - 1], gx[ra], gy[ra]);
        if (d2 < best) best = d2;
      }
      ra += rn;
    }
    if (closed && (g.evenodd ? (cross & 1) === 1 : wind !== 0)) return 0;
    return Math.sqrt(best);
  }
  function unionBbox(elems, keys) {
    let out = null;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e) || !keys[e.key]) continue;
      if (!out) out = { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 };
      else {
        out.x0 = Math.min(out.x0, e.x0);
        out.y0 = Math.min(out.y0, e.y0);
        out.x1 = Math.max(out.x1, e.x1);
        out.y1 = Math.max(out.y1, e.y1);
      }
    }
    return out;
  }

  // srcts/features/coords.ts
  function coordsFeature(ws) {
    function currentViewBox() {
      if (ws.vb) return ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb;
      const parsed = ws.svgEl ? parseViewBox(ws.svgEl.getAttribute("viewBox")) : null;
      if (parsed) return parsed;
      const r = (ws.svgEl || ws.el).getBoundingClientRect();
      return { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
    }
    function toUser(clientX, clientY) {
      const r = (ws.svgEl || ws.el).getBoundingClientRect();
      const view = currentViewBox();
      const fx = r.width ? (clientX - r.left) / r.width : 0;
      const fy = r.height ? (clientY - r.top) / r.height : 0;
      return { x: view.x + fx * view.w, y: view.y + fy * view.h };
    }
    function toView(clientX, clientY) {
      const u = toUser(clientX, clientY);
      if (ws.axisZoomActive && ws.vb && ws.vb0) return azBaseToScene(u.x, u.y);
      return u;
    }
    function toAnchor(clientX, clientY) {
      const u = toUser(clientX, clientY);
      if (!ws.axisZoomActive || !ws.vb || !ws.vb0) return u;
      const a = ws.anchorPanel || azNearest(u.x, u.y);
      if (!a) return panToView(ws.vb, ws.vb0, u.x, u.y);
      return panToView(ws.vb, ws.vb0, (u.x - a.bx) / a.ax, (u.y - a.by) / a.ay);
    }
    function azNearest(x, y) {
      let best = null, bestD = Infinity;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const p = ws.azPanels[i].p;
        const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
        const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = ws.azPanels[i];
        }
      }
      return best;
    }
    function azT(a) {
      return conjugatePan(viewToPan(ws.vb || ws.vb0, ws.vb0), a.ax, a.bx, a.ay, a.by);
    }
    function azBaseToScene(x, y) {
      const a = azNearest(x, y);
      if (!a) return ws.vb && ws.vb0 ? panToView(ws.vb, ws.vb0, x, y) : { x, y };
      const t = azT(a);
      return { x: t.sx ? (x - t.tx) / t.sx : x, y: t.sy ? (y - t.ty) / t.sy : y };
    }
    function azMulti() {
      return ws.axisZoomActive && ws.azPanels.length > 1 && !!ws.vb0;
    }
    function fmtPan(t) {
      return "matrix(" + t.sx + " 0 0 " + t.sy + " " + t.tx + " " + t.ty + ")";
    }
    function calibrateXform() {
      if (azMulti()) return calibrateBase();
      let xi = null, xj = null;
      let yi = null, yj = null;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        const scx = (e.x0 + e.x1) / 2, scy = (e.y0 + e.y1) / 2;
        if (!xi || scx < (xi.x0 + xi.x1) / 2) xi = e;
        if (!xj || scx > (xj.x0 + xj.x1) / 2) xj = e;
        if (!yi || scy < (yi.y0 + yi.y1) / 2) yi = e;
        if (!yj || scy > (yj.y0 + yj.y1) / 2) yj = e;
      }
      if (!xi || !xj || !yi || !yj) return null;
      const scr = (e) => {
        const n = ws.fx.elementsForKey(e.key)[0];
        if (!n) return null;
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const xa = scr(xi), xb = scr(xj), ya = scr(yi), yb = scr(yj);
      if (!xa || !xb || !ya || !yb) return null;
      const dScx = (xj.x0 + xj.x1) / 2 - (xi.x0 + xi.x1) / 2;
      const dScrx = xb.x - xa.x;
      const dScy = (yj.y0 + yj.y1) / 2 - (yi.y0 + yi.y1) / 2;
      const dScry = yb.y - ya.y;
      if (Math.abs(dScrx) < 1 || Math.abs(dScry) < 1) return null;
      const sx = dScx / dScrx, ox = (xi.x0 + xi.x1) / 2 - xa.x * sx;
      const sy = dScy / dScry, oy = (yi.y0 + yi.y1) / 2 - ya.y * sy;
      return { sx, ox, sy, oy };
    }
    function clientToScene(clientX, clientY) {
      const f = calibrateXform();
      if (!f) return toView(clientX, clientY);
      if (azMulti()) return azBaseToScene(f.ox + clientX * f.sx, f.oy + clientY * f.sy);
      return { x: f.ox + clientX * f.sx, y: f.oy + clientY * f.sy };
    }
    function calibrateBase() {
      const base = function(e) {
        const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
        const a = azNearest(cx, cy);
        if (!a) return { x: cx, y: cy };
        const t = azT(a);
        return { x: t.sx * cx + t.tx, y: t.sy * cy + t.ty };
      };
      let xi = null, xj = null, yi = null, yj = null;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        const b = { x: 0, y: 0, e };
        const q = base(e);
        b.x = q.x;
        b.y = q.y;
        if (!xi || b.x < xi.x) xi = b;
        if (!xj || b.x > xj.x) xj = b;
        if (!yi || b.y < yi.y) yi = b;
        if (!yj || b.y > yj.y) yj = b;
      }
      if (!xi || !xj || !yi || !yj) return null;
      const scr = (e) => {
        const n = ws.fx.elementsForKey(e.key)[0];
        if (!n) return null;
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const xa = scr(xi.e), xb = scr(xj.e), ya = scr(yi.e), yb = scr(yj.e);
      if (!xa || !xb || !ya || !yb) return null;
      const dScrx = xb.x - xa.x, dScry = yb.y - ya.y;
      if (Math.abs(dScrx) < 1 || Math.abs(dScry) < 1) return null;
      const sx = (xj.x - xi.x) / dScrx, sy = (yj.y - yi.y) / dScry;
      return { sx, ox: xi.x - xa.x * sx, sy, oy: yi.y - ya.y * sy };
    }
    function panelAt(x, y) {
      for (let i = 0; i < ws.panels.length; i++) {
        const p = ws.panels[i];
        if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return p;
      }
      return ws.panels.length === 1 ? ws.panels[0] : null;
    }
    function dataRangeOf(p, dx0, dy0, dx1, dy1) {
      const out = { panel: p.name };
      if (p.x) {
        const a = pxToDataX(p, dx0), b = pxToDataX(p, dx1);
        if (a != null && b != null) out.x = [Math.min(a, b), Math.max(a, b)];
      }
      if (p.y) {
        const a = pxToDataY(p, dy0), b = pxToDataY(p, dy1);
        if (a != null && b != null) out.y = [Math.min(a, b), Math.max(a, b)];
      }
      return out.x || out.y ? out : null;
    }
    function brushDataFields(bb) {
      const p = panelAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
      if (!p) return {};
      const d = dataRangeOf(p, bb.x0, bb.y0, bb.x1, bb.y1);
      if (!d) return {};
      const f = { panel: d.panel };
      if (d.x) {
        f.x0d = d.x[0];
        f.x1d = d.x[1];
      }
      if (d.y) {
        f.y0d = d.y[0];
        f.y1d = d.y[1];
      }
      return f;
    }
    return { currentViewBox, toUser, toView, toAnchor, azNearest, azT, azMulti, fmtPan, calibrateXform, clientToScene, panelAt, dataRangeOf, brushDataFields };
  }

  // srcts/features/declarative.ts
  function declarativeFeature(ws) {
    function setupInteractions() {
      ws.condTagElems = {};
      ws.filtSelElems = {};
      ws.joinOf = {};
      if (!ws.interactions) return;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (e.cond) {
          for (let t = 0; t < e.cond.length; t++) {
            (ws.condTagElems[e.cond[t]] = ws.condTagElems[e.cond[t]] || []).push(e.key);
          }
        }
        if (e.filt) {
          for (let t = 0; t < e.filt.length; t++) {
            (ws.filtSelElems[e.filt[t]] = ws.filtSelElems[e.filt[t]] || []).push(e.key);
          }
        }
        if (e.join != null) ws.joinOf[e.key] = e.join;
      }
    }
    function selectionMembers(sel) {
      const set = {};
      if (sel.kind === "interval" && sel.region !== "lasso") {
        const iv = ws.intervals[sel.name];
        const ks = iv ? iv.keys : [];
        for (let i = 0; i < ks.length; i++) set[ks[i]] = true;
        return set;
      }
      let keys = sel.on === "hover" ? ws.lastHoverKeys : ws.fx.selectedKeys();
      if (sel.on !== "hover" && sel.expand && sel.expand.mode === "neighbours" && ws.neighbourExpand) {
        const out = [];
        const seen = {};
        for (let i = 0; i < keys.length; i++) {
          const proj = ws.fx.linkedKeys(keys[i]);
          for (let j = 0; j < proj.length; j++) {
            if (!seen[proj[j]]) {
              seen[proj[j]] = true;
              out.push(proj[j]);
            }
          }
        }
        keys = out;
      }
      for (let i = 0; i < keys.length; i++) set[keys[i]] = true;
      return set;
    }
    function styleCondNode(node, color) {
      if (color == null) {
        node.classList.add("vellumwidget-cond-dim");
        return;
      }
      const n = node;
      const f = node.getAttribute("fill");
      if (f && f !== "none") n.style.fill = color;
      const s = node.getAttribute("stroke");
      if (s && s !== "none") n.style.stroke = color;
    }
    function clearCondNode(node) {
      node.classList.remove("vellumwidget-cond-dim");
      const n = node;
      if (n.style.fill) n.style.fill = "";
      if (n.style.stroke) n.style.stroke = "";
    }
    function applyConditions() {
      if (ws.rasterMode || !ws.interactions || !ws.interactions.conditions) return;
      const selByName = {};
      (ws.interactions.selections || []).forEach((s) => selByName[s.name] = s);
      for (let ci = 0; ci < ws.interactions.conditions.length; ci++) {
        const c = ws.interactions.conditions[ci];
        const tag = c.selection + ":" + c.aes;
        const tagged = ws.condTagElems[tag] || [];
        const sel = selByName[c.selection];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || c.empty === false;
        for (let i = 0; i < tagged.length; i++) {
          const nodes = ws.fx.elementsForKey(tagged[i]);
          const member = !!members[tagged[i]];
          for (let j = 0; j < nodes.length; j++) {
            clearCondNode(nodes[j]);
            if (active && !member) styleCondNode(nodes[j], c.if_false);
          }
        }
      }
    }
    function memberJoins(members) {
      const js = {};
      for (const k in members) js[ws.joinOf[k] != null ? ws.joinOf[k] : k] = true;
      return js;
    }
    function applyFilters() {
      const ix = ws.interactions;
      if (ws.rasterMode || !ix || !ix.filters || !ix.filters.length) return;
      const filters = ix.filters;
      const selByName = {};
      (ix.selections || []).forEach((s) => selByName[s.name] = s);
      const hide = {};
      let restrict = false;
      for (let i = 0; i < filters.length; i++) {
        const selName = filters[i].selection;
        const sel = selByName[selName];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || sel && sel.empty === false;
        if (!active) continue;
        restrict = true;
        const keep = memberJoins(members);
        const targets = ws.filtSelElems[selName] || [];
        for (let t = 0; t < targets.length; t++) {
          const k = targets[t];
          const j = ws.joinOf[k] != null ? ws.joinOf[k] : k;
          if (!keep[j]) hide[k] = true;
        }
      }
      if (!restrict) {
        ws.fx.applyFilter(null);
        return;
      }
      const show = [];
      for (let i = 0; i < ws.elements.length; i++) {
        if (!hide[ws.elements[i].key]) show.push(ws.elements[i].key);
      }
      ws.fx.applyFilter(show);
    }
    function reevaluateInteractions() {
      applyConditions();
      applyFilters();
    }
    return { setupInteractions, reevaluateInteractions };
  }

  // srcts/features/highlight.ts
  function highlightFeature(ws) {
    function elementsForKey(k) {
      const cached = ws.nodesByKey[k];
      if (cached) return cached;
      if (!ws.holder) return [];
      return Array.prototype.slice.call(ws.holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
    }
    function addClassForKeys(keys, cls) {
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
      }
    }
    function clearClass(cls) {
      if (!ws.holder) return;
      const nodes = ws.holder.querySelectorAll("." + cls);
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
    }
    function graphNeighbourhood(k, degree, edges) {
      const seen = { [k]: true };
      const out = [k];
      let frontier = [k];
      for (let d = 0; d < degree; d++) {
        const next = [];
        for (let i = 0; i < frontier.length; i++) {
          const u = frontier[i];
          if (edges) {
            const inc = ws.incidentEdges[u] || [];
            for (let j = 0; j < inc.length; j++) {
              if (!seen[inc[j]]) {
                seen[inc[j]] = true;
                out.push(inc[j]);
              }
            }
          }
          const nb = ws.neighbourNodes[u] || [];
          for (let j = 0; j < nb.length; j++) {
            if (!seen[nb[j]]) {
              seen[nb[j]] = true;
              out.push(nb[j]);
              next.push(nb[j]);
            }
          }
        }
        frontier = next;
      }
      return out;
    }
    function linkedKeys(k) {
      const m = ws.meta[k];
      if (m && m.legend_for != null) return (ws.legendIndex[m.legend_for] || []).concat([k]);
      if (ws.neighbourExpand) {
        const ep = ws.edgeEndpoints[k];
        if (ep) return [k, ep[0], ep[1]];
        if (ws.incidentEdges[k] || ws.neighbourNodes[k]) {
          return graphNeighbourhood(k, ws.neighbourExpand.degree, ws.neighbourExpand.edges);
        }
      }
      const g = m && m.hover_group;
      return g && ws.groups[g] ? ws.groups[g] : [k];
    }
    return { elementsForKey, addClassForKeys, clearClass, linkedKeys };
  }

  // srcts/features/hover.ts
  function hoverFeature(ws) {
    function dimOpacityVal() {
      const d = ws.opts.style && ws.opts.style.dimOpacity;
      return d == null || d === "" ? "0.28" : String(d);
    }
    function showHighlightOverlay(keys) {
      if (!ws.holder || !ws.dimLayer) return;
      ws.holder.style.opacity = dimOpacityVal();
      while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
      for (let i = 0; i < keys.length; i++) {
        const nodes = ws.fx.elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) {
          const c = nodes[j].cloneNode(true);
          c.classList.add("vellumwidget-hl");
          ws.dimLayer.appendChild(azOverlayWrap(c, keys[i]));
        }
      }
    }
    function azOverlayWrap(node, key) {
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
    function hideHighlightOverlay() {
      if (ws.holder) ws.holder.style.opacity = "";
      if (ws.dimLayer) while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
    }
    function crosshairLine(x1, y1, x2, y2) {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", "vellumwidget-crosshair-line");
      l.setAttribute("vector-effect", "non-scaling-stroke");
      return l;
    }
    function clearCrosshair() {
      if (!ws.crosshairLayer) return;
      const kids = Array.prototype.slice.call(ws.crosshairLayer.childNodes);
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] !== ws.intervalEl) ws.crosshairLayer.removeChild(kids[i]);
      }
    }
    function drawCrosshair(k, hm) {
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
        const a = ws.fx.azNearest(cx, cy);
        if (a) {
          const t = ws.fx.azT(a);
          cx = t.sx * cx + t.tx;
          cy = t.sy * cy + t.ty;
          x0 = a.p.px0;
          x1 = a.p.px1;
          y0 = a.p.py0;
          y1 = a.p.py1;
        }
      }
      if (hm !== "y") ws.crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
      if (hm !== "x") ws.crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
    }
    function tipDelay() {
      const d = ws.opts.tooltipDelay;
      return typeof d === "number" && d > 0 ? d : 0;
    }
    function markClient(k) {
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return null;
      const nodes = ws.fx.elementsForKey(k);
      if (nodes.length) {
        const r2 = nodes[0].getBoundingClientRect();
        if (r2.width || r2.height) return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
      }
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const f = ws.fx.calibrateXform();
      if (f && f.sx && f.sy) return { x: (cx - f.ox) / f.sx, y: (cy - f.oy) / f.sy };
      if (!ws.svgEl) return null;
      const r = ws.svgEl.getBoundingClientRect();
      const view = ws.fx.currentViewBox();
      if (!view.w || !view.h || !r.width || !r.height) return null;
      return {
        x: r.left + (cx - view.x) / view.w * r.width,
        y: r.top + (cy - view.y) / view.h * r.height
      };
    }
    function placeTip(clientX, clientY, anchorKey) {
      const box = ws.el.getBoundingClientRect();
      let ax = clientX - box.left;
      let ay = clientY - box.top;
      if (ws.opts.tooltipFollow === false && anchorKey) {
        const c = markClient(anchorKey);
        if (c) {
          ax = c.x - box.left;
          ay = c.y - box.top;
        }
      }
      const tw = ws.tip.offsetWidth || 0;
      const th = ws.tip.offsetHeight || 0;
      const below = ay - th - 12 < 0;
      if (tw && box.width) ax = Math.max(tw / 2, Math.min(box.width - tw / 2, ax));
      ws.tip.style.transform = "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px) " + (below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))");
    }
    let pendX = 0, pendY = 0;
    function revealTip(build, clientX, clientY, anchorKey) {
      if (ws.tipHideTimer) {
        clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = 0;
      }
      pendX = clientX;
      pendY = clientY;
      const doShow = () => {
        ws.tipShowTimer = 0;
        build();
        placeTip(pendX, pendY, anchorKey);
        ws.tip.classList.add("vellumwidget-show");
      };
      const d = tipDelay();
      if (d > 0 && !ws.tip.classList.contains("vellumwidget-show")) {
        if (ws.tipShowTimer) clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = setTimeout(doShow, d);
      } else {
        doShow();
      }
    }
    function showTip(clientX, clientY, k) {
      const m = ws.meta[k];
      revealTip(() => {
        ws.tip.innerHTML = sanitizeTip(m && m.tooltip || k);
      }, clientX, clientY, k);
    }
    function showTipMulti(clientX, clientY, keys) {
      revealTip(() => {
        const rows = [];
        for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
          const m = ws.meta[keys[i]];
          rows.push(sanitizeTip(m && m.tooltip || keys[i]));
        }
        if (keys.length > TIP_MULTI_CAP) rows.push("\u2026");
        ws.tip.innerHTML = rows.join("<br>");
      }, clientX, clientY, keys[0] || null);
    }
    function moveTip(clientX, clientY, anchorKey) {
      pendX = clientX;
      pendY = clientY;
      if (ws.tip.classList.contains("vellumwidget-show")) placeTip(clientX, clientY, anchorKey);
    }
    function hideTip() {
      if (ws.tipShowTimer) {
        clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = 0;
      }
      if (ws.tipHideTimer) {
        clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = 0;
      }
      ws.tip.classList.remove("vellumwidget-show");
    }
    function scheduleHideTip() {
      if (ws.tipShowTimer) {
        clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = 0;
      }
      if (ws.opts.tooltipSticky) {
        if (ws.tipHideTimer) clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = setTimeout(() => {
          ws.tipHideTimer = 0;
          ws.tip.classList.remove("vellumwidget-show");
        }, 260);
      } else {
        ws.tip.classList.remove("vellumwidget-show");
      }
    }
    function clearHover() {
      if (!ws.hovering) return;
      ws.hovering = false;
      ws.hoverSig = "";
      if (ws.rasterMode) ws.fx.clearGroup(ws.hovGroup);
      if (ws.largeDim) hideHighlightOverlay();
      ws.el.classList.remove("vellumwidget-hovering");
      ws.fx.clearClass("vellumwidget-hl");
      clearCrosshair();
      scheduleHideTip();
      ws.fx.shinyInput("hover", null);
      if (ws.lastHoverKeys.length) {
        ws.lastHoverKeys = [];
        ws.fx.reevaluateInteractions();
      }
    }
    return { showHighlightOverlay, hideHighlightOverlay, clearCrosshair, drawCrosshair, showTip, showTipMulti, hideTip, moveTip, clearHover };
  }

  // srcts/features/interval.ts
  function intervalFeature(ws) {
    function rectIntervalSels() {
      const sels = ws.interactions && ws.interactions.selections || [];
      return sels.filter((s) => s.kind === "interval" && s.region !== "lasso");
    }
    function lockRect(p, rect, encs) {
      if (!p) return rect;
      let h = false, v = false;
      for (let i = 0; i < encs.length; i++) {
        const hit = axisForEncoding(p, encs[i]);
        if (hit) {
          if (hit.horizontal) h = true;
          else v = true;
        }
      }
      if (!h && !v) return rect;
      return {
        x0: h ? rect.x0 : Math.min(p.px0, p.px1),
        x1: h ? rect.x1 : Math.max(p.px0, p.px1),
        y0: v ? rect.y0 : Math.min(p.py0, p.py1),
        y1: v ? rect.y1 : Math.max(p.py0, p.py1)
      };
    }
    function applyIntervalBrush(rect) {
      const sels = rectIntervalSels();
      if (!sels.length) return null;
      const p = ws.fx.panelAt((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
      const eligible = (k) => !ws.hiddenKeySet[k] && !ws.colorHiddenSet[k];
      ws.intervals = {};
      const union = [];
      const seen = {};
      const ranges = {};
      let band = rect;
      for (let i = 0; i < sels.length; i++) {
        const encs = selEncodings(sels[i]);
        const locked = lockRect(p, rect, encs);
        if (i === 0) band = locked;
        const r = p ? intervalRangeOf(p, rect, encs) : null;
        const ks = r ? intervalKeys(ws.elements, r).filter(eligible) : ws.fx.dropInert(ws.fx.brushKeysIn(locked));
        ws.intervals[sels[i].name] = { keys: ks, range: r };
        ranges[sels[i].name] = r;
        for (let j = 0; j < ks.length; j++) {
          if (!seen[ks[j]]) {
            seen[ks[j]] = true;
            union.push(ks[j]);
          }
        }
      }
      const first = sels[0].name;
      const fields = { selection: first };
      const r0 = ranges[first];
      if (r0) {
        const iv = {};
        if (r0.x) iv.x = r0.x.levels ? r0.x.levels : [r0.x.lo, r0.x.hi];
        if (r0.y) iv.y = r0.y.levels ? r0.y.levels : [r0.y.lo, r0.y.hi];
        fields.interval = iv;
      }
      drawIntervalBand(band);
      return { keys: union, band, fields };
    }
    function drawIntervalBand(b) {
      ws.intervalBand = b;
      placeIntervalBand();
    }
    function placeIntervalBand() {
      const sb = ws.intervalBand;
      if (!ws.crosshairLayer || !sb) return;
      let b = sb;
      if (ws.fx.azMulti()) {
        const a = ws.fx.azNearest((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2);
        if (a) {
          const t = ws.fx.azT(a);
          const p = a.p;
          b = {
            x0: Math.max(Math.min(p.px0, p.px1), t.sx * sb.x0 + t.tx),
            x1: Math.min(Math.max(p.px0, p.px1), t.sx * sb.x1 + t.tx),
            y0: Math.max(Math.min(p.py0, p.py1), t.sy * sb.y0 + t.ty),
            y1: Math.min(Math.max(p.py0, p.py1), t.sy * sb.y1 + t.ty)
          };
        }
      }
      if (!ws.intervalEl) {
        ws.intervalEl = document.createElementNS(SVGNS, "rect");
        ws.intervalEl.setAttribute("class", "vellumwidget-interval");
        ws.intervalEl.setAttribute("vector-effect", "non-scaling-stroke");
      }
      if (ws.intervalEl.parentNode !== ws.crosshairLayer) ws.crosshairLayer.appendChild(ws.intervalEl);
      ws.intervalEl.setAttribute("x", String(b.x0));
      ws.intervalEl.setAttribute("y", String(b.y0));
      ws.intervalEl.setAttribute("width", String(Math.max(0, b.x1 - b.x0)));
      ws.intervalEl.setAttribute("height", String(Math.max(0, b.y1 - b.y0)));
    }
    function clearIntervals() {
      const had = Object.keys(ws.intervals).length > 0;
      ws.intervals = {};
      ws.intervalBand = null;
      if (ws.intervalEl && ws.intervalEl.parentNode) ws.intervalEl.parentNode.removeChild(ws.intervalEl);
      return had;
    }
    return { applyIntervalBrush, placeIntervalBand, clearIntervals };
  }

  // srcts/features/legend.ts
  function legendFeature(ws) {
    function legendPolicy() {
      return ws.opts.legendClick || "select";
    }
    function swatchSeries(k) {
      if (k == null) return null;
      const m = ws.meta[k];
      return m && m.legend_for != null ? m.legend_for : null;
    }
    function applyLegend() {
      ws.fx.clearClass("vellumwidget-legend-hidden");
      ws.fx.clearClass("vellumwidget-legend-muted");
      ws.fx.clearClass("vellumwidget-legend-off");
      ws.hiddenKeySet = {};
      const pol = legendPolicy();
      if (pol === "select") return;
      const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
      for (const s in ws.legendOff) {
        if (!ws.legendOff[s]) continue;
        const members = ws.legendIndex[s] || [];
        ws.fx.addClassForKeys(members, cls);
        if (pol === "hide") for (let i = 0; i < members.length; i++) ws.hiddenKeySet[members[i]] = true;
        ws.fx.addClassForKeys(ws.legendSwatch[s] || [], "vellumwidget-legend-off");
      }
    }
    function legendToggle(series) {
      ws.legendOff[series] = !ws.legendOff[series];
      applyLegend();
    }
    function legendIsolate(series) {
      const all = Object.keys(ws.legendIndex);
      const others = all.filter((s) => s !== series);
      const isolated = !ws.legendOff[series] && others.every((s) => ws.legendOff[s]);
      ws.legendOff = {};
      if (!isolated) for (let i = 0; i < others.length; i++) ws.legendOff[others[i]] = true;
      applyLegend();
    }
    return { legendPolicy, swatchSeries, applyLegend, legendToggle, legendIsolate };
  }

  // srcts/features/navigator.ts
  function navigatorFeature(ws) {
    function navToView(xFrac, wFrac) {
      if (!ws.vb0) return;
      wFrac = Math.min(1, Math.max(0.02, wFrac));
      xFrac = Math.min(1 - wFrac, Math.max(0, xFrac));
      const w = wFrac * ws.vb0.w;
      if (ws.xZoom) {
        ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: ws.vb0.y, w, h: ws.vb0.h };
      } else {
        const cy = ws.vb ? ws.vb.y + ws.vb.h / 2 : ws.vb0.y + ws.vb0.h / 2;
        const h = wFrac * ws.vb0.h;
        ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: cy - h / 2, w, h };
      }
      ws.fx.applyViewBox();
    }
    function updateNav() {
      if (!ws.navWindow || !ws.vb || !ws.vb0 || !ws.vb0.w) return;
      const xFrac = (ws.vb.x - ws.vb0.x) / ws.vb0.w;
      const wFrac = ws.vb.w / ws.vb0.w;
      ws.navWindow.style.left = xFrac * 100 + "%";
      ws.navWindow.style.width = wFrac * 100 + "%";
    }
    function buildNavigator() {
      if (ws.navEl) {
        ws.navEl.remove();
        ws.navEl = null;
        ws.navWindow = null;
      }
      if (!ws.opts.navigator || !ws.svgEl || !ws.vb0) return;
      const h = ws.opts.navigatorHeight && ws.opts.navigatorHeight > 0 ? ws.opts.navigatorHeight : 56;
      ws.navEl = document.createElement("div");
      ws.navEl.className = "vellumwidget-nav";
      ws.navEl.style.height = h + "px";
      ws.navEl.setAttribute("aria-hidden", "true");
      const mini = document.createElement("div");
      mini.className = "vellumwidget-nav-mini";
      const clone = ws.svgEl.cloneNode(true);
      clone.setAttribute("viewBox", fmtViewBox(ws.vb0));
      clone.setAttribute("preserveAspectRatio", "none");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      const defs = clone.querySelector("defs");
      if (defs) defs.remove();
      const clipped = clone.querySelectorAll("[clip-path]");
      for (let i = 0; i < clipped.length; i++) clipped[i].removeAttribute("clip-path");
      const keyed = clone.querySelectorAll("[data-key],[tabindex],[role]");
      for (let i = 0; i < keyed.length; i++) {
        keyed[i].removeAttribute("data-key");
        keyed[i].removeAttribute("tabindex");
        keyed[i].removeAttribute("role");
      }
      clone.removeAttribute("id");
      mini.appendChild(clone);
      ws.navEl.appendChild(mini);
      ws.navWindow = document.createElement("div");
      ws.navWindow.className = "vellumwidget-nav-window";
      const hL = document.createElement("div");
      hL.className = "vellumwidget-nav-handle vellumwidget-nav-handle-l";
      const hR = document.createElement("div");
      hR.className = "vellumwidget-nav-handle vellumwidget-nav-handle-r";
      ws.navWindow.appendChild(hL);
      ws.navWindow.appendChild(hR);
      ws.navEl.appendChild(ws.navWindow);
      ws.el.appendChild(ws.navEl);
      wireNavigator(hL, hR);
      updateNav();
    }
    function wireNavigator(hL, hR) {
      if (!ws.navEl || !ws.navWindow) return;
      let mode = "";
      let startFracX = 0, startFracW = 0, startPointer = 0;
      const stripFrac = (clientX) => {
        const r = ws.navEl.getBoundingClientRect();
        return r.width ? (clientX - r.left) / r.width : 0;
      };
      const onMove = (ev) => {
        if (!mode || !ws.vb0) return;
        const d = stripFrac(ev.clientX) - startPointer;
        if (mode === "pan") navToView(startFracX + d, startFracW);
        else if (mode === "l") {
          const nx = startFracX + d;
          navToView(nx, startFracW + (startFracX - nx));
        } else if (mode === "r") navToView(startFracX, startFracW + d);
      };
      const onUp = (ev) => {
        mode = "";
        ws.navWindow.classList.remove("vellumwidget-nav-grabbing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (ev && ev.target.releasePointerCapture) {
        }
      };
      const start = (m) => (ev) => {
        if (!ws.vb0) return;
        ev.preventDefault();
        ev.stopPropagation();
        mode = m;
        startFracX = (ws.vb.x - ws.vb0.x) / ws.vb0.w;
        startFracW = ws.vb.w / ws.vb0.w;
        startPointer = stripFrac(ev.clientX);
        if (m === "pan") ws.navWindow.classList.add("vellumwidget-nav-grabbing");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };
      ws.navWindow.addEventListener("pointerdown", start("pan"));
      hL.addEventListener("pointerdown", start("l"));
      hR.addEventListener("pointerdown", start("r"));
    }
    return { navToView, updateNav, buildNavigator };
  }

  // node_modules/flatqueue/index.js
  var FlatQueue = class {
    /**
     * Creates an empty queue. If `capacity` is provided, the queue is backed by fixed-size typed
     * arrays for better performance and memory use, but can't grow beyond `capacity`. `values` uses
     * `ValuesArray` (default `Float64Array`) and `ids` uses `IdsArray` (default `Uint32Array`); pass
     * narrower constructors like `Uint16Array` if your values or ids are known to fit them.
     *
     * @param {number} [capacity]
     * @param {TypedArrayConstructor} [ValuesArray]
     * @param {TypedArrayConstructor} [IdsArray]
     */
    constructor(capacity = Infinity, ValuesArray = Float64Array, IdsArray = Uint32Array) {
      const fixed = capacity !== Infinity;
      this.ids = fixed ? (
        /** @type {T[]} */
        /** @type {unknown} */
        new IdsArray(capacity)
      ) : [];
      this.values = fixed ? (
        /** @type {number[]} */
        /** @type {unknown} */
        new ValuesArray(capacity)
      ) : [];
      this.capacity = capacity;
      this.length = 0;
    }
    /** Removes all items from the queue. */
    clear() {
      this.length = 0;
    }
    /**
     * Adds `item` to the queue with the specified `priority`.
     *
     * `priority` must be a number. Items are sorted and returned from low to high priority. Multiple items
     * with the same priority value can be added to the queue, but there is no guaranteed order between these items.
     *
     * For fixed-capacity queues, throws a `RangeError` if the queue is already full.
     *
     * @param {T} item
     * @param {number} priority
     */
    push(item, priority) {
      if (this.length === this.capacity) throw new RangeError("Queue is at capacity.");
      let pos = this.length++;
      while (pos > 0) {
        const parent = pos - 1 >> 1;
        const parentValue = this.values[parent];
        if (priority >= parentValue) break;
        this.ids[pos] = this.ids[parent];
        this.values[pos] = parentValue;
        pos = parent;
      }
      this.ids[pos] = item;
      this.values[pos] = priority;
    }
    /**
     * Removes and returns the item from the head of this queue, which is one of
     * the items with the lowest priority. If this queue is empty, returns `undefined`.
     */
    pop() {
      if (this.length === 0) return void 0;
      const ids = this.ids, values = this.values, top = ids[0], last = --this.length;
      if (last > 0) {
        const id = ids[last];
        const value = values[last];
        let pos = 0;
        const halfLen = last >> 1;
        while (pos < halfLen) {
          const left = (pos << 1) + 1;
          const right = left + 1;
          const child = left + (+(right < last) & +(values[right] < values[left]));
          if (values[child] >= value) break;
          ids[pos] = ids[child];
          values[pos] = values[child];
          pos = child;
        }
        ids[pos] = id;
        values[pos] = value;
      }
      return top;
    }
    /** Returns the item from the head of this queue without removing it. If this queue is empty, returns `undefined`. */
    peek() {
      return this.length > 0 ? this.ids[0] : void 0;
    }
    /**
     * Returns the priority value of the item at the head of this queue without
     * removing it. If this queue is empty, returns `undefined`.
     */
    peekValue() {
      return this.length > 0 ? this.values[0] : void 0;
    }
    /**
     * Shrinks the internal arrays to `this.length`. No-op for queues with fixed capacity.
     *
     * `pop()` and `clear()` calls don't free memory automatically to avoid unnecessary resize operations.
     * This also means that items that have been added to the queue can't be garbage collected until
     * a new item is pushed in their place, or this method is called.
     */
    shrink() {
      if (Array.isArray(this.ids)) this.ids.length = this.length;
      if (Array.isArray(this.values)) this.values.length = this.length;
    }
  };

  // node_modules/flatbush/index.js
  var ARRAY_TYPES = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
  var VERSION = 3;
  var Flatbush = class _Flatbush {
    /**
     * Recreate a Flatbush index from raw `ArrayBuffer` or `SharedArrayBuffer` data.
     * @param {ArrayBufferLike} data
     * @param {number} [byteOffset=0] byte offset to the start of the Flatbush buffer in the referenced ArrayBuffer.
     * @returns {Flatbush} index
     */
    static from(data, byteOffset = 0) {
      if (byteOffset % 8 !== 0) {
        throw new Error("byteOffset must be 8-byte aligned.");
      }
      if (!data || data.byteLength === void 0 || "buffer" in data) {
        throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");
      }
      const [magic, versionAndType] = new Uint8Array(data, byteOffset + 0, 2);
      if (magic !== 251) {
        throw new Error("Data does not appear to be in a Flatbush format.");
      }
      const version = versionAndType >> 4;
      if (version !== VERSION) {
        throw new Error(`Got v${version} data when expected v${VERSION}.`);
      }
      const ArrayType = ARRAY_TYPES[versionAndType & 15];
      if (!ArrayType) {
        throw new Error("Unrecognized array type.");
      }
      const [nodeSize] = new Uint16Array(data, byteOffset + 2, 1);
      const [numItems] = new Uint32Array(data, byteOffset + 4, 1);
      return new _Flatbush(numItems, nodeSize, ArrayType, void 0, data, byteOffset);
    }
    /**
     * Create a Flatbush index that will hold a given number of items.
     * @param {number} numItems
     * @param {number} [nodeSize=16] Size of the tree node (16 by default).
     * @param {TypedArrayConstructor} [ArrayType=Float64Array] The array type used for coordinates storage (`Float64Array` by default).
     * @param {ArrayBufferConstructor | SharedArrayBufferConstructor} [ArrayBufferType=ArrayBuffer] The array buffer type used to store data (`ArrayBuffer` by default).
     * @param {ArrayBufferLike} [data] (Only used internally)
     * @param {number} [byteOffset=0] (Only used internally)
     */
    constructor(numItems, nodeSize = 16, ArrayType = Float64Array, ArrayBufferType = ArrayBuffer, data, byteOffset = 0) {
      if (numItems === void 0) throw new Error("Missing required argument: numItems.");
      if (isNaN(numItems) || numItems <= 0) throw new Error(`Unexpected numItems value: ${numItems}.`);
      this.numItems = +numItems;
      this.nodeSize = Math.min(Math.max(+nodeSize, 2), 65535);
      this.byteOffset = byteOffset;
      let n = numItems;
      let numNodes = n;
      this._levelBounds = [n * 4];
      do {
        n = Math.ceil(n / this.nodeSize);
        numNodes += n;
        this._levelBounds.push(numNodes * 4);
      } while (n !== 1);
      this.ArrayType = ArrayType;
      this.IndexArrayType = numNodes < 16384 ? Uint16Array : Uint32Array;
      const arrayTypeIndex = ARRAY_TYPES.indexOf(ArrayType);
      const nodesByteSize = numNodes * 4 * ArrayType.BYTES_PER_ELEMENT;
      if (arrayTypeIndex < 0) {
        throw new Error(`Unexpected typed array class: ${ArrayType}.`);
      }
      const BoxCtor = ArrayType;
      const IdxCtor = this.IndexArrayType;
      if (data) {
        this.data = data;
        this._boxes = new BoxCtor(data, byteOffset + 8, numNodes * 4);
        this._indices = new IdxCtor(data, byteOffset + 8 + nodesByteSize, numNodes);
        this._pos = numNodes * 4;
        this.minX = this._boxes[this._pos - 4];
        this.minY = this._boxes[this._pos - 3];
        this.maxX = this._boxes[this._pos - 2];
        this.maxY = this._boxes[this._pos - 1];
      } else {
        const data2 = this.data = new ArrayBufferType(8 + nodesByteSize + numNodes * this.IndexArrayType.BYTES_PER_ELEMENT);
        this._boxes = new BoxCtor(data2, 8, numNodes * 4);
        this._indices = new IdxCtor(data2, 8 + nodesByteSize, numNodes);
        this._pos = 0;
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;
        new Uint8Array(data2, 0, 2).set([251, (VERSION << 4) + arrayTypeIndex]);
        new Uint16Array(data2, 2, 1)[0] = nodeSize;
        new Uint32Array(data2, 4, 1)[0] = numItems;
      }
      this._queue = new FlatQueue();
    }
    /**
     * Add a given rectangle to the index.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @returns {number} A zero-based, incremental number that represents the newly added rectangle.
     */
    add(minX, minY, maxX = minX, maxY = minY) {
      const pos = this._pos;
      const index = pos >> 2;
      const boxes = this._boxes;
      this._indices[index] = index;
      boxes[pos] = minX;
      boxes[pos + 1] = minY;
      boxes[pos + 2] = maxX;
      boxes[pos + 3] = maxY;
      this._pos = pos + 4;
      if (minX < this.minX) this.minX = minX;
      if (minY < this.minY) this.minY = minY;
      if (maxX > this.maxX) this.maxX = maxX;
      if (maxY > this.maxY) this.maxY = maxY;
      return index;
    }
    /** Perform indexing of the added rectangles. */
    finish() {
      if (this._pos >> 2 !== this.numItems) {
        throw new Error(`Added ${this._pos >> 2} items when expected ${this.numItems}.`);
      }
      const boxes = this._boxes;
      if (this.numItems <= this.nodeSize) {
        boxes[this._pos++] = this.minX;
        boxes[this._pos++] = this.minY;
        boxes[this._pos++] = this.maxX;
        boxes[this._pos++] = this.maxY;
        return;
      }
      const { numItems, minX, minY, nodeSize, _indices: indices, _levelBounds: levelBounds } = this;
      const width = this.maxX - minX || 1;
      const height = this.maxY - minY || 1;
      const hilbertValues = new Int32Array(numItems);
      const hilbertMax = (1 << 16) - 1;
      const sx = hilbertMax / width;
      const sy = hilbertMax / height;
      for (let i = 0, pos2 = 0; i < numItems; i++) {
        const itemMinX = boxes[pos2++];
        const itemMinY = boxes[pos2++];
        const itemMaxX = boxes[pos2++];
        const itemMaxY = boxes[pos2++];
        const x = sx * ((itemMinX + itemMaxX) / 2 - minX) | 0;
        const y = sy * ((itemMinY + itemMaxY) / 2 - minY) | 0;
        hilbertValues[i] = hilbert(x, y);
      }
      sort(hilbertValues, boxes, indices, 0, numItems - 1, nodeSize);
      let pos = numItems * 4;
      for (let i = 0, readPos = 0; i < levelBounds.length - 1; i++) {
        const end = levelBounds[i];
        while (readPos < end) {
          const nodeIndex = readPos;
          let nodeMinX = boxes[readPos++];
          let nodeMinY = boxes[readPos++];
          let nodeMaxX = boxes[readPos++];
          let nodeMaxY = boxes[readPos++];
          for (let j = 1; j < nodeSize && readPos < end; j++) {
            nodeMinX = Math.min(nodeMinX, boxes[readPos++]);
            nodeMinY = Math.min(nodeMinY, boxes[readPos++]);
            nodeMaxX = Math.max(nodeMaxX, boxes[readPos++]);
            nodeMaxY = Math.max(nodeMaxY, boxes[readPos++]);
          }
          indices[pos >> 2] = nodeIndex;
          boxes[pos++] = nodeMinX;
          boxes[pos++] = nodeMinY;
          boxes[pos++] = nodeMaxX;
          boxes[pos++] = nodeMaxY;
        }
      }
      this._pos = pos;
    }
    /**
     * Search the index by a bounding box.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {(index: number, x0: number, y0: number, x1: number, y1: number) => boolean} [filterFn] An optional function that is called on every found item; if supplied, only items for which this function returns true will be included in the results array.
     * @returns {number[]} An array of indices of items intersecting or touching the given bounding box.
     */
    search(minX, minY, maxX, maxY, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      let nodeIndex = boxes.length - 4;
      let level = levelBounds.length - 1;
      const q = [];
      const results = [];
      let contained = false;
      while (nodeIndex !== void 0) {
        const end = Math.min(nodeIndex + nodeSize * 4, levelBounds[level]);
        const isNode = nodeIndex >= numItems4;
        if (contained) {
          this._collectContained(nodeIndex, end, level, numItems4, results, filterFn);
        } else {
          for (let pos = nodeIndex; pos < end; pos += 4) {
            const x0 = boxes[pos];
            if (maxX < x0) continue;
            const y0 = boxes[pos + 1];
            if (maxY < y0) continue;
            const x1 = boxes[pos + 2];
            if (minX > x1) continue;
            const y1 = boxes[pos + 3];
            if (minY > y1) continue;
            const index = indices[pos >> 2] | 0;
            if (isNode) {
              const c = +(minX <= x0 && minY <= y0 && maxX >= x1 && maxY >= y1);
              q.push(index | c, level - 1);
            } else if (filterFn === void 0 || filterFn(index, x0, y0, x1, y1)) {
              results.push(index);
            }
          }
        }
        level = /** @type {number} */
        q.pop();
        nodeIndex = q.pop();
        if (nodeIndex !== void 0) {
          contained = (nodeIndex & 1) === 1;
          nodeIndex &= ~1;
        }
      }
      return results;
    }
    /**
     * Collect all leaves of a subtree that's fully inside the query, skipping intersection tests.
     * Because the tree is packed bottom-up, those leaves occupy one contiguous block of the leaf
     * level, so we skip traversal entirely: descend to the first leaf, then sweep the flat range.
     * @param {number} nodeIndex
     * @param {number} end
     * @param {number} level
     * @param {number} numItems4
     * @param {number[]} results
     * @param {((index: number, x0: number, y0: number, x1: number, y1: number) => boolean) | undefined} filterFn
     */
    _collectContained(nodeIndex, end, level, numItems4, results, filterFn) {
      const boxes = this._boxes;
      const indices = this._indices;
      let pos = nodeIndex;
      for (let l = level; l > 0; l--) pos = indices[pos >> 2];
      const leafEnd = Math.min(pos + (end - nodeIndex) * this.nodeSize ** level, numItems4);
      if (filterFn === void 0) {
        for (; pos < leafEnd; pos += 4) results.push(indices[pos >> 2] | 0);
      } else {
        for (; pos < leafEnd; pos += 4) {
          const index = indices[pos >> 2] | 0;
          if (filterFn(index, boxes[pos], boxes[pos + 1], boxes[pos + 2], boxes[pos + 3])) results.push(index);
        }
      }
    }
    /**
     * Search items in order of distance from the given point.
     * @param {number} x
     * @param {number} y
     * @param {number} [maxResults=Infinity]
     * @param {number} [maxDistance=Infinity]
     * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
     * @returns {number[]} An array of indices of items found.
     */
    neighbors(x, y, maxResults = Infinity, maxDistance = Infinity, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, _queue: q, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      const nodeSize4 = nodeSize * 4;
      const results = [];
      const maxDistSquared = maxDistance * maxDistance;
      const trackNearest = maxResults === 1;
      let bound = maxDistSquared;
      q.push(boxes.length - 4 << 1, 0);
      while (q.length) {
        const top = q.ids[0];
        if (top & 1) {
          q.pop();
          results.push(top >> 1);
          if (results.length === maxResults) break;
          continue;
        }
        q.pop();
        const nodeIndex = top >> 1;
        const isLeafLevel = nodeIndex < numItems4;
        const end = Math.min(nodeIndex + nodeSize4, upperBound(nodeIndex, levelBounds));
        for (let pos = nodeIndex; pos < end; pos += 4) {
          const minX = boxes[pos];
          const minY = boxes[pos + 1];
          const maxX = boxes[pos + 2];
          const maxY = boxes[pos + 3];
          const dx = Math.max(Math.max(minX - x, x - maxX), 0);
          const dy = Math.max(Math.max(minY - y, y - maxY), 0);
          const dist = dx * dx + dy * dy;
          if (dist > bound) continue;
          const childIndex = indices[pos >> 2] | 0;
          if (isLeafLevel) {
            if (filterFn === void 0 || filterFn(childIndex)) {
              q.push(childIndex << 1 | 1, dist);
              if (trackNearest && dist < bound) bound = dist;
            }
          } else {
            q.push(childIndex << 1, dist);
          }
        }
      }
      q.clear();
      return results;
    }
  };
  function upperBound(value, arr) {
    let i = 0;
    let j = arr.length - 1;
    while (i < j) {
      const m = i + j >> 1;
      if (arr[m] > value) {
        j = m;
      } else {
        i = m + 1;
      }
    }
    return arr[i];
  }
  function sort(values, boxes, indices, left, right, nodeSize) {
    const stack = [left, right];
    while (stack.length) {
      const r = stack.pop() || 0;
      const l = stack.pop() || 0;
      if (r - l <= nodeSize && Math.floor(l / nodeSize) >= Math.floor(r / nodeSize)) continue;
      const a = values[l];
      const b = values[l + r >> 1];
      const c = values[r];
      const pivot = a > b !== a > c ? a : b < a !== b < c ? b : c;
      let i = l - 1;
      let j = r + 1;
      while (true) {
        do
          i++;
        while (values[i] < pivot);
        do
          j--;
        while (values[j] > pivot);
        if (i >= j) break;
        swap(values, boxes, indices, i, j);
      }
      stack.push(l, j, j + 1, r);
    }
  }
  function swap(values, boxes, indices, i, j) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    const k = 4 * i;
    const m = 4 * j;
    const a = boxes[k];
    const b = boxes[k + 1];
    const c = boxes[k + 2];
    const d = boxes[k + 3];
    boxes[k] = boxes[m];
    boxes[k + 1] = boxes[m + 1];
    boxes[k + 2] = boxes[m + 2];
    boxes[k + 3] = boxes[m + 3];
    boxes[m] = a;
    boxes[m + 1] = b;
    boxes[m + 2] = c;
    boxes[m + 3] = d;
    const e = indices[i];
    indices[i] = indices[j];
    indices[j] = e;
  }
  function hilbert(x, y) {
    let a = x ^ y;
    let b = 65535 ^ a;
    let c = 65535 ^ (x | y);
    let d = x & (y ^ 65535);
    let A = a | b >> 1;
    let B = a >> 1 ^ a;
    let C = c ^ (c >> 1 ^ b & d >> 1);
    let D = d ^ (a & c >> 1 ^ d >> 1);
    a = A & A >> 2 ^ B & B >> 2;
    b = A & B >> 2 ^ B & (A ^ B) >> 2;
    c = C ^ (A & C >> 2 ^ B & D >> 2);
    d = D ^ (B & C >> 2 ^ (A ^ B) & D >> 2);
    A = a & a >> 4 ^ b & b >> 4;
    B = a & b >> 4 ^ b & (a ^ b) >> 4;
    C = c ^ (a & c >> 4 ^ b & d >> 4);
    D = d ^ (b & c >> 4 ^ (a ^ b) & d >> 4);
    c = C ^ (A & C >> 8 ^ B & D >> 8);
    d = D ^ (B & C >> 8 ^ (A ^ B) & D >> 8);
    c ^= c >> 1;
    d ^= d >> 1;
    a = x ^ y;
    b = d | 65535 ^ (a | c);
    a = (a | a << 8) & 16711935;
    a = (a | a << 4) & 252645135;
    a = (a | a << 2) & 858993459;
    a = (a | a << 1) & 1431655765;
    b = (b | b << 8) & 16711935;
    b = (b | b << 4) & 252645135;
    b = (b | b << 2) & 858993459;
    b = (b | b << 1) & 1431655765;
    return ((b << 1 | a) >>> 0) - 2147483648;
  }

  // srcts/spatial.ts
  function brushKeys(elems, brush) {
    const out = [];
    const seen = {};
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (hasBbox(e) && rectsIntersect(e, brush) && !seen[e.key]) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function lassoKeys(elems, poly) {
    const out = [];
    const seen = {};
    if (poly.length < 3) return out;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e) || seen[e.key]) continue;
      if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }
  function polyBounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      if (poly[i].x < x0) x0 = poly[i].x;
      if (poly[i].y < y0) y0 = poly[i].y;
      if (poly[i].x > x1) x1 = poly[i].x;
      if (poly[i].y > y1) y1 = poly[i].y;
    }
    return { x0, y0, x1, y1 };
  }
  function nearestKey(elems, x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e)) continue;
      const d = distToBbox(x, y, e);
      if (d <= bestD) {
        bestD = d;
        best = e.key;
      }
    }
    return best;
  }
  function nearestSortedIdx(sorted, target) {
    const n = sorted.length;
    if (!n) return -1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (sorted[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(sorted[lo - 1] - target) <= Math.abs(sorted[lo] - target)) return lo - 1;
    return lo;
  }
  function columnTolerance(sorted) {
    let minGap = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i] - sorted[i - 1];
      if (g > 1e-6 && g < minGap) minGap = g;
    }
    return isFinite(minGap) ? minGap / 2 : 1;
  }

  // srcts/features/picking.ts
  function pickingFeature(ws) {
    function buildSpatialIndex() {
      ws.spatialIndex = null;
      ws.indexToElem = [];
      let count = 0;
      for (let i = 0; i < ws.elements.length; i++) if (hasBbox(ws.elements[i])) count++;
      if (!count) return;
      const idx = new Flatbush(count);
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        idx.add(e.x0, e.y0, e.x1, e.y1);
        ws.indexToElem.push(i);
      }
      idx.finish();
      ws.spatialIndex = idx;
    }
    function buildGeometry(g) {
      ws.geomByKey = {};
      ws.gx = new Float64Array(0);
      ws.gy = new Float64Array(0);
      ws.haveGeometry = false;
      if (!g) return;
      const keys = asColumn(g.key);
      const kinds = asColumn(g.kind);
      const ns = asColumn(g.n);
      const xs = asColumn(g.x);
      const ys = asColumn(g.y);
      if (!keys.length || xs.length !== ys.length) return;
      ws.gx = Float64Array.from(xs);
      ws.gy = Float64Array.from(ys);
      const nrs = g.nr != null ? asColumn(g.nr) : null;
      const rls = g.rl != null ? asColumn(g.rl) : null;
      const eos = g.eo != null ? asColumn(g.eo) : null;
      let at = 0, ra = 0;
      for (let i = 0; i < keys.length; i++) {
        const n = ns[i] | 0;
        if (n <= 0 || at + n > ws.gx.length) break;
        const rec = { kind: kinds[i], at, n };
        if (eos && eos[i] === 1) rec.evenodd = true;
        if (nrs && rls) {
          const k = nrs[i] | 0;
          if (k > 1) {
            const lens = [];
            for (let j = 0; j < k; j++) lens.push(rls[ra + j] | 0);
            rec.rings = lens;
          }
          ra += k > 0 ? k : 1;
        }
        (ws.geomByKey[keys[i]] || (ws.geomByKey[keys[i]] = [])).push(rec);
        at += n;
      }
      ws.haveGeometry = at > 0;
    }
    function distToElem(x, y, e) {
      const box = hasBbox(e) ? e : null;
      const gs = ws.geomByKey[e.key];
      if (!gs) {
        if (!box) return Infinity;
        if (isRoundMark(e.mark)) {
          const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
          const r = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2;
          const dx = x - cx, dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          return d > r ? d - r : 0;
        }
        return distToBbox(x, y, box);
      }
      let best = Infinity;
      for (let i = 0; i < gs.length; i++) {
        const d = distToGeom(x, y, gs[i], ws.gx, ws.gy, box);
        if (d < best) best = d;
      }
      return best;
    }
    function buildHoverAxis() {
      const cx = [];
      const cy = [];
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        cx.push({ c: (e.x0 + e.x1) / 2, k: e.key });
        cy.push({ c: (e.y0 + e.y1) / 2, k: e.key });
      }
      cx.sort((a, b) => a.c - b.c);
      cy.sort((a, b) => a.c - b.c);
      ws.sortedCx = cx.map((p) => p.c);
      ws.sortedCxKeys = cx.map((p) => p.k);
      ws.sortedCy = cy.map((p) => p.c);
      ws.sortedCyKeys = cy.map((p) => p.k);
      ws.tolX = columnTolerance(ws.sortedCx);
      ws.tolY = columnTolerance(ws.sortedCy);
    }
    function nearestAxisKey(axis, coord) {
      const sorted = axis === "x" ? ws.sortedCx : ws.sortedCy;
      const keys = axis === "x" ? ws.sortedCxKeys : ws.sortedCyKeys;
      const i = nearestSortedIdx(sorted, coord);
      return i >= 0 ? keys[i] : null;
    }
    function columnKeys(primary, axis) {
      const m = ws.meta[primary];
      if (!m || !hasBbox(m)) return [primary];
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const SPAN = 1e7;
      const rect = axis === "x" ? { x0: cx - ws.tolX, x1: cx + ws.tolX, y0: -SPAN, y1: SPAN } : { x0: -SPAN, x1: SPAN, y0: cy - ws.tolY, y1: cy + ws.tolY };
      const ks = brushKeysIn(rect);
      return ks.length ? ks : [primary];
    }
    function nearestKeyAt(x, y, maxDist) {
      let best = null;
      let bestD = maxDist;
      const rank = (e) => {
        if (e.source != null && !ws.geomByKey[e.key]) return;
        const d = distToElem(x, y, e);
        if (d <= bestD) {
          bestD = d;
          best = e.key;
        }
      };
      if (ws.spatialIndex) {
        const ids = ws.spatialIndex.neighbors(x, y, PICK_CANDIDATES, maxDist);
        for (let i = 0; i < ids.length; i++) rank(ws.elements[ws.indexToElem[ids[i]]]);
      } else {
        for (let i = 0; i < ws.elements.length; i++) rank(ws.elements[i]);
      }
      return best;
    }
    function brushKeysIn(rect) {
      if (!ws.spatialIndex) return brushKeys(ws.elements, rect);
      const eids = ws.spatialIndex.search(rect.x0, rect.y0, rect.x1, rect.y1).map((id) => ws.indexToElem[id]).sort((a, b) => a - b);
      const out = [];
      const seen = {};
      for (let i = 0; i < eids.length; i++) {
        const k = ws.elements[eids[i]].key;
        if (!seen[k]) {
          seen[k] = true;
          out.push(k);
        }
      }
      return out;
    }
    function lassoKeysIn(poly) {
      if (poly.length < 3) return [];
      if (!ws.spatialIndex) return lassoKeys(ws.elements, poly);
      const b = polyBounds(poly);
      const eids = ws.spatialIndex.search(b.x0, b.y0, b.x1, b.y1).map((id) => ws.indexToElem[id]).sort((a, b2) => a - b2);
      const out = [];
      const seen = {};
      for (let i = 0; i < eids.length; i++) {
        const e = ws.elements[eids[i]];
        if (seen[e.key] || !hasBbox(e)) continue;
        if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
          seen[e.key] = true;
          out.push(e.key);
        }
      }
      return out;
    }
    return { buildSpatialIndex, buildGeometry, distToElem, buildHoverAxis, nearestAxisKey, columnKeys, nearestKeyAt, brushKeysIn, lassoKeysIn };
  }

  // srcts/features/pointer.ts
  function pointerFeature(ws) {
    function positionBrush(x, y, w, h) {
      ws.brushBox.style.left = x + "px";
      ws.brushBox.style.top = y + "px";
      ws.brushBox.style.width = w + "px";
      ws.brushBox.style.height = h + "px";
      ws.brushBox.style.display = "block";
    }
    function hideBrush() {
      ws.brushBox.style.display = "none";
    }
    function lassoPointsAttr() {
      let s = "";
      for (let i = 0; i < ws.lassoPts.length; i++) s += (i ? " " : "") + ws.lassoPts[i].x + "," + ws.lassoPts[i].y;
      return s;
    }
    function updateLassoPath() {
      if (!ws.crosshairLayer) return;
      if (!ws.lassoEl) {
        ws.lassoEl = document.createElementNS(SVGNS, "polygon");
        ws.lassoEl.setAttribute("class", "vellumwidget-lasso");
        ws.lassoEl.setAttribute("vector-effect", "non-scaling-stroke");
        ws.crosshairLayer.appendChild(ws.lassoEl);
      }
      ws.lassoEl.setAttribute("points", lassoPointsAttr());
      if (ws.fx.azMulti() && ws.anchorPanel) ws.lassoEl.setAttribute("transform", ws.fx.fmtPan(ws.fx.azT(ws.anchorPanel)));
      else ws.lassoEl.removeAttribute("transform");
    }
    function clearLasso() {
      ws.lassoPts = [];
      if (ws.lassoEl && ws.lassoEl.parentNode) ws.lassoEl.parentNode.removeChild(ws.lassoEl);
      ws.lassoEl = null;
    }
    function hoverAt(k, clientX, clientY) {
      if (k != null && ws.fx.inert(k)) k = null;
      if (k == null) {
        ws.fx.clearHover();
        return;
      }
      const hm = ws.opts.hoverMode || "closest";
      const unified = hm === "x" || hm === "y";
      const keys = ws.fx.dropInert(unified ? ws.fx.columnKeys(k, hm) : ws.fx.linkedKeys(k));
      if (!keys.length) {
        ws.fx.clearHover();
        return;
      }
      const sig = hm + "" + k + "" + keys.join("");
      if (sig === ws.hoverSig) {
        if (ws.opts.tooltip) ws.fx.moveTip(clientX, clientY, k);
        return;
      }
      ws.fx.shinyInput("hover", k);
      ws.hovering = true;
      ws.fx.setHoverKeys(keys);
      if (ws.opts.crosshair) ws.fx.drawCrosshair(k, unified ? hm : "closest");
      if (ws.opts.tooltip) {
        if (unified) ws.fx.showTipMulti(clientX, clientY, keys);
        else ws.fx.showTip(clientX, clientY, k);
      }
      ws.hoverSig = sig;
    }
    function onHoverMove(ev) {
      if (ws.down || ws.pinchDist > 0) return;
      const hm = ws.opts.hoverMode || "closest";
      const k = keyOf(ev.target);
      if (k != null) {
        if (ws.hoverRAF) {
          cancelAnimationFrame(ws.hoverRAF);
          ws.hoverRAF = 0;
        }
        hoverAt(k, ev.clientX, ev.clientY);
        return;
      }
      if (!ws.elements.length || hm === "closest" && !ws.opts.nearest) {
        ws.fx.clearHover();
        return;
      }
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (ws.hoverRAF) return;
      ws.hoverRAF = requestAnimationFrame(function() {
        ws.hoverRAF = 0;
        const u = ws.fx.clientToScene(cx, cy);
        let seed;
        if (hm === "x") seed = ws.fx.nearestAxisKey("x", u.x);
        else if (hm === "y") seed = ws.fx.nearestAxisKey("y", u.y);
        else seed = ws.fx.nearestKeyAt(u.x, u.y, ws.vb ? ws.vb.w * 0.02 : 8);
        hoverAt(seed, cx, cy);
      });
    }
    function onDragMove(ev) {
      if (ws.pointers.has(ev.pointerId)) {
        ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      }
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
        ws.dragging = ws.mode === "pan" && ws.opts.zoom ? "pan" : ws.mode === "lasso" && ws.opts.lasso ? "lasso" : ws.opts.brush ? "brush" : "";
        if (ws.dragging === "pan") ws.el.classList.add("vellumwidget-panning");
        if (ws.dragging === "lasso") ws.lassoPts = [ws.fx.clientToScene(ws.down.cx, ws.down.cy)];
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
        const u2 = ws.fx.toAnchor(ev.clientX, ev.clientY);
        ws.down.ux = u2.x;
        ws.down.uy = u2.y;
      }
    }
    function onDown(ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      if (ws.pointers.size >= 2 && ws.opts.zoom) {
        const pts = Array.from(ws.pointers.values());
        ws.pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        ws.down = null;
        ws.dragging = "";
        hideBrush();
        ws.el.classList.remove("vellumwidget-panning");
        return;
      }
      if (ws.axisZoomActive) {
        const pu = ws.fx.toUser(ev.clientX, ev.clientY);
        ws.anchorPanel = ws.fx.azNearest(pu.x, pu.y);
      }
      const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
      ws.down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      ws.dragging = "";
      ws.movedDuringDrag = false;
    }
    function onDragUp(ev) {
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
        ws.fx.reportView();
        return;
      }
      if (ws.dragging === "brush" && ws.down) {
        const p1 = ws.fx.clientToScene(ws.down.cx, ws.down.cy);
        const p2 = ws.fx.clientToScene(ev.clientX, ev.clientY);
        const rect = {
          x0: Math.min(p1.x, p2.x),
          y0: Math.min(p1.y, p2.y),
          x1: Math.max(p1.x, p2.x),
          y1: Math.max(p1.y, p2.y)
        };
        const iv = ws.fx.applyIntervalBrush(rect);
        ws.lastBrush = iv ? iv.band : rect;
        const hitKeys = iv ? iv.keys : ws.fx.dropInert(ws.fx.brushKeysIn(rect));
        if (ws.opts.select) ws.fx.setSelection(hitKeys);
        else if (iv) ws.fx.reevaluateInteractions();
        ws.fx.shinyInput("brush", Object.assign(
          { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
          ws.fx.brushDataFields(rect),
          iv ? iv.fields : {}
        ), { priority: "event" });
        hideBrush();
      } else if (ws.dragging === "lasso") {
        const poly = ws.lassoPts.slice();
        const hitKeys = ws.fx.dropInert(ws.fx.lassoKeysIn(poly));
        if (poly.length >= 3) {
          const b = polyBounds(poly);
          ws.lastBrush = b;
          if (ws.opts.select) ws.fx.setSelection(hitKeys);
          ws.fx.shinyInput("brush", Object.assign(
            { keys: hitKeys, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lasso: true },
            ws.fx.brushDataFields(b)
          ), { priority: "event" });
        }
        clearLasso();
      }
      if (ws.dragging === "pan") ws.fx.reportView();
      ws.el.classList.remove("vellumwidget-panning");
      ws.down = null;
      ws.dragging = "";
    }
    function onClick(ev) {
      if (ws.movedDuringDrag) {
        ws.movedDuringDrag = false;
        return;
      }
      let k = keyOf(ev.target);
      if (k == null && ws.rasterMode && ws.opts.nearest !== false && ws.elements.length) {
        const u = ws.fx.clientToScene(ev.clientX, ev.clientY);
        const rad = ws.vb ? ws.vb.w * 0.02 : 8;
        k = ws.fx.nearestKeyAt(u.x, u.y, rad);
        if (k != null && ws.fx.inert(k)) k = null;
      }
      ws.fx.shinyInput("click", { key: k }, { priority: "event" });
      if (ws.provenance && ws.provenance.on === "click") ws.fx.emitSource(ev.target);
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
    function onDblClick(ev) {
      const series = ws.fx.swatchSeries(keyOf(ev.target));
      if (series != null && ws.fx.legendPolicy() !== "select") ws.fx.legendIsolate(series);
    }
    function onWheel(ev) {
      if (!ws.opts.zoom || !ws.vb) return;
      ev.preventDefault();
      const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
      const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
      ws.vb = zoomViewBox(ws.vb, factor, u.x, u.y);
      ws.fx.applyViewBox();
    }
    function onKey(ev) {
      if (ev.key === "Escape") {
        ws.fx.clearSelection();
        ws.fx.clearHover();
        ws.fx.clearClass("vellumwidget-focus");
        hideBrush();
        ws.lastBrush = null;
        if (ws.fx.markFocused() && typeof ws.el.focus === "function") ws.el.focus();
        ws.focusIdx = -1;
        return;
      }
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
        case "ArrowLeft":
          ws.vb.x -= dx;
          break;
        case "ArrowRight":
          ws.vb.x += dx;
          break;
        case "ArrowUp":
          ws.vb.y -= dy;
          break;
        case "ArrowDown":
          ws.vb.y += dy;
          break;
        case "+":
        case "=":
          ws.vb = zoomViewBox(ws.vb, 1.2, cx, cy);
          break;
        case "-":
        case "_":
          ws.vb = zoomViewBox(ws.vb, 1 / 1.2, cx, cy);
          break;
        default:
          handled = false;
      }
      if (handled) {
        ws.fx.applyViewBox();
        ev.preventDefault();
      }
    }
    return { clearLasso, onHoverMove, onDown, onClick, onDblClick, onWheel, onKey };
  }

  // srcts/features/proxy.ts
  function proxyFeature(ws) {
    function proxyCall(method, args) {
      const keys = Array.isArray(args) ? args : args == null ? [] : [String(args)];
      switch (method) {
        case "select":
          ws.fx.setSelection(keys);
          break;
        case "clearSelection":
          ws.fx.clearSelection();
          break;
        case "filter":
          ws.fx.applyFilter(keys);
          break;
        case "clearFilter":
          ws.fx.applyFilter(null);
          break;
        case "zoom":
          proxyZoomToKeys(keys);
          break;
        case "resetZoom":
          ws.fx.resetZoom();
          break;
        default:
          break;
      }
    }
    function proxyZoomToKeys(keys) {
      if (!keys.length) {
        ws.fx.resetZoom();
        return;
      }
      const sel = {};
      for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
      const bb = unionBbox(ws.elements, sel);
      if (bb) ws.fx.zoomTo(bb);
    }
    return { proxyCall };
  }

  // srcts/features/raster.ts
  function rasterFeature(ws) {
    function ensureCanvas() {
      if (ws.canvasEl) return;
      ws.canvasEl = document.createElement("canvas");
      ws.canvasEl.className = "vellumwidget-canvas";
      ws.canvasEl.setAttribute("aria-hidden", "true");
      (ws.stage || ws.el).appendChild(ws.canvasEl);
      ws.ctx = typeof ws.canvasEl.getContext === "function" ? ws.canvasEl.getContext("2d") : null;
    }
    function clearPointData() {
      ws.ptCx = ws.ptCy = ws.ptRad = null;
      ws.ptRGB = null;
      ws.ptN = 0;
      if (ws.canvasEl) ws.canvasEl.style.display = "none";
    }
    function sampleBaseRaster() {
      clearPointData();
      if (!ws.rasterMode || !ws.svgEl || !ws.vb0) return;
      const imgNode = ws.svgEl.querySelector("image");
      const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
      if (!href) return;
      const off = document.createElement("canvas");
      const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
      if (!octx) return;
      const iw = Math.max(1, Math.round(ws.vb0.w));
      const ih = Math.max(1, Math.round(ws.vb0.h));
      const els = ws.elements;
      const v0 = ws.vb0;
      const img = new Image();
      img.onload = function() {
        if (els !== ws.elements || v0 !== ws.vb0) return;
        off.width = iw;
        off.height = ih;
        octx.drawImage(img, 0, 0, iw, ih);
        let data;
        try {
          data = octx.getImageData(0, 0, iw, ih).data;
        } catch (e) {
          return;
        }
        const cx = [], cy = [], rad = [], rgb = [];
        for (let i = 0; i < els.length; i++) {
          const e = els[i];
          if (!hasBbox(e)) continue;
          const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
          const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
          const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
          const o = (sy * iw + sx) * 4;
          if (data[o + 3] < 8) continue;
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
        drawPoints();
      };
      img.onerror = function() {
      };
      img.src = href;
    }
    function drawPoints() {
      if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
      if (!isZoomedIn(ws.vb, ws.vb0) || !ws.ptCx || !ws.ptCy || !ws.ptRad || !ws.ptRGB || !ws.ptN) {
        ws.canvasEl.style.display = "none";
        return;
      }
      const rect = (ws.svgEl || ws.el).getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width || ws.vb0.w));
      const ch = Math.max(1, Math.round(rect.height || ws.vb0.h));
      const dpr = window.devicePixelRatio || 1;
      if (ws.canvasEl.width !== cw * dpr || ws.canvasEl.height !== ch * dpr) {
        ws.canvasEl.width = cw * dpr;
        ws.canvasEl.height = ch * dpr;
      }
      ws.canvasEl.style.width = cw + "px";
      ws.canvasEl.style.height = ch + "px";
      ws.canvasEl.style.display = "block";
      const W = ws.canvasEl.width, H = ws.canvasEl.height;
      ws.ctx.clearRect(0, 0, W, H);
      const rScale = ws.opts.zoomMarks === "scale" ? Math.min(W / ws.vb.w, H / ws.vb.h) : Math.min(W / ws.vb0.w, H / ws.vb0.h);
      const x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
      for (let i = 0; i < ws.ptN; i++) {
        const px = ws.ptCx[i], py = ws.ptCy[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const p = userToCanvas(ws.vb, W, H, px, py);
        ws.ctx.beginPath();
        ws.ctx.arc(p.px, p.py, Math.max(0.75, ws.ptRad[i] * rScale), 0, 6.283185307179586);
        ws.ctx.fillStyle = "rgb(" + ws.ptRGB[i * 3] + "," + ws.ptRGB[i * 3 + 1] + "," + ws.ptRGB[i * 3 + 2] + ")";
        ws.ctx.fill();
      }
    }
    function ringFor(k, cls) {
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return null;
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      c.setAttribute("class", cls);
      c.setAttribute("vector-effect", "non-scaling-stroke");
      return c;
    }
    function clearGroup(g) {
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
    }
    function drawSelFeedback() {
      clearGroup(ws.selGroup);
      if (!ws.selGroup) return;
      const keys = ws.fx.selectedKeys();
      if (keys.length > OVERLAY_MARK_CAP) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-sel");
        if (c) ws.selGroup.appendChild(c);
      }
    }
    function drawHovFeedback(keys) {
      clearGroup(ws.hovGroup);
      if (!ws.hovGroup) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-hov");
        if (c) ws.hovGroup.appendChild(c);
      }
    }
    function setHoverKeys(keys) {
      ws.hoverSig = "";
      if (!ws.opts.hover) return;
      ws.hovering = true;
      if (ws.rasterMode) {
        drawHovFeedback(keys);
        return;
      }
      ws.lastHoverKeys = keys;
      ws.fx.clearClass("vellumwidget-hl");
      ws.fx.addClassForKeys(keys, "vellumwidget-hl");
      ws.fx.reevaluateInteractions();
      if (ws.largeDim) ws.fx.showHighlightOverlay(keys);
      else ws.el.classList.add("vellumwidget-hovering");
    }
    function setHover(k) {
      setHoverKeys(ws.fx.linkedKeys(k));
    }
    return { ensureCanvas, clearPointData, sampleBaseRaster, drawPoints, clearGroup, drawSelFeedback, setHoverKeys, setHover };
  }

  // srcts/shiny.ts
  function dispatchProxyCall(msg, findInstance) {
    if (!msg || msg.id == null) return;
    const inst = findInstance(msg.id);
    if (inst && typeof inst._call === "function") inst._call(msg.method, msg.args);
  }
  var proxyHandlerRegistered = false;
  function registerProxyHandler() {
    if (proxyHandlerRegistered) return;
    const sh = window.Shiny;
    if (!sh || typeof sh.addCustomMessageHandler !== "function") return;
    proxyHandlerRegistered = true;
    sh.addCustomMessageHandler("vellumwidget-calls", function(msg) {
      dispatchProxyCall(msg, function(id) {
        return HTMLWidgets.find ? HTMLWidgets.find("#" + id) : null;
      });
    });
  }

  // srcts/features/render.ts
  function renderFeature(ws) {
    function applyStyling() {
      const s = ws.opts.style || {};
      const setRoot = (name, v) => {
        if (v != null && v !== "") ws.el.style.setProperty(name, String(v));
        else ws.el.style.removeProperty(name);
      };
      setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
      setRoot("--vellumwidget-selected-stroke", s.selectedColor);
      setRoot("--vellumwidget-tip-bg", s.tipBg);
      setRoot("--vellumwidget-tip-fg", s.tipFg);
      setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
      setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
      if (s.hoverColor != null && s.hoverColor !== "") {
        ws.el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
        ws.el.classList.add("vellumwidget-hc-all");
      } else {
        ws.el.style.removeProperty("--vellumwidget-hl-stroke");
        ws.el.classList.remove("vellumwidget-hc-all");
      }
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
        const nodes = ws.fx.elementsForKey(e.key);
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j];
          if (e.hover_color != null) {
            n.style.setProperty("--vellumwidget-hl-stroke", e.hover_color);
            n.classList.add("vellumwidget-hc");
          }
          if (e.selected_color != null) {
            n.style.setProperty("--vellumwidget-selected-stroke", e.selected_color);
          }
          if (e.legend_for != null) n.classList.add("vellumwidget-legend");
        }
      }
    }
    function wire(svg) {
      svg.addEventListener("pointermove", ws.fx.onHoverMove);
      svg.addEventListener("pointerleave", ws.fx.clearHover);
      svg.addEventListener("pointerdown", ws.fx.onDown);
      svg.addEventListener("click", ws.fx.onClick);
      svg.addEventListener("dblclick", ws.fx.onDblClick);
      if (ws.opts.zoom) svg.addEventListener("wheel", ws.fx.onWheel, { passive: false });
      if (ws.opts.zoom || ws.opts.brush) ws.el.classList.add("vellumwidget-gesture");
      ws.el.setAttribute("tabindex", "0");
      ws.el.addEventListener("keydown", ws.fx.onKey);
    }
    function renderValue(x) {
      ws.opts = Object.assign(
        // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
        // zoom are on unless the payload overrides them. (as_widget() no longer
        // exposes these as flags; the defaults live here.)
        { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed" },
        x.options || {}
      );
      ws.elements = normalizeElements(x.elements);
      ws.panels = normalizePanels(x.panels);
      ws.colorbar = x.colorbar || null;
      ws.interactions = x.interactions || null;
      ws.provenance = x.provenance || null;
      ws.condTagElems = {};
      ws.filtSelElems = {};
      ws.joinOf = {};
      ws.lastHoverKeys = [];
      ws.hoverSig = "";
      ws.meta = {};
      ws.groups = {};
      ws.incidentEdges = {};
      ws.neighbourNodes = {};
      ws.edgeEndpoints = {};
      ws.neighbourExpand = null;
      ws.legendIndex = {};
      ws.legendSwatch = {};
      ws.legendOff = {};
      ws.hiddenKeySet = {};
      ws.filteredKeySet = {};
      ws.selected = {};
      ws.lastBrush = null;
      ws.intervals = {};
      ws.intervalEl = null;
      ws.intervalBand = null;
      ws.mode = "brush";
      ws.group = ws.opts.group || null;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        ws.meta[e.key] = e;
        if (e.hover_group != null) (ws.groups[e.hover_group] = ws.groups[e.hover_group] || []).push(e.key);
        if (e.source != null && e.target != null) {
          ws.edgeEndpoints[e.key] = [e.source, e.target];
          (ws.incidentEdges[e.source] = ws.incidentEdges[e.source] || []).push(e.key);
          (ws.incidentEdges[e.target] = ws.incidentEdges[e.target] || []).push(e.key);
          (ws.neighbourNodes[e.source] = ws.neighbourNodes[e.source] || []).push(e.target);
          (ws.neighbourNodes[e.target] = ws.neighbourNodes[e.target] || []).push(e.source);
        }
        if (e.legend != null) {
          const series = Array.isArray(e.legend) ? e.legend : [e.legend];
          for (let s = 0; s < series.length; s++) {
            (ws.legendIndex[series[s]] = ws.legendIndex[series[s]] || []).push(e.key);
          }
        }
        if (e.legend_for != null) (ws.legendSwatch[e.legend_for] = ws.legendSwatch[e.legend_for] || []).push(e.key);
      }
      const sels = ws.interactions && ws.interactions.selections || [];
      for (let i = 0; i < sels.length; i++) {
        const ex = sels[i].expand;
        if (ex && ex.mode === "neighbours") {
          ws.neighbourExpand = {
            degree: Math.max(1, Math.floor(ex.degree || 1)),
            edges: ex.edges !== false
          };
          break;
        }
      }
      if (!ws.holder) {
        ws.stage = document.createElement("div");
        ws.stage.className = "vellumwidget-stage";
        ws.el.appendChild(ws.stage);
        ws.holder = document.createElement("div");
        ws.holder.className = "vellumwidget-svg-holder";
        ws.stage.appendChild(ws.holder);
        ws.dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ws.dimLayer.setAttribute("class", "vellumwidget-dim-layer");
        ws.dimLayer.setAttribute("aria-hidden", "true");
        ws.crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ws.crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
        ws.crosshairLayer.setAttribute("aria-hidden", "true");
        ws.stage.appendChild(ws.crosshairLayer);
        ws.stage.appendChild(ws.dimLayer);
        ws.el.appendChild(ws.brushBox);
        ws.el.appendChild(ws.tip);
        ws.tip.addEventListener("pointerenter", function() {
          if (ws.tipHideTimer) {
            clearTimeout(ws.tipHideTimer);
            ws.tipHideTimer = 0;
          }
        });
        ws.tip.addEventListener("pointerleave", function() {
          ws.fx.hideTip();
        });
      }
      ws.holder.innerHTML = x.svg;
      ws.svgEl = ws.holder.querySelector("svg");
      ws.nodesByKey = {};
      if (ws.holder) {
        const keyed = ws.holder.querySelectorAll("[data-key]");
        for (let i = 0; i < keyed.length; i++) {
          const k = keyed[i].getAttribute("data-key");
          if (k != null) (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(keyed[i]);
        }
      }
      if (ws.svgEl) {
        ws.vb0 = parseViewBox(ws.svgEl.getAttribute("viewBox"));
        if (!ws.vb0) {
          const w = parseFloat(ws.svgEl.getAttribute("width") || "0");
          const h = parseFloat(ws.svgEl.getAttribute("height") || "0");
          if (w && h) ws.vb0 = { x: 0, y: 0, w, h };
        }
        ws.vb = ws.vb0 ? { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h } : null;
        ws.fx.hideHighlightOverlay();
        ws.rasterMode = !!ws.opts.raster;
        ws.largeDim = !ws.rasterMode && ws.elements.length > DIM_OVERLAY_MIN;
        ws.selGroup = null;
        ws.hovGroup = null;
        if (ws.rasterMode && ws.dimLayer) {
          ws.selGroup = document.createElementNS(SVGNS, "g");
          ws.hovGroup = document.createElementNS(SVGNS, "g");
          ws.dimLayer.appendChild(ws.selGroup);
          ws.dimLayer.appendChild(ws.hovGroup);
        }
        if (ws.dimLayer && ws.vb0) ws.dimLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
        if (ws.crosshairLayer && ws.vb0) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
        ws.fx.clearCrosshair();
        if (ws.rasterMode) {
          ws.fx.ensureCanvas();
          ws.fx.sampleBaseRaster();
        } else {
          ws.fx.clearPointData();
        }
        ws.fx.buildSpatialIndex();
        ws.fx.buildGeometry(x.geometry);
        ws.fx.buildHoverAxis();
        wire(ws.svgEl);
        ws.fx.buildToolbar();
        ws.fx.buildNavigator();
        ws.fx.buildColorbar();
        ws.fx.setupInteractions();
        ws.fx.setupAxisZoom();
        ws.xZoom = !!ws.opts.navigator && !ws.rasterMode;
        ws.fx.applyAspect();
        ws.fx.setMode(ws.fx.availableModes()[0] || "brush");
        ws.tip.classList.toggle("vellumwidget-tip-sticky", !!ws.opts.tooltipSticky);
        applyStyling();
        ws.fx.applyLegend();
        ws.fx.setupA11y();
        ws.fx.setupLinking();
        ws.fx.shinyInput("selected", ws.fx.selectedKeys());
        registerProxyHandler();
      }
    }
    function resize() {
      ws.fx.drawPoints();
    }
    return { renderValue, resize };
  }

  // srcts/linking.ts
  var vellumwidgetBus = {};
  function busJoin(group, m) {
    (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
  }
  function busPublish(group, sender, keys) {
    const members = vellumwidgetBus[group] || [];
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender) members[i].onSelect(keys);
    }
  }
  function busPublishView(group, sender, v) {
    const members = vellumwidgetBus[group] || [];
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender && members[i].onView) members[i].onView(v);
    }
  }
  function getCrosstalk() {
    return window.crosstalk || null;
  }

  // srcts/features/selection.ts
  function selectionFeature(ws) {
    function shinyInput(event, value, opts) {
      const hw = HTMLWidgets;
      const sh = window.Shiny;
      if (hw.shinyMode && sh && sh.setInputValue && ws.el.id) {
        sh.setInputValue(ws.el.id + "_" + event, value, opts);
      }
    }
    function refreshSelected() {
      if (ws.rasterMode) {
        ws.fx.drawSelFeedback();
        return;
      }
      ws.fx.clearClass("vellumwidget-selected");
      for (const k in ws.selected) if (ws.selected[k]) ws.fx.addClassForKeys([k], "vellumwidget-selected");
      ws.fx.reevaluateInteractions();
    }
    function selectedKeys() {
      return Object.keys(ws.selected).filter((k) => ws.selected[k]);
    }
    function broadcast() {
      const keys = selectedKeys();
      if (ws.group) busPublish(ws.group, ws.selfToken, keys);
      if (ws.ctSel) ws.ctSel.set(keys);
      shinyInput("selected", keys);
    }
    function toggleSelect(k) {
      const ks = ws.fx.linkedKeys(k);
      if (ws.opts.selectMode === "single") {
        const allOn = ks.every((x) => ws.selected[x]) && selectedKeys().length === ks.length;
        ws.selected = {};
        if (!allOn) ks.forEach((x) => ws.selected[x] = true);
      } else {
        const turnOn = !ks.every((x) => ws.selected[x]);
        ks.forEach((x) => ws.selected[x] = turnOn);
      }
      refreshSelected();
      broadcast();
    }
    function setSelection(keys) {
      ws.selected = {};
      for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
      refreshSelected();
      broadcast();
    }
    function clearSelection() {
      ws.selected = {};
      const hadInterval = ws.fx.clearIntervals();
      refreshSelected();
      broadcast();
      if (hadInterval) shinyInput("brush", null, { priority: "event" });
    }
    function applyLinkedSelection(keys) {
      ws.selected = {};
      for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
      refreshSelected();
      shinyInput("selected", selectedKeys());
    }
    function applyFilter(showKeys) {
      ws.fx.clearClass("vellumwidget-filtered");
      ws.filteredKeySet = {};
      if (showKeys == null) return;
      const show = {};
      for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
      for (let i = 0; i < ws.elements.length; i++) {
        const key = ws.elements[i].key;
        if (!show[key]) {
          ws.fx.addClassForKeys([key], "vellumwidget-filtered");
          ws.filteredKeySet[key] = true;
        }
      }
    }
    function inert(k) {
      return !!ws.hiddenKeySet[k] || !!ws.filteredKeySet[k] || !!ws.colorHiddenSet[k];
    }
    function dropInert(keys) {
      return keys.filter((k) => !inert(k));
    }
    function setupLinking() {
      if (ws.joined) return;
      ws.joined = true;
      if (ws.group) busJoin(ws.group, { token: ws.selfToken, onSelect: applyLinkedSelection, onView: ws.fx.applyLinkedView });
      const ct = getCrosstalk();
      if (ws.opts.crosstalk && ct) {
        ws.ctSel = new ct.SelectionHandle(ws.opts.crosstalk);
        ws.ctFilt = new ct.FilterHandle(ws.opts.crosstalk);
        ws.ctSel.on("change", function(e) {
          if (e.sender !== ws.ctSel) applyLinkedSelection(e.value || []);
        });
        ws.ctFilt.on("change", function(e) {
          applyFilter(e.value);
        });
      }
    }
    return { shinyInput, selectedKeys, toggleSelect, setSelection, clearSelection, applyFilter, inert, dropInert, setupLinking };
  }

  // srcts/features/source.ts
  function sourceFeature(ws) {
    function emitSource(target) {
      if (!ws.provenance) return;
      const pid = vellumIdOf(target);
      const raw = pid ? ws.provenance.byId[pid] : void 0;
      const rows = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      if (!pid || !rows.length) {
        hideSourcePopover();
        return;
      }
      const tbl = sourceTable(ws.provenance, pid);
      ws.fx.shinyInput(
        "source",
        { id: pid, source: tbl.source, rows, fields: tbl.fields },
        { priority: "event" }
      );
      const values = tbl.values ? rows.map((r) => tbl.values[r - 1]).filter(Boolean) : null;
      ws.el.dispatchEvent(
        new window.CustomEvent("vellum:source", {
          detail: { id: pid, source: tbl.source, rows, fields: tbl.fields, values },
          bubbles: true
        })
      );
      if (values) showSourcePopover(target, tbl.fields, values);
    }
    function hideSourcePopover() {
      if (ws.sourcePopover) {
        ws.sourcePopover.remove();
        ws.sourcePopover = null;
      }
    }
    function showSourcePopover(node, fields, values) {
      var _a;
      hideSourcePopover();
      const pop = document.createElement("div");
      pop.className = "vellumwidget-source";
      pop.setAttribute("role", "dialog");
      pop.style.cssText = "position:absolute;z-index:20;max-height:220px;overflow:auto;background:var(--vw-bg,#fff);color:var(--vw-fg,#111);border:1px solid rgba(0,0,0,.2);border-radius:6px;padding:6px 8px;font:11px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);max-width:320px;";
      const table = document.createElement("table");
      table.style.borderCollapse = "collapse";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const f of fields) {
        const th = document.createElement("th");
        th.textContent = String(f);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of values.slice(0, 12)) {
        const tr = document.createElement("tr");
        for (const f of fields) {
          const td = document.createElement("td");
          td.textContent = String((_a = row[f]) != null ? _a : "");
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      pop.appendChild(table);
      if (values.length > 12) {
        const more = document.createElement("div");
        more.className = "vw-src-more";
        more.textContent = "+" + (values.length - 12) + " more";
        pop.appendChild(more);
      }
      const nb = node.getBoundingClientRect();
      const cb = ws.el.getBoundingClientRect();
      pop.style.left = Math.min(nb.left - cb.left + 8, Math.max(0, cb.width - 220)) + "px";
      pop.style.top = Math.max(0, nb.top - cb.top + 8) + "px";
      ws.el.appendChild(pop);
      ws.sourcePopover = pop;
    }
    return { emitSource };
  }

  // srcts/features/toolbar.ts
  function toolbarFeature(ws) {
    function availableModes() {
      const m = [];
      if (ws.opts.brush) m.push("brush");
      if (ws.opts.lasso) m.push("lasso");
      if (ws.opts.zoom) m.push("pan");
      return m;
    }
    function setMode(m) {
      ws.mode = m;
      ws.el.classList.toggle("vellumwidget-mode-pan", m === "pan");
      ws.el.classList.toggle("vellumwidget-mode-lasso", m === "lasso");
      if (m !== "lasso") ws.fx.clearLasso();
      if (ws.toolbarEl) {
        const b = ws.toolbarEl.querySelector('[data-act="mode"]');
        if (b) {
          const modes = availableModes();
          const next = modes[(modes.indexOf(m) + 1) % modes.length];
          b.textContent = MODE_ICON[m];
          b.title = MODE_LABEL[m][0].toUpperCase() + MODE_LABEL[m].slice(1) + " mode" + (next && next !== m ? " (click for " + MODE_LABEL[next] + ")" : "");
          b.classList.toggle("vellumwidget-active", m !== "brush");
        }
      }
    }
    function cycleMode() {
      const modes = availableModes();
      if (modes.length < 2) return;
      setMode(modes[(modes.indexOf(ws.mode) + 1) % modes.length]);
    }
    function exportName() {
      const n = ws.opts.export && ws.opts.export.filename;
      return n && String(n).length ? String(n) : "plot";
    }
    function exportScale() {
      const s = ws.opts.export && ws.opts.export.scale;
      return s && s > 0 ? s : 1;
    }
    function saveSvg() {
      if (!ws.svgEl) return;
      const s = new XMLSerializer().serializeToString(ws.svgEl);
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
    }
    function toCanvas(then, fail) {
      if (!ws.svgEl) return fail();
      const s = new XMLSerializer().serializeToString(ws.svgEl);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function() {
        const k = exportScale();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((ws.vb0 ? ws.vb0.w : img.width) * k);
        canvas.height = Math.round((ws.vb0 ? ws.vb0.h : img.height) * k);
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(url);
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          then(canvas);
        } else {
          fail();
        }
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        fail();
      };
      img.src = url;
    }
    function savePng() {
      toCanvas(
        function(canvas) {
          canvas.toBlob(function(b) {
            if (b) download(b, exportName() + ".png");
          });
        },
        saveSvg
        // canvas tainted / unsupported -> fall back to SVG
      );
    }
    function canCopy() {
      const nav = navigator;
      return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
    }
    function copyPng() {
      if (!canCopy()) return;
      toCanvas(
        function(canvas) {
          canvas.toBlob(function(b) {
            if (!b) return;
            const nav = navigator;
            nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function() {
            });
          });
        },
        function() {
        }
      );
    }
    function toggleFullscreen() {
      const anyEl = ws.el;
      const anyDoc = document;
      if (anyDoc.fullscreenElement) {
        if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
      } else if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      }
    }
    function zoomToSelection() {
      const rect = ws.lastBrush || unionBbox(ws.elements, ws.selected);
      if (rect) ws.fx.zoomTo(rect);
    }
    function buildToolbar() {
      if (ws.toolbarEl) {
        ws.toolbarEl.remove();
        ws.toolbarEl = null;
      }
      if (!ws.opts.toolbar) return;
      const bar = document.createElement("div");
      bar.className = "vellumwidget-toolbar";
      const btn = (act, label, title, fn) => {
        const b = document.createElement("button");
        b.setAttribute("data-act", act);
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function(e) {
          e.stopPropagation();
          fn();
        });
        bar.appendChild(b);
        return b;
      };
      if (availableModes().length >= 2) btn("mode", MODE_ICON[ws.mode], "Drag mode", cycleMode);
      if (ws.opts.zoom) {
        btn("zoomsel", "\u2316", "Zoom to selection", zoomToSelection);
        btn("reset", "\u27F2", "Reset zoom", ws.fx.resetZoom);
      }
      btn("svg", "SVG", "Download SVG", saveSvg);
      btn("png", "PNG", "Download PNG", savePng);
      if (canCopy()) btn("copy", "\u29C9", "Copy PNG to clipboard", copyPng);
      btn("full", "\u26F6", "Fullscreen", toggleFullscreen);
      ws.el.appendChild(bar);
      ws.toolbarEl = bar;
    }
    return { availableModes, setMode, buildToolbar };
  }

  // srcts/features/viewport.ts
  function viewportFeature(ws) {
    function reportView() {
      if (!ws.vb) return;
      const payload = { x: ws.vb.x, y: ws.vb.y, w: ws.vb.w, h: ws.vb.h, zoomed: ws.vb0 ? isZoomedIn(ws.vb, ws.vb0) : false };
      if (ws.panels.length === 1) {
        let d;
        if (ws.axisZoomActive && ws.vb0) {
          const p = ws.panels[0];
          const a = panToView(ws.vb, ws.vb0, p.px0, p.py0);
          const b = panToView(ws.vb, ws.vb0, p.px1, p.py1);
          d = ws.fx.dataRangeOf(p, a.x, a.y, b.x, b.y);
        } else {
          d = ws.fx.dataRangeOf(ws.panels[0], ws.vb.x, ws.vb.y, ws.vb.x + ws.vb.w, ws.vb.y + ws.vb.h);
        }
        if (d) payload.data = d;
      }
      ws.fx.shinyInput("zoom", payload);
      if (ws.group && ws.vb0 && !ws.receivingView && ws.vb0.w && ws.vb0.h) {
        busPublishView(ws.group, ws.selfToken, {
          x: (ws.vb.x - ws.vb0.x) / ws.vb0.w,
          y: (ws.vb.y - ws.vb0.y) / ws.vb0.h,
          w: ws.vb.w / ws.vb0.w,
          h: ws.vb.h / ws.vb0.h
        });
      }
    }
    function applyLinkedView(v) {
      if (!ws.vb0) return;
      const next = {
        x: ws.vb0.x + v.x * ws.vb0.w,
        y: ws.vb0.y + v.y * ws.vb0.h,
        w: v.w * ws.vb0.w,
        h: v.h * ws.vb0.h
      };
      if (!(next.w > 0) || !(next.h > 0)) return;
      if (ws.vb && Math.abs(next.x - ws.vb.x) < 1e-6 && Math.abs(next.y - ws.vb.y) < 1e-6 && Math.abs(next.w - ws.vb.w) < 1e-6 && Math.abs(next.h - ws.vb.h) < 1e-6) return;
      ws.receivingView = true;
      ws.vb = next;
      applyViewBox();
      ws.receivingView = false;
    }
    function applyAspect() {
      const par = ws.xZoom && !ws.axisZoomActive ? "none" : "xMidYMid meet";
      if (ws.svgEl) ws.svgEl.setAttribute("preserveAspectRatio", par);
      if (ws.dimLayer) ws.dimLayer.setAttribute("preserveAspectRatio", par);
      if (ws.crosshairLayer) ws.crosshairLayer.setAttribute("preserveAspectRatio", par);
      if (ws.colorbarLayer) ws.colorbarLayer.setAttribute("preserveAspectRatio", par);
    }
    function applyViewBox() {
      ws.hoverSig = "";
      if (ws.xZoom && ws.vb && ws.vb0) {
        ws.vb.y = ws.vb0.y;
        ws.vb.h = ws.vb0.h;
      }
      if (ws.axisZoomActive && ws.panGroup && ws.vb && ws.vb0) {
        ws.fx.applyPanTransforms();
        if (ws.svgEl) ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb0));
        ws.fx.retick();
      } else if (ws.svgEl && ws.vb) {
        ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb));
      }
      const overlayVb = ws.fx.azMulti() ? ws.vb0 : ws.vb;
      if (ws.dimLayer && overlayVb) ws.dimLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      if (ws.crosshairLayer && overlayVb) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      ws.fx.placeIntervalBand();
      if (ws.colorbarLayer && (ws.vb || ws.vb0)) {
        ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb));
      }
      ws.fx.drawPoints();
      ws.fx.updateNav();
      if (ws.dragging !== "pan" && ws.pinchDist === 0) reportView();
    }
    function resetZoom() {
      if (ws.vb0) {
        ws.vb = { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h };
        applyViewBox();
      }
    }
    function zoomTo(rect, pad = 0.05) {
      if (!ws.vb) return;
      if (ws.fx.azMulti()) {
        const a = ws.fx.azNearest((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
        if (a) {
          rect = {
            x0: (rect.x0 - a.bx) / a.ax,
            x1: (rect.x1 - a.bx) / a.ax,
            y0: (rect.y0 - a.by) / a.ay,
            y1: (rect.y1 - a.by) / a.ay
          };
        }
      }
      const w = Math.max(rect.x1 - rect.x0, 1e-6);
      const h = Math.max(rect.y1 - rect.y0, 1e-6);
      const px = w * pad;
      const py = h * pad;
      ws.vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
      applyViewBox();
    }
    return { reportView, applyLinkedView, applyAspect, applyViewBox, resetZoom, zoomTo };
  }

  // srcts/state.ts
  function createState(el) {
    return {
      el,
      fx: {},
      tip: document.createElement("div"),
      brushBox: document.createElement("div"),
      holder: null,
      stage: null,
      svgEl: null,
      toolbarEl: null,
      navEl: null,
      navWindow: null,
      colorbar: null,
      colorbarLayer: null,
      interactions: null,
      provenance: null,
      condTagElems: {},
      filtSelElems: {},
      joinOf: {},
      lastHoverKeys: [],
      hoverSig: "",
      hovering: false,
      colorRange: null,
      colorHiddenSet: {},
      meta: {},
      groups: {},
      incidentEdges: {},
      neighbourNodes: {},
      edgeEndpoints: {},
      neighbourExpand: null,
      legendIndex: {},
      legendSwatch: {},
      legendOff: {},
      hiddenKeySet: {},
      filteredKeySet: {},
      elements: [],
      panels: [],
      selected: {},
      nodesByKey: {},
      hoverRAF: 0,
      spatialIndex: null,
      indexToElem: [],
      geomByKey: {},
      gx: new Float64Array(0),
      gy: new Float64Array(0),
      haveGeometry: false,
      largeDim: false,
      dimLayer: null,
      crosshairLayer: null,
      sortedCx: [],
      sortedCxKeys: [],
      sortedCy: [],
      sortedCyKeys: [],
      tolX: 1,
      tolY: 1,
      rasterMode: false,
      selGroup: null,
      hovGroup: null,
      canvasEl: null,
      ctx: null,
      ptCx: null,
      ptCy: null,
      ptRad: null,
      ptRGB: null,
      ptN: 0,
      opts: {
        tooltip: true,
        hover: true,
        select: true,
        brush: true,
        lasso: true,
        zoom: true,
        toolbar: true,
        nearest: true,
        a11y: true,
        selectMode: "multiple",
        hoverMode: "closest",
        crosshair: false,
        navigator: false
      },
      liveRegion: null,
      tableEl: null,
      focusables: [],
      focusIdx: -1,
      vb0: null,
      vb: null,
      azPanels: [],
      panGroup: null,
      axisZoomActive: false,
      retickLayer: null,
      anchorPanel: null,
      xZoom: false,
      axisStyle: {
        // presentation scraped from vellum's own axis/grid nodes so the re-tick matches the theme
        textFill: "#333333",
        fontFamily: "sans-serif",
        fontSize: 12,
        gridStroke: "#ffffff",
        gridWidth: 1
      },
      mode: "brush",
      lastBrush: null,
      intervals: {},
      intervalEl: null,
      intervalBand: null,
      lassoPts: [],
      lassoEl: null,
      selfToken: {},
      group: null,
      receivingView: false,
      joined: false,
      ctSel: null,
      ctFilt: null,
      tipShowTimer: 0,
      tipHideTimer: 0,
      down: null,
      dragging: "",
      movedDuringDrag: false,
      pointers: /* @__PURE__ */ new Map(),
      pinchDist: 0,
      sourcePopover: null
    };
  }

  // srcts/index.ts
  HTMLWidgets.widget({
    name: "vellumwidget",
    type: "output",
    factory: function(el) {
      const ws = createState(el);
      Object.assign(
        ws.fx,
        coordsFeature(ws),
        highlightFeature(ws),
        legendFeature(ws),
        pickingFeature(ws),
        hoverFeature(ws),
        rasterFeature(ws),
        selectionFeature(ws),
        declarativeFeature(ws),
        intervalFeature(ws),
        proxyFeature(ws),
        viewportFeature(ws),
        axisZoomFeature(ws),
        navigatorFeature(ws),
        colorbarFeature(ws),
        pointerFeature(ws),
        sourceFeature(ws),
        toolbarFeature(ws),
        renderFeature(ws),
        a11yFeature(ws)
      );
      ensureStyle();
      el.classList.add("vellumwidget-root");
      ws.tip.className = "vellumwidget-tip";
      ws.brushBox.className = "vellumwidget-brush";
      return {
        renderValue: ws.fx.renderValue,
        resize: ws.fx.resize,
        // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
        // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
        _call: ws.fx.proxyCall,
        // Test seam: the index-backed query functions + hover-mode flags, so the
        // headless suite can verify the spatial index with explicit coordinates
        // (jsdom has no layout, so client->user coordinate mapping is degenerate).
        _test: {
          nearestKeyAt: ws.fx.nearestKeyAt,
          brushKeysIn: ws.fx.brushKeysIn,
          indexSize: function() {
            return ws.spatialIndex ? ws.spatialIndex.numItems : 0;
          },
          // True-geometry picking (WI-3): whether the payload carried geometry, and
          // the exact distance to one key, so the suite can assert the ranking that
          // the bbox distance would get wrong.
          haveGeometry: function() {
            return ws.haveGeometry;
          },
          geomVertexCount: function() {
            return ws.gx.length;
          },
          distToKey: function(x, y, key) {
            for (let i = 0; i < ws.elements.length; i++) {
              if (ws.elements[i].key === key) return ws.fx.distToElem(x, y, ws.elements[i]);
            }
            return Infinity;
          },
          largeDim: function() {
            return ws.largeDim;
          },
          rasterMode: function() {
            return ws.rasterMode;
          },
          hasCanvas: function() {
            return !!ws.canvasEl;
          },
          pointCount: function() {
            return ws.ptN;
          },
          hoverMode: function() {
            return ws.opts.hoverMode || "closest";
          },
          columnKeys: ws.fx.columnKeys,
          nearestAxisKey: ws.fx.nearestAxisKey,
          legendOff: function() {
            return Object.keys(ws.legendOff).filter((s) => ws.legendOff[s]);
          },
          lassoKeysIn: ws.fx.lassoKeysIn,
          availableModes: ws.fx.availableModes,
          mode: function() {
            return ws.mode;
          },
          inert: ws.fx.inert,
          dropInert: ws.fx.dropInert,
          panelAt: ws.fx.panelAt,
          dataRangeOf: ws.fx.dataRangeOf,
          // Interval selections: the active ranges/members, and a completed brush
          // driven directly (device-px scene rect), bypassing pointer calibration.
          intervals: function() {
            return ws.intervals;
          },
          brushInterval: function(rect) {
            const iv = ws.fx.applyIntervalBrush(rect);
            if (!iv) return null;
            ws.lastBrush = iv.band;
            if (ws.opts.select) ws.fx.setSelection(iv.keys);
            else ws.fx.reevaluateInteractions();
            return iv;
          },
          intervalBand: function() {
            if (!ws.intervalEl || !ws.intervalEl.parentNode) return null;
            return {
              x: parseFloat(ws.intervalEl.getAttribute("x") || "NaN"),
              y: parseFloat(ws.intervalEl.getAttribute("y") || "NaN"),
              w: parseFloat(ws.intervalEl.getAttribute("width") || "NaN"),
              h: parseFloat(ws.intervalEl.getAttribute("height") || "NaN")
            };
          },
          clearSelection: ws.fx.clearSelection,
          brushDataFields: ws.fx.brushDataFields,
          hasNavigator: function() {
            return !!ws.navEl;
          },
          navToView: ws.fx.navToView,
          hasColorbar: function() {
            return !!ws.colorbarLayer;
          },
          setColorRange: ws.fx.setColorRange,
          colorHidden: function() {
            return Object.keys(ws.colorHiddenSet);
          },
          cbHandleCount: function() {
            return ws.colorbarLayer ? ws.colorbarLayer.querySelectorAll(".vellumwidget-cb-handle").length : 0;
          },
          navWindowFrac: function() {
            if (!ws.navWindow) return null;
            return { left: parseFloat(ws.navWindow.style.left) || 0, width: parseFloat(ws.navWindow.style.width) || 0 };
          },
          axisZoomActive: function() {
            return ws.axisZoomActive;
          },
          panTransform: function() {
            return ws.panGroup ? ws.panGroup.getAttribute("transform") : null;
          },
          panScaleVars: function() {
            if (!ws.panGroup) return null;
            return { ix: ws.panGroup.style.getPropertyValue("--vw-ix"), iy: ws.panGroup.style.getPropertyValue("--vw-iy") };
          },
          // Re-ticked axis labels (their text + device-px position), for asserting the
          // re-tick output without a real layout engine.
          retickLabels: function() {
            if (!ws.retickLayer) return [];
            return Array.prototype.map.call(ws.retickLayer.querySelectorAll("text"), function(t) {
              return { text: t.textContent, x: parseFloat(t.getAttribute("x") || "NaN"), y: parseFloat(t.getAttribute("y") || "NaN") };
            });
          },
          retickGridCount: function() {
            let n = 0;
            for (let i = 0; i < ws.azPanels.length; i++) {
              const g = ws.azPanels[i].grid;
              if (g) n += g.querySelectorAll("line").length;
            }
            return n;
          },
          // Every zoomable panel's name + current pan transform (multi-panel axis zoom).
          panTransforms: function() {
            return ws.azPanels.map(function(a) {
              return { name: a.p.name, transform: a.pan.getAttribute("transform") };
            });
          },
          // Per panel: which axes got a label anchor (outer facets) — interior ones none.
          axisAnchors: function() {
            return ws.azPanels.map(function(a) {
              return { name: a.p.name, x: a.xLab, y: a.yLab };
            });
          },
          toAnchor: ws.fx.toAnchor,
          clientToScene: ws.fx.clientToScene,
          zoomTo: ws.fx.zoomTo,
          getView: function() {
            return ws.vb ? { x: ws.vb.x, y: ws.vb.y, w: ws.vb.w, h: ws.vb.h } : null;
          },
          staticAxesHidden: function() {
            if (!ws.svgEl) return null;
            const nodes = ws.svgEl.querySelectorAll('[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
            if (!nodes.length) return null;
            return Array.prototype.every.call(nodes, function(n) {
              return n.style.display === "none";
            });
          },
          setView: function(nvb) {
            ws.vb = { x: nvb.x, y: nvb.y, w: nvb.w, h: nvb.h };
            ws.fx.applyViewBox();
          },
          toView: ws.fx.toView,
          // Graph neighbour highlighting: the projection a hover/click acts on, and
          // the reconstructed adjacency + the select_neighbours() config.
          linkedKeys: ws.fx.linkedKeys,
          graphAdjacency: function() {
            return {
              incidentEdges: ws.incidentEdges,
              neighbourNodes: ws.neighbourNodes,
              edgeEndpoints: ws.edgeEndpoints,
              neighbourExpand: ws.neighbourExpand
            };
          }
        }
      };
    }
  });
  registerProxyHandler();
  window.__vellumwidgetTest = {
    rectsIntersect,
    distToBbox,
    distToSegment2,
    distToGeom,
    brushKeys,
    nearestKey,
    zoomViewBox,
    parseViewBox,
    fmtViewBox,
    unionBbox,
    sanitizeTip,
    dispatchProxyCall,
    normalizeElements,
    isZoomedIn,
    userToCanvas,
    nearestSortedIdx,
    columnTolerance,
    pointInPolygon,
    lassoKeys,
    polyBounds,
    nativeToData,
    pxToDataX,
    selEncodings,
    axisForEncoding,
    intervalRangeOf,
    inInterval,
    intervalKeys,
    pxToDataY,
    normalizePanels,
    viewToPan,
    panToView,
    conjugatePan,
    niceTicks,
    fmtTick,
    dataToNative,
    logTicks,
    fmtRNum,
    strftimeUTC,
    timeTicks,
    detectTimeFormat,
    axisTicks,
    axisRetickable,
    sourceTable
  };
})();
