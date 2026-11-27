// Selection: Shiny read-back, select / toggle / clear, linked selection and
// cross-filtering, and joining the linking bus / crosstalk.

import { busJoin, busLeave, busPublish, getCrosstalk, watchRemoval } from "../linking";
import type { WidgetFns, WidgetState } from "../state";

export function selectionFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "refreshSelected" | "shinyInput" | "selectedKeys" | "toggleSelect" | "setSelection" | "clearSelection"
  | "applyFilter" | "inert" | "dropInert" | "setupLinking" | "teardownLinking"
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
    ws.selRev++;
    // Selected marks above the rest of their layer (VW-53): nodes move here;
    // the canvas tiers draw in the raised order (raiseOrder()) when the
    // mark state below redraws them.
    ws.fx.raiseSelected();
    if (ws.fx.ringMode()) {
      ws.fx.drawSelFeedback();
      // Conditions and filters go to the canvas's per-key mark state
      // (VW-22); scale binds work under the split render's axis zoom (VW-14).
      ws.fx.reevaluateInteractions();
      return;
    }
    ws.fx.clearClass("vellumwidget-selected");
    for (const k in ws.selected) if (ws.selected[k]) ws.fx.addClassForKeys([k], "vellumwidget-selected");
    ws.fx.reevaluateInteractions(); // click/select-triggered conditions react
  }

  function selectedKeys(): string[] {
    return Object.keys(ws.selected).filter((k) => ws.selected[k]);
  }

  // A legend swatch (`legend_for`, keys "legend:<aes>:<value>") is not data:
  // clicking it selects its series and styles the swatch, but its own key
  // never leaves the widget (VW-73).
  function isSwatch(k: string): boolean {
    const m = ws.meta[k];
    return (m != null && m.legend_for != null) || k.lastIndexOf("legend:", 0) === 0;
  }

  // The data keys a selection stands for when it leaves the widget: the
  // selected keys without legend swatches (VW-73), each multi-row mark (a line
  // series) widened to every row it draws (X-15), so a linked table or scatter
  // sees the whole series, not only its first row.
  function dataKeys(keys: string[]): string[] {
    const out: string[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (isSwatch(k)) continue;
      if (!seen[k]) { seen[k] = true; out.push(k); }
      const m = ws.meta[k];
      const rk = m && m.row_keys;
      if (!rk) continue;
      for (let r = 0; r < rk.length; r++) if (!seen[rk[r]]) { seen[rk[r]] = true; out.push(rk[r]); }
    }
    return out;
  }

  // Incoming data keys (a linked view, crosstalk, vw_select()) as this
  // widget's marks: each key, plus every multi-row mark that draws that row
  // (X-15), so selecting row r3 elsewhere selects the line through it.
  function markKeys(keys: string[]): string[] {
    let any = false;
    for (const _ in ws.rowOwners) { any = true; break; }
    if (!any) return keys;
    const out = keys.slice();
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < keys.length; i++) seen[keys[i]] = true;
    for (let i = 0; i < keys.length; i++) {
      const own = ws.rowOwners[keys[i]];
      if (!own) continue;
      for (let j = 0; j < own.length; j++) if (!seen[own[j]]) { seen[own[j]] = true; out.push(own[j]); }
    }
    return out;
  }

  // Publish the current selection to linked views (own bus + crosstalk). Called
  // only from local mutations; the incoming appliers below never broadcast, so
  // there is no feedback loop. Shiny gets the selected marks' own keys, without
  // legend swatches (VW-73); linked views get their rows (`dataKeys()`).
  function broadcast(): void {
    const own = selectedKeys().filter((k) => !isSwatch(k));
    const keys = dataKeys(own);
    if (ws.group) busPublish(ws.group, ws.selfToken, keys);
    if (ws.ctSel) ws.ctSel.set(keys);
    shinyInput("selected", own); // deduped state -> input$<id>_selected
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
    keys = markKeys(keys);
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
    keys = markKeys(keys);
    ws.selected = {};
    for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
    refreshSelected();
    shinyInput("selected", selectedKeys());
  }

  // Cross-filter (display tier): hide keyed elements whose key is not in the
  // shown set. `null` clears the filter (show everything). Legend swatches
  // (`legend_for`) are not data: their keys are never in a crosstalk or
  // vw_filter() set, so they stay put (VW-67). Legend hide/mute keeps working
  // on them through its own sets. A swatch whose whole series is filtered out
  // is dimmed and inert (`emptySwatchSet`): hovering or clicking it is a no-op.
  // A multi-row mark (a line series, keyed by its first row) stays while any
  // row it draws is shown (X-15). `byKey` (filter_by(), whose show set lists
  // element keys, not rows) turns that off.
  //
  // Raster mode without a display list (above `max_marks`, or an older vellum)
  // can't take marks off its image, so a filter there changes nothing: the
  // marks stay visible and pickable, as filter_by() leaves them (VW-71),
  // rather than drawn but dead to the pointer.
  function applyFilter(showKeys: string[] | null, byKey?: boolean): void {
    ws.calib = null; // the set of measurable (non-inert) marks changed
    ws.fx.clearClass("vellumwidget-filtered");
    ws.fx.clearClass("vellumwidget-legend-empty");
    ws.filteredKeySet = {};
    ws.emptySwatchSet = {};
    if (showKeys != null && !(ws.rasterMode && !ws.dl)) {
      const show: Record<string, boolean> = {};
      for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
      const anyShown = function (rk: string[]): boolean {
        for (let r = 0; r < rk.length; r++) if (show[rk[r]]) return true;
        return false;
      };
      // Hiding goes by key, and a line shares its first row's key with a
      // point layer keyed by the same `data_id`: a key stays while any of
      // its elements is shown, so a kept series never vanishes with that row.
      const kept: Record<string, boolean> = {};
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (show[e.key] || (!byKey && e.row_keys && anyShown(e.row_keys))) kept[e.key] = true;
      }
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (e.legend_for != null) continue;
        const key = e.key;
        if (!kept[key] && !ws.filteredKeySet[key]) {
          ws.fx.addClassForKeys([key], "vellumwidget-filtered");
          ws.filteredKeySet[key] = true;
        }
      }
      for (const s in ws.legendSwatch) {
        const members = ws.legendIndex[s] || [];
        if (!members.length || !members.every((k) => ws.filteredKeySet[k])) continue;
        const sw = ws.legendSwatch[s];
        for (let i = 0; i < sw.length; i++) ws.emptySwatchSet[sw[i]] = true;
        ws.fx.addClassForKeys(sw, "vellumwidget-legend-empty");
      }
    }
    if (ws.rasterMode) ws.fx.updateMarkStates(); // the node-less tiers hide them on the canvas
  }

  // A mark is "inert" when it is hidden by a legend-click (`hide`) or by a
  // cross-filter: display:none, so it can't be a pointer target, but it is still
  // in the spatial index. Every geometry-driven hit test (nearest-hover, brush,
  // lasso, raster click-snap) and keyboard traversal must skip it — otherwise a
  // hidden datum can be hovered, tooltipped, or (re-)selected. Muted legend marks
  // stay visible and are NOT inert.
  function inert(k: string): boolean {
    return !!ws.hiddenKeySet[k] || !!ws.filteredKeySet[k] || !!ws.colorHiddenSet[k] || !!ws.emptySwatchSet[k];
  }

  function dropInert(keys: string[]): string[] {
    return keys.filter((k) => !inert(k));
  }

  // Join the linking channels for this widget's groups. Called on every render:
  // a render that changes `group` or `crosstalk` leaves the old channel before
  // joining the new one, so the widget never publishes to one group while still
  // listening on another (VW-5).
  function setupLinking(): void {
    const g = ws.group;
    if (ws.joinedGroup !== g) {
      if (ws.joinedGroup != null) busLeave(ws.joinedGroup, ws.selfToken);
      if (g != null) {
        busJoin(g, {
          token: ws.selfToken, onSelect: applyLinkedSelection, onView: ws.fx.applyLinkedView,
          el: ws.el, onGone: teardownLinking
        });
      }
      ws.joinedGroup = g;
    }
    const ct = getCrosstalk();
    const ctg = ws.opts.crosstalk && ct ? ws.opts.crosstalk : null;
    if (ws.ctGroup !== ctg) {
      closeCrosstalk();
      if (ctg && ct) {
        const sel = new ct.SelectionHandle(ctg);
        const filt = new ct.FilterHandle(ctg);
        ws.ctSel = sel;
        ws.ctFilt = filt;
        sel.on("change", function (e) {
          if (ws.ctSel !== sel) return; // a closed handle (crosstalk without close())
          if (!ws.el.isConnected) { teardownLinking(); return; }
          if (e.sender !== sel) applyLinkedSelection(e.value || []);
        });
        filt.on("change", function (e) {
          if (ws.ctFilt !== filt) return;
          if (!ws.el.isConnected) { teardownLinking(); return; }
          applyFilter(e.value);
        });
      }
      ws.ctGroup = ctg;
    }
    // Free the widget's channels once its element leaves the page.
    if ((ws.joinedGroup != null || ws.ctGroup != null) && !ws.unwatchRemoval) {
      ws.unwatchRemoval = watchRemoval(ws.el, teardownLinking);
    }
  }

  function closeCrosstalk(): void {
    if (ws.ctSel && ws.ctSel.close) ws.ctSel.close();
    if (ws.ctFilt && ws.ctFilt.close) ws.ctFilt.close();
    ws.ctSel = null;
    ws.ctFilt = null;
    ws.ctGroup = null;
  }

  // Leave every linking channel (the element was removed from the page). A later
  // render of the same element joins again.
  function teardownLinking(): void {
    if (ws.joinedGroup != null) busLeave(ws.joinedGroup, ws.selfToken);
    ws.joinedGroup = null;
    closeCrosstalk();
    if (ws.unwatchRemoval) { ws.unwatchRemoval(); ws.unwatchRemoval = null; }
  }

  return { refreshSelected, shinyInput, selectedKeys, toggleSelect, setSelection, clearSelection, applyFilter, inert, dropInert, setupLinking, teardownLinking };
}
