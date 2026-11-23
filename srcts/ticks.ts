// Client-side axis re-ticking: nice linear ticks, log ticks, date/datetime ticks
// (with strftime-style formatting), and the per-axis dispatcher.

import { asColumn } from "./elements";
import { nativeToData } from "./scales";
import type { AxisScale, SecAxisMap } from "./types";

// "Nice" round tick values covering [lo, hi] (1/2/5 x 10^k steps), a handful of
// them. The client-side re-ticker for a linear axis: vellum's own ticks span the
// full data range and don't follow a zoom, so we regenerate for the visible range.
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo || count < 1) return [];
  const step0 = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.round(v / step) * step); // snap to the grid (kill fp drift)
  }
  return out;
}
// Format a linear tick value for a given step: enough decimals to tell adjacent
// ticks apart, trailing zeros trimmed. (Log, date and discrete axes have their own
// generators below; this formats the plain linear numbers.)
export function fmtTick(v: number, step: number): string {
  if (v === 0) return "0";
  const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-9)));
  let s = v.toFixed(decimals);
  if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
  return s;
}
// Forward axis transform data -> native (inverse of nativeToData).
export function dataToNative(ax: AxisScale, d: number): number {
  switch (ax.transform) {
    case "log10": return Math.log10(d);
    case "sqrt": return Math.sqrt(d);
    default: return d; // identity, reverse (the flip lives in the decreasing domain)
  }
}

// --- axis-zoom tick generators (log10 / date / datetime / discrete) ---
// Each returns the ticks for a VISIBLE native range [lo, hi] as {n, label}: `n`
// is the tick position in native (viewport) units, which the re-ticker maps to
// device px through the panel affine and the pan transform. Labels follow the
// format vellumplot uses for that axis type, so an un-zoomed re-tick reads like
// the static axis it replaces.
export interface Tick { n: number; label: string; }

// R's `format(x, scientific = FALSE)` for a numeric vector: one common number of
// decimals (enough for 7 significant digits of every value), so `c(0.1, 1, 10)`
// reads "0.1", "1.0", "10.0" exactly as vellumplot's static log axis does.
export function fmtRNum(vals: number[]): string[] {
  let dec = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!isFinite(v) || v === 0) continue;
    const target = Number(v.toPrecision(7));
    let d = 0;
    while (d < 15 && Math.abs(Number(v.toFixed(d)) - target) > Math.abs(target) * 1e-9) d++;
    if (d > dec) dec = d;
  }
  return vals.map(function (v) { return isFinite(v) ? v.toFixed(dec) : String(v); });
}

// Ticks for a log10 axis over the visible native (log10) range [lo, hi], with
// their data values. Mirrors `scales::breaks_log()` (vellumplot's static log
// breaks): whole decades when at least n-2 of them are in view (thinned to every
// `by`-th decade on a wide range), else progressively denser 1-3 / 1-2-5 /
// 1-2-3-5 / 1..9 subdivisions of each decade, else (deep zoom inside one decade)
// plain linear ticks in data space.
export interface LogTicks { ticks: { n: number; d: number }[]; linear: boolean; }
export function logTicks(lo: number, hi: number, n: number): LogTicks {
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return { ticks: [], linear: false };
  const need = Math.max(2, n - 2);
  const p0 = Math.ceil(lo - 1e-9), p1 = Math.floor(hi + 1e-9);
  if (p1 - p0 + 1 >= need) {
    // Thin to every `by`-th decade, aligned to multiples of `by` so a pan keeps
    // the same decades rather than re-phasing them.
    const by = Math.floor((hi - lo) / n) + 1;
    const out: { n: number; d: number }[] = [];
    for (let k = Math.ceil(p0 / by) * by; k <= p1; k += by) {
      out.push({ n: k, d: Number(Math.pow(10, k).toPrecision(12)) });
    }
    if (out.length >= need || by === 1) return { ticks: out, linear: false };
  }
  const sets = [[1, 3], [1, 2, 5], [1, 2, 3, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
  for (let s = 0; s < sets.length; s++) {
    const out: { n: number; d: number }[] = [];
    for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
      for (let j = 0; j < sets[s].length; j++) {
        const m = sets[s][j];
        const nv = k + Math.log10(m);
        if (nv < lo - 1e-9 || nv > hi + 1e-9) continue;
        out.push({ n: nv, d: Number((m * Math.pow(10, k)).toPrecision(12)) });
      }
    }
    if (out.length >= need) return { ticks: out, linear: false };
  }
  // Zoomed inside a decade: linear ticks in data space.
  const dlo = Math.pow(10, lo), dhi = Math.pow(10, hi);
  const lin = niceTicks(dlo, dhi, n).filter(function (d) { return d > 0; })
    .map(function (d) { return { n: Math.log10(d), d: d }; });
  return { ticks: lin, linear: true };
}

// A minimal strftime over a UTC instant (`ms` since the epoch). Covers the
// conversions date axes use (vellumplot's `date_labels` are R strftime formats);
// month/day names are English, like R in the C locale.
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
export const WDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function pad2(v: number): string { return v < 10 ? "0" + v : String(v); }
export function strftimeUTC(fmt: string, ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return fmt.replace(/%([a-zA-Z%])/g, function (_m: string, c: string): string {
    switch (c) {
      case "Y": return String(d.getUTCFullYear());
      case "y": return pad2(((d.getUTCFullYear() % 100) + 100) % 100);
      case "m": return pad2(d.getUTCMonth() + 1);
      case "d": return pad2(d.getUTCDate());
      case "e": return (d.getUTCDate() < 10 ? " " : "") + d.getUTCDate();
      case "H": return pad2(d.getUTCHours());
      case "I": return pad2(((d.getUTCHours() + 11) % 12) + 1);
      case "p": return d.getUTCHours() < 12 ? "AM" : "PM";
      case "M": return pad2(d.getUTCMinutes());
      case "S": return pad2(d.getUTCSeconds());
      case "b": case "h": return MONTHS[d.getUTCMonth()].slice(0, 3);
      case "B": return MONTHS[d.getUTCMonth()];
      case "a": return WDAYS[d.getUTCDay()].slice(0, 3);
      case "A": return WDAYS[d.getUTCDay()];
      case "j": {
        const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
        return (doy < 10 ? "00" : doy < 100 ? "0" : "") + doy;
      }
      case "%": return "%";
      default: return "%" + c;
    }
  });
}
// The finest calendar unit a format shows: 0 second, 1 minute, 2 hour, 3 day,
// 4 month, 5 year. A format is fine enough for a tick step when its rank is no
// coarser than the step's (a "%b %Y" label can't tell two days apart).
export function fmtRank(fmt: string): number {
  if (/%S/.test(fmt)) return 0;
  if (/%M/.test(fmt)) return 1;
  if (/%[HIp]/.test(fmt)) return 2;
  if (/%[deja]|%A/.test(fmt)) return 3;
  if (/%[mbBh]/.test(fmt)) return 4;
  return 5;
}
// Candidate formats tried against a date axis's static labels, finest first so an
// ambiguous match keeps the most detail.
export const TIME_FORMATS = [
  "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M", "%b %d %H:%M",
  "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%m/%d", "%d/%m",
  "%b %d", "%d %b", "%b %d %Y", "%d %b %Y", "%B %d", "%d %B", "%B %d, %Y", "%e %b",
  "%Y-%m", "%b %Y", "%B %Y", "%b %y", "%m/%Y", "%b", "%B", "%Y", "%y"
];
// UTC offsets (ms) tried for a datetime axis, nearest-to-UTC first: the scene
// carries epoch seconds but its labels were formatted in the plot's time zone.
export const TZ_OFFSETS: number[] = (function () {
  const out = [0];
  for (let q = 1; q <= 56; q++) out.push(q * 900000, -q * 900000);
  return out;
})();
// `off` is the axis's UTC offset at its first break; `tz`, when set, is an IANA
// zone that reproduces every static label, so each tick gets its own offset
// (VW-10c: a DST change inside the view no longer shifts labels by an hour).
export interface TimeFormatInfo { fmt: string | null; off: number; tz?: string; }
export const timeFmtCache: WeakMap<AxisScale, TimeFormatInfo> = new WeakMap();

// UTC offset (ms) of IANA zone `tz` at instant `ms`, via Intl; null when the
// runtime has no time-zone data for it.
const tzFormatters: Record<string, Intl.DateTimeFormat | null> = {};
export function zoneOffset(tz: string, ms: number): number | null {
  let f = tzFormatters[tz];
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour12: false, year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric"
      });
    } catch (e) { f = null; }
    tzFormatters[tz] = f;
  }
  if (!f || !isFinite(ms)) return null;
  const parts = f.formatToParts(new Date(ms));
  const get = (t: string) => { for (let i = 0; i < parts.length; i++) if (parts[i].type === t) return Number(parts[i].value); return NaN; };
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return isFinite(wall) ? wall - Math.floor(ms / 1000) * 1000 : null;
}

function browserZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
}

function allZones(): string[] {
  const I = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try { return typeof I.supportedValuesOf === "function" ? I.supportedValuesOf("timeZone") : []; } catch (e) { return []; }
}

// Recover the strftime format (and, for datetime, the time zone) that produced a
// date axis's static labels, by formatting its static breaks with each candidate
// until one reproduces every label. `fmt` is null when nothing matches (custom
// label functions) — the generator then picks a format per tick step.
//
// For a datetime axis the labels were formatted in the plot's time zone, which
// the payload does not name. Candidates are fixed offsets (nearest UTC first) and
// IANA zones (the viewer's own first; every zone when no fixed offset fits, or
// when a day-level format's breaks are not all on local midnight). Among the
// candidates that reproduce every label, the one putting the most breaks on a
// local midnight wins (vellumplot places day-or-coarser breaks there); ties go
// to the viewer's zone, then the fixed offset.
export function detectTimeFormat(ax: AxisScale): TimeFormatInfo {
  const hit = timeFmtCache.get(ax);
  if (hit) return hit;
  const breaks = asColumn(ax.breaks), labels = asColumn(ax.labels).map(String);
  const unitMs = ax.time_unit === "second" ? 1000 : 86400000;
  let info: TimeFormatInfo = { fmt: null, off: 0 };
  if (breaks.length && breaks.length === labels.length) {
    const ms = breaks.map(function (b) { return Number(b) * unitMs; });
    const lab = labels.map(function (l) { return l.trim(); });
    if (ax.time_unit !== "second") {
      for (let f = 0; f < TIME_FORMATS.length; f++) {
        let all = true;
        for (let i = 0; i < ms.length && all; i++) all = strftimeUTC(TIME_FORMATS[f], ms[i]) === lab[i];
        if (all) { info = { fmt: TIME_FORMATS[f], off: 0 }; break; }
      }
    } else {
      for (let f = 0; f < TIME_FORMATS.length; f++) {
        const r = detectZone(TIME_FORMATS[f], ms, lab);
        if (r) { info = r; break; }
      }
    }
  }
  timeFmtCache.set(ax, info);
  return info;
}

function detectZone(fmt: string, ms: number[], lab: string[]): TimeFormatInfo | null {
  const DAY = 86400000;
  // Per break, the offsets (15-minute steps, which cover every zone) under
  // which it formats to its label; a break no offset fits rules the format out.
  const ok: Record<number, boolean>[] = [];
  for (let i = 0; i < ms.length; i++) {
    const set: Record<number, boolean> = {};
    let any = false;
    for (let o = 0; o < TZ_OFFSETS.length; o++) {
      if (strftimeUTC(fmt, ms[i] + TZ_OFFSETS[o]) === lab[i]) { set[TZ_OFFSETS[o]] = true; any = true; }
    }
    if (!any) return null;
    ok.push(set);
  }
  const fits = (i: number, o: number) => ok[i][o] === true;
  // The fixed offset (nearest UTC first) that reproduces every label.
  let fixed: number | null = null;
  for (let o = 0; o < TZ_OFFSETS.length && fixed === null; o++) {
    let all = true;
    for (let i = 0; i < ms.length && all; i++) all = fits(i, TZ_OFFSETS[o]);
    if (all) fixed = TZ_OFFSETS[o];
  }
  const midnights = (offs: number[]) => {
    let c = 0;
    for (let i = 0; i < ms.length; i++) if ((((ms[i] + offs[i]) % DAY) + DAY) % DAY === 0) c++;
    return c;
  };
  const zoneOffs = (tz: string): number[] | null => {
    const out: number[] = [];
    for (let i = 0; i < ms.length; i++) {
      const o = zoneOffset(tz, ms[i]);
      if (o === null || !fits(i, o)) return null;
      out.push(o);
    }
    return out;
  };
  let best: TimeFormatInfo | null = null, bestScore = -1;
  const own = browserZone();
  if (own) {
    const zo = zoneOffs(own);
    if (zo) { best = { fmt: fmt, off: zo[0], tz: own }; bestScore = midnights(zo); }
  }
  if (fixed !== null) {
    const sc = midnights(ms.map(function () { return fixed as number; }));
    if (sc > bestScore) { best = { fmt: fmt, off: fixed }; bestScore = sc; }
  }
  const dayLevel = fmtRank(fmt) >= 3;
  if (fixed === null || (dayLevel && bestScore < ms.length)) {
    const zones = allZones();
    for (let z = 0; z < zones.length; z++) {
      if (zones[z] === own) continue;
      const zo = zoneOffs(zones[z]);
      if (!zo) continue;
      const sc = midnights(zo);
      if (sc > bestScore) { best = { fmt: fmt, off: zo[0], tz: zones[z] }; bestScore = sc; }
      if (bestScore === ms.length) break;
    }
  }
  return best;
}

// Calendar tick steps, finest first: rank (see fmtRank), a nominal length in ms
// (to pick the step), and how to lay ticks out — a fixed `ms` stride, or every
// `mo` months / `yr` years on calendar boundaries.
export interface TimeStep { rank: number; ms: number; mo?: number; yr?: number; }
export const TIME_STEPS: TimeStep[] = (function () {
  const s = 1000, mi = 60 * s, h = 60 * mi, d = 24 * h;
  const out: TimeStep[] = [];
  [1, 2, 5, 10, 15, 30].forEach(function (k) { out.push({ rank: 0, ms: k * s }); });
  [1, 2, 5, 10, 15, 30].forEach(function (k) { out.push({ rank: 1, ms: k * mi }); });
  [1, 3, 6, 12].forEach(function (k) { out.push({ rank: 2, ms: k * h }); });
  [1, 2, 7].forEach(function (k) { out.push({ rank: 3, ms: k * d }); });
  [1, 2, 3, 6].forEach(function (k) { out.push({ rank: 4, ms: k * 30.4375 * d, mo: k }); });
  [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].forEach(function (k) {
    out.push({ rank: 5, ms: k * 365.25 * d, yr: k });
  });
  return out;
})();
// Ticks for a date (epoch days) or datetime (epoch seconds) axis over the visible
// range [lo, hi] in those units: the coarsest-but-dense-enough calendar step
// (seconds .. years, at most ~`n` ticks), placed on calendar boundaries in the
// axis's own time zone and labelled with the static axis's format when it is fine
// enough for the step, else a step-appropriate ISO-style format.
export function timeTicks(ax: AxisScale, lo: number, hi: number, n: number): Tick[] {
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [];
  const isDate = ax.time_unit !== "second";
  const unitMs = isDate ? 86400000 : 1000;
  const info = detectTimeFormat(ax);
  const off = info.off;
  const tz = !isDate && info.tz ? info.tz : null;
  // The axis's offset at an instant: per tick in a detected zone, else fixed.
  const offAt = (t: number): number => {
    if (!tz) return off;
    const o = zoneOffset(tz, t);
    return o === null ? off : o;
  };
  const slo = lo * unitMs + offAt(lo * unitMs), shi = hi * unitMs + offAt(hi * unitMs); // the axis's wall clock
  const span = shi - slo;
  let step: TimeStep | null = null;
  for (let i = 0; i < TIME_STEPS.length; i++) {
    const st = TIME_STEPS[i];
    if (isDate && st.rank < 3) continue; // a Date axis has no time of day
    if (span / st.ms <= n) { step = st; break; }
  }
  if (!step) {
    // Beyond the table: nice 1/2/5 x 10^k years.
    const yrs = span / (365.25 * 86400000);
    const raw = yrs / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const k = (raw / mag < 2 ? 2 : raw / mag < 5 ? 5 : 10) * mag;
    step = { rank: 5, ms: k * 365.25 * 86400000, yr: k };
  }
  const walls: number[] = [];
  if (step.yr) {
    const y0 = new Date(slo).getUTCFullYear(), y1 = new Date(shi).getUTCFullYear();
    for (let y = Math.ceil(y0 / step.yr) * step.yr; y <= y1; y += step.yr) walls.push(Date.UTC(y, 0, 1));
  } else if (step.mo) {
    const a = new Date(slo), b = new Date(shi);
    let mIdx = a.getUTCFullYear() * 12 + a.getUTCMonth();
    mIdx = Math.ceil(mIdx / step.mo) * step.mo;
    const mEnd = b.getUTCFullYear() * 12 + b.getUTCMonth();
    for (; mIdx <= mEnd; mIdx += step.mo) walls.push(Date.UTC(Math.floor(mIdx / 12), mIdx % 12, 1));
  } else {
    // Fixed strides; weeks start on a Monday (1970-01-05 is epoch day 4).
    const origin = step.ms === 7 * 86400000 ? 4 * 86400000 : 0;
    for (let t = Math.ceil((slo - origin) / step.ms - 1e-9) * step.ms + origin; t <= shi + 1e-6; t += step.ms) {
      walls.push(t);
    }
  }
  const defFmt = step.rank >= 5 ? "%Y" : step.rank === 4 ? "%Y-%m" : step.rank === 3 ? "%Y-%m-%d"
    : step.rank === 0 ? "%H:%M:%S" : "%H:%M";
  const useStatic = info.fmt != null && fmtRank(info.fmt) <= step.rank;
  const out: Tick[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w < slo - 1e-6 || w > shi + 1e-6) continue;
    let fmt = useStatic ? info.fmt! : defFmt;
    // Sub-day steps label each midnight with its date so the day stays readable.
    if (!useStatic && step.rank <= 2 && w % 86400000 === 0) fmt = "%Y-%m-%d";
    let inst = w - off;
    if (tz) {
      // Wall -> instant: refine once (the offset at the instant may differ from
      // the guess near a DST change); skip a wall time the change skips over.
      inst = w - offAt(w - offAt(w));
      if (inst + offAt(inst) !== w) continue;
    }
    out.push({ n: inst / unitMs, label: strftimeUTC(fmt, w) });
  }
  return out;
}

// Transforms the re-ticker generates nice data-space ticks for (anything else
// re-positions the static breaks).
export const NICE_TRANSFORMS: Record<string, boolean> = { identity: true, reverse: true, sqrt: true };
// Does the axis carry its static breaks + labels (needed to re-position discrete /
// binned / custom-transform ticks, and to match a date axis's label format)?
export function hasStaticBreaks(ax: AxisScale): boolean {
  const b = asColumn(ax.breaks), l = asColumn(ax.labels);
  return b.length > 0 && b.length === l.length;
}
// Can the re-ticker follow a zoom on this axis? (An absent axis is trivially fine.)
export function axisRetickable(ax: AxisScale | undefined): boolean {
  if (!ax) return true;
  if (ax.type === "discrete" || ax.type === "binned") return hasStaticBreaks(ax);
  if (ax.time_unit === "day" || ax.time_unit === "second") return true;
  if (ax.transform === "log10") return true;
  if (ax.type === "continuous" && NICE_TRANSFORMS[ax.transform]) return true;
  return hasStaticBreaks(ax);
}
// The ticks to draw for an axis whose visible native range is [lo, hi] (lo < hi):
//  - discrete / binned / other transforms: vellumplot's own breaks that are still
//    in view, with their labels (categories don't re-tick, they re-position);
//  - date / datetime: calendar steps (timeTicks);
//  - log10: decades + subdivisions (logTicks), labelled like the static axis;
//  - linear / reverse / sqrt: nice 1-2-5 steps in data space (niceTicks).
// The static render's own breaks and labels inside the native range [lo, hi].
export function staticTicks(ax: AxisScale, lo: number, hi: number): Tick[] {
  const b = asColumn(ax.breaks), l = asColumn(ax.labels);
  const tol = Math.abs(hi - lo) * 1e-6;
  const out: Tick[] = [];
  for (let i = 0; i < b.length && i < l.length; i++) {
    const v = Number(b[i]);
    if (isFinite(v) && v >= lo - tol && v <= hi + tol) out.push({ n: v, label: String(l[i]) });
  }
  return out;
}

// Minor gridline positions for a set of major breaks, as vellumplot's
// `.minor_breaks()` places them: the midpoints, plus half the local gap beyond
// each end. Fewer than two breaks give none.
export function minorBreaks(b: number[]): number[] {
  const s = b.filter(isFinite).slice().sort(function (p, q) { return p - q; });
  const n = s.length;
  if (n < 2) return [];
  const out: number[] = [s[0] - (s[1] - s[0]) / 2];
  for (let i = 0; i + 1 < n; i++) out.push((s[i] + s[i + 1]) / 2);
  out.push(s[n - 1] + (s[n - 1] - s[n - 2]) / 2);
  return out;
}

export function axisTicks(ax: AxisScale, lo: number, hi: number, n: number): Tick[] {
  if (!(hi > lo)) return [];
  const statics = function (): Tick[] { return staticTicks(ax, lo, hi); };
  if (ax.type === "discrete" || ax.type === "binned") return statics();
  if (ax.time_unit === "day" || ax.time_unit === "second") return timeTicks(ax, lo, hi, n);
  if (ax.transform === "log10") {
    const lt = logTicks(lo, hi, n), t = lt.ticks;
    // Decades/subdivisions read like R's format(); a deep-zoom linear fallback
    // uses the linear formatter for its step.
    const step = t.length > 1 ? t[1].d - t[0].d : 1;
    const labs = lt.linear ? t.map(function (x) { return fmtTick(x.d, step); })
      : fmtRNum(t.map(function (x) { return x.d; }));
    return t.map(function (x, i) { return { n: x.n, label: labs[i] }; });
  }
  if (NICE_TRANSFORMS[ax.transform]) {
    // native -> data at both ends (sqrt squares; identity/reverse pass through).
    // (A sqrt axis's expanded domain can dip below 0; clamp, sqrt data is >= 0.)
    const sq = ax.transform === "sqrt";
    const a = nativeToData(ax, sq ? Math.max(lo, 0) : lo), b = nativeToData(ax, sq ? Math.max(hi, 0) : hi);
    const dlo = Math.min(a, b), dhi = Math.max(a, b);
    const ticks = niceTicks(dlo, dhi, n);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : dhi - dlo;
    return ticks.map(function (d) { return { n: dataToNative(ax, d), label: fmtTick(d, step) }; });
  }
  return statics();
}

// The linear ticks for the visible native range [lo, hi] with labels of at
// most `dec` decimals (VW-59): the finest 1/2/5 x 10^-dec step that leaves at
// least two ticks in view (and not more than 2n), so the labels stay exact and
// distinct, only coarser. Null when the axis is not a plain linear one, or no
// such step leaves two ticks.
export function axisTicksAtDecimals(ax: AxisScale, lo: number, hi: number, n: number, dec: number): Tick[] | null {
  if (!(hi > lo) || dec < 0 || ax.type === "discrete" || ax.type === "binned") return null;
  if (ax.time_unit === "day" || ax.time_unit === "second" || !NICE_TRANSFORMS[ax.transform]) return null;
  const sq = ax.transform === "sqrt";
  const a = nativeToData(ax, sq ? Math.max(lo, 0) : lo), b = nativeToData(ax, sq ? Math.max(hi, 0) : hi);
  const dlo = Math.min(a, b), dhi = Math.max(a, b);
  const mults = [1, 2, 5];
  for (let m = 0; m < mults.length; m++) {
    const step = mults[m] * Math.pow(10, -dec);
    const vals: number[] = [];
    for (let v = Math.ceil(dlo / step - 1e-9) * step; v <= dhi + step * 1e-9 && vals.length <= 2 * n + 1; v += step) {
      vals.push(Math.round(v / step) * step);
    }
    if (vals.length < 2) return null; // a coarser step leaves fewer still
    if (vals.length <= Math.max(2, 2 * n) || m === mults.length - 1) {
      return vals.map(function (d) { return { n: dataToNative(ax, d), label: fmtTick(d, step) }; });
    }
  }
  return null;
}

// The most decimals any of `labels` shows (0 for whole numbers or none).
export function labelDecimals(labels: string[]): number {
  let dec = 0;
  for (let i = 0; i < labels.length; i++) {
    const m = /\.(\d+)$/.exec(labels[i]);
    if (m && m[1].length > dec) dec = m[1].length;
  }
  return dec;
}

// --- secondary axes (VW-10b) ---
// Parse a secondary axis's static labels as numbers, keeping any decoration
// shared by every label (a unit prefix/suffix such as "$" or " km", thousands
// commas). Null when any label is not a plain decorated number.
export function parseSecLabels(labels: string[]): { vals: number[]; prefix: string; suffix: string; comma: boolean } | null {
  if (labels.length < 2) return null;
  const NUM = /[-+\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?/;
  let prefix: string | null = null, suffix: string | null = null, comma = false;
  const vals: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    const t = labels[i].trim();
    // The first run that looks like a number (with at least one digit).
    const re = new RegExp(NUM.source, "g");
    let m: RegExpExecArray | null = null, hit: RegExpExecArray | null = null;
    while ((m = re.exec(t)) !== null) {
      if (/\d/.test(m[0])) { hit = m; break; }
      re.lastIndex = m.index + 1;
    }
    if (!hit) return null;
    const pre = t.slice(0, hit.index), suf = t.slice(hit.index + hit[0].length);
    if (/\d/.test(pre) || /\d/.test(suf)) return null;
    if (prefix === null) { prefix = pre; suffix = suf; }
    else if (pre !== prefix || suf !== suffix) return null;
    if (hit[0].indexOf(",") >= 0) comma = true;
    const v = Number(hit[0].replace(/,/g, "").replace("\u2212", "-"));
    if (!isFinite(v)) return null;
    vals.push(v);
  }
  return { vals: vals, prefix: prefix || "", suffix: suffix || "", comma: comma };
}

// Build the primary-native -> secondary-value map from matched pairs. Needs two
// distinct positions and strictly monotone values; null otherwise.
export function secAxisMap(native: number[], labels: string[]): SecAxisMap | null {
  const parsed = parseSecLabels(labels);
  if (!parsed || native.length !== parsed.vals.length) return null;
  const idx = native.map(function (_, i) { return i; }).filter(function (i) { return isFinite(native[i]); });
  idx.sort(function (a, b) { return native[a] - native[b]; });
  const n = idx.map(function (i) { return native[i]; });
  const v = idx.map(function (i) { return parsed.vals[i]; });
  if (n.length < 2) return null;
  const up = v[1] > v[0];
  for (let i = 1; i < n.length; i++) {
    if (!(n[i] > n[i - 1])) return null;
    if (up ? !(v[i] > v[i - 1]) : !(v[i] < v[i - 1])) return null;
  }
  // Linear when every pair sits on the line through the end pairs.
  const k = (v[n.length - 1] - v[0]) / (n[n.length - 1] - n[0]);
  const span = Math.abs(v[n.length - 1] - v[0]) || 1;
  let linear = true;
  for (let i = 1; i < n.length - 1 && linear; i++) linear = Math.abs(v[0] + k * (n[i] - n[0]) - v[i]) <= 1e-6 * span;
  return { n: n, v: v, linear: linear, prefix: parsed.prefix, suffix: parsed.suffix, comma: parsed.comma };
}

// Piecewise-linear interpolation through (xs, ys) (xs ascending or descending),
// extrapolating along the end segments.
function interp(xs: number[], ys: number[], x: number): number {
  const m = xs.length;
  const asc = xs[m - 1] > xs[0];
  let j = 1;
  while (j < m - 1 && (asc ? x > xs[j] : x < xs[j])) j++;
  const x0 = xs[j - 1], x1 = xs[j];
  return ys[j - 1] + (ys[j] - ys[j - 1]) * (x - x0) / (x1 - x0);
}

export function secForward(m: SecAxisMap, native: number): number {
  if (m.linear) {
    const L = m.n.length - 1;
    return m.v[0] + (m.v[L] - m.v[0]) * (native - m.n[0]) / (m.n[L] - m.n[0]);
  }
  return interp(m.n, m.v, native);
}

export function secInverse(m: SecAxisMap, value: number): number {
  if (m.linear) {
    const L = m.n.length - 1;
    return m.n[0] + (m.n[L] - m.n[0]) * (value - m.v[0]) / (m.v[L] - m.v[0]);
  }
  return interp(m.v, m.n, value);
}

// Ticks for a secondary axis over the visible primary-native range [lo, hi]:
// nice steps in secondary units, placed back on the primary native scale and
// labelled with the static labels' decoration.
export function secTicks(m: SecAxisMap, lo: number, hi: number, count: number): Tick[] {
  const a = secForward(m, lo), b = secForward(m, hi);
  const vals = niceTicks(Math.min(a, b), Math.max(a, b), count);
  if (!vals.length) return [];
  const step = vals.length > 1 ? Math.abs(vals[1] - vals[0]) : Math.abs(vals[0]) || 1;
  const out: Tick[] = [];
  for (let i = 0; i < vals.length; i++) {
    let s = fmtTick(vals[i], step);
    if (m.comma) {
      const neg = s.charAt(0) === "-";
      const body = neg ? s.slice(1) : s;
      const dot = body.indexOf(".");
      const int = dot < 0 ? body : body.slice(0, dot);
      s = (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dot < 0 ? "" : body.slice(dot));
    }
    out.push({ n: secInverse(m, vals[i]), label: m.prefix + s + m.suffix });
  }
  return out;
}
