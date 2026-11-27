// Highlight plumbing: key -> SVG nodes, class toggles, and the graph / join
// neighbourhoods a hover or selection extends to.

import { cssEscape } from "../css";
import type { WidgetFns, WidgetState } from "../state";

export function highlightFeature(
  ws: WidgetState
): Pick<
  WidgetFns,
  "elementsForKey" | "addClassForKeys" | "clearClass" | "linkedKeys"
> {
  // --- highlight / tooltip (Phase 3) ---
  // Nodes are cached per render (built in renderValue), so a hover/select that
  // touches many keys is O(keys) map lookups instead of a `querySelectorAll`
  // per key — the main per-interaction cost at large N. The DOM is static after
  // render, so the cache stays valid.
  function elementsForKey(k: string): Element[] {
    const cached = ws.nodesByKey[k];
    if (cached) return cached;
    // Raster mode's svg has no keyed mark nodes beyond those already indexed
    // (legend swatches, detail-tier nodes): never scan it per key, which over
    // a big plot's 100k+ keys would freeze a condition pass for seconds.
    if (!ws.holder || ws.rasterMode) return [];
    return Array.prototype.slice.call(ws.holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
  }

  function addClassForKeys(keys: string[], cls: string): void {
    for (let i = 0; i < keys.length; i++) {
      const nodes = elementsForKey(keys[i]);
      for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
    }
  }

  function clearClass(cls: string): void {
    if (!ws.holder) return;
    const nodes = ws.holder.querySelectorAll("." + cls);
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
  }

  // The graph neighbourhood of node `k` out to `degree` hops: the node, its
  // neighbour nodes, and (when `edges`) its incident edges, collected by BFS over
  // the reconstructed adjacency. Used by select_neighbours().
  function graphNeighbourhood(k: string, degree: number, edges: boolean): string[] {
    const seen: Record<string, boolean> = { [k]: true };
    const out: string[] = [k];
    let frontier = [k];
    for (let d = 0; d < degree; d++) {
      const next: string[] = [];
      for (let i = 0; i < frontier.length; i++) {
        const u = frontier[i];
        if (edges) {
          const inc = ws.incidentEdges[u] || [];
          for (let j = 0; j < inc.length; j++) {
            if (!seen[inc[j]]) {
              seen[inc[j]] = true;
              out.push(inc[j]);
            }
          }
        }
        const nb = ws.neighbourNodes[u] || [];
        for (let j = 0; j < nb.length; j++) {
          if (!seen[nb[j]]) {
            seen[nb[j]] = true;
            out.push(nb[j]);
            next.push(nb[j]);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  // The keys a hover or click on `k` acts on: a legend swatch drives its whole
  // series (`legend_for` -> the marks whose `legend` contains it). Under a
  // select_neighbours() preset, a graph edge drives its two endpoint nodes and a
  // graph node drives its neighbourhood. Otherwise a mark projects by its
  // `hover_group`, else just itself. Inert keys (hidden by a filter or the
  // legend) are left out, so a partly filtered series only touches its visible
  // marks (VW-67); `k` itself always stays.
  function linkedKeys(k: string): string[] {
    const ks = projection(k);
    let inert = false;
    for (let i = 0; i < ks.length; i++) if (ks[i] !== k && ws.fx.inert(ks[i])) { inert = true; break; }
    return inert ? ks.filter((x) => x === k || !ws.fx.inert(x)) : ks;
  }

  function projection(k: string): string[] {
    const m = ws.meta[k];
    if (m && m.legend_for != null) return (ws.legendIndex[m.legend_for] || []).concat([k]);
    if (ws.neighbourExpand) {
      const ep = ws.edgeEndpoints[k];
      if (ep) return [k, ep[0], ep[1]]; // an edge -> its endpoints
      if (ws.incidentEdges[k] || ws.neighbourNodes[k]) {
        return graphNeighbourhood(k, ws.neighbourExpand.degree, ws.neighbourExpand.edges);
      }
    }
    const g = m && m.hover_group;
    return g && ws.groups[g] ? ws.groups[g] : [k];
  }

  return { elementsForKey, addClassForKeys, clearClass, linkedKeys };
}
