// Headless test for the animated-widget playback controls (VW-55): load the
// built bundle into jsdom, render an anim_save()-shaped animated SVG, and drive
// the play/pause button and the frame scrubber. jsdom has no Web Animations API,
// so getAnimations() is stubbed where a test needs it.
// Run with: node tests/js/anim.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", function (err) {
  if (!/getContext/.test(String(err && err.message))) console.error(err);
});

const BUNDLE = path.join(__dirname, "..", "..", "inst", "htmlwidgets", "vellumwidget.js");

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok  - " + msg);
  else { failures++; console.log("  FAIL- " + msg); }
}

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  virtualConsole: virtualConsole
});
const { window } = dom;
global.window = window;
global.document = window.document;
// rAF is queued, never run on its own: the playback progress loop must not spin.
let rafQueue = [];
window.requestAnimationFrame = function (cb) { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = function () {};
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;

let reduce = false;
window.matchMedia = function (q) {
  return { matches: /prefers-reduced-motion:\s*reduce/.test(q) ? reduce : false, media: q };
};

let widgetDef = null;
const HTMLWidgets = { widget: (def) => (widgetDef = def) };
window.HTMLWidgets = HTMLWidgets;
const code = fs.readFileSync(BUNDLE, "utf8");
new Function("HTMLWidgets", "window", "document", code)(HTMLWidgets, window, window.document);
ok(widgetDef && widgetDef.name === "vellumwidget", "bundle registers the vellumwidget widget");

// An anim_save()-shaped SVG: n frames, 1.2 s loop, frame i delayed by -(D - i*dt)
// (frame 0 by -0), the still frame marked -vs.
function animSvg(n, still) {
  const P = "vl1234";
  const D = 1.2;
  const dt = D / n;
  let s = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" role="img">' +
    "<style>." + P + "-vf{visibility:hidden;animation:" + P + "-vc " + D + "s steps(1,end) infinite}" +
    "@keyframes " + P + "-vc{0%{visibility:visible}" + (100 / n).toFixed(6) + "%{visibility:hidden}}" +
    "@media (prefers-reduced-motion:reduce){." + P + "-vf{animation:none}." + P + "-vs{visibility:visible}}</style>";
  for (let i = 0; i < n; i++) {
    const d = i === 0 ? 0 : D - i * dt;
    s += '<g class="' + P + "-vf" + (i === still ? " " + P + "-vs" : "") + '" style="animation-delay:-' + d.toFixed(4) + 's">' +
      '<rect x="' + (i * 10) + '" y="10" width="5" height="5"/></g>';
  }
  return s + "</svg>";
}

function mount(payload) {
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 200, 100);
  inst.renderValue(payload);
  return { el: e, inst: inst };
}

function animPayload(n, still) {
  return {
    svg: animSvg(n, still),
    elements: [],
    panels: [],
    colorbar: null,
    options: { animated: true, raster: false, toolbar: false, a11y: true, alt: null }
  };
}

const T = window.__vellumwidgetTest;

// --- a static widget gets no playback controls ---
{
  const w = mount({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><path data-key="k" d="M1 1h2v2z"/></svg>',
    elements: [{ key: "k" }],
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  ok(!w.el.querySelector(".vellumwidget-anim"), "a static widget has no playback controls");
  ok(w.inst._test.animState() === null, "a static widget has no animation state");
  ok(!w.el.classList.contains("vellumwidget-anim-paused") && !w.el.classList.contains("vellumwidget-anim-playing"),
    "a static widget carries no playback class");
}

// --- an animated SVG with options.animated unset is left alone ---
{
  const p = animPayload(6, 0);
  delete p.options.animated;
  const w = mount(p);
  ok(!w.el.querySelector(".vellumwidget-anim"), "controls only when options.animated is set");
}

// --- default: autoplay, with a real pause button and a scrubber ---
{
  reduce = false;
  const w = mount(animPayload(30, 0));
  const btn = w.el.querySelector("button.vellumwidget-anim-btn");
  const range = w.el.querySelector("input.vellumwidget-anim-range");
  ok(!!btn && btn.type === "button", "a real <button> is added");
  ok(!!range && range.type === "range" && range.max === "29" && range.min === "0",
    "a range scrubber spans the 30 frames (" + (range && range.max) + ")");
  ok(range.getAttribute("aria-label") === "Animation frame", "the scrubber has an accessible name");
  let st = w.inst._test.animState();
  ok(st && st.playing && st.frames === 30, "the animation autoplays by default");
  ok(btn.getAttribute("aria-label") === "Pause animation", "playing: the button offers Pause");
  ok(w.el.classList.contains("vellumwidget-anim-playing"), "playing class on the root");
  ok(rafQueue.length > 0, "playing: a progress tick is scheduled");

  // pause: the button toggles the paused state; one frame is shown by the runtime
  btn.click();
  st = w.inst._test.animState();
  ok(!st.playing, "clicking the button pauses");
  ok(btn.getAttribute("aria-label") === "Play animation", "paused: the button offers Play");
  ok(w.el.classList.contains("vellumwidget-anim-paused") && !w.el.classList.contains("vellumwidget-anim-playing"),
    "paused class replaces playing");
  ok(w.el.querySelectorAll(".vellumwidget-anim-cur").length === 1, "paused: exactly one frame is marked current");

  // the scoped stylesheet freezes the frames under the paused class
  const css = Array.prototype.map.call(w.el.querySelectorAll("style"), (s) => s.textContent).join("");
  ok(/\.vellumwidget-anim-paused \.vl1234-vf\{animation:none!important;visibility:hidden!important\}/.test(css),
    "paused: the CSS animation is switched off for this document's frames");
  ok(/\.vellumwidget-anim-playing \.vl1234-vf\{animation-name:vl1234-vc!important;animation-duration:1\.2s!important/.test(css),
    "playing: the frame animation is restated (also runs under reduced motion)");

  // scrub: seeks to the frame, shows only it, stays paused
  range.value = "12";
  range.dispatchEvent(new window.Event("input", { bubbles: true }));
  st = w.inst._test.animState();
  const frames = w.el.querySelectorAll(".vl1234-vf");
  ok(st.frame === 12 && !st.playing, "scrubbing seeks to frame 12 and stays paused");
  ok(frames[12].classList.contains("vellumwidget-anim-cur") && w.el.querySelectorAll(".vellumwidget-anim-cur").length === 1,
    "the scrubbed frame is the only one shown");
  ok(range.getAttribute("aria-valuetext") === "Frame 13 of 30", "the scrubber announces the frame");

  // scrubbing while playing pauses
  btn.click();
  ok(w.inst._test.animState().playing, "the button resumes playback");
  range.value = "3";
  range.dispatchEvent(new window.Event("input", { bubbles: true }));
  ok(!w.inst._test.animState().playing && w.inst._test.animState().frame === 3, "scrubbing during playback pauses on the frame");

  // keyboard: the button is a native button, so Enter/Space activate it; check focusability
  btn.focus();
  ok(document.activeElement === btn, "the button takes keyboard focus");
}

// --- with the Web Animations API (stubbed): play seeks every frame animation ---
{
  reduce = false;
  const w = mount(animPayload(10, 0));
  const svg = w.el.querySelector("svg");
  const anims = [];
  for (let i = 0; i < 10; i++) anims.push({ currentTime: 0, animationName: "vl1234-vc" });
  anims.push({ currentTime: 0, animationName: "other" });
  svg.getAnimations = function (o) { return o && o.subtree ? anims : []; };
  w.inst._test.animSeek(7); // pauses on frame 7
  w.inst._test.animPlay(true); // resumes from frame 7
  const t = anims[0].currentTime;
  ok(anims.slice(0, 10).every((a) => a.currentTime === t), "play sets every frame animation to the same time");
  ok(anims[10].currentTime === 0, "an unrelated animation is left alone");
  ok(Math.abs(t - (7 * 120 + 60)) < 1, "resuming from frame 7 seeks to its slot (" + t + " ms)");
  ok(w.inst._test.animState().frame === 7, "the current frame is read back from the animation time");
  anims.forEach((a) => { if (a.animationName === "vl1234-vc") a.currentTime = 3 * 120 + 10; });
  w.inst._test.animPlay(false);
  ok(w.inst._test.animState().frame === 3, "pausing keeps the frame the animation had reached");
  ok(w.el.querySelectorAll(".vl1234-vf")[3].classList.contains("vellumwidget-anim-cur"), "and shows it");
}

// --- prefers-reduced-motion: start paused on the still frame ---
{
  reduce = true;
  const w = mount(animPayload(20, 19));
  const st = w.inst._test.animState();
  const btn = w.el.querySelector("button.vellumwidget-anim-btn");
  ok(st && !st.playing, "reduced motion: starts paused");
  ok(st.frame === 19, "reduced motion: on the still (-vs) frame (" + st.frame + ")");
  ok(w.el.querySelectorAll(".vl1234-vf")[19].classList.contains("vellumwidget-anim-cur"), "reduced motion: the still frame is shown");
  ok(btn.getAttribute("aria-label") === "Play animation", "reduced motion: the button offers Play");
  ok(w.el.querySelector("input.vellumwidget-anim-range").value === "19", "reduced motion: the scrubber sits on the still frame");
  btn.click();
  ok(w.inst._test.animState().playing && w.el.classList.contains("vellumwidget-anim-playing"),
    "reduced motion: the user can still press play");
  reduce = false;
}

// --- re-render: controls are rebuilt, and dropped for a static payload ---
{
  const w = mount(animPayload(5, 0));
  w.inst.renderValue(animPayload(8, 0));
  ok(w.el.querySelectorAll(".vellumwidget-anim").length === 1, "re-render keeps one control bar");
  ok(w.el.querySelector("input.vellumwidget-anim-range").max === "7", "re-render rebuilds the scrubber for the new frames");
  w.inst.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><path data-key="k" d="M1 1h2v2z"/></svg>',
    elements: [{ key: "k" }],
    options: { tooltip: true }
  });
  ok(!w.el.querySelector(".vellumwidget-anim") && !w.el.classList.contains("vellumwidget-anim-playing"),
    "re-rendering a static plot removes the controls");
  ok(Array.prototype.every.call(w.el.querySelectorAll("style"), (s) => !/vellumwidget-anim-paused/.test(s.textContent)),
    "and its scoped stylesheet");
}

// --- pure helpers ---
{
  const info = { frames: [0, 1, 2, 3], delays: [0, 0.9, 0.6, 0.3], dur: 1.2, dt: 0.3 };
  ok(T && typeof T.animFrameAt === "function", "frameAt helper exposed");
  ok([0, 0.31, 0.65, 0.95, 1.25].map((t) => T.animFrameAt(info, t)).join(",") === "0,1,2,3,0", "frameAt follows the delays");
  ok([0, 1, 2, 3].map((k) => T.animFrameAt(info, T.animTimeOfFrame(info, k))).join(",") === "0,1,2,3", "timeOfFrame round-trips");
}

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
