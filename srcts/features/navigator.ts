// Overview navigator: the opt-in x-range strip.

import type { WidgetFns, WidgetState } from "../state";
import { fmtViewBox } from "../viewbox";

export function navigatorFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "navToView" | "updateNav" | "buildNavigator"
> {
  // --- overview navigator (opt-in x-range strip) ---
  // Set the visible x-range from window fractions of the full extent (0..1), then
  // apply — reused by the drag handlers and the test seam. `xFrac` = left edge,
  // `wFrac` = width, both fractions of vb0's width; clamped to keep the window
  // on-strip and a minimum width so it stays grabbable.
  function navToView(xFrac: number, wFrac: number): void {
    if (!ws.vb0) return;
    wFrac = Math.min(1, Math.max(0.02, wFrac));
    xFrac = Math.min(1 - wFrac, Math.max(0, xFrac));
    const w = wFrac * ws.vb0.w;
    if (ws.xZoom) {
      // x-only (the normal SVG navigator): the selected x-range fills the width and
      // the full y-range stays on screen (a non-uniform view; see applyAspect).
      ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: ws.vb0.y, w: w, h: ws.vb0.h };
    } else {
      // Fallback for contexts that keep an aspect-locked view (raster, axis_zoom):
      // zoom both dimensions by the same fraction, centred vertically, so a
      // width-only change isn't swallowed by the `meet` fit.
      const cy = ws.vb ? ws.vb.y + ws.vb.h / 2 : ws.vb0.y + ws.vb0.h / 2;
      const h = wFrac * ws.vb0.h;
      ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: cy - h / 2, w: w, h: h };
    }
    ws.fx.applyViewBox();
  }

  // Reflect the current view in the window's position/size (x only). Called from
  // applyViewBox so wheel/keyboard/brush/linked changes all move the window too.
  function updateNav(): void {
    if (!ws.navWindow || !ws.vb || !ws.vb0 || !ws.vb0.w) return;
    const xFrac = (ws.vb.x - ws.vb0.x) / ws.vb0.w;
    const wFrac = ws.vb.w / ws.vb0.w;
    ws.navWindow.style.left = (xFrac * 100) + "%";
    ws.navWindow.style.width = (wFrac * 100) + "%";
  }

  // Build the navigator strip once: a squashed mini-render of the whole scene
  // (an inert clone of the base svg at the full viewBox) plus a draggable window
  // with two resize handles. Drag body -> pan x; drag a handle -> zoom x.
  function buildNavigator(): void {
    if (ws.navEl) { ws.navEl.remove(); ws.navEl = null; ws.navWindow = null; }
    if (!ws.opts.navigator || !ws.svgEl || !ws.vb0) return;
    const h = ws.opts.navigatorHeight && ws.opts.navigatorHeight > 0 ? ws.opts.navigatorHeight : 56;
    ws.navEl = document.createElement("div");
    ws.navEl.className = "vellumwidget-nav";
    ws.navEl.style.height = h + "px";
    ws.navEl.setAttribute("aria-hidden", "true"); // the main chart is the accessible view
    // Mini-render: clone the base svg at the full extent, squashed to fill, inert.
    const mini = document.createElement("div");
    mini.className = "vellumwidget-nav-mini";
    const clone = ws.svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", fmtViewBox(ws.vb0));
    clone.setAttribute("preserveAspectRatio", "none");
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    // Drop defs/clip-paths (duplicate ids would clash with the live svg) and any
    // interactivity/a11y hooks — this is a static backdrop.
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

  // Pointer drag on the window (pan) and handles (resize). All math in strip
  // fractions from the strip's client rect, so it is size-independent.
  function wireNavigator(hL: HTMLElement, hR: HTMLElement): void {
    if (!ws.navEl || !ws.navWindow) return;
    let mode: "" | "pan" | "l" | "r" = "";
    let startFracX = 0, startFracW = 0, startPointer = 0;
    const stripFrac = (clientX: number): number => {
      const r = ws.navEl!.getBoundingClientRect();
      return r.width ? (clientX - r.left) / r.width : 0;
    };
    const onMove = (ev: PointerEvent): void => {
      if (!mode || !ws.vb0) return;
      const d = stripFrac(ev.clientX) - startPointer;
      if (mode === "pan") navToView(startFracX + d, startFracW);
      else if (mode === "l") { const nx = startFracX + d; navToView(nx, startFracW + (startFracX - nx)); }
      else if (mode === "r") navToView(startFracX, startFracW + d);
    };
    const onUp = (ev: PointerEvent): void => {
      mode = "";
      ws.navWindow!.classList.remove("vellumwidget-nav-grabbing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (ev && (ev.target as Element).releasePointerCapture) { /* no-op */ }
    };
    const start = (m: "pan" | "l" | "r") => (ev: PointerEvent): void => {
      if (!ws.vb0) return;
      ev.preventDefault();
      ev.stopPropagation();
      mode = m;
      startFracX = (ws.vb!.x - ws.vb0.x) / ws.vb0.w;
      startFracW = ws.vb!.w / ws.vb0.w;
      startPointer = stripFrac(ev.clientX);
      if (m === "pan") ws.navWindow!.classList.add("vellumwidget-nav-grabbing");
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
