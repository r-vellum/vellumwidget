// Playback controls for an animated widget (VW-55).
//
// An animation widget embeds the animated SVG from vellumplot::anim_save(): each
// frame is a `<g class="<p>-vf">` shown by one shared CSS `steps()` keyframe
// animation, offset per frame by a negative `animation-delay`, looping forever.
// A `@media (prefers-reduced-motion: reduce)` rule turns the animation off and
// shows one still frame (`<p>-vs`). `<p>` is a per-document prefix.
//
// The controls are a play/pause button and a frame scrubber. Paused, the runtime
// shows one frame itself (a scoped stylesheet switches the CSS animation off and
// makes only the current frame visible), so a paused or scrubbed frame does not
// depend on the Web Animations API. Playing hands back to the CSS animation and,
// where the API exists, seeks it to the frame playback resumes from. Under
// prefers-reduced-motion the widget starts paused on the still frame; pressing
// play still plays it (the user asked for it).

import { cssEscape } from "../css";
import type { WidgetFns, WidgetState } from "../state";

export interface AnimInfo {
  prefix: string;
  frames: Element[];
  // Per frame, the magnitude of its animation-delay, in seconds.
  delays: number[];
  // Duration of one loop, in seconds, and of one frame.
  dur: number;
  dt: number;
  // The prefers-reduced-motion still frame (index into `frames`).
  still: number;
  // The frame rule's animation longhands (to replay it under reduced motion),
  // or null when the rule could not be read.
  name: string | null;
  timing: string;
}

const FRAME_RE = /^(.+)-vf$/;
const SEEK_JITTER_MS = 0.3137;
const ICON_OPEN = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">';
const PAUSE_ICON = ICON_OPEN + '<rect x="2" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor"/><rect x="7.2" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor"/></svg>';
const PLAY_ICON = ICON_OPEN + '<path d="M3 1.5 L10.5 6 L3 10.5 Z" fill="currentColor"/></svg>';

function frameToken(el: Element): string | null {
  const cls = el.getAttribute("class");
  if (!cls) return null;
  const toks = cls.split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const m = FRAME_RE.exec(toks[i]);
    if (m) return m[1];
  }
  return null;
}

function seconds(v: string): number {
  const m = /^(-?[\d.]+)(m?s)$/.exec(v.trim());
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "ms" ? n / 1000 : n;
}

// Read the frame structure of an anim_save() SVG, or null if `svg` is not one.
export function parseAnimation(svg: Element): AnimInfo | null {
  let prefix: string | null = null;
  const gs = svg.querySelectorAll("g[class]");
  for (let i = 0; i < gs.length && prefix == null; i++) prefix = frameToken(gs[i]);
  if (prefix == null) return null;
  const frames = Array.prototype.slice.call(svg.querySelectorAll("." + cssEscape(prefix + "-vf"))) as Element[];
  const n = frames.length;
  if (n < 2) return null;
  const delays = frames.map(function (f) {
    const m = /animation-delay\s*:\s*([-\d.]+m?s)/.exec(f.getAttribute("style") || "");
    const d = m ? seconds(m[1]) : NaN;
    return isFinite(d) ? Math.abs(d) : 0;
  });
  // The frame rule outside the media query: `.<p>-vf{...animation:<name> <dur> <timing> infinite}`.
  let css = "";
  const styles = svg.querySelectorAll("style");
  for (let i = 0; i < styles.length; i++) css += styles[i].textContent || "";
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp("\\." + esc + "-vf\\s*\\{([^}]*)\\}").exec(css);
  let name: string | null = null;
  let dur = NaN;
  let timing = "steps(1,end)";
  const anim = rule ? /animation\s*:\s*([^;]+)/.exec(rule[1]) : null;
  if (anim) {
    const toks = anim[1].trim().split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (/^[\d.]+m?s$/.test(t) && !isFinite(dur)) dur = seconds(t);
      else if (/^(steps|cubic-bezier)\(/.test(t) || /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/.test(t)) timing = t;
      else if (t !== "infinite" && !/^\d+$/.test(t) && name == null) name = t;
    }
  }
  if (!(dur > 0)) {
    // No readable rule: one loop is n frames of the smallest delay step.
    let step = Infinity;
    for (let i = 0; i < n; i++) if (delays[i] > 0 && delays[i] < step) step = delays[i];
    dur = isFinite(step) ? step * n : n / 25;
  }
  let still = 0;
  for (let i = 0; i < n; i++) if (frames[i].classList.contains(prefix + "-vs")) { still = i; break; }
  return { prefix: prefix, frames: frames, delays: delays, dur: dur, dt: dur / n, still: still, name: name, timing: timing };
}

// The frame on screen at animation time `t` (seconds): frame i is visible while
// (t + delay_i) mod dur < dt, i.e. the one with the smallest phase.
export function frameAt(info: AnimInfo, t: number): number {
  let best = 0;
  let bestPhase = Infinity;
  for (let i = 0; i < info.frames.length; i++) {
    let ph = (t + info.delays[i]) % info.dur;
    if (ph < 0) ph += info.dur;
    if (ph < bestPhase - 1e-9) { bestPhase = ph; best = i; }
  }
  return best;
}

// The animation time (seconds) halfway through frame `k`'s slot.
export function timeOfFrame(info: AnimInfo, k: number): number {
  let t = (info.dur - info.delays[k]) % info.dur;
  if (t < 0) t += info.dur;
  return t + info.dt / 2;
}

function reducedMotion(): boolean {
  const mm = (window as unknown as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  try {
    return typeof mm === "function" && !!mm.call(window, "(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}

interface CssAnim { currentTime: number | null; animationName?: string }

export function animFeature(ws: WidgetState): Pick<WidgetFns, "buildAnimControls" | "animState" | "animPlay" | "animSeek"> {
  let info: AnimInfo | null = null;
  let bar: HTMLElement | null = null;
  let btn: HTMLButtonElement | null = null;
  let range: HTMLInputElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let playing = false;
  let frame = 0;
  // Clock fallback (no Web Animations API): when play started and from which frame.
  let playT0 = 0;
  let playFrom = 0;
  let raf = 0;

  function now(): number {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  // The frame CSS animations (Element.getAnimations), or null without the API.
  function cssAnims(): CssAnim[] | null {
    const svg = ws.svgEl as unknown as { getAnimations?: (o?: { subtree: boolean }) => CssAnim[] } | null;
    if (!svg || typeof svg.getAnimations !== "function" || !info) return null;
    const all = svg.getAnimations({ subtree: true });
    const nm = info.name;
    return nm ? all.filter(function (a) { return a.animationName == null || a.animationName === nm; }) : all;
  }

  function currentFrame(): number {
    if (!info) return 0;
    if (!playing) return frame;
    const as = cssAnims();
    if (as && as.length && as[0].currentTime != null) return frameAt(info, Number(as[0].currentTime) / 1000);
    const n = info.frames.length;
    return (playFrom + Math.floor((now() - playT0) / 1000 / info.dt)) % n;
  }

  function showFrame(k: number): void {
    if (!info) return;
    const cur = "vellumwidget-anim-cur";
    for (let i = 0; i < info.frames.length; i++) info.frames[i].classList.toggle(cur, i === k);
  }

  function syncRange(k: number): void {
    if (!range || !info) return;
    range.value = String(k);
    range.setAttribute("aria-valuetext", "Frame " + (k + 1) + " of " + info.frames.length);
  }

  function syncButton(): void {
    if (!btn) return;
    const label = playing ? "Pause animation" : "Play animation";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    // Inline SVG icons (font glyphs for pause render as a square at this size).
    btn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    btn.classList.toggle("vellumwidget-anim-playing-btn", playing);
  }

  function tick(): void {
    raf = 0;
    if (!playing || !bar || !bar.isConnected) return;
    syncRange(currentFrame());
    raf = window.requestAnimationFrame(tick);
  }

  function setPlaying(on: boolean): void {
    if (!info) return;
    if (on === playing) return;
    if (!on) frame = currentFrame();
    playing = on;
    ws.el.classList.toggle("vellumwidget-anim-paused", !on);
    ws.el.classList.toggle("vellumwidget-anim-playing", on);
    if (on) {
      // Hand back to the CSS animation (restarted by the class change) and seek
      // every frame's animation to the frame playback resumes from.
      playFrom = frame;
      playT0 = now() - (info.dt / 2) * 1000;
      const as = cssAnims();
      if (as) {
        // Off the millisecond grid by a fraction (SEEK_JITTER_MS): the SVG's keyframe
        // percentage is rounded, leaving a sub-nanosecond gap at each frame
        // boundary, and a seek to a round time lets the animation clock (often on
        // a whole-ms or vsync grid) land exactly in it, flashing a blank frame.
        const t = timeOfFrame(info, frame) * 1000 + SEEK_JITTER_MS;
        for (let i = 0; i < as.length; i++) as[i].currentTime = t;
      }
      if (typeof window.requestAnimationFrame === "function" && !raf) raf = window.requestAnimationFrame(tick);
    } else {
      if (raf && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(raf);
      raf = 0;
      showFrame(frame);
      syncRange(frame);
    }
    syncButton();
  }

  function seek(k: number): void {
    if (!info) return;
    const n = info.frames.length;
    k = Math.max(0, Math.min(n - 1, Math.round(k)));
    if (playing) setPlaying(false);
    frame = k;
    showFrame(k);
    syncRange(k);
  }

  function teardown(): void {
    if (raf && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(raf);
    raf = 0;
    if (bar) bar.remove();
    if (styleEl) styleEl.remove();
    bar = btn = range = null;
    styleEl = null;
    info = null;
    playing = false;
    ws.el.classList.remove("vellumwidget-anim-paused", "vellumwidget-anim-playing");
  }

  function buildAnimControls(): void {
    teardown();
    if (!ws.opts.animated || !ws.svgEl || !ws.stage) return;
    info = parseAnimation(ws.svgEl);
    if (!info) return;
    const p = "." + cssEscape(info.prefix);
    // Scoped to this widget's root and the document's own prefix. Paused: no CSS
    // animation, only the current frame shown. Playing: the frame animation again,
    // restated so it also runs under prefers-reduced-motion once the user presses
    // play (longhands, so each frame keeps its inline animation-delay).
    let css =
      ".vellumwidget-anim-paused " + p + "-vf{animation:none!important;visibility:hidden!important}" +
      ".vellumwidget-anim-paused " + p + "-vf.vellumwidget-anim-cur{visibility:visible!important}";
    if (info.name) {
      css +=
        ".vellumwidget-anim-playing " + p + "-vf{animation-name:" + info.name + "!important;animation-duration:" +
        info.dur + "s!important;animation-timing-function:" + info.timing +
        "!important;animation-iteration-count:infinite!important}" +
        ".vellumwidget-anim-playing " + p + "-vs{visibility:hidden}";
    }
    styleEl = document.createElement("style");
    styleEl.textContent = css;
    ws.el.appendChild(styleEl);

    bar = document.createElement("div");
    bar.className = "vellumwidget-anim";
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vellumwidget-anim-btn";
    btn.addEventListener("click", function () { setPlaying(!playing); });
    range = document.createElement("input");
    range.type = "range";
    range.className = "vellumwidget-anim-range";
    range.min = "0";
    range.max = String(info.frames.length - 1);
    range.step = "1";
    range.setAttribute("aria-label", "Animation frame");
    range.addEventListener("input", function () { if (range) seek(parseInt(range.value, 10) || 0); });
    bar.appendChild(btn);
    bar.appendChild(range);
    ws.stage.appendChild(bar);

    frame = info.still;
    playing = false;
    if (reducedMotion()) {
      // Start paused on the still frame the SVG itself shows under reduced motion.
      ws.el.classList.add("vellumwidget-anim-paused");
      showFrame(frame);
      syncRange(frame);
      syncButton();
    } else {
      frame = 0;
      syncRange(0);
      setPlaying(true);
    }
  }

  function animState(): { playing: boolean; frame: number; frames: number } | null {
    if (!info) return null;
    return { playing: playing, frame: currentFrame(), frames: info.frames.length };
  }

  return { buildAnimControls: buildAnimControls, animState: animState, animPlay: setPlaying, animSeek: seek };
}
