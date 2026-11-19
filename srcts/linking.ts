// Cross-widget linking: the page-global vellumwidget bus and the optional
// crosstalk bridge.

// --- own cross-widget linking bus (vellumwidget <-> vellumwidget, no dependency) ---------
// Page-global (the bundle loads once, so all widgets share this scope). Members
// of the same group receive each other's selection sets by data-key. crosstalk
// (below) is the optional bridge to the wider htmlwidgets ecosystem; this bus is
// what links vellum widgets when crosstalk is not in play.
// A linked view broadcast: the pan/zoom expressed as a *fraction* of the sender's
// own original viewBox (`x`/`y` = offset of the view's top-left as a fraction of
// the full extent; `w`/`h` = the view's size as a fraction). Sharing the fraction
// (not raw device px) links widgets of different sizes correctly — each applies
// the same relative pan/zoom to its own viewBox.
export interface ViewFraction {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BusMember {
  token: object;
  onSelect: (keys: string[]) => void;
  onView?: (v: ViewFraction) => void; // linked pan/zoom (optional)
}
export const vellumwidgetBus: Record<string, BusMember[]> = {};
export function busJoin(group: string, m: BusMember): void {
  (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
}
export function busPublish(group: string, sender: object, keys: string[]): void {
  const members = vellumwidgetBus[group] || [];
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender) members[i].onSelect(keys);
  }
}
// Broadcast a view change to the group's other members (linked pan/zoom).
export function busPublishView(group: string, sender: object, v: ViewFraction): void {
  const members = vellumwidgetBus[group] || [];
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender && members[i].onView) members[i].onView!(v);
  }
}

// Minimal shape of the crosstalk globals we use (loaded as an htmlwidgets
// dependency when a SharedData is passed; absent otherwise).
export interface CrosstalkHandle {
  on: (type: string, cb: (e: { value: string[] | null; sender?: unknown }) => void) => void;
  set: (keys: string[] | null, extra?: unknown) => void;
}
export interface Crosstalk {
  SelectionHandle: new (group: string) => CrosstalkHandle;
  FilterHandle: new (group: string) => CrosstalkHandle;
}
export function getCrosstalk(): Crosstalk | null {
  return (window as unknown as { crosstalk?: Crosstalk }).crosstalk || null;
}
