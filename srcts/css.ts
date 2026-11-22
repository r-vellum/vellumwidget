// The runtime's stylesheet (injected once per page) and a CSS.escape fallback.

// ---- DOM helpers ----

export const STYLE_ID = "vellumwidget-style";

export const VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
/* The stage shrink-wraps the base svg in BOTH dimensions (inline-block sizes to
   content), so its box equals the svg's rendered box. The absolute overlays below
   fill THIS box, not the root's — the root can be taller AND wider than the svg
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
/* Blend runs (VW-32): a run with a blend mode is a canvas of its own stacked
   over the marks canvas (inline mix-blend-mode), the marks after it on the
   next one up. While any is shown the stage isolates the blending, so it
   mixes with the widget's own furniture and marks, not the page. */
.vellumwidget-canvas-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
.vellumwidget-root .vellumwidget-stage.vellumwidget-blend-iso { isolation: isolate; }
/* Paint-order split (VW-21): the furniture drawn after the marks (a reference
   line or annotation added after the points), over the marks canvas and under
   the re-ticked labels and rings. Never a pointer target, so picking still
   reaches the marks beneath. */
.vellumwidget-above-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; overflow: hidden;
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
.vellumwidget-cb-dim { fill: var(--vellumwidget-wash, rgba(255,255,255,0.66)); pointer-events: none; }
.vellumwidget-cb-handle {
  fill: #ffffff; stroke: #2563eb; stroke-width: 1.5px; pointer-events: auto;
}
.vellumwidget-root.vellumwidget-cb-v .vellumwidget-cb-handle { cursor: ns-resize; }
.vellumwidget-root.vellumwidget-cb-h .vellumwidget-cb-handle { cursor: ew-resize; }
[data-key].vellumwidget-colorfiltered { opacity: var(--vellumwidget-colorfilter-opacity, 0.12); }
/* Crosshair guide rule(s) for unified hover — above the base image / canvas,
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
  stroke: var(--vellumwidget-crosshair-stroke, var(--vellumwidget-ink-soft, rgba(75,85,99,0.85)));
  stroke-width: 1px; stroke-dasharray: 4 3;
}
/* Raster-mode feedback rings (hover / selection), drawn on the overlay since the
   marks are a base image with no per-element nodes. Colours reuse the same CSS
   variables as the SVG-mode highlight/selection so theming carries over. */
.vellumwidget-fb-hov { fill: none; stroke: var(--vellumwidget-hl-stroke, #2563eb); stroke-width: 2px; }
.vellumwidget-fb-sel { fill: none; stroke: var(--vellumwidget-selected-stroke, var(--vellumwidget-ink, #111827)); stroke-width: 1.6px; }
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var).
   The rings use paint-order: normal (stroke over fill), so the whole ring shows
   whether a keyed mark is one element carrying both fill and stroke (newer
   vellum) or a fill followed by a fill="none" stroke twin (older vellum).
   Painting the stroke under the fill, a single element's fill would hide the inner
   half of the ring. */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: normal;
}
/* Selection / crosshair ink (--vellumwidget-ink*) is set on the root from the
   plot's own background, not the OS colour scheme (VW-20). */
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, var(--vellumwidget-ink, #111827));
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: normal;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: normal;
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
  .vellumwidget-toolbar { background: rgba(31,41,55,0.9); }
  .vellumwidget-toolbar button { color: #f3f4f6; }
  .vellumwidget-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;

export function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = VELLUMWIDGET_CSS;
  document.head.appendChild(s);
}

export function cssEscape(value: string): string {
  const anyCss = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
  return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
}

// ---- export: state classes as inline styles (VW-28) ----

// The classes the stylesheet above uses to show widget state on keyed nodes
// (condition dimming, colour-filter fade, legend hide/mute, cross-filter hide,
// selection outline). Transient pointer state (hover, keyboard focus) is left
// out: an export shows what is selected and filtered, not where the pointer is.
const STATE_SEL = [
  "vellumwidget-cond-dim", "vellumwidget-colorfiltered", "vellumwidget-legend-muted",
  "vellumwidget-legend-off", "vellumwidget-selected", "vellumwidget-filtered", "vellumwidget-legend-hidden"
].map((c) => "[data-key]." + c).join(", ");

function cssVar(cs: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const v = cs ? cs.getPropertyValue(name).trim() : "";
  return v || fallback;
}

// An exported SVG (and the PNG rasterised from it) is a standalone document:
// the page stylesheet does not travel with it, so a node styled only through a
// state class would export unstyled. Copy those styles inline onto the clone.
// `live` and `clone` must have the same structure (call this right after
// cloneNode). The values follow the stylesheet's own cascade (legend-off over
// colour filter over condition dim over legend mute) and resolve its custom
// properties on the live node, so a themed dim opacity or selection ink
// exports as shown. A node whose opacity is already inline keeps it (inline
// beats the stylesheet on screen too).
export function inlineStateStyles(live: Element, clone: Element): void {
  const a = live.querySelectorAll(STATE_SEL);
  const b = clone.querySelectorAll(STATE_SEL);
  if (a.length !== b.length) return;
  for (let i = 0; i < a.length; i++) {
    const n = a[i] as SVGElement, c = b[i] as SVGElement, cl = n.classList;
    if (cl.contains("vellumwidget-filtered") || cl.contains("vellumwidget-legend-hidden")) {
      c.style.display = "none";
      continue;
    }
    let cs: CSSStyleDeclaration | null = null;
    try { cs = window.getComputedStyle(n); } catch (e) { cs = null; }
    if (!n.style.opacity) {
      let op = "";
      if (cl.contains("vellumwidget-legend-off") && cl.contains("vellumwidget-legend")) op = "0.4";
      else if (cl.contains("vellumwidget-colorfiltered")) op = cssVar(cs, "--vellumwidget-colorfilter-opacity", "0.12");
      // an alpha condition sets its own opacity on the node (VW-52)
      else if (cl.contains("vellumwidget-cond-dim")) op = n.style.getPropertyValue("--vellumwidget-dim-opacity").trim() || cssVar(cs, "--vellumwidget-dim-opacity", "0.28");
      else if (cl.contains("vellumwidget-legend-muted")) op = "0.12";
      if (op) c.style.opacity = op;
    }
    if (cl.contains("vellumwidget-selected")) {
      c.style.stroke = cssVar(cs, "--vellumwidget-selected-stroke", cssVar(cs, "--vellumwidget-ink", "#111827"));
      c.style.strokeWidth = cssVar(cs, "--vellumwidget-selected-width", "1.4px");
      c.style.setProperty("paint-order", "normal");
    }
  }
}
