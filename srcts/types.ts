// Shared type declarations for the vellumwidget runtime: the payload shapes the R
// side ships and the small structural types the helpers and the factory share.

import type { DLColumn, DLPayload } from "./dlist";
import type { GeometryPayload } from "./geometry";

// The subset of the object a widget's factory returns that the proxy needs: the
// `_call` seam that routes a server-driven command onto the instance.
export interface WidgetInstance {
  _call?: (method: string, args: unknown) => void;
}

// A server->client proxy command (from vellumwidget_proxy()): which widget, which
// action, and its keys. Delivered via Shiny's "vellumwidget-calls" custom message.
export interface ProxyMessage {
  id: string;
  method: string;
  args?: unknown;
}

export interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ElemMeta extends Partial<Bbox> {
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
  // VW-46: a per-row `if_false` colour per tag (a CSS colour), which replaces
  // the condition's constant `if_false` / theme dim for this element.
  cond_value?: Record<string, string>; // per tag: a colour, or an opacity (alpha, VW-56)
  filt?: string[]; // filter selection names whose filter_by() targets this element's view
  join?: string; // cross-view identity (a composition cell's original id, keys being per-cell unique)
  source?: string; // graph edge: key of the endpoint node it starts at
  target?: string; // graph edge: key of the endpoint node it ends at
  // Interval-selection data values (select_interval()): the element's value on
  // the x / y channel -- numeric (`ix`, with `ixh` the upper end when a series
  // spans a range), or the category label on a discrete axis (`ixd`).
  ix?: number;
  ixh?: number;
  ixd?: string;
  iy?: number;
  iyh?: number;
  iyd?: string;
}

// The interactive colorbar descriptor (continuous colour scale): the gradient
// bar's device-px rectangle + its value domain/orientation (from vellumplot).
export interface ColorbarInfo {
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
export interface SelDef {
  name: string;
  kind: string; // "point" | "interval"
  on: string; // "click" | "hover" | "xy" | "x" | "y"
  type?: string; // same as kind (the spec-level name)
  // Interval: the position channels the brush constrains ("x" / "y"). A
  // length-1 vector may arrive auto-unboxed to a scalar.
  encodings?: string[] | string;
  region?: string; // "rect" | "lasso"
  fields?: string[] | string | null;
  toggle?: boolean;
  empty?: boolean;
  // A projection that expands a raw gesture to a related set before applying it.
  // From select_neighbours(): a graph node gesture -> its neighbourhood.
  expand?: { mode: string; degree?: number; edges?: boolean } | null;
  // Interval: "scales" binds the selection to its view's own pan/zoom domain
  // (Vega-Lite `bind: "scales"`); absent for a drawn brush.
  bind?: string;
  // The composition cells ("cell-<k>") that register the selection; absent for
  // a lone plot. A length-1 vector may arrive auto-unboxed.
  cells?: string[] | string;
}
export interface CondDef {
  selection: string;
  aes: string; // "color" | "fill" | ...
  // A constant style for non-members, or null = theme dim. A colour for a
  // colour aesthetic, a number for alpha/size, a shape name for shape: the
  // runtime routes it by `aes` (condLook(), VW-52).
  if_false?: string | number | null;
  empty?: boolean;
  // The element tag this condition styles; absent from an older vellumplot,
  // whose tags are "<sel>:<aes>" (VP-72).
  tag?: string;
}
// How an active condition styles a non-member (VW-52), routed by its
// aesthetic: "dim" the theme dim, "color" a fill/stroke colour, "alpha" an
// opacity, "none" no change (an if_false the widget can't apply, such as a
// size or a shape).
export interface CondLook {
  kind: "dim" | "color" | "alpha" | "none";
  color?: string;
  alpha?: number;
}

// The look of a condition's constant if_false for its aesthetic (VW-52). A
// colour aesthetic takes a colour string; alpha takes a number in [0, 1] as
// the non-members' opacity; anything else (size, shape, linewidth, a value of
// the wrong type) is not applied, so it is never painted as a colour. Size is
// left alone too: the widget has the drawn marks but not the size scale, so it
// can't tell how big a non-member of `size = condition(sel, x, 1)` should be.
// No if_false is the theme dim, whatever the aesthetic.
export function condLook(aes: string | null | undefined, ifFalse: unknown): CondLook {
  let v = ifFalse;
  if (Array.isArray(v)) v = v.length === 1 ? v[0] : null;
  if (v == null) return { kind: "dim" };
  if (isColorAes(aes)) return typeof v === "string" && v !== "" ? { kind: "color", color: v } : { kind: "none" };
  if (isAlphaAes(aes)) {
    const a = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return isFinite(a) && a >= 0 && a <= 1 ? { kind: "alpha", alpha: a } : { kind: "none" };
  }
  return { kind: "none" };
}

// A colour aesthetic: color/colour/fill/stroke, or a prefixed one such as
// edge_color. An older payload without `aes` counts as colour, as before.
export function isColorAes(aes: string | null | undefined): boolean {
  if (aes == null || aes === "") return true;
  return /(^|_)(colou?r|fill|stroke)$/.test(aes);
}

export function isAlphaAes(aes: string | null | undefined): boolean {
  return aes != null && /(^|_)(alpha|opacity)$/.test(aes);
}

export interface InteractionSpec {
  selections?: SelDef[];
  conditions?: CondDef[];
  filters?: { selection: string }[];
  // Scale binds (bind_scale()): the panels of `cell` (every panel when absent)
  // follow the interval selection's range on `aes`.
  binds?: BindDef[];
}
export interface BindDef { selection: string; aes: string; cell?: string; }

export interface Options {
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
  detailMarks?: number; // raster detail tier: materialise SVG nodes below this many visible marks (0 = off)
  maxZoom?: number; // the most a view zooms in, per axis, over the original (VW-44; default 100, DEFAULT_MAX_ZOOM)
  zoomMarks?: "fixed" | "scale"; // under axis_zoom, keep glyph marks a constant pixel size ("fixed", default) or let them scale ("scale")
  tooltipDelay?: number; // ms to wait before showing the tooltip on hover (default 0)
  tooltipFollow?: boolean; // true (default): tip tracks the cursor; false: anchor above the mark
  tooltipSticky?: boolean; // true: tip accepts pointer events + lingers so links are clickable
  animated?: boolean; // an anim_save() animated SVG: play/pause + scrubber controls, no interaction index (VW-55)
  autoplay?: boolean; // animated: start playing (default true), else start paused on the first frame (VW-61)
  loop?: boolean; // animated: loop forever (default true), else stop on the last frame (VW-61)
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
export interface StyleOpts {
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
export interface ColumnElements {
  key: string[] | string;
  mark?: (string | null)[] | string;
  x0?: (number | null)[] | number;
  y0?: (number | null)[] | number;
  x1?: (number | null)[] | number;
  y1?: (number | null)[] | number;
  // VW-43: the four bbox columns as integers on the 1/100 px grid (see
  // `decodeBbox()`), in place of x0..y1.
  bbox?: { n: number; lo: number[]; x0: unknown; y0: unknown; w: unknown; h: unknown; na?: number[] | number;
    ex?: { at: number[] | number; x0: number[] | number; y0: number[] | number; x1: number[] | number; y1: number[] | number } };
  tooltip?: (string | null)[] | string;
  hover_group?: (string | null)[] | string;
  hover_color?: (string | null)[] | string;
  selected_color?: (string | null)[] | string;
  legend_for?: (string | null)[] | string;
  legend?: (string[] | string | null)[] | string[] | string;
  filter_value?: (number | null)[] | number;
  cond?: (string[] | string | null)[] | string[] | string;
  // VW-46: tag -> one CSS colour per element (`null` where none), each a
  // column in any of the compact encodings.
  cond_value?: Record<string, unknown>;
  filt?: (string[] | string | null)[] | string[] | string;
  join?: (string | null)[] | string;
  source?: (string | null)[] | string;
  target?: (string | null)[] | string;
  ix?: (number | null)[] | number;
  ixh?: (number | null)[] | number;
  ixd?: (string | null)[] | string;
  iy?: (number | null)[] | number;
  iyh?: (number | null)[] | number;
  iyd?: (string | null)[] | string;
}

// Per-axis scale descriptor (from vellumplot's `scales` panel meta): the data and
// native (transformed, expanded) domains + the transform, enough to invert a
// device pixel back to a data value. See `.vellumwidget_panels()` on the R side.
export interface AxisScale {
  type: string; // continuous | log10 | discrete | binned | date | datetime
  transform: string; // identity | log10 | sqrt | reverse (native -> data)
  data_lo: number;
  data_hi: number;
  native_lo: number;
  native_hi: number;
  time_unit?: string; // "day" | "second" for date/datetime axes
  aes?: string; // the aesthetic this axis shows ("x" | "y"; swapped under coord_flip)
  levels?: string[] | string; // discrete axis: the levels in position order (level i at native i)
  breaks?: number[] | number; // static tick positions (native units), as vellumplot drew them
  labels?: string[] | string; // their formatted strings (htmlwidgets may unbox length-1)
}
// A cartesian data panel: its device-px rectangle (from vellum's resolved layout)
// plus each axis's scale descriptor. The px rect + native domain give the affine
// device px <-> native; the transform closes native <-> data.
export interface PanelInfo {
  name: string;
  cell?: string; // the composition cell the panel belongs to ("cell-<k>"), if any
  px0: number;
  py0: number;
  px1: number;
  py1: number;
  x?: AxisScale;
  y?: AxisScale;
}

export interface Payload {
  svg: string;
  elements: ElemMeta[] | ColumnElements;
  geometry?: GeometryPayload; // true vertices per keyed element, for exact picking
  panels?: PanelInfo[] | PanelInfo; // cartesian data panels (htmlwidgets may unbox a length-1 list)
  colorbar?: ColorbarInfo; // interactive continuous-colour colorbar (optional)
  marks?: MarksLayer; // split-render mark layer (raster mode, VW-14)
  displayList?: DLPayload; // marks-only display list (raster mode, VW-15)
  markColors?: MarkColors | null; // per-element dot colours above max_marks (raster mode, VW-50)
  above?: string | null; // furniture painted after the marks, as SVG (raster mode, VW-21)
  flagged?: FlaggedLayer | null; // per-run rasters of the flagged keyed marks (raster mode, VW-30)
  interactions?: InteractionSpec; // declarative interactivity (from the plot spec)
  provenance?: Provenance; // click-to-source rows per element (from inspect_source())
  options: Options;
}

// Above `max_marks` (no display list), each element's mark colour for the
// fallback dots (VW-50): `#rrggbbaa` palette strings and, per element row, a
// 1-based palette index (0: unknown, sample the mark image's pixel instead).
// `shape` (VW-58), present when some point is not a circle: per element row
// 1 + vellum's marker code (0 circle, 1 square, 2 triangle, 3 diamond, 4 plus,
// 5 cross, 6 triangle down, 7 star), 0 for a row that is no point (a dot).
export interface MarkColors {
  pal: string[] | string;
  idx: DLColumn;
  shape?: DLColumn;
}

// The split render's mark layer (raster mode with vellum's `layer =` split): a
// transparent PNG of the keyed marks alone, at the scene's device-px size, placed
// inside each listed panel's pan group (or over the whole scene when `panels` is
// absent) under SVG furniture. See `.raster_marks()` on the R side.
// The flagged keyed marks (vellum's `layer = "keyed_flagged"`), one raster per
// run of the display list, in the scene px frame `width` x `height` (VW-30),
// and with a vellum/vellumwidget that ship them, each run as SVG (VW-33).
export interface FlaggedLayer {
  runs: string[] | string;
  svg?: string[] | string | null; // each run as SVG, for restyling (VW-33)
  width: number;
  height: number;
}

export interface MarksLayer {
  href: string;
  width: number;
  height: number;
  panels?: string[] | string;
}

// Click-to-source payload (from vellumplot::inspect_source()): the source data
// rows behind each drawn grob, keyed by its `data-vellum-id` (the id the SVG
// already carries). `values` is present only when inspect_source(values=TRUE).
// Rows index the element's own source table: the plot data (top-level
// fields/values) unless `sourceOf` names another table -- a layer drawn from its
// own `data =` -- whose fields/values are in `sources`. An older payload has
// neither, and every element reads the plot data.
export interface Provenance {
  on: string; // "click" | "hover"
  byId: Record<string, number[]>; // data-vellum-id -> 1-based source row indices
  fields: string[]; // plot-data column names
  values?: Record<string, unknown>[]; // plot-data rows (optional; heavier)
  sourceOf?: Record<string, string>; // data-vellum-id -> source name; absent = "plot"
  sources?: Record<string, ProvenanceSource>; // non-plot source tables, by name
}

export interface ProvenanceSource {
  fields: string[] | string; // a one-column table may arrive auto-unboxed
  values?: Record<string, unknown>[];
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Where an axis's re-ticked labels go for one panel: the label line (baseline y
// for an x axis, anchor x for a y axis) and the text alignment, scraped from the
// static axis group vellum drew for that panel. `gap` > 0 when vellum wrapped the
// static labels onto two lines (a long datetime label): the line spacing to reuse.
export interface AxisAnchor {
  pos: number; anchor: string; baseline: string; gap: number; rot?: number;
  // A y axis: the widest static tick label (device px), the room its title was
  // laid out around, and the title beside it, moved out when re-ticked labels
  // grow wider (VW-51).
  w0?: number;
  title?: AxisTitle | null;
}
// A static y-axis title the re-ticker may move sideways: its text node and
// original transform, the most it can move (to the canvas edge), the direction
// it moves (-1 left, +1 right) and the shift now applied.
export interface AxisTitle {
  node: Element;
  orig: string | null;
  room: number;
  dir: number;
  need: number;
  shift: number;
}
// A secondary axis (sec_axis()/dup_axis()), read back from its static labels:
// matched (primary native, secondary value) pairs, ascending in native, and the
// label decoration to reuse (a shared prefix/suffix, thousands commas). The
// re-ticker interpolates between the pairs (exact for a linear transform, which
// is the common unit-conversion case) and extrapolates along the end segments.
export interface SecAxisMap {
  n: number[];
  v: number[];
  linear: boolean;
  prefix: string;
  suffix: string;
  comma: boolean;
}
// One axis-zoomable panel: its scale descriptor, the pannable group T_i moves, the
// clipped outer group (host for its re-ticked gridlines), A (reference rect ->
// this rect), and its label anchors (null for an interior facet with no axis).
export interface AzPanel {
  p: PanelInfo;
  pan: SVGGElement;
  // The same panel's pan group in the above-marks layer (VW-21), moved by T too.
  mirror: SVGGElement | null;
  outer: SVGGElement;
  grid: SVGGElement | null;
  ax: number; bx: number; ay: number; by: number;
  xLab: AxisAnchor | null;
  yLab: AxisAnchor | null;
  // Secondary axes (top x / right y), when the static scene drew one with
  // numeric labels: where their labels go and the primary -> secondary map.
  x2Lab: AxisAnchor | null;
  y2Lab: AxisAnchor | null;
  x2Map: SecAxisMap | null;
  y2Map: SecAxisMap | null;
  // The static (in-panel) tick marks this panel drew, hidden under axis zoom and
  // re-drawn at the re-ticked breaks with the same stroke, length and edge.
  xTick: TickStyle | null;
  yTick: TickStyle | null;
}

// A panel's static tick marks: their stroke, length (device px) and the panel
// edge they grow inward from.
export interface TickStyle {
  stroke: string;
  width: number;
  len: number;
  edge: "top" | "bottom" | "left" | "right";
}
