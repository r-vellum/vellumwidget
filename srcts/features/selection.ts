// Selection: Shiny read-back, select / toggle / clear, linked selection and
// cross-filtering, and joining the linking bus / crosstalk.

import { busJoin, busPublish, getCrosstalk } from "../linking";
import type { WidgetFns, WidgetState } from "../state";

export function selectionFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "shinyInput" | "selectedKeys" | "toggleSelect" | "setSelection" | "clearSelection"
  | "applyFilter" | "inert" | "dropInert" | "setupLinking"
> {
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
    if (hw.shinyMode && sh && sh.setInputValue && ws.el.id) {
      sh.setInputValue(ws.el.id + "_" + event, value, opts);
    }
  }

  // --- selection (+ linking) ---
  function refreshSelected(): void {
    if (ws.rasterMode) {
      ws.fx.drawSelFeedback();
      return;
    }
    ws.fx.clearClass("vellumwidget-selected");
    for (const k in ws.selected) if (ws.selected[k]) ws.fx.addClassForKeys([k], "vellumwidget-selected");
    ws.fx.reevaluateInteractions(); // click/select-triggered conditions react
  }

  function selectedKeys(): string[] {
    return Object.keys(ws.selected).filter((k) => ws.selected[k]);
  }

  // Publish the current selection to linked views (own bus + crosstalk). Called
  // only from local mutations; the incoming appliers below never broadcast, so
  // there is no feedback loop.
  function broadcast(): void {
    const keys = selectedKeys();
    if (ws.group) busPublish(ws.group, ws.selfToken, keys);
    if (ws.ctSel) ws.ctSel.set(keys);
    shinyInput("selected", keys); // deduped state -> input$<id>_selected
  }

  function toggleSelect(k: string): void {
    const ks = ws.fx.linkedKeys(k);
    if (ws.opts.selectMode === "single") {
      const allOn = ks.every((x) => ws.selected[x]) && selectedKeys().length === ks.length;
      ws.selected = {};
      if (!allOn) ks.forEach((x) => (ws.selected[x] = true));
    } else {
      const turnOn = !ks.every((x) => ws.selected[x]);
      ks.forEach((x) => (ws.selected[x] = turnOn));
    }
    refreshSelected();
    broadcast();
  }

  function setSelection(keys: string[]): void {
    ws.selected = {};
    for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
    refreshSelected();
    broadcast();
  }

  function clearSelection(): void {
    ws.selected = {};
    const hadInterval = ws.fx.clearIntervals();
    refreshSelected();
    broadcast();
    // Clearing the brush clears the interval selection: tell Shiny too.
    if (hadInterval) shinyInput("brush", null, { priority: "event" });
  }

  // A selection arriving from a linked view — apply WITHOUT re-broadcasting to
  // the JS bus (feedback-loop guard), but still surface it to Shiny so the
  // server sees this widget's true current selection regardless of source.
  function applyLinkedSelection(keys: string[]): void {
    ws.selected = {};
    for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
    refreshSelected();
    shinyInput("selected", selectedKeys());
  }

  // Cross-filter (display tier): hide keyed elements whose key is not in the
  // shown set. `null` clears the filter (show everything).
  function applyFilter(showKeys: string[] | null): void {
    ws.fx.clearClass("vellumwidget-filtered");
    ws.filteredKeySet = {};
    if (showKeys == null) return;
    const show: Record<string, boolean> = {};
    for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
    for (let i = 0; i < ws.elements.length; i++) {
      const key = ws.elements[i].key;
      if (!show[key]) {
        ws.fx.addClassForKeys([key], "vellumwidget-filtered");
        ws.filteredKeySet[key] = true;
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
    return !!ws.hiddenKeySet[k] || !!ws.filteredKeySet[k] || !!ws.colorHiddenSet[k];
  }

  function dropInert(keys: string[]): string[] {
    return keys.filter((k) => !inert(k));
  }

  // Join the linking channels for this widget's groups (once).
  function setupLinking(): void {
    if (ws.joined) return;
    ws.joined = true;
    if (ws.group) busJoin(ws.group, { token: ws.selfToken, onSelect: applyLinkedSelection, onView: ws.fx.applyLinkedView });
    const ct = getCrosstalk();
    if (ws.opts.crosstalk && ct) {
      ws.ctSel = new ct.SelectionHandle(ws.opts.crosstalk);
      ws.ctFilt = new ct.FilterHandle(ws.opts.crosstalk);
      ws.ctSel.on("change", function (e) {
        if (e.sender !== ws.ctSel) applyLinkedSelection(e.value || []);
      });
      ws.ctFilt.on("change", function (e) {
        applyFilter(e.value);
      });
    }
  }

  return { shinyInput, selectedKeys, toggleSelect, setSelection, clearSelection, applyFilter, inert, dropInert, setupLinking };
}
