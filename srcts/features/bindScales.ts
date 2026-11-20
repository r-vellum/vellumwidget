// Scale binds (vellumplot::bind_scale() and select_interval(bind = "scales"),
// F-15): an interval selection drives the zoom of the panels bound to it
// (overview + detail), and a scales-bound selection is written by its own
// view's pan/zoom (linked zoom).

import { boundPan, channelToNative, sameBounds } from "../binds";
import type { BoundDomain } from "../binds";
import { asColumn } from "../elements";
import { axisForEncoding, intervalKeys, intervalRangeOf, selEncodings } from "../scales";
import type { IntervalChannel } from "../scales";
import type { WidgetFns, WidgetState } from "../state";
import type { AzPanel, PanelInfo, SelDef, ViewBox } from "../types";
import { isZoomedIn, panToView } from "../viewbox";
import type { PanTransform } from "../viewbox";

// Is `sel` bound to its view's scales (Vega-Lite `bind: "scales"`)?
export function isScalesBound(sel: SelDef): boolean {
  return sel.kind === "interval" && sel.bind === "scales";
}

export function bindScalesFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "applyScaleBinds" | "syncScaleSelections" | "boundT"
  | "viewFor" | "focusCell" | "focusCellAt" | "anyCellZoomed"
> {
  // --- per-cell zoom (VW-18) ---
  // One shared view zooms every panel together, which is right for facets and an
  // unbound composition but wrong once binds link the cells: a wheel on the
  // overview would also move the detail's unbound axis. So when a composition
  // carries a bind (or a scales-bound selection) each cell keeps its own view.
  // `ws.vb` stays the view every gesture edits; it belongs to the active cell, and
  // a gesture in another cell first parks it (ws.cellViews) and takes that cell's.
  function cellZoom(): boolean {
    const ix = ws.interactions;
    if (!ws.axisZoomActive || !ix) return false;
    const binds = ix.binds ? asColumn(ix.binds) : [];
    const sels = ix.selections ? asColumn(ix.selections).filter(isScalesBound) : [];
    if (!binds.length && !sels.length) return false;
    let first: string | null | undefined;
    for (let i = 0; i < ws.azPanels.length; i++) {
      const c = ws.azPanels[i].p.cell;
      if (c == null) return false;
      if (first === undefined) first = c;
      else if (c !== first) return true;
    }
    return false;
  }

  // The cell `ws.vb` belongs to: the last one a gesture touched, else the first.
  function activeCell(): string | null {
    if (ws.activeCell != null) return ws.activeCell;
    const c = ws.azPanels.length ? ws.azPanels[0].p.cell : null;
    return c == null ? null : c;
  }

  // The view panel `a` is drawn at: the shared `vb`, or its cell's own view.
  function viewFor(a: AzPanel): ViewBox | null {
    const c = a.p.cell;
    if (c == null || c === activeCell() || !cellZoom()) return ws.vb;
    return ws.cellViews[c] || ws.vb0;
  }

  function copyVb(v: ViewBox): ViewBox { return { x: v.x, y: v.y, w: v.w, h: v.h }; }

  // Hand `ws.vb` to `cell` (no redraw: what is on screen does not change).
  function focusCell(cell: string | null | undefined): void {
    if (cell == null || !cellZoom()) return;
    const cur = activeCell();
    if (cell === cur || !ws.vb0) return;
    if (cur != null && ws.vb) ws.cellViews[cur] = copyVb(ws.vb);
    const next = ws.cellViews[cell];
    ws.vb = next ? copyVb(next) : copyVb(ws.vb0);
    delete ws.cellViews[cell];
    ws.activeCell = cell;
  }

  function focusCellAt(clientX: number, clientY: number): void {
    if (!cellZoom()) return;
    const u = ws.fx.toUser(clientX, clientY);
    const a = ws.fx.azNearest(u.x, u.y);
    if (a) focusCell(a.p.cell);
  }

  function anyCellZoomed(): boolean {
    if (!ws.vb0) return false;
    for (const c in ws.cellViews) if (isZoomedIn(ws.cellViews[c], ws.vb0)) return true;
    return false;
  }

  // The view a (non-axis-zoom-indexed) panel is drawn at.
  function viewOfPanel(p: PanelInfo): ViewBox | null {
    const az = ws.azPanels.filter((q) => q.p.name === p.name)[0];
    return az ? viewFor(az) : ws.vb;
  }

  // The panels a bind (or a selection's source) addresses: those of its cell,
  // or every panel when it names none (a lone plot, or an older vellumplot).
  function inCells(p: PanelInfo, cells: string[] | null): boolean {
    if (!cells || !cells.length) return true;
    return p.cell != null && cells.indexOf(p.cell) >= 0;
  }

  function panelByName(name: string): PanelInfo | null {
    for (let i = 0; i < ws.panels.length; i++) if (ws.panels[i].name === name) return ws.panels[i];
    return null;
  }

  // A panel's pan transform under its bind: the shared transform `t` with the
  // bound axes replaced by the selection's range. `t` itself when unbound.
  function boundT(a: AzPanel, t: PanTransform): PanTransform {
    const b = ws.scaleBinds[a.p.name];
    return b ? boundPan(a.p, t, b) : t;
  }

  // Recompute every bound panel's domain from the current interval selections
  // and redraw when it changed. A bind follows its selection's range on `aes`
  // in each panel of the bind's cell, except the panel the range was drawn in
  // (a view never zooms itself to its own brush). An empty selection unbinds,
  // so the panel returns to the shared zoom. Needs axis-aware zoom (SVG).
  function applyScaleBinds(): void {
    const ix = ws.interactions;
    if (!ix || !ix.binds || !ws.panels.length || ws.bindGuard) return;
    const next: Record<string, BoundDomain> = {};
    const by: Record<string, string> = {};
    const binds = asColumn(ix.binds);
    for (let i = 0; i < binds.length; i++) {
      const bd = binds[i];
      const iv = ws.intervals[bd.selection];
      const r = iv && iv.range;
      const ch = r ? (r as unknown as Record<string, IntervalChannel | undefined>)[bd.aes] : undefined;
      if (!r || !ch) continue;
      const src = panelByName(r.panel);
      const srcAx = src ? axisForEncoding(src, bd.aes) : null;
      const cells = bd.cell != null ? [bd.cell] : null;
      for (let j = 0; j < ws.panels.length; j++) {
        const p = ws.panels[j];
        if (p.name === r.panel || !inCells(p, cells)) continue;
        const hit = axisForEncoding(p, bd.aes);
        if (!hit) continue;
        const dom = channelToNative(ch, srcAx ? srcAx.ax : undefined, hit.ax);
        if (!dom) continue;
        const b = next[p.name] || (next[p.name] = {});
        if (hit.horizontal) b.h = dom; else b.v = dom;
        by[p.name] = bd.selection;
      }
    }
    if (sameBounds(next, ws.scaleBinds)) return;
    ws.scaleBinds = next;
    ws.scaleBoundBy = by;
    if (!ws.axisZoomActive) return; // nothing to re-transform (raster / viewBox zoom)
    // Re-transform + re-tick + report (`input$<id>_zoom`). Guarded so the report
    // does not re-enter the selection sync it may trigger.
    ws.bindGuard = true;
    try { ws.fx.applyViewBox(); } finally { ws.bindGuard = false; }
  }

  // The visible scene rect of panel `p` (the part of its frame now on screen).
  function visibleRect(p: PanelInfo): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!ws.vb || !ws.vb0) return null;
    let a: { x: number; y: number }, b: { x: number; y: number };
    const az = ws.azPanels.filter((q) => q.p.name === p.name)[0];
    if (ws.axisZoomActive && az) {
      const t = ws.fx.azT(az);
      if (!t.sx || !t.sy) return null;
      a = { x: (p.px0 - t.tx) / t.sx, y: (p.py0 - t.ty) / t.sy };
      b = { x: (p.px1 - t.tx) / t.sx, y: (p.py1 - t.ty) / t.sy };
    } else {
      a = panToView(ws.vb, ws.vb0, p.px0, p.py0);
      b = panToView(ws.vb, ws.vb0, p.px1, p.py1);
    }
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }

  // Write each scales-bound selection from its view's current zoom: the visible
  // data range of the first panel of a cell that registers it (a panel that is
  // itself bound to that selection is skipped, so linked views cannot feed back).
  // At the full view the selection is empty. Then let conditions, filters and
  // binds react. Called whenever the view settles (reportView).
  function syncScaleSelections(): void {
    const ix = ws.interactions;
    if (!ix || !ix.selections || ws.bindGuard) return;
    const sels = asColumn(ix.selections).filter(isScalesBound);
    if (!sels.length) return;
    let changed = false;
    for (let i = 0; i < sels.length; i++) {
      const sel = sels[i];
      const cells = sel.cells != null ? asColumn<string>(sel.cells) : null;
      let src: PanelInfo | null = null;
      for (let j = 0; j < ws.panels.length && !src; j++) {
        const p = ws.panels[j];
        if (inCells(p, cells) && ws.scaleBoundBy[p.name] !== sel.name) src = p;
      }
      const prev = ws.intervals[sel.name];
      // Zoomed = the source's own (cell's) view is zoomed in (VW-18).
      const v = src ? viewOfPanel(src) : null;
      const zoomed = !!v && !!ws.vb0 && isZoomedIn(v, ws.vb0);
      const rect = zoomed && src ? visibleRect(src) : null;
      const r = rect && src ? intervalRangeOf(src, rect, selEncodings(sel)) : null;
      if (!r) {
        if (prev) { delete ws.intervals[sel.name]; changed = true; }
        continue;
      }
      const same = prev && prev.range && JSON.stringify(prev.range) === JSON.stringify(r);
      if (same) continue;
      ws.intervals[sel.name] = { keys: intervalKeys(ws.elements, r), range: r };
      changed = true;
    }
    if (changed) ws.fx.reevaluateInteractions();
  }

  return { applyScaleBinds, syncScaleSelections, boundT, viewFor, focusCell, focusCellAt, anyCellZoomed };
}
