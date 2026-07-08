// gloss — client-side interactivity runtime for vellum SVG scenes.
//
// A vellum scene renders to SVG where each interactive element carries a
// `data-key` (its datum's identity); the R side ships a `scene_model()` element
// table (key -> tooltip / hover-group / device-px bbox). This runtime wires the
// interactions onto that, entirely in the browser (no Shiny, no round-trip):
//   Phase 3: hover -> tooltip, hover -> highlight, click -> select.
//   Phase 4: nearest-mark hover snap, rectangular brush -> select, pan/zoom via
//            the SVG viewBox, and an on-hover toolbar (reset, zoom-to-selection,
//            save SVG/PNG, fullscreen).
// Element bboxes live in the SVG's viewBox coordinate space (device px), so the
// same coordinates drive rendering, brushing, and nearest-mark queries.

declare const HTMLWidgets: {
  widget: (w: unknown) => void;
};

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ElemMeta extends Partial<Bbox> {
  key: string;
  tooltip?: string;
  hover_group?: string;
  hover_color?: string; // per-element hover outline (Option 2; overrides the theme)
  selected_color?: string; // per-element selected outline (Option 2)
  legend?: string[] | string; // series this mark belongs to ("<aes>:<value>")
  legend_for?: string; // a legend swatch: the series it highlights/selects
}

interface Options {
  tooltip: boolean;
  hover: boolean;
  select: boolean;
  brush: boolean;
  zoom: boolean;
  toolbar: boolean;
  nearest: boolean;
  a11y: boolean; // screen-reader + keyboard accessibility (focusable marks, live region, data table)
  alt?: string | null; // accessible label for the whole chart (falls back to the SVG's <title>/<desc>)
  selectMode: "single" | "multiple";
  style?: StyleOpts;
  group?: string | null; // own cross-widget linking group (gloss <-> gloss)
  crosstalk?: string | null; // crosstalk group (interop + filter_* controls)
  export?: { filename?: string; scale?: number }; // export filename base + PNG resolution scale
}

// Widget-wide interaction theme (Option 1). Each maps to a CSS variable on the
// widget root; unset falls back to the built-in default. Per-element grammar
// styling (Option 2, carried in ElemMeta) overrides these via the same variables.
interface StyleOpts {
  hoverColor?: string | null; // outline colour for the hovered element(s)
  selectedColor?: string | null; // outline colour for selected elements
  dimOpacity?: number | null; // opacity of non-hovered elements while hovering
  tipBg?: string | null; // tooltip background colour
  tipFg?: string | null; // tooltip text colour
  tipFontSize?: string | null; // tooltip font size (any CSS length)
  tipMaxWidth?: string | null; // tooltip max width (any CSS length)
}

interface Payload {
  svg: string;
  elements: ElemMeta[];
  options: Options;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- pure geometry helpers (exposed on window.__glossTest for headless tests) ----

function rectsIntersect(a: Bbox, b: Bbox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// Euclidean distance from a point to a bbox (0 when inside).
function distToBbox(x: number, y: number, b: Bbox): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.sqrt(dx * dx + dy * dy);
}

function hasBbox(e: ElemMeta): e is ElemMeta & Bbox {
  return typeof e.x0 === "number" && typeof e.y0 === "number";
}

// Keys of every element whose bbox intersects the brush rectangle.
function brushKeys(elems: ElemMeta[], brush: Bbox): string[] {
  const out: string[] = [];
  for (let i = 0; i < elems.length; i++) {
    const e = elems[i];
    if (hasBbox(e) && rectsIntersect(e, brush)) out.push(e.key);
  }
  return out;
}

// Key of the element nearest (x, y) within `maxDist`, else null.
function nearestKey(elems: ElemMeta[], x: number, y: number, maxDist: number): string | null {
  let best: string | null = null;
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

// New viewBox after zooming by `factor` about user-space point (cx, cy) — the
// point under the cursor stays put (§6: the JS transforms the SVG viewport).
function zoomViewBox(vb: ViewBox, factor: number, cx: number, cy: number): ViewBox {
  const w = vb.w / factor;
  const h = vb.h / factor;
  return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
}

function parseViewBox(s: string | null): ViewBox | null {
  if (!s) return null;
  const p = s.trim().split(/[ ,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
  return { x: p[0], y: p[1], w: p[2], h: p[3] };
}

function fmtViewBox(vb: ViewBox): string {
  return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
}

// Union bbox of the given keys' elements (for zoom-to-selection), or null.
function unionBbox(elems: ElemMeta[], keys: Record<string, boolean>): Bbox | null {
  let out: Bbox | null = null;
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

// ---- DOM helpers ----

const STYLE_ID = "gloss-style";

const GLOSS_CSS = `
.gloss-root { position: relative; display: inline-block; max-width: 100%; }
.gloss-root .gloss-svg-holder svg { max-width: 100%; height: auto; display: block; }
.gloss-gesture .gloss-svg-holder svg { touch-action: none; }
.gloss-root.gloss-mode-pan .gloss-svg-holder svg { cursor: grab; }
.gloss-root.gloss-panning .gloss-svg-holder svg { cursor: grabbing; }
.gloss-root [data-key] { cursor: pointer; }
[data-key].gloss-filtered { display: none; }
.gloss-hovering [data-key]:not(.gloss-legend) { opacity: var(--gloss-dim-opacity, 0.28); }
.gloss-hovering [data-key].gloss-hl { opacity: 1; }
/* Optional hover stroke, opt-in per element (.gloss-hc) or widget-wide
   (.gloss-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --gloss-hl-stroke (element var overrides the root var). */
.gloss-hc-all [data-key].gloss-hl, [data-key].gloss-hc.gloss-hl {
  stroke: var(--gloss-hl-stroke); stroke-width: var(--gloss-hl-width, 2px); paint-order: stroke fill;
}
[data-key].gloss-selected {
  stroke: var(--gloss-selected-stroke, #111827);
  stroke-width: var(--gloss-selected-width, 1.4px); paint-order: stroke fill;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].gloss-focus {
  stroke: var(--gloss-focus-stroke, #2563eb);
  stroke-width: var(--gloss-focus-width, 2.5px); paint-order: stroke fill;
}
[data-key]:focus { outline: none; }
[data-key]:focus-visible { outline: 2px solid var(--gloss-focus-stroke, #2563eb); outline-offset: 1px; }
/* Visually-hidden but exposed to assistive technology (live region + data table). */
.gloss-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; border: 0;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
.gloss-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: var(--gloss-tip-bg, rgba(17,24,39,0.94)); color: var(--gloss-tip-fg, #fff);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: var(--gloss-tip-fontsize, 12px); line-height: 1.45;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap;
  max-width: var(--gloss-tip-maxwidth, 320px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.gloss-tip.gloss-show { opacity: 1; }
.gloss-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
.gloss-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.gloss-root:hover .gloss-toolbar { opacity: 1; }
.gloss-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.gloss-toolbar button:hover { background: rgba(0,0,0,0.08); }
.gloss-toolbar button.gloss-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .gloss-tip { background: var(--gloss-tip-bg, rgba(243,244,246,0.96)); color: var(--gloss-tip-fg, #111827); }
  [data-key].gloss-selected { stroke: var(--gloss-selected-stroke, #f9fafb); }
  .gloss-toolbar { background: rgba(31,41,55,0.9); }
  .gloss-toolbar button { color: #f3f4f6; }
  .gloss-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = GLOSS_CSS;
  document.head.appendChild(s);
}

function cssEscape(value: string): string {
  const anyCss = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
  return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
}

// Render a tooltip string as *safe* HTML: escape everything, then re-enable a
// fixed allow-list of inert, attribute-free tags. Data values can't inject
// scripts, event handlers, or attributes (an opening tag carrying attributes
// stays escaped), so an author can build multi-line / bold tooltips (e.g. via
// quill's `tooltip =`) with `<br>` / `<b>` without any XSS surface.
const TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
function sanitizeTip(s: string): string {
  let out = String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  for (const t of TIP_TAGS) {
    out = out
      .replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">")
      .replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">")
      .replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
  }
  return out;
}

// Plain-text form of a (possibly HTML) tooltip, for an aria-label / table cell:
// drop tags, collapse whitespace. No DOM, so it is safe in any context.
function stripTags(s: string): string {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function keyOf(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  const hit = el.closest("[data-key]");
  return hit ? hit.getAttribute("data-key") : null;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DRAG_THRESHOLD = 3; // px before a mousedown becomes a drag (vs a click)

// --- own cross-widget linking bus (gloss <-> gloss, no dependency) ---------
// Page-global (the bundle loads once, so all widgets share this scope). Members
// of the same group receive each other's selection sets by data-key. crosstalk
// (below) is the optional bridge to the wider htmlwidgets ecosystem; this bus is
// what links vellum widgets when crosstalk is not in play.
interface BusMember {
  token: object;
  onSelect: (keys: string[]) => void;
}
const glossBus: Record<string, BusMember[]> = {};
function busJoin(group: string, m: BusMember): void {
  (glossBus[group] = glossBus[group] || []).push(m);
}
function busPublish(group: string, sender: object, keys: string[]): void {
  const members = glossBus[group] || [];
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender) members[i].onSelect(keys);
  }
}

// Minimal shape of the crosstalk globals we use (loaded as an htmlwidgets
// dependency when a SharedData is passed; absent otherwise).
interface CrosstalkHandle {
  on: (type: string, cb: (e: { value: string[] | null; sender?: unknown }) => void) => void;
  set: (keys: string[] | null, extra?: unknown) => void;
}
interface Crosstalk {
  SelectionHandle: new (group: string) => CrosstalkHandle;
  FilterHandle: new (group: string) => CrosstalkHandle;
}
function getCrosstalk(): Crosstalk | null {
  return (window as unknown as { crosstalk?: Crosstalk }).crosstalk || null;
}

HTMLWidgets.widget({
  name: "gloss",
  type: "output",

  factory: function (el: HTMLElement) {
    ensureStyle();
    el.classList.add("gloss-root");

    const tip = document.createElement("div");
    tip.className = "gloss-tip";
    const brushBox = document.createElement("div");
    brushBox.className = "gloss-brush";

    let holder: HTMLElement | null = null;
    let svgEl: SVGSVGElement | null = null;
    let toolbarEl: HTMLElement | null = null;
    let meta: Record<string, ElemMeta> = {};
    let groups: Record<string, string[]> = {};
    let legendIndex: Record<string, string[]> = {}; // series key -> member element keys
    let elements: ElemMeta[] = [];
    let selected: Record<string, boolean> = {};
    let nodesByKey: Record<string, Element[]> = {}; // key -> SVG nodes (built once per render)
    let hoverRAF = 0; // rAF handle throttling the O(n) nearest-mark scan
    let opts: Options = {
      tooltip: true, hover: true, select: true, brush: true, zoom: true,
      toolbar: true, nearest: true, a11y: true, selectMode: "multiple"
    };
    // --- accessibility state ---
    let liveRegion: HTMLElement | null = null; // aria-live announcer
    let tableEl: HTMLElement | null = null; // hidden data-table fallback
    let focusables: { key: string; node: Element }[] = []; // roving-tabindex marks, in draw order
    let focusIdx = -1; // index into focusables of the currently-focused mark, or -1
    let vb0: ViewBox | null = null; // original viewBox (for reset)
    let vb: ViewBox | null = null; // current viewBox
    let mode: "brush" | "pan" = "brush";
    let lastBrush: Bbox | null = null; // last brushed region (user coords)
    // Linking state.
    const selfToken = {}; // identity on the own bus
    let group: string | null = null; // own-bus group
    let joined = false; // joined the own bus already (guard re-render)
    let ctSel: CrosstalkHandle | null = null; // crosstalk selection handle
    let ctFilt: CrosstalkHandle | null = null; // crosstalk filter handle

    // --- coordinates: client px -> SVG user space (viewBox coords) ---
    function toUser(clientX: number, clientY: number): { x: number; y: number } {
      if (svgEl && typeof svgEl.getScreenCTM === "function") {
        const ctm = svgEl.getScreenCTM();
        if (ctm && typeof svgEl.createSVGPoint === "function") {
          const p = svgEl.createSVGPoint();
          p.x = clientX;
          p.y = clientY;
          const u = p.matrixTransform(ctm.inverse());
          return { x: u.x, y: u.y };
        }
      }
      // fallback: map via the container rect + current viewBox
      const r = (svgEl || el).getBoundingClientRect();
      const view = vb || { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
      const fx = r.width ? (clientX - r.left) / r.width : 0;
      const fy = r.height ? (clientY - r.top) / r.height : 0;
      return { x: view.x + fx * view.w, y: view.y + fy * view.h };
    }

    // --- highlight / tooltip (Phase 3) ---
    // Nodes are cached per render (built in renderValue), so a hover/select that
    // touches many keys is O(keys) map lookups instead of a `querySelectorAll`
    // per key — the main per-interaction cost at large N. The DOM is static after
    // render, so the cache stays valid.
    function elementsForKey(k: string): Element[] {
      const cached = nodesByKey[k];
      if (cached) return cached;
      if (!holder) return [];
      return Array.prototype.slice.call(holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
    }
    function addClassForKeys(keys: string[], cls: string): void {
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
      }
    }
    function clearClass(cls: string): void {
      if (!holder) return;
      const nodes = holder.querySelectorAll("." + cls);
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
    }
    // The keys a hover or click on `k` acts on: a legend swatch drives its whole
    // series (`legend_for` -> the marks whose `legend` contains it); a mark
    // projects by its `hover_group`; otherwise just itself.
    function linkedKeys(k: string): string[] {
      const m = meta[k];
      if (m && m.legend_for != null) return (legendIndex[m.legend_for] || []).concat([k]);
      const g = m && m.hover_group;
      return g && groups[g] ? groups[g] : [k];
    }
    function setHover(k: string): void {
      if (!opts.hover) return;
      el.classList.add("gloss-hovering");
      clearClass("gloss-hl");
      addClassForKeys(linkedKeys(k), "gloss-hl");
    }
    function showTip(clientX: number, clientY: number, k: string): void {
      const m = meta[k];
      tip.innerHTML = sanitizeTip((m && m.tooltip) || k);
      const box = el.getBoundingClientRect();
      tip.style.transform =
        "translate(" + Math.round(clientX - box.left) + "px," + Math.round(clientY - box.top) +
        "px) translate(-50%, calc(-100% - 12px))";
      tip.classList.add("gloss-show");
    }
    function hideTip(): void {
      tip.classList.remove("gloss-show");
    }
    function clearHover(): void {
      el.classList.remove("gloss-hovering");
      clearClass("gloss-hl");
      hideTip();
    }

    // --- selection (+ linking) ---
    function refreshSelected(): void {
      clearClass("gloss-selected");
      for (const k in selected) if (selected[k]) addClassForKeys([k], "gloss-selected");
    }
    function selectedKeys(): string[] {
      return Object.keys(selected).filter((k) => selected[k]);
    }
    // Publish the current selection to linked views (own bus + crosstalk). Called
    // only from local mutations; the incoming appliers below never broadcast, so
    // there is no feedback loop.
    function broadcast(): void {
      const keys = selectedKeys();
      if (group) busPublish(group, selfToken, keys);
      if (ctSel) ctSel.set(keys);
    }
    function toggleSelect(k: string): void {
      const ks = linkedKeys(k);
      if (opts.selectMode === "single") {
        const allOn = ks.every((x) => selected[x]) && selectedKeys().length === ks.length;
        selected = {};
        if (!allOn) ks.forEach((x) => (selected[x] = true));
      } else {
        const turnOn = !ks.every((x) => selected[x]);
        ks.forEach((x) => (selected[x] = turnOn));
      }
      refreshSelected();
      broadcast();
    }
    function setSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
      broadcast();
    }
    function clearSelection(): void {
      selected = {};
      refreshSelected();
      broadcast();
    }
    // A selection arriving from a linked view — apply WITHOUT re-broadcasting.
    function applyLinkedSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
    }
    // Cross-filter (display tier): hide keyed elements whose key is not in the
    // shown set. `null` clears the filter (show everything).
    function applyFilter(showKeys: string[] | null): void {
      clearClass("gloss-filtered");
      if (showKeys == null) return;
      const show: Record<string, boolean> = {};
      for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
      for (let i = 0; i < elements.length; i++) {
        const key = elements[i].key;
        if (!show[key]) addClassForKeys([key], "gloss-filtered");
      }
    }
    // Join the linking channels for this widget's groups (once).
    function setupLinking(): void {
      if (joined) return;
      joined = true;
      if (group) busJoin(group, { token: selfToken, onSelect: applyLinkedSelection });
      const ct = getCrosstalk();
      if (opts.crosstalk && ct) {
        ctSel = new ct.SelectionHandle(opts.crosstalk);
        ctFilt = new ct.FilterHandle(opts.crosstalk);
        ctSel.on("change", function (e) {
          if (e.sender !== ctSel) applyLinkedSelection(e.value || []);
        });
        ctFilt.on("change", function (e) {
          applyFilter(e.value);
        });
      }
    }

    // --- viewBox pan/zoom ---
    function applyViewBox(): void {
      if (svgEl && vb) svgEl.setAttribute("viewBox", fmtViewBox(vb));
    }
    function resetZoom(): void {
      if (vb0) {
        vb = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h };
        applyViewBox();
      }
    }
    function zoomTo(rect: Bbox, pad = 0.05): void {
      if (!vb) return;
      const w = Math.max(rect.x1 - rect.x0, 1e-6);
      const h = Math.max(rect.y1 - rect.y0, 1e-6);
      const px = w * pad;
      const py = h * pad;
      vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
      applyViewBox();
    }

    // --- brush overlay (screen coords for display; user coords for hit-test) ---
    function positionBrush(x: number, y: number, w: number, h: number): void {
      brushBox.style.left = x + "px";
      brushBox.style.top = y + "px";
      brushBox.style.width = w + "px";
      brushBox.style.height = h + "px";
      brushBox.style.display = "block";
    }
    function hideBrush(): void {
      brushBox.style.display = "none";
    }

    // --- pointer interaction (hover + drag: brush or pan; touch pinch-zoom) ---
    // Pointer events unify mouse, touch, and pen, so one code path drives desktop
    // and mobile. Active pointers are tracked so two down at once = pinch-zoom.
    let down: { cx: number; cy: number; ux: number; uy: number } | null = null;
    let dragging: "" | "brush" | "pan" = "";
    let movedDuringDrag = false;
    const pointers = new Map<number, { cx: number; cy: number }>();
    let pinchDist = 0; // > 0 while a two-pointer pinch is in progress

    // Hover is SVG-local (fires only over this widget's svg). While a press is
    // in progress the drag handlers (below) own movement, so hover backs off.
    function hoverAt(k: string | null, clientX: number, clientY: number): void {
      if (k == null) {
        clearHover();
        return;
      }
      setHover(k);
      if (opts.tooltip) showTip(clientX, clientY, k);
    }
    function onHoverMove(ev: MouseEvent): void {
      if (down || pinchDist > 0) return;
      // Directly over a mark: resolve synchronously (cheap, no scan).
      const k = keyOf(ev.target);
      if (k != null) {
        if (hoverRAF) {
          cancelAnimationFrame(hoverRAF);
          hoverRAF = 0;
        }
        hoverAt(k, ev.clientX, ev.clientY);
        return;
      }
      if (!opts.nearest || !elements.length) {
        clearHover();
        return;
      }
      // Otherwise the nearest-mark scan is O(n); throttle it to one per frame so
      // fast pointer moves over a large plot don't run it dozens of times.
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (hoverRAF) return;
      hoverRAF = requestAnimationFrame(function () {
        hoverRAF = 0;
        const u = toUser(cx, cy);
        const rad = vb ? vb.w * 0.02 : 8; // ~2% of the view width
        hoverAt(nearestKey(elements, u.x, u.y, rad), cx, cy);
      });
    }

    // Drag move/up are bound to `window` only for the lifetime of a press (added
    // in onDown, removed in onDragUp), so a drag that leaves the svg still
    // resolves without leaking global listeners across widgets.
    function onDragMove(ev: PointerEvent): void {
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      }
      // Two active pointers -> pinch-zoom about their midpoint.
      if (pinchDist > 0 && pointers.size >= 2 && vb) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        if (d > 0) {
          const u = toUser((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
          vb = zoomViewBox(vb, d / pinchDist, u.x, u.y);
          applyViewBox();
          pinchDist = d;
        }
        return;
      }
      if (!down) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
        dragging = mode === "pan" && opts.zoom ? "pan" : opts.brush ? "brush" : "";
        if (dragging === "pan") el.classList.add("gloss-panning");
        if (dragging === "") return;
        movedDuringDrag = true;
      }
      if (dragging === "brush") {
        const box = el.getBoundingClientRect();
        positionBrush(
          Math.min(down.cx, ev.clientX) - box.left,
          Math.min(down.cy, ev.clientY) - box.top,
          Math.abs(ev.clientX - down.cx),
          Math.abs(ev.clientY - down.cy)
        );
      } else if (dragging === "pan" && vb) {
        const u = toUser(ev.clientX, ev.clientY);
        vb.x -= u.x - down.ux;
        vb.y -= u.y - down.uy;
        applyViewBox();
        const u2 = toUser(ev.clientX, ev.clientY); // re-anchor: track cursor 1:1
        down.ux = u2.x;
        down.uy = u2.y;
      }
    }

    function onDown(ev: PointerEvent): void {
      // Ignore non-primary mouse buttons; touch/pen have button 0/-1.
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      // Drag move/up bind to `window` for the lifetime of a press (addEventListener
      // dedups identical listeners, so repeated downs don't stack them).
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      if (pointers.size >= 2 && opts.zoom) {
        // A second finger: start a pinch, abandoning any nascent single drag.
        const pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        down = null;
        dragging = "";
        hideBrush();
        el.classList.remove("gloss-panning");
        return;
      }
      const u = toUser(ev.clientX, ev.clientY);
      down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      dragging = "";
      movedDuringDrag = false;
    }

    function onDragUp(ev: PointerEvent): void {
      pointers.delete(ev.pointerId);
      const wasPinch = pinchDist > 0;
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        window.removeEventListener("pointermove", onDragMove);
        window.removeEventListener("pointerup", onDragUp);
        window.removeEventListener("pointercancel", onDragUp);
      }
      if (wasPinch) {
        down = null;
        dragging = "";
        el.classList.remove("gloss-panning");
        hideBrush();
        return;
      }
      if (dragging === "brush" && down) {
        const p1 = toUser(down.cx, down.cy);
        const p2 = toUser(ev.clientX, ev.clientY);
        const rect: Bbox = {
          x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y),
          x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y)
        };
        lastBrush = rect;
        if (opts.select) setSelection(brushKeys(elements, rect));
        hideBrush();
      }
      el.classList.remove("gloss-panning");
      down = null;
      dragging = "";
    }

    function onClick(ev: MouseEvent): void {
      if (movedDuringDrag) {
        movedDuringDrag = false;
        return;
      } // a drag, not a click
      const k = keyOf(ev.target);
      if (k != null) {
        if (opts.select) toggleSelect(k);
      } else {
        clearSelection();
        lastBrush = null;
      }
    }

    function onWheel(ev: WheelEvent): void {
      if (!opts.zoom || !vb) return;
      ev.preventDefault();
      const u = toUser(ev.clientX, ev.clientY);
      const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
      vb = zoomViewBox(vb, factor, u.x, u.y);
      applyViewBox();
    }

    function onKey(ev: KeyboardEvent): void {
      if (ev.key === "Escape") {
        clearSelection();
        clearHover();
        clearClass("gloss-focus");
        hideBrush();
        lastBrush = null;
        // Leave mark-traversal mode, returning focus to the widget as a whole.
        if (markFocused() && typeof el.focus === "function") el.focus();
        focusIdx = -1;
        return;
      }
      // Accessibility: while a mark has keyboard focus, arrows traverse marks
      // (roving tabindex) and Enter/Space toggles its selection — this takes
      // precedence over pan/zoom, which owns the arrows when no mark is focused.
      if (opts.a11y && markFocused()) {
        const k = focusables[focusIdx].key;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
          focusRoving(focusIdx + 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
          focusRoving(focusIdx - 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          if (opts.select) toggleSelect(k);
          announce(a11yLabel(k) + (selected[k] ? ", selected" : ", not selected"));
          ev.preventDefault();
          return;
        }
      }
      // Keyboard pan/zoom (the root is focusable): arrows pan, +/- zoom, 0 resets.
      if (!opts.zoom || !vb) return;
      if (ev.key === "0") {
        resetZoom();
        ev.preventDefault();
        return;
      }
      const dx = vb.w * 0.12;
      const dy = vb.h * 0.12;
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      let handled = true;
      switch (ev.key) {
        case "ArrowLeft": vb.x -= dx; break;
        case "ArrowRight": vb.x += dx; break;
        case "ArrowUp": vb.y -= dy; break;
        case "ArrowDown": vb.y += dy; break;
        case "+": case "=": vb = zoomViewBox(vb, 1.2, cx, cy); break;
        case "-": case "_": vb = zoomViewBox(vb, 1 / 1.2, cx, cy); break;
        default: handled = false;
      }
      if (handled) {
        applyViewBox();
        ev.preventDefault();
      }
    }

    // --- toolbar ---
    function setMode(m: "brush" | "pan"): void {
      mode = m;
      el.classList.toggle("gloss-mode-pan", m === "pan");
      if (toolbarEl) {
        const b = toolbarEl.querySelector('[data-act="mode"]');
        if (b) {
          b.textContent = m === "pan" ? "✋" : "▭";
          (b as HTMLElement).title = m === "pan" ? "Pan mode (click to brush-select)" : "Brush-select mode (click to pan)";
          b.classList.toggle("gloss-active", m === "pan");
        }
      }
    }
    // Export filename base (no extension) and PNG resolution scale, both
    // overridable via `as_widget(export = ...)`. The serialized SVG always
    // reflects the *current* viewBox, so a zoomed/panned view exports as shown.
    function exportName(): string {
      const n = opts.export && opts.export.filename;
      return n && String(n).length ? String(n) : "plot";
    }
    function exportScale(): number {
      const s = opts.export && opts.export.scale;
      return s && s > 0 ? s : 1;
    }
    function saveSvg(): void {
      if (!svgEl) return;
      const s = new XMLSerializer().serializeToString(svgEl);
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
    }
    // Rasterise the current SVG to a canvas; `then(canvas)` on success, `fail()`
    // if the canvas is tainted/unsupported. Shared by savePng + copyPng.
    function toCanvas(then: (c: HTMLCanvasElement) => void, fail: () => void): void {
      if (!svgEl) return fail();
      const s = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function () {
        const k = exportScale();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((vb0 ? vb0.w : img.width) * k);
        canvas.height = Math.round((vb0 ? vb0.h : img.height) * k);
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(url);
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          then(canvas);
        } else {
          fail();
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fail();
      };
      img.src = url;
    }
    function savePng(): void {
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (b) download(b, exportName() + ".png");
          });
        },
        saveSvg // canvas tainted / unsupported -> fall back to SVG
      );
    }
    // Copy the current view to the clipboard as a PNG (secure-context only).
    function canCopy(): boolean {
      const nav = navigator as unknown as { clipboard?: { write?: unknown } };
      return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
    }
    function copyPng(): void {
      if (!canCopy()) return;
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (!b) return;
            const nav = navigator as unknown as {
              clipboard: { write: (items: unknown[]) => Promise<void> };
            };
            nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function () {});
          });
        },
        function () {}
      );
    }
    function toggleFullscreen(): void {
      const anyEl = el as unknown as { requestFullscreen?: () => void };
      const anyDoc = document as unknown as { fullscreenElement?: Element; exitFullscreen?: () => void };
      if (anyDoc.fullscreenElement) {
        if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
      } else if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      }
    }
    function zoomToSelection(): void {
      const rect = lastBrush || unionBbox(elements, selected);
      if (rect) zoomTo(rect);
    }

    function buildToolbar(): void {
      if (toolbarEl) {
        toolbarEl.remove();
        toolbarEl = null;
      }
      if (!opts.toolbar) return;
      const bar = document.createElement("div");
      bar.className = "gloss-toolbar";
      const btn = (act: string, label: string, title: string, fn: () => void) => {
        const b = document.createElement("button");
        b.setAttribute("data-act", act);
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          fn();
        });
        bar.appendChild(b);
        return b;
      };
      if (opts.brush && opts.zoom) btn("mode", "▭", "Brush-select mode (click to pan)", () => setMode(mode === "brush" ? "pan" : "brush"));
      if (opts.zoom) {
        btn("zoomsel", "⌖", "Zoom to selection", zoomToSelection);
        btn("reset", "⟲", "Reset zoom", resetZoom);
      }
      btn("svg", "SVG", "Download SVG", saveSvg);
      btn("png", "PNG", "Download PNG", savePng);
      if (canCopy()) btn("copy", "⧉", "Copy PNG to clipboard", copyPng);
      btn("full", "⛶", "Fullscreen", toggleFullscreen);
      el.appendChild(bar);
      toolbarEl = bar;
    }

    // Apply the interaction styling: the widget-wide theme (Option 1) as CSS
    // variables on the root, and per-element grammar colours (Option 2) as CSS
    // variables on the elements themselves — which override the root by
    // custom-property inheritance. A mark only gains a hover stroke if some hover
    // colour applies to it (root `gloss-hc-all` or its own `gloss-hc`), so
    // hover-uncoloured shapes keep their own borders untouched.
    function applyStyling(): void {
      const s = opts.style || {};
      const setRoot = (name: string, v: string | number | null | undefined) => {
        if (v != null && v !== "") el.style.setProperty(name, String(v));
        else el.style.removeProperty(name);
      };
      setRoot("--gloss-dim-opacity", s.dimOpacity);
      setRoot("--gloss-selected-stroke", s.selectedColor);
      setRoot("--gloss-tip-bg", s.tipBg);
      setRoot("--gloss-tip-fg", s.tipFg);
      setRoot("--gloss-tip-fontsize", s.tipFontSize);
      setRoot("--gloss-tip-maxwidth", s.tipMaxWidth);
      if (s.hoverColor != null && s.hoverColor !== "") {
        el.style.setProperty("--gloss-hl-stroke", s.hoverColor);
        el.classList.add("gloss-hc-all");
      } else {
        el.style.removeProperty("--gloss-hl-stroke");
        el.classList.remove("gloss-hc-all");
      }
      // Per-element overrides + legend-swatch tagging.
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
        const nodes = elementsForKey(e.key);
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j] as unknown as HTMLElement;
          if (e.hover_color != null) {
            n.style.setProperty("--gloss-hl-stroke", e.hover_color);
            n.classList.add("gloss-hc");
          }
          if (e.selected_color != null) {
            n.style.setProperty("--gloss-selected-stroke", e.selected_color);
          }
          // A legend swatch stays fully visible during hover (not dimmed with the
          // rest), so the legend remains readable while a series is emphasised.
          if (e.legend_for != null) n.classList.add("gloss-legend");
        }
      }
    }

    // --- accessibility (screen reader + keyboard traversal) ---
    // A stable, plain-text label for a mark: its tooltip (tags stripped) or key.
    function a11yLabel(k: string): string {
      const m = meta[k];
      return m && m.tooltip ? stripTags(m.tooltip) : k;
    }
    // The label plus current selection state, for a spoken announcement.
    function focusLabel(k: string): string {
      return a11yLabel(k) + (selected[k] ? ", selected" : "");
    }
    // Speak `msg` through the polite live region (no-op if a11y is off).
    function announce(msg: string): void {
      if (liveRegion) liveRegion.textContent = msg;
    }
    // Reflect that mark `focusables[i]` is the focused one: roving index, focus
    // ring + highlight, and a spoken announcement. Pure state/DOM update — does
    // not itself move DOM focus (callers decide), so it is reliable regardless of
    // how focus arrived (Tab, arrow keys, or assistive tech).
    function showMarkFocus(i: number): void {
      focusIdx = i;
      const k = focusables[i].key;
      clearClass("gloss-focus");
      addClassForKeys([k], "gloss-focus");
      setHover(k);
      announce(focusLabel(k));
    }
    // A mark received DOM focus (Tab or assistive tech): adopt it as the cursor.
    function onMarkFocus(ev: FocusEvent): void {
      const k = keyOf(ev.target);
      if (k == null) return;
      const i = focusables.findIndex((f) => f.key === k);
      if (i >= 0) showMarkFocus(i);
    }
    // Focus left a mark: if it did not move to another mark, exit traversal mode.
    function onMarkBlur(ev: FocusEvent): void {
      const to = keyOf((ev as unknown as { relatedTarget: EventTarget | null }).relatedTarget);
      if (to == null) {
        focusIdx = -1;
        clearClass("gloss-focus");
      }
    }
    // Move the roving tabindex to focusable `i` (clamped), update state, and move
    // DOM focus to it.
    function focusRoving(i: number): void {
      if (!focusables.length) return;
      if (i < 0) i = 0;
      if (i >= focusables.length) i = focusables.length - 1;
      if (focusIdx >= 0 && focusables[focusIdx]) {
        focusables[focusIdx].node.setAttribute("tabindex", "-1");
      }
      const f = focusables[i];
      f.node.setAttribute("tabindex", "0");
      showMarkFocus(i);
      const n = f.node as unknown as HTMLElement;
      if (typeof n.focus === "function") n.focus();
    }
    // In mark-traversal mode? (a mark is the current keyboard cursor). Driven by
    // focusIdx rather than document.activeElement so it is robust across browsers
    // and assistive tech.
    function markFocused(): boolean {
      return opts.a11y && focusIdx >= 0 && !!focusables[focusIdx];
    }
    // A visually-hidden data table listing every mark (key + description), so a
    // screen-reader user gets the underlying data even without traversing marks.
    function buildDataTable(): void {
      if (tableEl) {
        tableEl.remove();
        tableEl = null;
      }
      if (!opts.a11y || !elements.length) return;
      const tbl = document.createElement("table");
      tbl.className = "gloss-sr-only gloss-data-table";
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
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
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
      el.appendChild(tbl);
      tableEl = tbl;
    }
    // Make the rendered scene an accessible, keyboard-navigable chart: label the
    // svg, expose an aria-live announcer + a data-table fallback, and make each
    // mark a focusable graphics-symbol carrying a roving tabindex. All gated on
    // opts.a11y so the default output is unchanged when it is off.
    function setupA11y(): void {
      focusables = [];
      focusIdx = -1;
      if (!opts.a11y || !svgEl) {
        buildDataTable(); // (a no-op when a11y is off — also clears a stale table)
        return;
      }
      // The widget is an interactive chart, not a static image (role="img"
      // would hide the focusable marks from assistive tech).
      svgEl.setAttribute("role", "graphics-document");
      svgEl.setAttribute("aria-roledescription", "interactive chart");
      if (opts.alt) {
        // Drop the name vellum referenced via aria-labelledby (its <title>/<desc>);
        // aria-labelledby outranks aria-label, so it would otherwise defeat `alt`.
        svgEl.removeAttribute("aria-labelledby");
        svgEl.setAttribute("aria-label", opts.alt);
      } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
        // No name from vellum's <title>/<desc> and none given: label generically.
        svgEl.setAttribute("aria-label", "Interactive chart");
      }

      if (!liveRegion) {
        liveRegion = document.createElement("div");
        liveRegion.className = "gloss-sr-only";
        liveRegion.setAttribute("role", "status");
        liveRegion.setAttribute("aria-live", "polite");
        el.appendChild(liveRegion);
      } else {
        liveRegion.textContent = "";
      }

      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
        if (seen[k]) continue;
        const nodes = nodesByKey[k];
        if (!nodes || !nodes.length) continue;
        seen[k] = true;
        const node = nodes[0];
        node.setAttribute("role", "graphics-symbol");
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-label", a11yLabel(k));
        node.addEventListener("focus", onMarkFocus as EventListener);
        node.addEventListener("blur", onMarkBlur as EventListener);
        focusables.push({ key: k, node });
      }
      // The first mark carries tabindex=0 so a Tab press enters the mark set.
      if (focusables.length) focusables[0].node.setAttribute("tabindex", "0");

      buildDataTable();
    }

    function wire(svg: SVGSVGElement): void {
      // Pointer events cover mouse + touch + pen in one path.
      svg.addEventListener("pointermove", onHoverMove);
      svg.addEventListener("pointerleave", clearHover);
      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("click", onClick);
      if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
      // Touch drag/pinch shouldn't scroll the page over an interactive plot.
      if (opts.zoom || opts.brush) el.classList.add("gloss-gesture");
      el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", onKey);
    }

    return {
      renderValue: function (x: Payload) {
        opts = Object.assign(
          { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple" },
          x.options || {}
        );
        elements = x.elements || [];
        meta = {};
        groups = {};
        legendIndex = {};
        selected = {};
        lastBrush = null;
        mode = "brush";
        group = opts.group || null;
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          meta[e.key] = e;
          if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
          if (e.legend != null) {
            const series = Array.isArray(e.legend) ? e.legend : [e.legend];
            for (let s = 0; s < series.length; s++) {
              (legendIndex[series[s]] = legendIndex[series[s]] || []).push(e.key);
            }
          }
        }

        if (!holder) {
          holder = document.createElement("div");
          holder.className = "gloss-svg-holder";
          el.appendChild(holder);
          el.appendChild(brushBox);
          el.appendChild(tip);
        }
        holder.innerHTML = x.svg;
        svgEl = holder.querySelector("svg");
        // Cache key -> nodes once (the SVG is static after injection), so hover/
        // select highlighting avoids a `querySelectorAll` per key.
        nodesByKey = {};
        if (holder) {
          const keyed = holder.querySelectorAll("[data-key]");
          for (let i = 0; i < keyed.length; i++) {
            const k = keyed[i].getAttribute("data-key");
            if (k != null) (nodesByKey[k] = nodesByKey[k] || []).push(keyed[i]);
          }
        }
        if (svgEl) {
          vb0 = parseViewBox(svgEl.getAttribute("viewBox"));
          if (!vb0) {
            const w = parseFloat(svgEl.getAttribute("width") || "0");
            const h = parseFloat(svgEl.getAttribute("height") || "0");
            if (w && h) vb0 = { x: 0, y: 0, w: w, h: h };
          }
          vb = vb0 ? { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h } : null;
          wire(svgEl);
          buildToolbar();
          setMode("brush");
          applyStyling();
          setupA11y();
          setupLinking();
        }
      },

      resize: function () {
        // The SVG scales via its viewBox; nothing to recompute.
      }
    };
  }
});

// Test seam: expose the pure helpers for the headless behaviour suite.
(window as unknown as { __glossTest?: unknown }).__glossTest = {
  rectsIntersect,
  distToBbox,
  brushKeys,
  nearestKey,
  zoomViewBox,
  parseViewBox,
  fmtViewBox,
  unionBbox,
  sanitizeTip
};
