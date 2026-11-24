// Path records as a triangle mesh for the WebGL painter (F-29, phase B).
//
// A path's fill is triangulated once, here, in scene px (earcut; its rings
// nested into outer rings and holes by containment, which serves both the
// even-odd and the non-zero rule for the shapes vellum emits: simple rings
// whose holes run inside their outer ring).
//
// A stroke is a quad per segment whose corners the vertex shader pushes out
// in canvas px, so the line keeps its pixel width under any zoom, as the
// canvas's lineWidth does: each corner carries its anchor, the segment's other
// end and the neighbour beyond the anchor (for the miter join), and which
// side it is on. An open path's ends get the paint's cap (butt, square, or
// round, cut to a circle in the fragment shader).
//
// Records are meshed in paint order, a record's fill before its stroke, as
// the canvas paints them.

import earcut from "earcut";
import type { DisplayList } from "../dlist";
import { DL_PATH } from "../dlist";

// Vertex layout (floats): anchor xy, other end xy, neighbour xy, side, width.
export const MESH_F = 8;
// Mesh vertices one list may have; above it the list stays on the canvas.
export const GL_MAX_MESH_VERTS = 4000000;

// meta bytes per vertex: [mode | flags << 1, end, panel slot, clip slot].
// mode 0 = fill vertex, 1 = stroke corner. flags: 1 round cap at the
// segment's start, 2 round cap at its end, 4 square cap at its start, 8
// square cap at its end. end: 0 = the corner sits at the segment's start, 1 at
// its end.
export interface GLMesh {
  nv: number;
  ni: number;
  v: Float32Array;
  meta: Uint8Array;
  idx: Uint32Array;
  // per vertex: its record, and 1 when it paints the stroke (else the fill)
  rec: Uint32Array;
  stroke: Uint8Array;
  // each meshed record's index range [first, end), for batching
  recRange: Map<number, [number, number]>;
}

// The rings of path record i, as flat xy arrays (consecutive duplicate
// vertices dropped).
function rings(dl: DisplayList, i: number): number[][] {
  const j = dl.row[i], out: number[][] = [];
  for (let run = dl.pathOff[j]; run < dl.pathOff[j + 1]; run++) {
    const r: number[] = [];
    for (let v = dl.runOff[run]; v < dl.runOff[run + 1]; v++) {
      const x = dl.xy[2 * v], y = dl.xy[2 * v + 1];
      const n = r.length;
      if (n && r[n - 2] === x && r[n - 1] === y) continue;
      r.push(x, y);
    }
    if (r.length >= 4) out.push(r);
  }
  return out;
}

function inRing(x: number, y: number, r: number[]): boolean {
  let inside = false;
  for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
    const xa = r[a], ya = r[a + 1], xb = r[b], yb = r[b + 1];
    if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// Triangles (flat xy, and indices into it) filling the rings: each ring at
// an even nesting depth is an outer ring, with the rings directly inside it
// as its holes.
export function fillTriangles(rs: number[][]): { xy: number[]; idx: number[] } {
  const xy: number[] = [], idx: number[] = [];
  const n = rs.length;
  if (!n) return { xy: xy, idx: idx };
  const depth = new Array(n).fill(0), parent = new Array(n).fill(-1);
  if (n > 1 && n <= 200) {
    for (let a = 0; a < n; a++) {
      let best = -1;
      for (let b = 0; b < n; b++) {
        if (a === b || !inRing(rs[a][0], rs[a][1], rs[b])) continue;
        depth[a]++;
        if (best < 0 || inRing(rs[b][0], rs[b][1], rs[best])) best = b;
      }
      parent[a] = best;
    }
  }
  for (let o = 0; o < n; o++) {
    if (depth[o] % 2) continue;
    const data = rs[o].slice(), holes: number[] = [];
    for (let h = 0; h < n; h++) {
      if (parent[h] !== o || depth[h] % 2 === 0) continue;
      holes.push(data.length / 2);
      for (let k = 0; k < rs[h].length; k++) data.push(rs[h][k]);
    }
    const tri = earcut(data, holes.length ? holes : undefined, 2);
    const base = xy.length / 2;
    for (let k = 0; k < data.length; k++) xy.push(data[k]);
    for (let k = 0; k < tri.length; k++) idx.push(base + tri[k]);
  }
  return { xy: xy, idx: idx };
}

// How many mesh vertices record i needs (fill + stroke), for the size check.
export function meshVerts(dl: DisplayList, i: number): number {
  const j = dl.row[i], pt = dl.paints[dl.paint[i]];
  let n = 0, segs = 0;
  for (let run = dl.pathOff[j]; run < dl.pathOff[j + 1]; run++) {
    const k = dl.runOff[run + 1] - dl.runOff[run];
    n += k;
    segs += dl.closed[j] === 1 ? k : Math.max(0, k - 1);
  }
  const fill = dl.closed[j] === 1 && pt.fill != null ? n : 0;
  const stroke = pt.stroke != null && pt.width > 0 ? 4 * segs : 0;
  return fill + stroke;
}

// The mesh of the path records among `order` (record indices in draw order),
// skipping flagged records.
export function glMesh(dl: DisplayList, order: ArrayLike<number>): GLMesh {
  const V: number[] = [], M: number[] = [], I: number[] = [], R: number[] = [], S: number[] = [];
  const recRange = new Map<number, [number, number]>();
  const np = dl.panels.length;
  const vert = function (ax: number, ay: number, qx: number, qy: number, nx: number, ny: number, side: number, w: number,
    mode: number, end: number, panel: number, clip: number, rec: number, isStroke: number): number {
    V.push(ax, ay, qx, qy, nx, ny, side, w);
    M.push(mode, end, panel, clip);
    R.push(rec); S.push(isStroke);
    return R.length - 1;
  };
  for (let q = 0; q < order.length; q++) {
    const i = order[q];
    if (dl.flags[i] || dl.kind[i] !== DL_PATH) continue;
    const j = dl.row[i], pt = dl.paints[dl.paint[i]];
    const panel = dl.panel[i] <= np ? dl.panel[i] : 0, clip = dl.clip[i];
    const rs = rings(dl, i);
    const first = I.length;
    const closed = dl.closed[j] === 1;
    if (closed && pt.fill != null) {
      const t = fillTriangles(rs);
      const base = R.length;
      for (let k = 0; k < t.xy.length; k += 2) vert(t.xy[k], t.xy[k + 1], t.xy[k], t.xy[k + 1], t.xy[k], t.xy[k + 1], 0, 0, 0, 0, panel, clip, i, 0);
      for (let k = 0; k < t.idx.length; k++) I.push(base + t.idx[k]);
    }
    if (pt.stroke == null || !(pt.width > 0)) { recRange.set(i, [first, I.length]); continue; }
    const capF = pt.cap === "round" ? 1 : pt.cap === "square" ? 4 : 0;
    for (const r of rs) {
      const nPts = r.length / 2;
      // a closed ring repeating its first vertex at the end: drop the repeat
      let m = nPts;
      if (closed && m > 2 && r[0] === r[2 * (m - 1)] && r[1] === r[2 * (m - 1) + 1]) m--;
      const nSeg = closed ? m : m - 1;
      for (let s = 0; s < nSeg; s++) {
        const a = s, b = (s + 1) % m;
        const ax = r[2 * a], ay = r[2 * a + 1], bx = r[2 * b], by = r[2 * b + 1];
        // the neighbour beyond each end (the end itself where the path ends)
        const hasPrev = closed || s > 0, hasNext = closed || s < nSeg - 1;
        const pa = hasPrev ? (a - 1 + m) % m : a, nb = hasNext ? (b + 1) % m : b;
        const px = r[2 * pa], py = r[2 * pa + 1], nx = r[2 * nb], ny = r[2 * nb + 1];
        // caps at the path's open ends
        let flags = 0;
        if (!hasPrev) flags |= capF;
        if (!hasNext) flags |= capF << 1;
        const mode = 1 | (flags << 1);
        const w = pt.width;
        const v0 = vert(ax, ay, bx, by, px, py, -1, w, mode, 0, panel, clip, i, 1);
        const v1 = vert(ax, ay, bx, by, px, py, 1, w, mode, 0, panel, clip, i, 1);
        const v2 = vert(bx, by, ax, ay, nx, ny, -1, w, mode, 1, panel, clip, i, 1);
        const v3 = vert(bx, by, ax, ay, nx, ny, 1, w, mode, 1, panel, clip, i, 1);
        I.push(v0, v1, v2, v1, v3, v2);
      }
    }
    recRange.set(i, [first, I.length]);
  }
  return {
    nv: R.length, ni: I.length,
    v: Float32Array.from(V), meta: Uint8Array.from(M), idx: Uint32Array.from(I),
    rec: Uint32Array.from(R), stroke: Uint8Array.from(S), recRange: recRange
  };
}
