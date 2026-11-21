// Per-mark style state for the raster tiers that have no mark nodes (VW-22).
//
// In SVG mode (and the raster detail tier) a condition(), a filter_by(), a
// cross-filter or a legend click styles each mark's node by class. The
// overview PNG and the mid-tier canvas have no nodes, so the same state is
// kept here as typed arrays indexed by the display list's key ids, and the
// canvas draws each record with its key's override (`drawList` in raster.ts):
//
//   ws.msFlags[k]  bit 1 = dimmed by a condition (no if_false colour)
//                  bit 2 = hidden (filter_by(), cross-filter, legend "hide")
//                  bit 4 = legend-muted
//   ws.msColor[k]  0, or 1 + an index into ws.msPalette (a condition's if_false)
//
// Everything is keyed by integer: the key -> id map and each condition tag's
// id list are built once per display list, so a pass never looks a key up in
// the DOM (a per-key DOM lookup froze the page in sprint 15).

import type { WidgetFns, WidgetState } from "../state";

export const MS_DIM = 1;
export const MS_HIDDEN = 2;
export const MS_MUTED = 4;
// The CSS defaults: --vellumwidget-dim-opacity and the legend-muted opacity.
const DIM_DEFAULT = 0.28;
export const MUTED_ALPHA = 0.12;

export function markStateFeature(
  ws: WidgetState
): Pick<WidgetFns, "condStatesBegin" | "condStateSet" | "updateMarkStates" | "keyIds"> {
  // The display list these arrays were built for (a re-render replaces it).
  let forDl: unknown = null;
  let keyIdx: Map<string, number> = new Map();
  let tagIds: Record<string, Int32Array> = {};
  let paletteIdx: Record<string, number> = {};

  function sync(): boolean {
    const dl = ws.dl;
    if (!dl) {
      forDl = null;
      ws.msFlags = ws.msColor = ws.msCond = null;
      ws.msActive = false;
      return false;
    }
    if (forDl === dl) return true;
    forDl = dl;
    keyIdx = new Map();
    // First index of each key: the one the records use when the table is
    // the element table's keys (VR-22), which may repeat a key.
    for (let i = 0; i < dl.keys.length; i++) if (!keyIdx.has(dl.keys[i])) keyIdx.set(dl.keys[i], i);
    tagIds = {};
    paletteIdx = {};
    ws.msPalette = [];
    ws.msFlags = new Uint8Array(dl.keys.length);
    ws.msColor = new Uint16Array(dl.keys.length);
    ws.msCond = new Uint16Array(dl.keys.length);
    ws.msActive = false;
    return true;
  }

  // The display-list key ids of a list of keys (-1 for a key not in the list).
  function keyIds(keys: string[]): Int32Array {
    sync();
    const out = new Int32Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const v = keyIdx.get(keys[i]);
      out[i] = v == null ? -1 : v;
    }
    return out;
  }

  // Start a condition pass: clear the per-key condition state.
  function condStatesBegin(): boolean {
    if (!sync() || !ws.msCond) return false;
    ws.msCond.fill(0);
    return true;
  }

  // One condition's outcome for its tagged keys: members keep their colour,
  // non-members get `color` (or the dim when null). As in SVG mode, the last
  // condition that tags a key decides its style.
  function condStateSet(tag: string, tagged: string[], members: Record<string, boolean>, active: boolean, color: string | null | undefined): void {
    const cond = ws.msCond;
    if (!cond || !ws.dl) return;
    let ids = tagIds[tag];
    if (!ids) ids = tagIds[tag] = keyIds(tagged);
    let code = 1; // dim
    if (color != null) {
      let p = paletteIdx[color];
      if (p == null) { p = paletteIdx[color] = ws.msPalette.length; ws.msPalette.push(color); }
      code = p + 2;
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id < 0) continue;
      cond[id] = active && !members[tagged[i]] ? code : 0;
    }
  }

  // Fold the condition state, the hidden sets and the legend mute into the
  // flags the canvas reads, then redraw the canvas tiers. Raster mode only.
  function updateMarkStates(): void {
    if (!ws.rasterMode || !sync() || !ws.msFlags || !ws.msColor || !ws.msCond) return;
    const flags = ws.msFlags, color = ws.msColor, cond = ws.msCond;
    flags.fill(0);
    color.fill(0);
    let active = false;
    for (let k = 0; k < cond.length; k++) {
      const c = cond[k];
      if (!c) continue;
      active = true;
      if (c === 1) flags[k] = MS_DIM; else color[k] = c - 1;
    }
    const hide = function (set: Record<string, boolean>): void {
      for (const key in set) {
        if (!set[key]) continue;
        const id = keyIdx.get(key);
        if (id != null) { flags[id] |= MS_HIDDEN; active = true; }
      }
    };
    hide(ws.filteredKeySet);
    hide(ws.hiddenKeySet);
    if (ws.fx.legendPolicy() === "mute") {
      for (const s in ws.legendOff) {
        if (!ws.legendOff[s]) continue;
        const members = ws.legendIndex[s] || [];
        for (let i = 0; i < members.length; i++) {
          const id = keyIdx.get(members[i]);
          if (id != null) { flags[id] |= MS_MUTED; active = true; }
        }
      }
    }
    ws.msActive = active;
    ws.msDimAlpha = dimAlpha();
    // The flagged runs bake their marks' look in: re-render the ones this
    // state touches (VW-33), before the canvas redraws with them.
    ws.fx.restyleRuns();
    if (ws.fx.ringMode()) ws.fx.drawPoints(true);
  }

  // The theme's dim opacity (the CSS variable the SVG-mode dim class uses).
  function dimAlpha(): number {
    try {
      const v = parseFloat(getComputedStyle(ws.el).getPropertyValue("--vellumwidget-dim-opacity"));
      return isFinite(v) && v >= 0 && v <= 1 ? v : DIM_DEFAULT;
    } catch (e) {
      return DIM_DEFAULT;
    }
  }

  return { condStatesBegin, condStateSet, updateMarkStates, keyIds };
}
