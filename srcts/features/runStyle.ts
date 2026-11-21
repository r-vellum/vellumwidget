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
//
// Constant-size flagged marks under axis zoom (VW-35). SVG mode keeps keyed
// text and point glyphs at their pixel size under axis zoom (VW-26), while a
// run's raster scaled with the panel. `runSplit()` takes a run apart for a
// zoomed panel: each flagged text or glyph mark is drawn on its own at its
// anchor at constant size (the painter maps the anchor through T and keeps
// the mark's offsets unscaled), and the rest of the run scales as before.
// A mark's pixels come from its slice of the run's PNG when no other mark of
// the run reaches into its box and no state restyles it: vellum's own
// pixels, at the PNG's resolution, with no rasterising here. Otherwise (a
// neighbour's ink would come along in the slice, or a condition recolours or
// dims it) it comes from an atlas: one image per run, rasterised once from
// the run's SVG with each such mark alone in a cell (its ancestors' groups,
// masks and defs carried along). The rest of the run is its PNG with the
// constant marks' boxes cleared, plus, where another mark of the run shows
// in those boxes, the run's SVG without the constant marks drawn there.

import { MS_DIM, MS_HIDDEN, MS_MUTED, MUTED_ALPHA } from "./markState";
import { RUN_BOX_PAD } from "./constants";
import { asColumn } from "../elements";
import { GLYPH_MARKS } from "../scales";
import type { WidgetFns, WidgetState } from "../state";

interface Styled { img: HTMLImageElement; href: string; ready: boolean; failed?: boolean }

// One constant-size flagged mark of a split run (VW-35): its key id, panel,
// padded box and anchor (scene px), and where its pixels are: a cell at
// (sx, sy) of a frame fw x fh scene px (the run's PNG, or the atlas) held at
// ks px per scene px, the cell the size of the box. `src` is null when the mark is hidden.
export interface ConstMark {
  k: number; p: number; x0: number; y0: number; x1: number; y1: number; ax: number; ay: number;
  src: CanvasImageSource | null; href: string; atlas: boolean; fw: number; fh: number; sx: number; sy: number; ks: number;
}
// A run taken apart for a zoomed panel (VW-35). `rest` (null: nothing else
// in the run) is the run without its constant marks: the PNG (`png`) with
// the `cut` boxes cleared, and `fill` (the run's SVG without the constant
// marks, rasterised) drawn inside the cut boxes, or everywhere when `cut`
// is null.
export interface RunSplit {
  marks: ConstMark[];
  rest: { png: boolean; cut: number[] | null; fill: { img: CanvasImageSource; href: string } | null } | null;
}

// Per run (0-based): its keys with their panel, padded box, whether the mark
// keeps a constant size (text, point glyphs), its anchor, and whether no
// other mark of the run reaches into its box.
interface Geo {
  k: number[]; p: number[]; x0: number[]; y0: number[]; x1: number[]; y1: number[];
  cst: boolean[]; ax: number[]; ay: number[]; iso: boolean[]; nCst: number;
}

// Gap between atlas cells (scene px), so no cell's antialiasing reaches the next.
const ATLAS_GAP = 4;
// Most marks one atlas holds; past it the slices come from the PNG.
const ATLAS_MAX = 4000;

// Re-rendered variants kept per run (a hover-driven condition flips between
// a few states).
const CACHE_PER_RUN = 4;

export function runStyleFeature(ws: WidgetState): Pick<WidgetFns, "restyleRuns" | "runImage" | "runHref" | "runStyled" | "runSplit" | "markSplitInDetail"> {
  let forDl: unknown = null;
  let keyIdx: Map<string, number> = new Map();
  let runKeys: Uint32Array[] = []; // per run (0-based): the distinct key ids of its records
  let svgs: string[] = [];
  let docs: (Element | null | undefined)[] = [];
  let cache: { sig: string; s: Styled }[][] = [];
  let cur: (Styled | null)[] = []; // per run: the re-rendered image shown, or null = its PNG
  let want: string[] = []; // per run: the state signature it should show
  let geos: (Geo | null)[] = [];
  let geoDl: unknown = null;
  let svgBroken: boolean[] = [];
  let splits: { sig: string; parts: (Styled | null)[]; split: RunSplit }[] = [];

  function sync(): boolean {
    const dl = ws.dl;
    if (!dl || !dl.runImgs || !ws.runSvg) { forDl = null; return false; }
    if (forDl === dl) return true;
    forDl = dl;
    svgs = ws.runSvg;
    keyIdx = new Map();
    // First index of each key: the one the records use when the table is
    // the element table's keys (VR-22), which may repeat a key.
    for (let i = 0; i < dl.keys.length; i++) if (!keyIdx.has(dl.keys[i])) keyIdx.set(dl.keys[i], i);
    const sets: Record<number, boolean>[] = [];
    for (let r = 0; r < dl.nRuns; r++) sets.push({});
    for (let i = 0; i < dl.n; i++) {
      const r = dl.run[i];
      if (r > 0 && r <= dl.nRuns) sets[r - 1][dl.key[i]] = true;
    }
    runKeys = sets.map((s) => Uint32Array.from(Object.keys(s).map(Number)));
    docs = []; cache = []; cur = []; want = [];
    geos = []; splits = [];
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

  // Apply the current state to the node of key id k, as SVG mode styles its
  // nodes (declarative.ts styleCondNode, css.ts): later style declarations
  // win over the node's presentation attributes, as the CSS rules do.
  // Returns false when the node is hidden (the caller drops it).
  function styleNode(n: Element, k: number): boolean {
    const flags = ws.msFlags, color = ws.msColor, pal = ws.msPalette;
    if (!flags || !color) return true;
    const f = flags[k], c = color[k];
    if (f & MS_HIDDEN) return false;
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
    return true;
  }

  // The PNG's pixels per scene px of run r (0-based).
  function pngScale(r: number): number {
    const dl = ws.dl!;
    const png = dl.runImgs![r] as HTMLImageElement;
    return png && png.naturalWidth > 0 && dl.runW > 0 ? png.naturalWidth / dl.runW : 2;
  }

  // Rasterise `svg` (a frame of w x h scene px) at k px per scene px as an
  // image, calling `done` once it has loaded (if the list is still current).
  function rasterise(svg: Element, w: number, h: number, k: number, done: (s: Styled) => void): Styled | null {
    const dl = ws.dl;
    svg.setAttribute("width", String(Math.round(w * k)));
    svg.setAttribute("height", String(Math.round(h * k)));
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
      if (ws.dl !== dl) return;
      done(s);
    };
    img.onerror = function () {
      s.failed = true;
      if (ws.dl !== dl) return;
      done(s);
    };
    img.src = href;
    return s;
  }

  // Run r's SVG with the current state applied, rasterised at the PNG's
  // resolution (the frame is runW x runH scene px), without the nodes of
  // the key ids in `drop`.
  function rasterRun(r: number, drop: Record<number, boolean> | null, done: (s: Styled) => void): Styled | null {
    const dl = ws.dl!, root = docFor(r);
    if (!root) return null;
    const svg = root.cloneNode(true) as Element;
    const nodes = Array.prototype.slice.call(svg.querySelectorAll("[data-key]")) as Element[];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const k = keyIdx.get(n.getAttribute("data-key") || "");
      if (k == null) continue;
      if ((drop && drop[k]) || !styleNode(n, k)) { if (n.parentNode) n.parentNode.removeChild(n); }
    }
    return rasterise(svg, dl.runW, dl.runH, pngScale(r), done);
  }

  // Run r's SVG with the current state applied, as an image (VW-33).
  function render(r: number, sig: string): Styled | null {
    return rasterRun(r, null, function (s) {
      if (s.failed || want[r] !== sig) return; // a failed load keeps the PNG
      cur[r] = s;
      refresh();
    });
  }

  // Redraw whatever shows the runs now.
  let rebuilding = false;
  function refresh(): void {
    if (ws.markTier === "detail" && splitInDetail) {
      // the detail tier's split runs are nodes of their own: rebuild them
      if (rebuilding) return;
      rebuilding = true;
      try { ws.fx.evalTier(); } finally { rebuilding = false; }
    } else if (ws.markTier === "detail") {
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
    let changed = false, sigChanged = false;
    for (let r = 0; r < dl.nRuns; r++) {
      const sig = sigOf(r);
      if (want[r] !== sig) sigChanged = true;
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
    // (a split run there is rebuilt for any new state, VW-35)
    if ((changed || (sigChanged && splitInDetail)) && ws.markTier === "detail") refresh();
    return changed;
  }


  // --- constant-size flagged marks under axis zoom (VW-35) ---

  // Whether the detail tier drew a split run (its nodes then follow the
  // state by a rebuild, not by swapping an image).
  let splitInDetail = false;

  function anchorOf(n: Element): { x: number; y: number } | null {
    const t = n.tagName.toLowerCase() === "text" ? n : n.querySelector("text");
    if (!t) return null;
    const x = parseFloat(t.getAttribute("x") || "") || 0, y = parseFloat(t.getAttribute("y") || "") || 0;
    const tr = t.getAttribute("transform") || "";
    const N = "([-+\\d.eE]+)";
    const m = new RegExp("matrix\\(\\s*" + [N, N, N, N, N, N].join("[\\s,]+") + "\\s*\\)").exec(tr);
    if (m) {
      const v = m.slice(1, 7).map(Number);
      const X = v[0] * x + v[2] * y + v[4], Y = v[1] * x + v[3] * y + v[5];
      return isFinite(X) && isFinite(Y) ? { x: X, y: Y } : null;
    }
    const tt = new RegExp("translate\\(\\s*" + N + "(?:[\\s,]+" + N + ")?\\s*\\)").exec(tr);
    if (tt) return { x: x + Number(tt[1]), y: y + (tt[2] === undefined ? 0 : Number(tt[2])) };
    return { x: x, y: y };
  }

  // Run r's (0-based) keys and their geometry (see Geo).
  function geoOf(r: number): Geo {
    if (geos[r]) return geos[r]!;
    const dl = ws.dl!;
    const at: Record<number, number> = {};
    const g: Geo = { k: [], p: [], x0: [], y0: [], x1: [], y1: [], cst: [], ax: [], ay: [], iso: [], nCst: 0 };
    for (let i = 0; i < dl.n; i++) {
      if (dl.run[i] !== r + 1) continue;
      const k = dl.key[i];
      let j = at[k];
      if (j === undefined) {
        j = at[k] = g.k.length;
        g.k.push(k); g.p.push(dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0);
        g.x0.push(dl.bx0[i]); g.y0.push(dl.by0[i]); g.x1.push(dl.bx1[i]); g.y1.push(dl.by1[i]);
      } else {
        g.x0[j] = Math.min(g.x0[j], dl.bx0[i]); g.y0[j] = Math.min(g.y0[j], dl.by0[i]);
        g.x1[j] = Math.max(g.x1[j], dl.bx1[i]); g.y1[j] = Math.max(g.y1[j], dl.by1[i]);
      }
    }
    const root = ws.runSvg ? docFor(r) : null;
    const nodeOf: Record<string, Element> = {};
    if (root) {
      const nodes = root.querySelectorAll("[data-key]");
      for (let i = 0; i < nodes.length; i++) {
        const kk = nodes[i].getAttribute("data-key") || "";
        if (!nodeOf[kk]) nodeOf[kk] = nodes[i];
      }
    }
    for (let j = 0; j < g.k.length; j++) {
      g.x0[j] -= RUN_BOX_PAD; g.y0[j] -= RUN_BOX_PAD; g.x1[j] += RUN_BOX_PAD; g.y1[j] += RUN_BOX_PAD;
      const key = dl.keys[g.k[j]];
      const e = ws.meta[key];
      const mark = e && e.mark ? e.mark : "";
      const text = mark === "text";
      const c = (text || GLYPH_MARKS[mark] === true) && g.p[j] > 0 && isFinite(g.x0[j]) && g.x1[j] > g.x0[j] && g.y1[j] > g.y0[j];
      g.cst.push(c);
      let ax = (g.x0[j] + g.x1[j]) / 2, ay = (g.y0[j] + g.y1[j]) / 2;
      // text keeps its size about its anchor (as SVG mode's constantText), a
      // glyph about its centre
      if (c && text && nodeOf[key]) {
        const a = anchorOf(nodeOf[key]);
        if (a) { ax = a.x; ay = a.y; }
      }
      g.ax.push(ax); g.ay.push(ay);
      if (c) g.nCst++;
    }
    // isolation: sweep the boxes in x order
    const ord = g.k.map((_, j) => j).sort((a, b) => g.x0[a] - g.x0[b]);
    const iso = g.k.map(() => true);
    for (let a = 0; a < ord.length; a++) {
      const i = ord[a];
      for (let b = a + 1; b < ord.length; b++) {
        const j = ord[b];
        if (g.x0[j] >= g.x1[i]) break;
        if (g.y0[j] < g.y1[i] && g.y1[j] > g.y0[i]) { iso[i] = false; iso[j] = false; }
      }
    }
    g.iso = iso;
    geos[r] = g;
    return g;
  }

  // The atlas of run r: the marks `js` (indices into its Geo) each alone in
  // a cell, styled with the current state. Returns the image and the cells.
  function atlasOf(r: number, g: Geo, js: number[], done: (s: Styled) => void): { s: Styled; w: number; h: number; cx: number[]; cy: number[]; ks: number } | null {
    const dl = ws.dl!, root = docFor(r);
    if (!root) return null;
    const want_: Record<string, number> = {};
    for (let q = 0; q < js.length; q++) want_[dl.keys[g.k[js[q]]]] = q;
    // shelf layout
    let wmax = 0;
    for (let q = 0; q < js.length; q++) wmax = Math.max(wmax, g.x1[js[q]] - g.x0[js[q]]);
    const W = Math.max(512, Math.ceil(wmax) + 2 * ATLAS_GAP);
    const cx: number[] = [], cy: number[] = [];
    let x = ATLAS_GAP, y = ATLAS_GAP, rowH = 0;
    for (let q = 0; q < js.length; q++) {
      const j = js[q], w = g.x1[j] - g.x0[j], h = g.y1[j] - g.y0[j];
      if (x + w + ATLAS_GAP > W) { x = ATLAS_GAP; y += rowH + ATLAS_GAP; rowH = 0; }
      cx.push(x); cy.push(y);
      x += Math.ceil(w) + ATLAS_GAP; rowH = Math.max(rowH, Math.ceil(h));
    }
    const H = y + rowH + ATLAS_GAP;
    const NS = "http://www.w3.org/2000/svg";
    const doc = root.ownerDocument!;
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const defs = root.querySelectorAll("defs");
    for (let i = 0; i < defs.length; i++) svg.appendChild(defs[i].cloneNode(true));
    const nodes = root.querySelectorAll("[data-key]");
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const q = want_[n.getAttribute("data-key") || ""];
      if (q === undefined) continue;
      const j = js[q];
      const copy = n.cloneNode(true) as Element;
      if (!styleNode(copy, g.k[j])) continue;
      // the node with its ancestors' groups (masks, clips, effects, opacity)
      let top: Element = copy;
      for (let up = n.parentNode as Element | null; up && up !== root; up = up.parentNode as Element | null) {
        if (up.nodeType !== 1 || up.tagName.toLowerCase() === "defs") break;
        const sh = up.cloneNode(false) as Element;
        sh.appendChild(top);
        top = sh;
      }
      const cell = doc.createElementNS(NS, "g");
      cell.setAttribute("transform", "translate(" + (cx[q] - g.x0[j]) + " " + (cy[q] - g.y0[j]) + ")");
      cell.appendChild(top);
      svg.appendChild(cell);
    }
    const ks = Math.max(2, pngScale(r));
    const s = rasterise(svg, W, H, ks, done);
    return s ? { s: s, w: W, h: H, cx: cx, cy: cy, ks: ks } : null;
  }

  // Run r (1-based) taken apart for a zoomed panel, or null: no constant
  // marks in it, or an image it needs hasn't loaded yet (the caller then
  // draws the run as one scaled image, and is redrawn once it has).
  function runSplit(r1: number): RunSplit | null {
    sync();
    const dl = ws.dl;
    if (!dl || !dl.runImgs || !dl.runHref) return null;
    if (geoDl !== dl) { geoDl = dl; geos = []; splits = []; svgBroken = []; }
    const r = r1 - 1;
    if (r < 0 || r >= dl.nRuns) return null;
    const g = geoOf(r);
    if (!g.nCst) return null;
    const sig = forDl === dl ? sigOf(r) : "";
    const hit = splits[r];
    // an atlas or rest image that failed to load: split from the PNG alone
    if (hit && hit.parts.some((s) => !!s && !!s.failed)) { svgBroken[r] = true; splits[r] = undefined as never; }
    else if (hit && hit.sig === sig) return hit.parts.every((s) => !s || s.ready) ? hit.split : null;
    const flags = ws.msActive ? ws.msFlags : null, color = ws.msActive ? ws.msColor : null;
    const hasSvg = forDl === dl && !svgBroken[r] && !!docFor(r);
    const png = dl.runImgs[r], pngHref = dl.runHref[r] || "";
    const marks: ConstMark[] = [], atl: number[] = [], atlAt: number[] = [];
    const cut: number[] = [];
    const isCst: Record<number, boolean> = {};
    let restAny = false, restTouched = false;
    for (let j = 0; j < g.k.length; j++) {
      const k = g.k[j], f = flags ? flags[k] : 0, c = color ? color[k] : 0;
      if (!g.cst[j]) { restAny = true; if (f || c) restTouched = true; continue; }
      isCst[k] = true;
      cut.push(g.x0[j], g.y0[j], g.x1[j], g.y1[j]);
      const m: ConstMark = { k: k, p: g.p[j], x0: g.x0[j], y0: g.y0[j], x1: g.x1[j], y1: g.y1[j], ax: g.ax[j], ay: g.ay[j],
        src: png, href: pngHref, atlas: false, fw: dl.runW, fh: dl.runH, sx: g.x0[j], sy: g.y0[j], ks: pngScale(r) };
      if (f & MS_HIDDEN) m.src = null;
      else if (hasSvg && (!g.iso[j] || f || c) && atl.length < ATLAS_MAX) { atlAt.push(marks.length); atl.push(j); }
      marks.push(m);
    }
    const parts: (Styled | null)[] = [];
    const split: RunSplit = { marks: marks, rest: null };
    // cached before any image starts loading, so its load finds it
    const entry = { sig: sig, parts: parts, split: split };
    splits[r] = entry;
    const redraw = function (): void { if (ws.dl === dl && splits[r] === entry) refresh(); };
    if (atl.length) {
      const a = atlasOf(r, g, atl, redraw);
      if (a) {
        parts.push(a.s);
        for (let q = 0; q < atl.length; q++) {
          const m = marks[atlAt[q]];
          m.src = a.s.img; m.href = a.s.href; m.atlas = true; m.fw = a.w; m.fh = a.h; m.sx = a.cx[q]; m.sy = a.cy[q]; m.ks = a.ks;
        }
      }
    }
    let rest: RunSplit["rest"] = null;
    if (restAny) {
      // does another mark of the run show inside the constant marks' boxes?
      let overlap = false;
      for (let j = 0; j < g.k.length && !overlap; j++) {
        if (g.cst[j]) continue;
        for (let q = 0; q < cut.length; q += 4) {
          if (g.x0[j] < cut[q + 2] && g.x1[j] > cut[q] && g.y0[j] < cut[q + 3] && g.y1[j] > cut[q + 1]) { overlap = true; break; }
        }
      }
      rest = { png: true, cut: cut, fill: null };
      if (hasSvg && (overlap || restTouched)) {
        const f = rasterRun(r, isCst, redraw);
        if (f) {
          parts.push(f);
          rest.fill = { img: f.img, href: f.href };
          // a restyled rest (VW-33) comes from the SVG everywhere
          if (restTouched) { rest.png = false; rest.cut = null; }
        }
      }
    }
    split.rest = rest;
    return parts.every((s) => !s || s.ready) ? split : null;
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

  function markSplitInDetail(on: boolean): void { splitInDetail = on; }

  return { restyleRuns, runImage, runHref, runStyled, runSplit, markSplitInDetail };
}

// The run SVGs of a flagged payload (VW-33), or null when absent or the
// count doesn't match the runs.
export function runSvgsOf(svg: string[] | string | null | undefined, n: number): string[] | null {
  if (svg == null) return null;
  const a = asColumn(svg).map(String);
  return a.length === n ? a : null;
}
