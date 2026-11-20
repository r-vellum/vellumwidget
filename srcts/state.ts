// The widget's shared mutable state: everything the factory closure used to
// hold in local variables, now one object the feature modules take.

import type { BoundDomain } from "./binds";
import type Flatbush from "flatbush";
import type { Geom, GeometryPayload } from "./geometry";
import type { CrosstalkHandle, ViewFraction } from "./linking";
import type { IntervalRange } from "./scales";
import type { Pt } from "./spatial";
import type { AzPanel, Bbox, ColorbarInfo, ElemMeta, InteractionSpec, Options, PanelInfo, Payload, Provenance, ViewBox } from "./types";
import type { PanTransform } from "./viewbox";

export interface WidgetState {
  // The widget's root element (the htmlwidgets container).
  el: HTMLElement;
  // Cross-module function table: every feature function another module (or
  // the factory) calls, installed once per widget by the feature factories.
  fx: WidgetFns;
  tip: HTMLDivElement;
  brushBox: HTMLDivElement;
  holder: HTMLElement | null;
  stage: HTMLElement | null; // shrink-wraps the base svg; overlays fill it
  svgEl: SVGSVGElement | null;
  toolbarEl: HTMLElement | null;
  // Overview navigator (opt-in): a strip below the plot with a draggable window
  // marking the visible x-range. Built once per render when opts.navigator.
  navEl: HTMLElement | null;
  navWindow: HTMLElement | null;
  // Continuous colorbar filter: the descriptor + its overlay layer, the current
  // selected value range (null = full), and the set of marks currently filtered
  // out (dimmed + inert), so hit-testing skips them like any other filter.
  colorbar: ColorbarInfo | null;
  colorbarLayer: SVGSVGElement | null;
  // Declarative interactivity (spec-driven): the interaction block + derived
  // indexes. `condTagElems` maps a "<sel>:<aes>" tag to the keys carrying it;
  // `lastHoverKeys` is the current hover set (a hover-triggered selection reads
  // it). Reset per render; empty when the plot declares no interaction.
  interactions: InteractionSpec | null;
  // Click-to-source (from inspect_source()): rows per grob id, read on click.
  provenance: Provenance | null;
  condTagElems: Record<string, string[]>;
  filtSelElems: Record<string, string[]>; // filter selection -> keys of its target view
  joinOf: Record<string, string>; // key -> cross-view join id (compositions)
  lastHoverKeys: string[];
  // What the last full pointer-hover pass drew: the hover mode, the primary key
  // and the highlighted set, joined. A move that resolves to the same signature
  // only re-places the tooltip (VW-4). Emptied whenever anything else could have
  // changed the drawn hover (a clear, a render, a view change, a keyboard hover).
  hoverSig: string;
  // True while any hover feedback may be on screen; clearHover is a no-op when
  // false, so moving through empty space doesn't re-clear an idle plot.
  hovering: boolean;
  // Hover calibration cache (VW-3): one client->scene fit per data panel, in
  // svg-local px, valid for the svg box size it was measured at. Dropped on a
  // render, a view change, a resize, or a legend/filter change.
  calib: CalibCache | null;
  colorRange: { a: number; b: number } | null;
  colorHiddenSet: Record<string, boolean>;
  meta: Record<string, ElemMeta>;
  groups: Record<string, string[]>;
  // Graph adjacency, reconstructed once per render from edge source/target meta
  // (empty for a non-graph scene): node -> its incident edge keys, node -> its
  // neighbour node keys, edge -> its two endpoint node keys. Drives neighbour
  // highlighting (linkedKeys) without any per-node link list in the payload.
  incidentEdges: Record<string, string[]>;
  neighbourNodes: Record<string, string[]>;
  edgeEndpoints: Record<string, [string, string]>;
  // The select_neighbours() projection, if declared (else null): a node/edge
  // gesture expands to its graph neighbourhood.
  neighbourExpand: { degree: number; edges: boolean } | null;
  legendIndex: Record<string, string[]>; // series key -> member element keys
  legendSwatch: Record<string, string[]>; // series key -> its legend swatch element keys
  legendOff: Record<string, boolean>; // series toggled off via a legend-click (hide/mute)
  hiddenKeySet: Record<string, boolean>; // member keys currently hidden (legendClick="hide")
  filteredKeySet: Record<string, boolean>; // keys hidden by a cross-filter (crosstalk / vw_filter)
  elements: ElemMeta[];
  panels: PanelInfo[]; // cartesian data panels with scale descriptors (data-space mapping)
  selected: Record<string, boolean>;
  nodesByKey: Record<string, Element[]>; // key -> SVG nodes (built once per render)
  hoverRAF: number; // rAF handle throttling the nearest-mark scan
  // Spatial index over element bboxes (built once per render), so nearest-mark
  // hover and brush hit-testing are O(log n)/O(k) instead of O(n) linear scans —
  // the per-frame cost that made hover laggy on a large plot. Falls back to the
  // pure scans when absent (0 bboxed elements).
  spatialIndex: Flatbush | null;
  indexToElem: number[]; // flatbush item id -> index into `elements`
  // True geometry per key (WI-3), when the payload carries it. The R-tree over
  // boxes still does the shortlisting -- a bbox distance is never greater than
  // the true distance, so nothing within range is missed -- and these rank the
  // shortlist exactly. Empty when the payload has no `geometry` block (an older
  // payload, or a scene above the vertex limit), in which case picking stays
  // bbox-only exactly as before.
  geomByKey: Record<string, Geom[]>;
  gx: Float64Array;
  gy: Float64Array;
  haveGeometry: boolean;
  largeDim: boolean; // this render uses the overlay dim path
  dimLayer: SVGSVGElement | null; // overlay carrying the crisp hovered clones
  // Unified-hover axis index (built once per render): element centres sorted by
  // x and by y, so the shared readout can seed off the nearest position on one
  // axis, plus the per-axis column tolerance (see columnTolerance).
  crosshairLayer: SVGSVGElement | null; // overlay carrying the guide rule(s)
  sortedCx: number[];
  sortedCxKeys: string[];
  sortedCy: number[];
  sortedCyKeys: string[];
  tolX: number;
  tolY: number;
  // Raster mode: the marks are a single base <image>, so there are no per-element
  // DOM nodes. Hover/click/brush resolve against the spatial index and draw
  // feedback rings into two overlay groups instead of toggling classes on marks.
  rasterMode: boolean;
  selGroup: SVGGElement | null; // persistent selection rings
  hovGroup: SVGGElement | null; // transient hover ring(s)
  // Crisp-zoom canvas (Phase 6): when the view is zoomed in, the base image would
  // upscale and blur, so the points are redrawn crisp on this canvas from data
  // sampled off the base raster (centre + radius from the index bbox, colour from
  // the rendered pixel). Falls back to image-only when no 2D context is available.
  canvasEl: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  ptCx: Float64Array | null; // sampled point centres (viewBox space)
  ptCy: Float64Array | null;
  ptRad: Float64Array | null; // sampled point radii (viewBox units)
  ptRGB: Uint8Array | null; // packed [r,g,b, r,g,b, …] per sampled point
  ptN: number; // number of sampled (drawable) points
  opts: Options;
  // --- accessibility state ---
  liveRegion: HTMLElement | null; // aria-live announcer
  tableEl: HTMLElement | null; // hidden data-table fallback
  focusables: { key: string; node: Element }[]; // roving-tabindex marks, in draw order
  focusIdx: number; // index into focusables of the currently-focused mark, or -1
  vb0: ViewBox | null; // original viewBox (for reset)
  vb: ViewBox | null; // current viewBox
  // Axis-aware zoom (opt-in). When active, applyViewBox scales `panGroup` by T
  // instead of moving the base viewBox, and hit-testing routes through panToView.
  azPanels: AzPanel[]; // the zoomable panels (the first is the reference frame of `vb`)
  panGroup: SVGGElement | null; // the first panel's pannable group (transformed by T)
  axisZoomActive: boolean; // opt-in on + every cartesian panel pannable with re-tickable axes
  retickLayer: SVGSVGElement | null; // overlay carrying re-ticked axis labels (fixed at vb0)
  anchorPanel: AzPanel | null; // the panel a press started in (pins the gesture's frame)
  // Range-navigator x-only zoom: with the navigator on, zoom/pan is 1-D along x
  // (the selected x-range fills the width; the full y-range stays on screen), the
  // way a time-series range selector behaves. Implemented as a non-uniform
  // (`preserveAspectRatio="none"`) view with y pinned to the full extent.
  xZoom: boolean;
  axisStyle: { textFill: string; fontFamily: string; fontSize: number; gridStroke: string; gridWidth: number };
  mode: "brush" | "pan" | "lasso";
  lastBrush: Bbox | null; // last brushed region (user coords)
  // Active interval selections (select_interval()), by name: the member keys and
  // the brushed data range (null when it fell back to pixel hit-testing).
  intervals: Record<string, { keys: string[]; range: IntervalRange | null }>;
  // Scale binds (bind_scale()): each bound panel's visible native domain, keyed
  // by panel name, and the selection driving it. `bindGuard` blocks re-entry
  // while a bind redraws the view.
  scaleBinds: Record<string, BoundDomain>;
  scaleBoundBy: Record<string, string>;
  bindGuard: boolean;
  // Per-cell zoom (VW-18): with binds in a composition each cell keeps its own
  // view. `vb` is the active cell's; the others park theirs here by cell id.
  cellViews: Record<string, ViewBox>;
  activeCell: string | null;
  intervalEl: SVGRectElement | null; // the persistent brush band (in crosshairLayer)
  intervalBand: Bbox | null; // that band in scene (device-px) coords
  lassoPts: Pt[]; // in-progress lasso path (user/viewBox coords)
  lassoEl: SVGPolygonElement | null; // the drawn lasso outline (in crosshairLayer)
  // Linking state.
  selfToken: {}; // identity on the own bus
  group: string | null; // own-bus group
  receivingView: boolean; // applying a peer's linked view (suppresses re-broadcast)
  joinedGroup: string | null; // the own-bus group currently joined (re-joined when a render changes it)
  ctGroup: string | null; // the crosstalk group the handles below belong to
  unwatchRemoval: (() => void) | null; // stops the page-removal watcher for el
  ctSel: CrosstalkHandle | null; // crosstalk selection handle
  ctFilt: CrosstalkHandle | null; // crosstalk filter handle
  // --- tooltip: placement, delay, sticky (#14) ---
  tipShowTimer: number; // pending delayed reveal
  tipHideTimer: number; // pending sticky hide grace
  // --- pointer interaction (hover + drag: brush or pan; touch pinch-zoom) ---
  // Pointer events unify mouse, touch, and pen, so one code path drives desktop
  // and mobile. Active pointers are tracked so two down at once = pinch-zoom.
  down: { cx: number; cy: number; ux: number; uy: number } | null;
  dragging: "" | "brush" | "pan" | "lasso";
  movedDuringDrag: boolean;
  pointers: Map<number, { cx: number; cy: number }>;
  pinchDist: number; // > 0 while a two-pointer pinch is in progress
  sourcePopover: HTMLElement | null;
}

// A per-axis linear map from svg-local px to scene (device-px) coordinates.
export interface CalibFit { sx: number; ox: number; sy: number; oy: number }

// One calibration group: a data panel (or the whole scene when the payload has
// no panels) and its fit, null when its marks could not be measured.
export interface CalibGroup {
  panel: PanelInfo | null;
  az: AzPanel | null;
  fit: CalibFit | null;
}

export interface CalibCache { w: number; h: number; groups: CalibGroup[] }

export interface WidgetFns {
  a11yLabel: (k: string) => string;
  addClassForKeys: (keys: string[], cls: string) => void;
  announce: (msg: string) => void;
  applyAspect: () => void;
  applyFilter: (showKeys: string[] | null) => void;
  applyIntervalBrush: (rect: Bbox) => { keys: string[]; band: Bbox; fields: Record<string, unknown> } | null;
  applyLegend: () => void;
  applyScaleBinds: () => void;
  boundT: (a: AzPanel, t: PanTransform) => PanTransform;
  viewFor: (a: AzPanel) => ViewBox | null;
  focusCell: (cell: string | null | undefined) => void;
  focusCellAt: (clientX: number, clientY: number) => void;
  anyCellZoomed: () => boolean;
  syncScaleSelections: () => void;
  applyLinkedView: (v: ViewFraction) => void;
  applyPanTransforms: () => void;
  applyViewBox: () => void;
  availableModes: () => ("brush" | "lasso" | "pan")[];
  azMulti: () => boolean;
  azNearest: (x: number, y: number) => AzPanel | null;
  azT: (a: AzPanel) => PanTransform;
  brushDataFields: (bb: Bbox) => Record<string, number | string>;
  brushKeysIn: (rect: Bbox) => string[];
  buildColorbar: () => void;
  buildGeometry: (g: GeometryPayload | undefined) => void;
  buildHoverAxis: () => void;
  buildNavigator: () => void;
  buildSpatialIndex: () => void;
  buildToolbar: () => void;
  calibrateXform: (clientX: number, clientY: number) => CalibFit | null;
  sceneToClient: (x: number, y: number) => { x: number; y: number } | null;
  clearClass: (cls: string) => void;
  clearCrosshair: () => void;
  clearGroup: (g: SVGGElement | null) => void;
  clearHover: () => void;
  clearIntervals: () => boolean;
  clearLasso: () => void;
  clearPointData: () => void;
  clearSelection: () => void;
  clientToScene: (clientX: number, clientY: number) => { x: number; y: number };
  columnKeys: (primary: string, axis: "x" | "y") => string[];
  currentViewBox: () => ViewBox;
  dataRangeOf: (p: PanelInfo, dx0: number, dy0: number, dx1: number, dy1: number) => { x?: number[]; y?: number[]; panel: string } | null;
  distToElem: (x: number, y: number, e: ElemMeta) => number;
  drawCrosshair: (k: string, hm: "closest" | "x" | "y") => void;
  drawPoints: () => void;
  drawSelFeedback: () => void;
  dropInert: (keys: string[]) => string[];
  elementsForKey: (k: string) => Element[];
  emitSource: (target: EventTarget | null) => void;
  ensureCanvas: () => void;
  fmtPan: (t: PanTransform) => string;
  focusRoving: (i: number) => void;
  hideHighlightOverlay: () => void;
  hideTip: () => void;
  moveTip: (clientX: number, clientY: number, anchorKey: string | null) => void;
  inert: (k: string) => boolean;
  lassoKeysIn: (poly: Pt[]) => string[];
  legendIsolate: (series: string) => void;
  legendPolicy: () => "select" | "hide" | "mute";
  legendToggle: (series: string) => void;
  linkedKeys: (k: string) => string[];
  markFocused: () => boolean;
  navToView: (xFrac: number, wFrac: number) => void;
  nearestAxisKey: (axis: "x" | "y", coord: number) => string | null;
  nearestKeyAt: (x: number, y: number, maxDist: number) => string | null;
  onClick: (ev: MouseEvent) => void;
  onDblClick: (ev: MouseEvent) => void;
  onDown: (ev: PointerEvent) => void;
  onHoverMove: (ev: MouseEvent) => void;
  onKey: (ev: KeyboardEvent) => void;
  onWheel: (ev: WheelEvent) => void;
  panelAt: (x: number, y: number) => PanelInfo | null;
  placeIntervalBand: () => void;
  proxyCall: (method: string, args: unknown) => void;
  reevaluateInteractions: () => void;
  renderValue: (x: Payload) => void;
  reportView: () => void;
  resetZoom: () => void;
  resize: () => void;
  retick: () => void;
  sampleBaseRaster: () => void;
  selectedKeys: () => string[];
  setColorRange: (a: number, b: number) => void;
  setHover: (k: string) => void;
  setHoverKeys: (keys: string[]) => void;
  setMode: (m: "brush" | "pan" | "lasso") => void;
  setSelection: (keys: string[]) => void;
  setupA11y: () => void;
  setupAxisZoom: () => void;
  setupInteractions: () => void;
  setupLinking: () => void;
  teardownLinking: () => void;
  shinyInput: (event: string, value: unknown, opts?: { priority?: string }) => void;
  showHighlightOverlay: (keys: string[]) => void;
  showTip: (clientX: number, clientY: number, k: string) => void;
  showTipMulti: (clientX: number, clientY: number, keys: string[]) => void;
  swatchSeries: (k: string | null) => string | null;
  toAnchor: (clientX: number, clientY: number) => { x: number; y: number };
  toUser: (clientX: number, clientY: number) => { x: number; y: number };
  toView: (clientX: number, clientY: number) => { x: number; y: number };
  toggleSelect: (k: string) => void;
  updateNav: () => void;
  zoomTo: (rect: Bbox, pad?: number) => void;
}

export function createState(el: HTMLElement): WidgetState {
  return {
    el: el,
    fx: {} as WidgetFns,
    tip: document.createElement("div"),
    brushBox: document.createElement("div"),
    holder: null,
    stage: null,
    svgEl: null,
    toolbarEl: null,
    navEl: null,
    navWindow: null,
    colorbar: null,
    colorbarLayer: null,
    interactions: null,
    provenance: null,
    condTagElems: {},
    filtSelElems: {},
    joinOf: {},
    lastHoverKeys: [],
    hoverSig: "",
    hovering: false,
    calib: null,
    colorRange: null,
    colorHiddenSet: {},
    meta: {},
    groups: {},
    incidentEdges: {},
    neighbourNodes: {},
    edgeEndpoints: {},
    neighbourExpand: null,
    legendIndex: {},
    legendSwatch: {},
    legendOff: {},
    hiddenKeySet: {},
    filteredKeySet: {},
    elements: [],
    panels: [],
    selected: {},
    nodesByKey: {},
    hoverRAF: 0,
    spatialIndex: null,
    indexToElem: [],
    geomByKey: {},
    gx: new Float64Array(0),
    gy: new Float64Array(0),
    haveGeometry: false,
    largeDim: false,
    dimLayer: null,
    crosshairLayer: null,
    sortedCx: [],
    sortedCxKeys: [],
    sortedCy: [],
    sortedCyKeys: [],
    tolX: 1,
    tolY: 1,
    rasterMode: false,
    selGroup: null,
    hovGroup: null,
    canvasEl: null,
    ctx: null,
    ptCx: null,
    ptCy: null,
    ptRad: null,
    ptRGB: null,
    ptN: 0,
    opts: {
    tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true,
    toolbar: true, nearest: true, a11y: true, selectMode: "multiple",
    hoverMode: "closest", crosshair: false, navigator: false
  },
    liveRegion: null,
    tableEl: null,
    focusables: [],
    focusIdx: -1,
    vb0: null,
    vb: null,
    azPanels: [],
    panGroup: null,
    axisZoomActive: false,
    retickLayer: null,
    anchorPanel: null,
    xZoom: false,
    axisStyle: { // presentation scraped from vellum's own axis/grid nodes so the re-tick matches the theme
    textFill: "#333333", fontFamily: "sans-serif", fontSize: 12,
    gridStroke: "#ffffff", gridWidth: 1
  },
    mode: "brush",
    lastBrush: null,
    intervals: {},
    scaleBinds: {},
    scaleBoundBy: {},
    bindGuard: false,
    cellViews: {},
    activeCell: null,
    intervalEl: null,
    intervalBand: null,
    lassoPts: [],
    lassoEl: null,
    selfToken: {},
    group: null,
    receivingView: false,
    joinedGroup: null,
    ctGroup: null,
    unwatchRemoval: null,
    ctSel: null,
    ctFilt: null,
    tipShowTimer: 0,
    tipHideTimer: 0,
    down: null,
    dragging: "",
    movedDuringDrag: false,
    pointers: new Map<number, { cx: number; cy: number }>(),
    pinchDist: 0,
    sourcePopover: null,
  };
}
