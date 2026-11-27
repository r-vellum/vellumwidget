// Payload normalisation: the R side ships columnar element / panel tables that
// htmlwidgets may auto-unbox; these turn them into plain per-element records.

import type { ColumnElements, ElemMeta, PanelInfo } from "./types";

// Read a payload column as an array: htmlwidgets auto-unboxes a length-1 vector to
// a scalar, so wrap those back into a one-element array; `null`/absent -> `[]`.
export function asColumn<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// One encoded numeric column: `list(type, n, data | const | seq | rle)`.
export interface DLColumn {
  type: "f32" | "u8" | "u16" | "u24" | "u32";
  n: number;
  data?: string;
  // Quantised coordinates (VR-18): value i is `lo + u[i] * step`, `u` the
  // little-endian unsigned integers of the type's width in `data`.
  lo?: number;
  step?: number;
  bits?: number; // bit-packed `data`: each value in `bits` bits, LSB first (VW-38)
  const?: number;
  seq?: number[];
  rle?: { values: number[] | number; lengths: number[] | number };
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
  if (c.step != null) {
    // Quantised coordinates (VR-18): integers of 1, 2 or 3 bytes on the grid
    // `lo + u * step`, decoded to floats (computed in f64, stored as f32).
    const w = c.type === "u8" ? 1 : c.type === "u16" ? 2 : 3;
    const lo = Number(c.lo) || 0, step = Number(c.step), a = new Float32Array(n);
    if (w === 1) for (let i = 0; i < n; i++) a[i] = lo + bytes[i] * step;
    else if (w === 2) for (let i = 0, p = 0; i < n; i++, p += 2) a[i] = lo + (bytes[p] | (bytes[p + 1] << 8)) * step;
    else for (let i = 0, p = 0; i < n; i++, p += 3) a[i] = lo + (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)) * step;
    return a;
  }
  if (c.bits) {
    const k = Number(c.bits), a = make(n);
    let pos = 0;
    if (k <= 24) {
      // A 32-bit window holds any value of up to 24 bits at any bit offset.
      const mask = (1 << k) - 1;
      for (let i = 0; i < n; i++, pos += k) {
        const o = pos >> 3;
        a[i] = ((bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> (pos & 7)) & mask;
      }
      return a;
    }
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let b = 0; b < k; b++, pos++) if (bytes[pos >> 3] & (1 << (pos & 7))) v += 2 ** b;
      a[i] = v;
    }
    return a;
  }
  // Copy into a fresh, aligned buffer (little-endian, as every browser is).
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (c.type === "f32") return new Float32Array(buf, 0, n);
  if (c.type === "u16") return new Uint16Array(buf, 0, n);
  if (c.type === "u32") return new Uint32Array(buf, 0, n);
  return new Uint8Array(buf, 0, n);
}

// A column in the compact wire encoding (raster mode, `.encode_elements()` in R):
// a sparse `{at, v}` (0-based indices that carry a value, and the values) or a
// dictionary `{levels, codes}` (each level once, a 0-based code per element,
// `null` for none). The dictionary's codes may come as runs (`rv`, `rl`) or,
// VW-38, as a typed column `cb` of code + 1 (0 = none). A string column of
// mostly distinct values that share a few shapes may come as a template
// column (`TemplateColumn`).
interface SparseColumn<T> {
  at: number[] | number;
  v: T[] | T;
}
interface DictColumn<T> {
  levels: T[] | T;
  codes?: (number | null)[] | number | null;
  rv?: number[] | number; // run-length form: run codes (-1 = none) ...
  rl?: number[] | number; // ... and run lengths
  cb?: DLColumn; // typed form: code + 1 per element, 0 = none (VW-38)
}
// VW-38: each string is a template with integer slots. `tpl` holds each
// template's literal parts (one more than its slots), `tc` the template per
// element (a typed column, template index + 1, 0 = none), and `tn` one number
// stream per slot position: `"key"` (the element key's trailing integer, as
// text), `{d}` (a first value and differences) or `{v}` (the values), each
// listing, in element order, the elements whose template has that slot.
interface TemplateColumn {
  tpl: (string[] | string)[] | string;
  tc: DLColumn;
  tn: (string | TemplateStream)[] | string | TemplateStream;
}
// One number stream of a template: differences (`d`) or values (`v`); with
// `w` (VW-40), the digit runs had leading zeros: pad each to `w` digits (one
// width for all, or a typed column of one per value).
// The differences or values may also come binary (VW-40): `db`/`dx`/`dv` as
// for the keys (see `decodeDeltas`), or `vb`, a typed column of the values.
interface TemplateStream {
  d?: number[] | number; v?: number[] | number; w?: number | DLColumn;
  key?: number; // the element key's integer, zero-padded to `w` (VW-40)
  db?: DLColumn; dx?: number[] | number; dv?: number[] | number; vb?: DLColumn;
}

// Integer differences as JSON (`delta` / `d`) or (VW-40) as a typed column
// `db` whose entries at the 0-based positions `dx` are replaced by `dv`.
function decodeDeltas(db: DLColumn | undefined, dx: unknown, dv: unknown, json: unknown): ArrayLike<number> {
  if (db == null) return asColumn(json as number[] | number);
  const d = Float64Array.from(dlColumn(db)), at = asColumn(dx as number[] | number), val = asColumn(dv as number[] | number);
  for (let k = 0; k < at.length; k++) d[at[k]] = val[k];
  return d;
}
export type EncodedColumn<T> = T[] | T | SparseColumn<T> | DictColumn<T> | TemplateColumn | null | undefined;

// The trailing integer of a key, as `.encode_keys()` reads it in R.
const KEY_INT = /(0|[1-9][0-9]{0,14})$/;

function decodeTemplate(o: TemplateColumn, n: number, keys: string[] | undefined): (string | null)[] {
  const tpl = asColumn(o.tpl as (string[] | string)[]).map((p) => asColumn(p).map(String));
  const tc = dlColumn(o.tc);
  // Per stream: the decoded numbers, or null to read the key's integer
  // (padded to `keyW[j]` when set).
  const keyW: ((i: number) => number)[] = [];
  const streams = asColumn(o.tn as unknown[]).map((st, j) => {
    if (st === "key") return null; // read from the key
    const s = st as TemplateStream;
    if (s.key != null) {
      const wc = typeof s.w === "object" ? dlColumn(s.w as DLColumn) : null, w0 = Number(s.w) || 0;
      let k = 0;
      keyW[j] = wc ? () => wc[k++] : () => w0;
      return null;
    }
    let out: string[];
    if (s.d != null || s.db != null) {
      const d = decodeDeltas(s.db, s.dx, s.dv, s.d);
      out = new Array<string>(d.length);
      let run = 0;
      for (let i = 0; i < d.length; i++) { run += d[i]; out[i] = String(run); }
    } else if (s.vb != null) {
      out = Array.from(dlColumn(s.vb), String);
    } else {
      out = asColumn(s.v).map(String);
    }
    if (s.w != null) {
      const wc = typeof s.w === "object" ? dlColumn(s.w) : null, w0 = Number(s.w);
      for (let i = 0; i < out.length; i++) {
        const w = wc ? wc[i] : w0;
        if (out[i].length < w) out[i] = "0".repeat(w - out[i].length) + out[i];
      }
    }
    return out;
  });
  const at = new Array<number>(streams.length).fill(0);
  const out: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = tc[i];
    if (!c || c > tpl.length) { out[i] = null; continue; }
    const parts = tpl[c - 1];
    let s = parts[0];
    for (let j = 1; j < parts.length; j++) {
      const st = streams[j - 1];
      let num = "";
      if (st === null) {
        const m = keys && keys[i] != null ? KEY_INT.exec(keys[i]) : null;
        num = m ? m[1] : "";
        const pw = keyW[j - 1];
        if (pw) { const w = pw(i); if (num.length < w) num = "0".repeat(w - num.length) + num; }
      } else if (st) {
        num = st[at[j - 1]++];
      }
      s += num + parts[j];
    }
    out[i] = s;
  }
  return out;
}

// Decode one payload column to a plain length-`n` array (`null` where unset):
// expands the sparse / dictionary / template encodings, and otherwise behaves
// as `asColumn`. Returns `null` when the column is absent. `keys` (the decoded
// element keys) serves a template's `"key"` stream.
export function decodeColumn<T>(v: EncodedColumn<T>, n: number, keys?: string[]): (T | null)[] | null {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    if ((v as TemplateColumn).tpl !== undefined && (v as TemplateColumn).tc !== undefined) {
      return decodeTemplate(v as TemplateColumn, n, keys) as unknown as (T | null)[];
    }
    const o = v as Partial<SparseColumn<T> & DictColumn<T>>;
    if (o.levels !== undefined && o.cb !== undefined) {
      const levels = asColumn<T>(o.levels as T[] | T);
      const cb = dlColumn(o.cb);
      const out: (T | null)[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const c = cb[i];
        out[i] = c ? levels[c - 1] : null;
      }
      return out;
    }
    if (o.at !== undefined && o.v !== undefined) {
      const at = asColumn<number>(o.at);
      const vals = asColumn<T>(o.v as T[] | T);
      const out: (T | null)[] = new Array(n).fill(null);
      for (let i = 0; i < at.length; i++) out[at[i]] = vals[i];
      return out;
    }
    if (o.levels !== undefined && o.rv !== undefined && o.rl !== undefined) {
      const levels = asColumn<T>(o.levels as T[] | T);
      const rv = asColumn<number>(o.rv), rl = asColumn<number>(o.rl);
      const out: (T | null)[] = new Array(n);
      let k = 0;
      for (let r = 0; r < rv.length; r++) {
        const val = rv[r] < 0 ? null : levels[rv[r]];
        for (let m = 0; m < rl[r]; m++) out[k++] = val;
      }
      return out;
    }
    if (o.levels !== undefined && o.codes !== undefined) {
      const levels = asColumn<T>(o.levels as T[] | T);
      const codes = asColumn<number | null>(o.codes);
      const out: (T | null)[] = new Array(codes.length);
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        out[i] = c == null ? null : levels[c];
      }
      return out;
    }
  }
  return asColumn<T>(v as T[] | T);
}

// The key column: plain strings, or (raster mode, `.encode_keys()` in R) mostly
// integer-suffixed keys as `{delta, at, v, pre?}` -- a running sum of `delta`
// for the integer suffixes, each after its text prefix from `pre` (runs, one
// per integer key; "" when absent), with the other keys `v` at their 0-based
// positions `at`. The differences come as the JSON array `delta` or (VW-40)
// as a typed column `db` whose entries at the 0-based `dx` are replaced by
// `dv` (negative jumps and wide gaps).
export function decodeKeys(v: unknown): string[] {
  if (v != null && typeof v === "object" && !Array.isArray(v) && ("delta" in (v as object) || "db" in (v as object))) {
    const o = v as {
      delta?: number[] | number; at?: number[] | number; v?: string[] | string;
      pre?: EncodedColumn<string>;
      // VW-40: the differences as a typed column, with exceptions at `dx`.
      db?: DLColumn; dx?: number[] | number; dv?: number[] | number;
    };
    const delta = decodeDeltas(o.db, o.dx, o.dv, o.delta);
    const at = asColumn(o.at), other = asColumn(o.v);
    const pre = o.pre != null ? decodeColumn<string>(o.pre, delta.length) : null;
    const n = delta.length + at.length;
    const out: string[] = new Array(n);
    let j = 0, a = 0, run = 0;
    for (let i = 0; i < n; i++) {
      if (a < at.length && at[a] === i) { out[i] = String(other[a++]); continue; }
      const p = pre ? pre[j] : null;
      run += delta[j++];
      out[i] = (p == null ? "" : p) + String(run);
    }
    return out;
  }
  return asColumn(v as string[] | string).map(String);
}

// The integer bbox (VW-43, `.encode_bbox()` in R): `x0`/`y0` the near corners
// and `w`/`h` the extents on the 1/100 px grid, each less its minimum in `lo`;
// rows in `na` (0-based) have no box (`null`); rows in `ex.at` take the plain
// boxes in `ex`. The arithmetic is R's, so each
// value is the same double as the plain 1/100 px column.
export function decodeBbox(b: NonNullable<ColumnElements["bbox"]>): {
  x0: (number | null)[]; y0: (number | null)[]; x1: (number | null)[]; y1: (number | null)[];
} {
  const n = Number(b.n) || 0;
  const lo = asColumn(b.lo).map(Number);
  const ux = dlColumn(b.x0 as DLColumn), uy = dlColumn(b.y0 as DLColumn);
  const uw = dlColumn(b.w as DLColumn), uh = dlColumn(b.h as DLColumn);
  const x0: (number | null)[] = new Array(n), y0: (number | null)[] = new Array(n);
  const x1: (number | null)[] = new Array(n), y1: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const gx = lo[0] + ux[i], gy = lo[1] + uy[i];
    x0[i] = gx / 100; y0[i] = gy / 100;
    x1[i] = (gx + lo[2] + uw[i]) / 100; y1[i] = (gy + lo[3] + uh[i]) / 100;
  }
  const na = asColumn(b.na);
  for (let k = 0; k < na.length; k++) { const i = na[k]; x0[i] = y0[i] = x1[i] = y1[i] = null; }
  // Rows whose extent would have widened every row's `w`/`h`, as plain boxes.
  if (b.ex) {
    const at = asColumn(b.ex.at), ex0 = asColumn(b.ex.x0), ey0 = asColumn(b.ex.y0);
    const ex1 = asColumn(b.ex.x1), ey1 = asColumn(b.ex.y1);
    for (let k = 0; k < at.length; k++) {
      const i = at[k];
      x0[i] = ex0[k]; y0[i] = ey0[k]; x1[i] = ex1[k]; y1[i] = ey1[k];
    }
  }
  return { x0, y0, x1, y1 };
}

// The `row_keys` column (X-15, `.meta_row_keys()` in R): sparse `{at, v}`,
// each entry the keys of the rows a multi-row mark (a line, path or polygon
// series) draws, as tokens -- a key, or a run `[prefix, first, count]` that
// stands for prefix + first, prefix + (first + 1), ... Returns one key array
// per element (null where the element has none), or null when absent.
export function decodeRowKeys(v: unknown, n: number): (string[] | null)[] | null {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { at?: number[] | number; v?: unknown };
  if (o.at == null || o.v == null) return null;
  const at = asColumn<number>(o.at);
  const vals = Array.isArray(o.v) ? (o.v as unknown[]) : [o.v];
  const out: (string[] | null)[] = new Array(n).fill(null);
  for (let i = 0; i < at.length && i < vals.length; i++) {
    const idx = at[i];
    if (!(idx >= 0 && idx < n)) continue;
    const toks = Array.isArray(vals[i]) ? (vals[i] as unknown[]) : [vals[i]];
    const keys: string[] = [];
    for (let t = 0; t < toks.length; t++) {
      const tk = toks[t];
      if (Array.isArray(tk) && tk.length === 3) {
        const pre = String(tk[0]), first = Number(tk[1]), count = Number(tk[2]);
        for (let m = 0; m < count; m++) keys.push(pre + String(first + m));
      } else if (tk != null) keys.push(String(tk));
    }
    if (keys.length) out[idx] = keys;
  }
  return out;
}

// Reconstruct the per-element `ElemMeta[]` view the runtime uses from whichever
// shape R sent: a columnar `ColumnElements` (the current wire format) or a legacy
// `ElemMeta[]` (also what the empty case `[]` and the test harness use). Purely a
// decode step — the resulting objects are identical to the old per-record payload,
// so nothing downstream changes.
export function normalizeElements(raw: ElemMeta[] | ColumnElements | null | undefined): ElemMeta[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw; // legacy per-record payload (and the empty [])
  const c = raw as ColumnElements;
  const key = decodeKeys(c.key as unknown);
  const n = key.length;
  if (!n) return [];
  // Every non-key column may arrive in the compact encoding (see decodeColumn).
  const col = <T>(f: keyof ColumnElements): (T | null)[] | null =>
    decodeColumn<T>((c as unknown as Record<string, EncodedColumn<T>>)[f as string], n, key);
  // The boxes: one integer `bbox` (VW-43), or four columns, plain or (when a
  // display list covers most marks) sparse.
  const bb = c.bbox ? decodeBbox(c.bbox) : null;
  const x0 = bb ? bb.x0 : col<number>("x0") || [];
  const y0 = bb ? bb.y0 : col<number>("y0") || [];
  const x1 = bb ? bb.x1 : col<number>("x1") || [];
  const y1 = bb ? bb.y1 : col<number>("y1") || [];
  const mark = col<string>("mark");
  const tooltip = col<string>("tooltip");
  const hoverGroup = col<string>("hover_group");
  const hoverColor = col<string>("hover_color");
  const selectedColor = col<string>("selected_color");
  const legendFor = col<string>("legend_for");
  const legend = col<string[] | string>("legend");
  const filterValue = col<number>("filter_value");
  const cond = col<string[] | string>("cond");
  // VW-46: per-row `if_false` colours, one column per condition tag.
  const condValue: [string, (string | null)[]][] = [];
  if (c.cond_value && typeof c.cond_value === "object") {
    for (const t in c.cond_value) {
      const v = decodeColumn<string>(c.cond_value[t] as EncodedColumn<string>, n, key);
      if (v) condValue.push([t, v]);
    }
  }
  const filt = col<string[] | string>("filt");
  const join = col<string>("join");
  const source = col<string>("source");
  const target = col<string>("target");
  const ivNum: [keyof ElemMeta, (number | null)[] | null][] = (["ix", "ixh", "iy", "iyh"] as const).map(
    (f) => [f, col<number>(f)] as [keyof ElemMeta, (number | null)[] | null]
  );
  const ixd = col<string>("ixd");
  const iyd = col<string>("iyd");
  const rowKeys = decodeRowKeys(c.row_keys, n);
  const rowJoins = decodeRowKeys(c.row_joins, n);
  const out: ElemMeta[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e: ElemMeta = { key: String(key[i]) };
    if (mark && mark[i] != null) e.mark = String(mark[i]);
    // Assign bbox only when numeric — a `null` (R `NA`) means "no geometry", which
    // `hasBbox` must continue to reject.
    if (typeof x0[i] === "number") e.x0 = x0[i] as number;
    if (typeof y0[i] === "number") e.y0 = y0[i] as number;
    if (typeof x1[i] === "number") e.x1 = x1[i] as number;
    if (typeof y1[i] === "number") e.y1 = y1[i] as number;
    if (tooltip && tooltip[i] != null) e.tooltip = String(tooltip[i]);
    if (hoverGroup && hoverGroup[i] != null) e.hover_group = String(hoverGroup[i]);
    if (hoverColor && hoverColor[i] != null) e.hover_color = String(hoverColor[i]);
    if (selectedColor && selectedColor[i] != null) e.selected_color = String(selectedColor[i]);
    if (legendFor && legendFor[i] != null) e.legend_for = String(legendFor[i]);
    if (legend) {
      const v = legend[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) e.legend = v;
    }
    if (filterValue && typeof filterValue[i] === "number") e.filter_value = filterValue[i] as number;
    if (cond) {
      const v = cond[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        e.cond = Array.isArray(v) ? (v as string[]) : [String(v)];
      }
    }
    for (let t = 0; t < condValue.length; t++) {
      const v = condValue[t][1][i];
      if (v != null) (e.cond_value = e.cond_value || {})[condValue[t][0]] = String(v);
    }
    if (filt) {
      const v = filt[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        e.filt = Array.isArray(v) ? (v as string[]) : [String(v)];
      }
    }
    if (join && join[i] != null) e.join = String(join[i]);
    if (source && source[i] != null) e.source = String(source[i]);
    if (target && target[i] != null) e.target = String(target[i]);
    for (let f = 0; f < ivNum.length; f++) {
      const col = ivNum[f][1];
      if (col && typeof col[i] === "number") (e as unknown as Record<string, number>)[ivNum[f][0]] = col[i] as number;
    }
    if (ixd && ixd[i] != null) e.ixd = String(ixd[i]);
    if (iyd && iyd[i] != null) e.iyd = String(iyd[i]);
    if (rowKeys && rowKeys[i]) e.row_keys = rowKeys[i]!;
    if (rowJoins && rowJoins[i]) e.row_joins = rowJoins[i]!;
    out[i] = e;
  }
  return out;
}

// The panels payload as an array (htmlwidgets may unbox a length-1 list to a
// single object). Absent/`null` -> `[]` (a scene with no cartesian scale
// descriptors — the widget stays pixel-only).
export function normalizePanels(raw: PanelInfo[] | PanelInfo | null | undefined): PanelInfo[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}
