// The marks-only display list (vellum's `scene_display_list()`, VR-14): a
// private vellum -> vellumwidget payload. Raster mode ships it instead of the
// bbox index for the marks it covers. This module decodes it (columnar, base64
// typed arrays) into flat typed arrays, derives each record's device-px bbox,
// and traces a record's exact shape onto a 2D context. No widget state.

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
  record: { kind: DLColumn; paint: DLColumn; key: DLColumn; flags: DLColumn; clip: DLColumn; panel: DLColumn };
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
  };
  clips?: { x0: number[] | number; y0: number[] | number; x1: number[] | number; y1: number[] | number } | null;
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
}

export const DL_POINT = 0;
export const DL_RECT = 1;
export const DL_PATH = 2;

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
  clips: { x0: number; y0: number; x1: number; y1: number }[];
  keys: string[];
  panels: string[];
  exact: boolean; // no record is flagged (every mark is drawn exactly)
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
  if (!raw || raw.format !== "vellum-display-list" || raw.version !== 1) return null;
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
    paints: [], clips: [], keys: [], panels: asColumn(raw.panels).map(String), exact: true
  };
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
  for (let i = 0; i < fill.length; i++) {
    const f = isNa(fill[i]) ? null : String(fill[i]);
    const s = isNa(stroke[i]) ? null : String(stroke[i]);
    const d = isNa(dash[i]) ? null : String(dash[i]).split(",").map(Number).filter((x) => isFinite(x));
    dl.paints.push({
      fill: f, stroke: s, width: Number(sw[i]) || 0, dash: d && d.length ? d : null,
      cap: (cap[i] || "butt") as CanvasLineCap, join: (join[i] || "miter") as CanvasLineJoin,
      opaque: opaqueHex(f) && opaqueHex(s)
    });
  }
  if (raw.clips) {
    const x0 = asColumn(raw.clips.x0), y0 = asColumn(raw.clips.y0), x1 = asColumn(raw.clips.x1), y1 = asColumn(raw.clips.y1);
    for (let i = 0; i < x0.length; i++) dl.clips.push({ x0: x0[i], y0: y0[i], x1: x1[i], y1: y1[i] });
  }
  // Per-record row in its kind's table + bbox.
  let ip = 0, ir = 0, ih = 0;
  for (let i = 0; i < n; i++) {
    if (dl.flags[i]) dl.exact = false;
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
