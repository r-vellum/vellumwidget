// The detail tier (VW-16): when a raster-mode view is zoomed in until only a
// few thousand marks are visible, the visible marks become real keyed SVG nodes
// (built from the display list, inside each panel's pan group), so hover,
// selection, conditions, filters and keyboard focus work exactly as in SVG
// mode. Zooming back out past the exit threshold returns to the canvas.
//
// Three tiers (ws.markTier): "overview" (the mark PNG), "mid" (the exact
// canvas, VW-15) and "detail" (SVG nodes). The swap happens when the view
// settles (SETTLE_MS without a view change), never per wheel tick, and with
// hysteresis: enter below `detailMarks` visible marks, leave above 1.5x that.

import { RUN_BOX_PAD, SETTLE_MS, SVGNS } from "./constants";
import { DL_FLAG_PICK, DL_POINT, DL_RECT, isLineGlyph, markerRing } from "../dlist";
import type { DisplayList } from "../dlist";
import { cssEscape } from "../css";
import type { WidgetFns, WidgetState } from "../state";
import type { RunSplit } from "./runStyle";
import { isZoomedIn } from "../viewbox";

export const DETAIL_DEFAULT = 3000;

export function detailFeature(
  ws: WidgetState
): Pick<WidgetFns, "scheduleTier" | "evalTier" | "ringMode" | "leaveDetail"> {
  let timer = 0;

  // Raster feedback by rings (no nodes to style) -- every raster tier but detail.
  function ringMode(): boolean {
    return ws.rasterMode && ws.markTier !== "detail";
  }

  function enterAt(): number {
    const v = ws.opts.detailMarks;
    return v == null ? DETAIL_DEFAULT : v;
  }

  function scheduleTier(): void {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!ws.rasterMode || !ws.dl) return;
    timer = window.setTimeout(function () { timer = 0; evalTier(); }, SETTLE_MS);
  }

  function zoomed(): boolean {
    if (!ws.vb || !ws.vb0) return false;
    if (ws.axisZoomActive && ws.azPanels.length) {
      return ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx > 1.0001 || t.sy > 1.0001; });
    }
    return isZoomedIn(ws.vb, ws.vb0);
  }

  // The records in view, in paint order, or null when there are more than
  // `cap`. Under axis zoom a record is in view when its box, moved by its
  // panel's T, overlaps that panel's fixed rect.
  function visibleRecords(dl: DisplayList, cap: number): number[] | null {
    const out: number[] = [];
    const np = dl.panels.length;
    const T: ({ sx: number; sy: number; tx: number; ty: number; r: number[] } | null)[] = [null];
    for (let p = 1; p <= np; p++) {
      const a = ws.axisZoomActive ? ws.azPanels.filter((q) => q.p.name === dl.panels[p - 1])[0] : null;
      if (a) {
        const t = ws.fx.azT(a);
        T.push({ sx: t.sx, sy: t.sy, tx: t.tx, ty: t.ty, r: [a.p.px0, a.p.py0, a.p.px1, a.p.py1] });
      } else T.push(null);
    }
    const vb = ws.vb!;
    for (let i = 0; i < dl.n; i++) {
      // The record's box (not just its centre), so a big mark only partly
      // in view -- a bar, a disc, a polygon -- is still built (VW-23).
      let x0 = dl.bx0[i], x1 = dl.bx1[i], y0 = dl.by0[i], y1 = dl.by1[i];
      const t = dl.panel[i] <= np ? T[dl.panel[i]] : null;
      if (t) {
        x0 = t.sx * x0 + t.tx; x1 = t.sx * x1 + t.tx; y0 = t.sy * y0 + t.ty; y1 = t.sy * y1 + t.ty;
        if (x1 < t.r[0] || x0 > t.r[2] || y1 < t.r[1] || y0 > t.r[3]) continue;
      } else if (ws.axisZoomActive) {
        if (x1 < ws.vb0!.x || x0 > ws.vb0!.x + ws.vb0!.w || y1 < ws.vb0!.y || y0 > ws.vb0!.y + ws.vb0!.h) continue;
      } else if (x1 < vb.x || x0 > vb.x + vb.w || y1 < vb.y || y0 > vb.y + vb.h) continue;
      out.push(i);
      if (out.length > cap) return null;
    }
    return out;
  }

  // Decide the tier for the settled view, and (re)build the detail nodes.
  function evalTier(): void {
    const dl = ws.dl;
    const enter = enterAt();
    if (!ws.rasterMode || !dl || !dl.exact || !(enter > 0) || !ws.svgEl) {
      if (ws.markTier === "detail") leaveDetail();
      if (ws.rasterMode) ws.markTier = zoomed() ? "mid" : "overview";
      return;
    }
    if (!zoomed()) {
      if (ws.markTier === "detail") leaveDetail();
      ws.markTier = "overview";
      return;
    }
    const exit = Math.round(enter * 1.5);
    const vis = visibleRecords(dl, ws.markTier === "detail" ? exit : enter - 1);
    if (vis == null) {
      if (ws.markTier === "detail") leaveDetail();
      ws.markTier = "mid";
      return;
    }
    buildDetail(dl, vis); // entering, or a pan/zoom within detail: rebuild for the new view
  }

  // A hex colour with alpha ("#rrggbbaa") as [rgb, opacity].
  function splitHex(c: string): [string, string | null] {
    if (/^#[0-9a-fA-F]{8}$/.test(c)) {
      const a = parseInt(c.slice(7, 9), 16) / 255;
      return [c.slice(0, 7), a >= 1 ? null : String(Math.round(a * 1000) / 1000)];
    }
    return [c, null];
  }

  // Display list v2 (VW-23) paint servers and clips for the detail nodes:
  // gradients and clip-path chains are defined once per build in a <defs>
  // (removed with the nodes), with page-unique ids.
  let defsSeq = 0;
  interface DetailDefs { el: SVGDefsElement; pre: string; grads: Record<number, string>; clips: Record<number, string> }
  function gradRef(D: DetailDefs, dl: DisplayList, gi: number): string {
    if (D.grads[gi]) return D.grads[gi];
    const g = dl.gradients[gi - 1];
    const id = D.pre + "g" + gi;
    const e = document.createElementNS(SVGNS, g.radial ? "radialGradient" : "linearGradient");
    e.setAttribute("id", id);
    e.setAttribute("gradientUnits", "userSpaceOnUse");
    e.setAttribute("gradientTransform", "matrix(" + g.m.join(" ") + ")");
    if (g.radial) {
      e.setAttribute("cx", String(g.x2)); e.setAttribute("cy", String(g.y2)); e.setAttribute("r", String(g.r2));
      e.setAttribute("fx", String(g.x1)); e.setAttribute("fy", String(g.y1)); e.setAttribute("fr", String(g.r1));
    } else {
      e.setAttribute("x1", String(g.x1)); e.setAttribute("y1", String(g.y1));
      e.setAttribute("x2", String(g.x2)); e.setAttribute("y2", String(g.y2));
    }
    for (let k = 0; k < g.stops.length; k++) {
      const st = document.createElementNS(SVGNS, "stop");
      const c = splitHex(g.stops[k].c);
      st.setAttribute("offset", String(g.stops[k].o));
      st.setAttribute("stop-color", c[0]);
      if (c[1] != null) st.setAttribute("stop-opacity", c[1]);
      e.appendChild(st);
    }
    D.el.appendChild(e);
    return (D.grads[gi] = id);
  }
  // A clip with paths: a chain of <clipPath>s (each clipped by the next, so
  // they intersect): the paths, then the clip rect.
  function clipRef(D: DetailDefs, dl: DisplayList, ci: number): string {
    if (D.clips[ci]) return D.clips[ci];
    const c = dl.clips[ci - 1];
    const ids: string[] = [];
    for (let q = 0; q <= c.pn; q++) ids.push(D.pre + "c" + ci + "-" + q);
    for (let q = 0; q <= c.pn; q++) {
      const cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", ids[q]);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      if (q < c.pn) {
        const sh = c.ps + q;
        let d = "";
        for (let run = dl.cpPathOff[sh]; run < dl.cpPathOff[sh + 1]; run++) {
          for (let v = dl.cpRunOff[run]; v < dl.cpRunOff[run + 1]; v++) {
            d += (v === dl.cpRunOff[run] ? "M" : "L") + dl.cpXy[2 * v] + " " + dl.cpXy[2 * v + 1];
          }
          d += "Z";
        }
        const path = document.createElementNS(SVGNS, "path");
        path.setAttribute("d", d);
        if (dl.cpEvenodd[sh] === 1) path.setAttribute("clip-rule", "evenodd");
        cp.appendChild(path);
        cp.setAttribute("clip-path", "url(#" + ids[q + 1] + ")");
      } else {
        const r = document.createElementNS(SVGNS, "rect");
        r.setAttribute("x", String(c.x0)); r.setAttribute("y", String(c.y0));
        r.setAttribute("width", String(Math.max(0, c.x1 - c.x0))); r.setAttribute("height", String(Math.max(0, c.y1 - c.y0)));
        cp.appendChild(r);
      }
      D.el.appendChild(cp);
    }
    return (D.clips[ci] = ids[0]);
  }

  // One record as an SVG node in scene (device px) coordinates.
  function nodeFor(dl: DisplayList, i: number, D?: DetailDefs): SVGElement {
    const j = dl.row[i], kd = dl.kind[i];
    let n: SVGElement;
    let glyph = false;
    if (kd === DL_POINT) {
      const sh = dl.shape[j], cx = dl.cx[j], cy = dl.cy[j], r = dl.r[j];
      glyph = true;
      if (sh === 0 || (!isLineGlyph(sh) && !markerRing(sh))) {
        n = document.createElementNS(SVGNS, "circle") as SVGElement;
        n.setAttribute("cx", String(cx)); n.setAttribute("cy", String(cy)); n.setAttribute("r", String(r));
      } else {
        n = document.createElementNS(SVGNS, "path") as SVGElement;
        let d = "";
        if (sh === 4) d = "M" + cx + " " + (cy - r) + "V" + (cy + r) + "M" + (cx - r) + " " + cy + "H" + (cx + r);
        else if (sh === 5) {
          const q = r * Math.SQRT1_2;
          d = "M" + (cx - q) + " " + (cy - q) + "L" + (cx + q) + " " + (cy + q) + "M" + (cx - q) + " " + (cy + q) + "L" + (cx + q) + " " + (cy - q);
        } else {
          const m = markerRing(sh)!;
          for (let k = 0; k < m.length; k += 2) d += (k ? "L" : "M") + (cx + m[k] * r) + " " + (cy + m[k + 1] * r);
          d += "Z";
        }
        n.setAttribute("d", d);
      }
    } else if (kd === DL_RECT) {
      n = document.createElementNS(SVGNS, "rect") as SVGElement;
      const x = dl.rx[j], y = dl.ry[j], w = dl.rw[j], h = dl.rh[j];
      n.setAttribute("x", String(Math.min(x, x + w))); n.setAttribute("y", String(Math.min(y, y + h)));
      n.setAttribute("width", String(Math.abs(w))); n.setAttribute("height", String(Math.abs(h)));
    } else {
      n = document.createElementNS(SVGNS, "path") as SVGElement;
      let d = "";
      const closed = dl.closed[j] === 1;
      for (let run = dl.pathOff[j]; run < dl.pathOff[j + 1]; run++) {
        for (let v = dl.runOff[run]; v < dl.runOff[run + 1]; v++) {
          d += (v === dl.runOff[run] ? "M" : "L") + dl.xy[2 * v] + " " + dl.xy[2 * v + 1];
        }
        if (closed) d += "Z";
      }
      n.setAttribute("d", d);
      if (dl.evenodd[j] === 1) n.setAttribute("fill-rule", "evenodd");
    }
    const pt = dl.paints[dl.paint[i]];
    const fillable = kd !== 2 || dl.closed[j] === 1;
    if (pt.grad > 0 && D && fillable) {
      n.setAttribute("fill", "url(#" + gradRef(D, dl, pt.grad) + ")");
    } else if (pt.fill && fillable && !(kd === DL_POINT && isLineGlyph(dl.shape[j]))) {
      const f = splitHex(pt.fill);
      n.setAttribute("fill", f[0]);
      if (f[1] != null) n.setAttribute("fill-opacity", f[1]);
    } else n.setAttribute("fill", "none");
    if (pt.stroke && pt.width > 0) {
      const s = splitHex(pt.stroke);
      n.setAttribute("stroke", s[0]);
      if (s[1] != null) n.setAttribute("stroke-opacity", s[1]);
      n.setAttribute("stroke-width", String(pt.width));
      if (pt.dash) n.setAttribute("stroke-dasharray", pt.dash.join(" "));
      n.setAttribute("stroke-linecap", pt.cap);
      n.setAttribute("stroke-linejoin", pt.join);
    }
    n.setAttribute("data-key", dl.keys[dl.key[i]]);
    const ci = dl.clip[i];
    if (D && ci > 0 && dl.clips[ci - 1] && dl.clips[ci - 1].pn > 0) n.setAttribute("clip-path", "url(#" + clipRef(D, dl, ci) + ")");
    // Constant glyph size and stroke width under axis zoom, as setupConstantMarks
    // does for the SVG mode's marks.
    if (ws.axisZoomActive) {
      if (glyph && ws.opts.zoomMarks !== "scale") {
        n.style.setProperty("transform-box", "fill-box");
        n.style.setProperty("transform-origin", "center");
        n.style.setProperty("transform", "scale(var(--vw-ix,1),var(--vw-iy,1))");
      } else n.setAttribute("vector-effect", "non-scaling-stroke");
    }
    return n;
  }

  // Remove this render's detail nodes (and their key index entries).
  function dropNodes(): void {
    for (let i = 0; i < ws.detailGroups.length; i++) ws.detailGroups[i].remove();
    ws.detailGroups = [];
    for (let i = 0; i < ws.detailKeys.length; i++) {
      const k = ws.detailKeys[i], nodes = ws.nodesByKey[k];
      if (!nodes) continue;
      const keep = nodes.filter((n) => !(n as Element).closest || !(n as Element).closest(".vellumwidget-detail"));
      if (keep.length) ws.nodesByKey[k] = keep; else delete ws.nodesByKey[k];
    }
    ws.detailKeys = [];
  }

  function buildDetail(dl: DisplayList, vis: number[]): void {
    const svg = ws.svgEl!;
    dropNodes();
    // One group per panel pan group (or the svg itself for a panel without
    // one), appended after the mark image so the nodes draw where it did.
    const groups: Record<number, SVGGElement> = {};
    const groupFor = function (p: number): SVGGElement {
      if (groups[p]) return groups[p];
      const g = document.createElementNS(SVGNS, "g") as SVGGElement;
      g.setAttribute("class", "vellumwidget-detail");
      const name = p > 0 ? dl.panels[p - 1] : null;
      const host = (name && svg.querySelector('[data-vellum-pan="' + cssEscape(name) + '"]')) || svg;
      host.appendChild(g);
      ws.detailGroups.push(g);
      groups[p] = g;
      return g;
    };
    let D: DetailDefs | undefined;
    if (dl.gradients.length || dl.groups.length || dl.cpPathOff.length > 1 || dl.runHref) {
      const el = document.createElementNS(SVGNS, "defs") as SVGDefsElement;
      el.setAttribute("class", "vellumwidget-detail");
      svg.insertBefore(el, svg.firstChild);
      ws.detailGroups.push(el as unknown as SVGGElement);
      D = { el: el, pre: "vw-detail" + (++defsSeq) + "-", grads: {}, clips: {} };
    }
    // Opacity groups: consecutive records of one group share a <g opacity>
    // chain under their panel's detail group.
    const chains: Record<number, { g: number; el: SVGGElement }[]> = {};
    const hostFor = function (p: number, grp: number): SVGGElement {
      const root = groupFor(p);
      if (!dl.groups.length) return root;
      const want: number[] = [];
      for (let q = grp; q > 0 && want.length < 64; q = dl.groups[q - 1] ? dl.groups[q - 1].parent : 0) want.unshift(q);
      const st = chains[p] || (chains[p] = []);
      let k = 0;
      while (k < st.length && k < want.length && st[k].g === want[k]) k++;
      st.length = k;
      while (st.length < want.length) {
        const g = document.createElementNS(SVGNS, "g") as SVGGElement;
        g.setAttribute("opacity", String(dl.groups[want[st.length] - 1].alpha));
        (st.length ? st[st.length - 1].el : root).appendChild(g);
        st.push({ g: want[st.length], el: g });
      }
      return st.length ? st[st.length - 1].el : root;
    };
    // Flagged runs (VW-30): each run's raster is defined once and drawn by a
    // <use> in each panel group it has marks in, where the run starts in
    // paint order (after closing any open opacity chain: the image carries
    // its groups). Its marks get a transparent stand-in node from their
    // listed geometry (a text label's box), so they still take the pointer
    // and show a selection outline; their dimming and colours are baked into
    // the image. Every run is placed, in view or not (its ink, a blur or a
    // label, can reach past the record boxes).
    //
    // A panel without a pan group draws into the svg root, untransformed. A
    // root <use> shows the whole image, so it is placed once per run, and
    // when some panel does have a pan group (its own <use> draws the image's
    // part there) it is clipped to the boxes of the run's root-drawn marks,
    // so no mark is drawn twice (VW-34).
    const runIds: Record<number, string> = {};
    const placed: Record<string, boolean> = {};
    const panHost: boolean[] = [false];
    for (let p = 1; p <= dl.panels.length; p++) {
      panHost.push(!!svg.querySelector('[data-vellum-pan="' + cssEscape(dl.panels[p - 1]) + '"]'));
    }
    const anyPan = panHost.some((h) => h);
    const rootClip = function (r: number): string | null {
      if (!anyPan || !D) return null;
      const id = D.pre + "runclip" + r;
      if (D.el.querySelector("#" + id)) return id;
      const cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", id);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      for (let i = 0; i < dl.n; i++) {
        if (dl.run[i] !== r) continue;
        const p = dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0;
        if (panHost[p]) continue;
        const rc = document.createElementNS(SVGNS, "rect");
        rc.setAttribute("x", String(dl.bx0[i] - RUN_BOX_PAD)); rc.setAttribute("y", String(dl.by0[i] - RUN_BOX_PAD));
        rc.setAttribute("width", String(dl.bx1[i] - dl.bx0[i] + 2 * RUN_BOX_PAD));
        rc.setAttribute("height", String(dl.by1[i] - dl.by0[i] + 2 * RUN_BOX_PAD));
        cp.appendChild(rc);
      }
      D.el.appendChild(cp);
      return id;
    };
    // Constant-size flagged marks (VW-35): in an axis-zoomed panel a run is
    // taken apart (runStyle.ts runSplit). The rest of it is the run's PNG
    // with the constant marks' boxes masked out (plus, inside them, the rest
    // re-rendered from its SVG), scaled by the pan group; each constant mark
    // is its cell of the PNG or the atlas in a nested <svg> viewport,
    // counter-scaled about its anchor from the pan group's --vw-ix/--vw-iy,
    // as SVG mode's text (constantText) and glyphs are.
    const cstPanel = function (p: number): boolean {
      if (!panHost[p] || !ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
      return ws.azPanels.some((a) => a.p.name === dl.panels[p - 1]);
    };
    const constAt: Record<number, { ax: number; ay: number }> = {}; // key id -> anchor, for the stand-ins
    const counter = function (el: Element, ax: number, ay: number): void {
      const st = (el as SVGElement).style;
      st.setProperty("transform-box", "view-box");
      st.setProperty("transform-origin", "0px 0px");
      st.setProperty("transform", "translate(" + ax + "px," + ay + "px) scale(var(--vw-ix,1),var(--vw-iy,1)) translate(" + -ax + "px," + -ay + "px)");
    };
    const imgDef = function (id: string, href: string, w: number, h: number): string {
      if (!D!.el.querySelector("#" + id)) {
        const im = document.createElementNS(SVGNS, "image");
        im.setAttribute("id", id);
        im.setAttribute("x", "0"); im.setAttribute("y", "0");
        im.setAttribute("width", String(w)); im.setAttribute("height", String(h));
        im.setAttribute("preserveAspectRatio", "none");
        im.setAttribute("href", href);
        D!.el.appendChild(im);
      }
      return id;
    };
    const rectsInto = function (el: Element, cut: number[], fill?: string): void {
      for (let q = 0; q < cut.length; q += 4) {
        const rc = document.createElementNS(SVGNS, "rect");
        rc.setAttribute("x", String(cut[q])); rc.setAttribute("y", String(cut[q + 1]));
        rc.setAttribute("width", String(cut[q + 2] - cut[q])); rc.setAttribute("height", String(cut[q + 3] - cut[q + 1]));
        if (fill) rc.setAttribute("fill", fill);
        el.appendChild(rc);
      }
    };
    let usedSplit = false;
    const placeSplit = function (p: number, r: number, sp: RunSplit): void {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "vellumwidget-detail-run vellumwidget-detail-split");
      g.setAttribute("data-run", String(r));
      const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
      if (mode && mode !== "normal") (g as unknown as SVGElement).style.setProperty("mix-blend-mode", mode);
      const cp = ws.fx.panelClip(dl.panels[p - 1]);
      if (cp) g.setAttribute("clip-path", cp);
      const R = sp.rest;
      if (R && R.png) {
        const u = document.createElementNS(SVGNS, "use");
        u.setAttribute("href", "#" + imgDef(D!.pre + "runpng" + r, dl.runHref![r - 1], dl.runW, dl.runH));
        if (R.cut && R.cut.length) {
          const mid = D!.pre + "runcut" + r;
          if (!D!.el.querySelector("#" + mid)) {
            const mk = document.createElementNS(SVGNS, "mask");
            mk.setAttribute("id", mid);
            mk.setAttribute("maskUnits", "userSpaceOnUse");
            mk.setAttribute("x", "0"); mk.setAttribute("y", "0");
            mk.setAttribute("width", String(dl.runW)); mk.setAttribute("height", String(dl.runH));
            rectsInto(mk, [0, 0, dl.runW, dl.runH], "#fff");
            rectsInto(mk, R.cut, "#000");
            D!.el.appendChild(mk);
          }
          u.setAttribute("mask", "url(#" + mid + ")");
        }
        g.appendChild(u);
      }
      if (R && R.fill) {
        const u = document.createElementNS(SVGNS, "use");
        u.setAttribute("href", "#" + imgDef(D!.pre + "runfill" + r, R.fill.href, dl.runW, dl.runH));
        if (R.cut) {
          const cid = D!.pre + "runin" + r;
          if (!D!.el.querySelector("#" + cid)) {
            const c = document.createElementNS(SVGNS, "clipPath");
            c.setAttribute("id", cid);
            c.setAttribute("clipPathUnits", "userSpaceOnUse");
            rectsInto(c, R.cut);
            D!.el.appendChild(c);
          }
          u.setAttribute("clip-path", "url(#" + cid + ")");
        }
        g.appendChild(u);
      }
      for (let q = 0; q < sp.marks.length; q++) {
        const m = sp.marks[q];
        if (m.p !== p) continue;
        constAt[m.k] = { ax: m.ax, ay: m.ay };
        if (!m.src) continue;
        const id = m.atlas ? imgDef(D!.pre + "atlas" + r, m.href, m.fw, m.fh) : imgDef(D!.pre + "runpng" + r, m.href, m.fw, m.fh);
        const w = m.x1 - m.x0, h = m.y1 - m.y0;
        const box = document.createElementNS(SVGNS, "svg");
        box.setAttribute("x", String(m.x0)); box.setAttribute("y", String(m.y0));
        box.setAttribute("width", String(w)); box.setAttribute("height", String(h));
        box.setAttribute("viewBox", m.sx + " " + m.sy + " " + w + " " + h);
        box.setAttribute("preserveAspectRatio", "none");
        const u = document.createElementNS(SVGNS, "use");
        u.setAttribute("href", "#" + id);
        box.appendChild(u);
        const cg = document.createElementNS(SVGNS, "g");
        cg.setAttribute("class", "vellumwidget-detail-const");
        counter(cg, m.ax, m.ay);
        cg.appendChild(box);
        g.appendChild(cg);
      }
      groupFor(p).appendChild(g);
      if (chains[p]) chains[p].length = 0;
    };
    const placeRun = function (p: number, r: number): void {
      const tag = (panHost[p] ? p : "root") + ":" + r;
      if (placed[tag] || !D || !dl.runHref) return;
      placed[tag] = true;
      // (tried here: once a split's images load, the tier is rebuilt)
      const cp0 = cstPanel(p);
      if (cp0) usedSplit = true;
      const sp = cp0 ? ws.fx.runSplit(r) : null;
      if (sp) { placeSplit(p, r, sp); return; }
      if (!runIds[r]) {
        const im = document.createElementNS(SVGNS, "image");
        runIds[r] = D.pre + "run" + r;
        im.setAttribute("id", runIds[r]);
        im.setAttribute("x", "0"); im.setAttribute("y", "0");
        im.setAttribute("width", String(dl.runW)); im.setAttribute("height", String(dl.runH));
        im.setAttribute("preserveAspectRatio", "none");
        im.setAttribute("data-run", String(r));
        im.setAttribute("href", ws.fx.runHref(r)); // its PNG, or restyled (VW-33)
        D.el.appendChild(im);
      }
      const u = document.createElementNS(SVGNS, "use");
      u.setAttribute("class", "vellumwidget-detail-run");
      u.setAttribute("href", "#" + runIds[r]);
      // A run with a blend mode (VW-32) blends with what the panel group
      // (isolated by its clip) already holds: furniture and earlier nodes,
      // as the blended group does in SVG mode.
      const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
      if (mode && mode !== "normal") (u as unknown as SVGElement).style.setProperty("mix-blend-mode", mode);
      if (!panHost[p]) {
        const cid = rootClip(r);
        if (cid) u.setAttribute("clip-path", "url(#" + cid + ")");
      } else {
        // the run's part in this panel only, wherever a pan takes it (VW-36)
        const cp = ws.fx.panelClip(dl.panels[p - 1]);
        if (cp) u.setAttribute("clip-path", cp);
      }
      groupFor(p).appendChild(u);
      if (chains[p]) chains[p].length = 0;
    };
    let order = vis;
    if (dl.runImgs) {
      // the first record of each run in each panel joins the visible ones
      const firsts: Record<string, boolean> = {}, extra: number[] = [];
      for (let i = 0; i < dl.n; i++) {
        if (!(dl.run[i] > 0)) continue;
        const tag = dl.panel[i] + ":" + dl.run[i];
        if (!firsts[tag]) { firsts[tag] = true; extra.push(i); }
      }
      if (extra.length) {
        const all: Record<number, boolean> = {};
        for (let v = 0; v < vis.length; v++) all[vis[v]] = true;
        for (let e = 0; e < extra.length; e++) all[extra[e]] = true;
        order = Object.keys(all).map(Number).sort((a, b) => a - b);
      }
    }
    const visSet: Record<number, boolean> = {};
    for (let v = 0; v < vis.length; v++) visSet[vis[v]] = true;
    const seen: Record<string, boolean> = {};
    for (let v = 0; v < order.length; v++) {
      const i = order[v];
      if (dl.runImgs && dl.run[i] > 0) {
        const p = dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0;
        placeRun(p, dl.run[i]);
        if (!visSet[i] || (dl.flags[i] & DL_FLAG_PICK)) continue;
        const n = nodeFor(dl, i);
        n.setAttribute("fill", "#000"); n.setAttribute("fill-opacity", "0");
        n.removeAttribute("stroke"); n.removeAttribute("stroke-opacity"); n.removeAttribute("stroke-dasharray");
        n.setAttribute("class", "vellumwidget-detail-proxy");
        const ca = constAt[dl.key[i]];
        if (ca) counter(n, ca.ax, ca.ay); // the stand-in sits where its constant-size mark shows
        groupFor(p).appendChild(n);
        const k = dl.keys[dl.key[i]];
        (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(n);
        if (!seen[k]) { seen[k] = true; ws.detailKeys.push(k); }
        continue;
      }
      if (dl.flags[i]) continue; // pick-only: nothing to draw
      const n = nodeFor(dl, i, D);
      hostFor(dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0, dl.group[i]).appendChild(n);
      const k = dl.keys[dl.key[i]];
      (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(n);
      if (!seen[k]) { seen[k] = true; ws.detailKeys.push(k); }
    }
    ws.fx.markSplitInDetail(usedSplit);
    const was = ws.markTier;
    ws.markTier = "detail";
    ws.calib = null;
    ws.hoverSig = "";
    // The nodes replace the image and the canvas.
    ws.fx.hideCanvas(); // and its blend layers (VW-32)
    ws.fx.showMarksLayer(false);
    ws.fx.clearGroup(ws.selGroup);
    ws.fx.clearGroup(ws.hovGroup);
    // Re-apply the keyed state to the new nodes.
    ws.fx.refreshSelected(); // selection classes + conditions/filters (reevaluateInteractions)
    ws.fx.applyLegend();
    for (let i = 0; i < ws.detailKeys.length; i++) {
      if (ws.filteredKeySet[ws.detailKeys[i]]) ws.fx.addClassForKeys([ws.detailKeys[i]], "vellumwidget-filtered");
    }
    if (ws.hovering && ws.lastHoverKeys.length) ws.fx.addClassForKeys(ws.lastHoverKeys, "vellumwidget-hl");
    ws.fx.setupA11y();
    if (was !== "detail") ws.fx.announce(ws.detailKeys.length + " marks in view");
  }

  function leaveDetail(): void {
    if (ws.markTier !== "detail") return;
    dropNodes();
    ws.fx.markSplitInDetail(false);
    ws.markTier = "mid";
    ws.calib = null;
    ws.hoverSig = "";
    ws.el.classList.remove("vellumwidget-hovering");
    ws.fx.refreshSelected(); // back to rings
    ws.fx.setupA11y();
    ws.fx.showMarksLayer(true); // the image is back, unless the canvas below covers it
    ws.fx.drawPoints(); // the canvas (or the image) takes over again
  }

  return { scheduleTier, evalTier, ringMode, leaveDetail };
}
