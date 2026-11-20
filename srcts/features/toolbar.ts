// Toolbar: interaction modes, export (SVG / PNG / clipboard), fullscreen.

import { download } from "../dom";
import { MODE_ICON, MODE_LABEL, SVGNS } from "./constants";
import { unionBbox } from "../geometry";
import type { WidgetFns, WidgetState } from "../state";

export function toolbarFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "availableModes" | "setMode" | "buildToolbar"
> {
  function availableModes(): ("brush" | "lasso" | "pan")[] {
    const m: ("brush" | "lasso" | "pan")[] = [];
    if (ws.opts.brush) m.push("brush");
    if (ws.opts.lasso) m.push("lasso");
    if (ws.opts.zoom) m.push("pan");
    return m;
  }

  function setMode(m: "brush" | "pan" | "lasso"): void {
    ws.mode = m;
    ws.el.classList.toggle("vellumwidget-mode-pan", m === "pan");
    ws.el.classList.toggle("vellumwidget-mode-lasso", m === "lasso");
    if (m !== "lasso") ws.fx.clearLasso(); // leaving lasso drops any in-progress outline
    if (ws.toolbarEl) {
      const b = ws.toolbarEl.querySelector('[data-act="mode"]');
      if (b) {
        const modes = availableModes();
        const next = modes[(modes.indexOf(m) + 1) % modes.length];
        b.textContent = MODE_ICON[m];
        (b as HTMLElement).title =
          MODE_LABEL[m][0].toUpperCase() + MODE_LABEL[m].slice(1) + " mode" +
          (next && next !== m ? " (click for " + MODE_LABEL[next] + ")" : "");
        b.classList.toggle("vellumwidget-active", m !== "brush");
      }
    }
  }

  function cycleMode(): void {
    const modes = availableModes();
    if (modes.length < 2) return;
    setMode(modes[(modes.indexOf(ws.mode) + 1) % modes.length]);
  }

  // Export filename base (no extension) and PNG resolution scale, both
  // overridable via `as_widget(export = ...)`. The serialized SVG always
  // reflects the *current* viewBox, so a zoomed/panned view exports as shown.
  function exportName(): string {
    const n = ws.opts.export && ws.opts.export.filename;
    return n && String(n).length ? String(n) : "plot";
  }

  function exportScale(): number {
    const s = ws.opts.export && ws.opts.export.scale;
    return s && s > 0 ? s : 1;
  }

  // The current view as one SVG document. The base svg carries the furniture
  // and (split render, VW-14) the mark-layer image; under axis zoom the
  // re-ticked axis labels live in their own overlay in the same vb0 frame, so
  // they are folded in, or the export would show a zoomed plot with no tick
  // labels. The canvas-only "marks hidden" state is dropped: the exported image
  // shows the mark layer itself.
  function exportSvgString(): string {
    const svg = ws.svgEl!.cloneNode(true) as SVGSVGElement;
    svg.classList.remove("vellumwidget-marks-off");
    const drawn = svg.querySelectorAll(".vellumwidget-marks");
    for (let i = 0; i < drawn.length; i++) (drawn[i] as SVGElement).style.visibility = "";
    if (ws.axisZoomActive && ws.retickLayer) {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "vellumwidget-retick-export");
      for (let c = ws.retickLayer.firstChild; c; c = c.nextSibling) g.appendChild(c.cloneNode(true));
      svg.appendChild(g);
    }
    return new XMLSerializer().serializeToString(svg);
  }

  function saveSvg(): void {
    if (!ws.svgEl) return;
    const s = exportSvgString();
    download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
  }

  // Rasterise the current SVG to a canvas; `then(canvas)` on success, `fail()`
  // if the canvas is tainted/unsupported. Shared by savePng + copyPng.
  function toCanvas(then: (c: HTMLCanvasElement) => void, fail: () => void): void {
    if (!ws.svgEl) return fail();
    const s = exportSvgString();
    const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = function () {
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
    const anyEl = ws.el as unknown as { requestFullscreen?: () => void };
    const anyDoc = document as unknown as { fullscreenElement?: Element; exitFullscreen?: () => void };
    if (anyDoc.fullscreenElement) {
      if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
    } else if (anyEl.requestFullscreen) {
      anyEl.requestFullscreen();
    }
  }

  function zoomToSelection(): void {
    const rect = ws.lastBrush || unionBbox(ws.elements, ws.selected);
    if (rect) ws.fx.zoomTo(rect);
  }

  function buildToolbar(): void {
    if (ws.toolbarEl) {
      ws.toolbarEl.remove();
      ws.toolbarEl = null;
    }
    if (!ws.opts.toolbar) return;
    const bar = document.createElement("div");
    bar.className = "vellumwidget-toolbar";
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
    // One mode button cycles the enabled drag modes (brush / lasso / pan);
    // shown only when at least two are enabled. setMode() fills its icon + title.
    if (availableModes().length >= 2) btn("mode", MODE_ICON[ws.mode], "Drag mode", cycleMode);
    if (ws.opts.zoom) {
      btn("zoomsel", "⌖", "Zoom to selection", zoomToSelection);
      btn("reset", "⟲", "Reset zoom", ws.fx.resetZoom);
    }
    btn("svg", "SVG", "Download SVG", saveSvg);
    btn("png", "PNG", "Download PNG", savePng);
    if (canCopy()) btn("copy", "⧉", "Copy PNG to clipboard", copyPng);
    btn("full", "⛶", "Fullscreen", toggleFullscreen);
    ws.el.appendChild(bar);
    ws.toolbarEl = bar;
  }

  return { availableModes, setMode, buildToolbar };
}
