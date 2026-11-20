// The marks-only display list (vellum's `scene_display_list()`, VR-14): a
// private vellum -> vellumwidget payload. Raster mode ships it instead of the
// bbox index for the marks it covers. This module decodes it (columnar, base64
// typed arrays) into flat typed arrays, derives each record's device-px bbox,
// and traces a record's exact shape onto a 2D context. No widget state.
//
// Version 2 (vellum's `scene_display_list(version = 2)`, VW-23) adds three
// tables, feature-detected here: gradient fills (`gradients`, referred to by
// `paints$fill_gradient`), clip paths (`clip_paths`, by `clips$path_start` /
// `path_n`) and opacity groups (`groups`, by `record$group`). A version-1
// list decodes exactly as before.

import { asColumn } from "./elements";
import type { ElemMeta } from "./types";

// One encoded numeric column: `list(type, n, data | const | seq | rle)`.
export interface DLColumn {
  type: "f32" | "u8" | "u16" | "u32";
  n: number;
  data?: string;
  const?: number;
  seq?: number[];
  rle?: { values: number[] | number; lengths: number[] | number };
}

export interface DLPayload {
  format: string;
  version: number;
  width: number;
  height: number;
  n: number;
  record: { kind: DLColumn; paint: DLColumn; key: DLColumn; flags: DLColumn; clip: DLColumn; panel: DLColumn; group?: DLColumn };
  point: { cx: DLColumn; cy: DLColumn; r: DLColumn; shape: DLColumn };
  rect: { x: DLColumn; y: DLColumn; w: DLColumn; h: DLColumn };
  path: { xy: DLColumn; run_offset: DLColumn; path_offset: DLColumn; closed: DLColumn; evenodd: DLColumn };
  paints: {
    fill: (string | null)[] | string | null;
    stroke: (string | null)[] | string | null;
    stroke_width: number[] | number;
    dash: (string | null)[] | string | null;
    linecap: string[] | string;
    linejoin: string[] | string;
    fill_gradient?: number[] | number;
  };
  clips?: {
    x0: number[] | number; y0: number[] | number; x1: number[] | number; y1: number[] | number;
    path_start?: number[] | number; path_n?: number[] | number;
  } | null;
  gradients?: {
    type: string[] | string;
    x1: number[] | number; y1: number[] | number; x2: number[] | number; y2: number[] | number;
    r1: number[] | number; r2: number[] | number;
    a: number[] | number; b: number[] | number; c: number[] | number; d: number[] | number; e: number[] | number; f: number[] | number;
    stop_offset: number[] | number; stop_pos: number[] | number; stop_color: string[] | string;
  } | null;
  clip_paths?: { xy: DLColumn; run_offset: DLColumn; path_offset: DLColumn; evenodd: DLColumn } | null;
  groups?: { alpha: number[] | number; parent: number[] | number } | null;
  keys: string[] | string | DLColumn;
  panels: string[] | string | null;
}

export interface Paint {
  fill: string | null;
  stroke: string | null;
  width: number;
  dash: number[] | null;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  opaque: boolean; // fill and stroke both fully opaque (safe to batch)
  grad: number; // 1-based into DisplayList.gradients (a gradient fill; `fill` is null), 0 = none
}

// A gradient fill (version 2): geometry in the shape's local px, placed in
// scene device px by `m` (matrix a, b, c, d, e, f). Linear: (x1, y1) ->
// (x2, y2). Radial: focal circle (x1, y1, r1) -> outer circle (x2, y2, r2).
export interface Gradient {
  radial: boolean;
  x1: number; y1: number; x2: number; y2: number; r1: number; r2: number;
  m: number[];
  stops: { o: number; c: string }[];
}

export const DL_POINT = 0;
export const DL_RECT = 1;
export const DL_PATH = 2;
export const DL_FLAG_PICK = 16;

// A decoded display list: per record (paint order) its kind, paint, key,
// flags, clip and panel, the row in its kind's table (`row`), and its bbox.
export interface DisplayList {
  n: number;
  kind: Uint8Array;
  paint: Uint32Array;
  key: Uint32Array;
  flags: Uint8Array;
  clip: Uint32Array; // 1-based into clips, 0 = none
  panel: Uint32Array; // 1-based into panels, 0 = none
  row: Uint32Array;
  bx0: Float32Array; by0: Float32Array; bx1: Float32Array; by1: Float32Array;
  cx: Float32Array; cy: Float32Array; r: Float32Array; shape: Uint8Array;
  rx: Float32Array; ry: Float32Array; rw: Float32Array; rh: Float32Array;
  xy: Float32Array; runOff: Uint32Array; pathOff: Uint32Array; closed: Uint8Array; evenodd: Uint8Array;
  paints: Paint[];
  clips: { x0: number; y0: number; x1: number; y1: number; ps: number; pn: number }[];
  group: Uint32Array; // 1-based into groups (innermost opacity group), 0 = none
  gradients: Gradient[];
  groups: { alpha: number; parent: number }[];
  // clip paths: shapes `clips[c].ps .. ps + pn - 1`, each a range of runs
  cpXy: Float32Array; cpRunOff: Uint32Array; cpPathOff: Uint32Array; cpEvenodd: Uint8Array;
  keys: string[];
  panels: string[];
  exact: boolean; // no record is flagged, pick-only aside (every mark is drawn exactly)
}

function b64bytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// One encoded column -> a typed array of its type.
export function dlColumn(c: DLColumn | null | undefined): Float32Array | Uint8Array | Uint16Array | Uint32Array {
  const n = c ? c.n || 0 : 0;
  const make = (len: number) => {
    const t = c ? c.type : "u32";
    return t === "f32" ? new Float32Array(len) : t === "u8" ? new Uint8Array(len) : t === "u16" ? new Uint16Array(len) : new Uint32Array(len);
  };
  if (!c || !n) return make(0);
  if (c.const != null) { const a = make(n); a.fill(c.const as number); return a; }
  if (c.seq != null) {
    const s = asColumn(c.seq), a = make(n);
    for (let i = 0; i < n; i++) a[i] = s[0] + s[1] * i;
    return a;
  }
  if (c.rle != null) {
    const v = asColumn(c.rle.values), l = asColumn(c.rle.lengths), a = make(n);
    let o = 0;
    for (let i = 0; i < v.length; i++) { a.fill(v[i], o, o + l[i]); o += l[i]; }
    return a;
  }
  const bytes = b64bytes(c.data || "");
  // Copy into a fresh, aligned buffer (little-endian, as every browser is).
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (c.type === "f32") return new Float32Array(buf, 0, n);
  if (c.type === "u16") return new Uint16Array(buf, 0, n);
  if (c.type === "u32") return new Uint32Array(buf, 0, n);
  return new Uint8Array(buf, 0, n);
}

const u32 = (a: ArrayLike<number>): Uint32Array => (a instanceof Uint32Array ? a : Uint32Array.from(a));
const f32 = (a: ArrayLike<number>): Float32Array => (a instanceof Float32Array ? a : Float32Array.from(a));
const u8 = (a: ArrayLike<number>): Uint8Array => (a instanceof Uint8Array ? a : Uint8Array.from(a));

function isNa(s: string | null | undefined): boolean {
  return s == null || s === "NA" || s === "";
}

function opaqueHex(s: string | null): boolean {
  return s == null || !/^#[0-9a-fA-F]{8}$/.test(s) || /ff$/i.test(s);
}

// Decode the payload. Returns null for an unknown format/version.
export function decodeDisplayList(raw: DLPayload | null | undefined): DisplayList | null {
  if (!raw || raw.format !== "vellum-display-list" || (raw.version !== 1 && raw.version !== 2) || !raw.record) return null;
  const n = raw.n || 0;
  const kind = u8(dlColumn(raw.record.kind));
  const pt = raw.point, rc = raw.rect, pa = raw.path;
  const dl: DisplayList = {
    n: n, kind: kind,
    paint: u32(dlColumn(raw.record.paint)), key: u32(dlColumn(raw.record.key)),
    flags: u8(dlColumn(raw.record.flags)), clip: u32(dlColumn(raw.record.clip)),
    panel: u32(dlColumn(raw.record.panel)), row: new Uint32Array(n),
    bx0: new Float32Array(n), by0: new Float32Array(n), bx1: new Float32Array(n), by1: new Float32Array(n),
    cx: f32(dlColumn(pt.cx)), cy: f32(dlColumn(pt.cy)), r: f32(dlColumn(pt.r)), shape: u8(dlColumn(pt.shape)),
    rx: f32(dlColumn(rc.x)), ry: f32(dlColumn(rc.y)), rw: f32(dlColumn(rc.w)), rh: f32(dlColumn(rc.h)),
    xy: f32(dlColumn(pa.xy)), runOff: u32(dlColumn(pa.run_offset)), pathOff: u32(dlColumn(pa.path_offset)),
    closed: u8(dlColumn(pa.closed)), evenodd: u8(dlColumn(pa.evenodd)),
    paints: [], clips: [], keys: [], panels: asColumn(raw.panels).map(String), exact: true,
    group: raw.record.group ? u32(dlColumn(raw.record.group)) : new Uint32Array(n),
    gradients: [], groups: [],
    cpXy: new Float32Array(0), cpRunOff: new Uint32Array(0), cpPathOff: new Uint32Array(0), cpEvenodd: new Uint8Array(0)
  };
  if (dl.group.length !== n) dl.group = new Uint32Array(n);
  // keys: a character vector, or an integer column.
  const k = raw.keys as unknown;
  if (k && typeof k === "object" && !Array.isArray(k) && "type" in (k as object)) {
    const kc = dlColumn(k as DLColumn);
    dl.keys = new Array(kc.length);
    for (let i = 0; i < kc.length; i++) dl.keys[i] = String(kc[i]);
  } else {
    dl.keys = asColumn(raw.keys as string[] | string).map(String);
  }
  const P = raw.paints;
  const fill = asColumn(P.fill), stroke = asColumn(P.stroke), sw = asColumn(P.stroke_width);
  const dash = asColumn(P.dash), cap = asColumn(P.linecap), join = asColumn(P.linejoin);
  const fg = P.fill_gradient != null ? asColumn(P.fill_gradient) : [];
  // Count paints by the longest column: a column of one NA arrives as a bare
  // null (htmlwidgets unboxes length-1 vectors), e.g. every fill a gradient.
  const np = Math.max(fill.length, stroke.length, sw.length, cap.length, join.length, fg.length);
  for (let i = 0; i < np; i++) {
    const f = isNa(fill[i]) ? null : String(fill[i]);
    const s = isNa(stroke[i]) ? null : String(stroke[i]);
    const d = isNa(dash[i]) ? null : String(dash[i]).split(",").map(Number).filter((x) => isFinite(x));
    dl.paints.push({
      fill: f, stroke: s, width: Number(sw[i]) || 0, dash: d && d.length ? d : null,
      cap: (cap[i] || "butt") as CanvasLineCap, join: (join[i] || "miter") as CanvasLineJoin,
      opaque: opaqueHex(f) && opaqueHex(s), grad: Number(fg[i]) || 0
    });
  }
  if (raw.clips) {
    const x0 = asColumn(raw.clips.x0), y0 = asColumn(raw.clips.y0), x1 = asColumn(raw.clips.x1), y1 = asColumn(raw.clips.y1);
    const ps = raw.clips.path_start != null ? asColumn(raw.clips.path_start) : [];
    const pn = raw.clips.path_n != null ? asColumn(raw.clips.path_n) : [];
    for (let i = 0; i < x0.length; i++) dl.clips.push({ x0: x0[i], y0: y0[i], x1: x1[i], y1: y1[i], ps: Number(ps[i]) || 0, pn: Number(pn[i]) || 0 });
  }
  const G = raw.gradients;
  if (G && G.type != null) {
    const col = (v: number[] | number) => asColumn(v).map(Number);
    const ty = asColumn(G.type), x1 = col(G.x1), y1 = col(G.y1), x2 = col(G.x2), y2 = col(G.y2), r1 = col(G.r1), r2 = col(G.r2);
    const a = col(G.a), b = col(G.b), c = col(G.c), d = col(G.d), e = col(G.e), f = col(G.f);
    const so = col(G.stop_offset), sp = col(G.stop_pos), sc = asColumn(G.stop_color).map(String);
    for (let i = 0; i < ty.length; i++) {
      const stops: { o: number; c: string }[] = [];
      for (let k = so[i]; k < so[i + 1]; k++) stops.push({ o: sp[k], c: sc[k] });
      dl.gradients.push({ radial: ty[i] === "radial", x1: x1[i], y1: y1[i], x2: x2[i], y2: y2[i], r1: r1[i], r2: r2[i],
        m: [a[i], b[i], c[i], d[i], e[i], f[i]], stops: stops });
    }
  }
  if (raw.groups && raw.groups.alpha != null) {
    const al = asColumn(raw.groups.alpha), par = asColumn(raw.groups.parent);
    for (let i = 0; i < al.length; i++) dl.groups.push({ alpha: Number(al[i]), parent: Number(par[i]) || 0 });
  }
  if (raw.clip_paths) {
    dl.cpXy = f32(dlColumn(raw.clip_paths.xy)); dl.cpRunOff = u32(dlColumn(raw.clip_paths.run_offset));
    dl.cpPathOff = u32(dlColumn(raw.clip_paths.path_offset)); dl.cpEvenodd = u8(dlColumn(raw.clip_paths.evenodd));
  }
  // A paint, clip or group the list refers to but did not ship (a malformed
  // or truncated list) can't be drawn: treat its records as flagged.
  for (let i = 0; i < dl.paints.length; i++) if (dl.paints[i].grad > dl.gradients.length) dl.paints[i].grad = -1;
  // Per-record row in its kind's table + bbox.
  let ip = 0, ir = 0, ih = 0;
  for (let i = 0; i < n; i++) {
    // Pick-only records (16) paint nothing, so they don't make the list inexact.
    if (dl.flags[i] & ~DL_FLAG_PICK) dl.exact = false;
    const pg = dl.paints[dl.paint[i]];
    if ((pg && pg.grad < 0) || dl.group[i] > dl.groups.length) { dl.flags[i] |= 1; dl.exact = false; }
    const kd = kind[i];
    if (kd === DL_POINT) {
      const j = ip++, r = dl.r[j];
      dl.row[i] = j;
      dl.bx0[i] = dl.cx[j] - r; dl.bx1[i] = dl.cx[j] + r;
      dl.by0[i] = dl.cy[j] - r; dl.by1[i] = dl.cy[j] + r;
    } else if (kd === DL_RECT) {
      const j = ir++;
      dl.row[i] = j;
      const x = dl.rx[j], y = dl.ry[j], w = dl.rw[j], h = dl.rh[j];
      dl.bx0[i] = Math.min(x, x + w); dl.bx1[i] = Math.max(x, x + w);
      dl.by0[i] = Math.min(y, y + h); dl.by1[i] = Math.max(y, y + h);
    } else {
      const j = ih++;
      dl.row[i] = j;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const v0 = dl.runOff[dl.pathOff[j]], v1 = dl.runOff[dl.pathOff[j + 1]];
      for (let v = v0; v < v1; v++) {
        const x = dl.xy[2 * v], y = dl.xy[2 * v + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      dl.bx0[i] = x0; dl.by0[i] = y0; dl.bx1[i] = x1; dl.by1[i] = y1;
    }
  }
  return dl;
}

// Give every element the display list covers, and that arrived without a
// bbox, the union of its records' bboxes (R drops those bboxes from the
// payload: the list carries strictly more). Returns how many were filled.
export function fillBboxes(elements: ElemMeta[], dl: DisplayList): number {
  const box: Record<string, number[]> = {};
  for (let i = 0; i < dl.n; i++) {
    const k = dl.keys[dl.key[i]];
    if (k == null || !isFinite(dl.bx0[i])) continue;
    const b = box[k];
    if (!b) box[k] = [dl.bx0[i], dl.by0[i], dl.bx1[i], dl.by1[i]];
    else {
      if (dl.bx0[i] < b[0]) b[0] = dl.bx0[i]; if (dl.by0[i] < b[1]) b[1] = dl.by0[i];
      if (dl.bx1[i] > b[2]) b[2] = dl.bx1[i]; if (dl.by1[i] > b[3]) b[3] = dl.by1[i];
    }
  }
  let filled = 0;
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    if (e.x0 != null && e.y0 != null && e.x1 != null && e.y1 != null) continue;
    const b = box[e.key];
    if (!b) continue;
    e.x0 = b[0]; e.y0 = b[1]; e.x1 = b[2]; e.y1 = b[3];
    filled++;
  }
  return filled;
}

// An affine map from scene device px to canvas px: X = ax*x + bx, Y = ay*y + by.
export interface Affine { ax: number; bx: number; ay: number; by: number; }

// The marker ring for a shape code (vellum's `points_grob()` markers), as
// offsets from the centre in units of r. Circle (0) and the line glyphs
// plus (4) / cross (5) are traced separately.
const S3 = 0.8660254037844386;
const MARKER: Record<number, number[]> = {
  1: [-1, -1, 1, -1, 1, 1, -1, 1],
  2: [0, -1, S3, 0.5, -S3, 0.5],
  3: [0, -1, 1, 0, 0, 1, -1, 0],
  6: [0, 1, S3, -0.5, -S3, -0.5],
  7: (function () {
    const o: number[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 === 0 ? 1 : 0.382;
      o.push(rad * Math.cos(a), rad * Math.sin(a));
    }
    return o;
  })()
};

// A marker shape's ring offsets (units of r), or undefined for the circle and
// the line glyphs.
export function markerRing(shape: number): number[] | undefined {
  return MARKER[shape];
}

// Is a marker shape a stroke-only line glyph (plus / cross)?
export function isLineGlyph(shape: number): boolean {
  return shape === 4 || shape === 5;
}

// Trace a point marker at canvas centre (x, y) with canvas radius r into the
// current path (no beginPath: callers batch several markers into one path).
export function tracePoint(ctx: CanvasRenderingContext2D, shape: number, x: number, y: number, r: number): void {
  if (shape === 0 || (!MARKER[shape] && !isLineGlyph(shape))) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 6.283185307179586);
    return;
  }
  if (shape === 4) {
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    return;
  }
  if (shape === 5) {
    const d = r * Math.SQRT1_2;
    ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
    ctx.moveTo(x - d, y + d); ctx.lineTo(x + d, y - d);
    return;
  }
  const m = MARKER[shape];
  ctx.moveTo(x + m[0] * r, y + m[1] * r);
  for (let i = 2; i < m.length; i += 2) ctx.lineTo(x + m[i] * r, y + m[i + 1] * r);
  ctx.closePath();
}

// Trace a rect or path record through `A` into the current path.
export function traceShape(ctx: CanvasRenderingContext2D, dl: DisplayList, i: number, A: Affine): void {
  const j = dl.row[i];
  if (dl.kind[i] === DL_RECT) {
    const x0 = A.ax * dl.rx[j] + A.bx, y0 = A.ay * dl.ry[j] + A.by;
    ctx.rect(x0, y0, A.ax * dl.rw[j], A.ay * dl.rh[j]);
    return;
  }
  const r0 = dl.pathOff[j], r1 = dl.pathOff[j + 1], closed = dl.closed[j] === 1;
  for (let run = r0; run < r1; run++) {
    const v0 = dl.runOff[run], v1 = dl.runOff[run + 1];
    for (let v = v0; v < v1; v++) {
      const x = A.ax * dl.xy[2 * v] + A.bx, y = A.ay * dl.xy[2 * v + 1] + A.by;
      if (v === v0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (closed) ctx.closePath();
  }
}

// Trace clip-path shape `shape` (an index into the clip-path table) through `A`.
export function traceClipPath(ctx: CanvasRenderingContext2D, dl: DisplayList, shape: number, A: Affine): void {
  for (let run = dl.cpPathOff[shape]; run < dl.cpPathOff[shape + 1]; run++) {
    const v0 = dl.cpRunOff[run], v1 = dl.cpRunOff[run + 1];
    for (let v = v0; v < v1; v++) {
      const x = A.ax * dl.cpXy[2 * v] + A.bx, y = A.ay * dl.cpXy[2 * v + 1] + A.by;
      if (v === v0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

// Fill the current path with gradient `g`, placed through `A` (scene px ->
// canvas px). The path was traced in canvas px; a canvas paint is interpreted
// in the transform current at fill time, so the gradient is built in its own
// local px under A * m and the path is unaffected.
export function fillGradient(ctx: CanvasRenderingContext2D, g: Gradient, A: Affine, rule: CanvasFillRule, override?: string | null): void {
  ctx.save();
  ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
  ctx.transform(g.m[0], g.m[1], g.m[2], g.m[3], g.m[4], g.m[5]);
  let paint: string | CanvasGradient;
  if (override) paint = override;
  else {
    const cg = g.radial ? ctx.createRadialGradient(g.x1, g.y1, g.r1, g.x2, g.y2, g.r2) : ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
    for (let k = 0; k < g.stops.length; k++) cg.addColorStop(Math.min(1, Math.max(0, g.stops[k].o)), g.stops[k].c);
    paint = cg;
  }
  ctx.fillStyle = paint;
  ctx.fill(rule);
  ctx.restore();
}
