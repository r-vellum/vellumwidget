// Selected marks above the rest (VW-53): while a selection is active, its
// marks are drawn above the non-members of their own layer, so a selected
// point is never partly hidden by a later neighbour; clearing the selection
// restores the paint order.
//
// Nodes (SVG mode, the raster detail tier): each member node moves to the
// end of its *segment*, the run of consecutive keyed siblings of one tag it
// sits in (the detail tier's run <use>s and tag changes split it). vellum
// draws a layer as one group per series ("layer-1-point-g1", "-g2", ...),
// siblings in paint order: a node in such a group goes to the end of the
// layer's last group instead, when every group it crosses is a plain one
// (no attribute but its id, role and class, so nothing it inherits changes). A
// comment marks each segment's end, made the first time a parent is needed,
// and a placeholder comment holds each moved node's place, so a node goes
// back exactly where it was. Members keep their own paint order. Moving a
// node keeps it in its parent, so its pan group's transform and counter-scale
// variables still apply.
//
// Canvas (overview stand-in, mid, export): the paint order from
// `raisedOrder()` (srcts/raise.ts), cached per display list and selection.

import type { DisplayList } from "../dlist";
import { raisedOrder } from "../raise";
import type { WidgetFns, WidgetState } from "../state";

const SEG_END = "vw-seg-end";

export function raiseFeature(ws: WidgetState): Pick<WidgetFns, "raiseSelected" | "raiseOrder"> {
  // The nodes raised now, in the order they were moved, with their placeholders.
  let raised: { node: Node; home: Comment }[] = [];
  // Parents whose segment ends are marked.
  let marked = new WeakSet<Node>();
  // Each node's segment end (a marker comment, or null: its parent's end).
  let segEnd = new WeakMap<Node, Node | null>();
  // A layer group's last plain sibling group of the same layer (or itself).
  let layerLast = new WeakMap<Node, Node>();

  const LAYER_RE = /^layer-(\d+)-/;
  function plainGroup(e: Element): boolean {
    if (e.tagName.toLowerCase() !== "g") return false;
    for (let i = 0; i < e.attributes.length; i++) {
      const a = e.attributes[i].name;
      if (a !== "data-vellum-id" && a !== "role" && a !== "class") return false;
    }
    return true;
  }
  function lastOfLayer(p: Node): Node {
    const hit = layerLast.get(p);
    if (hit) return hit;
    let last: Node = p;
    const e = p as Element;
    const m = e.nodeType === 1 && e.getAttribute("data-vellum-id") ? LAYER_RE.exec(e.getAttribute("data-vellum-id")!) : null;
    if (m && plainGroup(e)) {
      for (let s = e.nextSibling; s; s = s.nextSibling) {
        if (s.nodeType !== 1) continue;
        const se = s as Element, id = se.getAttribute("data-vellum-id") || "";
        const sm = LAYER_RE.exec(id);
        if (!sm || sm[1] !== m[1] || !plainGroup(se)) break;
        last = s;
      }
    }
    layerLast.set(p, last);
    return last;
  }

  function markParent(p: Node): void {
    if (marked.has(p)) return;
    marked.add(p);
    const kids = Array.prototype.slice.call(p.childNodes) as Node[];
    let run: Node[] = [], tag = "";
    const close = function (before: Node | null): void {
      if (!run.length) return;
      // a run reaching the parent's end needs no marker
      let end: Node | null = null;
      if (before) { end = document.createComment(SEG_END); p.insertBefore(end, before); }
      for (let i = 0; i < run.length; i++) segEnd.set(run[i], end);
      run = [];
    };
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i] as Element;
      const keyed = k.nodeType === 1 && k.hasAttribute("data-key");
      // text (whitespace) and comments (markers, placeholders) neither join nor split
      if (k.nodeType !== 1) continue;
      if (keyed && (!run.length || k.tagName === tag)) { run.push(k); tag = k.tagName; continue; }
      close(k);
      if (keyed) { run.push(k); tag = k.tagName; }
    }
    close(null);
  }

  function restore(): void {
    for (let i = raised.length - 1; i >= 0; i--) {
      const r = raised[i];
      if (r.home.parentNode) r.home.parentNode.replaceChild(r.node, r.home);
    }
    raised = [];
  }

  // Raise the current selection's nodes (and put back those no longer in
  // it). A no-op in the node-less raster tiers, which draw `raiseOrder()`.
  //
  // Moving a node in the DOM takes keyboard focus off it (the browser's focus
  // fixup sends it to the body), so selecting the focused mark with Enter /
  // Space lost the keyboard user's place (VW-57). The focused element is put
  // back in focus after the moves, with the marks' focus / blur handlers held
  // off meanwhile (`ws.focusHold`), so the roving cursor and the spoken
  // "selected" announcement stand. Focus order never follows the DOM: arrow
  // keys walk `ws.focusables` (data order) and only the roving mark is
  // tabbable, so where a raised node sits does not change it.
  function raiseSelected(): void {
    const active = document.activeElement as (HTMLElement & SVGElement) | null;
    const keep = active && active !== document.body && ws.el.contains(active) ? active : null;
    ws.focusHold = true;
    try {
      moveSelected();
      if (keep && keep.isConnected && document.activeElement !== keep && typeof keep.focus === "function") {
        keep.focus({ preventScroll: true });
      }
    } finally {
      ws.focusHold = false;
    }
  }

  function moveSelected(): void {
    restore();
    if (ws.fx.ringMode()) return;
    const keys = ws.fx.selectedKeys();
    if (!keys.length) return;
    const nodes: Node[] = [];
    for (let i = 0; i < keys.length; i++) {
      const ns = ws.fx.elementsForKey(keys[i]);
      for (let j = 0; j < ns.length; j++) if (ns[j].parentNode) nodes.push(ns[j]);
    }
    if (!nodes.length) return;
    // paint (document) order, so members keep theirs among themselves
    nodes.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], p = n.parentNode!;
      markParent(p);
      let tp: Node = p, end = segEnd.has(n) ? segEnd.get(n)! : null;
      // a series group whose run reaches its end: the layer's last group
      if (end === null) tp = lastOfLayer(p);
      if (end && end.parentNode !== p) continue;
      // already last in its segment: nothing above it to escape
      let nx = n.nextSibling;
      while (nx && nx.nodeType !== 1 && nx !== end) nx = nx.nextSibling;
      if (tp === p && nx === end) continue;
      if (tp !== p) end = null;
      const home = document.createComment("vw-home");
      p.replaceChild(home, n);
      tp.insertBefore(n, end);
      raised.push({ node: n, home: home });
    }
  }

  // The canvas paint order for `dl` under the current selection (null: the
  // list's own order). Cached until the list or the selection changes.
  let cacheDl: DisplayList | null = null, cacheRev = -1, cacheOrd: Uint32Array | null = null;
  function raiseOrder(dl: DisplayList): Uint32Array | null {
    if (cacheDl === dl && cacheRev === ws.selRev) return cacheOrd;
    cacheDl = dl; cacheRev = ws.selRev; cacheOrd = null;
    const keys = ws.fx.selectedKeys();
    if (!keys.length) return null;
    const ids = ws.fx.keyIds(keys);
    const member = new Uint8Array(dl.keys.length);
    for (let i = 0; i < ids.length; i++) if (ids[i] >= 0) member[ids[i]] = 1;
    cacheOrd = raisedOrder(dl, member);
    return cacheOrd;
  }

  return { raiseSelected, raiseOrder };
}
