// Pure geometry helpers: bbox tests, true-geometry distances (picking), and
// bbox unions. No widget state.

import type { Bbox, ElemMeta } from "./types";

// ---- pure geometry helpers (exposed on window.__vellumwidgetTest for headless tests) ----

export function rectsIntersect(a: Bbox, b: Bbox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// Euclidean distance from a point to a bbox (0 when inside).
export function distToBbox(x: number, y: number, b: Bbox): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.sqrt(dx * dx + dy * dy);
}

export function hasBbox(e: ElemMeta): e is ElemMeta & Bbox {
  return typeof e.x0 === "number" && typeof e.y0 === "number";
}

// ---- true-geometry picking -------------------------------------------------
//
// A bbox is the right answer for a rectangular brush and the wrong one for
// picking: a rising line's box is the whole rectangle its endpoints span, so a
// box-distance "nearest" matches it from anywhere inside that rectangle. The
// payload's `geometry` block carries each keyed element's real vertices (device
// px, same space as the boxes), so distances can be measured to the shape.

// The payload's columnar geometry block (see .vellumwidget_geometry() in R).
export interface GeometryPayload {
  key: string[] | string;
  kind: string[] | string;
  n: number[] | number;
  x: number[] | number;
  y: number[] | number;
  // Ring boundaries of multi-ring paths: `nr` is the ring count per element,
  // `rl` the flat run of ring lengths (vertex counts). Both absent in an older
  // payload, or when every element is a single ring.
  nr?: number[] | number;
  rl?: number[] | number;
  // Per element, 1 when it is filled under the even-odd rule. Absent when no
  // element is (nonzero, the engine's default) or from an older engine.
  eo?: number[] | number;
  // 1 when the keys the raster display list draws exactly were left out: the
  // runtime takes their shapes from the list's path records (VW-49).
  dl?: number;
}

// One geometry element, as a slice of the flat coordinate arrays.
export interface Geom {
  kind: string;
  at: number; // index of its first vertex in gx/gy
  n: number; // vertex count
  rings?: number[]; // per-ring vertex counts of a multi-ring path (sum = n)
  evenodd?: boolean; // filled under the even-odd rule (else nonzero winding)
}

// Is this mark kind round, so that its bbox describes a disc rather than a box?
// `scene_model()`'s `mark` vocabulary, tolerating both spellings.
export function isRoundMark(mark: string | undefined): boolean {
  return mark === "point" || mark === "points" || mark === "circle" || mark === "circles";
}

// Squared distance from (x, y) to the segment (ax, ay)-(bx, by).
export function distToSegment2(
  x: number, y: number, ax: number, ay: number, bx: number, by: number
): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
  return dx * dx + dy * dy;
}

// Distance from (x, y) to one geometry element, measured by kind.
//
//   point            distance to the centre, minus the mark's radius (taken from
//                    its bbox, since the geometry carries the centre only) --
//                    zero anywhere on the glyph
//   segment / line   perpendicular distance to the nearest edge of the polyline
//   polygon / path / zero anywhere INSIDE (by the fill rule), else distance to
//   hexagon / sector the nearest edge, so clicking the middle of a choropleth
//                    region hits the region
//   rect/text/       distance to the box the two vertices span (which for a label
//   roundrect        is a fair description of the target)
//
// A multi-ring path (a polygon with holes, a multipolygon) is measured ring by
// ring, using the boundaries `element_geometry()` ships in its `ring` column,
// and "inside" follows the element's fill rule across all of its rings.
export function distToGeom(
  x: number, y: number, g: Geom, gx: Float64Array, gy: Float64Array, box: Bbox | null
): number {
  const at = g.at, n = g.n;
  if (n <= 0) return Infinity;
  if (g.kind === "point") {
    const dx = x - gx[at], dy = y - gy[at];
    const d = Math.sqrt(dx * dx + dy * dy);
    // Half the bbox's smaller side is the glyph's radius; without a box, the
    // centre itself is the best available answer.
    const r = box ? Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2 : 0;
    return d > r ? d - r : 0;
  }
  if (n === 1) {
    const dx = x - gx[at], dy = y - gy[at];
    return Math.sqrt(dx * dx + dy * dy);
  }
  if (g.kind === "rect" || g.kind === "text" || g.kind === "roundrect") {
    return distToBbox(x, y, {
      x0: Math.min(gx[at], gx[at + 1]), x1: Math.max(gx[at], gx[at + 1]),
      y0: Math.min(gy[at], gy[at + 1]), y1: Math.max(gy[at], gy[at + 1])
    });
  }
  const closed = g.kind === "polygon" || g.kind === "path" || g.kind === "hexagon" || g.kind === "sector";
  // Rings are measured SEPARATELY. Joining them into one run would invent a
  // phantom edge from each ring's last vertex to the next ring's first, and
  // close the last ring back to the very first vertex. `rings` is absent for a
  // single-ring element, which the whole run already describes.
  const rings = g.rings || [n];
  // The engine's rule (vellum's `pick_table`): containment is decided ONCE
  // across all rings under the fill rule the element is painted with --
  // even-odd parity of the crossings, or a nonzero sum of signed windings --
  // so a point in a hole is not a hit. Inside is 0; otherwise the distance is
  // to the nearest edge of any ring, each ring closing on itself.
  let best = Infinity;
  let cross = 0; // even-odd: crossings over every ring
  let wind = 0; // nonzero: signed winding number over every ring
  let ra = at;
  for (let r = 0; r < rings.length; r++) {
    const rn = rings[r] | 0;
    if (rn <= 0) continue;
    if (closed && rn >= 3) {
      for (let i = 0, j = rn - 1; i < rn; j = i++) {
        const xi = gx[ra + i], yi = gy[ra + i];
        const xj = gx[ra + j], yj = gy[ra + j];
        if ((yi > y) !== (yj > y)) {
          if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) cross++;
          // Winding: an upward edge (j -> i) with the point on its left adds
          // one, a downward edge with the point on its right subtracts one.
          const side = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
          if (yi > yj) { if (side > 0) wind++; } else if (side < 0) wind--;
        }
      }
    }
    for (let i = 1; i < rn; i++) {
      const d2 = distToSegment2(x, y, gx[ra + i - 1], gy[ra + i - 1], gx[ra + i], gy[ra + i]);
      if (d2 < best) best = d2;
    }
    if (closed && rn >= 3) {
      const d2 = distToSegment2(x, y, gx[ra + rn - 1], gy[ra + rn - 1], gx[ra], gy[ra]);
      if (d2 < best) best = d2;
    }
    ra += rn;
  }
  if (closed && (g.evenodd ? (cross & 1) === 1 : wind !== 0)) return 0;
  return Math.sqrt(best);
}

// Union bbox of the given keys' elements (for zoom-to-selection), or null.
export function unionBbox(elems: ElemMeta[], keys: Record<string, boolean>): Bbox | null {
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

// ---- SVG transform lists (VW-41) -------------------------------------------
//
// vellum places a rotated label with a transform LIST, `matrix(...) rotate(a
// cx cy)`. Code that restates a node's transform (as a CSS transform, or to
// find its anchor) has to compose the whole list, or the rotation is lost.

export type Affine6 = [number, number, number, number, number, number];

function mul6(m: Affine6, n: Affine6): Affine6 {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

// An SVG `transform` attribute composed into one affine (a, b, c, d, e, f),
// applied right to left as SVG does. `null` for an empty attribute or one this
// can't read (an unknown function, a non-finite number).
export function parseTransformList(t: string | null | undefined): Affine6 | null {
  const s = (t || "").trim();
  if (!s) return null;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: Affine6 = [1, 0, 0, 1, 0, 0];
  let any = false, rest = s, f: RegExpExecArray | null;
  while ((f = re.exec(s)) !== null) {
    rest = rest.replace(f[0], "");
    const v = f[2].trim() === "" ? [] : f[2].trim().split(/[\s,]+/).map(Number);
    if (v.some((x) => !isFinite(x))) return null;
    let n: Affine6;
    switch (f[1]) {
      case "matrix":
        if (v.length !== 6) return null;
        n = [v[0], v[1], v[2], v[3], v[4], v[5]];
        break;
      case "translate":
        if (v.length < 1 || v.length > 2) return null;
        n = [1, 0, 0, 1, v[0], v.length > 1 ? v[1] : 0];
        break;
      case "scale":
        if (v.length < 1 || v.length > 2) return null;
        n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
        break;
      case "rotate": {
        if (v.length !== 1 && v.length !== 3) return null;
        const r = (v[0] * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
        const cx = v.length === 3 ? v[1] : 0, cy = v.length === 3 ? v[2] : 0;
        // translate(cx, cy) rotate(a) translate(-cx, -cy)
        n = [co, si, -si, co, cx - co * cx + si * cy, cy - si * cx - co * cy];
        break;
      }
      case "skewX":
        if (v.length !== 1) return null;
        n = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        if (v.length !== 1) return null;
        n = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    m = mul6(m, n);
    any = true;
  }
  if (!any || rest.replace(/[\s,]/g, "") !== "") return null;
  return m;
}

// A point through an affine.
export function applyAffine6(m: Affine6, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
