// Click-to-source: provenance read-back and the source-row popover.

import { sourceTable, vellumIdOf } from "../dom";
import type { WidgetFns, WidgetState } from "../state";

export function sourceFeature(ws: WidgetState): Pick<WidgetFns, "emitSource"> {
  // Resolve the clicked grob's source rows and announce them: a Shiny input
  // (`input$<id>_source`) and a bubbling `vellum:source` DOM event any host can
  // listen for, plus a lightweight popover when values are shipped.
  function emitSource(target: EventTarget | null): void {
    if (!ws.provenance) return;
    const pid = vellumIdOf(target);
    const raw = pid ? ws.provenance.byId[pid] : undefined;
    // Be robust to a single-element group serialising as a scalar rather than a
    // one-element array (htmlwidgets auto-unboxes length-1 vectors).
    const rows: number[] = Array.isArray(raw) ? raw : raw == null ? [] : [raw as number];
    if (!pid || !rows.length) {
      hideSourcePopover();
      return;
    }
    const tbl = sourceTable(ws.provenance, pid);
    ws.fx.shinyInput(
      "source",
      { id: pid, source: tbl.source, rows, fields: tbl.fields },
      { priority: "event" },
    );
    const values = tbl.values ? rows.map((r) => tbl.values![r - 1]).filter(Boolean) : null;
    ws.el.dispatchEvent(
      new window.CustomEvent("vellum:source", {
        detail: { id: pid, source: tbl.source, rows, fields: tbl.fields, values },
        bubbles: true,
      }),
    );
    if (values) showSourcePopover(target as Element, tbl.fields, values);
  }

  function hideSourcePopover(): void {
    if (ws.sourcePopover) {
      ws.sourcePopover.remove();
      ws.sourcePopover = null;
    }
  }

  // A minimal, self-styled popover listing the clicked element's rows. Kept
  // deliberately plain; a host can suppress it by handling `vellum:source` and
  // using inspect_source(values = FALSE).
  function showSourcePopover(
    node: Element,
    fields: string[],
    values: Record<string, unknown>[],
  ): void {
    hideSourcePopover();
    // Built node by node with textContent: field names and row values are
    // arbitrary data, so none of it may be parsed as HTML.
    const pop = document.createElement("div");
    pop.className = "vellumwidget-source";
    pop.setAttribute("role", "dialog");
    pop.style.cssText =
      "position:absolute;z-index:20;max-height:220px;overflow:auto;background:var(--vw-bg,#fff);" +
      "color:var(--vw-fg,#111);border:1px solid rgba(0,0,0,.2);border-radius:6px;padding:6px 8px;" +
      "font:11px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);max-width:320px;";
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const f of fields) {
      const th = document.createElement("th");
      th.textContent = String(f);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of values.slice(0, 12)) {
      const tr = document.createElement("tr");
      for (const f of fields) {
        const td = document.createElement("td");
        td.textContent = String(row[f] ?? "");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    pop.appendChild(table);
    if (values.length > 12) {
      const more = document.createElement("div");
      more.className = "vw-src-more";
      more.textContent = "+" + (values.length - 12) + " more";
      pop.appendChild(more);
    }
    // position near the clicked node, clamped to the container.
    const nb = (node as SVGGraphicsElement).getBoundingClientRect();
    const cb = ws.el.getBoundingClientRect();
    pop.style.left = Math.min(nb.left - cb.left + 8, Math.max(0, cb.width - 220)) + "px";
    pop.style.top = Math.max(0, nb.top - cb.top + 8) + "px";
    ws.el.appendChild(pop);
    ws.sourcePopover = pop;
  }

  return { emitSource };
}
