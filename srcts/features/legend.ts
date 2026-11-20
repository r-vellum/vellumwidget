// Legend click-to-hide / -isolate.

import type { WidgetFns, WidgetState } from "../state";

export function legendFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "legendPolicy" | "swatchSeries" | "applyLegend" | "legendToggle" | "legendIsolate"
> {
  // --- legend click-to-hide / -isolate ---
  function legendPolicy(): "select" | "hide" | "mute" {
    return ws.opts.legendClick || "select";
  }

  // The series a legend swatch `k` drives, or null if `k` is not a swatch.
  function swatchSeries(k: string | null): string | null {
    if (k == null) return null;
    const m = ws.meta[k];
    return m && m.legend_for != null ? m.legend_for : null;
  }

  // Reflect `legendOff` in the DOM: hide (or mute) each toggled-off series' marks
  // and dim its swatch. Rebuilds `hiddenKeySet` (the marks the hover path skips so
  // a hidden point isn't silently hovered). A no-op under the "select" policy.
  function applyLegend(): void {
    ws.calib = null; // the set of measurable (non-inert) marks changed
    ws.fx.clearClass("vellumwidget-legend-hidden");
    ws.fx.clearClass("vellumwidget-legend-muted");
    ws.fx.clearClass("vellumwidget-legend-off");
    ws.hiddenKeySet = {};
    const pol = legendPolicy();
    if (pol === "select") { if (ws.rasterMode) ws.fx.updateMarkStates(); return; }
    const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
    for (const s in ws.legendOff) {
      if (!ws.legendOff[s]) continue;
      const members = ws.legendIndex[s] || [];
      ws.fx.addClassForKeys(members, cls);
      if (pol === "hide") for (let i = 0; i < members.length; i++) ws.hiddenKeySet[members[i]] = true;
      ws.fx.addClassForKeys(ws.legendSwatch[s] || [], "vellumwidget-legend-off");
    }
    if (ws.rasterMode) ws.fx.updateMarkStates(); // hide / mute on the canvas tiers
  }

  // Single click: toggle one series on/off.
  function legendToggle(series: string): void {
    ws.legendOff[series] = !ws.legendOff[series];
    applyLegend();
  }

  // Double click: isolate this series (turn every other off); if it is already
  // the only one on, restore all — the plotly/echarts legend convention.
  function legendIsolate(series: string): void {
    const all = Object.keys(ws.legendIndex);
    const others = all.filter((s) => s !== series);
    const isolated = !ws.legendOff[series] && others.every((s) => ws.legendOff[s]);
    ws.legendOff = {};
    if (!isolated) for (let i = 0; i < others.length; i++) ws.legendOff[others[i]] = true;
    applyLegend();
  }

  return { legendPolicy, swatchSeries, applyLegend, legendToggle, legendIsolate };
}
