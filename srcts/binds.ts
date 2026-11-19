// Scale binds (vellumplot::bind_scale(), F-15): pure helpers that turn an
// interval selection's data range into a target panel's visible native domain,
// and that domain into the panel's pan transform. No widget state.

import { asColumn } from "./elements";
import type { IntervalChannel } from "./scales";
import { dataToNative } from "./ticks";
import type { AxisScale, PanelInfo } from "./types";
import type { PanTransform } from "./viewbox";

// A panel's bound visible domain, per screen axis, in its own native units:
// `h` the horizontal axis, `v` the vertical one ([lo, hi] in data order).
export interface BoundDomain { h?: number[]; v?: number[]; }

// Seconds per epoch unit, so a Date brush (days) can drive a POSIXct axis
// (seconds) and back.
const UNIT_SECONDS: Record<string, number> = { day: 86400, second: 1 };

// Map an interval channel brushed on axis `src` to the native [lo, hi] it covers
// on axis `dst`. A discrete target takes the band of the brushed levels it has
// (±0.5 around their positions); a continuous / date target maps the data range
// through its transform (converting the epoch unit when the two axes differ).
// Null when nothing maps (no shared levels, a non-finite or empty range).
export function channelToNative(ch: IntervalChannel, src: AxisScale | undefined, dst: AxisScale): number[] | null {
  if (dst.type === "discrete") {
    if (!ch.levels) return null;
    const levels = dst.levels != null ? asColumn<string>(dst.levels).map(String) : [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ch.levels.length; i++) {
      const k = levels.indexOf(String(ch.levels[i]));
      if (k < 0) continue;
      lo = Math.min(lo, k + 1 - 0.5);
      hi = Math.max(hi, k + 1 + 0.5);
    }
    return isFinite(lo) && isFinite(hi) ? [lo, hi] : null;
  }
  if (ch.levels) return null; // a discrete brush cannot place a continuous axis
  let a = ch.lo, b = ch.hi;
  const su = src && src.time_unit ? UNIT_SECONDS[src.time_unit] : undefined;
  const du = dst.time_unit ? UNIT_SECONDS[dst.time_unit] : undefined;
  if (su && du && su !== du) { a = a * su / du; b = b * su / du; }
  const na = dataToNative(dst, a), nb = dataToNative(dst, b);
  if (!isFinite(na) || !isFinite(nb) || na === nb) return null;
  return [Math.min(na, nb), Math.max(na, nb)];
}

// The pan transform that shows native domain `b` across panel `p`, replacing
// the bound axis of the shared transform `t` (an unbound axis keeps `t`). On the
// horizontal axis the scene px of native n is px0 + (n - native_lo) * k; the
// bound view draws it at px0 + (n - d0) * k' instead, with k' spanning the panel
// over the bound domain. Orientation is kept: a reversed axis (decreasing native
// domain) stays reversed. The vertical axis is the same with py, top-down.
export function boundPan(p: PanelInfo, t: PanTransform, b: BoundDomain): PanTransform {
  const out: PanTransform = { sx: t.sx, sy: t.sy, tx: t.tx, ty: t.ty };
  if (b.h && p.x && p.px1 !== p.px0 && p.x.native_hi !== p.x.native_lo) {
    const ax = p.x;
    const rising = ax.native_hi > ax.native_lo;
    const d0 = rising ? b.h[0] : b.h[1], d1 = rising ? b.h[1] : b.h[0];
    const k = (p.px1 - p.px0) / (ax.native_hi - ax.native_lo);
    const k2 = (p.px1 - p.px0) / (d1 - d0);
    out.sx = k2 / k;
    out.tx = p.px0 * (1 - out.sx) + (ax.native_lo - d0) * k2;
  }
  if (b.v && p.y && p.py1 !== p.py0 && p.y.native_hi !== p.y.native_lo) {
    const ay = p.y;
    const rising = ay.native_hi > ay.native_lo;
    const d0 = rising ? b.v[0] : b.v[1], d1 = rising ? b.v[1] : b.v[0];
    const k = (p.py1 - p.py0) / (ay.native_hi - ay.native_lo);
    const k2 = (p.py1 - p.py0) / (d1 - d0);
    out.sy = k2 / k;
    out.ty = p.py0 * (1 - out.sy) + (d1 - ay.native_hi) * k2;
  }
  return out;
}

// Equality of two bound-domain maps (to skip a redundant redraw).
export function sameBounds(a: Record<string, BoundDomain>, b: Record<string, BoundDomain>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const eq = (x?: number[], y?: number[]): boolean =>
    (!x && !y) || (!!x && !!y && Math.abs(x[0] - y[0]) < 1e-9 && Math.abs(x[1] - y[1]) < 1e-9);
  for (let i = 0; i < ka.length; i++) {
    const p = a[ka[i]], q = b[ka[i]];
    if (!q || !eq(p.h, q.h) || !eq(p.v, q.v)) return false;
  }
  return true;
}
