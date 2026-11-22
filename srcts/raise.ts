// Raising selected marks above the rest of their layer (VW-53): the pure
// paint-order part for the canvas tiers.
//
// The display list is in paint order, but it does not say which layer a
// record belongs to. A *segment* stands in for "the same layer": a maximal
// stretch of consecutive records with the same panel, opacity group and
// record kind (point / rect / path), none of them flagged or in a flagged run.
// Within a segment the members are drawn after the non-members, each side in
// its own paint order; segments keep their order. So a selected point rises
// above the points around it but not above a later line, rect or path layer,
// nor above text (text is flagged, drawn from its run image). Two adjacent
// layers of the same kind in one panel count as one segment, so there a
// member of the first rises above the second's non-members.

import type { DisplayList } from "./dlist";

function boundary(dl: DisplayList, a: number, b: number): boolean {
  return dl.panel[a] !== dl.panel[b] || dl.group[a] !== dl.group[b] || dl.kind[a] !== dl.kind[b] ||
    dl.flags[a] !== 0 || dl.flags[b] !== 0 || dl.run[a] > 0 || dl.run[b] > 0;
}

// The order to draw `dl`'s records in so that, within each segment, the
// records whose key id is set in `member` come last. Null when that is the
// list's own order (no member is followed by a non-member in its segment).
// One linear pass (plus one per segment that moves), no sort.
export function raisedOrder(dl: DisplayList, member: Uint8Array): Uint32Array | null {
  const n = dl.n;
  let out: Uint32Array | null = null;
  let s = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && !boundary(dl, i - 1, i)) continue;
    // segment [s, i): does a member come before a non-member?
    let seenMember = false, moves = false;
    for (let j = s; j < i; j++) {
      if (member[dl.key[j]]) seenMember = true;
      else if (seenMember) { moves = true; break; }
    }
    if (moves) {
      if (!out) {
        out = new Uint32Array(n);
        for (let j = 0; j < s; j++) out[j] = j;
      }
      let w = s;
      for (let j = s; j < i; j++) if (!member[dl.key[j]]) out[w++] = j;
      for (let j = s; j < i; j++) if (member[dl.key[j]]) out[w++] = j;
    } else if (out) {
      for (let j = s; j < i; j++) out[j] = j;
    }
    s = i;
  }
  return out;
}
