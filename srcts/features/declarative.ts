// Declarative interactivity (spec-driven): selection membership, conditional
// styling and filters.

import type { WidgetFns, WidgetState } from "../state";
import type { CondLook, SelDef } from "../types";
import { condLook, isAlphaAes, isColorAes } from "../types";

export function declarativeFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "setupInteractions" | "reevaluateInteractions"
> {
  // --- declarative interactivity (spec-driven; DECLARATIVE-INTERACTIVITY) ---
  // Build the per-render indexes from the interaction block: which keys carry
  // each condition tag ("<sel>:<aes>"). Called once per render.
  function setupInteractions(): void {
    ws.condTagElems = {};
    ws.condTagVals = {};
    ws.filtSelElems = {};
    ws.joinOf = {};
    if (!ws.interactions) return;
    // Per tag, the keys' own if_false colours (VW-46), kept only for a tag
    // where some key has one.
    const vals: Record<string, (string | null)[]> = {};
    const any: Record<string, boolean> = {};
    for (let i = 0; i < ws.elements.length; i++) {
      const e = ws.elements[i];
      if (e.cond) {
        for (let t = 0; t < e.cond.length; t++) {
          const tag = e.cond[t];
          (ws.condTagElems[tag] = ws.condTagElems[tag] || []).push(e.key);
          const v = e.cond_value ? e.cond_value[tag] : undefined;
          (vals[tag] = vals[tag] || []).push(v == null ? null : v);
          if (v != null) any[tag] = true;
        }
      }
      if (e.filt) {
        for (let t = 0; t < e.filt.length; t++) {
          (ws.filtSelElems[e.filt[t]] = ws.filtSelElems[e.filt[t]] || []).push(e.key);
        }
      }
      if (e.join != null) ws.joinOf[e.key] = e.join;
    }
    for (const tag in vals) ws.condTagVals[tag] = any[tag] ? vals[tag] : null;
  }

  // The member key set of a selection given the current gesture state. A
  // hover-triggered selection reads the current hover set; a click/point one
  // reads the persistent selection. (Interval selections are wired in a later
  // stage.)
  function selectionMembers(sel: SelDef): Record<string, boolean> {
    const set: Record<string, boolean> = {};
    // A brushed interval selection is its own member set (by data value), set by
    // the brush and emptied when the brush is cleared. A lasso interval keeps the
    // gesture's pixel selection.
    if (sel.kind === "interval" && sel.region !== "lasso") {
      const iv = ws.intervals[sel.name];
      const ks = iv ? iv.keys : [];
      for (let i = 0; i < ks.length; i++) set[ks[i]] = true;
      return set;
    }
    let keys = sel.on === "hover" ? ws.lastHoverKeys : ws.fx.selectedKeys();
    // A click-driven select_neighbours() expands the raw clicked nodes to their
    // neighbourhood so a condition/filter reacts to the whole set. Hover keys are
    // already the linkedKeys() projection, so they are left as-is.
    if (
      sel.on !== "hover" &&
      sel.expand &&
      sel.expand.mode === "neighbours" &&
      ws.neighbourExpand
    ) {
      const out: string[] = [];
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < keys.length; i++) {
        const proj = ws.fx.linkedKeys(keys[i]);
        for (let j = 0; j < proj.length; j++) {
          if (!seen[proj[j]]) {
            seen[proj[j]] = true;
            out.push(proj[j]);
          }
        }
      }
      keys = out;
    }
    for (let i = 0; i < keys.length; i++) set[keys[i]] = true;
    return set;
  }

  // Apply an active condition's `if_false` to a non-member node (the key's own
  // per-row colour when it has one, VW-46, else the constant): an explicit
  // colour recolours the paints the node actually uses: fill and stroke of a
  // point drawn as one element, or the fill of the fill element and the stroke
  // of its fill="none" stroke twin (older vellum) -- never the twin's fill:none.
  // The theme dim is the theme-dim class; an alpha condition's if_false is
  // that class at its own opacity (the class reads --vellumwidget-dim-opacity,
  // set on the node; the export reads it back the same way); an if_false the
  // widget can't apply (size, shape) leaves the node as drawn (VW-52).
  function styleCondNode(node: Element, look: CondLook): void {
    if (look.kind === "none") return;
    const n = node as unknown as { style: CSSStyleDeclaration };
    if (look.kind === "dim" || look.kind === "alpha") {
      node.classList.add("vellumwidget-cond-dim");
      if (look.kind === "alpha") n.style.setProperty("--vellumwidget-dim-opacity", String(look.alpha));
      return;
    }
    const color = look.color!;
    const f = node.getAttribute("fill");
    if (f && f !== "none") n.style.fill = color;
    const s = node.getAttribute("stroke");
    if (s && s !== "none") n.style.stroke = color;
  }

  // A key's own per-row alpha if_false (VW-56) as its look: that opacity, or
  // the condition's constant look when the value is not one.
  function ownAlpha(own: string, look: CondLook): CondLook {
    const lk = condLook("alpha", own);
    return lk.kind === "alpha" ? lk : look;
  }

  function clearCondNode(node: Element): void {
    node.classList.remove("vellumwidget-cond-dim");
    const n = node as unknown as { style: CSSStyleDeclaration };
    if (n.style.fill) n.style.fill = "";
    if (n.style.stroke) n.style.stroke = "";
    if (n.style.getPropertyValue("--vellumwidget-dim-opacity")) n.style.removeProperty("--vellumwidget-dim-opacity");
  }

  // Re-evaluate every conditional encoding against the current selection state:
  // members keep `if_true` (already drawn), non-members get `if_false`. With an
  // empty selection and `empty !== false`, the whole plot stays `if_true`
  // (spotlight semantics — matches the static render). In the node-less
  // raster tiers the outcome goes to the per-key mark state the canvas draws
  // from instead (VW-22, features/markState.ts).
  function applyConditions(): void {
    if (!ws.interactions || !ws.interactions.conditions) return;
    const ring = ws.fx.ringMode();
    // The per-key state is kept in every raster tier with a display list:
    // the node-less tiers draw from it, and the detail tier's flagged runs
    // (images, VW-33) are restyled from it.
    const ms = ws.rasterMode && ws.fx.condStatesBegin();
    if (ring && !ms) return; // no display list: the image stays as drawn
    const selByName: Record<string, SelDef> = {};
    (ws.interactions.selections || []).forEach((s) => (selByName[s.name] = s));
    for (let ci = 0; ci < ws.interactions.conditions.length; ci++) {
      const c = ws.interactions.conditions[ci];
      // The tag the condition's elements carry: vellumplot sends it (VP-72:
      // "<sel>:<aes>@<layer>" when two layers condition one aesthetic on one
      // selection, each with its own if_false); an older one doesn't, and its
      // tags are always "<sel>:<aes>".
      const tag = c.tag || c.selection + ":" + c.aes;
      const tagged = ws.condTagElems[tag] || [];
      // The constant if_false, routed by the aesthetic (VW-52), and each
      // key's own per-row if_false: a colour for a colour aesthetic (VW-46),
      // an opacity for alpha (VW-56); null for any other aesthetic.
      const look = condLook(c.aes, c.if_false);
      const colorAes = isColorAes(c.aes);
      const vals = colorAes || isAlphaAes(c.aes) ? ws.condTagVals[tag] || null : null;
      const sel = selByName[c.selection];
      const members = sel ? selectionMembers(sel) : {};
      const active = Object.keys(members).length > 0 || c.empty === false;
      if (ms) ws.fx.condStateSet(tag, tagged, members, active, look, vals, !colorAes);
      if (ring) continue;
      for (let i = 0; i < tagged.length; i++) {
        const nodes = ws.fx.elementsForKey(tagged[i]);
        const member = !!members[tagged[i]];
        const own = vals ? vals[i] : null;
        const lk: CondLook = own == null ? look : colorAes ? { kind: "color", color: own } : ownAlpha(own, look);
        for (let j = 0; j < nodes.length; j++) {
          clearCondNode(nodes[j]);
          if (active && !member) styleCondNode(nodes[j], lk);
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
    for (const k in members) js[ws.joinOf[k] != null ? ws.joinOf[k] : k] = true;
    return js;
  }

  // Returns whether it applied (or cleared) a filter. In raster mode the
  // hidden set reaches the canvas through applyFilter() -> updateMarkStates().
  function applyFilters(): boolean {
    const ix = ws.interactions;
    if (!ix || !ix.filters || !ix.filters.length) return false;
    // No display list (older vellum, or above max_marks): the image can't hide
    // them, so they stay visible and pickable, as before VW-22.
    if (ws.fx.ringMode() && !ws.dl) return false;
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
      const targets = ws.filtSelElems[selName] || [];
      for (let t = 0; t < targets.length; t++) {
        const k = targets[t];
        const j = ws.joinOf[k] != null ? ws.joinOf[k] : k;
        if (!keep[j]) hide[k] = true;
      }
    }
    if (!restrict) {
      ws.fx.applyFilter(null);
      return true;
    }
    // Translate the hide set into the show set applyFilter() expects (keys unique,
    // so hiding a target-cell key never touches the source cell).
    const show: string[] = [];
    for (let i = 0; i < ws.elements.length; i++) {
      if (!hide[ws.elements[i].key]) show.push(ws.elements[i].key);
    }
    ws.fx.applyFilter(show, true); // a show set of element keys: no row matching (X-15)
    return true;
  }

  // The single re-evaluation hook: called whenever a selection's member set can
  // change (hover move/clear, click/select/brush). Conditions + filters today;
  // scale binds add their reaction here in a later stage.
  function reevaluateInteractions(): void {
    applyConditions();
    // applyFilter() refreshes the raster mark state itself; without a filter
    // the condition state still has to reach the canvas.
    if (!applyFilters() && ws.rasterMode) ws.fx.updateMarkStates();
    ws.fx.applyScaleBinds(); // bind_scale(): bound panels follow their selection
  }

  return { setupInteractions, reevaluateInteractions };
}
