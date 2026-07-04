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
}

interface Options {
  tooltip: boolean;
  hover: boolean;
  select: boolean;
  brush: boolean;
  zoom: boolean;
  toolbar: boolean;
  nearest: boolean;
  selectMode: "single" | "multiple";
  style?: StyleOpts;
}

// Widget-wide interaction theme (Option 1). Each maps to a CSS variable on the
// widget root; unset falls back to the built-in default. Per-element grammar
// styling (Option 2, carried in ElemMeta) overrides these via the same variables.
interface StyleOpts {
  hoverColor?: string | null; // outline colour for the hovered element(s)
  selectedColor?: string | null; // outline colour for selected elements
  dimOpacity?: number | null; // opacity of non-hovered elements while hovering
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
.gloss-root.gloss-mode-pan .gloss-svg-holder svg { cursor: grab; }
.gloss-root.gloss-panning .gloss-svg-holder svg { cursor: grabbing; }
.gloss-root [data-key] { cursor: pointer; }
.gloss-hovering [data-key] { opacity: var(--gloss-dim-opacity, 0.28); }
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
.gloss-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: rgba(17,24,39,0.94); color: #fff;
  font: 12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap; max-width: 320px;
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
  .gloss-tip { background: rgba(243,244,246,0.96); color: #111827; }
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
    let elements: ElemMeta[] = [];
    let selected: Record<string, boolean> = {};
    let opts: Options = {
      tooltip: true, hover: true, select: true, brush: true, zoom: true,
      toolbar: true, nearest: true, selectMode: "multiple"
    };
    let vb0: ViewBox | null = null; // original viewBox (for reset)
    let vb: ViewBox | null = null; // current viewBox
    let mode: "brush" | "pan" = "brush";
    let lastBrush: Bbox | null = null; // last brushed region (user coords)

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
    function elementsForKey(k: string): Element[] {
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
    function highlightKeys(k: string): string[] {
      const g = meta[k] && meta[k].hover_group;
      return g && groups[g] ? groups[g] : [k];
    }
    function setHover(k: string): void {
      if (!opts.hover) return;
      el.classList.add("gloss-hovering");
      clearClass("gloss-hl");
      addClassForKeys(highlightKeys(k), "gloss-hl");
    }
    function showTip(clientX: number, clientY: number, k: string): void {
      const m = meta[k];
      tip.textContent = (m && m.tooltip) || k;
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

    // --- selection ---
    function refreshSelected(): void {
      clearClass("gloss-selected");
      for (const k in selected) if (selected[k]) addClassForKeys([k], "gloss-selected");
    }
    function toggleSelect(k: string): void {
      if (opts.selectMode === "single") {
        const onlyThis = selected[k] && Object.keys(selected).filter((x) => selected[x]).length === 1;
        selected = {};
        if (!onlyThis) selected[k] = true;
      } else {
        selected[k] = !selected[k];
      }
      refreshSelected();
    }
    function setSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
    }
    function clearSelection(): void {
      selected = {};
      refreshSelected();
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

    // --- pointer interaction (hover + drag: brush or pan) ---
    let down: { cx: number; cy: number; ux: number; uy: number } | null = null;
    let dragging: "" | "brush" | "pan" = "";
    let movedDuringDrag = false;

    // Hover is SVG-local (fires only over this widget's svg). While a press is
    // in progress the drag handlers (below) own movement, so hover backs off.
    function onHoverMove(ev: MouseEvent): void {
      if (down) return;
      let k = keyOf(ev.target);
      if (k == null && opts.nearest && elements.length) {
        const u = toUser(ev.clientX, ev.clientY);
        const rad = vb ? vb.w * 0.02 : 8; // ~2% of the view width
        k = nearestKey(elements, u.x, u.y, rad);
      }
      if (k == null) {
        clearHover();
        return;
      }
      setHover(k);
      if (opts.tooltip) showTip(ev.clientX, ev.clientY, k);
    }

    // Drag move/up are bound to `window` only for the lifetime of a press (added
    // in onDown, removed in onDragUp), so a drag that leaves the svg still
    // resolves without leaking global listeners across widgets.
    function onDragMove(ev: MouseEvent): void {
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

    function onDown(ev: MouseEvent): void {
      if (ev.button !== 0) return;
      const u = toUser(ev.clientX, ev.clientY);
      down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      dragging = "";
      movedDuringDrag = false;
      window.addEventListener("mousemove", onDragMove);
      window.addEventListener("mouseup", onDragUp);
    }

    function onDragUp(ev: MouseEvent): void {
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragUp);
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
        hideBrush();
        lastBrush = null;
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
    function saveSvg(): void {
      if (!svgEl) return;
      const s = new XMLSerializer().serializeToString(svgEl);
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), "plot.svg");
    }
    function savePng(): void {
      if (!svgEl) return;
      const s = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = vb0 ? vb0.w : img.width;
        canvas.height = vb0 ? vb0.h : img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (b) {
            if (b) download(b, "plot.png");
          });
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        saveSvg(); // canvas tainted / unsupported -> fall back to SVG
      };
      img.src = url;
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
      if (s.hoverColor != null && s.hoverColor !== "") {
        el.style.setProperty("--gloss-hl-stroke", s.hoverColor);
        el.classList.add("gloss-hc-all");
      } else {
        el.style.removeProperty("--gloss-hl-stroke");
        el.classList.remove("gloss-hc-all");
      }
      // Per-element overrides.
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.hover_color == null && e.selected_color == null) continue;
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
        }
      }
    }

    function wire(svg: SVGSVGElement): void {
      svg.addEventListener("mousemove", onHoverMove);
      svg.addEventListener("mouseleave", clearHover);
      svg.addEventListener("mousedown", onDown);
      svg.addEventListener("click", onClick);
      if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
      el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", onKey);
    }

    return {
      renderValue: function (x: Payload) {
        opts = Object.assign(
          { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" },
          x.options || {}
        );
        elements = x.elements || [];
        meta = {};
        groups = {};
        selected = {};
        lastBrush = null;
        mode = "brush";
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          meta[e.key] = e;
          if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
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
  unionBbox
};
