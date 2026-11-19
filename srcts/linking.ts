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
  el?: Element; // the widget's element: a member whose element left the page is dropped
  onGone?: () => void; // called instead of a bare leave when that happens
}
export const vellumwidgetBus: Record<string, BusMember[]> = {};
export function busJoin(group: string, m: BusMember): void {
  (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
}
// Leave a group (a re-render moved the widget to another group, or it was
// removed from the page). Drops the group entry once empty.
export function busLeave(group: string, token: object): void {
  const members = vellumwidgetBus[group];
  if (!members) return;
  const rest = members.filter((m) => m.token !== token);
  if (rest.length) vellumwidgetBus[group] = rest;
  else delete vellumwidgetBus[group];
}
// The members to deliver to. A member whose element has left the page is
// dropped here too, as a backstop to the removal watcher below.
function liveMembers(group: string): BusMember[] {
  const members = vellumwidgetBus[group] || [];
  const live: BusMember[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (m.el && m.el.isConnected === false) { if (m.onGone) m.onGone(); else busLeave(group, m.token); continue; }
    live.push(m);
  }
  return live;
}
export function busPublish(group: string, sender: object, keys: string[]): void {
  const members = liveMembers(group);
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender) members[i].onSelect(keys);
  }
}
// Broadcast a view change to the group's other members (linked pan/zoom).
export function busPublishView(group: string, sender: object, v: ViewFraction): void {
  const members = liveMembers(group);
  for (let i = 0; i < members.length; i++) {
    if (members[i].token !== sender && members[i].onView) members[i].onView!(v);
  }
}

// --- removal watcher ---
// One page-wide MutationObserver frees widgets whose element has been removed
// (a Shiny re-render, renderUI, a closed tab). It fires after the mutating task,
// so a node that is moved (removed and re-inserted at once) is left alone, and an
// element only counts as removed once it has been seen on the page.
interface Watched { el: Element; seen: boolean; cb: () => void }
let watched: Watched[] = [];
let observer: MutationObserver | null = null;
function sweepRemoved(): void {
  const gone: Watched[] = [];
  watched = watched.filter((w) => {
    if (w.el.isConnected) { w.seen = true; return true; }
    if (!w.seen) return true;
    gone.push(w);
    return false;
  });
  if (!watched.length && observer) { observer.disconnect(); observer = null; }
  for (let i = 0; i < gone.length; i++) gone[i].cb();
}
export function watchRemoval(el: Element, cb: () => void): () => void {
  const w: Watched = { el: el, seen: el.isConnected, cb: cb };
  watched.push(w);
  const MO = typeof window !== "undefined" ? window.MutationObserver : undefined;
  if (!observer && MO && typeof document !== "undefined" && document.documentElement) {
    observer = new MO(sweepRemoved);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  return function () {
    watched = watched.filter((x) => x !== w);
    if (!watched.length && observer) { observer.disconnect(); observer = null; }
  };
}

// Minimal shape of the crosstalk globals we use (loaded as an htmlwidgets
// dependency when a SharedData is passed; absent otherwise).
export interface CrosstalkHandle {
  on: (type: string, cb: (e: { value: string[] | null; sender?: unknown }) => void) => void;
  set: (keys: string[] | null, extra?: unknown) => void;
  close?: () => void; // crosstalk >= 1.0: removes the handle's listeners
}
export interface Crosstalk {
  SelectionHandle: new (group: string) => CrosstalkHandle;
  FilterHandle: new (group: string) => CrosstalkHandle;
}
export function getCrosstalk(): Crosstalk | null {
  return (window as unknown as { crosstalk?: Crosstalk }).crosstalk || null;
}
