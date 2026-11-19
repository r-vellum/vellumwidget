// Spatial queries over the element table: brush / lasso membership, nearest
// mark, and sorted-column lookups. No widget state.

import { distToBbox, hasBbox, rectsIntersect } from "./geometry";
import type { Bbox, ElemMeta } from "./types";

// Distinct keys of every element whose bbox intersects the brush rectangle. A key
// that spans several elements (an error bar's segments, a box's rect + whiskers)
// is returned once, so the brush key list and the `_brush` Shiny event never
// over-count a multi-element mark.
export function brushKeys(elems: ElemMeta[], brush: Bbox): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < elems.length; i++) {
    const e = elems[i];
    if (hasBbox(e) && rectsIntersect(e, brush) && !seen[e.key]) {
      seen[e.key] = true;
      out.push(e.key);
    }
  }
  return out;
}

// Is (x, y) inside the polygon? Ray-casting (even-odd rule); `poly` is an ordered
// ring of vertices, the last implicitly joined to the first.
export interface Pt { x: number; y: number; }
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Distinct keys of every element whose bbox *centre* falls inside the lasso
// polygon. Centre-in-polygon (not full-bbox containment) matches how a lasso
// picks points and keeps a multi-element mark counted once.
export function lassoKeys(elems: ElemMeta[], poly: Pt[]): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  if (poly.length < 3) return out;
  for (let i = 0; i < elems.length; i++) {
    const e = elems[i];
    if (!hasBbox(e) || seen[e.key]) continue;
    if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
      seen[e.key] = true;
      out.push(e.key);
    }
  }
  return out;
}

// Axis-aligned bounds of a polygon (for prefiltering candidates via the index).
export function polyBounds(poly: Pt[]): Bbox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    if (poly[i].x < x0) x0 = poly[i].x;
    if (poly[i].y < y0) y0 = poly[i].y;
    if (poly[i].x > x1) x1 = poly[i].x;
    if (poly[i].y > y1) y1 = poly[i].y;
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

// Key of the element nearest (x, y) within `maxDist`, else null.
export function nearestKey(elems: ElemMeta[], x: number, y: number, maxDist: number): string | null {
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

// Index (into a coordinate array sorted ascending) of the value nearest `target`,
// by binary search — the seed for unified hover when the cursor is not over a mark
// (nearest on one axis only, so the shared readout appears anywhere along the
// perpendicular). Returns -1 for an empty array.
export function nearestSortedIdx(sorted: number[] | Float64Array, target: number): number {
  const n = sorted.length;
  if (!n) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first index >= target; compare it with its predecessor.
  if (lo > 0 && Math.abs(sorted[lo - 1] - target) <= Math.abs(sorted[lo] - target)) return lo - 1;
  return lo;
}

// Half the smallest positive gap between distinct sorted coordinates — the
// tolerance for grouping marks into one x- (or y-) column for unified hover:
// wide enough to catch a column's marks (which share a position, so gap ~0),
// narrow enough to exclude the neighbouring column. Falls back to 1 (user unit)
// when there are fewer than two distinct positions.
export function columnTolerance(sorted: number[] | Float64Array): number {
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > 1e-6 && g < minGap) minGap = g;
  }
  return isFinite(minGap) ? minGap / 2 : 1;
}
