// Accessibility: screen-reader labels, announcements, roving keyboard focus
// and the hidden data-table fallback.

import { keyOf } from "../dom";
import type { WidgetFns, WidgetState } from "../state";
import { stripTags } from "../tooltip";

export function a11yFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "a11yLabel" | "announce" | "focusRoving" | "markFocused" | "setupA11y"
> {
  // --- accessibility (screen reader + keyboard traversal) ---
  // A stable, plain-text label for a mark: its tooltip (tags stripped) or key.
  function a11yLabel(k: string): string {
    const m = ws.meta[k];
    return m && m.tooltip ? stripTags(m.tooltip) : k;
  }

  // The label plus current selection state, for a spoken announcement.
  function focusLabel(k: string): string {
    return a11yLabel(k) + (ws.selected[k] ? ", selected" : "");
  }

  // Speak `msg` through the polite live region (no-op if a11y is off). Skip a
  // repeat of the current text: focusRoving() announces and then moves DOM
  // focus, whose focus handler announces the same label again — the guard stops
  // some screen readers speaking it twice.
  function announce(msg: string): void {
    if (ws.liveRegion && ws.liveRegion.textContent !== msg) ws.liveRegion.textContent = msg;
  }

  // Reflect that mark `focusables[i]` is the focused one: roving index, focus
  // ring + highlight, and a spoken announcement. Pure state/DOM update — does
  // not itself move DOM focus (callers decide), so it is reliable regardless of
  // how focus arrived (Tab, arrow keys, or assistive tech).
  function showMarkFocus(i: number): void {
    ws.focusIdx = i;
    const k = ws.focusables[i].key;
    ws.fx.clearClass("vellumwidget-focus");
    ws.fx.addClassForKeys([k], "vellumwidget-focus");
    ws.fx.setHover(k);
    announce(focusLabel(k));
  }

  // A mark received DOM focus (Tab or assistive tech): adopt it as the cursor.
  function onMarkFocus(ev: FocusEvent): void {
    if (ws.focusHold) return; // a raise putting focus back (VW-57)
    const k = keyOf(ev.target);
    if (k == null) return;
    const i = ws.focusables.findIndex((f) => f.key === k);
    if (i >= 0) showMarkFocus(i);
  }

  // Focus left a mark: if it did not move to another mark, exit traversal mode.
  function onMarkBlur(ev: FocusEvent): void {
    if (ws.focusHold) return; // a raise moving the focused node (VW-57)
    const to = keyOf((ev as unknown as { relatedTarget: EventTarget | null }).relatedTarget);
    if (to == null) {
      ws.focusIdx = -1;
      ws.fx.clearClass("vellumwidget-focus");
    }
  }

  // Move the roving tabindex to focusable `i` (clamped), update state, and move
  // DOM focus to it.
  function focusRoving(i: number): void {
    if (!ws.focusables.length) return;
    const dir = i < ws.focusIdx ? -1 : 1;
    if (i < 0) i = 0;
    if (i >= ws.focusables.length) i = ws.focusables.length - 1;
    // Skip inert marks (cross-filtered or legend-hidden -> display:none): focusing
    // one is a no-op, so keep moving in the travel direction; if there is no
    // visible mark that way, stay put.
    while (ws.focusables[i] && ws.fx.inert(ws.focusables[i].key)) {
      i += dir;
      if (i < 0 || i >= ws.focusables.length) return;
    }
    if (ws.focusIdx >= 0 && ws.focusables[ws.focusIdx]) {
      ws.focusables[ws.focusIdx].node.setAttribute("tabindex", "-1");
    }
    const f = ws.focusables[i];
    f.node.setAttribute("tabindex", "0");
    showMarkFocus(i);
    const n = f.node as unknown as HTMLElement;
    if (typeof n.focus === "function") n.focus();
  }

  // In mark-traversal mode? (a mark is the current keyboard cursor). Driven by
  // focusIdx rather than document.activeElement so it is robust across browsers
  // and assistive tech.
  function markFocused(): boolean {
    return ws.opts.a11y && ws.focusIdx >= 0 && !!ws.focusables[ws.focusIdx];
  }

  // A visually-hidden data table listing every mark (key + description), so a
  // screen-reader user gets the underlying data even without traversing marks.
  function buildDataTable(): void {
    if (ws.tableEl) {
      ws.tableEl.remove();
      ws.tableEl = null;
    }
    if (!ws.opts.a11y || !ws.elements.length) return;
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
    for (let i = 0; i < ws.elements.length; i++) {
      const k = ws.elements[i].key;
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
    ws.el.appendChild(tbl);
    ws.tableEl = tbl;
  }

  // Make the rendered scene an accessible, keyboard-navigable chart: label the
  // svg, expose an aria-live announcer + a data-table fallback, and make each
  // mark a focusable graphics-symbol carrying a roving tabindex. All gated on
  // opts.a11y so the default output is unchanged when it is off.
  function setupA11y(): void {
    ws.focusables = [];
    ws.focusIdx = -1;
    if (!ws.opts.a11y || !ws.svgEl) {
      buildDataTable(); // (a no-op when a11y is off — also clears a stale table)
      return;
    }
    if (ws.fx.ringMode()) {
      ws.svgEl.removeAttribute("aria-roledescription");
      // No per-element DOM nodes to focus, and a data table of the (large) element
      // set would reintroduce the DOM blowup raster mode exists to avoid. Present
      // the chart as a labelled image; the scene's <title>/<desc> (or `alt`) name it.
      ws.svgEl.setAttribute("role", "img");
      if (ws.opts.alt) {
        ws.svgEl.removeAttribute("aria-labelledby");
        ws.svgEl.setAttribute("aria-label", ws.opts.alt);
      } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
        ws.svgEl.setAttribute("aria-label", "Chart");
      }
      return;
    }
    // The widget is an interactive chart, not a static image (role="img"
    // would hide the focusable marks from assistive tech).
    ws.svgEl.setAttribute("role", "graphics-document");
    ws.svgEl.setAttribute("aria-roledescription", "interactive chart");
    if (ws.opts.alt) {
      // Drop the name vellum referenced via aria-labelledby (its <title>/<desc>);
      // aria-labelledby outranks aria-label, so it would otherwise defeat `alt`.
      ws.svgEl.removeAttribute("aria-labelledby");
      ws.svgEl.setAttribute("aria-label", ws.opts.alt);
    } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
      // No name from vellum's <title>/<desc> and none given: label generically.
      ws.svgEl.setAttribute("aria-label", "Interactive chart");
    }

    if (!ws.liveRegion) {
      ws.liveRegion = document.createElement("div");
      ws.liveRegion.className = "vellumwidget-sr-only";
      ws.liveRegion.setAttribute("role", "status");
      ws.liveRegion.setAttribute("aria-live", "polite");
      ws.el.appendChild(ws.liveRegion);
    } else {
      ws.liveRegion.textContent = "";
    }

    const seen: Record<string, boolean> = {};
    // The raster detail tier focuses only its materialised (visible) marks.
    const keys = ws.rasterMode ? ws.detailKeys : ws.elements.map((e) => e.key);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (seen[k]) continue;
      const nodes = ws.nodesByKey[k];
      if (!nodes || !nodes.length) continue;
      seen[k] = true;
      const node = nodes[0];
      node.setAttribute("role", "graphics-symbol");
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-label", a11yLabel(k));
      node.addEventListener("focus", onMarkFocus as EventListener);
      node.addEventListener("blur", onMarkBlur as EventListener);
      ws.focusables.push({ key: k, node });
    }
    // The first mark carries tabindex=0 so a Tab press enters the mark set.
    if (ws.focusables.length) ws.focusables[0].node.setAttribute("tabindex", "0");

    // No data table of a raster plot's (large) element set, even in detail.
    if (ws.rasterMode) {
      if (ws.tableEl) { ws.tableEl.remove(); ws.tableEl = null; }
    } else buildDataTable();
  }

  return { a11yLabel, announce, focusRoving, markFocused, setupA11y };
}
