// Spatial index and true-geometry picking: the Flatbush index, the geometry
// block, nearest-mark / brush / lasso queries and the unified-hover axis columns.

import Flatbush from "flatbush";
import { asColumn } from "../elements";
import { PICK_CANDIDATES } from "./constants";
import { applyAffine6, distToBbox, distToGeom, hasBbox, isRoundMark, parseTransformList, rectsIntersect } from "../geometry";
import { GLYPH_MARKS } from "../scales";
import type { Geom, GeometryPayload } from "../geometry";
import { bboxInPolygon, bboxInRect, columnTolerance, dropPartialSeries, nearestSortedIdx, pointInPolygon, polyBounds } from "../spatial";
import type { Pt } from "../spatial";
import type { WidgetFns, WidgetState } from "../state";
import type { Bbox, ElemMeta } from "../types";

export function pickingFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "buildSpatialIndex" | "buildGeometry" | "distToElem" | "buildHoverAxis" | "nearestAxisKey"
  | "columnKeys" | "nearestKeyAt" | "brushKeysIn" | "lassoKeysIn" | "brushSelectable" | "constBox"
> {
  // --- spatial index (nearest / brush) ---
  // Rebuild the Flatbush index from the current elements' bboxes. Only bboxed
  // elements are indexed; `indexToElem` maps a flatbush item id back to its
  // `elements` position. No index (0 bboxed) -> queries fall back to the pure
  // linear scans, which are correct at any size.
  function buildSpatialIndex(): void {
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

  // Unpack the columnar geometry block into flat coordinate arrays plus, per
  // key, the slices that belong to it. A key may own several geometry elements
  // (a datum drawn as several shapes; a series' line and its end label),
  // and its distance is the minimum over them.
  function buildGeometry(g: GeometryPayload | undefined): void {
    ws.geomByKey = {};
    ws.gx = new Float64Array(0);
    ws.gy = new Float64Array(0);
    ws.haveGeometry = false;
    if (!g) return;
    const keys = asColumn<string>(g.key);
    const kinds = asColumn<string>(g.kind);
    const ns = asColumn<number>(g.n);
    const xs = asColumn<number>(g.x);
    const ys = asColumn<number>(g.y);
    if (!keys.length || xs.length !== ys.length) return;
    ws.gx = Float64Array.from(xs);
    ws.gy = Float64Array.from(ys);
    // Ring boundaries of a multi-ring path. Absent (an older payload, or a
    // scene whose every element is one ring) means one ring per element,
    // which is what the whole vertex run already describes.
    const nrs = g.nr != null ? asColumn<number>(g.nr) : null;
    const rls = g.rl != null ? asColumn<number>(g.rl) : null;
    const eos = g.eo != null ? asColumn<number>(g.eo) : null;
    let at = 0, ra = 0;
    for (let i = 0; i < keys.length; i++) {
      const n = ns[i] | 0;
      if (n <= 0 || at + n > ws.gx.length) break; // malformed: keep what parsed
      const rec: Geom = { kind: kinds[i], at: at, n: n };
      if (eos && eos[i] === 1) rec.evenodd = true;
      if (nrs && rls) {
        const k = nrs[i] | 0;
        if (k > 1) {
          const lens: number[] = [];
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

  // --- constant-size marks under axis zoom (VW-42) ---
  // A text or point-glyph mark in an axis-zoomed panel keeps its pixel size
  // (SVG mode's counter-scale, VW-26; raster mode's records and split runs,
  // VW-29/VW-35): T maps its anchor, and its extent around the anchor stays
  // as at 1x. In the scene frame the pointer is mapped into (T⁻¹ of the
  // screen), that is the record box shrunk about the anchor by T's scale.
  // Returns that box with the scale, or null when the mark scales with T
  // (another mark kind, zoom_marks = "scale", no zoom, or outside a panel).
  function constBox(e: ElemMeta): (Bbox & { sx: number; sy: number }) | null {
    if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale" || !hasBbox(e)) return null;
    const text = e.mark === "text";
    if (!text && !(e.mark && GLYPH_MARKS[e.mark] === true)) return null;
    let ax = (e.x0 + e.x1) / 2, ay = (e.y0 + e.y1) / 2;
    const a = ws.fx.azNearest(ax, ay);
    if (!a) return null;
    const p = a.p;
    if (ax < p.px0 || ax > p.px1 || ay < p.py0 || ay > p.py1) return null; // not in a panel
    const t = ws.fx.azT(a);
    if (!(t.sx > 0) || !(t.sy > 0) || (Math.abs(t.sx - 1) < 1e-9 && Math.abs(t.sy - 1) < 1e-9)) return null;
    // Raster mode draws marks at constant size only while some panel is
    // zoomed in (the canvas tiers); otherwise the mark PNG scales with T.
    if (ws.rasterMode && !ws.azPanels.some(function (q) { const u = ws.fx.azT(q); return u.sx > 1.0001 || u.sy > 1.0001; })) return null;
    if (text) {
      const an = textAnchor(e.key);
      if (an) { ax = an.x; ay = an.y; }
    }
    return {
      x0: ax + (e.x0 - ax) / t.sx, x1: ax + (e.x1 - ax) / t.sx,
      y0: ay + (e.y0 - ay) / t.sy, y1: ay + (e.y1 - ay) / t.sy,
      sx: t.sx, sy: t.sy
    };
  }

  // A text mark's anchor: from its flagged run (raster mode), else its own
  // node's (x, y) through its transform list (SVG mode, as constantText).
  function textAnchor(key: string): { x: number; y: number } | null {
    if (ws.rasterMode) {
      const r = ws.fx.constAnchor(key);
      if (r) return r;
    }
    const nodes = ws.nodesByKey[key];
    const n = nodes && nodes.length ? nodes[0] : null;
    const t = n ? (n.tagName.toLowerCase() === "text" ? n : n.querySelector("text")) : null;
    if (!t) return null;
    const x = parseFloat(t.getAttribute("x") || "") || 0, y = parseFloat(t.getAttribute("y") || "") || 0;
    const tr = (t.getAttribute("transform") || "").trim();
    if (!tr) return { x: x, y: y };
    const m = parseTransformList(tr);
    return m ? applyAffine6(m, x, y) : null;
  }

  // Whether some axis-zoomed panel is zoomed out on an axis (scale < 1): a
  // constant box is then larger than its record box, so the R-tree (built on
  // the record boxes) can't shortlist it.
  function constGrows(): boolean {
    if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const t = ws.fx.azT(ws.azPanels[i]);
      if (t.sx < 1 - 1e-9 || t.sy < 1 - 1e-9) return true;
    }
    return false;
  }

  // Distance from (x, y) to an element's true shape.
  //
  // The payload ships vertices only for the kinds whose shape is not their box
  // (segment/line/polygon/path). For everything else the box is the shape --
  // exactly so for a rect or a label, and for a round mark the inscribed disc,
  // which is reconstructed here rather than shipped as a centre per point.
  function distToElem(x: number, y: number, e: ElemMeta): number {
    // A constant-size mark is where it is drawn: its record box shrunk about
    // its anchor (VW-42).
    const cb = constBox(e);
    const box = cb || (hasBbox(e) ? e : null);
    const gs = cb ? null : ws.geomByKey[e.key];
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

  // Build the unified-hover axis index: element centres sorted by x and by y
  // (each paired with its key), plus the per-axis grouping tolerances. Cheap and
  // only used when hoverMode is "x"/"y"; harmless to build unconditionally.
  function buildHoverAxis(): void {
    const cx: { c: number; k: string }[] = [];
    const cy: { c: number; k: string }[] = [];
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

  // Key of the mark nearest the cursor on a single axis (x or y), ignoring the
  // other — the seed for unified hover in open space, so the shared readout
  // tracks the cursor along the axis regardless of vertical (or horizontal)
  // distance. No radius cap: the pointer is already inside the plot.
  function nearestAxisKey(axis: "x" | "y", coord: number): string | null {
    const sorted = axis === "x" ? ws.sortedCx : ws.sortedCy;
    const keys = axis === "x" ? ws.sortedCxKeys : ws.sortedCyKeys;
    const i = nearestSortedIdx(sorted, coord);
    return i >= 0 ? keys[i] : null;
  }

  // The keys forming mark `primary`'s column: every mark whose centre is within
  // the axis tolerance of `primary`'s centre on that axis. Reuses the spatial
  // index via a thin strip query (a huge perpendicular span catches the whole
  // column), so it is O(k) in the column size. Falls back to just `primary`.
  function columnKeys(primary: string, axis: "x" | "y"): string[] {
    const m = ws.meta[primary];
    if (!m || !hasBbox(m)) return [primary];
    const cx = (m.x0 + m.x1) / 2;
    const cy = (m.y0 + m.y1) / 2;
    const SPAN = 1e7; // effectively the full perpendicular extent
    const rect: Bbox = axis === "x"
      ? { x0: cx - ws.tolX, x1: cx + ws.tolX, y0: -SPAN, y1: SPAN }
      : { x0: -SPAN, x1: SPAN, y0: cy - ws.tolY, y1: cy + ws.tolY };
    const ks = brushKeysIn(rect);
    return ks.length ? ks : [primary];
  }

  // Nearest element key within `maxDist` of (x, y) — index-backed when available.
  //
  // Ranks by distance to the mark's true shape (WI-3), not to its box: an
  // edge's distance is to the line rather than to the rectangle its endpoints
  // span, a point inside a filled polygon is at distance zero, and a round mark
  // is measured to the disc. The R-tree still shortlists, since a box distance
  // is never greater than the true distance and so cannot hide anything in
  // range.
  function nearestKeyAt(x: number, y: number, maxDist: number): string | null {
    let best: string | null = null;
    let bestD = maxDist;
    const rank = (e: ElemMeta) => {
      // A graph edge is skipped only when nothing better than its box is
      // available for it — the box being the whole rectangle between its
      // endpoints is exactly why the exclusion existed. With vertices, the
      // distance is to the line and the edge competes on its merits.
      if (e.source != null && !ws.geomByKey[e.key]) return;
      const d = distToElem(x, y, e);
      if (d <= bestD) {
        bestD = d;
        best = e.key;
      }
    };
    if (ws.spatialIndex && !constGrows()) {
      const ids = ws.spatialIndex.neighbors(x, y, PICK_CANDIDATES, maxDist);
      for (let i = 0; i < ids.length; i++) rank(ws.elements[ws.indexToElem[ids[i]]]);
    } else {
      for (let i = 0; i < ws.elements.length; i++) rank(ws.elements[i]);
    }
    return best;
  }

  // Whether a constant-size mark's box can reach past its record box: a panel
  // zoomed out below 1x grows it (VW-47), so the index, built on the record
  // boxes, can no longer prefilter a brush or lasso.
  function constOutgrows(): boolean {
    if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
    return ws.azPanels.some(function (a) { const t = ws.fx.azT(a); return t.sx < 1 || t.sy < 1; });
  }

  // Candidate element positions for a region with bounds `b`: from the index
  // when it can prefilter, else every element; in element order.
  function candidates(b: Bbox): number[] {
    if (!ws.spatialIndex || constOutgrows()) {
      const all: number[] = new Array(ws.elements.length);
      for (let i = 0; i < all.length; i++) all[i] = i;
      return all;
    }
    return ws.spatialIndex.search(b.x0, b.y0, b.x1, b.y1)
      .map((id) => ws.indexToElem[id])
      .sort((a, b) => a - b);
  }

  // Distinct keys whose box intersects `rect` — index-backed when available.
  // Item ids are mapped back to element order and de-duplicated so a key spanning
  // several elements is returned once (parity with the pure `brushKeys`). A
  // constant-size mark under axis zoom is tested at its drawn box, as hover
  // hit-tests it (VW-42), not at its T-scaled record box (VW-47).
  function brushKeysIn(rect: Bbox): string[] {
    const indexed = !!ws.spatialIndex && !constOutgrows();
    const eids = candidates(rect);
    const out: string[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < eids.length; i++) {
      const e = ws.elements[eids[i]];
      if (seen[e.key]) continue;
      const cb = constBox(e);
      // (the index already tested a record box)
      if (cb ? !rectsIntersect(cb, rect) : !hasBbox(e) || (!indexed && !rectsIntersect(e, rect))) continue;
      seen[e.key] = true;
      out.push(e.key);
    }
    return out;
  }

  // Distinct keys whose centre is inside the lasso polygon — index-backed when
  // available (prefilter by the polygon's bounds, then centre-in-polygon). A
  // constant-size mark's centre is its drawn box's (a label's sits off its
  // record box's centre under zoom, VW-47).
  function lassoKeysIn(poly: Pt[]): string[] {
    if (poly.length < 3) return [];
    const eids = candidates(polyBounds(poly));
    const out: string[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < eids.length; i++) {
      const e = ws.elements[eids[i]];
      if (seen[e.key] || !hasBbox(e)) continue;
      const b = constBox(e) || e;
      if (pointInPolygon((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, poly)) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }

  // The brushed keys a brush or lasso may select (VW-19): a connected mark (line,
  // area, multi-segment series) only when the region covers all of it.
  function brushSelectable(keys: string[], region: Bbox | Pt[]): string[] {
    const inside = Array.isArray(region)
      ? function (e: Bbox) { return bboxInPolygon(e, region); }
      : function (e: Bbox) { return bboxInRect(e, region); };
    return dropPartialSeries(ws.elements, keys, inside);
  }

  return { buildSpatialIndex, buildGeometry, distToElem, buildHoverAxis, nearestAxisKey, columnKeys, nearestKeyAt, brushKeysIn, lassoKeysIn, brushSelectable, constBox };
}
