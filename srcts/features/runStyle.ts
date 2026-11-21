// Per-key state on the flagged runs of the mixed tier (VW-33).
//
// A run's PNG (VW-30) bakes its marks' look in, so a condition(), a filter or
// cross-filter, dimming or a legend hide/mute could not reach a flagged mark
// (a keyed text label, a masked shape) in the overview, mid and detail tiers
// or in an export. With the run's SVG alongside its PNG (`payload$flagged$svg`,
// the same vellum layer as vector nodes with their `data-key`s), a run whose
// marks some active state touches is re-rendered here, server-free: the state
// is applied to a copy of the run's SVG as SVG mode applies it to its nodes
// (hidden: removed; a condition colour: inline fill/stroke; dim and mute: the
// node's opacity), and the copy is rasterised by the browser as an image. That
// image stands in for the run's PNG on the canvas (`runImage()`, painted by
// raster.ts `paintList`, so the export redraw has it too) and in the detail
// tier's run <image> (`runHref()`). A run no state touches keeps its PNG.
//
// The image loads asynchronously (a few ms); until it has, the run keeps the
// image it showed before, then the tier redraws.

import { MS_DIM, MS_HIDDEN, MS_MUTED, MUTED_ALPHA } from "./markState";
import { asColumn } from "../elements";
import type { WidgetFns, WidgetState } from "../state";

interface Styled { img: HTMLImageElement; href: string; ready: boolean }

// Re-rendered variants kept per run (a hover-driven condition flips between
// a few states).
const CACHE_PER_RUN = 4;

export function runStyleFeature(ws: WidgetState): Pick<WidgetFns, "restyleRuns" | "runImage" | "runHref" | "runStyled"> {
  let forDl: unknown = null;
  let keyIdx: Map<string, number> = new Map();
  let runKeys: Uint32Array[] = []; // per run (0-based): the distinct key ids of its records
  let svgs: string[] = [];
  let docs: (Element | null | undefined)[] = [];
  let cache: { sig: string; s: Styled }[][] = [];
  let cur: (Styled | null)[] = []; // per run: the re-rendered image shown, or null = its PNG
  let want: string[] = []; // per run: the state signature it should show

  function sync(): boolean {
    const dl = ws.dl;
    if (!dl || !dl.runImgs || !ws.runSvg) { forDl = null; return false; }
    if (forDl === dl) return true;
    forDl = dl;
    svgs = ws.runSvg;
    keyIdx = new Map();
    for (let i = 0; i < dl.keys.length; i++) keyIdx.set(dl.keys[i], i);
    const sets: Record<number, boolean>[] = [];
    for (let r = 0; r < dl.nRuns; r++) sets.push({});
    for (let i = 0; i < dl.n; i++) {
      const r = dl.run[i];
      if (r > 0 && r <= dl.nRuns) sets[r - 1][dl.key[i]] = true;
    }
    runKeys = sets.map((s) => Uint32Array.from(Object.keys(s).map(Number)));
    docs = []; cache = []; cur = []; want = [];
    return true;
  }

  // The state of run r's keys, as a string ("" = untouched).
  function sigOf(r: number): string {
    if (!ws.msActive || !ws.msFlags || !ws.msColor) return "";
    const flags = ws.msFlags, color = ws.msColor, ids = runKeys[r];
    let s = "";
    for (let q = 0; q < ids.length; q++) {
      const k = ids[q], f = flags[k], c = color[k];
      if (f || c) s += k + ":" + f + ":" + (c ? ws.msPalette[c - 1] : "") + ";";
    }
    return s ? s + "@" + ws.msDimAlpha : "";
  }

  function docFor(r: number): Element | null {
    if (docs[r] !== undefined) return docs[r]!;
    let el: Element | null = null;
    try {
      const W = window as unknown as { DOMParser: typeof DOMParser };
      const d = new W.DOMParser().parseFromString(svgs[r] || "", "image/svg+xml");
      el = d.documentElement && d.documentElement.nodeName === "svg" && !d.getElementsByTagName("parsererror").length ? d.documentElement : null;
    } catch (e) { el = null; }
    docs[r] = el;
    return el;
  }

  // Run r's SVG with the current state applied, as SVG mode styles its nodes
  // (declarative.ts styleCondNode, css.ts): later style declarations win
  // over the node's presentation attributes, as the CSS rules do.
  function render(r: number, sig: string): Styled | null {
    const dl = ws.dl!, root = docFor(r);
    if (!root) return null;
    const svg = root.cloneNode(true) as Element;
    const flags = ws.msFlags!, color = ws.msColor!, pal = ws.msPalette;
    const nodes = Array.prototype.slice.call(svg.querySelectorAll("[data-key]")) as Element[];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const k = keyIdx.get(n.getAttribute("data-key") || "");
      if (k == null) continue;
      const f = flags[k], c = color[k];
      if (f & MS_HIDDEN) { if (n.parentNode) n.parentNode.removeChild(n); continue; }
      let st = n.getAttribute("style") || "";
      if (c) {
        const col = pal[c - 1];
        const fa = n.getAttribute("fill"), sa = n.getAttribute("stroke");
        if (fa && fa !== "none") st += ";fill:" + col;
        if (sa && sa !== "none") st += ";stroke:" + col;
      }
      // As the stylesheet: a condition's dim wins over the legend mute.
      if (f & MS_DIM) st += ";opacity:" + ws.msDimAlpha;
      else if (f & MS_MUTED) st += ";opacity:" + MUTED_ALPHA;
      if (st) n.setAttribute("style", st.replace(/^;/, ""));
    }
    // Rasterise at the PNG's resolution (the frame is runW x runH scene px).
    const png = dl.runImgs![r] as HTMLImageElement;
    const k = png && png.naturalWidth > 0 && dl.runW > 0 ? png.naturalWidth / dl.runW : 2;
    svg.setAttribute("width", String(Math.round(dl.runW * k)));
    svg.setAttribute("height", String(Math.round(dl.runH * k)));
    let text = "";
    try {
      const W = window as unknown as { XMLSerializer: typeof XMLSerializer };
      text = new W.XMLSerializer().serializeToString(svg);
    } catch (e) { return null; }
    const href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
    const img = document.createElement("img");
    const s: Styled = { img: img, href: href, ready: false };
    img.onload = function () {
      s.ready = true;
      if (ws.dl !== dl || want[r] !== sig) return;
      cur[r] = s;
      refresh();
    };
    img.src = href;
    return s;
  }

  // Redraw whatever shows the runs now.
  function refresh(): void {
    if (ws.markTier === "detail") {
      const ims = ws.svgEl ? ws.svgEl.querySelectorAll("defs.vellumwidget-detail image[data-run]") : [];
      for (let i = 0; i < ims.length; i++) {
        const r = Number(ims[i].getAttribute("data-run"));
        ims[i].setAttribute("href", runHref(r));
      }
    } else if (ws.fx.ringMode()) {
      ws.fx.drawPoints(true);
    }
  }

  // Bring every run in line with the current per-key state (after
  // updateMarkStates, and once the runs attach). Returns whether a run's
  // image changed synchronously.
  function restyleRuns(): boolean {
    if (!sync()) return false;
    const dl = ws.dl!;
    let changed = false;
    for (let r = 0; r < dl.nRuns; r++) {
      const sig = sigOf(r);
      want[r] = sig;
      if (!sig) { if (cur[r]) { cur[r] = null; changed = true; } continue; }
      const list = cache[r] || (cache[r] = []);
      let hit: Styled | null = null;
      for (let q = 0; q < list.length; q++) if (list[q].sig === sig) { hit = list[q].s; break; }
      if (!hit) {
        hit = render(r, sig);
        if (!hit) continue; // no usable SVG: the PNG stays
        list.push({ sig: sig, s: hit });
        if (list.length > CACHE_PER_RUN) list.shift();
      }
      if (hit.ready && cur[r] !== hit) { cur[r] = hit; changed = true; }
    }
    // The canvas tiers redraw from the caller; the detail tier's run images
    // are swapped here.
    if (changed && ws.markTier === "detail") refresh();
    return changed;
  }

  // The image to draw for run r (1-based): re-rendered for the state, or its PNG.
  function runImage(r: number): CanvasImageSource | null {
    const dl = ws.dl;
    if (!dl || !dl.runImgs) return null;
    const s = forDl === dl ? cur[r - 1] : null;
    return s ? s.img : dl.runImgs[r - 1] || null;
  }

  function runHref(r: number): string {
    const dl = ws.dl;
    if (!dl || !dl.runHref) return "";
    const s = forDl === dl ? cur[r - 1] : null;
    return s ? s.href : dl.runHref[r - 1] || "";
  }

  // Test seam: per run, whether it shows a re-rendered image.
  function runStyled(): boolean[] {
    const dl = ws.dl;
    const out: boolean[] = [];
    if (!dl) return out;
    for (let r = 0; r < dl.nRuns; r++) out.push(forDl === dl && !!cur[r]);
    return out;
  }

  return { restyleRuns, runImage, runHref, runStyled };
}

// The run SVGs of a flagged payload (VW-33), or null when absent or the
// count doesn't match the runs.
export function runSvgsOf(svg: string[] | string | null | undefined, n: number): string[] | null {
  if (svg == null) return null;
  const a = asColumn(svg).map(String);
  return a.length === n ? a : null;
}
