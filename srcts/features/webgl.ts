// WebGL2 drawing of the display list's mid tier (F-25, phase A).
//
// The canvas mid tier (raster.ts drawList/paintList) redraws every record on
// the CPU: about 1.3 s for a million points, so above LIVE_DRAW_MAX marks in
// view a pan or zoom shows the scaled image until the view settles, and every
// restyle (selection dim, conditions, filters, legend mute) is a full redraw.
// Here the same records go to the GPU as one instanced draw, in paint order:
// a few ms for a million points.
//
// Phase A draws points (every marker shape) and rects with a solid fill and
// stroke, through each panel's affine and clip (axis zoom) and the record's
// own clip rect. A list holding anything else (paths, gradients, dashes,
// opacity groups, run images, clip paths) stays on the canvas: `glUnsupported`
// says why. Flagged records are skipped, as the canvas skips them (the mark
// image, left showing, draws them).
//
// The per-key style state (markState.ts) is folded into each instance's fill
// and stroke colour on the CPU, with the canvas's rules: hidden keys are not
// drawn, dimmed or muted ones are drawn at that alpha, a condition colour
// replaces fill and stroke keeping the paint's alpha. Selected marks are raised
// (VW-53) by building the instances in the raise order.
//
// Picking, the selection rings, the detail tier and the overview image are
// untouched: this module only paints.
//
// Each widget that draws with GL holds one context, created on its first GL
// draw. Browsers keep about 16 per page and drop the oldest beyond that; a
// widget whose context is lost goes back to the canvas for good.

import { DL_POINT, DL_RECT } from "../dlist";
import type { DisplayList } from "../dlist";
import { MS_DIM, MS_HIDDEN, MS_MUTED, MUTED_ALPHA } from "./markState";

// Panels and record clip rects travel as uniform arrays: at most this many
// of each (slot 0 is "none"). More, and the list stays on the canvas.
export const GL_MAX_SLOTS = 48;
// `webgl = "auto"`: only lists of at least this many records (the canvas is
// live below it: LIVE_DRAW_MAX), so small widgets never take a GL context.
export const GL_AUTO_MIN = 50000;

// --- colours ---------------------------------------------------------------

let normCtx: CanvasRenderingContext2D | null | undefined;
const colorCache: Record<string, number[] | null> = {};

// A CSS colour as [r, g, b, a] (0-255), or null when it can't be read.
// Hex directly; anything else through a 2D context's colour parser.
export function parseColor(s: string | null): number[] | null {
  if (s == null) return null;
  if (s in colorCache) return colorCache[s];
  let out: number[] | null = null;
  const h = /^#([0-9a-fA-F]{3,8})$/.exec(s);
  if (h) {
    let v = h[1];
    if (v.length === 3 || v.length === 4) v = v.split("").map((c) => c + c).join("");
    if (v.length === 6) v += "ff";
    if (v.length === 8) {
      const q = [0, 2, 4, 6].map((k) => parseInt(v.slice(k, k + 2), 16));
      if (q.every((x) => isFinite(x))) out = q;
    }
  } else if (s === "none" || s === "transparent") {
    out = [0, 0, 0, 0];
  } else {
    if (normCtx === undefined) {
      try {
        const c = document.createElement("canvas");
        normCtx = typeof c.getContext === "function" ? c.getContext("2d") : null;
      } catch (e) {
        normCtx = null;
      }
    }
    if (normCtx) {
      // A colour the parser rejects leaves the sentinel in place.
      normCtx.fillStyle = "#010203";
      normCtx.fillStyle = s;
      const n = String(normCtx.fillStyle);
      if (n !== "#010203") {
        const m = /^rgba?\(([^)]+)\)$/.exec(n);
        if (m) {
          const p = m[1].split(",").map((x) => parseFloat(x));
          out = [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255];
        } else if (/^#[0-9a-fA-F]{6}$/.test(n)) {
          out = parseColor(n);
        }
      }
    }
  }
  colorCache[s] = out;
  return out;
}

// --- eligibility -----------------------------------------------------------

// Why the list can't be drawn by the GL path (null: it can). Records the
// canvas skips (flagged) are skipped here too, unless they are drawn from run
// images, which this path does not composite.
export function glUnsupported(dl: DisplayList): string | null {
  if (dl.panels.length + 1 > GL_MAX_SLOTS) return "panels";
  if (dl.clips.length + 1 > GL_MAX_SLOTS) return "clips";
  for (let c = 0; c < dl.clips.length; c++) if (dl.clips[c].pn > 0) return "clip paths";
  for (let p = 0; p < dl.paints.length; p++) {
    const pt = dl.paints[p];
    if (pt.grad > 0) return "gradients";
    if (pt.dash) return "dashes";
    if (pt.fill != null && !parseColor(pt.fill)) return "colours";
    if (pt.stroke != null && !parseColor(pt.stroke)) return "colours";
  }
  for (let i = 0; i < dl.n; i++) {
    if (dl.flags[i]) {
      if (dl.runImgs && dl.run[i] > 0) return "runs";
      continue;
    }
    const k = dl.kind[i];
    if (k !== DL_POINT && k !== DL_RECT) return "paths";
    if (dl.group[i] > 0) return "groups";
  }
  return null;
}

// Can every condition colour a key uses be read? (When not, the canvas
// paints the state: decided before drawList's LIVE_DRAW_MAX deferral.)
export function glStyleReadable(color: Uint32Array, palette: string[]): boolean {
  const bad: boolean[] = palette.map((c) => !parseColor(c));
  if (!bad.some((b) => b)) return true;
  for (let k = 0; k < color.length; k++) if (color[k] && bad[color[k] - 1]) return false;
  return true;
}

// --- instances -------------------------------------------------------------

// One GPU instance per drawn record, in paint order (or the raise order).
// `pos`/`size`: a point's centre and (radius, 0); a rect's corner and
// (width, height), all scene px. `meta`: kind (low 4 bits; the paint's line
// cap above them: 0 butt, 1 round, 2 square), shape, panel slot, clip slot.
// `width`: stroke width (scene px). `rec`: the record each instance draws.
export interface GLInstances {
  n: number;
  pos: Float32Array;
  size: Float32Array;
  meta: Uint8Array;
  width: Float32Array;
  rec: Uint32Array;
}

export function glInstances(dl: DisplayList, ord: Uint32Array | null): GLInstances {
  let n = 0;
  for (let i = 0; i < dl.n; i++) if (!dl.flags[i]) n++;
  const pos = new Float32Array(2 * n), size = new Float32Array(2 * n);
  const meta = new Uint8Array(4 * n), width = new Float32Array(n), rec = new Uint32Array(n);
  const np = dl.panels.length;
  let m = 0;
  for (let q = 0; q < dl.n; q++) {
    const i = ord ? ord[q] : q;
    if (dl.flags[i]) continue;
    const j = dl.row[i];
    if (dl.kind[i] === DL_POINT) {
      pos[2 * m] = dl.cx[j]; pos[2 * m + 1] = dl.cy[j];
      size[2 * m] = dl.r[j]; size[2 * m + 1] = 0;
      meta[4 * m] = 0; meta[4 * m + 1] = dl.shape[j];
    } else {
      pos[2 * m] = dl.rx[j]; pos[2 * m + 1] = dl.ry[j];
      size[2 * m] = dl.rw[j]; size[2 * m + 1] = dl.rh[j];
      meta[4 * m] = 1; meta[4 * m + 1] = 0;
    }
    meta[4 * m + 2] = dl.panel[i] <= np ? dl.panel[i] : 0;
    meta[4 * m + 3] = dl.clip[i];
    const pt = dl.paints[dl.paint[i]];
    meta[4 * m] |= (pt.cap === "round" ? 1 : pt.cap === "square" ? 2 : 0) << 4;
    width[m] = pt.stroke != null ? pt.width : 0;
    rec[m] = i;
    m++;
  }
  return { n: n, pos: pos, size: size, meta: meta, width: width, rec: rec };
}

// The style state the colours are built from (null: unstyled).
export interface GLStyle {
  flags: Uint8Array;
  color: Uint32Array;
  palette: string[];
  dimAlpha: number;
  alpha: Uint16Array | null;
  alphaPal: number[];
}

// Each instance's fill and stroke as RGBA bytes (straight alpha), with the
// style state folded in by the canvas's rules (raster.ts paintList).
export function glColors(dl: DisplayList, inst: GLInstances, st: GLStyle | null): { fill: Uint8Array; stroke: Uint8Array } | null {
  const n = inst.n;
  const fill = new Uint8Array(4 * n), stroke = new Uint8Array(4 * n);
  const pf: (number[] | null)[] = dl.paints.map((p) => parseColor(p.fill));
  const ps: (number[] | null)[] = dl.paints.map((p) => parseColor(p.stroke));
  const pal: (number[] | null)[] = st ? st.palette.map((c) => parseColor(c)) : [];
  // A condition colour written #rrggbb takes the alpha of a paint written
  // #rrggbbaa; any other keeps its own (raster.ts withAlphaOf).
  const hex6: boolean[] = st ? st.palette.map((c) => /^#[0-9a-fA-F]{6}$/.test(c)) : [];
  const fHex8: boolean[] = dl.paints.map((p) => p.fill != null && /^#[0-9a-fA-F]{8}$/.test(p.fill));
  const sHex8: boolean[] = dl.paints.map((p) => p.stroke != null && /^#[0-9a-fA-F]{8}$/.test(p.stroke));
  for (let m = 0; m < n; m++) {
    const i = inst.rec[m], pi = dl.paint[i];
    let f = pf[pi], s = ps[pi], mult = 1;
    if (st) {
      const k = dl.key[i], fl = st.flags[k];
      if (fl & MS_HIDDEN) continue; // stays transparent
      if (fl & MS_DIM) mult = st.alpha && st.alpha[k] ? st.alphaPal[st.alpha[k] - 1] : st.dimAlpha;
      else if (fl & MS_MUTED) mult = MUTED_ALPHA;
      const ov = st.color[k];
      const oc = ov ? pal[ov - 1] : null;
      // a condition colour we can't read: the canvas paints this state
      // (raster.ts checks for it first, glStyleReadable)
      if (ov && !oc) return null;
      if (oc) {
        const h6 = hex6[ov - 1];
        if (f) f = [oc[0], oc[1], oc[2], h6 && fHex8[pi] ? f[3] : oc[3]];
        if (s) s = [oc[0], oc[1], oc[2], h6 && sHex8[pi] ? s[3] : oc[3]];
      }
    }
    if (f) { fill[4 * m] = f[0]; fill[4 * m + 1] = f[1]; fill[4 * m + 2] = f[2]; fill[4 * m + 3] = Math.round(f[3] * mult); }
    if (s) { stroke[4 * m] = s[0]; stroke[4 * m + 1] = s[1]; stroke[4 * m + 2] = s[2]; stroke[4 * m + 3] = Math.round(s[3] * mult); }
  }
  return { fill: fill, stroke: stroke };
}

// --- renderer --------------------------------------------------------------

const VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in vec2 a_size;
layout(location = 3) in uvec4 a_meta;
layout(location = 4) in float a_width;
layout(location = 5) in vec4 a_fill;
layout(location = 6) in vec4 a_stroke;
uniform vec4 u_aff[${GL_MAX_SLOTS}];
uniform vec4 u_pclip[${GL_MAX_SLOTS}];
uniform vec4 u_clip[${GL_MAX_SLOTS}];
uniform float u_gs[${GL_MAX_SLOTS}];
uniform float u_base;
uniform vec2 u_vp;
out vec2 v_p;
flat out vec2 v_half;
flat out uint v_kind;
flat out uint v_cap;
flat out uint v_shape;
flat out float v_hw;
flat out vec4 v_fill;
flat out vec4 v_stroke;
flat out vec4 v_pc;
flat out vec4 v_rc;
void main() {
  uint p = a_meta.z;
  vec4 A = u_aff[p];
  vec2 c, hext;
  uint kind = a_meta.x & 15u;
  if (kind == 0u) {
    c = vec2(A.x * a_pos.x + A.z, A.y * a_pos.y + A.w);
    hext = vec2(a_size.x * u_gs[p]);
  } else {
    vec2 p0 = vec2(A.x * a_pos.x + A.z, A.y * a_pos.y + A.w);
    vec2 p1 = vec2(A.x * (a_pos.x + a_size.x) + A.z, A.y * (a_pos.y + a_size.y) + A.w);
    c = 0.5 * (p0 + p1);
    hext = 0.5 * abs(p1 - p0);
  }
  float hw = 0.5 * a_width * u_base;
  vec2 ext = hext + vec2(hw + 1.0);
  v_p = a_corner * ext;
  vec2 q = c + v_p;
  gl_Position = vec4(q.x / u_vp.x * 2.0 - 1.0, 1.0 - q.y / u_vp.y * 2.0, 0.0, 1.0);
  v_half = hext;
  v_kind = kind;
  v_cap = a_meta.x >> 4u;
  v_shape = a_meta.y;
  v_hw = hw;
  v_fill = a_fill;
  v_stroke = a_stroke;
  v_pc = u_pclip[p];
  if (a_meta.w == 0u) {
    v_rc = vec4(-1e9, -1e9, 1e9, 1e9);
  } else {
    vec4 cr = u_clip[a_meta.w];
    vec2 r0 = vec2(A.x * cr.x + A.z, A.y * cr.y + A.w);
    vec2 r1 = vec2(A.x * cr.z + A.z, A.y * cr.w + A.w);
    v_rc = vec4(min(r0, r1), max(r0, r1));
  }
  // nothing to draw: collapse the quad
  if (a_fill.a == 0.0 && (a_stroke.a == 0.0 || hw <= 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_p;
flat in vec2 v_half;
flat in uint v_kind;
flat in uint v_cap;
flat in uint v_shape;
flat in float v_hw;
flat in vec4 v_fill;
flat in vec4 v_stroke;
flat in vec4 v_pc;
flat in vec4 v_rc;
uniform vec2 u_vp;
out vec4 o;
const float S3 = 0.8660254037844386;
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// Signed distance to a closed polygon (Inigo Quilez's sdPolygon).
float sdPoly(vec2 p, vec2 v[10], int n) {
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0, j = n - 1; i < n; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}
// The marker outlines of dlist.ts MARKER (units of r, y down).
float sdMarker(vec2 p, uint shape, float r) {
  vec2 v[10];
  int n = 0;
  if (shape == 2u) { v[0] = vec2(0.0, -1.0); v[1] = vec2(S3, 0.5); v[2] = vec2(-S3, 0.5); n = 3; }
  else if (shape == 3u) { v[0] = vec2(0.0, -1.0); v[1] = vec2(1.0, 0.0); v[2] = vec2(0.0, 1.0); v[3] = vec2(-1.0, 0.0); n = 4; }
  else if (shape == 6u) { v[0] = vec2(0.0, 1.0); v[1] = vec2(S3, -0.5); v[2] = vec2(-S3, -0.5); n = 3; }
  else {
    for (int k = 0; k < 10; k++) {
      float a = -1.5707963267948966 + float(k) * 0.6283185307179586;
      float rad = (k % 2 == 0) ? 1.0 : 0.382;
      v[k] = vec2(rad * cos(a), rad * sin(a));
    }
    n = 10;
  }
  return sdPoly(p / r, v, n) * r;
}
void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_vp.y - gl_FragCoord.y);
  if (fc.x < v_pc.x || fc.x > v_pc.z || fc.y < v_pc.y || fc.y > v_pc.w) discard;
  if (fc.x < v_rc.x || fc.x > v_rc.z || fc.y < v_rc.y || fc.y > v_rc.w) discard;
  float d;
  bool line = false;
  if (v_kind == 1u) {
    d = sdBox(v_p, v_half);
  } else {
    float r = v_half.x;
    if (v_shape == 4u || v_shape == 5u) {
      // plus / cross: two strokes of the paint's width and line cap
      if (v_hw <= 0.0) discard;
      vec2 p = v_shape == 5u ? mat2(0.7071067811865476, 0.7071067811865476, -0.7071067811865476, 0.7071067811865476) * v_p : v_p;
      if (v_cap == 1u) {
        d = min(length(vec2(p.x, max(abs(p.y) - r, 0.0))), length(vec2(max(abs(p.x) - r, 0.0), p.y))) - v_hw;
      } else {
        float L = v_cap == 2u ? r + v_hw : r;
        d = min(sdBox(p, vec2(v_hw, L)), sdBox(p, vec2(L, v_hw)));
      }
      line = true;
    } else if (v_shape == 1u) {
      d = sdBox(v_p, vec2(r));
    } else if (v_shape == 2u || v_shape == 3u || v_shape == 6u || v_shape == 7u) {
      d = sdMarker(v_p, v_shape, max(r, 1e-6));
    } else {
      d = length(v_p) - r;
    }
  }
  vec4 col;
  if (line) {
    float a = clamp(0.5 - d, 0.0, 1.0) * v_stroke.a;
    col = vec4(v_stroke.rgb * a, a);
  } else {
    float fa = clamp(0.5 - d, 0.0, 1.0) * v_fill.a;
    float sa = v_hw > 0.0 ? clamp(v_hw + 0.5 - abs(d), 0.0, 1.0) * min(1.0, 2.0 * v_hw + 0.5) * v_stroke.a : 0.0;
    col = vec4(v_stroke.rgb * sa, sa) + vec4(v_fill.rgb * fa, fa) * (1.0 - sa);
  }
  if (col.a <= 0.0) discard;
  o = col;
}`;

// The frame the canvas layout (raster.ts listLayout) puts the records in.
export interface GLFrame {
  aff: { ax: number; bx: number; ay: number; by: number }[];
  gs: number[];
  pclip: (number[] | null)[];
  base: number;
}

// A GL painter on its own canvas. `draw` returns false when it can't (no
// WebGL2, a lost context, a shader that won't build): the caller then paints
// the canvas instead.
export interface GLPainter {
  canvas: HTMLCanvasElement;
  draw(dl: DisplayList, frame: GLFrame, W: number, H: number, ord: Uint32Array | null, style: GLStyle | null, styleRev: number): boolean;
  alive(): boolean;
  // Drop the instance buffers (a list this painter can't draw replaced it).
  release(): void;
}

// Why the last createGLPainter() returned null (for glState / debugging).
export let glLastError = "";

export function createGLPainter(onLost: () => void): GLPainter | null {
  glLastError = "";
  const canvas = document.createElement("canvas");
  canvas.className = "vellumwidget-gl";
  canvas.setAttribute("aria-hidden", "true");
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = typeof canvas.getContext === "function"
      ? (canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null)
      : null;
  } catch (e) {
    gl = null;
  }
  if (!gl) { glLastError = "no webgl2"; return null; }
  let lost = false;
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    lost = true;
    onLost();
  });
  const g = gl;
  const compile = function (type: number, src: string): WebGLShader | null {
    const s = g.createShader(type);
    if (!s) return null;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (g.getShaderParameter(s, g.COMPILE_STATUS)) return s;
    glLastError = "shader: " + (g.getShaderInfoLog(s) || "").slice(0, 300);
    return null;
  };
  const vs = compile(g.VERTEX_SHADER, VS), fs = compile(g.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = g.createProgram();
  if (!prog) return null;
  g.attachShader(prog, vs);
  g.attachShader(prog, fs);
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) { glLastError = "link: " + (g.getProgramInfoLog(prog) || "").slice(0, 300); return null; }
  const U = (nm: string): WebGLUniformLocation | null => g.getUniformLocation(prog, nm);
  const uAff = U("u_aff"), uPclip = U("u_pclip"), uClip = U("u_clip"), uGs = U("u_gs"), uBase = U("u_base"), uVp = U("u_vp");
  const vao = g.createVertexArray();
  g.bindVertexArray(vao);
  const corner = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, corner);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  const mk = function (loc: number, size: number, type: number, norm: boolean, int: boolean): WebGLBuffer | null {
    const b = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, b);
    g.enableVertexAttribArray(loc);
    if (int) g.vertexAttribIPointer(loc, size, type, 0, 0);
    else g.vertexAttribPointer(loc, size, type, norm, 0, 0);
    g.vertexAttribDivisor(loc, 1);
    return b;
  };
  const bPos = mk(1, 2, g.FLOAT, false, false), bSize = mk(2, 2, g.FLOAT, false, false);
  const bMeta = mk(3, 4, g.UNSIGNED_BYTE, false, true), bWidth = mk(4, 1, g.FLOAT, false, false);
  const bFill = mk(5, 4, g.UNSIGNED_BYTE, true, false), bStroke = mk(6, 4, g.UNSIGNED_BYTE, true, false);
  g.bindVertexArray(null);

  let instDl: DisplayList | null = null, instOrd: Uint32Array | null | undefined, inst: GLInstances | null = null;
  let colKey = "";
  const affU = new Float32Array(4 * GL_MAX_SLOTS), pclipU = new Float32Array(4 * GL_MAX_SLOTS);
  const clipU = new Float32Array(4 * GL_MAX_SLOTS), gsU = new Float32Array(GL_MAX_SLOTS);
  const upload = function (b: WebGLBuffer | null, data: ArrayBufferView): void {
    g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, data, g.STATIC_DRAW);
  };

  function draw(dl: DisplayList, frame: GLFrame, W: number, H: number, ord: Uint32Array | null, style: GLStyle | null, styleRev: number): boolean {
    if (lost || g.isContextLost()) return false;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    g.bindVertexArray(vao);
    if (instDl !== dl || instOrd !== ord || !inst) {
      inst = glInstances(dl, ord);
      instDl = dl; instOrd = ord;
      upload(bPos, inst.pos); upload(bSize, inst.size); upload(bMeta, inst.meta); upload(bWidth, inst.width);
      colKey = "";
    }
    const key = style ? "s" + styleRev : "u";
    if (key !== colKey) {
      const c = glColors(dl, inst, style);
      if (!c) { g.bindVertexArray(null); return false; }
      upload(bFill, c.fill); upload(bStroke, c.stroke);
      colKey = key;
    }
    const np = Math.min(frame.aff.length, GL_MAX_SLOTS);
    for (let p = 0; p < np; p++) {
      const A = frame.aff[p];
      affU[4 * p] = A.ax; affU[4 * p + 1] = A.ay; affU[4 * p + 2] = A.bx; affU[4 * p + 3] = A.by;
      const c = frame.pclip[p];
      if (c) { pclipU[4 * p] = c[0]; pclipU[4 * p + 1] = c[1]; pclipU[4 * p + 2] = c[2]; pclipU[4 * p + 3] = c[3]; }
      else { pclipU[4 * p] = -1e9; pclipU[4 * p + 1] = -1e9; pclipU[4 * p + 2] = 1e9; pclipU[4 * p + 3] = 1e9; }
      gsU[p] = frame.gs[p];
    }
    for (let c = 0; c < dl.clips.length && c + 1 < GL_MAX_SLOTS; c++) {
      const cr = dl.clips[c];
      clipU[4 * (c + 1)] = cr.x0; clipU[4 * (c + 1) + 1] = cr.y0; clipU[4 * (c + 1) + 2] = cr.x1; clipU[4 * (c + 1) + 3] = cr.y1;
    }
    g.useProgram(prog);
    g.uniform4fv(uAff, affU);
    g.uniform4fv(uPclip, pclipU);
    g.uniform4fv(uClip, clipU);
    g.uniform1fv(uGs, gsU);
    g.uniform1f(uBase, frame.base);
    g.uniform2f(uVp, W, H);
    g.viewport(0, 0, W, H);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    if (inst.n) g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, inst.n);
    g.bindVertexArray(null);
    return !g.isContextLost();
  }

  function release(): void {
    if (!inst) return;
    inst = null; instDl = null; instOrd = undefined; colKey = "";
    if (lost || g.isContextLost()) return;
    for (const b of [bPos, bSize, bMeta, bWidth, bFill, bStroke]) {
      g.bindBuffer(g.ARRAY_BUFFER, b);
      g.bufferData(g.ARRAY_BUFFER, 0, g.STATIC_DRAW);
    }
  }

  return { canvas: canvas, draw: draw, alive: function () { return !lost && !g.isContextLost(); }, release: release };
}
