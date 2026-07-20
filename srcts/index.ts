// vellumwidget — client-side interactivity runtime for vellum SVG scenes.
//
// A vellum scene renders to SVG where each interactive element carries a
// `data-key` (its datum's identity); the R side ships a `scene_model()` element
// table (key -> tooltip / hover-group / device-px bbox). This runtime wires the
// interactions onto that, entirely in the browser (no Shiny, no round-trip):
//   Phase 3: hover -> tooltip, hover -> highlight, click -> select.
//   Phase 4: nearest-mark hover snap, rectangular brush -> select, pan/zoom via
//            the SVG viewBox, and an on-hover toolbar (reset, zoom-to-selection,
//            save SVG/PNG, fullscreen).
// Element bboxes live in the SVG's viewBox coordinate space (device px), so the
// same coordinates drive rendering, brushing, and nearest-mark queries.

import Flatbush from "flatbush";

declare const HTMLWidgets: {
  widget: (w: unknown) => void;
  shinyMode?: boolean; // true only inside a live Shiny app (gates the Shiny.* calls)
  // Resolve a mounted widget instance (the object its factory returned) by CSS
  // selector; used by the server->client proxy to find the widget to drive.
  find?: (selector: string) => WidgetInstance | null;
};

// The subset of the object a widget's factory returns that the proxy needs: the
// `_call` seam that routes a server-driven command onto the instance.
interface WidgetInstance {
  _call?: (method: string, args: unknown) => void;
}

// A server->client proxy command (from vellumwidget_proxy()): which widget, which
// action, and its keys. Delivered via Shiny's "vellumwidget-calls" custom message.
interface ProxyMessage {
  id: string;
  method: string;
  args?: unknown;
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ElemMeta extends Partial<Bbox> {
  key: string;
  mark?: string; // mark kind (point/circle/rect/segment/...); drives constant-size glyphs on zoom
  tooltip?: string;
  hover_group?: string;
  hover_color?: string; // per-element hover outline (Option 2; overrides the theme)
  selected_color?: string; // per-element selected outline (Option 2)
  legend?: string[] | string; // series this mark belongs to ("<aes>:<value>")
  legend_for?: string; // a legend swatch: the series it highlights/selects
  filter_value?: number; // value on a continuous colour scale (for the colorbar filter)
  cond?: string[]; // conditional-encoding tags ("<sel>:<aes>") this element participates in
  filt?: string[]; // filter selection names whose filter_by() targets this element's view
  join?: string; // cross-view identity (a composition cell's original id, keys being per-cell unique)
}

// The interactive colorbar descriptor (continuous colour scale): the gradient
// bar's device-px rectangle + its value domain/orientation (from vellumplot).
interface ColorbarInfo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lo: number;
  hi: number;
  orientation: string; // "v" | "h"
  reverse?: boolean;
}

// Declarative interactivity, read off the compiled plot spec (vellumplot's
// interaction_model()). Selections are named gestures; conditions style an
// aesthetic by selection membership; filters/binds are enacted in later stages.
// The whole block is optional — absent means "no declared interaction".
interface SelDef {
  name: string;
  kind: string; // "point" | "interval"
  on: string; // "click" | "hover" | "xy" | "x" | "y"
  region?: string; // "rect" | "lasso"
  fields?: string[] | string | null;
  toggle?: boolean;
  empty?: boolean;
}
interface CondDef {
  selection: string;
  aes: string; // "color" | "fill" | ...
  if_false?: string | null; // a constant style for non-members, or null = theme dim
  empty?: boolean;
}
interface InteractionSpec {
  selections?: SelDef[];
  conditions?: CondDef[];
  filters?: { selection: string }[];
  binds?: { selection: string; aes: string }[];
}

interface Options {
  tooltip: boolean;
  hover: boolean;
  select: boolean;
  brush: boolean;
  lasso: boolean; // freehand lasso-select mode (a third toolbar mode alongside brush/pan)
  zoom: boolean;
  toolbar: boolean;
  nearest: boolean;
  // Hover aggregation. "closest" (default): the single nearest mark. "x"/"y":
  // a *unified* hover — every mark sharing the hovered x (or y) is highlighted
  // and its tooltip listed in one combined box, the shared readout line/time-
  // series charts expect. The mark x/y positions come straight from the element
  // index, so this needs no axis/scale metadata.
  hoverMode?: "closest" | "x" | "y";
  crosshair?: boolean; // draw a guide rule at the hovered position (see hoverMode)
  // What a click on a discrete-legend swatch does. "select" (default): select the
  // swatch's series (unchanged behaviour). "hide": toggle the series' visibility
  // (single click) / isolate it (double click). "mute": same, but dim rather than
  // remove. Hover always highlights the series regardless of this policy.
  legendClick?: "select" | "hide" | "mute";
  navigator?: boolean; // show an overview x-range navigator strip below the plot
  navigatorHeight?: number; // strip height in px (default 56)
  axisZoom?: boolean; // axis-aware zoom: scale the data region + re-tick the axes, keeping the frame fixed (linear cartesian panels; SVG only)
  zoomMarks?: "fixed" | "scale"; // under axis_zoom, keep glyph marks a constant pixel size ("fixed", default) or let them scale ("scale")
  tooltipDelay?: number; // ms to wait before showing the tooltip on hover (default 0)
  tooltipFollow?: boolean; // true (default): tip tracks the cursor; false: anchor above the mark
  tooltipSticky?: boolean; // true: tip accepts pointer events + lingers so links are clickable
  raster?: boolean; // the marks are a single base image; interaction is index-driven (no per-element DOM nodes)
  a11y: boolean; // screen-reader + keyboard accessibility (focusable marks, live region, data table)
  alt?: string | null; // accessible label for the whole chart (falls back to the SVG's <title>/<desc>)
  selectMode: "single" | "multiple";
  style?: StyleOpts;
  group?: string | null; // own cross-widget linking group (vellumwidget <-> vellumwidget)
  crosstalk?: string | null; // crosstalk group (interop + filter_* controls)
  export?: { filename?: string; scale?: number }; // export filename base + PNG resolution scale
}

// Widget-wide interaction theme (Option 1). Each maps to a CSS variable on the
// widget root; unset falls back to the built-in default. Per-element grammar
// styling (Option 2, carried in ElemMeta) overrides these via the same variables.
interface StyleOpts {
  hoverColor?: string | null; // outline colour for the hovered element(s)
  selectedColor?: string | null; // outline colour for selected elements
  dimOpacity?: number | null; // opacity of non-hovered elements while hovering
  tipBg?: string | null; // tooltip background colour
  tipFg?: string | null; // tooltip text colour
  tipFontSize?: string | null; // tooltip font size (any CSS length)
  tipMaxWidth?: string | null; // tooltip max width (any CSS length)
}

// Element metadata arrives from R in a columnar form (one array per field,
// aligned by index) — far cheaper to serialise to JSON at large N than one object
// per element. `key` and the bbox are always present; optional meta columns are
// present only when some element carries them, with `null` where a given element
// lacks the field. `legend` is ragged (a mark can belong to several series) so it
// is a list-column (each entry a string, a string[], or absent). A length-1
// column is auto-unboxed by htmlwidgets to a scalar, so every column is read
// through `asArray`. A legacy per-record array (`ElemMeta[]`) is still accepted.
interface ColumnElements {
  key: string[] | string;
  mark?: (string | null)[] | string;
  x0?: (number | null)[] | number;
  y0?: (number | null)[] | number;
  x1?: (number | null)[] | number;
  y1?: (number | null)[] | number;
  tooltip?: (string | null)[] | string;
  hover_group?: (string | null)[] | string;
  hover_color?: (string | null)[] | string;
  selected_color?: (string | null)[] | string;
  legend_for?: (string | null)[] | string;
  legend?: (string[] | string | null)[] | string[] | string;
  filter_value?: (number | null)[] | number;
  cond?: (string[] | string | null)[] | string[] | string;
  filt?: (string[] | string | null)[] | string[] | string;
  join?: (string | null)[] | string;
}

// Per-axis scale descriptor (from vellumplot's `scales` panel meta): the data and
// native (transformed, expanded) domains + the transform, enough to invert a
// device pixel back to a data value. See `.vellumwidget_panels()` on the R side.
interface AxisScale {
  type: string; // continuous | log10 | discrete | binned | date | datetime
  transform: string; // identity | log10 | sqrt | reverse (native -> data)
  data_lo: number;
  data_hi: number;
  native_lo: number;
  native_hi: number;
  time_unit?: string; // "day" | "second" for date/datetime axes
}
// A cartesian data panel: its device-px rectangle (from vellum's resolved layout)
// plus each axis's scale descriptor. The px rect + native domain give the affine
// device px <-> native; the transform closes native <-> data.
interface PanelInfo {
  name: string;
  px0: number;
  py0: number;
  px1: number;
  py1: number;
  x?: AxisScale;
  y?: AxisScale;
}

interface Payload {
  svg: string;
  elements: ElemMeta[] | ColumnElements;
  panels?: PanelInfo[] | PanelInfo; // cartesian data panels (htmlwidgets may unbox a length-1 list)
  colorbar?: ColorbarInfo; // interactive continuous-colour colorbar (optional)
  interactions?: InteractionSpec; // declarative interactivity (from the plot spec)
  options: Options;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- pure geometry helpers (exposed on window.__vellumwidgetTest for headless tests) ----

function rectsIntersect(a: Bbox, b: Bbox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// Euclidean distance from a point to a bbox (0 when inside).
function distToBbox(x: number, y: number, b: Bbox): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.sqrt(dx * dx + dy * dy);
}

function hasBbox(e: ElemMeta): e is ElemMeta & Bbox {
  return typeof e.x0 === "number" && typeof e.y0 === "number";
}

// Read a payload column as an array: htmlwidgets auto-unboxes a length-1 vector to
// a scalar, so wrap those back into a one-element array; `null`/absent -> `[]`.
function asColumn<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Reconstruct the per-element `ElemMeta[]` view the runtime uses from whichever
// shape R sent: a columnar `ColumnElements` (the current wire format) or a legacy
// `ElemMeta[]` (also what the empty case `[]` and the test harness use). Purely a
// decode step — the resulting objects are identical to the old per-record payload,
// so nothing downstream changes.
function normalizeElements(raw: ElemMeta[] | ColumnElements | null | undefined): ElemMeta[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw; // legacy per-record payload (and the empty [])
  const c = raw as ColumnElements;
  const key = asColumn<string>(c.key);
  const n = key.length;
  if (!n) return [];
  const x0 = asColumn<number | null>(c.x0);
  const y0 = asColumn<number | null>(c.y0);
  const x1 = asColumn<number | null>(c.x1);
  const y1 = asColumn<number | null>(c.y1);
  const mark = c.mark != null ? asColumn<string | null>(c.mark) : null;
  const tooltip = c.tooltip != null ? asColumn<string | null>(c.tooltip) : null;
  const hoverGroup = c.hover_group != null ? asColumn<string | null>(c.hover_group) : null;
  const hoverColor = c.hover_color != null ? asColumn<string | null>(c.hover_color) : null;
  const selectedColor = c.selected_color != null ? asColumn<string | null>(c.selected_color) : null;
  const legendFor = c.legend_for != null ? asColumn<string | null>(c.legend_for) : null;
  const legend = c.legend != null ? asColumn<string[] | string | null>(c.legend) : null;
  const filterValue = c.filter_value != null ? asColumn<number | null>(c.filter_value) : null;
  const cond = c.cond != null ? asColumn<string[] | string | null>(c.cond) : null;
  const filt = c.filt != null ? asColumn<string[] | string | null>(c.filt) : null;
  const join = c.join != null ? asColumn<string | null>(c.join) : null;
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
    if (filt) {
      const v = filt[i];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        e.filt = Array.isArray(v) ? (v as string[]) : [String(v)];
      }
    }
    if (join && join[i] != null) e.join = String(join[i]);
    out[i] = e;
  }
  return out;
}

// The panels payload as an array (htmlwidgets may unbox a length-1 list to a
// single object). Absent/`null` -> `[]` (a scene with no cartesian scale
// descriptors — the widget stays pixel-only).
function normalizePanels(raw: PanelInfo[] | PanelInfo | null | undefined): PanelInfo[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

// Distinct keys of every element whose bbox intersects the brush rectangle. A key
// that spans several elements (an error bar's segments, a box's rect + whiskers)
// is returned once, so the brush key list and the `_brush` Shiny event never
// over-count a multi-element mark.
function brushKeys(elems: ElemMeta[], brush: Bbox): string[] {
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
interface Pt { x: number; y: number; }
function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
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
function lassoKeys(elems: ElemMeta[], poly: Pt[]): string[] {
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
function polyBounds(poly: Pt[]): Bbox {
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
function nearestKey(elems: ElemMeta[], x: number, y: number, maxDist: number): string | null {
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
function nearestSortedIdx(sorted: number[] | Float64Array, target: number): number {
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
function columnTolerance(sorted: number[] | Float64Array): number {
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > 1e-6 && g < minGap) minGap = g;
  }
  return isFinite(minGap) ? minGap / 2 : 1;
}

// --- data-space mapping (device px -> native -> data, per panel) ---
// Transforms this runtime can invert native -> data. vellumplot's built-in
// registry is exactly these four; a plot built with a custom `scales::transform_*`
// object (e.g. log2, pseudo_log) reports some other name, which we CANNOT invert —
// so we decline data-space mapping for that axis rather than return a native value
// as if it were data (which would be silently wrong).
const INVERTIBLE: Record<string, boolean> = { identity: true, log10: true, sqrt: true, reverse: true };
// Glyph marks whose pixel size is decorative, so under axis-aware zoom they keep a
// constant size (position re-maps, size does not) — the "real chart" behaviour.
// Positional marks (rect/segment/line/path/polygon) instead scale with the data;
// only their stroke width is held constant (non-scaling-stroke). See
// `_docs/CONSTANT-SIZE-MARKS-DESIGN.md`.
const GLYPH_MARKS: Record<string, boolean> = { point: true, circle: true, hexagon: true, sector: true };
function canInvert(ax: AxisScale | undefined): ax is AxisScale {
  return !!ax && INVERTIBLE[ax.transform] === true;
}
// Map a native (transformed) coordinate back to a data value, inverting the axis
// transform. `reverse` maps data identically (the flip lives in a decreasing
// native domain), and identity / date / datetime pass through (date values are the
// numeric epoch). Only ever called for an invertible transform (see canInvert).
function nativeToData(ax: AxisScale, nv: number): number {
  switch (ax.transform) {
    case "log10": return Math.pow(10, nv);
    case "sqrt": return nv * nv;
    case "reverse": return nv; // identity map; the reversal is the decreasing domain
    default: return nv; // identity (and date/datetime epochs)
  }
}
// Device-px x -> data, via the panel's x affine (px0->native_lo, px1->native_hi);
// null when the axis is absent, degenerate, or a transform we can't invert.
function pxToDataX(p: PanelInfo, px: number): number | null {
  const ax = p.x;
  if (!canInvert(ax) || p.px1 === p.px0) return null;
  const nv = ax.native_lo + ((px - p.px0) / (p.px1 - p.px0)) * (ax.native_hi - ax.native_lo);
  return nativeToData(ax, nv);
}
// Device-px y -> data. Device y is top-down, so py0 (top) is the HIGH data value
// (native_hi) and py1 (bottom) the low.
function pxToDataY(p: PanelInfo, py: number): number | null {
  const ax = p.y;
  if (!canInvert(ax) || p.py1 === p.py0) return null;
  const frac = (py - p.py0) / (p.py1 - p.py0); // 0 at top, 1 at bottom
  const nv = ax.native_hi + frac * (ax.native_lo - ax.native_hi);
  return nativeToData(ax, nv);
}

// New viewBox after zooming by `factor` about user-space point (cx, cy) — the
// point under the cursor stays put (§6: the JS transforms the SVG viewport).
function zoomViewBox(vb: ViewBox, factor: number, cx: number, cy: number): ViewBox {
  const w = vb.w / factor;
  const h = vb.h / factor;
  return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
}

function parseViewBox(s: string | null): ViewBox | null {
  if (!s) return null;
  const p = s.trim().split(/[ ,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
  return { x: p[0], y: p[1], w: p[2], h: p[3] };
}

function fmtViewBox(vb: ViewBox): string {
  return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
}

// Is the view zoomed IN relative to the original (so the base raster would be
// upscaled and blur)? Panning or zooming out keeps the image crisp, so the crisp
// canvas point-layer only engages when the view is narrower/shorter than original.
function isZoomedIn(vb: ViewBox, vb0: ViewBox): boolean {
  return vb.w < vb0.w * 0.999 || vb.h < vb0.h * 0.999;
}

// Map a point in viewBox (user) space to canvas backing-store pixels for the
// current view (`cw`/`ch` are the canvas backing-store dimensions).
function userToCanvas(vb: ViewBox, cw: number, ch: number, x: number, y: number): { px: number; py: number } {
  return { px: ((x - vb.x) / vb.w) * cw, py: ((y - vb.y) / vb.h) * ch };
}

// --- axis-aware zoom (Phase 2): scale only the pannable panel, not the viewBox ---
// Under axis_zoom the base SVG viewBox is held fixed at `vb0` (so the axes, titles
// and legend never move) and the data region is scaled by an affine T instead. T
// is exactly the transform the viewBox WOULD have applied to the whole scene: it
// maps the current view rect `vb` onto `vb0`, so marks inside the pan group appear
// identically zoomed while their clip and the surrounding furniture stay put. One
// matrix, and its inverse is the single hit-test seam (the device-px scene point
// under the cursor is T⁻¹(toUser)). See the pannable-panel contract in vellum.
interface PanTransform { sx: number; sy: number; tx: number; ty: number; }
function viewToPan(vb: ViewBox, vb0: ViewBox): PanTransform {
  const sx = vb.w ? vb0.w / vb.w : 1;
  const sy = vb.h ? vb0.h / vb.h : 1;
  return { sx: sx, sy: sy, tx: vb0.x - vb.x * sx, ty: vb0.y - vb.y * sy };
}
// Inverse of T: a point in the fixed base (vb0) user space -> the device-px scene
// coordinate under it (which mark sits there). This is what every gesture wants
// ("what scene point is under the cursor"); under normal zoom it equals toUser,
// under axis_zoom it is T⁻¹(toUser).
function panToView(vb: ViewBox, vb0: ViewBox, x: number, y: number): { x: number; y: number } {
  const t = viewToPan(vb, vb0);
  return { x: t.sx ? vb.x + (x - vb0.x) / t.sx : x, y: t.sy ? vb.y + (y - vb0.y) / t.sy : y };
}
// "Nice" round tick values covering [lo, hi] (1/2/5 x 10^k steps), a handful of
// them. The client-side re-ticker for a linear axis: vellum's own ticks span the
// full data range and don't follow a zoom, so we regenerate for the visible range.
function niceTicks(lo: number, hi: number, count: number): number[] {
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo || count < 1) return [];
  const step0 = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.round(v / step) * step); // snap to the grid (kill fp drift)
  }
  return out;
}
// Format a linear tick value for a given step: enough decimals to tell adjacent
// ticks apart, trailing zeros trimmed. (Date/log axes fall back to viewBox zoom, so
// this only ever formats plain numbers.)
function fmtTick(v: number, step: number): string {
  if (v === 0) return "0";
  const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-9)));
  let s = v.toFixed(decimals);
  if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
  return s;
}
// Forward axis transform data -> native (inverse of nativeToData). Only ever
// called for identity/reverse under axis_zoom (native == data numerically), but
// kept general for symmetry with nativeToData.
function dataToNative(ax: AxisScale, d: number): number {
  switch (ax.transform) {
    case "log10": return Math.log10(d);
    case "sqrt": return Math.sqrt(d);
    default: return d; // identity, reverse (the flip lives in the decreasing domain)
  }
}

// Union bbox of the given keys' elements (for zoom-to-selection), or null.
function unionBbox(elems: ElemMeta[], keys: Record<string, boolean>): Bbox | null {
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

// ---- DOM helpers ----

const STYLE_ID = "vellumwidget-style";

const VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
/* The stage shrink-wraps the base svg in BOTH dimensions (inline-block sizes to
   content), so its box equals the svg's rendered box. The absolute overlays below
   fill THIS box, not the root's — the root can be taller AND wider than the svg
   (htmlwidgets stamps an explicit height; a fluid layout can stretch the width),
   and sizing the overlays to the root would letterbox their viewBox and shift
   every ring (down if the root is taller, sideways if it is wider). */
.vellumwidget-root .vellumwidget-stage { position: relative; display: inline-block; }
.vellumwidget-root .vellumwidget-svg-holder svg { max-width: 100%; height: auto; display: block; }
.vellumwidget-gesture .vellumwidget-svg-holder svg { touch-action: none; }
.vellumwidget-root.vellumwidget-mode-pan .vellumwidget-svg-holder svg { cursor: grab; }
.vellumwidget-root.vellumwidget-panning .vellumwidget-svg-holder svg { cursor: grabbing; }
.vellumwidget-root [data-key] { cursor: pointer; }
[data-key].vellumwidget-filtered { display: none; }
/* Legend click-to-hide / -mute (independent of the crosstalk cross-filter above,
   so the two never clobber each other). hidden removes the series' marks; muted
   keeps them but fades them right back; legend-off dims the toggled-off swatch
   so the legend shows which series are on. */
[data-key].vellumwidget-legend-hidden { display: none; }
[data-key].vellumwidget-legend-muted { opacity: 0.12; }
[data-key].vellumwidget-legend.vellumwidget-legend-off { opacity: 0.4; }
.vellumwidget-hovering [data-key]:not(.vellumwidget-legend) { opacity: var(--vellumwidget-dim-opacity, 0.28); }
.vellumwidget-hovering [data-key].vellumwidget-hl { opacity: 1; }
/* Conditional encoding (condition()): a non-member of an active selection with no
   explicit if_false is dimmed to the theme's dim opacity (the spotlight). An
   explicit if_false colour is applied inline (see applyConditions()). */
[data-key].vellumwidget-cond-dim { opacity: var(--vellumwidget-dim-opacity, 0.28); }
/* Large-scene hover: instead of the CSS rule above restyling every keyed node
   (O(n) per hover), the whole plot is dimmed once via the holder's opacity and the
   hovered marks are re-drawn crisp in this overlay (O(hovered)). See setHover(). */
.vellumwidget-root .vellumwidget-svg-holder { transition: none; }
/* Crisp-zoom point layer: above the base image, below the overlay rings. Never
   intercepts hit-testing (that stays on the base svg). Hidden until zoomed in. */
.vellumwidget-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
.vellumwidget-dim-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
/* Continuous colorbar filter: an overlay on the gradient bar. The dim rects cover
   the out-of-range ends; the handles are draggable. Out-of-range marks fade. */
.vellumwidget-colorbar-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 6; overflow: visible;
}
.vellumwidget-cb-dim { fill: rgba(255,255,255,0.66); pointer-events: none; }
@media (prefers-color-scheme: dark) { .vellumwidget-cb-dim { fill: rgba(17,24,39,0.66); } }
.vellumwidget-cb-handle {
  fill: #ffffff; stroke: #2563eb; stroke-width: 1.5px; pointer-events: auto;
}
.vellumwidget-root.vellumwidget-cb-v .vellumwidget-cb-handle { cursor: ns-resize; }
.vellumwidget-root.vellumwidget-cb-h .vellumwidget-cb-handle { cursor: ew-resize; }
[data-key].vellumwidget-colorfiltered { opacity: var(--vellumwidget-colorfilter-opacity, 0.12); }
/* Crosshair guide rule(s) for unified hover — above the base image / canvas,
   below the highlight rings so a highlighted mark still reads on top. */
.vellumwidget-crosshair-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 4; overflow: visible;
}
/* Axis-aware zoom: re-ticked axis LABELS overlay (gridlines are drawn inside the
   base svg's panel, under the marks). Pinned to the fixed base coordinate space. */
.vellumwidget-retick-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 3; overflow: visible;
}
.vellumwidget-crosshair-line {
  stroke: var(--vellumwidget-crosshair-stroke, rgba(75,85,99,0.85));
  stroke-width: 1px; stroke-dasharray: 4 3;
}
@media (prefers-color-scheme: dark) {
  .vellumwidget-crosshair-line { stroke: var(--vellumwidget-crosshair-stroke, rgba(209,213,219,0.85)); }
}
/* Raster-mode feedback rings (hover / selection), drawn on the overlay since the
   marks are a base image with no per-element nodes. Colours reuse the same CSS
   variables as the SVG-mode highlight/selection so theming carries over. */
.vellumwidget-fb-hov { fill: none; stroke: var(--vellumwidget-hl-stroke, #2563eb); stroke-width: 2px; }
.vellumwidget-fb-sel { fill: none; stroke: var(--vellumwidget-selected-stroke, #111827); stroke-width: 1.6px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-fb-sel { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
}
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var). */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: stroke fill;
}
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, #111827);
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: stroke fill;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: stroke fill;
}
[data-key]:focus { outline: none; }
[data-key]:focus-visible { outline: 2px solid var(--vellumwidget-focus-stroke, #2563eb); outline-offset: 1px; }
/* Visually-hidden but exposed to assistive technology (live region + data table). */
.vellumwidget-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; border: 0;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
.vellumwidget-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: var(--vellumwidget-tip-bg, rgba(17,24,39,0.94)); color: var(--vellumwidget-tip-fg, #fff);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: var(--vellumwidget-tip-fontsize, 12px); line-height: 1.45;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap;
  max-width: var(--vellumwidget-tip-maxwidth, 320px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.vellumwidget-tip.vellumwidget-show { opacity: 1; }
/* Sticky tooltip: accepts pointer events so links/buttons inside it are usable. */
.vellumwidget-tip.vellumwidget-tip-sticky { pointer-events: auto; }
.vellumwidget-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
/* Overview navigator: a full-width strip below the plot (a squashed mini-render
   of the whole scene) with a draggable/resizable window marking the visible x-range. */
.vellumwidget-nav {
  position: relative; width: 100%; margin-top: 4px; box-sizing: border-box;
  border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; overflow: hidden;
  background: rgba(0,0,0,0.02); touch-action: none; user-select: none;
}
.vellumwidget-nav-mini { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.85; }
.vellumwidget-nav-mini svg { width: 100%; height: 100%; display: block; }
/* The two regions outside the window are dimmed; the window itself is clear. */
.vellumwidget-nav-window {
  position: absolute; top: 0; bottom: 0; z-index: 2; cursor: grab;
  border-left: 1px solid #2563eb; border-right: 1px solid #2563eb;
  background: rgba(37,99,235,0.10); box-shadow: 0 0 0 100vmax rgba(0,0,0,0.12);
}
.vellumwidget-nav-window.vellumwidget-nav-grabbing { cursor: grabbing; }
.vellumwidget-nav-handle {
  position: absolute; top: 0; bottom: 0; width: 8px; z-index: 3; cursor: ew-resize;
  background: #2563eb; opacity: 0.35;
}
.vellumwidget-nav-handle-l { left: -1px; }
.vellumwidget-nav-handle-r { right: -1px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-nav { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.03); }
}
.vellumwidget-root.vellumwidget-mode-lasso .vellumwidget-svg-holder svg { cursor: crosshair; }
.vellumwidget-lasso {
  fill: rgba(37,99,235,0.10); stroke: #2563eb; stroke-width: 1px; stroke-dasharray: 4 3;
}
.vellumwidget-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.vellumwidget-root:hover .vellumwidget-toolbar { opacity: 1; }
.vellumwidget-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.vellumwidget-toolbar button:hover { background: rgba(0,0,0,0.08); }
.vellumwidget-toolbar button.vellumwidget-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .vellumwidget-tip { background: var(--vellumwidget-tip-bg, rgba(243,244,246,0.96)); color: var(--vellumwidget-tip-fg, #111827); }
  [data-key].vellumwidget-selected { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
  .vellumwidget-toolbar { background: rgba(31,41,55,0.9); }
  .vellumwidget-toolbar button { color: #f3f4f6; }
  .vellumwidget-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = VELLUMWIDGET_CSS;
  document.head.appendChild(s);
}

function cssEscape(value: string): string {
  const anyCss = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
  return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
}

// Render a tooltip string as *safe* HTML: escape everything, then re-enable a
// fixed allow-list of inert, attribute-free tags. Data values can't inject
// scripts, event handlers, or attributes (an opening tag carrying attributes
// stays escaped), so an author can build multi-line / bold tooltips (e.g. via
// vellumplot's `tooltip =`) with `<br>` / `<b>` without any XSS surface.
const TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
function sanitizeTip(s: string): string {
  let out = String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  for (const t of TIP_TAGS) {
    out = out
      .replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">")
      .replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">")
      .replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
  }
  return out;
}

// Plain-text form of a (possibly HTML) tooltip, for an aria-label / table cell:
// drop tags, collapse whitespace. No DOM, so it is safe in any context.
function stripTags(s: string): string {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function keyOf(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  const hit = el.closest("[data-key]");
  return hit ? hit.getAttribute("data-key") : null;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DRAG_THRESHOLD = 3; // px before a mousedown becomes a drag (vs a click)

// --- own cross-widget linking bus (vellumwidget <-> vellumwidget, no dependency) ---------
// Page-global (the bundle loads once, so all widgets share this scope). Members
// of the same group receive each other's selection sets by data-key. crosstalk
// (below) is the optional bridge to the wider htmlwidgets ecosystem; this bus is
// what links vellum widgets when crosstalk is not in play.
// A linked view broadcast: the pan/zoom expressed as a *fraction* of the sender's
// own original viewBox (`x`/`y` = offset of the view's top-left as a fraction of
// the full extent; `w`/`h` = the view's size as a fraction). Sharing the fraction
// (not raw device px) links widgets of different sizes correctly — each applies
// the same relative pan/zoom to its own viewBox.
interface ViewFraction {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface BusMember {
  token: object;
  onSelect: (keys: string[]) => void;
  onView?: (v: ViewFraction) => void; // linked pan/zoom (optional)
}
const vellumwidgetBus: Record<string, BusMember[]> = {};
function busJoin(group: string, m: BusMember): void {
  (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
}
function busPublish(group: string, sender: object, keys: string[]): void {
  const members = vellumwidgetBus[group] || [];
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender) members[i].onSelect(keys);
  }
}
// Broadcast a view change to the group's other members (linked pan/zoom).
function busPublishView(group: string, sender: object, v: ViewFraction): void {
  const members = vellumwidgetBus[group] || [];
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender && members[i].onView) members[i].onView!(v);
  }
}

// Minimal shape of the crosstalk globals we use (loaded as an htmlwidgets
// dependency when a SharedData is passed; absent otherwise).
interface CrosstalkHandle {
  on: (type: string, cb: (e: { value: string[] | null; sender?: unknown }) => void) => void;
  set: (keys: string[] | null, extra?: unknown) => void;
}
interface Crosstalk {
  SelectionHandle: new (group: string) => CrosstalkHandle;
  FilterHandle: new (group: string) => CrosstalkHandle;
}
function getCrosstalk(): Crosstalk | null {
  return (window as unknown as { crosstalk?: Crosstalk }).crosstalk || null;
}

HTMLWidgets.widget({
  name: "vellumwidget",
  type: "output",

  factory: function (el: HTMLElement) {
    ensureStyle();
    el.classList.add("vellumwidget-root");

    const tip = document.createElement("div");
    tip.className = "vellumwidget-tip";
    const brushBox = document.createElement("div");
    brushBox.className = "vellumwidget-brush";

    let holder: HTMLElement | null = null;
    let stage: HTMLElement | null = null; // shrink-wraps the base svg; overlays fill it
    let svgEl: SVGSVGElement | null = null;
    let toolbarEl: HTMLElement | null = null;
    // Overview navigator (opt-in): a strip below the plot with a draggable window
    // marking the visible x-range. Built once per render when opts.navigator.
    let navEl: HTMLElement | null = null;
    let navWindow: HTMLElement | null = null;
    // Continuous colorbar filter: the descriptor + its overlay layer, the current
    // selected value range (null = full), and the set of marks currently filtered
    // out (dimmed + inert), so hit-testing skips them like any other filter.
    let colorbar: ColorbarInfo | null = null;
    let colorbarLayer: SVGSVGElement | null = null;
    // Declarative interactivity (spec-driven): the interaction block + derived
    // indexes. `condTagElems` maps a "<sel>:<aes>" tag to the keys carrying it;
    // `lastHoverKeys` is the current hover set (a hover-triggered selection reads
    // it). Reset per render; empty when the plot declares no interaction.
    let interactions: InteractionSpec | null = null;
    let condTagElems: Record<string, string[]> = {};
    let filtSelElems: Record<string, string[]> = {}; // filter selection -> keys of its target view
    let joinOf: Record<string, string> = {}; // key -> cross-view join id (compositions)
    let lastHoverKeys: string[] = [];
    let colorRange: { a: number; b: number } | null = null;
    let colorHiddenSet: Record<string, boolean> = {};
    let meta: Record<string, ElemMeta> = {};
    let groups: Record<string, string[]> = {};
    let legendIndex: Record<string, string[]> = {}; // series key -> member element keys
    let legendSwatch: Record<string, string[]> = {}; // series key -> its legend swatch element keys
    let legendOff: Record<string, boolean> = {}; // series toggled off via a legend-click (hide/mute)
    let hiddenKeySet: Record<string, boolean> = {}; // member keys currently hidden (legendClick="hide")
    let filteredKeySet: Record<string, boolean> = {}; // keys hidden by a cross-filter (crosstalk / vw_filter)
    let elements: ElemMeta[] = [];
    let panels: PanelInfo[] = []; // cartesian data panels with scale descriptors (data-space mapping)
    let selected: Record<string, boolean> = {};
    let nodesByKey: Record<string, Element[]> = {}; // key -> SVG nodes (built once per render)
    let hoverRAF = 0; // rAF handle throttling the nearest-mark scan
    // Spatial index over element bboxes (built once per render), so nearest-mark
    // hover and brush hit-testing are O(log n)/O(k) instead of O(n) linear scans —
    // the per-frame cost that made hover laggy on a large plot. Falls back to the
    // pure scans when absent (0 bboxed elements).
    let spatialIndex: Flatbush | null = null;
    let indexToElem: number[] = []; // flatbush item id -> index into `elements`
    // Above this many elements, dim on hover via the holder's opacity + a clone
    // overlay (O(hovered)) rather than the CSS rule that restyles every keyed node.
    const DIM_OVERLAY_MIN = 2000;
    let largeDim = false; // this render uses the overlay dim path
    let dimLayer: SVGSVGElement | null = null; // overlay carrying the crisp hovered clones
    // Unified-hover axis index (built once per render): element centres sorted by
    // x and by y, so the shared readout can seed off the nearest position on one
    // axis, plus the per-axis column tolerance (see columnTolerance).
    let crosshairLayer: SVGSVGElement | null = null; // overlay carrying the guide rule(s)
    let sortedCx: number[] = [];
    let sortedCxKeys: string[] = [];
    let sortedCy: number[] = [];
    let sortedCyKeys: string[] = [];
    let tolX = 1;
    let tolY = 1;
    // Raster mode: the marks are a single base <image>, so there are no per-element
    // DOM nodes. Hover/click/brush resolve against the spatial index and draw
    // feedback rings into two overlay groups instead of toggling classes on marks.
    let rasterMode = false;
    let selGroup: SVGGElement | null = null; // persistent selection rings
    let hovGroup: SVGGElement | null = null; // transient hover ring(s)
    // Crisp-zoom canvas (Phase 6): when the view is zoomed in, the base image would
    // upscale and blur, so the points are redrawn crisp on this canvas from data
    // sampled off the base raster (centre + radius from the index bbox, colour from
    // the rendered pixel). Falls back to image-only when no 2D context is available.
    let canvasEl: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let ptCx: Float64Array | null = null; // sampled point centres (viewBox space)
    let ptCy: Float64Array | null = null;
    let ptRad: Float64Array | null = null; // sampled point radii (viewBox units)
    let ptRGB: Uint8Array | null = null; // packed [r,g,b, r,g,b, …] per sampled point
    let ptN = 0; // number of sampled (drawable) points
    // Cap on how many selection rings to draw: a huge brush selects thousands of
    // points, and drawing a ring per point would reintroduce the DOM blowup raster
    // mode exists to avoid. The selection set itself is always fully tracked and
    // reported; only the on-canvas rings are bounded.
    const OVERLAY_MARK_CAP = 2000;
    let opts: Options = {
      tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true,
      toolbar: true, nearest: true, a11y: true, selectMode: "multiple",
      hoverMode: "closest", crosshair: false, navigator: false
    };
    // --- accessibility state ---
    let liveRegion: HTMLElement | null = null; // aria-live announcer
    let tableEl: HTMLElement | null = null; // hidden data-table fallback
    let focusables: { key: string; node: Element }[] = []; // roving-tabindex marks, in draw order
    let focusIdx = -1; // index into focusables of the currently-focused mark, or -1
    let vb0: ViewBox | null = null; // original viewBox (for reset)
    let vb: ViewBox | null = null; // current viewBox
    // Axis-aware zoom (opt-in). When active, applyViewBox scales `panGroup` by T
    // instead of moving the base viewBox, and hit-testing routes through panToView.
    let panGroup: SVGGElement | null = null; // the pannable data group (transformed by T)
    let outerPanelGroup: SVGGElement | null = null; // its clipped parent (host for re-ticked gridlines)
    let axisPanel: PanelInfo | null = null; // the single cartesian panel that drives axis_zoom
    let axisZoomActive = false; // opt-in on + a single linear cartesian pannable panel present
    let retickLayer: SVGSVGElement | null = null; // overlay carrying re-ticked axis labels (fixed at vb0)
    let retickGrid: SVGGElement | null = null; // re-ticked gridlines (inside the clipped panel, below marks)
    // Range-navigator x-only zoom: with the navigator on, zoom/pan is 1-D along x
    // (the selected x-range fills the width; the full y-range stays on screen), the
    // way a time-series range selector behaves. Implemented as a non-uniform
    // (`preserveAspectRatio="none"`) view with y pinned to the full extent.
    let xZoom = false;
    const axisStyle = { // presentation scraped from vellum's own axis/grid nodes so the re-tick matches the theme
      textFill: "#333333", fontFamily: "sans-serif", fontSize: 12,
      gridStroke: "#ffffff", gridWidth: 1,
      xBaselineY: 0, yLabelX: 0 // device-px placement of the x/y tick labels
    };
    let mode: "brush" | "pan" | "lasso" = "brush";
    let lastBrush: Bbox | null = null; // last brushed region (user coords)
    let lassoPts: Pt[] = []; // in-progress lasso path (user/viewBox coords)
    let lassoEl: SVGPolygonElement | null = null; // the drawn lasso outline (in crosshairLayer)
    // Linking state.
    const selfToken = {}; // identity on the own bus
    let group: string | null = null; // own-bus group
    let receivingView = false; // applying a peer's linked view (suppresses re-broadcast)
    let joined = false; // joined the own bus already (guard re-render)
    let ctSel: CrosstalkHandle | null = null; // crosstalk selection handle
    let ctFilt: CrosstalkHandle | null = null; // crosstalk filter handle

    // --- coordinates: client px -> SVG user space (viewBox coords) ---
    // The live viewBox: the zoom/pan state `vb`, else the svg's viewBox attribute,
    // else the rendered box (a raw vellum scene may omit a viewBox).
    function currentViewBox(): ViewBox {
      if (vb) return vb;
      const parsed = svgEl ? parseViewBox(svgEl.getAttribute("viewBox")) : null;
      if (parsed) return parsed;
      const r = (svgEl || el).getBoundingClientRect();
      return { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
    }
    // Client px -> SVG user (viewBox) space, via the ACTUAL rendered box + the
    // current viewBox. We deliberately do NOT use getScreenCTM(): for an svg with
    // width/height attributes that is then CSS-scaled (the widget's
    // `max-width:100%`), getScreenCTM() can report the attribute-based scale rather
    // than the rendered one, which under-maps the pointer toward the top-left — so
    // hover snapped to a mark up-and-left of the cursor while click (which uses the
    // DOM target) stayed correct. `height:auto` keeps the rendered box at the
    // viewBox aspect (no letterboxing), so this linear map is exact.
    function toUser(clientX: number, clientY: number): { x: number; y: number } {
      const r = (svgEl || el).getBoundingClientRect();
      const view = currentViewBox();
      const fx = r.width ? (clientX - r.left) / r.width : 0;
      const fy = r.height ? (clientY - r.top) / r.height : 0;
      return { x: view.x + fx * view.w, y: view.y + fy * view.h };
    }
    // The device-px scene point under a client position, accounting for axis_zoom's
    // panel transform. Under normal zoom this is just toUser; under axis_zoom the
    // marks are scaled by T within a fixed viewBox, so the point under the cursor is
    // T⁻¹(toUser). Every gesture/hit-test uses this, so the two modes share one path.
    function toView(clientX: number, clientY: number): { x: number; y: number } {
      const u = toUser(clientX, clientY);
      if (axisZoomActive && vb && vb0) return panToView(vb, vb0, u.x, u.y);
      return u;
    }

    // Client px -> scene (element-bbox) coords, calibrated from the ACTUAL rendered
    // position of keyed elements versus their known scene bboxes. This is the
    // robust hit-test mapping: getScreenCTM() and rect+viewBox math both assume the
    // viewBox scales uniformly into the element's box, which is NOT how the content
    // is laid out when the svg carries width/height attributes and is CSS-scaled —
    // there the content renders ~1:1 and the viewBox math offsets the pointer (the
    // hover-picked-the-wrong-mark bug). Fitting screen<->bbox from real elements is
    // exact under any viewBox / width-attr / CSS-scale / zoom combination (the DOM
    // rects already reflect the current transform, incl. axis_zoom's mark scaling —
    // so no separate panToView is needed). Per-axis two-point fit over the
    // most-separated elements; falls back to toView() when it can't calibrate.
    function calibrateXform(): { sx: number; ox: number; sy: number; oy: number } | null {
      let xi: ElemMeta | null = null, xj: ElemMeta | null = null;
      let yi: ElemMeta | null = null, yj: ElemMeta | null = null;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        const scx = (e.x0! + e.x1!) / 2, scy = (e.y0! + e.y1!) / 2;
        if (!xi || scx < (xi.x0! + xi.x1!) / 2) xi = e;
        if (!xj || scx > (xj.x0! + xj.x1!) / 2) xj = e;
        if (!yi || scy < (yi.y0! + yi.y1!) / 2) yi = e;
        if (!yj || scy > (yj.y0! + yj.y1!) / 2) yj = e;
      }
      if (!xi || !xj || !yi || !yj) return null;
      const scr = (e: ElemMeta): { x: number; y: number } | null => {
        const n = elementsForKey(e.key)[0] as Element | undefined;
        if (!n) return null;
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const xa = scr(xi), xb = scr(xj), ya = scr(yi), yb = scr(yj);
      if (!xa || !xb || !ya || !yb) return null;
      const dScx = (xj.x0! + xj.x1!) / 2 - (xi.x0! + xi.x1!) / 2;
      const dScrx = xb.x - xa.x;
      const dScy = (yj.y0! + yj.y1!) / 2 - (yi.y0! + yi.y1!) / 2;
      const dScry = yb.y - ya.y;
      if (Math.abs(dScrx) < 1 || Math.abs(dScry) < 1) return null; // too close to fit
      const sx = dScx / dScrx, ox = (xi.x0! + xi.x1!) / 2 - xa.x * sx;
      const sy = dScy / dScry, oy = (yi.y0! + yi.y1!) / 2 - ya.y * sy;
      return { sx, ox, sy, oy };
    }
    function clientToScene(clientX: number, clientY: number): { x: number; y: number } {
      const f = calibrateXform();
      if (!f) return toView(clientX, clientY);
      return { x: f.ox + clientX * f.sx, y: f.oy + clientY * f.sy };
    }

    // --- highlight / tooltip (Phase 3) ---
    // Nodes are cached per render (built in renderValue), so a hover/select that
    // touches many keys is O(keys) map lookups instead of a `querySelectorAll`
    // per key — the main per-interaction cost at large N. The DOM is static after
    // render, so the cache stays valid.
    function elementsForKey(k: string): Element[] {
      const cached = nodesByKey[k];
      if (cached) return cached;
      if (!holder) return [];
      return Array.prototype.slice.call(holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
    }
    function addClassForKeys(keys: string[], cls: string): void {
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
      }
    }
    function clearClass(cls: string): void {
      if (!holder) return;
      const nodes = holder.querySelectorAll("." + cls);
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
    }
    // The keys a hover or click on `k` acts on: a legend swatch drives its whole
    // series (`legend_for` -> the marks whose `legend` contains it); a mark
    // projects by its `hover_group`; otherwise just itself.
    function linkedKeys(k: string): string[] {
      const m = meta[k];
      if (m && m.legend_for != null) return (legendIndex[m.legend_for] || []).concat([k]);
      const g = m && m.hover_group;
      return g && groups[g] ? groups[g] : [k];
    }
    // --- legend click-to-hide / -isolate ---
    function legendPolicy(): "select" | "hide" | "mute" {
      return opts.legendClick || "select";
    }
    // The series a legend swatch `k` drives, or null if `k` is not a swatch.
    function swatchSeries(k: string | null): string | null {
      if (k == null) return null;
      const m = meta[k];
      return m && m.legend_for != null ? m.legend_for : null;
    }
    // Reflect `legendOff` in the DOM: hide (or mute) each toggled-off series' marks
    // and dim its swatch. Rebuilds `hiddenKeySet` (the marks the hover path skips so
    // a hidden point isn't silently hovered). A no-op under the "select" policy.
    function applyLegend(): void {
      clearClass("vellumwidget-legend-hidden");
      clearClass("vellumwidget-legend-muted");
      clearClass("vellumwidget-legend-off");
      hiddenKeySet = {};
      const pol = legendPolicy();
      if (pol === "select") return;
      const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
      for (const s in legendOff) {
        if (!legendOff[s]) continue;
        const members = legendIndex[s] || [];
        addClassForKeys(members, cls);
        if (pol === "hide") for (let i = 0; i < members.length; i++) hiddenKeySet[members[i]] = true;
        addClassForKeys(legendSwatch[s] || [], "vellumwidget-legend-off");
      }
    }
    // Single click: toggle one series on/off.
    function legendToggle(series: string): void {
      legendOff[series] = !legendOff[series];
      applyLegend();
    }
    // Double click: isolate this series (turn every other off); if it is already
    // the only one on, restore all — the plotly/echarts legend convention.
    function legendIsolate(series: string): void {
      const all = Object.keys(legendIndex);
      const others = all.filter((s) => s !== series);
      const isolated = !legendOff[series] && others.every((s) => legendOff[s]);
      legendOff = {};
      if (!isolated) for (let i = 0; i < others.length; i++) legendOff[others[i]] = true;
      applyLegend();
    }
    // --- spatial index (nearest / brush) ---
    // Rebuild the Flatbush index from the current elements' bboxes. Only bboxed
    // elements are indexed; `indexToElem` maps a flatbush item id back to its
    // `elements` position. No index (0 bboxed) -> queries fall back to the pure
    // linear scans, which are correct at any size.
    function buildSpatialIndex(): void {
      spatialIndex = null;
      indexToElem = [];
      let count = 0;
      for (let i = 0; i < elements.length; i++) if (hasBbox(elements[i])) count++;
      if (!count) return;
      const idx = new Flatbush(count);
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        idx.add(e.x0, e.y0, e.x1, e.y1);
        indexToElem.push(i);
      }
      idx.finish();
      spatialIndex = idx;
    }
    // Build the unified-hover axis index: element centres sorted by x and by y
    // (each paired with its key), plus the per-axis grouping tolerances. Cheap and
    // only used when hoverMode is "x"/"y"; harmless to build unconditionally.
    function buildHoverAxis(): void {
      const cx: { c: number; k: string }[] = [];
      const cy: { c: number; k: string }[] = [];
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!hasBbox(e)) continue;
        cx.push({ c: (e.x0 + e.x1) / 2, k: e.key });
        cy.push({ c: (e.y0 + e.y1) / 2, k: e.key });
      }
      cx.sort((a, b) => a.c - b.c);
      cy.sort((a, b) => a.c - b.c);
      sortedCx = cx.map((p) => p.c);
      sortedCxKeys = cx.map((p) => p.k);
      sortedCy = cy.map((p) => p.c);
      sortedCyKeys = cy.map((p) => p.k);
      tolX = columnTolerance(sortedCx);
      tolY = columnTolerance(sortedCy);
    }
    // Key of the mark nearest the cursor on a single axis (x or y), ignoring the
    // other — the seed for unified hover in open space, so the shared readout
    // tracks the cursor along the axis regardless of vertical (or horizontal)
    // distance. No radius cap: the pointer is already inside the plot.
    function nearestAxisKey(axis: "x" | "y", coord: number): string | null {
      const sorted = axis === "x" ? sortedCx : sortedCy;
      const keys = axis === "x" ? sortedCxKeys : sortedCyKeys;
      const i = nearestSortedIdx(sorted, coord);
      return i >= 0 ? keys[i] : null;
    }
    // The keys forming mark `primary`'s column: every mark whose centre is within
    // the axis tolerance of `primary`'s centre on that axis. Reuses the spatial
    // index via a thin strip query (a huge perpendicular span catches the whole
    // column), so it is O(k) in the column size. Falls back to just `primary`.
    function columnKeys(primary: string, axis: "x" | "y"): string[] {
      const m = meta[primary];
      if (!m || !hasBbox(m)) return [primary];
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const SPAN = 1e7; // effectively the full perpendicular extent
      const rect: Bbox = axis === "x"
        ? { x0: cx - tolX, x1: cx + tolX, y0: -SPAN, y1: SPAN }
        : { x0: -SPAN, x1: SPAN, y0: cy - tolY, y1: cy + tolY };
      const ks = brushKeysIn(rect);
      return ks.length ? ks : [primary];
    }
    // Nearest element key within `maxDist` of (x, y) — index-backed when available.
    function nearestKeyAt(x: number, y: number, maxDist: number): string | null {
      if (spatialIndex) {
        const ids = spatialIndex.neighbors(x, y, 1, maxDist);
        return ids.length ? elements[indexToElem[ids[0]]].key : null;
      }
      return nearestKey(elements, x, y, maxDist);
    }
    // Distinct keys whose bbox intersects `rect` — index-backed when available.
    // Item ids are mapped back to element order and de-duplicated so a key spanning
    // several elements is returned once (parity with the pure `brushKeys`).
    function brushKeysIn(rect: Bbox): string[] {
      if (!spatialIndex) return brushKeys(elements, rect);
      const eids = spatialIndex.search(rect.x0, rect.y0, rect.x1, rect.y1)
        .map((id) => indexToElem[id])
        .sort((a, b) => a - b);
      const out: string[] = [];
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < eids.length; i++) {
        const k = elements[eids[i]].key;
        if (!seen[k]) {
          seen[k] = true;
          out.push(k);
        }
      }
      return out;
    }
    // Distinct keys whose centre is inside the lasso polygon — index-backed when
    // available (prefilter by the polygon's bounds, then centre-in-polygon), else
    // the pure `lassoKeys` scan.
    function lassoKeysIn(poly: Pt[]): string[] {
      if (poly.length < 3) return [];
      if (!spatialIndex) return lassoKeys(elements, poly);
      const b = polyBounds(poly);
      const eids = spatialIndex.search(b.x0, b.y0, b.x1, b.y1)
        .map((id) => indexToElem[id])
        .sort((a, b) => a - b);
      const out: string[] = [];
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < eids.length; i++) {
        const e = elements[eids[i]];
        if (seen[e.key] || !hasBbox(e)) continue;
        if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
          seen[e.key] = true;
          out.push(e.key);
        }
      }
      return out;
    }

    // --- large-scene hover dim (overlay, O(hovered)) ---
    function dimOpacityVal(): string {
      const d = opts.style && opts.style.dimOpacity;
      return d == null || (d as unknown) === "" ? "0.28" : String(d);
    }
    // Dim the whole plot once (holder opacity) and clone the highlighted marks into
    // the overlay so they stay crisp above the dim — O(hovered), not O(n).
    function showHighlightOverlay(keys: string[]): void {
      if (!holder || !dimLayer) return;
      holder.style.opacity = dimOpacityVal();
      while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) {
          const c = nodes[j].cloneNode(true) as Element;
          c.classList.add("vellumwidget-hl");
          dimLayer.appendChild(c);
        }
      }
    }
    function hideHighlightOverlay(): void {
      if (holder) holder.style.opacity = "";
      if (dimLayer) while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
    }

    // --- crisp-zoom canvas point layer (raster mode, Phase 6) ---
    // Create the canvas once (sits above the base image, below the overlay rings).
    // `getContext` may be absent (jsdom / very old browsers) — then ctx stays null
    // and every draw is a no-op, leaving the faithful base image as the only layer.
    function ensureCanvas(): void {
      if (canvasEl) return;
      canvasEl = document.createElement("canvas");
      canvasEl.className = "vellumwidget-canvas";
      canvasEl.setAttribute("aria-hidden", "true");
      // Into the stage (not the root), so `inset:0` matches the svg box; see the
      // stage note in renderValue.
      (stage || el).appendChild(canvasEl);
      ctx = typeof canvasEl.getContext === "function" ? canvasEl.getContext("2d") : null;
    }
    function clearPointData(): void {
      ptCx = ptCy = ptRad = null;
      ptRGB = null;
      ptN = 0;
      if (canvasEl) canvasEl.style.display = "none";
    }
    // Sample each keyed element's colour from the rendered base raster (its centre
    // pixel) and record centre + radius (from the index bbox). Done once per render,
    // asynchronously after the image decodes. No colour data crosses the wire — it is
    // read back from the pixels vellum already drew, so the crisp layer matches them.
    function sampleBaseRaster(): void {
      clearPointData();
      if (!rasterMode || !svgEl || !vb0) return;
      const imgNode = svgEl.querySelector("image");
      const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
      if (!href) return;
      const off = document.createElement("canvas");
      const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
      if (!octx) return; // no 2D support -> canvas zoom disabled, image-only
      const iw = Math.max(1, Math.round(vb0.w));
      const ih = Math.max(1, Math.round(vb0.h));
      const els = elements; // capture (a later re-render replaces `elements`)
      const v0 = vb0;
      const img = new Image();
      img.onload = function () {
        // Guard against a re-render having happened before decode finished.
        if (els !== elements || v0 !== vb0) return;
        off.width = iw;
        off.height = ih;
        octx.drawImage(img, 0, 0, iw, ih);
        let data: Uint8ClampedArray;
        try {
          data = octx.getImageData(0, 0, iw, ih).data;
        } catch (e) {
          return; // tainted canvas (shouldn't happen for a same-origin data: URI)
        }
        const cx: number[] = [], cy: number[] = [], rad: number[] = [], rgb: number[] = [];
        for (let i = 0; i < els.length; i++) {
          const e = els[i];
          if (!hasBbox(e)) continue;
          const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
          const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
          const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
          const o = (sy * iw + sx) * 4;
          if (data[o + 3] < 8) continue; // transparent -> background, not a drawn mark
          cx.push(mx);
          cy.push(my);
          rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
          rgb.push(data[o], data[o + 1], data[o + 2]);
        }
        ptN = cx.length;
        ptCx = Float64Array.from(cx);
        ptCy = Float64Array.from(cy);
        ptRad = Float64Array.from(rad);
        ptRGB = Uint8Array.from(rgb);
        drawPoints(); // in case the view is already zoomed
      };
      img.onerror = function () {};
      img.src = href;
    }
    // Redraw the crisp point layer for the current view. Engages only when zoomed in
    // (otherwise the faithful base image shows and the canvas is hidden). Points
    // outside the view are culled, so a deep zoom draws only a handful.
    function drawPoints(): void {
      if (!rasterMode || !canvasEl || !ctx || !vb || !vb0) return;
      if (!isZoomedIn(vb, vb0) || !ptCx || !ptCy || !ptRad || !ptRGB || !ptN) {
        canvasEl.style.display = "none";
        return;
      }
      const rect = (svgEl || el).getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width || vb0.w));
      const ch = Math.max(1, Math.round(rect.height || vb0.h));
      const dpr = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
      if (canvasEl.width !== cw * dpr || canvasEl.height !== ch * dpr) {
        canvasEl.width = cw * dpr;
        canvasEl.height = ch * dpr;
      }
      canvasEl.style.width = cw + "px";
      canvasEl.style.height = ch + "px";
      canvasEl.style.display = "block";
      const W = canvasEl.width, H = canvasEl.height;
      ctx.clearRect(0, 0, W, H);
      // "fixed" (default): draw each point at its full-view pixel size (scale from
      // vb0), so zooming re-maps positions without growing the dots — parity with
      // the SVG axis_zoom constant-size glyphs. "scale": grow with the view (vb).
      const rScale = opts.zoomMarks === "scale"
        ? Math.min(W / vb.w, H / vb.h)
        : Math.min(W / vb0.w, H / vb0.h);
      const x0 = vb.x, y0 = vb.y, x1 = vb.x + vb.w, y1 = vb.y + vb.h;
      for (let i = 0; i < ptN; i++) {
        const px = ptCx[i], py = ptCy[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue; // cull off-view
        const p = userToCanvas(vb, W, H, px, py);
        ctx.beginPath();
        ctx.arc(p.px, p.py, Math.max(0.75, ptRad[i] * rScale), 0, 6.283185307179586);
        ctx.fillStyle = "rgb(" + ptRGB[i * 3] + "," + ptRGB[i * 3 + 1] + "," + ptRGB[i * 3 + 2] + ")";
        ctx.fill();
      }
    }

    // --- raster-mode feedback (rings drawn on the overlay, index-driven) ---
    const SVGNS = "http://www.w3.org/2000/svg";
    // A ring marking element `k`'s bbox, or null if it has no geometry. Drawn in the
    // overlay's viewBox space; `non-scaling-stroke` keeps it crisp under zoom.
    function ringFor(k: string, cls: string): SVGCircleElement | null {
      const m = meta[k];
      if (!m || !hasBbox(m)) return null;
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
      const c = document.createElementNS(SVGNS, "circle") as SVGCircleElement;
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      c.setAttribute("class", cls);
      c.setAttribute("vector-effect", "non-scaling-stroke");
      return c;
    }
    function clearGroup(g: SVGGElement | null): void {
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
    }
    // Redraw the persistent selection rings from the current `selected` set (bounded
    // by OVERLAY_MARK_CAP; the set itself is always fully tracked/reported).
    function drawSelFeedback(): void {
      clearGroup(selGroup);
      if (!selGroup) return;
      const keys = selectedKeys();
      if (keys.length > OVERLAY_MARK_CAP) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-sel");
        if (c) selGroup.appendChild(c);
      }
    }
    function drawHovFeedback(keys: string[]): void {
      clearGroup(hovGroup);
      if (!hovGroup) return;
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], "vellumwidget-fb-hov");
        if (c) hovGroup.appendChild(c);
      }
    }

    // Highlight an explicit set of keys (the shared path for closest-mark hover,
    // where keys = the mark's linked group, and unified hover, where keys = the
    // whole x-/y-column).
    function setHoverKeys(keys: string[]): void {
      if (!opts.hover) return;
      // Raster mode: no per-element nodes — draw a hover ring on the overlay.
      if (rasterMode) {
        drawHovFeedback(keys);
        return;
      }
      lastHoverKeys = keys;
      clearClass("vellumwidget-hl");
      addClassForKeys(keys, "vellumwidget-hl");
      reevaluateInteractions(); // hover-triggered conditions react to the new set
      // Large scenes: dim via the holder + clone the hovered marks into the overlay
      // (O(hovered)); otherwise the CSS `.vellumwidget-hovering` rule dims per node.
      if (largeDim) showHighlightOverlay(keys);
      else el.classList.add("vellumwidget-hovering");
    }
    function setHover(k: string): void {
      setHoverKeys(linkedKeys(k));
    }
    // --- crosshair guide (unified / details-on-demand hover) ---
    // A guide line in the overlay's viewBox space, spanning the current view.
    // `non-scaling-stroke` keeps it a crisp 1px under zoom.
    function crosshairLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
      const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", "vellumwidget-crosshair-line");
      l.setAttribute("vector-effect", "non-scaling-stroke");
      return l;
    }
    function clearCrosshair(): void {
      if (crosshairLayer) while (crosshairLayer.firstChild) crosshairLayer.removeChild(crosshairLayer.firstChild);
    }
    // Draw the guide rule(s) through mark `k`'s centre: a vertical rule for "x"
    // mode, horizontal for "y", and a full cross for "closest". Spans the visible
    // view (the current viewBox), which the layer's viewBox tracks.
    function drawCrosshair(k: string, hm: "closest" | "x" | "y"): void {
      clearCrosshair();
      if (!crosshairLayer) return;
      const m = meta[k];
      if (!m || !hasBbox(m)) return;
      const view = vb || vb0;
      if (!view) return;
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const x0 = view.x, x1 = view.x + view.w, y0 = view.y, y1 = view.y + view.h;
      if (hm !== "y") crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
      if (hm !== "x") crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
    }
    // --- tooltip: placement, delay, sticky (#14) ---
    let tipShowTimer = 0; // pending delayed reveal
    let tipHideTimer = 0; // pending sticky hide grace
    function tipDelay(): number {
      const d = opts.tooltipDelay;
      return typeof d === "number" && d > 0 ? d : 0;
    }
    // The hovered mark's centre in client px (for anchor-to-mark placement), or null.
    function markClient(k: string): { x: number; y: number } | null {
      const m = meta[k];
      if (!m || !hasBbox(m)) return null;
      // Most robust: the mark's own rendered node gives its client position directly
      // (no coordinate math). SVG mode always has a node; raster mode has none, so
      // fall back to the calibrated scene->client inverse, then rect+viewBox.
      const nodes = elementsForKey(k);
      if (nodes.length) {
        const r = (nodes[0] as Element).getBoundingClientRect();
        if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      const cx = (m.x0! + m.x1!) / 2;
      const cy = (m.y0! + m.y1!) / 2;
      const f = calibrateXform();
      if (f && f.sx && f.sy) return { x: (cx - f.ox) / f.sx, y: (cy - f.oy) / f.sy };
      if (!svgEl) return null;
      const r = svgEl.getBoundingClientRect();
      const view = currentViewBox();
      if (!view.w || !view.h || !r.width || !r.height) return null;
      return {
        x: r.left + ((cx - view.x) / view.w) * r.width,
        y: r.top + ((cy - view.y) / view.h) * r.height
      };
    }
    // Position the tip: at the cursor (follow, default) or anchored above the mark
    // (`tooltip_follow = FALSE`). Auto-flips below when there isn't room above, and
    // clamps horizontally so it doesn't overflow the widget.
    function placeTip(clientX: number, clientY: number, anchorKey: string | null): void {
      const box = el.getBoundingClientRect();
      let ax = clientX - box.left;
      let ay = clientY - box.top;
      if (opts.tooltipFollow === false && anchorKey) {
        const c = markClient(anchorKey);
        if (c) { ax = c.x - box.left; ay = c.y - box.top; }
      }
      const tw = tip.offsetWidth || 0;
      const th = tip.offsetHeight || 0;
      const below = ay - th - 12 < 0; // not enough room above -> flip below
      if (tw && box.width) ax = Math.max(tw / 2, Math.min(box.width - tw / 2, ax));
      tip.style.transform =
        "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px) " +
        (below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))");
    }
    // Reveal the tip: `build()` sets its content, then it is placed and shown. When
    // hidden and a delay is set, the reveal waits `tooltip_delay` ms (cancelled if
    // the hover changes first); an already-visible tip updates instantly (no
    // re-delay while moving between marks).
    function revealTip(build: () => void, clientX: number, clientY: number, anchorKey: string | null): void {
      if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
      const doShow = () => {
        tipShowTimer = 0;
        build();
        placeTip(clientX, clientY, anchorKey);
        tip.classList.add("vellumwidget-show");
      };
      const d = tipDelay();
      if (d > 0 && !tip.classList.contains("vellumwidget-show")) {
        if (tipShowTimer) clearTimeout(tipShowTimer);
        tipShowTimer = (setTimeout(doShow, d) as unknown) as number;
      } else {
        doShow();
      }
    }
    function showTip(clientX: number, clientY: number, k: string): void {
      const m = meta[k];
      revealTip(() => { tip.innerHTML = sanitizeTip((m && m.tooltip) || k); }, clientX, clientY, k);
    }
    // Unified tooltip: one box listing every mark in the hovered column, one row
    // per mark (its tooltip, or its key). Rows are capped so a dense column can't
    // build a runaway box.
    const TIP_MULTI_CAP = 30;
    function showTipMulti(clientX: number, clientY: number, keys: string[]): void {
      revealTip(() => {
        const rows: string[] = [];
        for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
          const m = meta[keys[i]];
          rows.push(sanitizeTip((m && m.tooltip) || keys[i]));
        }
        if (keys.length > TIP_MULTI_CAP) rows.push("…");
        tip.innerHTML = rows.join("<br>");
      }, clientX, clientY, keys[0] || null);
    }
    function hideTip(): void {
      if (tipShowTimer) { clearTimeout(tipShowTimer); tipShowTimer = 0; }
      if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
      tip.classList.remove("vellumwidget-show");
    }
    // Hide on hover-out. When sticky, linger briefly so the pointer can travel into
    // the tip (to click a link); entering the tip cancels this (see wireStickyTip).
    function scheduleHideTip(): void {
      if (tipShowTimer) { clearTimeout(tipShowTimer); tipShowTimer = 0; }
      if (opts.tooltipSticky) {
        if (tipHideTimer) clearTimeout(tipHideTimer);
        tipHideTimer = (setTimeout(() => { tipHideTimer = 0; tip.classList.remove("vellumwidget-show"); }, 260) as unknown) as number;
      } else {
        tip.classList.remove("vellumwidget-show");
      }
    }
    function clearHover(): void {
      if (rasterMode) clearGroup(hovGroup);
      if (largeDim) hideHighlightOverlay();
      el.classList.remove("vellumwidget-hovering");
      clearClass("vellumwidget-hl");
      clearCrosshair();
      scheduleHideTip(); // immediate, unless sticky (then a short grace to reach the tip)
      shinyInput("hover", null); // hover ended -> input$<id>_hover = NULL (deduped)
      if (lastHoverKeys.length) {
        lastHoverKeys = [];
        reevaluateInteractions(); // hover-triggered conditions revert
      }
    }

    // --- Shiny read-back ---
    // Push an interaction to a Shiny input (`input$<outputId>_<event>`). A no-op
    // outside a live Shiny app: HTMLWidgets.shinyMode is false in static HTML /
    // knitr / pkgdown, so those renders never touch Shiny. `el.id` equals the
    // output id (already module-namespaced), read lazily here. Use
    // {priority:"event"} for discrete events (click/brush); omit it for state
    // (the selection set) so re-setting the same value is a server no-op.
    function shinyInput(event: string, value: unknown, opts?: { priority?: string }): void {
      const hw = HTMLWidgets as unknown as { shinyMode?: boolean };
      const sh = (window as unknown as {
        Shiny?: { setInputValue?: (id: string, v: unknown, o?: unknown) => void };
      }).Shiny;
      if (hw.shinyMode && sh && sh.setInputValue && el.id) {
        sh.setInputValue(el.id + "_" + event, value, opts);
      }
    }

    // --- selection (+ linking) ---
    function refreshSelected(): void {
      if (rasterMode) {
        drawSelFeedback();
        return;
      }
      clearClass("vellumwidget-selected");
      for (const k in selected) if (selected[k]) addClassForKeys([k], "vellumwidget-selected");
      reevaluateInteractions(); // click/select-triggered conditions react
    }
    function selectedKeys(): string[] {
      return Object.keys(selected).filter((k) => selected[k]);
    }
    // Publish the current selection to linked views (own bus + crosstalk). Called
    // only from local mutations; the incoming appliers below never broadcast, so
    // there is no feedback loop.
    function broadcast(): void {
      const keys = selectedKeys();
      if (group) busPublish(group, selfToken, keys);
      if (ctSel) ctSel.set(keys);
      shinyInput("selected", keys); // deduped state -> input$<id>_selected
    }
    function toggleSelect(k: string): void {
      const ks = linkedKeys(k);
      if (opts.selectMode === "single") {
        const allOn = ks.every((x) => selected[x]) && selectedKeys().length === ks.length;
        selected = {};
        if (!allOn) ks.forEach((x) => (selected[x] = true));
      } else {
        const turnOn = !ks.every((x) => selected[x]);
        ks.forEach((x) => (selected[x] = turnOn));
      }
      refreshSelected();
      broadcast();
    }
    function setSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
      broadcast();
    }
    function clearSelection(): void {
      selected = {};
      refreshSelected();
      broadcast();
    }
    // A selection arriving from a linked view — apply WITHOUT re-broadcasting to
    // the JS bus (feedback-loop guard), but still surface it to Shiny so the
    // server sees this widget's true current selection regardless of source.
    function applyLinkedSelection(keys: string[]): void {
      selected = {};
      for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
      refreshSelected();
      shinyInput("selected", selectedKeys());
    }
    // Cross-filter (display tier): hide keyed elements whose key is not in the
    // shown set. `null` clears the filter (show everything).
    function applyFilter(showKeys: string[] | null): void {
      clearClass("vellumwidget-filtered");
      filteredKeySet = {};
      if (showKeys == null) return;
      const show: Record<string, boolean> = {};
      for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
      for (let i = 0; i < elements.length; i++) {
        const key = elements[i].key;
        if (!show[key]) {
          addClassForKeys([key], "vellumwidget-filtered");
          filteredKeySet[key] = true;
        }
      }
    }
    // A mark is "inert" when it is hidden by a legend-click (`hide`) or by a
    // cross-filter: display:none, so it can't be a pointer target, but it is still
    // in the spatial index. Every geometry-driven hit test (nearest-hover, brush,
    // lasso, raster click-snap) and keyboard traversal must skip it — otherwise a
    // hidden datum can be hovered, tooltipped, or (re-)selected. Muted legend marks
    // stay visible and are NOT inert.
    function inert(k: string): boolean {
      return !!hiddenKeySet[k] || !!filteredKeySet[k] || !!colorHiddenSet[k];
    }
    function dropInert(keys: string[]): string[] {
      return keys.filter((k) => !inert(k));
    }

    // --- declarative interactivity (spec-driven; DECLARATIVE-INTERACTIVITY) ---
    // Build the per-render indexes from the interaction block: which keys carry
    // each condition tag ("<sel>:<aes>"). Called once per render.
    function setupInteractions(): void {
      condTagElems = {};
      filtSelElems = {};
      joinOf = {};
      if (!interactions) return;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.cond) {
          for (let t = 0; t < e.cond.length; t++) {
            (condTagElems[e.cond[t]] = condTagElems[e.cond[t]] || []).push(e.key);
          }
        }
        if (e.filt) {
          for (let t = 0; t < e.filt.length; t++) {
            (filtSelElems[e.filt[t]] = filtSelElems[e.filt[t]] || []).push(e.key);
          }
        }
        if (e.join != null) joinOf[e.key] = e.join;
      }
    }
    // The member key set of a selection given the current gesture state. A
    // hover-triggered selection reads the current hover set; a click/point one
    // reads the persistent selection. (Interval selections are wired in a later
    // stage.)
    function selectionMembers(sel: SelDef): Record<string, boolean> {
      const set: Record<string, boolean> = {};
      const keys = sel.on === "hover" ? lastHoverKeys : selectedKeys();
      for (let i = 0; i < keys.length; i++) set[keys[i]] = true;
      return set;
    }
    // Apply an active condition's `if_false` to a non-member node: an explicit
    // colour recolours the fill/stroke it actually uses (never the fill:none twin
    // of a point); no colour falls back to the theme-dim class.
    function styleCondNode(node: Element, color: string | null | undefined): void {
      if (color == null) {
        node.classList.add("vellumwidget-cond-dim");
        return;
      }
      const n = node as unknown as { style: CSSStyleDeclaration };
      const f = node.getAttribute("fill");
      if (f && f !== "none") n.style.fill = color;
      const s = node.getAttribute("stroke");
      if (s && s !== "none") n.style.stroke = color;
    }
    function clearCondNode(node: Element): void {
      node.classList.remove("vellumwidget-cond-dim");
      const n = node as unknown as { style: CSSStyleDeclaration };
      if (n.style.fill) n.style.fill = "";
      if (n.style.stroke) n.style.stroke = "";
    }
    // Re-evaluate every conditional encoding against the current selection state:
    // members keep `if_true` (already drawn), non-members get `if_false`. With an
    // empty selection and `empty !== false`, the whole plot stays `if_true`
    // (spotlight semantics — matches the static render). SVG mode only.
    function applyConditions(): void {
      if (rasterMode || !interactions || !interactions.conditions) return;
      const selByName: Record<string, SelDef> = {};
      (interactions.selections || []).forEach((s) => (selByName[s.name] = s));
      for (let ci = 0; ci < interactions.conditions.length; ci++) {
        const c = interactions.conditions[ci];
        const tag = c.selection + ":" + c.aes;
        const tagged = condTagElems[tag] || [];
        const sel = selByName[c.selection];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || c.empty === false;
        for (let i = 0; i < tagged.length; i++) {
          const nodes = elementsForKey(tagged[i]);
          const member = !!members[tagged[i]];
          for (let j = 0; j < nodes.length; j++) {
            clearCondNode(nodes[j]);
            if (active && !member) styleCondNode(nodes[j], c.if_false);
          }
        }
      }
    }
    // Enact declared filters: show only the union of the filter selections'
    // members (hiding the rest via the existing cross-filter path). A filter whose
    // selection is empty imposes no restriction when empty !== false (spotlight),
    // so an untouched plot shows everything. Only runs when the plot declares a
    // filter, so it never clobbers a crosstalk/legend filter on a plain plot.
    // A selection's members as cross-view *join* ids (so a gesture in one cell
    // maps to matching rows in another). Falls back to the key itself when there
    // is no join (a single view), preserving single-view filtering.
    function memberJoins(members: Record<string, boolean>): Record<string, boolean> {
      const js: Record<string, boolean> = {};
      for (const k in members) js[joinOf[k] != null ? joinOf[k] : k] = true;
      return js;
    }
    function applyFilters(): void {
      const ix = interactions;
      if (rasterMode || !ix || !ix.filters || !ix.filters.length) return;
      const filters = ix.filters;
      const selByName: Record<string, SelDef> = {};
      (ix.selections || []).forEach((s) => (selByName[s.name] = s));
      // Hide only the *filtered view's* elements (those tagged with the filter's
      // selection) whose join id is not selected — scoped by the per-cell-unique
      // key, so the source view stays fully visible. An empty selection with
      // empty !== false imposes no restriction.
      const hide: Record<string, boolean> = {};
      let restrict = false;
      for (let i = 0; i < filters.length; i++) {
        const selName = filters[i].selection;
        const sel = selByName[selName];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || (sel && sel.empty === false);
        if (!active) continue;
        restrict = true;
        const keep = memberJoins(members);
        const targets = filtSelElems[selName] || [];
        for (let t = 0; t < targets.length; t++) {
          const k = targets[t];
          const j = joinOf[k] != null ? joinOf[k] : k;
          if (!keep[j]) hide[k] = true;
        }
      }
      if (!restrict) {
        applyFilter(null);
        return;
      }
      // Translate the hide set into the show set applyFilter() expects (keys unique,
      // so hiding a target-cell key never touches the source cell).
      const show: string[] = [];
      for (let i = 0; i < elements.length; i++) {
        if (!hide[elements[i].key]) show.push(elements[i].key);
      }
      applyFilter(show);
    }
    // The single re-evaluation hook: called whenever a selection's member set can
    // change (hover move/clear, click/select/brush). Conditions + filters today;
    // scale binds add their reaction here in a later stage.
    function reevaluateInteractions(): void {
      applyConditions();
      applyFilters();
    }
    // --- server -> client proxy (vellumwidget_proxy) ---
    // Route a command from the Shiny server onto this instance, without a
    // re-render. `args` is normalised to a key array (Shiny may auto-unbox a
    // length-1 vector to a scalar, so accept scalar/array/absent uniformly).
    function proxyCall(method: string, args: unknown): void {
      const keys: string[] = Array.isArray(args)
        ? (args as string[])
        : args == null ? [] : [String(args)];
      switch (method) {
        case "select": setSelection(keys); break;
        case "clearSelection": clearSelection(); break;
        case "filter": applyFilter(keys); break;
        case "clearFilter": applyFilter(null); break;
        case "zoom": proxyZoomToKeys(keys); break;
        case "resetZoom": resetZoom(); break;
        default: break; // ignore unknown methods (forward-compatible)
      }
    }
    // Frame the given keys' union bbox; empty keys reset to the full view.
    function proxyZoomToKeys(keys: string[]): void {
      if (!keys.length) { resetZoom(); return; }
      const sel: Record<string, boolean> = {};
      for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
      const bb = unionBbox(elements, sel);
      if (bb) zoomTo(bb);
    }

    // Join the linking channels for this widget's groups (once).
    function setupLinking(): void {
      if (joined) return;
      joined = true;
      if (group) busJoin(group, { token: selfToken, onSelect: applyLinkedSelection, onView: applyLinkedView });
      const ct = getCrosstalk();
      if (opts.crosstalk && ct) {
        ctSel = new ct.SelectionHandle(opts.crosstalk);
        ctFilt = new ct.FilterHandle(opts.crosstalk);
        ctSel.on("change", function (e) {
          if (e.sender !== ctSel) applyLinkedSelection(e.value || []);
        });
        ctFilt.on("change", function (e) {
          applyFilter(e.value);
        });
      }
    }

    // --- data-space mapping helpers (need the `scales` panel payload) ---
    // The panel whose device-px rect contains (x, y); else the sole cartesian
    // panel (the common single-panel case); else null. Data-space mapping is only
    // offered when unambiguous — with several panels and a point outside them all
    // we can't say which axes apply.
    function panelAt(x: number, y: number): PanelInfo | null {
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return p;
      }
      return panels.length === 1 ? panels[0] : null;
    }
    // {x:[lo,hi], y:[lo,hi]} data-space extent of a device-px rectangle in panel
    // `p` (each axis ordered lo<=hi), or null if the panel lacks that axis.
    function dataRangeOf(p: PanelInfo, dx0: number, dy0: number, dx1: number, dy1: number):
      { x?: number[]; y?: number[]; panel: string } | null {
      const out: { x?: number[]; y?: number[]; panel: string } = { panel: p.name };
      if (p.x) {
        const a = pxToDataX(p, dx0), b = pxToDataX(p, dx1);
        if (a != null && b != null) out.x = [Math.min(a, b), Math.max(a, b)];
      }
      if (p.y) {
        const a = pxToDataY(p, dy0), b = pxToDataY(p, dy1);
        if (a != null && b != null) out.y = [Math.min(a, b), Math.max(a, b)];
      }
      return (out.x || out.y) ? out : null;
    }
    // Data-space fields to attach to a `_brush` event for a device-px region:
    // `panel` + `x0d,x1d,y0d,y1d` (data-space bounds), or `{}` when no panel scale
    // applies (raw scene, non-cartesian, or an ambiguous multi-panel region).
    function brushDataFields(bb: Bbox): Record<string, number | string> {
      const p = panelAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
      if (!p) return {};
      const d = dataRangeOf(p, bb.x0, bb.y0, bb.x1, bb.y1);
      if (!d) return {};
      const f: Record<string, number | string> = { panel: d.panel };
      if (d.x) { f.x0d = d.x[0]; f.x1d = d.x[1]; }
      if (d.y) { f.y0d = d.y[0]; f.y1d = d.y[1]; }
      return f;
    }

    // --- viewBox pan/zoom ---
    // Report the current view to Shiny as `input$<id>_zoom` (a deduped state input):
    // the current viewBox in device-px (`x`/`y`/`w`/`h`) + a `zoomed` flag, and —
    // when the scene carries a single cartesian panel's scale descriptor — the
    // visible range in `data` coordinates (`data.x`/`data.y`/`data.panel`).
    function reportView(): void {
      if (!vb) return;
      const payload: {
        x: number; y: number; w: number; h: number; zoomed: boolean;
        data?: { x?: number[]; y?: number[]; panel: string };
      } = { x: vb.x, y: vb.y, w: vb.w, h: vb.h, zoomed: vb0 ? isZoomedIn(vb, vb0) : false };
      if (panels.length === 1) {
        // Visible data range: over the whole view normally; over the panel's own
        // (T-inverted) corners under axis_zoom, where only the data region scales.
        let d;
        if (axisZoomActive && vb0) {
          const p = panels[0];
          const a = panToView(vb, vb0, p.px0, p.py0);
          const b = panToView(vb, vb0, p.px1, p.py1);
          d = dataRangeOf(p, a.x, a.y, b.x, b.y);
        } else {
          d = dataRangeOf(panels[0], vb.x, vb.y, vb.x + vb.w, vb.y + vb.h);
        }
        if (d) payload.data = d;
      }
      shinyInput("zoom", payload);
      // Linked pan/zoom: broadcast the view as a fraction of our own original
      // viewBox to the group's other members. Suppressed while we are *applying* a
      // peer's view (feedback-loop guard).
      if (group && vb0 && !receivingView && vb0.w && vb0.h) {
        busPublishView(group, selfToken, {
          x: (vb.x - vb0.x) / vb0.w, y: (vb.y - vb0.y) / vb0.h,
          w: vb.w / vb0.w, h: vb.h / vb0.h
        });
      }
    }
    // Apply a linked view from a peer: map its view-fraction onto our own viewBox.
    // Guarded so re-emitting (Shiny) is fine but we do not re-broadcast to the bus.
    function applyLinkedView(v: ViewFraction): void {
      if (!vb0) return;
      const next = {
        x: vb0.x + v.x * vb0.w, y: vb0.y + v.y * vb0.h,
        w: v.w * vb0.w, h: v.h * vb0.h
      };
      if (!(next.w > 0) || !(next.h > 0)) return;
      // No-op if unchanged (avoids redundant work and ping-pong on equal views).
      if (vb && Math.abs(next.x - vb.x) < 1e-6 && Math.abs(next.y - vb.y) < 1e-6 &&
          Math.abs(next.w - vb.w) < 1e-6 && Math.abs(next.h - vb.h) < 1e-6) return;
      receivingView = true;
      vb = next;
      applyViewBox(); // reportView() here emits _zoom but skips the bus (guarded)
      receivingView = false;
    }
    // Set the aspect policy on the base svg + overlays. In x-only (navigator) mode
    // the view maps non-uniformly (`none`) so a narrow x-range fills the width while
    // the full-height y-range still fills the height; otherwise the scene keeps its
    // aspect (`meet`). At the full view the two are visually identical (the viewBox
    // aspect equals the box aspect); the stretch only appears once x is zoomed.
    function applyAspect(): void {
      // Stretch (non-uniform) only for x-only zoom WITHOUT axis_zoom: axis_zoom holds
      // the frame at vb0 and re-ticks, so it renders the x-only view (via a pan-group
      // transform whose y-scale is 1) with no stretch and crisp, re-numbered axes.
      const par = (xZoom && !axisZoomActive) ? "none" : "xMidYMid meet";
      if (svgEl) svgEl.setAttribute("preserveAspectRatio", par);
      if (dimLayer) dimLayer.setAttribute("preserveAspectRatio", par);
      if (crosshairLayer) crosshairLayer.setAttribute("preserveAspectRatio", par);
      if (colorbarLayer) colorbarLayer.setAttribute("preserveAspectRatio", par);
    }
    function applyViewBox(): void {
      // x-only range zoom: keep the full y-extent on screen (never crop the y-axis),
      // so every zoom/pan path (nav, wheel, pinch, keyboard, linked) is 1-D in x.
      if (xZoom && vb && vb0) { vb.y = vb0.y; vb.h = vb0.h; }
      if (axisZoomActive && panGroup && vb && vb0) {
        // Axis-aware zoom: hold the base frame at vb0 and scale only the data region
        // by T (so axes/titles/legend stay put), then re-tick for the visible range.
        const t = viewToPan(vb, vb0);
        panGroup.setAttribute("transform",
          "matrix(" + t.sx + " 0 0 " + t.sy + " " + t.tx + " " + t.ty + ")");
        setPanScaleVars(t); // keep constant-size glyphs the same pixel size
        if (svgEl) svgEl.setAttribute("viewBox", fmtViewBox(vb0));
        retick();
      } else if (svgEl && vb) {
        svgEl.setAttribute("viewBox", fmtViewBox(vb));
      }
      // Overlays that sit over the panel marks track the view (their device-px
      // content zooms with the marks); the colorbar overlay tracks the FIXED base
      // under axis_zoom (the colorbar is furniture outside the panel, so it stays put).
      if (dimLayer && vb) dimLayer.setAttribute("viewBox", fmtViewBox(vb));
      if (crosshairLayer && vb) crosshairLayer.setAttribute("viewBox", fmtViewBox(vb));
      if (colorbarLayer && (vb || vb0)) {
        colorbarLayer.setAttribute("viewBox", fmtViewBox(axisZoomActive && vb0 ? vb0 : vb!));
      }
      // Redraw the crisp point layer for the new view (no-op unless raster + zoomed in).
      drawPoints();
      updateNav(); // keep the navigator window in sync with the view
      // Report on settle: a continuous pan/pinch reports once on release (from
      // onDragUp), not per frame; discrete zooms (wheel, keys, reset, zoom-to) land
      // here with no drag in progress and report immediately.
      if (dragging !== "pan" && pinchDist === 0) reportView();
    }
    function resetZoom(): void {
      if (vb0) {
        vb = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h };
        applyViewBox();
      }
    }
    function zoomTo(rect: Bbox, pad = 0.05): void {
      if (!vb) return;
      const w = Math.max(rect.x1 - rect.x0, 1e-6);
      const h = Math.max(rect.y1 - rect.y0, 1e-6);
      const px = w * pad;
      const py = h * pad;
      vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
      applyViewBox();
    }

    // --- axis-aware zoom (Phase 2, opt-in) ---
    // A linear (identity/reverse continuous) axis is the tractable, correct case
    // for the client-side re-ticker: nice round numbers in data space. Log/date/
    // discrete axes report some other transform/type and fall back to viewBox zoom.
    function isLinearAxis(ax: AxisScale | undefined): ax is AxisScale {
      return !!ax && ax.type === "continuous" &&
        (ax.transform === "identity" || ax.transform === "reverse");
    }
    // Decide whether this render can do axis-aware zoom, wire its DOM once, and hide
    // vellum's static axes/gridlines (which would go stale under a zoom that only
    // re-scales the data region). Gated to: opt-in on, SVG (not raster), a single
    // cartesian panel whose x AND y are linear and match a pannable group by name.
    // Anything else leaves axisZoomActive false and the ordinary viewBox zoom stands.
    function setupAxisZoom(): void {
      panGroup = null; outerPanelGroup = null; axisPanel = null; axisZoomActive = false;
      if (retickLayer) { retickLayer.remove(); retickLayer = null; }
      retickGrid = null;
      if (!opts.axisZoom || rasterMode || !svgEl || !vb0 || !stage || panels.length !== 1) return;
      const p = panels[0];
      if (!isLinearAxis(p.x) || !isLinearAxis(p.y)) return;
      const pan = svgEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]');
      const outer = svgEl.querySelector('[data-vellum-panel="' + cssEscape(p.name) + '"]');
      if (!pan || !outer) return; // upstream not pannable (older vellum/vellumplot)
      panGroup = pan as SVGGElement;
      outerPanelGroup = outer as SVGGElement;
      axisPanel = p;
      axisZoomActive = true;
      scrapeAxisStyle(p);
      hideStaticAxes();
      // Re-ticked gridlines: a group inside the clipped panel, before the pan group,
      // so they render under the marks and are clipped to the panel (like vellum's).
      retickGrid = document.createElementNS(SVGNS, "g") as SVGGElement;
      retickGrid.setAttribute("class", "vellumwidget-retick-grid");
      outer.insertBefore(retickGrid, pan);
      // Re-ticked axis labels: an overlay pinned to the fixed base coordinate space.
      retickLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
      retickLayer.setAttribute("class", "vellumwidget-retick-layer");
      retickLayer.setAttribute("aria-hidden", "true");
      retickLayer.setAttribute("viewBox", fmtViewBox(vb0));
      stage.appendChild(retickLayer);
      // Seed the (identity) transform + inverse-scale vars and the initial ticks for
      // the full view, so the pan group is transform-ready before the first gesture.
      const t = viewToPan(vb || vb0, vb0);
      panGroup.setAttribute("transform",
        "matrix(" + t.sx + " 0 0 " + t.sy + " " + t.tx + " " + t.ty + ")");
      setPanScaleVars(t);
      setupConstantMarks(); // fixed-size glyphs (default) + crisp strokes
      retick();
    }
    // The inverse of the pan-group scale, published as CSS custom properties so
    // constant-size glyphs (which carry `scale(var(--vw-ix),var(--vw-iy))`) cancel
    // it and keep their pixel size while their position still re-maps with T.
    function setPanScaleVars(t: PanTransform): void {
      if (!panGroup) return;
      panGroup.style.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
      panGroup.style.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
    }
    // Once per render (axis_zoom active, SVG): keep glyph marks a constant pixel
    // size by counter-scaling them about their own centre from the shared vars, and
    // hold every positional mark's stroke width constant. Skipped for zoom_marks =
    // "scale" (glyphs then scale with the pan group, the older behaviour).
    function setupConstantMarks(): void {
      if (!axisZoomActive || opts.zoomMarks === "scale" || !panGroup) return;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (!e.mark) continue;
        const nodes = nodesByKey[e.key];
        if (!nodes) continue;
        const glyph = GLYPH_MARKS[e.mark] === true;
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j] as SVGElement;
          // Only marks inside the pan group are scaled by T, so only they need
          // the counter-scale. Skip glyphs that live outside it (e.g. legend
          // swatches): those are positioned by a `transform` attribute, and the
          // inline `transform` below would override it and fling them to a corner.
          if (!panGroup.contains(node)) continue;
          if (glyph) {
            // Counter-scale about the glyph's own bbox centre (transform-box:
            // fill-box makes transform-origin resolve there), so T re-maps the
            // position but the shared inverse-scale vars cancel T's size change.
            node.style.setProperty("transform-box", "fill-box");
            node.style.setProperty("transform-origin", "center");
            node.style.setProperty("transform", "scale(var(--vw-ix,1),var(--vw-iy,1))");
          } else {
            node.setAttribute("vector-effect", "non-scaling-stroke");
          }
        }
      }
    }
    // Translate component of a node's `transform` (matrix e/f or translate x/y).
    function transTranslate(node: Element): { tx: number; ty: number } {
      const t = node.getAttribute("transform") || "";
      const m = /matrix\(\s*[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+[-\d.eE]+\s+([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(t) ||
        /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/.exec(t);
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
    }
    // Scrape the axis text presentation + the tick-label anchor positions from
    // vellum's own axis/grid nodes, so the re-tick matches the active theme. Falls
    // back to sensible defaults (grey text, white gridlines) if a node is absent.
    function scrapeAxisStyle(p: PanelInfo): void {
      if (!svgEl) return;
      const xText = svgEl.querySelector('[data-vellum-panel^="axis-x"] text');
      if (xText) {
        axisStyle.textFill = xText.getAttribute("fill") || axisStyle.textFill;
        axisStyle.fontFamily = xText.getAttribute("font-family") || axisStyle.fontFamily;
        const fs = parseFloat(xText.getAttribute("font-size") || "");
        if (fs) axisStyle.fontSize = fs;
        const y = parseFloat(xText.getAttribute("y") || "");
        axisStyle.xBaselineY = isFinite(y) ? transTranslate(xText).ty + y : p.py1 + axisStyle.fontSize;
      } else {
        axisStyle.xBaselineY = p.py1 + axisStyle.fontSize;
      }
      const yText = svgEl.querySelector('[data-vellum-panel^="axis-y"] text');
      if (yText) {
        const x = parseFloat(yText.getAttribute("x") || "");
        axisStyle.yLabelX = isFinite(x) ? transTranslate(yText).tx + x : p.px0 - 6;
      } else {
        axisStyle.yLabelX = p.px0 - 6;
      }
      const grid = svgEl.querySelector('[role="grid"] path, [role="grid"] line');
      if (grid) {
        axisStyle.gridStroke = grid.getAttribute("stroke") || axisStyle.gridStroke;
        const sw = parseFloat(grid.getAttribute("stroke-width") || "");
        if (sw) axisStyle.gridWidth = sw;
      }
    }
    // Hide vellum's gridlines (role="grid", inside the pan group -> would stretch
    // with T) and its axis tick-label groups (axis-x-*/axis-y-*, outside the panel
    // -> would go stale). Axis TITLES (axis-title-*) are left visible.
    function hideStaticAxes(): void {
      if (!svgEl) return;
      const hide = svgEl.querySelectorAll(
        '[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let i = 0; i < hide.length; i++) (hide[i] as SVGElement).style.display = "none";
    }
    // A gridline / an axis label, styled to match the scraped theme.
    function gridLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
      const l = document.createElementNS(SVGNS, "line") as SVGLineElement;
      l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", axisStyle.gridStroke);
      l.setAttribute("stroke-width", String(axisStyle.gridWidth));
      return l;
    }
    function axisLabel(text: string, x: number, y: number, anchor: string, baseline: string): SVGTextElement {
      const t = document.createElementNS(SVGNS, "text") as SVGTextElement;
      t.setAttribute("x", String(x)); t.setAttribute("y", String(y));
      t.setAttribute("fill", axisStyle.textFill);
      t.setAttribute("font-family", axisStyle.fontFamily);
      t.setAttribute("font-size", String(axisStyle.fontSize));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("dominant-baseline", baseline);
      t.textContent = text;
      return t;
    }
    // Redraw the re-ticked gridlines + axis labels for the currently visible data
    // range. Called on every applyViewBox while axis_zoom is active.
    function retick(): void {
      if (!axisZoomActive || !axisPanel || !vb || !vb0 || !retickGrid || !retickLayer) return;
      const p = axisPanel;
      while (retickGrid.firstChild) retickGrid.removeChild(retickGrid.firstChild);
      while (retickLayer.firstChild) retickLayer.removeChild(retickLayer.firstChild);
      const t = viewToPan(vb, vb0);
      // Visible data range: invert the panel's screen corners through T to the device
      // px now sitting there, then px -> data via the panel affine.
      const cTL = panToView(vb, vb0, p.px0, p.py0);
      const cBR = panToView(vb, vb0, p.px1, p.py1);
      if (p.x) {
        const a = pxToDataX(p, cTL.x), b = pxToDataX(p, cBR.x);
        if (a != null && b != null) {
          const lo = Math.min(a, b), hi = Math.max(a, b);
          const ticks = niceTicks(lo, hi, 5);
          const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi - lo;
          const nlo = p.x.native_lo, nhi = p.x.native_hi;
          for (let i = 0; i < ticks.length; i++) {
            const nx = dataToNative(p.x, ticks[i]);
            const px = p.px0 + ((nx - nlo) / (nhi - nlo)) * (p.px1 - p.px0);
            const sx = t.sx * px + t.tx; // screen device-px
            if (sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
            retickGrid.appendChild(gridLine(sx, p.py0, sx, p.py1));
            retickLayer.appendChild(
              axisLabel(fmtTick(ticks[i], step), sx, axisStyle.xBaselineY, "middle", "text-before-edge"));
          }
        }
      }
      if (p.y) {
        const a = pxToDataY(p, cTL.y), b = pxToDataY(p, cBR.y);
        if (a != null && b != null) {
          const lo = Math.min(a, b), hi = Math.max(a, b);
          const ticks = niceTicks(lo, hi, 5);
          const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi - lo;
          const nlo = p.y.native_lo, nhi = p.y.native_hi;
          for (let i = 0; i < ticks.length; i++) {
            const ny = dataToNative(p.y, ticks[i]);
            // device y is top-down: native_hi at py0 (top), native_lo at py1 (bottom)
            const py = p.py0 + ((nhi - ny) / (nhi - nlo)) * (p.py1 - p.py0);
            const sy = t.sy * py + t.ty;
            if (sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
            retickGrid.appendChild(gridLine(p.px0, sy, p.px1, sy));
            retickLayer.appendChild(
              axisLabel(fmtTick(ticks[i], step), axisStyle.yLabelX, sy, "end", "central"));
          }
        }
      }
    }

    // --- overview navigator (opt-in x-range strip) ---
    // Set the visible x-range from window fractions of the full extent (0..1), then
    // apply — reused by the drag handlers and the test seam. `xFrac` = left edge,
    // `wFrac` = width, both fractions of vb0's width; clamped to keep the window
    // on-strip and a minimum width so it stays grabbable.
    function navToView(xFrac: number, wFrac: number): void {
      if (!vb0) return;
      wFrac = Math.min(1, Math.max(0.02, wFrac));
      xFrac = Math.min(1 - wFrac, Math.max(0, xFrac));
      const w = wFrac * vb0.w;
      if (xZoom) {
        // x-only (the normal SVG navigator): the selected x-range fills the width and
        // the full y-range stays on screen (a non-uniform view; see applyAspect).
        vb = { x: vb0.x + xFrac * vb0.w, y: vb0.y, w: w, h: vb0.h };
      } else {
        // Fallback for contexts that keep an aspect-locked view (raster, axis_zoom):
        // zoom both dimensions by the same fraction, centred vertically, so a
        // width-only change isn't swallowed by the `meet` fit.
        const cy = vb ? vb.y + vb.h / 2 : vb0.y + vb0.h / 2;
        const h = wFrac * vb0.h;
        vb = { x: vb0.x + xFrac * vb0.w, y: cy - h / 2, w: w, h: h };
      }
      applyViewBox();
    }
    // Reflect the current view in the window's position/size (x only). Called from
    // applyViewBox so wheel/keyboard/brush/linked changes all move the window too.
    function updateNav(): void {
      if (!navWindow || !vb || !vb0 || !vb0.w) return;
      const xFrac = (vb.x - vb0.x) / vb0.w;
      const wFrac = vb.w / vb0.w;
      navWindow.style.left = (xFrac * 100) + "%";
      navWindow.style.width = (wFrac * 100) + "%";
    }
    // Build the navigator strip once: a squashed mini-render of the whole scene
    // (an inert clone of the base svg at the full viewBox) plus a draggable window
    // with two resize handles. Drag body -> pan x; drag a handle -> zoom x.
    function buildNavigator(): void {
      if (navEl) { navEl.remove(); navEl = null; navWindow = null; }
      if (!opts.navigator || !svgEl || !vb0) return;
      const h = opts.navigatorHeight && opts.navigatorHeight > 0 ? opts.navigatorHeight : 56;
      navEl = document.createElement("div");
      navEl.className = "vellumwidget-nav";
      navEl.style.height = h + "px";
      navEl.setAttribute("aria-hidden", "true"); // the main chart is the accessible view
      // Mini-render: clone the base svg at the full extent, squashed to fill, inert.
      const mini = document.createElement("div");
      mini.className = "vellumwidget-nav-mini";
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("viewBox", fmtViewBox(vb0));
      clone.setAttribute("preserveAspectRatio", "none");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      // Drop defs/clip-paths (duplicate ids would clash with the live svg) and any
      // interactivity/a11y hooks — this is a static backdrop.
      const defs = clone.querySelector("defs");
      if (defs) defs.remove();
      const clipped = clone.querySelectorAll("[clip-path]");
      for (let i = 0; i < clipped.length; i++) clipped[i].removeAttribute("clip-path");
      const keyed = clone.querySelectorAll("[data-key],[tabindex],[role]");
      for (let i = 0; i < keyed.length; i++) {
        keyed[i].removeAttribute("data-key");
        keyed[i].removeAttribute("tabindex");
        keyed[i].removeAttribute("role");
      }
      clone.removeAttribute("id");
      mini.appendChild(clone);
      navEl.appendChild(mini);
      navWindow = document.createElement("div");
      navWindow.className = "vellumwidget-nav-window";
      const hL = document.createElement("div");
      hL.className = "vellumwidget-nav-handle vellumwidget-nav-handle-l";
      const hR = document.createElement("div");
      hR.className = "vellumwidget-nav-handle vellumwidget-nav-handle-r";
      navWindow.appendChild(hL);
      navWindow.appendChild(hR);
      navEl.appendChild(navWindow);
      el.appendChild(navEl);
      wireNavigator(hL, hR);
      updateNav();
    }
    // Pointer drag on the window (pan) and handles (resize). All math in strip
    // fractions from the strip's client rect, so it is size-independent.
    function wireNavigator(hL: HTMLElement, hR: HTMLElement): void {
      if (!navEl || !navWindow) return;
      let mode: "" | "pan" | "l" | "r" = "";
      let startFracX = 0, startFracW = 0, startPointer = 0;
      const stripFrac = (clientX: number): number => {
        const r = navEl!.getBoundingClientRect();
        return r.width ? (clientX - r.left) / r.width : 0;
      };
      const onMove = (ev: PointerEvent): void => {
        if (!mode || !vb0) return;
        const d = stripFrac(ev.clientX) - startPointer;
        if (mode === "pan") navToView(startFracX + d, startFracW);
        else if (mode === "l") { const nx = startFracX + d; navToView(nx, startFracW + (startFracX - nx)); }
        else if (mode === "r") navToView(startFracX, startFracW + d);
      };
      const onUp = (ev: PointerEvent): void => {
        mode = "";
        navWindow!.classList.remove("vellumwidget-nav-grabbing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (ev && (ev.target as Element).releasePointerCapture) { /* no-op */ }
      };
      const start = (m: "pan" | "l" | "r") => (ev: PointerEvent): void => {
        if (!vb0) return;
        ev.preventDefault();
        ev.stopPropagation();
        mode = m;
        startFracX = (vb!.x - vb0.x) / vb0.w;
        startFracW = vb!.w / vb0.w;
        startPointer = stripFrac(ev.clientX);
        if (m === "pan") navWindow!.classList.add("vellumwidget-nav-grabbing");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };
      navWindow.addEventListener("pointerdown", start("pan"));
      hL.addEventListener("pointerdown", start("l"));
      hR.addEventListener("pointerdown", start("r"));
    }

    // --- continuous colorbar filter ---
    // Device-px position along the bar for a value (in the overlay's viewBox space),
    // and its inverse. `t` = value fraction (0 at lo, 1 at hi); orientation + reverse
    // decide which bar end is `lo`. Vertical bars put the high value at the top (y0).
    function cbPos(v: number): number {
      const cb = colorbar!;
      const t = cb.hi === cb.lo ? 0 : (v - cb.lo) / (cb.hi - cb.lo);
      if (cb.orientation === "h") {
        const f = cb.reverse ? 1 - t : t;
        return cb.x0 + f * (cb.x1 - cb.x0);
      }
      const f = cb.reverse ? t : 1 - t;
      return cb.y0 + f * (cb.y1 - cb.y0);
    }
    function cbValueAt(pos: number): number {
      const cb = colorbar!;
      if (cb.orientation === "h") {
        let f = cb.x1 === cb.x0 ? 0 : (pos - cb.x0) / (cb.x1 - cb.x0);
        const t = cb.reverse ? 1 - f : f;
        return cb.lo + t * (cb.hi - cb.lo);
      }
      let f = cb.y1 === cb.y0 ? 0 : (pos - cb.y0) / (cb.y1 - cb.y0);
      const t = cb.reverse ? f : 1 - f;
      return cb.lo + t * (cb.hi - cb.lo);
    }
    function cbRect(x: number, y: number, w: number, h: number, cls: string): SVGRectElement {
      const r = document.createElementNS(SVGNS, "rect") as SVGRectElement;
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(Math.max(0, w)));
      r.setAttribute("height", String(Math.max(0, h)));
      r.setAttribute("class", cls);
      return r;
    }
    // Redraw the colorbar overlay for the current `colorRange`: two dim rects over
    // the out-of-range ends of the bar, and two draggable handles at the range ends.
    function drawColorbarControl(): void {
      if (!colorbarLayer) return;
      while (colorbarLayer.firstChild) colorbarLayer.removeChild(colorbarLayer.firstChild);
      if (!colorbar || !colorRange) return;
      const cb = colorbar;
      const pa = cbPos(colorRange.a);
      const pb = cbPos(colorRange.b);
      const lo = Math.min(pa, pb);
      const hi = Math.max(pa, pb);
      const mkHandle = (pos: number, which: string): SVGRectElement => {
        const H = 4; // handle thickness along the bar axis
        const r = cb.orientation === "h"
          ? cbRect(pos - H / 2, cb.y0 - 2, H, cb.y1 - cb.y0 + 4, "vellumwidget-cb-handle")
          : cbRect(cb.x0 - 2, pos - H / 2, cb.x1 - cb.x0 + 4, H, "vellumwidget-cb-handle");
        r.setAttribute("vector-effect", "non-scaling-stroke");
        r.setAttribute("data-cb", which);
        return r;
      };
      if (cb.orientation === "h") {
        colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, lo - cb.x0, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
        colorbarLayer.appendChild(cbRect(hi, cb.y0, cb.x1 - hi, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
      } else {
        colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, cb.x1 - cb.x0, lo - cb.y0, "vellumwidget-cb-dim"));
        colorbarLayer.appendChild(cbRect(cb.x0, hi, cb.x1 - cb.x0, cb.y1 - hi, "vellumwidget-cb-dim"));
      }
      colorbarLayer.appendChild(mkHandle(pa, "a"));
      colorbarLayer.appendChild(mkHandle(pb, "b"));
    }
    // Dim + make inert every mark whose continuous value is outside [a, b]; report
    // the range to Shiny. A full range clears the filter.
    function applyColorFilter(): void {
      clearClass("vellumwidget-colorfiltered");
      colorHiddenSet = {};
      if (!colorbar || !colorRange) { shinyInput("colorfilter", null); return; }
      const a = colorRange.a;
      const b = colorRange.b;
      const full = a <= colorbar.lo + 1e-9 && b >= colorbar.hi - 1e-9;
      if (!full) {
        const outKeys: string[] = [];
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (typeof e.filter_value === "number" && (e.filter_value < a || e.filter_value > b) && !colorHiddenSet[e.key]) {
            colorHiddenSet[e.key] = true;
            outKeys.push(e.key);
          }
        }
        addClassForKeys(outKeys, "vellumwidget-colorfiltered");
      }
      shinyInput("colorfilter", full ? null : [a, b]);
    }
    // Set the selected value range (clamped, ordered) and apply. The runtime entry
    // point for a handle drag and the test seam.
    function setColorRange(a: number, b: number): void {
      if (!colorbar) return;
      const lo = colorbar.lo, hi = colorbar.hi;
      a = Math.min(hi, Math.max(lo, a));
      b = Math.min(hi, Math.max(lo, b));
      colorRange = { a: Math.min(a, b), b: Math.max(a, b) };
      drawColorbarControl();
      applyColorFilter();
    }
    function buildColorbar(): void {
      if (colorbarLayer) { colorbarLayer.remove(); colorbarLayer = null; }
      colorHiddenSet = {};
      colorRange = null;
      el.classList.remove("vellumwidget-cb-v", "vellumwidget-cb-h");
      // No control in raster mode (no per-element nodes to dim).
      if (!colorbar || rasterMode || !stage) return;
      colorbarLayer = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
      colorbarLayer.setAttribute("class", "vellumwidget-colorbar-layer");
      colorbarLayer.setAttribute("aria-hidden", "true");
      if (vb0) colorbarLayer.setAttribute("viewBox", fmtViewBox(vb0));
      stage.appendChild(colorbarLayer);
      el.classList.add(colorbar.orientation === "h" ? "vellumwidget-cb-h" : "vellumwidget-cb-v");
      colorRange = { a: colorbar.lo, b: colorbar.hi };
      drawColorbarControl();
      wireColorbar();
    }
    // Drag a handle -> update its end of the range; double-click the bar -> reset.
    function wireColorbar(): void {
      if (!colorbarLayer) return;
      let dragWhich: "" | "a" | "b" = "";
      const onMove = (ev: PointerEvent): void => {
        if (!dragWhich || !colorbar || !colorRange) return;
        const u = toUser(ev.clientX, ev.clientY);
        const v = cbValueAt(colorbar.orientation === "h" ? u.x : u.y);
        if (dragWhich === "a") setColorRange(v, colorRange.b);
        else setColorRange(colorRange.a, v);
      };
      const onUp = (): void => {
        dragWhich = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      colorbarLayer.addEventListener("pointerdown", function (ev) {
        const w = (ev.target as Element).getAttribute && (ev.target as Element).getAttribute("data-cb");
        if (w !== "a" && w !== "b") return;
        ev.preventDefault();
        ev.stopPropagation();
        dragWhich = w;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
      colorbarLayer.addEventListener("dblclick", function (ev) {
        if (!colorbar) return;
        ev.preventDefault();
        setColorRange(colorbar.lo, colorbar.hi);
      });
    }

    // --- brush overlay (screen coords for display; user coords for hit-test) ---
    function positionBrush(x: number, y: number, w: number, h: number): void {
      brushBox.style.left = x + "px";
      brushBox.style.top = y + "px";
      brushBox.style.width = w + "px";
      brushBox.style.height = h + "px";
      brushBox.style.display = "block";
    }
    function hideBrush(): void {
      brushBox.style.display = "none";
    }

    // --- lasso overlay (freehand select) ---
    // The lasso outline is drawn in the crosshair overlay's viewBox space (user
    // coords), so it tracks the marks exactly and needs no screen<->user mapping to
    // render. Points are appended in user coords as the pointer moves.
    function lassoPointsAttr(): string {
      let s = "";
      for (let i = 0; i < lassoPts.length; i++) s += (i ? " " : "") + lassoPts[i].x + "," + lassoPts[i].y;
      return s;
    }
    function updateLassoPath(): void {
      if (!crosshairLayer) return;
      if (!lassoEl) {
        lassoEl = document.createElementNS(SVGNS, "polygon") as SVGPolygonElement;
        lassoEl.setAttribute("class", "vellumwidget-lasso");
        lassoEl.setAttribute("vector-effect", "non-scaling-stroke");
        crosshairLayer.appendChild(lassoEl);
      }
      lassoEl.setAttribute("points", lassoPointsAttr());
    }
    function clearLasso(): void {
      lassoPts = [];
      if (lassoEl && lassoEl.parentNode) lassoEl.parentNode.removeChild(lassoEl);
      lassoEl = null;
    }

    // --- pointer interaction (hover + drag: brush or pan; touch pinch-zoom) ---
    // Pointer events unify mouse, touch, and pen, so one code path drives desktop
    // and mobile. Active pointers are tracked so two down at once = pinch-zoom.
    let down: { cx: number; cy: number; ux: number; uy: number } | null = null;
    let dragging: "" | "brush" | "pan" | "lasso" = "";
    let movedDuringDrag = false;
    const pointers = new Map<number, { cx: number; cy: number }>();
    let pinchDist = 0; // > 0 while a two-pointer pinch is in progress

    // Hover is SVG-local (fires only over this widget's svg). While a press is
    // in progress the drag handlers (below) own movement, so hover backs off.
    function hoverAt(k: string | null, clientX: number, clientY: number): void {
      // An inert mark (legend-hidden or cross-filtered) can't intercept the pointer,
      // but the nearest/column scans work off the index, which still holds it — drop
      // it so a hidden datum is never silently hovered/tooltipped.
      if (k != null && inert(k)) k = null;
      if (k == null) {
        clearHover(); // emits hover = null
        return;
      }
      // The `hover` input reports the primary (nearest) mark in every mode, so the
      // Shiny read-back contract is unchanged; unified mode adds the shared box.
      shinyInput("hover", k); // deduped -> re-fires only when the hovered key changes
      const hm = opts.hoverMode || "closest";
      if (hm === "x" || hm === "y") {
        const keys = dropInert(columnKeys(k, hm));
        if (!keys.length) { clearHover(); return; }
        setHoverKeys(keys);
        if (opts.crosshair) drawCrosshair(k, hm);
        if (opts.tooltip) showTipMulti(clientX, clientY, keys);
      } else {
        const keys = dropInert(linkedKeys(k));
        if (!keys.length) { clearHover(); return; }
        setHoverKeys(keys);
        if (opts.crosshair) drawCrosshair(k, "closest");
        if (opts.tooltip) showTip(clientX, clientY, k);
      }
    }
    function onHoverMove(ev: MouseEvent): void {
      if (down || pinchDist > 0) return;
      const hm = opts.hoverMode || "closest";
      // Directly over a mark: resolve synchronously (cheap, no scan).
      const k = keyOf(ev.target);
      if (k != null) {
        if (hoverRAF) {
          cancelAnimationFrame(hoverRAF);
          hoverRAF = 0;
        }
        hoverAt(k, ev.clientX, ev.clientY);
        return;
      }
      // In open space, the closest-mark path needs `nearest`; unified hover always
      // seeds off the nearest position on its axis (that snapping is the point).
      if (!elements.length || (hm === "closest" && !opts.nearest)) {
        clearHover();
        return;
      }
      // The scan is O(n); throttle it to one per frame so fast pointer moves over a
      // large plot don't run it dozens of times.
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (hoverRAF) return;
      hoverRAF = requestAnimationFrame(function () {
        hoverRAF = 0;
        const u = clientToScene(cx, cy); // calibrated hit-test mapping (robust to CSS scaling)
        let seed: string | null;
        if (hm === "x") seed = nearestAxisKey("x", u.x);
        else if (hm === "y") seed = nearestAxisKey("y", u.y);
        else seed = nearestKeyAt(u.x, u.y, vb ? vb.w * 0.02 : 8); // ~2% of the view width
        hoverAt(seed, cx, cy);
      });
    }

    // Drag move/up are bound to `window` only for the lifetime of a press (added
    // in onDown, removed in onDragUp), so a drag that leaves the svg still
    // resolves without leaking global listeners across widgets.
    function onDragMove(ev: PointerEvent): void {
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      }
      // Two active pointers -> pinch-zoom about their midpoint.
      if (pinchDist > 0 && pointers.size >= 2 && vb) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        if (d > 0) {
          const u = toView((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
          vb = zoomViewBox(vb, d / pinchDist, u.x, u.y);
          applyViewBox();
          pinchDist = d;
        }
        return;
      }
      if (!down) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
        dragging = mode === "pan" && opts.zoom ? "pan"
          : mode === "lasso" && opts.lasso ? "lasso"
          : opts.brush ? "brush" : "";
        if (dragging === "pan") el.classList.add("vellumwidget-panning");
        if (dragging === "lasso") lassoPts = [clientToScene(down.cx, down.cy)]; // seed with the press point
        if (dragging === "") return;
        movedDuringDrag = true;
      }
      if (dragging === "brush") {
        const box = el.getBoundingClientRect();
        positionBrush(
          Math.min(down.cx, ev.clientX) - box.left,
          Math.min(down.cy, ev.clientY) - box.top,
          Math.abs(ev.clientX - down.cx),
          Math.abs(ev.clientY - down.cy)
        );
      } else if (dragging === "lasso" && vb) {
        lassoPts.push(clientToScene(ev.clientX, ev.clientY));
        updateLassoPath();
      } else if (dragging === "pan" && vb) {
        const u = toView(ev.clientX, ev.clientY);
        vb.x -= u.x - down.ux;
        vb.y -= u.y - down.uy;
        applyViewBox();
        const u2 = toView(ev.clientX, ev.clientY); // re-anchor: track cursor 1:1
        down.ux = u2.x;
        down.uy = u2.y;
      }
    }

    function onDown(ev: PointerEvent): void {
      // Ignore non-primary mouse buttons; touch/pen have button 0/-1.
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      // Drag move/up bind to `window` for the lifetime of a press (addEventListener
      // dedups identical listeners, so repeated downs don't stack them).
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      if (pointers.size >= 2 && opts.zoom) {
        // A second finger: start a pinch, abandoning any nascent single drag.
        const pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        down = null;
        dragging = "";
        hideBrush();
        el.classList.remove("vellumwidget-panning");
        return;
      }
      const u = toView(ev.clientX, ev.clientY);
      down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      dragging = "";
      movedDuringDrag = false;
    }

    function onDragUp(ev: PointerEvent): void {
      pointers.delete(ev.pointerId);
      const wasPinch = pinchDist > 0;
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        window.removeEventListener("pointermove", onDragMove);
        window.removeEventListener("pointerup", onDragUp);
        window.removeEventListener("pointercancel", onDragUp);
      }
      if (wasPinch) {
        down = null;
        dragging = "";
        el.classList.remove("vellumwidget-panning");
        hideBrush();
        reportView(); // pinch settled -> report the final view
        return;
      }
      if (dragging === "brush" && down) {
        const p1 = clientToScene(down.cx, down.cy);
        const p2 = clientToScene(ev.clientX, ev.clientY);
        const rect: Bbox = {
          x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y),
          x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y)
        };
        lastBrush = rect;
        const hitKeys = dropInert(brushKeysIn(rect)); // never (re-)select hidden/filtered marks
        if (opts.select) setSelection(hitKeys); // also pushes _selected
        // The brushed region + keys, as a discrete gesture event; data-space bounds
        // (x0d/x1d/y0d/y1d + panel) added when a panel scale applies.
        shinyInput("brush", Object.assign(
          { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
          brushDataFields(rect)
        ), { priority: "event" });
        hideBrush();
      } else if (dragging === "lasso") {
        // Close the freehand path and select every mark whose centre is inside it.
        const poly = lassoPts.slice();
        const hitKeys = dropInert(lassoKeysIn(poly)); // never (re-)select hidden/filtered marks
        if (poly.length >= 3) {
          const b = polyBounds(poly);
          lastBrush = b; // zoom-to-selection frames the lasso's bounds
          if (opts.select) setSelection(hitKeys);
          // Report as a brush gesture (keys + the lasso's bounding box), with a
          // `lasso: true` flag so the server can tell the two apart, plus data-space
          // bounds when a panel scale applies.
          shinyInput("brush", Object.assign(
            { keys: hitKeys, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lasso: true },
            brushDataFields(b)
          ), { priority: "event" });
        }
        clearLasso();
      }
      // A pan reports once here (its per-frame applyViewBox calls skipped reporting).
      if (dragging === "pan") reportView();
      el.classList.remove("vellumwidget-panning");
      down = null;
      dragging = "";
    }

    function onClick(ev: MouseEvent): void {
      if (movedDuringDrag) {
        movedDuringDrag = false;
        return;
      } // a drag, not a click
      let k = keyOf(ev.target);
      // Raster mode has no per-element nodes, so resolve the click to the nearest
      // mark within a small radius (same snap the hover uses).
      if (k == null && rasterMode && opts.nearest !== false && elements.length) {
        const u = clientToScene(ev.clientX, ev.clientY);
        const rad = vb ? vb.w * 0.02 : 8;
        k = nearestKeyAt(u.x, u.y, rad);
        if (k != null && inert(k)) k = null; // don't click-snap to a hidden/filtered mark
      }
      // A click is a discrete event (fires every time, even on the same mark);
      // `key` is null for an empty-space click.
      shinyInput("click", { key: k }, { priority: "event" });
      // A legend swatch under the hide/mute policy toggles its series instead of
      // selecting it. The second click of a double-click (detail >= 2) is left for
      // onDblClick to turn into an isolate.
      const series = swatchSeries(k);
      if (series != null && legendPolicy() !== "select") {
        if (!(ev.detail && ev.detail >= 2)) legendToggle(series);
        return;
      }
      if (k != null) {
        if (opts.select) toggleSelect(k);
      } else {
        clearSelection();
        lastBrush = null;
      }
    }
    // Double-click a legend swatch (hide/mute policy) to isolate its series.
    function onDblClick(ev: MouseEvent): void {
      const series = swatchSeries(keyOf(ev.target));
      if (series != null && legendPolicy() !== "select") legendIsolate(series);
    }

    function onWheel(ev: WheelEvent): void {
      if (!opts.zoom || !vb) return;
      ev.preventDefault();
      const u = toView(ev.clientX, ev.clientY);
      const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
      vb = zoomViewBox(vb, factor, u.x, u.y);
      applyViewBox();
    }

    function onKey(ev: KeyboardEvent): void {
      if (ev.key === "Escape") {
        clearSelection();
        clearHover();
        clearClass("vellumwidget-focus");
        hideBrush();
        lastBrush = null;
        // Leave mark-traversal mode, returning focus to the widget as a whole.
        if (markFocused() && typeof el.focus === "function") el.focus();
        focusIdx = -1;
        return;
      }
      // Accessibility: while a mark has keyboard focus, arrows traverse marks
      // (roving tabindex) and Enter/Space toggles its selection — this takes
      // precedence over pan/zoom, which owns the arrows when no mark is focused.
      if (opts.a11y && markFocused()) {
        const k = focusables[focusIdx].key;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
          focusRoving(focusIdx + 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
          focusRoving(focusIdx - 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          const series = swatchSeries(k);
          if (series != null && legendPolicy() !== "select") {
            legendToggle(series);
            announce(a11yLabel(k) + (legendOff[series] ? ", hidden" : ", shown"));
          } else {
            if (opts.select) toggleSelect(k);
            announce(a11yLabel(k) + (selected[k] ? ", selected" : ", not selected"));
          }
          ev.preventDefault();
          return;
        }
      }
      // Keyboard pan/zoom (the root is focusable): arrows pan, +/- zoom, 0 resets.
      if (!opts.zoom || !vb) return;
      if (ev.key === "0") {
        resetZoom();
        ev.preventDefault();
        return;
      }
      const dx = vb.w * 0.12;
      const dy = vb.h * 0.12;
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      let handled = true;
      switch (ev.key) {
        case "ArrowLeft": vb.x -= dx; break;
        case "ArrowRight": vb.x += dx; break;
        case "ArrowUp": vb.y -= dy; break;
        case "ArrowDown": vb.y += dy; break;
        case "+": case "=": vb = zoomViewBox(vb, 1.2, cx, cy); break;
        case "-": case "_": vb = zoomViewBox(vb, 1 / 1.2, cx, cy); break;
        default: handled = false;
      }
      if (handled) {
        applyViewBox();
        ev.preventDefault();
      }
    }

    // --- toolbar ---
    // The drag modes enabled for this widget, in cycle order (selection tools
    // adjacent, then pan). The toolbar's mode button cycles through this list.
    const MODE_ICON: Record<string, string> = { brush: "▭", lasso: "◌", pan: "✋" };
    const MODE_LABEL: Record<string, string> = { brush: "brush-select", lasso: "lasso-select", pan: "pan" };
    function availableModes(): ("brush" | "lasso" | "pan")[] {
      const m: ("brush" | "lasso" | "pan")[] = [];
      if (opts.brush) m.push("brush");
      if (opts.lasso) m.push("lasso");
      if (opts.zoom) m.push("pan");
      return m;
    }
    function setMode(m: "brush" | "pan" | "lasso"): void {
      mode = m;
      el.classList.toggle("vellumwidget-mode-pan", m === "pan");
      el.classList.toggle("vellumwidget-mode-lasso", m === "lasso");
      if (m !== "lasso") clearLasso(); // leaving lasso drops any in-progress outline
      if (toolbarEl) {
        const b = toolbarEl.querySelector('[data-act="mode"]');
        if (b) {
          const modes = availableModes();
          const next = modes[(modes.indexOf(m) + 1) % modes.length];
          b.textContent = MODE_ICON[m];
          (b as HTMLElement).title =
            MODE_LABEL[m][0].toUpperCase() + MODE_LABEL[m].slice(1) + " mode" +
            (next && next !== m ? " (click for " + MODE_LABEL[next] + ")" : "");
          b.classList.toggle("vellumwidget-active", m !== "brush");
        }
      }
    }
    function cycleMode(): void {
      const modes = availableModes();
      if (modes.length < 2) return;
      setMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
    }
    // Export filename base (no extension) and PNG resolution scale, both
    // overridable via `as_widget(export = ...)`. The serialized SVG always
    // reflects the *current* viewBox, so a zoomed/panned view exports as shown.
    function exportName(): string {
      const n = opts.export && opts.export.filename;
      return n && String(n).length ? String(n) : "plot";
    }
    function exportScale(): number {
      const s = opts.export && opts.export.scale;
      return s && s > 0 ? s : 1;
    }
    function saveSvg(): void {
      if (!svgEl) return;
      const s = new XMLSerializer().serializeToString(svgEl);
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
    }
    // Rasterise the current SVG to a canvas; `then(canvas)` on success, `fail()`
    // if the canvas is tainted/unsupported. Shared by savePng + copyPng.
    function toCanvas(then: (c: HTMLCanvasElement) => void, fail: () => void): void {
      if (!svgEl) return fail();
      const s = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function () {
        const k = exportScale();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((vb0 ? vb0.w : img.width) * k);
        canvas.height = Math.round((vb0 ? vb0.h : img.height) * k);
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(url);
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          then(canvas);
        } else {
          fail();
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fail();
      };
      img.src = url;
    }
    function savePng(): void {
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (b) download(b, exportName() + ".png");
          });
        },
        saveSvg // canvas tainted / unsupported -> fall back to SVG
      );
    }
    // Copy the current view to the clipboard as a PNG (secure-context only).
    function canCopy(): boolean {
      const nav = navigator as unknown as { clipboard?: { write?: unknown } };
      return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
    }
    function copyPng(): void {
      if (!canCopy()) return;
      toCanvas(
        function (canvas) {
          canvas.toBlob(function (b) {
            if (!b) return;
            const nav = navigator as unknown as {
              clipboard: { write: (items: unknown[]) => Promise<void> };
            };
            nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function () {});
          });
        },
        function () {}
      );
    }
    function toggleFullscreen(): void {
      const anyEl = el as unknown as { requestFullscreen?: () => void };
      const anyDoc = document as unknown as { fullscreenElement?: Element; exitFullscreen?: () => void };
      if (anyDoc.fullscreenElement) {
        if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
      } else if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      }
    }
    function zoomToSelection(): void {
      const rect = lastBrush || unionBbox(elements, selected);
      if (rect) zoomTo(rect);
    }

    function buildToolbar(): void {
      if (toolbarEl) {
        toolbarEl.remove();
        toolbarEl = null;
      }
      if (!opts.toolbar) return;
      const bar = document.createElement("div");
      bar.className = "vellumwidget-toolbar";
      const btn = (act: string, label: string, title: string, fn: () => void) => {
        const b = document.createElement("button");
        b.setAttribute("data-act", act);
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          fn();
        });
        bar.appendChild(b);
        return b;
      };
      // One mode button cycles the enabled drag modes (brush / lasso / pan);
      // shown only when at least two are enabled. setMode() fills its icon + title.
      if (availableModes().length >= 2) btn("mode", MODE_ICON[mode], "Drag mode", cycleMode);
      if (opts.zoom) {
        btn("zoomsel", "⌖", "Zoom to selection", zoomToSelection);
        btn("reset", "⟲", "Reset zoom", resetZoom);
      }
      btn("svg", "SVG", "Download SVG", saveSvg);
      btn("png", "PNG", "Download PNG", savePng);
      if (canCopy()) btn("copy", "⧉", "Copy PNG to clipboard", copyPng);
      btn("full", "⛶", "Fullscreen", toggleFullscreen);
      el.appendChild(bar);
      toolbarEl = bar;
    }

    // Apply the interaction styling: the widget-wide theme (Option 1) as CSS
    // variables on the root, and per-element grammar colours (Option 2) as CSS
    // variables on the elements themselves — which override the root by
    // custom-property inheritance. A mark only gains a hover stroke if some hover
    // colour applies to it (root `vellumwidget-hc-all` or its own `vellumwidget-hc`), so
    // hover-uncoloured shapes keep their own borders untouched.
    function applyStyling(): void {
      const s = opts.style || {};
      const setRoot = (name: string, v: string | number | null | undefined) => {
        if (v != null && v !== "") el.style.setProperty(name, String(v));
        else el.style.removeProperty(name);
      };
      setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
      setRoot("--vellumwidget-selected-stroke", s.selectedColor);
      setRoot("--vellumwidget-tip-bg", s.tipBg);
      setRoot("--vellumwidget-tip-fg", s.tipFg);
      setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
      setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
      if (s.hoverColor != null && s.hoverColor !== "") {
        el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
        el.classList.add("vellumwidget-hc-all");
      } else {
        el.style.removeProperty("--vellumwidget-hl-stroke");
        el.classList.remove("vellumwidget-hc-all");
      }
      // Per-element overrides + legend-swatch tagging.
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
        const nodes = elementsForKey(e.key);
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j] as unknown as HTMLElement;
          if (e.hover_color != null) {
            n.style.setProperty("--vellumwidget-hl-stroke", e.hover_color);
            n.classList.add("vellumwidget-hc");
          }
          if (e.selected_color != null) {
            n.style.setProperty("--vellumwidget-selected-stroke", e.selected_color);
          }
          // A legend swatch stays fully visible during hover (not dimmed with the
          // rest), so the legend remains readable while a series is emphasised.
          if (e.legend_for != null) n.classList.add("vellumwidget-legend");
        }
      }
    }

    // --- accessibility (screen reader + keyboard traversal) ---
    // A stable, plain-text label for a mark: its tooltip (tags stripped) or key.
    function a11yLabel(k: string): string {
      const m = meta[k];
      return m && m.tooltip ? stripTags(m.tooltip) : k;
    }
    // The label plus current selection state, for a spoken announcement.
    function focusLabel(k: string): string {
      return a11yLabel(k) + (selected[k] ? ", selected" : "");
    }
    // Speak `msg` through the polite live region (no-op if a11y is off). Skip a
    // repeat of the current text: focusRoving() announces and then moves DOM
    // focus, whose focus handler announces the same label again — the guard stops
    // some screen readers speaking it twice.
    function announce(msg: string): void {
      if (liveRegion && liveRegion.textContent !== msg) liveRegion.textContent = msg;
    }
    // Reflect that mark `focusables[i]` is the focused one: roving index, focus
    // ring + highlight, and a spoken announcement. Pure state/DOM update — does
    // not itself move DOM focus (callers decide), so it is reliable regardless of
    // how focus arrived (Tab, arrow keys, or assistive tech).
    function showMarkFocus(i: number): void {
      focusIdx = i;
      const k = focusables[i].key;
      clearClass("vellumwidget-focus");
      addClassForKeys([k], "vellumwidget-focus");
      setHover(k);
      announce(focusLabel(k));
    }
    // A mark received DOM focus (Tab or assistive tech): adopt it as the cursor.
    function onMarkFocus(ev: FocusEvent): void {
      const k = keyOf(ev.target);
      if (k == null) return;
      const i = focusables.findIndex((f) => f.key === k);
      if (i >= 0) showMarkFocus(i);
    }
    // Focus left a mark: if it did not move to another mark, exit traversal mode.
    function onMarkBlur(ev: FocusEvent): void {
      const to = keyOf((ev as unknown as { relatedTarget: EventTarget | null }).relatedTarget);
      if (to == null) {
        focusIdx = -1;
        clearClass("vellumwidget-focus");
      }
    }
    // Move the roving tabindex to focusable `i` (clamped), update state, and move
    // DOM focus to it.
    function focusRoving(i: number): void {
      if (!focusables.length) return;
      const dir = i < focusIdx ? -1 : 1;
      if (i < 0) i = 0;
      if (i >= focusables.length) i = focusables.length - 1;
      // Skip inert marks (cross-filtered or legend-hidden -> display:none): focusing
      // one is a no-op, so keep moving in the travel direction; if there is no
      // visible mark that way, stay put.
      while (focusables[i] && inert(focusables[i].key)) {
        i += dir;
        if (i < 0 || i >= focusables.length) return;
      }
      if (focusIdx >= 0 && focusables[focusIdx]) {
        focusables[focusIdx].node.setAttribute("tabindex", "-1");
      }
      const f = focusables[i];
      f.node.setAttribute("tabindex", "0");
      showMarkFocus(i);
      const n = f.node as unknown as HTMLElement;
      if (typeof n.focus === "function") n.focus();
    }
    // In mark-traversal mode? (a mark is the current keyboard cursor). Driven by
    // focusIdx rather than document.activeElement so it is robust across browsers
    // and assistive tech.
    function markFocused(): boolean {
      return opts.a11y && focusIdx >= 0 && !!focusables[focusIdx];
    }
    // A visually-hidden data table listing every mark (key + description), so a
    // screen-reader user gets the underlying data even without traversing marks.
    function buildDataTable(): void {
      if (tableEl) {
        tableEl.remove();
        tableEl = null;
      }
      if (!opts.a11y || !elements.length) return;
      const tbl = document.createElement("table");
      tbl.className = "vellumwidget-sr-only vellumwidget-data-table";
      const cap = document.createElement("caption");
      cap.textContent = "Data table";
      tbl.appendChild(cap);
      const head = document.createElement("tr");
      const h1 = document.createElement("th");
      h1.setAttribute("scope", "col");
      h1.textContent = "Item";
      const h2 = document.createElement("th");
      h2.setAttribute("scope", "col");
      h2.textContent = "Description";
      head.appendChild(h1);
      head.appendChild(h2);
      tbl.appendChild(head);
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
        if (seen[k]) continue;
        seen[k] = true;
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.setAttribute("scope", "row");
        th.textContent = k;
        const td = document.createElement("td");
        td.textContent = a11yLabel(k);
        tr.appendChild(th);
        tr.appendChild(td);
        tbl.appendChild(tr);
      }
      el.appendChild(tbl);
      tableEl = tbl;
    }
    // Make the rendered scene an accessible, keyboard-navigable chart: label the
    // svg, expose an aria-live announcer + a data-table fallback, and make each
    // mark a focusable graphics-symbol carrying a roving tabindex. All gated on
    // opts.a11y so the default output is unchanged when it is off.
    function setupA11y(): void {
      focusables = [];
      focusIdx = -1;
      if (!opts.a11y || !svgEl) {
        buildDataTable(); // (a no-op when a11y is off — also clears a stale table)
        return;
      }
      if (rasterMode) {
        // No per-element DOM nodes to focus, and a data table of the (large) element
        // set would reintroduce the DOM blowup raster mode exists to avoid. Present
        // the chart as a labelled image; the scene's <title>/<desc> (or `alt`) name it.
        svgEl.setAttribute("role", "img");
        if (opts.alt) {
          svgEl.removeAttribute("aria-labelledby");
          svgEl.setAttribute("aria-label", opts.alt);
        } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
          svgEl.setAttribute("aria-label", "Chart");
        }
        return;
      }
      // The widget is an interactive chart, not a static image (role="img"
      // would hide the focusable marks from assistive tech).
      svgEl.setAttribute("role", "graphics-document");
      svgEl.setAttribute("aria-roledescription", "interactive chart");
      if (opts.alt) {
        // Drop the name vellum referenced via aria-labelledby (its <title>/<desc>);
        // aria-labelledby outranks aria-label, so it would otherwise defeat `alt`.
        svgEl.removeAttribute("aria-labelledby");
        svgEl.setAttribute("aria-label", opts.alt);
      } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
        // No name from vellum's <title>/<desc> and none given: label generically.
        svgEl.setAttribute("aria-label", "Interactive chart");
      }

      if (!liveRegion) {
        liveRegion = document.createElement("div");
        liveRegion.className = "vellumwidget-sr-only";
        liveRegion.setAttribute("role", "status");
        liveRegion.setAttribute("aria-live", "polite");
        el.appendChild(liveRegion);
      } else {
        liveRegion.textContent = "";
      }

      const seen: Record<string, boolean> = {};
      for (let i = 0; i < elements.length; i++) {
        const k = elements[i].key;
        if (seen[k]) continue;
        const nodes = nodesByKey[k];
        if (!nodes || !nodes.length) continue;
        seen[k] = true;
        const node = nodes[0];
        node.setAttribute("role", "graphics-symbol");
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-label", a11yLabel(k));
        node.addEventListener("focus", onMarkFocus as EventListener);
        node.addEventListener("blur", onMarkBlur as EventListener);
        focusables.push({ key: k, node });
      }
      // The first mark carries tabindex=0 so a Tab press enters the mark set.
      if (focusables.length) focusables[0].node.setAttribute("tabindex", "0");

      buildDataTable();
    }

    function wire(svg: SVGSVGElement): void {
      // Pointer events cover mouse + touch + pen in one path.
      svg.addEventListener("pointermove", onHoverMove);
      svg.addEventListener("pointerleave", clearHover);
      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("click", onClick);
      svg.addEventListener("dblclick", onDblClick);
      if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
      // Touch drag/pinch shouldn't scroll the page over an interactive plot.
      if (opts.zoom || opts.brush) el.classList.add("vellumwidget-gesture");
      el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", onKey);
    }

    return {
      renderValue: function (x: Payload) {
        opts = Object.assign(
          // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
          // zoom are on unless the payload overrides them. (as_widget() no longer
          // exposes these as flags; the defaults live here.)
          { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed" },
          x.options || {}
        );
        elements = normalizeElements(x.elements);
        panels = normalizePanels(x.panels);
        colorbar = x.colorbar || null;
        interactions = x.interactions || null;
        condTagElems = {};
        filtSelElems = {};
        joinOf = {};
        lastHoverKeys = [];
        meta = {};
        groups = {};
        legendIndex = {};
        legendSwatch = {};
        legendOff = {};
        hiddenKeySet = {};
        filteredKeySet = {};
        selected = {};
        lastBrush = null;
        mode = "brush";
        group = opts.group || null;
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          meta[e.key] = e;
          if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
          if (e.legend != null) {
            const series = Array.isArray(e.legend) ? e.legend : [e.legend];
            for (let s = 0; s < series.length; s++) {
              (legendIndex[series[s]] = legendIndex[series[s]] || []).push(e.key);
            }
          }
          if (e.legend_for != null) (legendSwatch[e.legend_for] = legendSwatch[e.legend_for] || []).push(e.key);
        }

        if (!holder) {
          // The stage shrink-wraps the base svg (both dims) so the absolute overlays
          // (dim layer, crisp-zoom canvas) fill the svg's box rather than the root's
          // — the root is often taller (htmlwidgets stamps an explicit height) and
          // can be wider (fluid layout), and sizing the overlays to it letterboxes
          // their viewBox, shifting every hover/select ring off the mark. brush box +
          // tip stay on the root (they position from the root rect, whose top-left
          // coincides with the svg's).
          stage = document.createElement("div");
          stage.className = "vellumwidget-stage";
          el.appendChild(stage);
          holder = document.createElement("div");
          holder.className = "vellumwidget-svg-holder";
          stage.appendChild(holder);
          // Overlay for the large-scene hover dim (sibling of the holder, so the
          // holder's dim opacity does not affect it). pointer-events:none, so it
          // never intercepts hit-testing on the base svg.
          dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
          dimLayer.setAttribute("class", "vellumwidget-dim-layer");
          dimLayer.setAttribute("aria-hidden", "true");
          // Crosshair guide layer: own overlay (below the dim/highlight layer), so
          // the highlight-overlay clear/redraw never disturbs the guide and vice
          // versa. pointer-events:none, so it never intercepts hit-testing.
          crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
          crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
          crosshairLayer.setAttribute("aria-hidden", "true");
          stage.appendChild(crosshairLayer);
          stage.appendChild(dimLayer);
          el.appendChild(brushBox);
          el.appendChild(tip);
          // Sticky-tooltip support: entering the tip cancels the pending hide (so a
          // link/button inside it stays reachable); leaving it hides. Inert unless
          // sticky is on (the tip is pointer-events:none otherwise, so these never fire).
          tip.addEventListener("pointerenter", function () {
            if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = 0; }
          });
          tip.addEventListener("pointerleave", function () { hideTip(); });
        }
        holder.innerHTML = x.svg;
        svgEl = holder.querySelector("svg");
        // Cache key -> nodes once (the SVG is static after injection), so hover/
        // select highlighting avoids a `querySelectorAll` per key.
        nodesByKey = {};
        if (holder) {
          const keyed = holder.querySelectorAll("[data-key]");
          for (let i = 0; i < keyed.length; i++) {
            const k = keyed[i].getAttribute("data-key");
            if (k != null) (nodesByKey[k] = nodesByKey[k] || []).push(keyed[i]);
          }
        }
        if (svgEl) {
          vb0 = parseViewBox(svgEl.getAttribute("viewBox"));
          if (!vb0) {
            const w = parseFloat(svgEl.getAttribute("width") || "0");
            const h = parseFloat(svgEl.getAttribute("height") || "0");
            if (w && h) vb0 = { x: 0, y: 0, w: w, h: h };
          }
          vb = vb0 ? { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h } : null;
          // Reset any dim/feedback left by a prior render, then arm this render's
          // hover path and (re)build the spatial index over the new elements.
          hideHighlightOverlay(); // also empties the overlay (removes old feedback groups)
          rasterMode = !!opts.raster;
          largeDim = !rasterMode && elements.length > DIM_OVERLAY_MIN;
          selGroup = null;
          hovGroup = null;
          if (rasterMode && dimLayer) {
            // Two overlay groups: persistent selection rings + a transient hover ring,
            // drawn from the index since there are no per-element DOM nodes to style.
            selGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
            hovGroup = document.createElementNS(SVGNS, "g") as SVGGElement;
            dimLayer.appendChild(selGroup);
            dimLayer.appendChild(hovGroup);
          }
          if (dimLayer && vb0) dimLayer.setAttribute("viewBox", fmtViewBox(vb0));
          if (crosshairLayer && vb0) crosshairLayer.setAttribute("viewBox", fmtViewBox(vb0));
          clearCrosshair(); // drop any guide left by a prior render
          // Crisp-zoom canvas: sample the base raster (raster mode only); otherwise
          // make sure any canvas from a prior render is hidden.
          if (rasterMode) {
            ensureCanvas();
            sampleBaseRaster();
          } else {
            clearPointData();
          }
          buildSpatialIndex();
          buildHoverAxis();
          wire(svgEl);
          buildToolbar();
          buildNavigator();
          buildColorbar();
          setupInteractions(); // index the declarative interaction block (conditions/…)
          setupAxisZoom(); // scale the data region + re-tick (after the nav clone)
          // The range navigator drives an x-only zoom (the full y-range stays on
          // screen). Rendered through axis_zoom when it's active (fixed frame, crisp
          // re-ticked x-axis), else via a non-uniform stretch fallback. SVG only.
          xZoom = !!opts.navigator && !rasterMode;
          applyAspect();
          setMode(availableModes()[0] || "brush"); // first enabled mode is the default
          tip.classList.toggle("vellumwidget-tip-sticky", !!opts.tooltipSticky);
          applyStyling();
          applyLegend(); // clears any stale legend-off state from a prior render
          setupA11y();
          setupLinking();
          // Publish the (empty) initial selection so a (re-)render clears any
          // stale value the server held from a previous instance.
          shinyInput("selected", selectedKeys());
          // In case Shiny attached after this bundle first evaluated.
          registerProxyHandler();
        }
      },

      resize: function () {
        // The SVG scales via its viewBox; only the crisp-zoom canvas is sized in
        // device pixels, so re-fit it to the new box (no-op unless raster + zoomed).
        drawPoints();
      },

      // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
      // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
      _call: proxyCall,

      // Test seam: the index-backed query functions + hover-mode flags, so the
      // headless suite can verify the spatial index with explicit coordinates
      // (jsdom has no layout, so client->user coordinate mapping is degenerate).
      _test: {
        nearestKeyAt: nearestKeyAt,
        brushKeysIn: brushKeysIn,
        indexSize: function () { return spatialIndex ? spatialIndex.numItems : 0; },
        largeDim: function () { return largeDim; },
        rasterMode: function () { return rasterMode; },
        hasCanvas: function () { return !!canvasEl; },
        pointCount: function () { return ptN; },
        hoverMode: function () { return opts.hoverMode || "closest"; },
        columnKeys: columnKeys,
        nearestAxisKey: nearestAxisKey,
        legendOff: function () { return Object.keys(legendOff).filter((s) => legendOff[s]); },
        lassoKeysIn: lassoKeysIn,
        availableModes: availableModes,
        mode: function () { return mode; },
        inert: inert,
        dropInert: dropInert,
        panelAt: panelAt,
        dataRangeOf: dataRangeOf,
        brushDataFields: brushDataFields,
        hasNavigator: function () { return !!navEl; },
        navToView: navToView,
        hasColorbar: function () { return !!colorbarLayer; },
        setColorRange: setColorRange,
        colorHidden: function () { return Object.keys(colorHiddenSet); },
        cbHandleCount: function () { return colorbarLayer ? colorbarLayer.querySelectorAll(".vellumwidget-cb-handle").length : 0; },
        navWindowFrac: function () {
          if (!navWindow) return null;
          return { left: parseFloat(navWindow.style.left) || 0, width: parseFloat(navWindow.style.width) || 0 };
        },
        axisZoomActive: function () { return axisZoomActive; },
        panTransform: function () { return panGroup ? panGroup.getAttribute("transform") : null; },
        panScaleVars: function () {
          if (!panGroup) return null;
          return { ix: panGroup.style.getPropertyValue("--vw-ix"), iy: panGroup.style.getPropertyValue("--vw-iy") };
        },
        // Re-ticked axis labels (their text + device-px position), for asserting the
        // re-tick output without a real layout engine.
        retickLabels: function () {
          if (!retickLayer) return [];
          return Array.prototype.map.call(retickLayer.querySelectorAll("text"), function (t: Element) {
            return { text: t.textContent, x: parseFloat(t.getAttribute("x") || "NaN"), y: parseFloat(t.getAttribute("y") || "NaN") };
          });
        },
        retickGridCount: function () { return retickGrid ? retickGrid.querySelectorAll("line").length : 0; },
        staticAxesHidden: function () {
          if (!svgEl) return null;
          const nodes = svgEl.querySelectorAll('[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
          if (!nodes.length) return null;
          return Array.prototype.every.call(nodes, function (n: Element) { return (n as SVGElement).style.display === "none"; });
        },
        setView: function (nvb: ViewBox) { vb = { x: nvb.x, y: nvb.y, w: nvb.w, h: nvb.h }; applyViewBox(); },
        toView: toView
      }
    };
  }
});

// Route a server->client proxy message to its target widget instance. Split out
// (and given an injectable resolver) so it is unit-testable without a live Shiny.
function dispatchProxyCall(
  msg: ProxyMessage | null | undefined,
  findInstance: (id: string) => WidgetInstance | null
): void {
  if (!msg || msg.id == null) return;
  const inst = findInstance(msg.id);
  if (inst && typeof inst._call === "function") inst._call(msg.method, msg.args);
}

// Register the "vellumwidget-calls" custom-message handler once, so a Shiny app can
// drive rendered widgets via vellumwidget_proxy(). Attempted at load and again on the
// first render, since Shiny may attach after this bundle evaluates; a module-level
// guard keeps it to a single registration.
let proxyHandlerRegistered = false;
function registerProxyHandler(): void {
  if (proxyHandlerRegistered) return;
  const sh = (window as unknown as {
    Shiny?: { addCustomMessageHandler?: (t: string, cb: (m: ProxyMessage) => void) => void };
  }).Shiny;
  if (!sh || typeof sh.addCustomMessageHandler !== "function") return;
  proxyHandlerRegistered = true;
  sh.addCustomMessageHandler("vellumwidget-calls", function (msg: ProxyMessage) {
    dispatchProxyCall(msg, function (id) {
      return HTMLWidgets.find ? HTMLWidgets.find("#" + id) : null;
    });
  });
}
registerProxyHandler();

// Test seam: expose the pure helpers for the headless behaviour suite.
(window as unknown as { __vellumwidgetTest?: unknown }).__vellumwidgetTest = {
  rectsIntersect,
  distToBbox,
  brushKeys,
  nearestKey,
  zoomViewBox,
  parseViewBox,
  fmtViewBox,
  unionBbox,
  sanitizeTip,
  dispatchProxyCall,
  normalizeElements,
  isZoomedIn,
  userToCanvas,
  nearestSortedIdx,
  columnTolerance,
  pointInPolygon,
  lassoKeys,
  polyBounds,
  nativeToData,
  pxToDataX,
  pxToDataY,
  normalizePanels,
  viewToPan,
  panToView,
  niceTicks,
  fmtTick,
  dataToNative
};
