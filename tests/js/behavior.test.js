// Headless behaviour test for the vellumwidget runtime: load the built inst bundle into
// a jsdom DOM, drive it with a synthetic payload, simulate hover/click, and
// assert the resulting DOM state (tooltip text, highlight + selection classes).
// Run with: node tests/js/behavior.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
// jsdom has no 2D canvas context, so getContext() emits a "Not implemented"
// jsdomError. The crisp-zoom canvas is written to tolerate a null context (it
// falls back to the base image), so that message is expected here — drop it to
// keep the test output clean, but forward anything else.
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", function (err) {
  if (!/getContext/.test(String(err && err.message))) console.error(err);
});

const BUNDLE = path.join(__dirname, "..", "..", "inst", "htmlwidgets", "vellumwidget.js");

let failures = 0;
function ok(cond, msg) {
  if (cond) {
    console.log("  ok  - " + msg);
  } else {
    failures++;
    console.log("  FAIL- " + msg);
  }
}

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  virtualConsole: virtualConsole
});
const { window } = dom;
global.window = window;
global.document = window.document;
// The runtime throttles the nearest-mark scan with a bare `requestAnimationFrame`
// (a browser global). Node has none, and jsdom puts it only on `window`, so make it
// a synchronous global here — that lets the tests drive the nearest/hover path
// (used whenever the cursor isn't directly over a mark, e.g. all of raster mode).
global.requestAnimationFrame = function (cb) { cb(0); return 0; };
global.cancelAnimationFrame = function () {};

// Capture the widget definition the bundle registers.
let widgetDef = null;
const HTMLWidgets = { widget: (def) => (widgetDef = def) };
window.HTMLWidgets = HTMLWidgets;

// Load the bundle with the browser globals it expects injected as locals (the
// bundle is a strict-mode IIFE referencing bare `HTMLWidgets`/`window`/`document`).
const code = fs.readFileSync(BUNDLE, "utf8");
new Function("HTMLWidgets", "window", "document", code)(HTMLWidgets, window, window.document);

ok(widgetDef && widgetDef.name === "vellumwidget", "bundle registers the vellumwidget widget");
ok(typeof widgetDef.factory === "function", "widget exposes a factory");

// Mount an instance.
const el = document.createElement("div");
document.body.appendChild(el);
const inst = widgetDef.factory(el, 400, 300);

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
  '<g data-vellum-panel="panel-1-1">' +
  '<path data-key="a" d="M10 10h5v5h-5z"/>' +
  '<path data-key="b" d="M40 10h5v5h-5z"/>' +
  '<path data-key="b" d="M40 10h5v5h-5z"/>' + // same datum drawn twice (fill+stroke)
  '<rect x="0" y="0" width="200" height="100" fill="none"/>' + // un-keyed decoration
  "</g></svg>";

inst.renderValue({
  svg: svg,
  elements: [
    { key: "a", tooltip: "Alpha", hover_group: "g1" },
    { key: "b", tooltip: "Beta", hover_group: "g1" }
  ],
  options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
});

const root = el;
const svgEl = el.querySelector("svg");
const aPaths = el.querySelectorAll('[data-key="a"]');
const bPaths = el.querySelectorAll('[data-key="b"]');
const tip = el.querySelector(".vellumwidget-tip");

ok(!!svgEl, "svg mounted into the widget");
ok(document.getElementById("vellumwidget-style") !== null, "namespaced <style> injected once");

function fire(type, target) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(ev, "target", { value: target, enumerable: true });
  svgEl.dispatchEvent(ev);
}

// --- hover -> tooltip + highlight (hover_group links a and b) ---
fire("pointermove", aPaths[0]);
ok(tip.textContent === "Alpha", "hover shows the element's tooltip text");
ok(tip.classList.contains("vellumwidget-show"), "tooltip becomes visible on hover");
ok(root.classList.contains("vellumwidget-hovering"), "root enters hovering mode (dims others)");
ok(aPaths[0].classList.contains("vellumwidget-hl"), "hovered element is highlighted");
ok(
  bPaths[0].classList.contains("vellumwidget-hl") && bPaths[1].classList.contains("vellumwidget-hl"),
  "all elements sharing the hover_group are highlighted"
);

// --- hover off -> clear ---
fire("pointerleave", svgEl);
ok(!tip.classList.contains("vellumwidget-show"), "tooltip hides on mouseleave");
ok(!root.classList.contains("vellumwidget-hovering"), "hovering mode cleared");
ok(el.querySelectorAll(".vellumwidget-hl").length === 0, "highlight classes cleared");

// --- click -> select. "a" and "b" share hover_group "g1", so a click projects
//     to the whole group (field projection): every path of both keys selects. ---
fire("click", bPaths[0]);
ok(
  bPaths[0].classList.contains("vellumwidget-selected") && bPaths[1].classList.contains("vellumwidget-selected"),
  "click selects every path of the clicked key"
);
ok(aPaths[0].classList.contains("vellumwidget-selected"), "click projects selection across the shared hover_group");

// --- click again -> deselect the whole projected group ---
fire("click", bPaths[0]);
ok(el.querySelectorAll(".vellumwidget-selected").length === 0, "clicking a selected element deselects the group");

// --- tooltip falls back to the key when no tooltip text is provided ---
const el2 = document.createElement("div");
document.body.appendChild(el2);
const inst2 = widgetDef.factory(el2, 100, 100);
inst2.renderValue({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><path data-key="k9" d="M1 1h2v2z"/></svg>',
  elements: [{ key: "k9" }],
  options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
});
const svg2 = el2.querySelector("svg");
const ev2 = new window.MouseEvent("pointermove", { bubbles: true });
Object.defineProperty(ev2, "target", { value: el2.querySelector('[data-key="k9"]') });
svg2.dispatchEvent(ev2);
ok(el2.querySelector(".vellumwidget-tip").textContent === "k9", "tooltip defaults to the data key");

// ===================== Phase 4: geometry helpers (pure) =====================
const T = window.__vellumwidgetTest;
ok(!!T, "pure geometry helpers exposed for testing");

ok(T.rectsIntersect({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 1, y0: 1, x1: 3, y1: 3 }), "rectsIntersect: overlap");
ok(!T.rectsIntersect({ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 2, y0: 2, x1: 3, y1: 3 }), "rectsIntersect: disjoint");

const els = [
  { key: "a", x0: 0, y0: 0, x1: 10, y1: 10 },
  { key: "b", x0: 50, y0: 50, x1: 60, y1: 60 },
  { key: "c", x0: 5, y0: 5, x1: 15, y1: 15 }
];
ok(
  JSON.stringify(T.brushKeys(els, { x0: -1, y0: -1, x1: 12, y1: 12 }).sort()) === JSON.stringify(["a", "c"]),
  "brushKeys: selects elements intersecting the brush (a, c)"
);
ok(T.brushKeys(els, { x0: 100, y0: 100, x1: 200, y1: 200 }).length === 0, "brushKeys: empty when nothing intersects");

ok(T.nearestKey(els, 55, 55, 100) === "b", "nearestKey: point inside b -> b");
ok(T.nearestKey(els, 200, 200, 5) === null, "nearestKey: nothing within radius -> null");

// ===================== tooltip sanitizer (safe HTML) =====================
ok(T.sanitizeTip("line1<br>line2") === "line1<br>line2", "sanitizeTip: <br> is allowed");
ok(T.sanitizeTip("<b>x</b>") === "<b>x</b>", "sanitizeTip: <b></b> is allowed");
ok(T.sanitizeTip("a & b < c") === "a &amp; b &lt; c", "sanitizeTip: bare &, < are escaped");
ok(
  T.sanitizeTip("<script>alert(1)</script>").indexOf("<script") === -1,
  "sanitizeTip: <script> is neutralised"
);
ok(
  T.sanitizeTip('<span onclick="x()">y</span>').indexOf("<span") === -1,
  "sanitizeTip: a tag carrying attributes stays escaped (no injection)"
);
ok(
  T.sanitizeTip('<img src=x onerror="alert(1)">').indexOf("<img") === -1,
  "sanitizeTip: disallowed tag (img) stays escaped"
);

// tooltip renders as HTML in the DOM (bold + line break)
{
  const elH = document.createElement("div");
  document.body.appendChild(elH);
  const iH = widgetDef.factory(elH, 200, 100);
  iH.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path data-key="h" d="M10 10h5v5h-5z"/></svg>',
    elements: [{ key: "h", tooltip: "Name: <b>Bob</b><br>Age: 30" }],
    options: { tooltip: true, hover: true }
  });
  fireOn(elH.querySelector("svg"), "pointermove", elH.querySelector('[data-key="h"]'));
  const tipH = elH.querySelector(".vellumwidget-tip");
  ok(tipH.querySelector("b") !== null, "tooltip renders <b> as a real element");
  ok(tipH.innerHTML.indexOf("<br>") !== -1, "tooltip renders <br> as a line break");
}
ok(T.nearestKey(els, 12, 12, 100) === "a" || T.nearestKey(els, 12, 12, 100) === "c", "nearestKey: picks a nearby element");

const vb = T.parseViewBox("0 0 200 100");
ok(vb && vb.w === 200 && vb.h === 100, "parseViewBox parses 'x y w h'");
const zvb = T.zoomViewBox(vb, 2, 100, 50);
ok(zvb.w === 100 && zvb.h === 50, "zoomViewBox halves extent at factor 2");
ok(Math.abs(zvb.x - 50) < 1e-9 && Math.abs(zvb.y - 25) < 1e-9, "zoomViewBox keeps the anchor point fixed");
ok(T.parseViewBox("garbage") === null, "parseViewBox rejects malformed input");

const ub = T.unionBbox(els, { a: true, b: true });
ok(ub.x0 === 0 && ub.y0 === 0 && ub.x1 === 60 && ub.y1 === 60, "unionBbox spans the selected keys");

// ===================== Phase 4: toolbar + zoom DOM wiring =====================
const el3 = document.createElement("div");
document.body.appendChild(el3);
const inst3 = widgetDef.factory(el3, 200, 100);
inst3.renderValue({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<path data-key="a" d="M0 0h10v10z"/><path data-key="b" d="M50 50h10v10z"/></svg>',
  elements: [
    { key: "a", tooltip: "A", x0: 0, y0: 0, x1: 10, y1: 10 },
    { key: "b", tooltip: "B", x0: 50, y0: 50, x1: 60, y1: 60 }
  ],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true,
    toolbar: true, nearest: true, selectMode: "multiple"
  }
});
const svg3 = el3.querySelector("svg");
const toolbar = el3.querySelector(".vellumwidget-toolbar");
ok(!!toolbar, "toolbar is rendered");
ok(!!el3.querySelector(".vellumwidget-brush"), "brush overlay element exists");
ok(el3.querySelectorAll(".vellumwidget-toolbar button").length >= 5, "toolbar has the expected buttons");

// mode toggle -> pan
const modeBtn = el3.querySelector('.vellumwidget-toolbar [data-act="mode"]');
ok(!!modeBtn, "mode toggle button present");
// With brush + lasso + pan all enabled (defaults), the button cycles
// brush -> lasso -> pan -> brush.
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(el3.classList.contains("vellumwidget-mode-lasso"), "mode cycle: brush -> lasso");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(el3.classList.contains("vellumwidget-mode-pan") && !el3.classList.contains("vellumwidget-mode-lasso"), "mode cycle: lasso -> pan");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!el3.classList.contains("vellumwidget-mode-pan") && !el3.classList.contains("vellumwidget-mode-lasso"), "mode cycle: pan -> brush");

// wheel zoom shrinks the viewBox; reset restores it
const before = svg3.getAttribute("viewBox");
const wheel = new window.WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, clientX: 0, clientY: 0 });
Object.defineProperty(wheel, "target", { value: svg3 });
svg3.dispatchEvent(wheel);
const after = T.parseViewBox(svg3.getAttribute("viewBox"));
ok(after && after.w < 200, "wheel zoom-in shrinks the viewBox width");
el3.querySelector('.vellumwidget-toolbar [data-act="reset"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(svg3.getAttribute("viewBox") === before, "reset restores the original viewBox");

// ===================== touch: pinch-zoom + keyboard pan =====================
function firePointer(target, type, id, clientX, clientY, onWindow) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: clientX, clientY: clientY });
  Object.defineProperty(ev, "pointerId", { value: id });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "target", { value: target });
  (onWindow ? window : target).dispatchEvent(ev);
}
ok(el3.classList.contains("vellumwidget-gesture"), "gesture class set (touch-action:none) when zoom/brush on");
const vbPre = T.parseViewBox(svg3.getAttribute("viewBox"));
// two fingers down 40px apart, then spread to 80px -> zoom in (viewBox shrinks)
firePointer(svg3, "pointerdown", 1, 80, 50);
firePointer(svg3, "pointerdown", 2, 120, 50);
firePointer(svg3, "pointermove", 2, 160, 50, true);
const vbPinch = T.parseViewBox(svg3.getAttribute("viewBox"));
ok(vbPinch.w < vbPre.w, "two-finger spread pinch-zooms in (viewBox shrinks)");
firePointer(svg3, "pointerup", 1, 80, 50, true);
firePointer(svg3, "pointerup", 2, 160, 50, true);

// keyboard: ArrowRight pans the viewBox in +x; 0 resets
const vbBeforeKey = T.parseViewBox(svg3.getAttribute("viewBox"));
el3.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
ok(T.parseViewBox(svg3.getAttribute("viewBox")).x > vbBeforeKey.x, "ArrowRight pans the viewBox right");
el3.dispatchEvent(new window.KeyboardEvent("keydown", { key: "0", bubbles: true }));
ok(svg3.getAttribute("viewBox") === before, "key 0 resets the viewBox");

// ===================== export: copy-PNG button (feature-detected) =====================
// jsdom has no Clipboard API, so the copy button is (correctly) absent. The
// positive path (button present when navigator.clipboard.write + ClipboardItem
// exist) is a trivial feature-detect exercised in real browsers.
ok(!el3.querySelector('.vellumwidget-toolbar [data-act="copy"]'), "copy button absent when the Clipboard API is unavailable");
ok(!!el3.querySelector('.vellumwidget-toolbar [data-act="png"]'), "PNG download button always present");

// ===================== large-N: node cache serves a hover =====================
{
  const N = 4000;
  let svgN = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">';
  const elemsN = [];
  for (let i = 0; i < N; i++) {
    const x = i % 200, y = Math.floor(i / 200);
    svgN += '<path data-key="p' + i + '" d="M' + x + " " + y + 'h1v1z"/>';
    elemsN.push({ key: "p" + i, tooltip: "pt " + i, x0: x, y0: y, x1: x + 1, y1: y + 1 });
  }
  svgN += "</svg>";
  const elN = document.createElement("div");
  document.body.appendChild(elN);
  widgetDef.factory(elN, 200, 200).renderValue({
    svg: svgN, elements: elemsN,
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const target = elN.querySelector('[data-key="p2500"]');
  fireOn(elN.querySelector("svg"), "pointermove", target);
  ok(target.classList.contains("vellumwidget-hl"), "large-N: hover over a mark highlights it (via node cache)");
  // brushKeys still correct at scale (pure helper unchanged)
  const picked = T.brushKeys(elemsN, { x0: 0.2, y0: 0.2, x1: 1.5, y1: 0.5 });
  ok(picked.indexOf("p0") !== -1 && picked.indexOf("p1") !== -1 && picked.indexOf("p3000") === -1,
    "large-N: brushKeys selects the overlapping marks and excludes far ones");
}

// ===================== styling: widget theme (Option 1) =====================
const elS = document.createElement("div");
document.body.appendChild(elS);
widgetDef.factory(elS, 100, 100).renderValue({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><path data-key="a" d="M1 1h9v9z"/></svg>',
  elements: [{ key: "a", x0: 1, y0: 1, x1: 10, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple",
    style: { hoverColor: "#ff0000", selectedColor: "#00ff00", dimOpacity: 0.5 }
  }
});
ok(elS.style.getPropertyValue("--vellumwidget-dim-opacity") === "0.5", "theme: dim-opacity var set on root");
ok(elS.style.getPropertyValue("--vellumwidget-hl-stroke") === "#ff0000", "theme: hover-stroke var set on root");
ok(elS.style.getPropertyValue("--vellumwidget-selected-stroke") === "#00ff00", "theme: selected-stroke var set on root");
ok(elS.classList.contains("vellumwidget-hc-all"), "theme: hover colour enables the widget-wide hover-stroke rule");

// ===================== styling: per-element grammar (Option 2) =====================
const elP = document.createElement("div");
document.body.appendChild(elP);
widgetDef.factory(elP, 100, 100).renderValue({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">' +
    '<path data-key="a" d="M1 1h9v9z"/><path data-key="b" d="M20 20h9v9z"/></svg>',
  elements: [
    { key: "a", hover_color: "#123456", selected_color: "#654321", x0: 1, y0: 1, x1: 10, y1: 10 },
    { key: "b", x0: 20, y0: 20, x1: 29, y1: 29 } // no per-element style
  ],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple"
  }
});
const pa = elP.querySelector('[data-key="a"]');
const pb2 = elP.querySelector('[data-key="b"]');
ok(pa.style.getPropertyValue("--vellumwidget-hl-stroke") === "#123456", "per-element: hover-stroke var set on the element");
ok(pa.classList.contains("vellumwidget-hc"), "per-element: element opts into the hover-stroke rule");
ok(pa.style.getPropertyValue("--vellumwidget-selected-stroke") === "#654321", "per-element: selected-stroke var set on the element");
ok(pb2.style.getPropertyValue("--vellumwidget-hl-stroke") === "", "per-element: unstyled element gets no override");
ok(!pb2.classList.contains("vellumwidget-hc"), "per-element: unstyled element does not opt into the hover-stroke rule");
ok(!elP.classList.contains("vellumwidget-hc-all"), "per-element: no widget-wide rule when only some elements are styled");

// ===================== linking: own cross-widget bus (Option group) =====================
function mount(opts) {
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 100, 100);
  inst.renderValue(opts);
  return e;
}
function fireOn(svg, type, target, extra) {
  const ev = new window.MouseEvent(type, Object.assign({ bubbles: true }, extra || {}));
  Object.defineProperty(ev, "target", { value: target });
  svg.dispatchEvent(ev);
}
const svg2paths =
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30">' +
  '<path data-key="x" d="M1 1h9v9z"/><path data-key="y" d="M40 1h9v9z"/></svg>';

const linkOpts = () => ({
  svg: svg2paths,
  elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple", group: "L1"
  }
});
const elA = mount(linkOpts());
const elB = mount(linkOpts());
// click "x" in A -> B reflects the same selection (linked by data-key)
fireOn(elA.querySelector("svg"), "click", elA.querySelector('[data-key="x"]'));
ok(elA.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "own bus: local selection applied in A");
ok(elB.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "own bus: selection linked into B");
ok(!elB.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"), "own bus: only the linked key is selected in B");

// ===================== selection projection by field (hover_group) =====================
const elG = mount({
  svg: svg2paths,
  elements: [
    { key: "x", hover_group: "g", x0: 1, y0: 1, x1: 10, y1: 10 },
    { key: "y", hover_group: "g", x0: 40, y0: 1, x1: 49, y1: 10 }
  ],
  options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
});
fireOn(elG.querySelector("svg"), "click", elG.querySelector('[data-key="x"]'));
ok(
  elG.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected") &&
    elG.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"),
  "field projection: clicking one selects the whole hover_group"
);

// ===================== crosstalk bridge (selection + filter) =====================
(function () {
  const chans = {};
  function ch(group, kind) {
    chans[group] = chans[group] || { selection: [], filter: [] };
    return chans[group][kind];
  }
  function Handle(group, kind) {
    this._ls = [];
    ch(group, kind).push(this);
    const self = this;
    this.on = function (t, cb) { self._ls.push(cb); };
    this.closed = false;
    this.close = function () {
      self.closed = true; self._ls = [];
      const arr = ch(group, kind); const i = arr.indexOf(self); if (i >= 0) arr.splice(i, 1);
    };
    this.set = function (v) {
      ch(group, kind).forEach(function (h) {
        h._ls.forEach(function (cb) { cb({ value: v, sender: self }); });
      });
    };
  }
  window.crosstalk = {
    SelectionHandle: function (g) { Handle.call(this, g, "selection"); },
    FilterHandle: function (g) { Handle.call(this, g, "filter"); },
    _ch: ch
  };
})();

const elC = mount({
  svg: svg2paths,
  elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple", crosstalk: "G"
  }
});
// local select -> pushed to the crosstalk selection channel
fireOn(elC.querySelector("svg"), "click", elC.querySelector('[data-key="y"]'));
const selVal = window.crosstalk._ch("G", "selection")[0]._ls; // ensure handle exists
ok(window.crosstalk._ch("G", "selection").length >= 1, "crosstalk: widget created a SelectionHandle in the group");
// incoming selection from a peer handle -> applied in the widget
const peerSel = new window.crosstalk.SelectionHandle("G");
peerSel.set(["x"]);
ok(elC.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "crosstalk: incoming selection highlights the key");
ok(!elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"), "crosstalk: incoming selection replaces the prior one");
// incoming filter -> non-matching elements hidden (display-tier cross-filter)
const peerFilt = new window.crosstalk.FilterHandle("G");
peerFilt.set(["x"]);
ok(elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-filtered"), "crosstalk: filter hides the non-matching element");
ok(!elC.querySelector('[data-key="x"]').classList.contains("vellumwidget-filtered"), "crosstalk: filter keeps the matching element");
peerFilt.set(null);
ok(!elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-filtered"), "crosstalk: null filter clears the cross-filter");

// ===================== linking lifecycle: group change + removal (VW-5) =====================
const asyncChecks = []; // run after the synchronous suite (MutationObserver callbacks are microtasks)
{
  const TB = window.__vellumwidgetTest;
  const lopts = (group, ct) => {
    const o = linkOpts();
    o.options = Object.assign({}, o.options, { group: group, crosstalk: ct });
    return o;
  };
  const mk = (group, ct) => {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 100, 100);
    i.renderValue(lopts(group, ct));
    return { el: e, inst: i };
  };
  const isSel = (w, k) => w.el.querySelector('[data-key="' + k + '"]').classList.contains("vellumwidget-selected");
  const click = (w, k) => fireOn(w.el.querySelector("svg"), "click", w.el.querySelector('[data-key="' + k + '"]'));
  const wA = mk("VW5a"), wB = mk("VW5a"), wC = mk("VW5b");
  ok(TB.bus.VW5a.length === 2 && TB.bus.VW5b.length === 1, "linking lifecycle: widgets join their groups");
  wB.inst.renderValue(lopts("VW5a")); // same group again: no duplicate membership
  ok(TB.bus.VW5a.length === 2, "linking lifecycle: a re-render in the same group does not join twice");
  wB.inst.renderValue(lopts("VW5b")); // Shiny re-render with a new group
  ok(TB.bus.VW5a.length === 1 && TB.bus.VW5b.length === 2, "linking lifecycle: a group change leaves the old group and joins the new one");
  click(wA, "x");
  ok(!isSel(wB, "x"), "linking lifecycle: the old group's selections no longer reach the widget");
  click(wC, "y");
  ok(isSel(wB, "y"), "linking lifecycle: the new group's selections do");
  // Crosstalk: a changed group closes the old handles and opens new ones.
  const wX = mk(null, "VW5ct1");
  const oldSel = window.crosstalk._ch("VW5ct1", "selection")[0];
  wX.inst.renderValue(lopts(null, "VW5ct2"));
  ok(oldSel.closed && window.crosstalk._ch("VW5ct1", "selection").length === 0 && window.crosstalk._ch("VW5ct2", "selection").length === 1,
    "linking lifecycle: a crosstalk group change closes the old handles and opens new ones");
  const peerX = new window.crosstalk.SelectionHandle("VW5ct2");
  peerX.set(["y"]);
  peerX.close();
  ok(isSel(wX, "y"), "linking lifecycle: the new crosstalk group's selection is applied");
  // Removal: the element leaves the page -> bus membership and crosstalk handles are freed.
  wB.el.remove();
  wX.el.remove();
  asyncChecks.push(function () {
    ok(TB.bus.VW5b.length === 1, "linking lifecycle: a removed widget is dropped from the bus");
    ok(window.crosstalk._ch("VW5ct2", "selection").length === 0 && window.crosstalk._ch("VW5ct2", "filter").length === 0,
      "linking lifecycle: a removed widget's crosstalk handles are closed");
    click(wC, "x"); // publishing to the group still works for the remaining member
    ok(isSel(wC, "x"), "linking lifecycle: the remaining member keeps working");
    wA.el.remove();
  });
  asyncChecks.push(function () {
    ok(TB.bus.VW5a === undefined, "linking lifecycle: an emptied group is deleted from the bus");
  });
}

// ===================== legend interaction =====================
const elL = mount({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="30" viewBox="0 0 90 30">' +
    '<path data-key="p1" d="M1 1h5v5z"/><path data-key="p2" d="M10 1h5v5z"/>' +
    '<path data-key="q1" d="M20 1h5v5z"/>' +
    '<path data-key="legend:color:s" d="M70 1h5v5z"/>' +
    '<path data-key="legend:color:t" d="M70 12h5v5z"/></svg>',
  elements: [
    { key: "p1", legend: ["color:s"], x0: 1, y0: 1, x1: 6, y1: 6 },
    { key: "p2", legend: ["color:s"], x0: 10, y0: 1, x1: 15, y1: 6 },
    { key: "q1", legend: ["color:t"], x0: 20, y0: 1, x1: 25, y1: 6 },
    { key: "legend:color:s", legend_for: "color:s", tooltip: "s", x0: 70, y0: 1, x1: 75, y1: 6 },
    { key: "legend:color:t", legend_for: "color:t", tooltip: "t", x0: 70, y0: 12, x1: 75, y1: 17 }
  ],
  options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: false, selectMode: "multiple" }
});
const swatchS = elL.querySelector('[data-key="legend:color:s"]');
ok(!!swatchS, "legend swatch element is present with its colon key");
ok(swatchS.classList.contains("vellumwidget-legend"), "legend swatch is tagged vellumwidget-legend (stays visible on hover)");
// hover the "s" swatch -> its whole series (p1, p2) highlights, but not q1
fireOn(elL.querySelector("svg"), "pointermove", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("vellumwidget-hl") &&
    elL.querySelector('[data-key="p2"]').classList.contains("vellumwidget-hl"),
  "hovering a legend swatch highlights its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("vellumwidget-hl"), "other series is not highlighted");
fireOn(elL.querySelector("svg"), "pointerleave", elL.querySelector("svg"));
// click the "s" swatch -> selects the series
fireOn(elL.querySelector("svg"), "click", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("vellumwidget-selected") &&
    elL.querySelector('[data-key="p2"]').classList.contains("vellumwidget-selected"),
  "clicking a legend swatch selects its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("vellumwidget-selected"), "other series is not selected");

// ===================== accessibility (a11y): SR + keyboard =====================
{
  const elA11y = mount({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30">' +
      '<path data-key="x" d="M1 1h9v9z"/><path data-key="y" d="M40 1h9v9z"/></svg>',
    elements: [
      { key: "x", tooltip: "Point <b>X</b>", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "y", tooltip: "Point Y", x0: 40, y0: 1, x1: 49, y1: 10 }
    ],
    options: {
      tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
      nearest: true, a11y: true, selectMode: "multiple"
    }
  });
  const svgA = elA11y.querySelector("svg");
  const xNode = elA11y.querySelector('[data-key="x"]');
  const yNode = elA11y.querySelector('[data-key="y"]');

  ok(svgA.getAttribute("role") === "graphics-document", "a11y: svg is a graphics-document (not role=img)");
  ok(svgA.getAttribute("aria-roledescription") === "interactive chart", "a11y: svg has an interactive-chart roledescription");
  ok(svgA.getAttribute("aria-label") === "Interactive chart", "a11y: svg gets a generic name when none supplied");
  ok(xNode.getAttribute("role") === "graphics-symbol", "a11y: a mark is a graphics-symbol");
  ok(xNode.getAttribute("aria-label") === "Point X", "a11y: mark aria-label is its tooltip with tags stripped");
  ok(xNode.getAttribute("tabindex") === "0", "a11y: first mark holds the roving tabindex (0)");
  ok(yNode.getAttribute("tabindex") === "-1", "a11y: other marks are -1 (roving tabindex)");

  const live = elA11y.querySelector('[aria-live="polite"]');
  ok(!!live, "a11y: an aria-live announcer is present");
  const table = elA11y.querySelector("table.vellumwidget-data-table");
  ok(!!table, "a11y: a hidden data table is present");
  ok(table.querySelectorAll("tr").length === 3, "a11y: data table has a header + one row per mark");
  ok(table.textContent.indexOf("Point Y") !== -1, "a11y: data table lists a mark's description");

  // focus a mark -> announced, focus ring on
  xNode.dispatchEvent(new window.FocusEvent("focus", { bubbles: false }));
  ok(xNode.classList.contains("vellumwidget-focus"), "a11y: focusing a mark draws the focus ring");
  ok(live.textContent === "Point X", "a11y: focusing a mark announces its label");

  // ArrowRight -> roving tabindex moves to the next mark
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(yNode.getAttribute("tabindex") === "0" && xNode.getAttribute("tabindex") === "-1",
    "a11y: ArrowRight moves the roving tabindex to the next mark");
  ok(live.textContent === "Point Y", "a11y: arrow navigation announces the newly focused mark");

  // Enter -> selects the focused mark, announced
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(yNode.classList.contains("vellumwidget-selected"), "a11y: Enter selects the focused mark");
  ok(live.textContent.indexOf("selected") !== -1, "a11y: selection is announced");

  // a11y OFF -> no chart role override, no focusable marks, no table
  const elOff = mount({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" role="img"><path data-key="x" d="M1 1h9v9z"/></svg>',
    elements: [{ key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 }],
    options: { tooltip: true, hover: true, select: true, a11y: false, selectMode: "multiple" }
  });
  ok(elOff.querySelector("svg").getAttribute("role") === "img", "a11y off: svg role is left untouched");
  ok(elOff.querySelector('[data-key="x"]').getAttribute("tabindex") === null, "a11y off: marks are not focusable");
  ok(!elOff.querySelector("table.vellumwidget-data-table"), "a11y off: no data table is built");

  // as_widget(alt=) must win over vellum's inherited <title>/<desc>: vellum labels
  // the SVG with aria-labelledby, which outranks aria-label, so the widget must
  // drop it for the explicit alt to become the accessible name.
  const elAlt = mount({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" role="img" aria-labelledby="p-t p-d">' +
      '<title id="p-t">Auto title</title><desc id="p-d">Auto description.</desc>' +
      '<path data-key="x" d="M1 1h9v9z"/></svg>',
    elements: [{ key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 }],
    options: { tooltip: true, hover: true, select: true, a11y: true, alt: "My explicit alt.", selectMode: "multiple" }
  });
  const svgAlt = elAlt.querySelector("svg");
  ok(svgAlt.getAttribute("aria-label") === "My explicit alt.", "alt: explicit alt becomes the aria-label");
  ok(svgAlt.getAttribute("aria-labelledby") === null, "alt: vellum's aria-labelledby is removed so alt wins the accessible name");

  // roving tabindex skips marks hidden by a cross-filter. Drive the real filter
  // path (_call("filter", showKeys)) rather than poking the class, so the runtime's
  // filtered-key state (which the skip now consults) is populated.
  const elFdiv = document.createElement("div");
  document.body.appendChild(elFdiv);
  const instF = widgetDef.factory(elFdiv);
  instF.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 30">' +
      '<path data-key="a" d="M1 1h9v9z"/><path data-key="b" d="M30 1h9v9z"/><path data-key="c" d="M60 1h9v9z"/></svg>',
    elements: [
      { key: "a", tooltip: "A", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "b", tooltip: "B", x0: 30, y0: 1, x1: 39, y1: 10 },
      { key: "c", tooltip: "C", x0: 60, y0: 1, x1: 69, y1: 10 }
    ],
    options: { tooltip: true, hover: true, select: true, a11y: true, selectMode: "multiple" }
  });
  const svgF = elFdiv.querySelector("svg");
  const aN = elFdiv.querySelector('[data-key="a"]');
  const bN = elFdiv.querySelector('[data-key="b"]');
  const cN = elFdiv.querySelector('[data-key="c"]');
  instF._call("filter", ["a", "c"]); // cross-filter hiding "b"
  ok(bN.classList.contains("vellumwidget-filtered"), "a11y: filter hides 'b' via the real filter path");
  aN.dispatchEvent(new window.FocusEvent("focus", { bubbles: false })); // cursor on "a"
  svgF.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(cN.getAttribute("tabindex") === "0" && bN.getAttribute("tabindex") !== "0",
    "a11y: ArrowRight skips a cross-filtered (hidden) mark");
}

// ===================== Shiny read-back (input bindings) =====================
// The bundle reads HTMLWidgets.shinyMode + window.Shiny lazily at emit time, so
// we drive them from the harness. el.id stands in for the Shiny outputId.
const shinyElements = [
  { key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 },
  { key: "y", tooltip: "Y", x0: 40, y0: 1, x1: 49, y1: 10 }
];
function mountShiny(id, calls) {
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  HTMLWidgets.shinyMode = true;
  const e = document.createElement("div");
  e.id = id;
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 100, 100);
  inst.renderValue({
    svg: svg2paths,
    elements: shinyElements,
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
  });
  return e;
}
{
  const calls = [];
  const e = mountShiny("myplot", calls);
  const svgE = e.querySelector("svg");
  const last = (name) => calls.filter((c) => c.id === "myplot_" + name).pop();

  ok(!!last("selected") && last("selected").v.length === 0, "shiny: initial render pushes an empty _selected");

  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="x"]'));
  ok(last("selected") && JSON.stringify(last("selected").v) === JSON.stringify(["x"]),
    "shiny: clicking a mark pushes _selected = [key]");
  ok(!(last("selected").o && last("selected").o.priority === "event"),
    "shiny: _selected is deduped state (no priority:event)");

  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="x"]')); // toggle off
  ok(last("selected") && last("selected").v.length === 0, "shiny: toggling a mark off pushes empty _selected");

  // _click: discrete event, carries the key + priority:"event"
  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="y"]'));
  ok(last("click") && last("click").v.key === "y" && last("click").o && last("click").o.priority === "event",
    "shiny: click pushes _click = {key} with priority:event");

  // _hover: deduped, carries the hovered key
  calls.length = 0;
  fireOn(svgE, "pointermove", e.querySelector('[data-key="x"]'));
  ok(last("hover") && last("hover").v === "x", "shiny: hover pushes _hover = key");
  ok(!(last("hover").o && last("hover").o.priority === "event"), "shiny: _hover is deduped (no priority:event)");

  // _brush: a completed brush drag emits {keys, rect} as an event
  calls.length = 0;
  firePointer(svgE, "pointerdown", 1, 5, 5);
  firePointer(svgE, "pointermove", 1, 55, 25, true);
  firePointer(svgE, "pointerup", 1, 55, 25, true);
  ok(last("brush") && Array.isArray(last("brush").v.keys) && typeof last("brush").v.x0 === "number" &&
    last("brush").o && last("brush").o.priority === "event",
    "shiny: brush pushes _brush = {keys, x0..x1} with priority:event");

  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}
// non-Shiny safety: shinyMode off -> zero Shiny calls even if window.Shiny exists
{
  const calls = [];
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  const e = mount({ svg: svg2paths, elements: shinyElements, options: { select: true } });
  fireOn(e.querySelector("svg"), "click", e.querySelector('[data-key="x"]'));
  ok(calls.length === 0, "shiny: no Shiny calls when shinyMode is off (static / knitr safe)");
  delete window.Shiny;
}

// ===================== server -> client proxy (vellumwidget_proxy) =====================
// The instance exposes `_call(method, args)`, the seam vellumwidget_proxy() drives via
// the "vellumwidget-calls" custom message. Exercise each verb's DOM effect directly.
{
  const eP = document.createElement("div");
  document.body.appendChild(eP);
  const iP = widgetDef.factory(eP, 60, 30);
  iP.renderValue({
    svg: svg2paths, // keys x, y with a 0 0 60 30 viewBox
    elements: [
      { key: "x", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }
    ],
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
  });
  const svgP = eP.querySelector("svg");
  const px = eP.querySelector('[data-key="x"]');
  const py = eP.querySelector('[data-key="y"]');
  ok(typeof iP._call === "function", "proxy: instance exposes the _call seam");

  // select -> the given keys become selected (server-driven, no click)
  iP._call("select", ["x"]);
  ok(px.classList.contains("vellumwidget-selected"), "proxy: select() selects the given key");
  ok(!py.classList.contains("vellumwidget-selected"), "proxy: select() leaves other keys unselected");

  // select with a scalar arg (Shiny may auto-unbox a length-1 vector) still works
  iP._call("select", "y");
  ok(py.classList.contains("vellumwidget-selected") && !px.classList.contains("vellumwidget-selected"),
    "proxy: select() accepts a scalar (auto-unboxed) key and replaces the selection");

  // clearSelection -> nothing selected
  iP._call("clearSelection");
  ok(eP.querySelectorAll(".vellumwidget-selected").length === 0, "proxy: clearSelection() clears the selection");

  // filter -> keys not in the show set are marked filtered (display tier)
  iP._call("filter", ["x"]);
  ok(py.classList.contains("vellumwidget-filtered"), "proxy: filter() hides keys outside the show set");
  ok(!px.classList.contains("vellumwidget-filtered"), "proxy: filter() keeps keys in the show set");

  // clearFilter -> filter removed
  iP._call("clearFilter");
  ok(eP.querySelectorAll(".vellumwidget-filtered").length === 0, "proxy: clearFilter() removes the filter");

  // zoom -> the viewBox shrinks to frame the requested key
  const vbFull = svgP.getAttribute("viewBox");
  iP._call("zoom", ["x"]);
  const vbZoom = T.parseViewBox(svgP.getAttribute("viewBox"));
  ok(vbZoom && vbZoom.w < 60, "proxy: zoom() frames the key (viewBox shrinks)");

  // resetZoom -> back to the original view
  iP._call("resetZoom");
  ok(svgP.getAttribute("viewBox") === vbFull, "proxy: resetZoom() restores the original viewBox");

  // zoom with empty keys resets to the full view
  iP._call("zoom", ["x"]);
  iP._call("zoom", []);
  ok(svgP.getAttribute("viewBox") === vbFull, "proxy: zoom([]) resets to the full view");

  // unknown method is ignored (forward-compatible), no throw
  let threw = false;
  try { iP._call("no_such_method", ["x"]); } catch (e) { threw = true; }
  ok(!threw, "proxy: an unknown method is ignored without throwing");
}

// dispatchProxyCall routes a message to the instance resolved by id.
{
  const seen = [];
  const fakeInst = { _call: (m, a) => seen.push({ m: m, a: a }) };
  const find = (id) => (id === "#plot" ? fakeInst : null);
  T.dispatchProxyCall({ id: "plot", method: "select", args: ["a", "b"] }, (id) => find("#" + id));
  ok(seen.length === 1 && seen[0].m === "select" && JSON.stringify(seen[0].a) === '["a","b"]',
    "dispatchProxyCall: routes method+args to the matched instance's _call");
  // unknown id -> no-op (no instance found)
  T.dispatchProxyCall({ id: "missing", method: "select", args: [] }, (id) => find("#" + id));
  ok(seen.length === 1, "dispatchProxyCall: unknown id is a no-op");
  // malformed message -> no-op, no throw
  let dThrew = false;
  try { T.dispatchProxyCall(null, () => null); T.dispatchProxyCall({}, () => null); } catch (e) { dThrew = true; }
  ok(!dThrew, "dispatchProxyCall: a null / id-less message is a safe no-op");
}

// The proxy finds its widget by an escaped id selector (VW-7): Shiny module ids
// carry "." or ":"; a bare "#"+id selector would miss them (or throw).
{
  const P = T.cssEscapePolyfill;
  ok(P("plot") === "plot" && P("mod.plot") === "mod\\.plot" && P("a:b") === "a\\:b",
    "cssEscape fallback: escapes '.' and ':'");
  ok(P("1x") === "\\31 x" && P("-1") === "-\\31 " && P("-") === "\\-" && P("a b#c") === "a\\ b\\#c" && P("\u0000") === "�",
    "cssEscape fallback: leading digits, a lone hyphen, spaces and NUL follow the CSSOM algorithm");
  const hadCSS = window.CSS;
  window.CSS = undefined; // jsdom may or may not ship CSS.escape: exercise the fallback path
  ok(T.idSelector("mod-a.plot:1") === "#mod-a\\.plot\\:1", "idSelector: falls back when CSS.escape is unavailable");
  window.CSS = { escape: (v) => "ESC(" + v + ")" };
  ok(T.idSelector("x.y") === "#ESC(x.y)", "idSelector: uses CSS.escape when available");
  window.CSS = hadCSS;
  const host = document.createElement("div");
  host.id = "mod-a.plot:1";
  document.body.appendChild(host);
  const seenP = [];
  HTMLWidgets.find = (sel) => (document.querySelector(sel) === host ? { _call: (m, a) => seenP.push([m, a]) } : null);
  T.dispatchProxyCall({ id: "mod-a.plot:1", method: "select", args: ["k"] }, T.findWidgetById);
  ok(seenP.length === 1 && seenP[0][0] === "select", "proxy: a widget whose id has '.' and ':' is found and driven");
  delete HTMLWidgets.find;
  host.remove();
}

// The "vellumwidget-calls" handler is registered once when Shiny is present.
{
  const handlers = {};
  window.Shiny = {
    setInputValue: () => {},
    addCustomMessageHandler: (t, cb) => { handlers[t] = cb; }
  };
  HTMLWidgets.shinyMode = true;
  // The bundle registers at load (before Shiny existed here) and again on render;
  // a render now, with Shiny present, wires the handler up.
  const eH = document.createElement("div");
  eH.id = "plotH";
  document.body.appendChild(eH);
  const iH = widgetDef.factory(eH, 60, 30);
  HTMLWidgets.find = (sel) => (sel === "#plotH" ? iH : null);
  iH.renderValue({
    svg: svg2paths,
    elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
    options: { select: true, selectMode: "multiple" }
  });
  ok(typeof handlers["vellumwidget-calls"] === "function", "proxy: 'vellumwidget-calls' handler registered under Shiny");
  handlers["vellumwidget-calls"]({ id: "plotH", method: "select", args: ["y"] });
  ok(eH.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"),
    "proxy: a 'vellumwidget-calls' message drives the resolved widget");
  delete HTMLWidgets.find;
  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}

// ============ keyed statistical marks (error bars & boxplots) ============
// A statistical mark draws several SVG elements sharing ONE data-key (an error
// bar = vertical bar + two caps; a box = rect + median + whiskers). They must
// hover, tooltip, and select as one unit, and the brush key list must not
// double-count a key that spans several elements.
{
  const eb = document.createElement("div");
  document.body.appendChild(eb);
  const iEb = widgetDef.factory(eb, 200, 100);
  const ebSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<line data-key="eb1" x1="30" y1="20" x2="30" y2="80"/>' + // bar
    '<line data-key="eb1" x1="25" y1="80" x2="35" y2="80"/>' + // lower cap
    '<line data-key="eb1" x1="25" y1="20" x2="35" y2="20"/>' + // upper cap
    '<line data-key="eb2" x1="90" y1="30" x2="90" y2="70"/>' +
    "</g></svg>";
  iEb.renderValue({
    svg: ebSvg,
    elements: [
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 20, x1: 35, y1: 80 },
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 80, x1: 35, y1: 80 },
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 20, x1: 35, y1: 20 },
      { key: "eb2", tooltip: "Group B", x0: 85, y0: 30, x1: 95, y1: 70 }
    ],
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const svgEb = eb.querySelector("svg");
  const eb1 = eb.querySelectorAll('[data-key="eb1"]');
  ok(eb1.length === 3, "error bar: three segments share one data-key");

  fireOn(svgEb, "pointermove", eb1[1]); // hover the lower cap
  ok(
    eb1[0].classList.contains("vellumwidget-hl") &&
      eb1[1].classList.contains("vellumwidget-hl") &&
      eb1[2].classList.contains("vellumwidget-hl"),
    "error bar: hovering any segment highlights the whole bar"
  );
  ok(eb.querySelector(".vellumwidget-tip").textContent === "Group A", "error bar: tooltip from the shared key");
  fireOn(svgEb, "pointerleave", svgEb);

  fireOn(svgEb, "click", eb1[2]); // click the upper cap
  ok(
    eb1[0].classList.contains("vellumwidget-selected") && eb1[2].classList.contains("vellumwidget-selected"),
    "error bar: clicking any segment selects the whole bar"
  );

  const TB = window.__vellumwidgetTest;
  const ebEls = [
    { key: "eb1", x0: 25, y0: 20, x1: 35, y1: 80 },
    { key: "eb1", x0: 25, y0: 80, x1: 35, y1: 80 },
    { key: "eb1", x0: 25, y0: 20, x1: 35, y1: 20 },
    { key: "eb2", x0: 85, y0: 30, x1: 95, y1: 70 }
  ];
  const brushed = TB.brushKeys(ebEls, { x0: 0, y0: 0, x1: 200, y1: 100 });
  ok(
    JSON.stringify(brushed.slice().sort()) === JSON.stringify(["eb1", "eb2"]),
    "brushKeys: a key spanning several elements is returned once (no double-count)"
  );
}

{
  const bx = document.createElement("div");
  document.body.appendChild(bx);
  const iBx = widgetDef.factory(bx, 200, 100);
  const bxSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<rect data-key="c6" x="20" y="30" width="30" height="40"/>' + // box
    '<line data-key="c6" x1="20" y1="50" x2="50" y2="50"/>' + // median
    '<line data-key="c6" x1="35" y1="10" x2="35" y2="30"/>' + // whisker
    '<circle data-key="c6-out1" cx="35" cy="5" r="2"/>' + // outlier (own key)
    "</g></svg>";
  iBx.renderValue({
    svg: bxSvg,
    elements: [
      { key: "c6", tooltip: "cyl 6", x0: 20, y0: 10, x1: 50, y1: 70 },
      { key: "c6", tooltip: "cyl 6", x0: 20, y0: 50, x1: 50, y1: 50 },
      { key: "c6", tooltip: "cyl 6", x0: 35, y0: 10, x1: 35, y1: 30 },
      { key: "c6-out1", tooltip: "outlier", x0: 33, y0: 3, x1: 37, y1: 7 }
    ],
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const svgBx = bx.querySelector("svg");
  const box = bx.querySelectorAll('[data-key="c6"]');
  ok(box.length === 3, "boxplot: rect + median + whisker share the category key");
  fireOn(svgBx, "pointermove", box[0]); // hover the rect
  ok(
    box[0].classList.contains("vellumwidget-hl") &&
      box[1].classList.contains("vellumwidget-hl") &&
      box[2].classList.contains("vellumwidget-hl"),
    "boxplot: hovering the box highlights rect + median + whisker together"
  );
  ok(
    !bx.querySelector('[data-key="c6-out1"]').classList.contains("vellumwidget-hl"),
    "boxplot: an outlier (its own key) is not part of the box's highlight"
  );
}

// ============ columnar payload ingestion (Phase 1 wire format) ============
// R now ships `elements` as a columnar object (one array per field) instead of an
// array of per-element records — far cheaper to serialise at large N. The runtime
// decodes it back to the same ElemMeta[] via normalizeElements(); a legacy record
// array (used by the tests above) is still accepted.
{
  const T2 = window.__vellumwidgetTest;
  ok(typeof T2.normalizeElements === "function", "columnar: normalizeElements exposed for testing");

  // n = 1: htmlwidgets auto-unboxes a length-1 column to a scalar; must re-wrap.
  const one = T2.normalizeElements({ key: "a", x0: 1, y0: 2, x1: 3, y1: 4, tooltip: "A" });
  ok(one.length === 1 && one[0].key === "a" && one[0].x0 === 1 && one[0].tooltip === "A",
    "columnar: a single-element (auto-unboxed scalar) payload expands correctly");

  // multi-element: sparse tooltip (null where absent) + ragged legend list-column
  const many = T2.normalizeElements({
    key: ["a", "b", "c"],
    x0: [0, 10, 20], y0: [0, 0, 0], x1: [5, 15, 25], y1: [5, 5, 5],
    tooltip: ["A", null, "C"],
    legend: ["color:s", ["color:s", "color:t"], []]
  });
  ok(many.length === 3, "columnar: expands one ElemMeta per key");
  ok(many[0].tooltip === "A" && many[1].tooltip === undefined && many[2].tooltip === "C",
    "columnar: a null in a column means that element lacks the field");
  ok(many[0].legend === "color:s" && Array.isArray(many[1].legend) && many[1].legend.length === 2,
    "columnar: legend list-column keeps scalar vs multi-series shape");
  ok(many[2].legend === undefined, "columnar: an empty ([]) legend entry is treated as absent");
  ok(T2.brushKeys(many, { x0: -1, y0: -1, x1: 6, y1: 6 }).length === 1,
    "columnar: expanded elements carry usable bboxes for hit-testing");

  // VW-13 compact encoding (raster mode): dictionary {levels, codes} + sparse {at, v}.
  const enc = T2.normalizeElements({
    key: ["a", "b", "c", "d"],
    x0: [0, 10, 20, 30], y0: [0, 0, 0, 0], x1: [5, 15, 25, 35], y1: [5, 5, 5, 5],
    mark: { levels: "point", codes: [0, 0, 0, 0] },
    legend: { levels: ["color:s", "color:t"], codes: [0, 1, null, 0] },
    tooltip: { at: 3, v: "D" },
    legend_for: { at: [1, 2], v: ["legend:x", "legend:y"] },
    filter_value: { at: [0], v: [2.5] },
    cond: { levels: ["s:color"], codes: [0, null, 0, null] }
  });
  ok(enc.every((e) => e.mark === "point"), "encoded: a one-level (unboxed) dictionary column decodes for every element");
  ok(enc[0].legend === "color:s" && enc[1].legend === "color:t" && enc[2].legend === undefined,
    "encoded: dictionary codes map to levels, a null code is absent");
  ok(enc[3].tooltip === "D" && enc[0].tooltip === undefined && enc[2].tooltip === undefined,
    "encoded: a sparse column (unboxed index) sets only the listed element");
  ok(enc[1].legend_for === "legend:x" && enc[2].legend_for === "legend:y" && enc[0].legend_for === undefined,
    "encoded: a sparse column with several indices");
  ok(enc[0].filter_value === 2.5 && enc[1].filter_value === undefined, "encoded: a sparse numeric column");
  ok(Array.isArray(enc[0].cond) && enc[0].cond[0] === "s:color" && enc[1].cond === undefined,
    "encoded: a flattened one-value cond column is re-wrapped as an array");
  ok(T2.brushKeys(enc, { x0: -1, y0: -1, x1: 16, y1: 6 }).length === 2, "encoded: bboxes still hit-test");
  ok(T2.normalizeElements([{ key: "z" }]).length === 1, "columnar: a legacy record array is still accepted");
  ok(T2.normalizeElements([]).length === 0 && T2.normalizeElements(null).length === 0,
    "columnar: empty / null payloads yield no elements");

  // integration: renderValue accepts the columnar payload and hover still works
  const elCol = document.createElement("div");
  document.body.appendChild(elCol);
  widgetDef.factory(elCol, 200, 100).renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<path data-key="a" d="M10 10h5v5z"/><path data-key="b" d="M40 10h5v5z"/></svg>',
    elements: { key: ["a", "b"], x0: [10, 40], y0: [10, 10], x1: [15, 45], y1: [15, 15], tooltip: ["Alpha", "Beta"] },
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  fireOn(elCol.querySelector("svg"), "pointermove", elCol.querySelector('[data-key="a"]'));
  ok(elCol.querySelector(".vellumwidget-tip").textContent === "Alpha",
    "columnar: renderValue ingests the columnar payload end-to-end (hover tooltip works)");
}

// ============ Phase 2: spatial index (nearest / brush) ============
// The runtime hit-tests hover (nearest) and brush against a Flatbush index instead
// of an O(n) scan. jsdom has no layout (client->user mapping is degenerate), so we
// drive the index-backed functions directly via the instance `_test` seam with
// explicit user-space coordinates, and cross-check against the pure O(n) helpers
// over the same elements — they must agree.
{
  const T2 = window.__vellumwidgetTest;
  // A grid of marks, shipped columnar (as R now does).
  const M = 2500; // > DIM_OVERLAY_MIN, so this also puts the widget in large-dim mode
  const key = [], x0 = [], y0 = [], x1 = [], y1 = [];
  for (let i = 0; i < M; i++) {
    const gx = (i % 50) * 4, gy = Math.floor(i / 50) * 4;
    key.push("p" + i); x0.push(gx); y0.push(gy); x1.push(gx + 2); y1.push(gy + 2);
  }
  const cols = { key: key, x0: x0, y0: y0, x1: x1, y1: y1 };
  const pureEls = T2.normalizeElements(cols);

  const eIdx = document.createElement("div");
  document.body.appendChild(eIdx);
  const iIdx = widgetDef.factory(eIdx, 200, 200);
  iIdx.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<path data-key="p0" d="M0 0h2v2z"/></svg>',
    elements: cols,
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, nearest: true, selectMode: "multiple" }
  });

  ok(iIdx._test && iIdx._test.indexSize() === M, "index: built one entry per bboxed element");
  ok(iIdx._test.largeDim() === true, "index: >DIM_OVERLAY_MIN elements enables large-dim mode");

  // brush: index result === pure result over the same elements (order-insensitive)
  const rect = { x0: -1, y0: -1, x1: 9, y1: 9 };
  const viaIndex = iIdx._test.brushKeysIn(rect).slice().sort();
  const viaPure = T2.brushKeys(pureEls, rect).slice().sort();
  ok(viaIndex.length > 0 && JSON.stringify(viaIndex) === JSON.stringify(viaPure),
    "index: brushKeysIn matches the pure brushKeys over the same region");

  // nearest: index result === pure result
  const nIndex = iIdx._test.nearestKeyAt(101, 101, 1000);
  const nPure = T2.nearestKey(pureEls, 101, 101, 1000);
  ok(nIndex === nPure, "index: nearestKeyAt matches the pure nearestKey");
  ok(iIdx._test.nearestKeyAt(5000, 5000, 3) === null, "index: nearest returns null beyond maxDist");

  // Correct even for a small scene (index still built; queries agree).
  const eSmall = document.createElement("div");
  document.body.appendChild(eSmall);
  const iSmall = widgetDef.factory(eSmall, 100, 100);
  const smallCols = { key: ["a", "b", "c"], x0: [0, 50, 5], y0: [0, 50, 5], x1: [10, 60, 15], y1: [10, 60, 15] };
  iSmall.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path data-key="a" d="M0 0h1v1z"/></svg>',
    elements: smallCols,
    options: { hover: true, brush: true, nearest: true, selectMode: "multiple" }
  });
  ok(iSmall._test.largeDim() === false, "index: small scene stays on the CSS-dim path");
  ok(JSON.stringify(iSmall._test.brushKeysIn({ x0: -1, y0: -1, x1: 12, y1: 12 }).slice().sort()) ===
    JSON.stringify(["a", "c"]), "index: small-scene brush matches expected keys");
}

// ============ Phase 2: large-scene hover dims via overlay (O(hovered)) ============
// Above DIM_OVERLAY_MIN, hover must NOT toggle the O(n) `vellumwidget-hovering` dim
// rule; instead the holder is dimmed once and the hovered mark is cloned crisp into
// the overlay layer.
{
  const key = [], x0 = [], y0 = [], x1 = [], y1 = [];
  for (let i = 0; i < 2500; i++) { key.push("k" + i); x0.push(i); y0.push(0); x1.push(i + 1); y1.push(1); }
  const eBig = document.createElement("div");
  document.body.appendChild(eBig);
  const iBig = widgetDef.factory(eBig, 200, 100);
  iBig.renderValue({
    // Only two marks are actually drawn in the SVG; the 2500 elements just push the
    // widget into large-dim mode (the overlay clones whichever hovered node exists).
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<path data-key="k0" d="M10 10h5v5z"/><path data-key="k1" d="M40 10h5v5z"/></svg>',
    elements: { key: key, x0: x0, y0: y0, x1: x1, y1: y1, tooltip: key },
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const holderBig = eBig.querySelector(".vellumwidget-svg-holder");
  const dimBig = eBig.querySelector(".vellumwidget-dim-layer");
  ok(!!dimBig, "large-dim: an overlay layer is present");
  fireOn(eBig.querySelector("svg"), "pointermove", eBig.querySelector('[data-key="k0"]'));
  ok(!eBig.classList.contains("vellumwidget-hovering"),
    "large-dim: hover does NOT add the O(n) vellumwidget-hovering dim class");
  ok(holderBig.style.opacity === "0.28", "large-dim: the holder is dimmed once on hover");
  ok(dimBig.childNodes.length === 1, "large-dim: the hovered mark is cloned into the overlay (crisp)");
  fireOn(eBig.querySelector("svg"), "pointerleave", eBig.querySelector("svg"));
  ok(holderBig.style.opacity === "" && dimBig.childNodes.length === 0,
    "large-dim: leaving clears the dim and empties the overlay");

  // Structural guard against the ring-offset bug: the feedback overlay must live
  // in the shrink-to-fit `.vellumwidget-stage` alongside the holder, NOT directly
  // in the root. htmlwidgets stamps an explicit (often taller) height on the root;
  // if the overlay filled the root instead of the svg box, its viewBox would
  // letterbox and every hover/select ring would draw offset from the real mark.
  const stageBig = eBig.querySelector(".vellumwidget-stage");
  ok(!!stageBig, "stage: a shrink-to-fit stage wraps the svg + overlays");
  ok(stageBig.parentNode === eBig, "stage: the stage is a direct child of the root");
  ok(holderBig.parentNode === stageBig && dimBig.parentNode === stageBig,
    "stage: the holder and the feedback overlay share the stage (so the overlay tracks the svg box, not the root)");
}

// ============ Phase 4: raster mode (base image + index-driven interaction) ============
// A very large scene ships as one base <image> with NO per-element DOM nodes; all
// interaction resolves against the spatial index and draws feedback rings on the
// overlay. Here we drive selection via the proxy (coordinate-free) and hover via a
// synthetic event with rAF made synchronous.
{
  const N = 12;
  const key = [], x0 = [], y0 = [], x1 = [], y1 = [], tt = [];
  for (let i = 0; i < N; i++) { key.push("k" + i); const gx = i * 10; x0.push(gx); y0.push(0); x1.push(gx + 4); y1.push(4); tt.push("pt " + i); }
  const eR = document.createElement("div");
  document.body.appendChild(eR);
  const iR = widgetDef.factory(eR, 120, 20);
  iR.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" viewBox="0 0 120 20" role="img" aria-labelledby="vw-t">' +
      '<title id="vw-t">My cloud</title><image width="120" height="20" href="data:,"/></svg>',
    elements: { key: key, x0: x0, y0: y0, x1: x1, y1: y1, tooltip: tt },
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, a11y: true, raster: true, selectMode: "multiple" }
  });

  ok(iR._test.rasterMode() === true, "raster: rasterMode flag on");
  ok(iR._test.largeDim() === false, "raster: large-dim path off in raster mode");
  ok(iR._test.indexSize() === N, "raster: spatial index built from the element table");
  ok(eR.querySelectorAll("[data-key]").length === 0, "raster: no per-element DOM nodes");
  ok(!!eR.querySelector("image"), "raster: base image present");
  const dim = eR.querySelector(".vellumwidget-dim-layer");
  ok(!!dim, "raster: overlay layer present");

  // a11y: labelled image, not graphics-document; no per-element data table blowup
  const svgR = eR.querySelector("svg");
  ok(svgR.getAttribute("role") === "img", "raster a11y: chart is a labelled image (role=img)");
  ok(!eR.querySelector("table.vellumwidget-data-table"), "raster a11y: no per-element data table built");

  // selection (via proxy — no coordinates) draws one ring per key on the overlay
  iR._call("select", ["k3", "k7"]);
  ok(dim.querySelectorAll("circle").length === 2, "raster: selection draws one ring per selected key");
  iR._call("clearSelection");
  ok(dim.querySelectorAll("circle").length === 0, "raster: clearing selection removes the rings");

  // hover snaps to the nearest mark via the index and draws a hover ring. jsdom has
  // no getScreenCTM and zero-size rects, so toUser falls back to (0,0); k0's bbox is
  // at the origin, so the nearest scan resolves to it.
  fireOn(eR.querySelector("svg"), "pointermove", eR.querySelector("image"));
  ok(dim.querySelectorAll("circle").length >= 1, "raster: hover snaps to nearest mark and draws a hover ring");
  ok(eR.querySelector(".vellumwidget-tip").classList.contains("vellumwidget-show"), "raster: hover shows the tooltip");
  fireOn(eR.querySelector("svg"), "pointerleave", eR.querySelector("svg"));
  ok(dim.querySelectorAll("circle").length === 0, "raster: leaving clears the hover ring");

  // selection above the ring cap draws no rings (the selection is still tracked)
  const BIG = 2100, bk = [], bx0 = [], by0 = [], bx1 = [], by1 = [];
  for (let i = 0; i < BIG; i++) { bk.push("b" + i); bx0.push(i); by0.push(0); bx1.push(i + 1); by1.push(1); }
  const eB = document.createElement("div");
  document.body.appendChild(eB);
  const iB = widgetDef.factory(eB, 100, 20);
  iB.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2100 20"><image width="2100" height="20" href="data:,"/></svg>',
    elements: { key: bk, x0: bx0, y0: by0, x1: bx1, y1: by1 },
    options: { select: true, raster: true, selectMode: "multiple" }
  });
  iB._call("select", bk); // 2100 > cap 2000
  ok(eB.querySelector(".vellumwidget-dim-layer").querySelectorAll("circle").length === 0,
    "raster: selection above the ring cap draws no rings (still tracked/reported)");
}

// ============ Phase 6: crisp-zoom canvas layer (raster mode) ============
{
  const T2 = window.__vellumwidgetTest;
  // pure helpers
  ok(T2.isZoomedIn({ x: 0, y: 0, w: 50, h: 50 }, { x: 0, y: 0, w: 100, h: 100 }) === true,
    "canvas: isZoomedIn true when the view is narrower than the original");
  ok(T2.isZoomedIn({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 }) === false,
    "canvas: isZoomedIn false at the original extent");
  ok(T2.isZoomedIn({ x: 0, y: 0, w: 200, h: 200 }, { x: 0, y: 0, w: 100, h: 100 }) === false,
    "canvas: isZoomedIn false when zoomed out");
  const p = T2.userToCanvas({ x: 10, y: 10, w: 20, h: 20 }, 100, 100, 20, 20);
  ok(Math.abs(p.px - 50) < 1e-9 && Math.abs(p.py - 50) < 1e-9,
    "canvas: userToCanvas maps a viewBox point into canvas pixels");

  // A raster widget creates a canvas layer; jsdom has no 2D context, so the layer
  // gracefully stays empty and inert (sampling no-ops), and zooming never throws.
  const eC = document.createElement("div");
  document.body.appendChild(eC);
  const iC = widgetDef.factory(eC, 120, 20);
  iC.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" viewBox="0 0 120 20">' +
      '<image width="120" height="20" href="data:,"/></svg>',
    elements: { key: ["k0", "k1"], x0: [0, 10], y0: [0, 0], x1: [4, 14], y1: [4, 4] },
    options: { hover: true, select: true, zoom: true, brush: true, toolbar: true, nearest: true, raster: true, selectMode: "multiple" }
  });
  ok(iC._test.hasCanvas() === true, "canvas: raster mode creates the crisp-zoom canvas layer");
  ok(!!eC.querySelector("canvas.vellumwidget-canvas"), "canvas: the canvas element is in the DOM");
  ok(iC._test.pointCount() === 0, "canvas: no 2D context (jsdom) -> sampling no-ops, image-only fallback");
  let threw = false;
  try { iC._call("zoom", ["k1"]); iC._call("resetZoom"); } catch (e) { threw = true; }
  ok(!threw, "canvas: zooming a raster widget without a 2D context does not throw");

  // SVG mode never creates a canvas.
  const eS = document.createElement("div");
  document.body.appendChild(eS);
  const iS = widgetDef.factory(eS, 60, 30);
  iS.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30"><path data-key="a" d="M1 1h9v9z"/></svg>',
    elements: { key: ["a"], x0: [1], y0: [1], x1: [10], y1: [10] },
    options: { hover: true, select: true, selectMode: "multiple" }
  });
  ok(iS._test.hasCanvas() === false, "canvas: SVG mode does not create a canvas layer");
}

// ===================== unified hover (hover_mode "x"/"y") + crosshair =====================
{
  // Two series (s, t) at two x positions (10, 50); s marks sit high, t marks low.
  const svgU =
    '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="50" viewBox="0 0 60 50">' +
    '<path data-key="s1" d="M8 5h4v4z"/><path data-key="t1" d="M8 40h4v4z"/>' +
    '<path data-key="s2" d="M48 5h4v4z"/><path data-key="t2" d="M48 40h4v4z"/></svg>';
  const elemsU = [
    { key: "s1", tooltip: "s@10", x0: 8, y0: 5, x1: 12, y1: 9 },
    { key: "t1", tooltip: "t@10", x0: 8, y0: 40, x1: 12, y1: 44 },
    { key: "s2", tooltip: "s@50", x0: 48, y0: 5, x1: 52, y1: 9 },
    { key: "t2", tooltip: "t@50", x0: 48, y0: 40, x1: 52, y1: 44 }
  ];
  const elU = mount({
    svg: svgU, elements: elemsU,
    options: {
      tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
      nearest: true, selectMode: "multiple", hoverMode: "x", crosshair: true
    }
  });
  const svgUEl = elU.querySelector("svg");
  const tipU = elU.querySelector(".vellumwidget-tip");

  // hover the top-left mark (x=10 column): both series' marks at x=10 highlight.
  fireOn(svgUEl, "pointermove", elU.querySelector('[data-key="s1"]'));
  ok(
    elU.querySelector('[data-key="s1"]').classList.contains("vellumwidget-hl") &&
      elU.querySelector('[data-key="t1"]').classList.contains("vellumwidget-hl"),
    "unified x: the whole x-column (both series at that x) is highlighted"
  );
  ok(
    !elU.querySelector('[data-key="s2"]').classList.contains("vellumwidget-hl") &&
      !elU.querySelector('[data-key="t2"]').classList.contains("vellumwidget-hl"),
    "unified x: the neighbouring x-column is not highlighted"
  );
  ok(
    tipU.textContent.indexOf("s@10") !== -1 && tipU.textContent.indexOf("t@10") !== -1,
    "unified x: the tooltip lists every mark in the column (one combined box)"
  );
  const chLayer = elU.querySelector(".vellumwidget-crosshair-layer");
  ok(!!chLayer, "crosshair: the crosshair overlay layer is present");
  ok(
    elU.querySelectorAll(".vellumwidget-crosshair-line").length === 1,
    "crosshair: unified x draws a single (vertical) guide rule"
  );
  // hover off -> crosshair + highlight clear
  fireOn(svgUEl, "pointerleave", svgUEl);
  ok(elU.querySelectorAll(".vellumwidget-crosshair-line").length === 0, "crosshair: cleared on hover-out");
  ok(elU.querySelectorAll(".vellumwidget-hl").length === 0, "unified x: highlight cleared on hover-out");
}
{
  // Exercise the column + nearest-axis helpers directly via the test seam.
  const elH = document.createElement("div");
  document.body.appendChild(elH);
  const iH = widgetDef.factory(elH);
  iH.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="50" viewBox="0 0 60 50">' +
      '<path data-key="s1" d="M8 5h4v4z"/><path data-key="t1" d="M8 40h4v4z"/>' +
      '<path data-key="s2" d="M48 5h4v4z"/><path data-key="t2" d="M48 40h4v4z"/></svg>',
    elements: {
      key: ["s1", "t1", "s2", "t2"],
      x0: [8, 8, 48, 48], y0: [5, 40, 5, 40], x1: [12, 12, 52, 52], y1: [9, 44, 9, 44]
    },
    options: { hover: true, select: true, selectMode: "multiple", hoverMode: "x", crosshair: true }
  });
  ok(iH._test.hoverMode() === "x", "options: hoverMode round-trips into the runtime");
  ok(
    JSON.stringify(iH._test.columnKeys("s1", "x").sort()) === JSON.stringify(["s1", "t1"]),
    "columnKeys(x): groups the marks sharing an x, excludes the other column"
  );
  ok(
    JSON.stringify(iH._test.columnKeys("s1", "y").sort()) === JSON.stringify(["s1", "s2"]),
    "columnKeys(y): groups the marks sharing a y"
  );
  const nx = iH._test.nearestAxisKey("x", 11);
  ok(nx === "s1" || nx === "t1", "nearestAxisKey(x): seeds off the nearest x-position");
  const ny = iH._test.nearestAxisKey("x", 49);
  ok(ny === "s2" || ny === "t2", "nearestAxisKey(x): far cursor seeds the other column");
}
{
  // closest mode + crosshair -> a full cross (two rules) through the mark.
  const elX = mount({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30"><path data-key="a" d="M10 10h5v5z"/></svg>',
    elements: [{ key: "a", tooltip: "A", x0: 10, y0: 10, x1: 15, y1: 15 }],
    options: { tooltip: true, hover: true, select: true, nearest: true, selectMode: "multiple", crosshair: true }
  });
  fireOn(elX.querySelector("svg"), "pointermove", elX.querySelector('[data-key="a"]'));
  ok(
    elX.querySelectorAll(".vellumwidget-crosshair-line").length === 2,
    "crosshair: closest mode draws a full cross (vertical + horizontal)"
  );
  ok(elX.querySelector(".vellumwidget-tip").textContent === "A", "closest mode: single-mark tooltip unchanged");
}

// ===================== legend click-to-hide / -isolate =====================
{
  // Three series (s, t, u), each with two member marks, plus one swatch per series.
  const legendSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">' +
    '<path data-key="s1" d="M1 1h5v5z"/><path data-key="s2" d="M8 1h5v5z"/>' +
    '<path data-key="t1" d="M20 1h5v5z"/><path data-key="t2" d="M27 1h5v5z"/>' +
    '<path data-key="u1" d="M40 1h5v5z"/><path data-key="u2" d="M47 1h5v5z"/>' +
    '<path data-key="legend:color:s" d="M80 1h5v5z"/>' +
    '<path data-key="legend:color:t" d="M80 12h5v5z"/>' +
    '<path data-key="legend:color:u" d="M80 23h5v5z"/></svg>';
  const legendElems = [
    { key: "s1", legend: ["color:s"], tooltip: "s1", x0: 1, y0: 1, x1: 6, y1: 6 },
    { key: "s2", legend: ["color:s"], tooltip: "s2", x0: 8, y0: 1, x1: 13, y1: 6 },
    { key: "t1", legend: ["color:t"], tooltip: "t1", x0: 20, y0: 1, x1: 25, y1: 6 },
    { key: "t2", legend: ["color:t"], tooltip: "t2", x0: 27, y0: 1, x1: 32, y1: 6 },
    { key: "u1", legend: ["color:u"], tooltip: "u1", x0: 40, y0: 1, x1: 45, y1: 6 },
    { key: "u2", legend: ["color:u"], tooltip: "u2", x0: 47, y0: 1, x1: 52, y1: 6 },
    { key: "legend:color:s", legend_for: "color:s", tooltip: "s", x0: 80, y0: 1, x1: 85, y1: 6 },
    { key: "legend:color:t", legend_for: "color:t", tooltip: "t", x0: 80, y0: 12, x1: 85, y1: 17 },
    { key: "legend:color:u", legend_for: "color:u", tooltip: "u", x0: 80, y0: 23, x1: 85, y1: 28 }
  ];
  const legOpts = (policy) => ({
    svg: legendSvg, elements: legendElems,
    options: {
      tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
      nearest: false, selectMode: "multiple", legendClick: policy
    }
  });

  // --- policy "hide": single click hides the series, does NOT select it ---
  const elHide = mount(legOpts("hide"));
  const swatchT = elHide.querySelector('[data-key="legend:color:t"]');
  fireOn(elHide.querySelector("svg"), "click", swatchT);
  ok(
    elHide.querySelector('[data-key="t1"]').classList.contains("vellumwidget-legend-hidden") &&
      elHide.querySelector('[data-key="t2"]').classList.contains("vellumwidget-legend-hidden"),
    'legend "hide": clicking a swatch hides its series\' marks'
  );
  ok(
    !elHide.querySelector('[data-key="t1"]').classList.contains("vellumwidget-selected"),
    'legend "hide": clicking a swatch does not select the series'
  );
  ok(swatchT.classList.contains("vellumwidget-legend-off"), 'legend "hide": the toggled-off swatch is dimmed');
  // hovering the hidden series' (still-indexed) mark shows nothing
  fireOn(elHide.querySelector("svg"), "pointermove", elHide.querySelector('[data-key="t1"]'));
  ok(
    !elHide.querySelector(".vellumwidget-tip").classList.contains("vellumwidget-show"),
    'legend "hide": a hidden mark is not hovered (no tooltip)'
  );
  // click again -> show
  fireOn(elHide.querySelector("svg"), "click", swatchT);
  ok(
    !elHide.querySelector('[data-key="t1"]').classList.contains("vellumwidget-legend-hidden"),
    'legend "hide": a second click shows the series again'
  );

  // --- double-click isolates; double-click again restores ---
  function fireDbl(svg, target) {
    fireOn(svg, "dblclick", target);
  }
  const elIso = mount(legOpts("hide"));
  fireDbl(elIso.querySelector("svg"), elIso.querySelector('[data-key="legend:color:s"]'));
  ok(
    !elIso.querySelector('[data-key="s1"]').classList.contains("vellumwidget-legend-hidden") &&
      elIso.querySelector('[data-key="t1"]').classList.contains("vellumwidget-legend-hidden") &&
      elIso.querySelector('[data-key="u1"]').classList.contains("vellumwidget-legend-hidden"),
    'legend double-click: isolates the clicked series (hides all others)'
  );
  fireDbl(elIso.querySelector("svg"), elIso.querySelector('[data-key="legend:color:s"]'));
  ok(
    elIso.querySelectorAll(".vellumwidget-legend-hidden").length === 0,
    'legend double-click: a second double-click restores every series'
  );

  // --- policy "mute": dims instead of removing ---
  const elMute = mount(legOpts("mute"));
  fireOn(elMute.querySelector("svg"), "click", elMute.querySelector('[data-key="legend:color:u"]'));
  ok(
    elMute.querySelector('[data-key="u1"]').classList.contains("vellumwidget-legend-muted") &&
      !elMute.querySelector('[data-key="u1"]').classList.contains("vellumwidget-legend-hidden"),
    'legend "mute": clicking a swatch mutes (does not remove) the series'
  );

  // --- default policy "select" is unchanged: click selects, no hide ---
  const elSel = mount(legOpts("select"));
  fireOn(elSel.querySelector("svg"), "click", elSel.querySelector('[data-key="legend:color:s"]'));
  ok(
    elSel.querySelector('[data-key="s1"]').classList.contains("vellumwidget-selected") &&
      elSel.querySelectorAll(".vellumwidget-legend-hidden").length === 0,
    'legend "select" (default): clicking a swatch still selects the series, hides nothing'
  );
}

// ===================== pure helpers: nearestSortedIdx + columnTolerance =====================
ok(T.nearestSortedIdx([0, 10, 20, 30], 12) === 1, "nearestSortedIdx: 12 -> index of 10");
ok(T.nearestSortedIdx([0, 10, 20, 30], 26) === 3, "nearestSortedIdx: 26 -> index of 30");
ok(T.nearestSortedIdx([0, 10, 20, 30], -5) === 0, "nearestSortedIdx: below range -> first");
ok(T.nearestSortedIdx([], 1) === -1, "nearestSortedIdx: empty -> -1");
ok(T.columnTolerance([10, 10, 50, 50]) === 20, "columnTolerance: half the min gap between distinct positions");
ok(T.columnTolerance([7]) === 1, "columnTolerance: fewer than two distinct positions -> fallback 1");

// ===================== lasso select (#8) =====================
// pure geometry
{
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  ok(T.pointInPolygon(5, 5, sq) === true, "pointInPolygon: interior point is inside");
  ok(T.pointInPolygon(15, 5, sq) === false, "pointInPolygon: exterior point is outside");
  const b = T.polyBounds([{ x: 2, y: 3 }, { x: 8, y: 1 }, { x: 5, y: 9 }]);
  ok(b.x0 === 2 && b.y0 === 1 && b.x1 === 8 && b.y1 === 9, "polyBounds: spans the polygon vertices");
  const lassoElems = [
    { key: "a", x0: 4, y0: 4, x1: 6, y1: 6 },   // centre (5,5) inside sq
    { key: "b", x0: 20, y0: 20, x1: 22, y1: 22 } // centre outside
  ];
  ok(
    JSON.stringify(T.lassoKeys(lassoElems, sq)) === JSON.stringify(["a"]),
    "lassoKeys: selects only marks whose centre is inside the polygon"
  );
  ok(T.lassoKeys(lassoElems, [{ x: 0, y: 0 }, { x: 1, y: 1 }]).length === 0, "lassoKeys: a degenerate (<3 pt) polygon selects nothing");
}
// index-backed lassoKeysIn via the instance seam (deterministic user coords)
{
  const elL = document.createElement("div");
  document.body.appendChild(elL);
  const iL = widgetDef.factory(elL);
  iL.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">' +
      '<path data-key="a" d="M4 4h2v2z"/><path data-key="b" d="M40 40h2v2z"/></svg>',
    elements: { key: ["a", "b"], x0: [4, 40], y0: [4, 40], x1: [6, 42], y1: [6, 42] },
    options: { hover: true, select: true, selectMode: "multiple", lasso: true }
  });
  const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  ok(JSON.stringify(iL._test.lassoKeysIn(poly)) === JSON.stringify(["a"]), "lassoKeysIn (index-backed): centre-in-polygon picks 'a', excludes 'b'");
  ok(JSON.stringify(iL._test.availableModes()) === JSON.stringify(["brush", "lasso", "pan"]), "availableModes: brush + lasso + pan by default");
}
// lasso disabled -> not in the mode cycle
{
  const elNL = document.createElement("div");
  document.body.appendChild(elNL);
  const iNL = widgetDef.factory(elNL);
  iNL.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><path data-key="a" d="M4 4h2v2z"/></svg>',
    elements: { key: ["a"], x0: [4], y0: [4], x1: [6], y1: [6] },
    options: { hover: true, select: true, brush: true, zoom: true, toolbar: true, selectMode: "multiple", lasso: false }
  });
  ok(iNL._test.availableModes().indexOf("lasso") === -1, "lasso=false: lasso is excluded from the mode cycle");
}

// ===================== view report -> input$<id>_zoom (#4) =====================
{
  const captured = {};
  const savedShiny = window.Shiny;
  const savedMode = window.HTMLWidgets.shinyMode;
  window.HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: function (id, v) { captured[id] = v; } };
  const elZ = document.createElement("div");
  elZ.id = "zt"; // shinyInput keys off el.id
  document.body.appendChild(elZ);
  const iZ = widgetDef.factory(elZ);
  iZ.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><path data-key="a" d="M0 0h10v10z"/></svg>',
    elements: { key: ["a"], x0: [0], y0: [0], x1: [10], y1: [10] },
    options: { hover: true, select: true, zoom: true, toolbar: true, selectMode: "multiple" }
  });
  const svgZ = elZ.querySelector("svg");
  const wheelZ = new window.WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, clientX: 0, clientY: 0 });
  Object.defineProperty(wheelZ, "target", { value: svgZ });
  svgZ.dispatchEvent(wheelZ);
  ok(!!captured["zt_zoom"], "view report: a wheel-zoom emits input$<id>_zoom");
  ok(captured["zt_zoom"] && captured["zt_zoom"].w < 200 && captured["zt_zoom"].zoomed === true, "view report: reports the zoomed-in viewBox + zoomed flag");
  // reset restores full view -> zoomed false
  iZ._call("resetZoom");
  ok(captured["zt_zoom"] && captured["zt_zoom"].w === 200 && captured["zt_zoom"].zoomed === false, "view report: reset reports the full view (zoomed=false)");
  // restore globals so later code is unaffected
  window.Shiny = savedShiny;
  window.HTMLWidgets.shinyMode = savedMode;
}

// ===================== bugfix: cross-filtered / legend-hidden marks are inert =====================
// A display-tier filter (crosstalk / vw_filter) or a legend-"hide" toggle sets
// display:none, but the marks stay in the spatial index. Regression guard: they
// must be skipped by nearest-hover, brush, lasso and click-snap — not just
// visually hidden. (Previously a brush would re-select filtered-out points and a
// nearest-hover could tooltip a hidden one.)
{
  const svgF =
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="30" viewBox="0 0 90 30">' +
    '<path data-key="a" d="M1 1h5v5z"/><path data-key="b" d="M20 1h5v5z"/><path data-key="c" d="M40 1h5v5z"/></svg>';
  const elemsF = [
    { key: "a", tooltip: "A", x0: 1, y0: 1, x1: 6, y1: 6 },
    { key: "b", tooltip: "B", x0: 20, y0: 1, x1: 25, y1: 6 },
    { key: "c", tooltip: "C", x0: 40, y0: 1, x1: 45, y1: 6 }
  ];
  const elF = document.createElement("div");
  document.body.appendChild(elF);
  const iF = widgetDef.factory(elF);
  iF.renderValue({
    svg: svgF, elements: elemsF,
    options: { tooltip: true, hover: true, select: true, brush: true, nearest: true, selectMode: "multiple" }
  });
  const svgFEl = elF.querySelector("svg");
  const whole = { x0: 0, y0: 0, x1: 90, y1: 30 };

  // Before filtering, a brush over the whole region hits all three.
  ok(
    JSON.stringify(iF._test.dropInert(iF._test.brushKeysIn(whole)).sort()) === JSON.stringify(["a", "b", "c"]),
    "inert: with no filter, all marks are brushable"
  );

  // Cross-filter to show only "a" (as vw_filter / crosstalk would).
  iF._call("filter", ["a"]);
  ok(iF._test.inert("b") && iF._test.inert("c") && !iF._test.inert("a"), "inert: filtered-out marks are inert, shown mark is not");
  ok(
    JSON.stringify(iF._test.dropInert(iF._test.brushKeysIn(whole))) === JSON.stringify(["a"]),
    "inert: brush over everything selects only the un-filtered mark (not the hidden ones)"
  );
  ok(
    JSON.stringify(iF._test.dropInert(iF._test.lassoKeysIn([{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 30 }, { x: 0, y: 30 }]))) === JSON.stringify(["a"]),
    "inert: lasso over everything selects only the un-filtered mark"
  );
  // A nearest-hover that resolves to a filtered mark shows nothing. Fire directly
  // on b's node (a real pointer can't hit a display:none node, but this exercises
  // the hoverAt inert guard deterministically without layout).
  fireOn(svgFEl, "pointermove", elF.querySelector('[data-key="b"]'));
  ok(!elF.querySelector(".vellumwidget-tip").classList.contains("vellumwidget-show"), "inert: hovering a filtered mark shows no tooltip");
  // The visible mark still hovers.
  fireOn(svgFEl, "pointermove", elF.querySelector('[data-key="a"]'));
  ok(elF.querySelector(".vellumwidget-tip").textContent === "A", "inert: the un-filtered mark still hovers normally");

  // Clearing the filter restores brushability.
  iF._call("clearFilter");
  ok(!iF._test.inert("b"), "inert: clearing the filter makes marks interactive again");
  ok(
    JSON.stringify(iF._test.dropInert(iF._test.brushKeysIn(whole)).sort()) === JSON.stringify(["a", "b", "c"]),
    "inert: after clearing the filter, all marks are brushable again"
  );
}
{
  // Legend "hide" is inert for brush/select too (not just hover).
  const elLH = document.createElement("div");
  document.body.appendChild(elLH);
  const iLH = widgetDef.factory(elLH);
  iLH.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="30" viewBox="0 0 90 30">' +
      '<path data-key="p1" d="M1 1h5v5z"/><path data-key="q1" d="M20 1h5v5z"/>' +
      '<path data-key="legend:color:s" d="M70 1h5v5z"/></svg>',
    elements: [
      { key: "p1", legend: ["color:s"], x0: 1, y0: 1, x1: 6, y1: 6 },
      { key: "q1", legend: ["color:t"], x0: 20, y0: 1, x1: 25, y1: 6 },
      { key: "legend:color:s", legend_for: "color:s", tooltip: "s", x0: 70, y0: 1, x1: 75, y1: 6 }
    ],
    options: { tooltip: true, hover: true, select: true, brush: true, nearest: false, selectMode: "multiple", legendClick: "hide" }
  });
  fireOn(elLH.querySelector("svg"), "click", elLH.querySelector('[data-key="legend:color:s"]')); // hide series s
  ok(iLH._test.inert("p1") && !iLH._test.inert("q1"), "inert: a legend-hidden series' marks are inert; other series is not");
  ok(
    JSON.stringify(iLH._test.dropInert(iLH._test.brushKeysIn({ x0: 0, y0: 0, x1: 30, y1: 30 }))) === JSON.stringify(["q1"]),
    "inert: brushing over a legend-hidden series does not select it"
  );
}

// ===================== data-space mapping (#5 brush, #4 zoom) =====================
// pure inverters
ok(T.nativeToData({ transform: "identity" }, 5) === 5, "nativeToData: identity");
ok(T.nativeToData({ transform: "log10" }, 2) === 100, "nativeToData: log10 -> 10^n");
ok(T.nativeToData({ transform: "sqrt" }, 3) === 9, "nativeToData: sqrt -> n^2");
{
  const p = {
    name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
    x: { transform: "identity", native_lo: 0, native_hi: 100 },
    y: { transform: "identity", native_lo: 0, native_hi: 50 }
  };
  ok(T.pxToDataX(p, 300) === 50, "pxToDataX: mid px -> mid data");
  ok(T.pxToDataX(p, 100) === 0 && T.pxToDataX(p, 500) === 100, "pxToDataX: endpoints map to the native domain");
  // device y is top-down: py0 (top) is the HIGH data value
  ok(T.pxToDataY(p, 10) === 50 && T.pxToDataY(p, 410) === 0, "pxToDataY: top px -> high data, bottom -> low");
  ok(T.pxToDataY(p, 210) === 25, "pxToDataY: mid px -> mid data");
  ok(T.normalizePanels(p).length === 1 && T.normalizePanels(null).length === 0, "normalizePanels: object -> [obj], null -> []");
}
{
  // instance seam: panelAt / dataRangeOf / brushDataFields over a real payload
  const elD = document.createElement("div");
  document.body.appendChild(elD);
  const iD = widgetDef.factory(elD);
  iD.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><path data-key="a" d="M300 210h4v4z"/></svg>',
    elements: { key: ["a"], x0: [300], y0: [210], x1: [304], y1: [214] },
    panels: {
      name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
    },
    options: { hover: true, select: true, brush: true, zoom: true, selectMode: "multiple" }
  });
  ok(iD._test.panelAt(300, 210) !== null, "panelAt: a point inside the panel resolves");
  ok(iD._test.panelAt(50, 5) !== null, "panelAt: outside but sole panel -> that panel");
  const d = iD._test.dataRangeOf(iD._test.panelAt(300, 210), 100, 10, 300, 210);
  ok(JSON.stringify(d.x) === JSON.stringify([0, 50]), "dataRangeOf: x bounds mapped to data");
  ok(JSON.stringify(d.y) === JSON.stringify([25, 50]) && d.panel === "panel-1-1", "dataRangeOf: y bounds (top->high) + panel name");
  const bf = iD._test.brushDataFields({ x0: 100, y0: 10, x1: 300, y1: 210 });
  ok(bf.x0d === 0 && bf.x1d === 50 && bf.y0d === 25 && bf.y1d === 50 && bf.panel === "panel-1-1",
    "brushDataFields: data-space bounds for a brushed region");
  // no panels -> pixel-only (empty data fields)
  const elN = document.createElement("div");
  document.body.appendChild(elN);
  const iN = widgetDef.factory(elN);
  iN.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30"><path data-key="a" d="M1 1h9v9z"/></svg>',
    elements: { key: ["a"], x0: [1], y0: [1], x1: [10], y1: [10] },
    options: { hover: true, select: true, brush: true, selectMode: "multiple" }
  });
  ok(Object.keys(iN._test.brushDataFields({ x0: 0, y0: 0, x1: 5, y1: 5 })).length === 0, "no panels: brushDataFields is empty (pixel-only)");
}
{
  // _zoom carries the visible data range (deterministic via resetZoom)
  const captured = {};
  const savedShiny = window.Shiny, savedMode = window.HTMLWidgets.shinyMode;
  window.HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: function (id, v) { captured[id] = v; } };
  const elZ = document.createElement("div");
  elZ.id = "zd";
  document.body.appendChild(elZ);
  const iZ = widgetDef.factory(elZ);
  iZ.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><path data-key="a" d="M300 210h4v4z"/></svg>',
    elements: { key: ["a"], x0: [300], y0: [210], x1: [304], y1: [214] },
    panels: {
      name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
    },
    options: { hover: true, select: true, zoom: true, selectMode: "multiple" }
  });
  iZ._call("resetZoom"); // full view 0..600 x 0..420 -> extrapolated data range
  const z = captured["zd_zoom"];
  ok(z && z.data && z.data.panel === "panel-1-1", "_zoom: carries data-space range + panel");
  ok(z.data.x[0] === -25 && z.data.x[1] === 125, "_zoom: visible x data range (extrapolated past the panel)");
  window.Shiny = savedShiny; window.HTMLWidgets.shinyMode = savedMode;
}

// _zoom reports every panel's visible data range, keyed by panel id (VW-10a).
{
  const captured = {};
  const savedShiny = window.Shiny, savedMode = window.HTMLWidgets.shinyMode;
  window.HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: function (id, v) { captured[id] = v; } };
  const lin = (hi) => ({ type: "continuous", transform: "identity", data_lo: 0, data_hi: hi, native_lo: 0, native_hi: hi });
  const facetSvgZ =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><path data-key="a" d="M99 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="panel-1-2"><g data-vellum-pan="panel-1-2"><path data-key="b" d="M299 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g></svg>';
  const panelsZ = [
    { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, x: lin(100), y: lin(50) },
    { name: "panel-1-2", px0: 220, py0: 10, px1: 380, py1: 90, x: lin(200), y: lin(50) } // free x scale
  ];
  const mk = (id, axisZoom) => {
    const e = document.createElement("div");
    e.id = id;
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 400, 100);
    i.renderValue({
      svg: facetSvgZ,
      elements: { key: ["a", "b"], mark: ["point", "point"], x0: [99, 299], y0: [49, 49], x1: [101, 301], y1: [51, 51] },
      panels: panelsZ,
      options: { axisZoom: axisZoom, hover: true, zoom: true }
    });
    return i;
  };
  const near2 = (r, lo, hi) => r && Math.abs(r[0] - lo) < 1e-9 && Math.abs(r[1] - hi) < 1e-9;
  const iA = mk("zf", true);
  ok(iA._test.axisZoomActive() === true, "_zoom panels: the facet fixture is axis-zoomable");
  iA._test.setView({ x: 50, y: 25, w: 200, h: 50 }); // 2x about panel 1's centre
  const zA = captured["zf_zoom"];
  ok(zA && zA.panels && Object.keys(zA.panels).join() === "panel-1-1,panel-1-2", "_zoom panels: one entry per panel, keyed by panel id");
  ok(near2(zA.panels["panel-1-1"].x, 25, 75) && near2(zA.panels["panel-1-2"].x, 50, 150),
    "_zoom panels: each facet reports its own zoomed x range");
  ok(near2(zA.panels["panel-1-1"].y, 12.5, 37.5) && zA.panels["panel-1-2"].panel === "panel-1-2",
    "_zoom panels: y ranges and panel names per facet");
  ok(zA.data === undefined, "_zoom panels: no single `data` range for a faceted plot");
  // Plain viewBox zoom: each panel reports the part of it inside the view.
  const iB = mk("zg", false);
  iB._test.setView({ x: 0, y: 0, w: 200, h: 100 });
  const zB = captured["zg_zoom"];
  ok(zB && near2(zB.panels["panel-1-1"].x, 0, 100) && zB.panels["panel-1-2"] === null,
    "_zoom panels: viewBox zoom clips to each panel; a panel out of view reports NULL");
  window.Shiny = savedShiny; window.HTMLWidgets.shinyMode = savedMode;
}
{
  // Single panel: `data` keeps its shape and `panels` carries the same range.
  const captured = {};
  const savedShiny = window.Shiny, savedMode = window.HTMLWidgets.shinyMode;
  window.HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: function (id, v) { captured[id] = v; } };
  const e = document.createElement("div");
  e.id = "zs";
  document.body.appendChild(e);
  const i = widgetDef.factory(e);
  i.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><path data-key="a" d="M300 210h4v4z"/></svg>',
    elements: { key: ["a"], x0: [300], y0: [210], x1: [304], y1: [214] },
    panels: {
      name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
    },
    options: { hover: true, zoom: true }
  });
  i._call("resetZoom");
  const z = captured["zs_zoom"];
  ok(z && z.data && z.data.x[0] === -25 && z.panels && JSON.stringify(z.panels["panel-1-1"]) === JSON.stringify(z.data),
    "_zoom panels: a single-panel plot keeps `data` and mirrors it in `panels`");
  window.Shiny = savedShiny; window.HTMLWidgets.shinyMode = savedMode;
}

// ===================== hardening: non-identity mappings + decline (B1/N1) =====================
{
  // A log10 x-axis with 5% expansion + a real (non-identity) y range, exercising
  // the composed path the earlier identity-only tests missed. Panel px [100,10,500,410].
  // x: native = log10(data), domain log10([1,1000]) expanded 5% -> [-0.15, 3.15].
  // y: data [0,50], native == data (identity), expanded to [-2.5, 52.5].
  const p = {
    name: "p", px0: 100, py0: 10, px1: 500, py1: 410,
    x: { type: "continuous", transform: "log10", native_lo: -0.15, native_hi: 3.15 },
    y: { type: "continuous", transform: "identity", native_lo: -2.5, native_hi: 52.5 }
  };
  // px at native 0 (data 1) = 100 + (0 - -0.15)/(3.15 - -0.15)*400
  const pxAt1 = 100 + (0 - -0.15) / (3.15 - -0.15) * 400;
  ok(Math.abs(T.pxToDataX(p, pxAt1) - 1) < 1e-9, "pxToDataX(log10): recovers data=1 through log inverse + expansion");
  const pxAt1000 = 100 + (3 - -0.15) / (3.15 - -0.15) * 400;
  ok(Math.abs(T.pxToDataX(p, pxAt1000) - 1000) < 1e-6, "pxToDataX(log10): recovers data=1000");
  // y flip + expansion: native 25 (data 25) sits where?  py where frac gives native 25
  // frac = (native_hi - 25)/(native_hi - native_lo) = (52.5-25)/55 ; py = py0 + frac*(py1-py0)
  const fracY = (52.5 - 25) / (52.5 - -2.5);
  const pyAt25 = 10 + fracY * (410 - 10);
  ok(Math.abs(T.pxToDataY(p, pyAt25) - 25) < 1e-9, "pxToDataY(identity+expansion): recovers data=25 with the y-flip");

  // reverse axis: decreasing native domain, identity map
  const pr = { name: "r", px0: 0, py0: 0, px1: 100, py1: 100,
    x: { transform: "reverse", native_lo: 4.15, native_hi: 0.85 }, y: { transform: "identity", native_lo: 0, native_hi: 10 } };
  // px 0 -> native_lo 4.15 (the high data end, since reversed); px100 -> 0.85
  ok(Math.abs(T.pxToDataX(pr, 0) - 4.15) < 1e-9 && Math.abs(T.pxToDataX(pr, 100) - 0.85) < 1e-9,
    "pxToDataX(reverse): decreasing native domain inverts correctly");

  // B1: a non-invertible custom transform is declined (pxToData -> null)
  const pbad = { name: "b", px0: 0, py0: 0, px1: 100, py1: 100,
    x: { type: "continuous", transform: "log-2", native_lo: 0, native_hi: 4 }, y: { transform: "identity", native_lo: 0, native_hi: 1 } };
  ok(T.pxToDataX(pbad, 50) === null, "B1: an un-invertible transform (log-2) declines x mapping (null, not a wrong value)");
  ok(T.pxToDataY(pbad, 50) !== null, "B1: the invertible y axis still maps");
}
{
  // instance: brushDataFields omits the declined axis, keeps the invertible one
  const elB = document.createElement("div");
  document.body.appendChild(elB);
  const iB = widgetDef.factory(elB);
  iB.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path data-key="a" d="M50 50h4v4z"/></svg>',
    elements: { key: ["a"], x0: [50], y0: [50], x1: [54], y1: [54] },
    panels: {
      name: "p", px0: 0, py0: 0, px1: 200, py1: 200,
      x: { type: "continuous", transform: "log-2", native_lo: 0, native_hi: 8 },
      y: { type: "continuous", transform: "identity", native_lo: 0, native_hi: 100 }
    },
    options: { hover: true, select: true, brush: true, selectMode: "multiple" }
  });
  const bf = iB._test.brushDataFields({ x0: 0, y0: 0, x1: 100, y1: 100 });
  ok(bf.x0d === undefined && bf.x1d === undefined, "B1: brushDataFields omits the un-invertible x axis");
  ok(typeof bf.y0d === "number" && bf.panel === "p", "B1: brushDataFields keeps the invertible y axis + panel");
}

// ===================== linked pan/zoom across a group (#9) =====================
{
  // Two grouped widgets of DIFFERENT sizes; zooming one links the other by the
  // *fraction* of each viewBox (size-independent), not raw device px.
  function mountVB(vbStr, size, group) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e);
    i.renderValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vbStr + '"><path data-key="k" d="M1 1h2v2z"/></svg>',
      elements: { key: ["k"], x0: [size * 0.4], y0: [size * 0.4], x1: [size * 0.6], y1: [size * 0.6] },
      options: { hover: true, select: true, zoom: true, brush: true, toolbar: true, selectMode: "multiple", group: group }
    });
    return { el: e, inst: i, svg: e.querySelector("svg") };
  }
  const A = mountVB("0 0 100 100", 100, "lz");
  const B = mountVB("0 0 200 200", 200, "lz"); // 2x the size of A
  const Cungrouped = mountVB("0 0 100 100", 100, null);

  const vb0B = T.parseViewBox(B.svg.getAttribute("viewBox"));
  // Zoom A to its key (frames the mark's bbox) -> A broadcasts a view fraction.
  A.inst._call("zoom", ["k"]);
  const aVB = T.parseViewBox(A.svg.getAttribute("viewBox"));
  const bVB = T.parseViewBox(B.svg.getAttribute("viewBox"));
  ok(aVB.w < 100, "linked zoom: source A zoomed in (viewBox shrank)");
  ok(bVB.w < 200 && bVB.w > 0, "linked zoom: grouped peer B also zoomed");
  // same *fraction* of each widget's own viewBox (size-independent link)
  ok(Math.abs(aVB.w / 100 - bVB.w / 200) < 1e-6 && Math.abs(aVB.x / 100 - bVB.x / 200) < 1e-6,
    "linked zoom: peer tracks the same relative pan/zoom, scaled to its own viewBox");
  // an ungrouped widget is untouched
  ok(T.parseViewBox(Cungrouped.svg.getAttribute("viewBox")).w === 100, "linked zoom: an ungrouped widget is unaffected");
  // reset links too, and does not infinite-loop (a loop would hang the test)
  A.inst._call("resetZoom");
  ok(T.parseViewBox(B.svg.getAttribute("viewBox")).w === vb0B.w, "linked zoom: reset on A restores B's full view");
}

// ===================== overview navigator (#6) =====================
{
  function mountNav(opts) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e);
    i.renderValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">' +
        '<defs><clipPath id="c0"><path d="M0 0h100v40H0z"/></clipPath></defs>' +
        '<g clip-path="url(#c0)"><path data-key="k" d="M40 15h20v10z"/></g></svg>',
      elements: { key: ["k"], x0: [40], y0: [15], x1: [60], y1: [25] },
      options: Object.assign({ hover: true, select: true, zoom: true, brush: true, toolbar: true, selectMode: "multiple" }, opts)
    });
    return { el: e, inst: i, svg: e.querySelector("svg") };
  }
  // off by default
  ok(mountNav({}).inst._test.hasNavigator() === false, "navigator: absent by default");
  // present + structured when enabled
  const N = mountNav({ navigator: true });
  ok(N.inst._test.hasNavigator() === true, "navigator: strip built when navigator=true");
  ok(!!N.el.querySelector(".vellumwidget-nav .vellumwidget-nav-window"), "navigator: has a window element");
  ok(N.el.querySelectorAll(".vellumwidget-nav-handle").length === 2, "navigator: window has two resize handles");
  ok(!!N.el.querySelector(".vellumwidget-nav-mini svg"), "navigator: mini-render (svg clone) present");
  ok(N.el.querySelector(".vellumwidget-nav-mini [data-key]") === null, "navigator: mini clone is inert (no data-key)");
  ok(N.el.querySelector(".vellumwidget-nav-mini defs") === null, "navigator: mini clone drops <defs> (no duplicate ids)");
  // full view -> window spans the whole strip
  ok(N.inst._test.navWindowFrac().left === 0 && N.inst._test.navWindowFrac().width === 100, "navigator: window spans full strip at the full view");
  // the navigator drives an x-only zoom: a non-uniform (preserveAspectRatio="none")
  // view so the marked x-range fills the width while the FULL y-range stays.
  ok(N.svg.getAttribute("preserveAspectRatio") === "none",
    "navigator: base svg maps non-uniformly (x-only range zoom)");
  // navToView maps fractions -> viewBox and moves the window
  N.inst._test.navToView(0.25, 0.5);
  const v = T.parseViewBox(N.svg.getAttribute("viewBox"));
  ok(Math.abs(v.x - 25) < 1e-6 && Math.abs(v.w - 50) < 1e-6, "navigator: navToView(0.25,0.5) sets the x-range to [25, +50] of vb0");
  // x-only: the y-extent is untouched (full range), so no values scroll off screen.
  // (Regression: a width-only change fit by `meet` merely re-centers; a uniform zoom
  // would crop y.)
  ok(Math.abs(v.y - 0) < 1e-6 && Math.abs(v.h - 40) < 1e-6,
    "navigator: x-only zoom keeps the full y-range (y/h unchanged)");
  const wf = N.inst._test.navWindowFrac();
  ok(Math.abs(wf.left - 25) < 1e-6 && Math.abs(wf.width - 50) < 1e-6, "navigator: window reflects the new view (25%/50%)");
  // clamp: can't push the window off the right edge
  N.inst._test.navToView(0.9, 0.5);
  ok(Math.abs(N.inst._test.navWindowFrac().left - 50) < 1e-6, "navigator: left clamped so left+width <= 100%");
  // two-way sync: zooming the main view via the proxy moves the window
  N.inst._call("resetZoom");
  ok(N.inst._test.navWindowFrac().width === 100, "navigator: reset restores the full-width window");
  N.inst._call("zoom", ["k"]); // frame the mark -> narrower view
  ok(N.inst._test.navWindowFrac().width < 100, "navigator: a main-view zoom narrows the window (two-way sync)");
}

// ===================== tooltip polish: delay / sticky / follow (#14) =====================
{
  function mountTip(opts) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e);
    i.renderValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30"><path data-key="a" d="M10 10h5v5z"/></svg>',
      elements: [{ key: "a", tooltip: "A", x0: 10, y0: 10, x1: 15, y1: 15 }],
      options: Object.assign({ tooltip: true, hover: true, select: true, selectMode: "multiple" }, opts)
    });
    return { el: e, svg: e.querySelector("svg"), tip: e.querySelector(".vellumwidget-tip") };
  }
  function hover(m) { fireOn(m.svg, "pointermove", m.el.querySelector('[data-key="a"]')); }

  // default (no delay): tip shows synchronously on hover
  const d0 = mountTip({});
  hover(d0);
  ok(d0.tip.classList.contains("vellumwidget-show"), "tooltip: shows immediately with no delay (default)");

  // delay: the reveal is deferred (not shown synchronously)
  const dd = mountTip({ tooltipDelay: 50 });
  hover(dd);
  ok(!dd.tip.classList.contains("vellumwidget-show"), "tooltip delay: reveal is deferred, not shown on the same tick");

  // sticky: the tip carries the sticky class, and on hover-out it lingers
  const ds = mountTip({ tooltipSticky: true });
  ok(ds.tip.classList.contains("vellumwidget-tip-sticky"), "tooltip sticky: tip opts into pointer events");
  hover(ds);
  ok(ds.tip.classList.contains("vellumwidget-show"), "tooltip sticky: shows on hover");
  fireOn(ds.svg, "pointerleave", ds.svg);
  ok(ds.tip.classList.contains("vellumwidget-show"), "tooltip sticky: lingers on hover-out (grace to reach it)");

  // non-sticky: hover-out hides immediately
  const dns = mountTip({});
  hover(dns);
  fireOn(dns.svg, "pointerleave", dns.svg);
  ok(!dns.tip.classList.contains("vellumwidget-show"), "tooltip (non-sticky): hides immediately on hover-out");
  ok(!dns.tip.classList.contains("vellumwidget-tip-sticky"), "tooltip (non-sticky): no sticky class");
}

// ===================== hover fast path: unchanged hover keys (VW-4) =====================
{
  const e = document.createElement("div");
  document.body.appendChild(e);
  const i = widgetDef.factory(e, 200, 100);
  i.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30">' +
      '<g data-vellum-panel="panel-1-1"><path data-key="a" fill="#ff0000" d="M1 1h9v9z"/>' +
      '<path data-key="b" fill="#00ff00" d="M40 1h9v9z"/></g></svg>',
    elements: [{ key: "a", tooltip: "A", cond: ["hi:color"] }, { key: "b", tooltip: "B", cond: ["hi:color"] }],
    interactions: {
      selections: [{ name: "hi", kind: "point", on: "hover", empty: true }],
      conditions: [{ selection: "hi", aes: "color", if_false: "#cccccc", empty: true }]
    },
    options: { tooltip: true, hover: true }
  });
  const sv = e.querySelector("svg");
  const tp = e.querySelector(".vellumwidget-tip");
  const a = e.querySelector('[data-key="a"]');
  const b = e.querySelector('[data-key="b"]');
  fireOn(sv, "pointermove", a, { clientX: 5, clientY: 20 });
  ok(tp.textContent === "A" && a.classList.contains("vellumwidget-hl") && b.style.fill,
    "hover fast path: the first move over a mark does the full hover pass");
  // Mark the drawn state; a second move over the same mark must leave it alone.
  tp.innerHTML = "sentinel";
  b.style.fill = "#123456";
  const tf0 = tp.style.transform;
  fireOn(sv, "pointermove", a, { clientX: 9, clientY: 20 });
  ok(tp.textContent === "sentinel", "hover fast path: same hovered key does not rebuild the tooltip");
  ok(b.style.fill === "rgb(18, 52, 86)" || b.style.fill === "#123456",
    "hover fast path: same hovered key does not re-run the condition pass");
  ok(tp.style.transform !== tf0 && /translate\(9px/.test(tp.style.transform),
    "hover fast path: the tooltip still follows the pointer");
  // A different mark redoes everything.
  fireOn(sv, "pointermove", b, { clientX: 45, clientY: 20 });
  ok(tp.textContent === "B" && b.classList.contains("vellumwidget-hl") && !a.classList.contains("vellumwidget-hl"),
    "hover fast path: a new hovered key redraws the highlight and tooltip");
  ok(!b.style.fill && (a.style.fill === "rgb(204, 204, 204)" || a.style.fill === "#cccccc"),
    "hover fast path: a new hovered key re-runs the conditions");
  // A view change invalidates the fast path (crosshair/overlay depend on the view).
  tp.innerHTML = "sentinel";
  i._test.setView({ x: 0, y: 0, w: 30, h: 15 });
  fireOn(sv, "pointermove", b, { clientX: 46, clientY: 20 });
  ok(tp.textContent === "B", "hover fast path: a view change forces a full redraw on the next move");
  // Leaving clears once; leaving again with nothing hovered is a no-op.
  fireOn(sv, "pointerleave", sv);
  ok(!tp.classList.contains("vellumwidget-show") && e.querySelectorAll(".vellumwidget-hl").length === 0 && !a.style.fill,
    "hover fast path: leaving clears the hover");
  a.classList.add("vellumwidget-hl"); // stand-in for state a redundant clear would sweep
  fireOn(sv, "pointerleave", sv);
  ok(a.classList.contains("vellumwidget-hl"), "hover fast path: clearHover is skipped when nothing is hovered");
  a.classList.remove("vellumwidget-hl");
  // After a clear, hovering the same mark again does the full pass.
  fireOn(sv, "pointermove", b, { clientX: 45, clientY: 20 });
  ok(tp.classList.contains("vellumwidget-show") && b.classList.contains("vellumwidget-hl"),
    "hover fast path: re-entering the same mark after a clear redraws it");
}

// ===================== continuous colorbar filter (#12) =====================
{
  function mountCB(withCb) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e);
    const payload = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100" viewBox="0 0 120 100">' +
        '<path data-key="m1" d="M10 10h4v4z"/><path data-key="m2" d="M20 10h4v4z"/>' +
        '<path data-key="m3" d="M30 10h4v4z"/><path data-key="m4" d="M40 10h4v4z"/></svg>',
      elements: {
        key: ["m1", "m2", "m3", "m4"],
        x0: [10, 20, 30, 40], y0: [10, 10, 10, 10], x1: [14, 24, 34, 44], y1: [14, 14, 14, 14],
        filter_value: [10, 20, 30, 40]
      },
      options: { hover: true, select: true, brush: true, selectMode: "multiple" }
    };
    if (withCb) payload.colorbar = { x0: 100, y0: 10, x1: 112, y1: 90, lo: 0, hi: 50, orientation: "v", reverse: false };
    i.renderValue(payload);
    return { el: e, inst: i };
  }
  // absent without a colorbar payload
  ok(mountCB(false).inst._test.hasColorbar() === false, "colorbar: no control without a colorbar payload");
  const C = mountCB(true);
  ok(C.inst._test.hasColorbar() === true, "colorbar: control built when the payload carries a colorbar");
  ok(C.inst._test.cbHandleCount() === 2, "colorbar: two draggable handles");
  // narrow the range to [15,35] -> m1(10) and m4(40) filtered out; m2/m3 kept
  C.inst._test.setColorRange(15, 35);
  ok(JSON.stringify(C.inst._test.colorHidden().sort()) === JSON.stringify(["m1", "m4"]),
    "colorbar: marks outside the value range are filtered out");
  ok(C.el.querySelector('[data-key="m1"]').classList.contains("vellumwidget-colorfiltered"), "colorbar: out-of-range mark is dimmed");
  ok(!C.el.querySelector('[data-key="m2"]').classList.contains("vellumwidget-colorfiltered"), "colorbar: in-range mark is not dimmed");
  // a colour-filtered mark is inert (hover skips it), like any other filter
  fireOn(C.el.querySelector("svg"), "pointermove", C.el.querySelector('[data-key="m1"]'));
  ok(!C.el.querySelector(".vellumwidget-tip").classList.contains("vellumwidget-show"), "colorbar: a filtered-out mark is not hovered");
  // widen back to the full range -> filter cleared
  C.inst._test.setColorRange(0, 50);
  ok(C.inst._test.colorHidden().length === 0, "colorbar: restoring the full range clears the filter");
  ok(C.el.querySelectorAll(".vellumwidget-colorfiltered").length === 0, "colorbar: no marks dimmed at the full range");
}

// ===================== axis-aware zoom (Phase 2, #3) =====================
// Pure re-tick helpers (nice numbers, formatting, the T / T-inv seam), then the
// DOM wiring: a pannable linear panel gets a transformed pan group + re-ticked
// axes; non-linear / raster / multi-panel scenes fall back to viewBox zoom.
{
  const T = window.__vellumwidgetTest;
  // niceTicks: 1/2/5 * 10^k steps covering the range.
  ok(JSON.stringify(T.niceTicks(0, 100, 5)) === JSON.stringify([0, 20, 40, 60, 80, 100]),
    "niceTicks: [0,100] -> step 20");
  ok(JSON.stringify(T.niceTicks(1.31, 5.62, 5)) === JSON.stringify([2, 3, 4, 5]),
    "niceTicks: expanded mtcars-wt range -> 2,3,4,5 (matches vellum)");
  ok(T.niceTicks(5, 5, 5).length === 0 && T.niceTicks(NaN, 1, 5).length === 0,
    "niceTicks: degenerate/empty ranges yield no ticks");
  // fmtTick: decimals from the step, trailing zeros trimmed.
  ok(T.fmtTick(2, 1) === "2" && T.fmtTick(2.5, 0.5) === "2.5" && T.fmtTick(0, 20) === "0" && T.fmtTick(0.2, 0.2) === "0.2",
    "fmtTick: step-appropriate decimals, zeros trimmed");
  // viewToPan / panToView: T maps vb -> vb0, its inverse recovers the point.
  const vb0 = { x: 0, y: 0, w: 200, h: 100 };
  const vb = { x: 50, y: 25, w: 100, h: 50 }; // zoomed 2x, centred
  const t = T.viewToPan(vb, vb0);
  ok(Math.abs(t.sx - 2) < 1e-9 && Math.abs(t.sy - 2) < 1e-9, "viewToPan: 2x zoom -> scale 2");
  ok(Math.abs(t.tx - -100) < 1e-9 && Math.abs(t.ty - -50) < 1e-9, "viewToPan: translate offsets the scaled origin");
  const back = T.panToView(vb, vb0, t.sx * 130 + t.tx, t.sy * 40 + t.ty);
  ok(Math.abs(back.x - 130) < 1e-9 && Math.abs(back.y - 40) < 1e-9, "panToView: inverts T (device px under a base point)");
  ok(T.dataToNative({ transform: "log10" }, 1000) === 3 && T.dataToNative({ transform: "identity" }, 7) === 7,
    "dataToNative: forward transform (inverse of nativeToData)");

  // A synthetic pannable linear cartesian scene, mirroring vellumplot's SVG shape.
  const linPanels = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const linSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)">' +
    '<g data-vellum-pan="panel-1-1">' +
    '<g role="grid"><path d="M0 0 L0 80" stroke="#ffffff" stroke-width="1"/></g>' +
    '<path data-key="a" d="M100 50h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" fill="#333333" font-family="sans-serif" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" fill="#333333" font-family="sans-serif" font-size="12">25</text></g>' +
    '<g data-vellum-panel="axis-title-x"><text>wt</text></g></svg>';
  function mountAZ(opts, svgStr, panels) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 200, 100);
    i.renderValue({
      svg: svgStr || linSvg,
      elements: { key: ["a"], x0: [100], y0: [50], x1: [102], y1: [52] },
      panels: panels === undefined ? linPanels : panels,
      options: Object.assign({ hover: true, select: true, zoom: true, selectMode: "multiple" }, opts)
    });
    return { el: e, inst: i };
  }

  // off by default: no transform, static axes visible, viewBox zoom stands.
  const off = mountAZ({ axisZoom: false });
  ok(off.inst._test.axisZoomActive() === false, "axis_zoom: inactive by default");
  ok(off.inst._test.staticAxesHidden() === false, "axis_zoom: vellum's axes/gridlines stay visible when off");

  // on with a linear cartesian pannable panel: active, axes hidden, re-ticked.
  const on = mountAZ({ axisZoom: true });
  ok(on.inst._test.axisZoomActive() === true, "axis_zoom: active for a single linear cartesian pannable panel");
  ok(on.inst._test.staticAxesHidden() === true, "axis_zoom: vellum's static axes + gridlines are hidden");
  ok(on.inst._test.panTransform() && /^matrix\(/.test(on.inst._test.panTransform()), "axis_zoom: pan group carries a matrix transform");
  const labels0 = on.inst._test.retickLabels();
  ok(labels0.length > 0, "axis_zoom: re-ticked axis labels are drawn at the full view");
  ok(on.inst._test.retickGridCount() > 0, "axis_zoom: re-ticked gridlines are drawn");
  // the base viewBox is held fixed at vb0 (the scene frame doesn't move)
  ok(on.el.querySelector("svg").getAttribute("viewBox") === "0 0 200 100", "axis_zoom: base viewBox stays at vb0");

  // zoom in (via the test seam): the pan group scales up and the axes re-tick to
  // the narrower visible range (a denser/shifted label set).
  on.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
  const tm = /matrix\(([-\d.eE]+)/.exec(on.inst._test.panTransform());
  ok(tm && Math.abs(parseFloat(tm[1]) - 2) < 1e-6, "axis_zoom: zooming to a half-size view scales the pan group 2x");
  ok(on.el.querySelector("svg").getAttribute("viewBox") === "0 0 200 100", "axis_zoom: viewBox still fixed after zoom (only the data region moved)");
  const labelsZ = on.inst._test.retickLabels().map((l) => l.text);
  // visible x data now [25,75] (px 50..150 -> data via the panel affine): ticks 30..70
  ok(labelsZ.indexOf("30") >= 0 && labelsZ.indexOf("70") >= 0 && labelsZ.indexOf("0") < 0,
    "axis_zoom: re-ticked to the zoomed-in visible data range");

  // reset restores identity transform + the full-range ticks.
  on.inst._test.setView({ x: 0, y: 0, w: 200, h: 100 });
  const tmR = /matrix\(([-\d.eE]+)/.exec(on.inst._test.panTransform());
  ok(tmR && Math.abs(parseFloat(tmR[1]) - 1) < 1e-6, "axis_zoom: reset to full view -> identity scale");

  // fallbacks: an axis the re-ticker can't follow, raster mode, and a described
  // panel with no pannable group all decline axis_zoom.
  const symPanels = Object.assign({}, linPanels, {
    x: { type: "continuous", transform: "symlog", data_lo: -10, data_hi: 10, native_lo: -1, native_hi: 1 }
  });
  ok(mountAZ({ axisZoom: true }, linSvg, symPanels).inst._test.axisZoomActive() === false,
    "axis_zoom: a custom-transform axis without static breaks falls back to viewBox zoom");
  ok(mountAZ({ axisZoom: true, raster: true }).inst._test.axisZoomActive() === false,
    "axis_zoom: raster mode falls back to viewBox zoom");
  ok(mountAZ({ axisZoom: true }, linSvg, [linPanels, Object.assign({}, linPanels, { name: "panel-1-2" })]).inst._test.axisZoomActive() === false,
    "axis_zoom: a described panel with no pannable group falls back to viewBox zoom");
  // a scene with no pan group (older upstream) also declines.
  const noPanSvg = linSvg.replace('<g data-vellum-pan="panel-1-1">', "").replace("</g></g>", "</g>");
  ok(mountAZ({ axisZoom: true }, noPanSvg).inst._test.axisZoomActive() === false,
    "axis_zoom: no pannable group (older vellum) falls back to viewBox zoom");
  // a void panel (a graph's aspect-locked layout / theme_void: no static axes to
  // re-tick) declines, so plain viewBox zoom stands and no axes are invented.
  const voidSvg = linSvg.replace(/<g data-vellum-panel="axis-[xy][^"]*">.*?<\/g>/g, "");
  const voidAZ = mountAZ({ axisZoom: true }, voidSvg);
  ok(voidAZ.inst._test.axisZoomActive() === false,
    "axis_zoom: a void panel (no static axes, e.g. a graph) falls back to viewBox zoom");
  ok(voidAZ.inst._test.retickLabels().length === 0,
    "axis_zoom: a void panel invents no re-ticked axes");

  // VW-17: vellumplot's panel furniture -- an opaque background rect first in the
  // pan group, gridlines, then inward tick marks -- and theme_classic's axis line
  // in the axis group. The background leaves the pan group (so it neither covers
  // the re-ticked grid nor scales with T), the static ticks are hidden and
  // re-drawn at the new breaks, and the axis line stays.
  {
    const furnSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)">' +
      '<g data-vellum-pan="panel-1-1">' +
      '<path class="bg" d="M20 10 L180 10 L180 90 L20 90 Z" fill="#ebebeb"/>' +
      '<g role="grid"><path d="M100 90 L100 10" stroke="#ffffff" stroke-width="1"/></g>' +
      '<g role="presentation"><path class="xt" d="M52 90 L52 85 M100 90 L100 85" stroke="#333333" stroke-width="1.5"/></g>' +
      '<g role="presentation"><path class="yt" d="M20 50 L25 50" stroke="#333333" stroke-width="1.5"/></g>' +
      '<g data-vellum-id="layer-1-point-g1" role="presentation"><path data-key="a" d="M100 50h2v2z"/></g></g></g>' +
      '<g data-vellum-panel="axis-x-3"><path class="xl" d="M20 90 L180 90" stroke="#000000"/>' +
      '<text x="20" y="4" transform="matrix(1 0 0 1 20 90)" fill="#333333" font-family="sans-serif" font-size="12">50</text></g>' +
      '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" fill="#333333" font-family="sans-serif" font-size="12">25</text></g>' +
      '<g data-vellum-panel="axis-title-x"><text>wt</text></g></svg>';
    const fz = mountAZ({ axisZoom: true }, furnSvg);
    ok(fz.inst._test.axisZoomActive() === true, "VW-17: the furnished panel is axis-zoomable");
    const outer = fz.el.querySelector('[data-vellum-panel="panel-1-1"]');
    const order = Array.prototype.map.call(outer.children, (c) =>
      c.getAttribute("class") || (c.hasAttribute("data-vellum-pan") ? "pan" : c.tagName));
    ok(JSON.stringify(order) === JSON.stringify(["bg", "vellumwidget-retick-grid", "pan"]),
      "VW-17: panel order is background, re-ticked grid, pan group (got " + order.join(",") + ")");
    const xt = fz.el.querySelector(".xt").parentNode, yt = fz.el.querySelector(".yt").parentNode;
    ok(xt.style.display === "none" && yt.style.display === "none",
      "VW-17: the static tick marks are hidden with the static labels");
    ok(fz.el.querySelector('[data-vellum-id="layer-1-point-g1"]').style.display !== "none",
      "VW-17: the first mark layer is left alone");
    const xl = fz.el.querySelector(".xl");
    ok(xl.style.display !== "none" && xl.parentNode.style.display !== "none" &&
      xl.parentNode.querySelector("text").style.display === "none",
      "VW-17: an axis line stays visible while its labels hide");
    ok(fz.inst._test.staticAxesHidden() === true, "VW-17: staticAxesHidden counts a kept axis line as hidden axes");
    fz.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
    const grid = outer.querySelector(".vellumwidget-retick-grid");
    const ticks = grid.querySelectorAll("line.vellumwidget-retick-tick");
    ok(ticks.length > 0 && fz.inst._test.retickGridCount() > 0,
      "VW-17: re-ticked tick marks are drawn beside the re-ticked gridlines");
    const xTicks = Array.prototype.filter.call(ticks, (l) => l.getAttribute("x1") === l.getAttribute("x2"));
    ok(xTicks.length > 0 && xTicks.every((l) => +l.getAttribute("y1") === 90 && +l.getAttribute("y2") === 85 &&
      l.getAttribute("stroke") === "#333333" && l.getAttribute("stroke-width") === "1.5"),
      "VW-17: x ticks grow 5px up from the bottom edge in the static stroke");
    const kids = Array.prototype.slice.call(grid.children);
    ok(kids.findIndex((l) => l.classList.contains("vellumwidget-retick-tick")) >
      kids.length - 1 - ticks.length, "VW-17: tick marks sit on top of every gridline");
    ok(!fz.el.querySelector(".bg").closest("[data-vellum-pan]"),
      "VW-17: the background is outside the pan group, so a zoom does not scale it");
  }

  // navigator + axis_zoom cooperate: the navigator's x-only zoom is rendered THROUGH
  // axis_zoom (fixed frame, re-ticked x-axis) rather than the stretch fallback.
  const nz = mountAZ({ axisZoom: true, navigator: true });
  ok(nz.inst._test.axisZoomActive() === true, "nav+axis_zoom: axis_zoom drives the navigator");
  ok(nz.el.querySelector("svg").getAttribute("preserveAspectRatio") === "xMidYMid meet",
    "nav+axis_zoom: frame is fixed (no stretch) — aspect stays 'meet'");
  // scrub to a narrow x-range, full y kept (y=0,h=100): the pan transform is x-only
  // (sy == 1) and the frame viewBox stays put.
  nz.inst._test.setView({ x: 50, y: 0, w: 100, h: 100 });
  const tp = /matrix\(([-\d.eE]+) 0 0 ([-\d.eE]+)/.exec(nz.inst._test.panTransform());
  ok(tp && Math.abs(parseFloat(tp[1]) - 2) < 1e-6 && Math.abs(parseFloat(tp[2]) - 1) < 1e-6,
    "nav+axis_zoom: pan transform is x-only (sx=2, sy=1) — full y kept, x-range zoomed");
  ok(nz.el.querySelector("svg").getAttribute("viewBox") === "0 0 200 100",
    "nav+axis_zoom: base viewBox stays fixed (frame doesn't move)");
}

// ============ axis-zoom tick generators: log / date / discrete / multi-panel ============
{
  const T = window.__vellumwidgetTest;
  const labelsOf = (ticks) => ticks.map((t) => t.label);
  const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);

  // --- log10: decades, thinned decades, 1-3 / 1-2-5 subdivisions, linear deep zoom.
  // Expectations are vellumplot's own static breaks/labels for the same ranges.
  const logAx = { type: "continuous", transform: "log10" };
  ok(JSON.stringify(labelsOf(T.axisTicks(logAx, 0, 5, 5))) === JSON.stringify(["1", "100", "10000"]),
    "log ticks: a 5-decade range thins to every 2nd decade (1, 100, 10000), as vellumplot draws it");
  ok(JSON.stringify(labelsOf(T.axisTicks(logAx, 0, 3, 5))) === JSON.stringify(["1", "10", "100", "1000"]),
    "log ticks: a 3-decade range ticks every decade");
  ok(JSON.stringify(labelsOf(T.axisTicks(logAx, Math.log10(0.03), Math.log10(7), 5))) ===
    JSON.stringify(["0.03", "0.10", "0.30", "1.00", "3.00"]),
    "log ticks: < 3 decades adds 1-3 subdivisions, labelled with R's common decimals");
  ok(JSON.stringify(labelsOf(T.axisTicks(logAx, Math.log10(2), Math.log10(7), 5))) === JSON.stringify(["2", "3", "5"]),
    "log ticks: inside one decade -> 2/3/5 subdivisions (matches vellumplot)");
  const lt = T.axisTicks(logAx, Math.log10(1.5), Math.log10(9), 5);
  ok(labelsOf(lt).indexOf("2") >= 0 && labelsOf(lt).indexOf("5") >= 0,
    "log ticks: zoomed in to under a decade -> 2/5 subdivisions");
  ok(lt.every((t) => near(Math.pow(10, t.n), Number(t.label))),
    "log ticks: each tick's native position is log10 of its labelled value");
  const deep = labelsOf(T.axisTicks(logAx, Math.log10(2), Math.log10(2.5), 5));
  ok(deep.indexOf("2.1") >= 0 && deep.indexOf("2.5") >= 0,
    "log ticks: a deep zoom inside one decade falls back to linear ticks (2.1, 2.2, ...)");
  ok(T.fmtRNum([0.1, 1, 10]).join(",") === "0.1,1.0,10.0" && T.fmtRNum([1, 10, 100]).join(",") === "1,10,100",
    "fmtRNum: R format() common decimals");

  // --- strftime + date-format detection from the static labels
  ok(T.strftimeUTC("%d %b %Y %H:%M", Date.UTC(2021, 2, 5, 7, 9)) === "05 Mar 2021 07:09",
    "strftimeUTC: day/month-name/year/hour/minute");
  ok(T.strftimeUTC("%j %B %y", Date.UTC(2020, 1, 1)) === "032 February 20", "strftimeUTC: %j %B %y");
  const dateAx = {
    type: "date", transform: "identity", time_unit: "day",
    breaks: [18262, 18353, 18444, 18536], labels: ["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]
  };
  ok(T.detectTimeFormat(dateAx).fmt === "%Y-%m-%d", "detectTimeFormat: a default date axis is ISO %Y-%m-%d");
  const monAx = {
    type: "date", transform: "identity", time_unit: "day",
    breaks: [18262, 18322, 18383, 18444, 18506], labels: ["Jan 2020", "Mar 2020", "May 2020", "Jul 2020", "Sep 2020"]
  };
  ok(T.detectTimeFormat(monAx).fmt === "%b %Y", "detectTimeFormat: recovers a date_labels format (%b %Y)");
  const zrhAx = {
    type: "datetime", transform: "identity", time_unit: "second",
    breaks: [1577833200, 1577854800, 1577876400],
    labels: ["2020-01-01 00:00:00", "2020-01-01 06:00:00", "2020-01-01 12:00:00"]
  };
  const zi = T.detectTimeFormat(zrhAx);
  ok(zi.fmt === "%Y-%m-%d %H:%M:%S" && zi.off === 3600000,
    "detectTimeFormat: a datetime axis drawn in UTC+1 recovers its format and offset");
  ok(T.detectTimeFormat({ type: "date", transform: "identity", time_unit: "day", breaks: [18262], labels: ["Q1"] }).fmt === null,
    "detectTimeFormat: custom labels -> no format (generator picks one per step)");

  // --- date ticks: calendar steps, the static format when fine enough
  ok(JSON.stringify(labelsOf(T.axisTicks(dateAx, 18262, 18627, 5))) ===
    JSON.stringify(["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]),
    "date ticks: a year-long view -> quarterly ticks in the static ISO format");
  const d10 = T.axisTicks(dateAx, 18262, 18272, 5);
  ok(d10.length === 6 && d10[0].label === "2020-01-01" && d10[1].label === "2020-01-03" && d10[1].n === 18264,
    "date ticks: a 10-day view -> every 2nd day, positioned in epoch days");
  ok(labelsOf(T.axisTicks(monAx, 18262, 18627, 5))[1] === "Apr 2020",
    "date ticks: month steps keep a %b %Y axis's own format");
  ok(labelsOf(T.axisTicks(monAx, 18262, 18272, 5))[0] === "2020-01-01",
    "date ticks: day steps outgrow a %b %Y format -> ISO day labels");
  ok(T.axisTicks(dateAx, 18262, 18262.5, 5).length <= 1,
    "date ticks: a Date axis never ticks below one day");
  ok(labelsOf(T.axisTicks(dateAx, 0, 365.25 * 300, 5)).every((l) => /^\d{4}$/.test(l) || /^\d{4}-\d\d-\d\d$/.test(l)),
    "date ticks: a centuries-wide view ticks on whole years");
  const utcAx = {
    type: "datetime", transform: "identity", time_unit: "second",
    breaks: [1577836800, 1585699200, 1593561600], labels: ["2020-01-01", "2020-04-01", "2020-07-01"]
  };
  ok(JSON.stringify(labelsOf(T.axisTicks(utcAx, 1577836800, 1577836800 + 21600, 5))) ===
    JSON.stringify(["2020-01-01", "03:00", "06:00"]),
    "datetime ticks: zoomed to hours -> %H:%M, midnight labelled with its date");
  const zt = T.axisTicks(zrhAx, 1577833200, 1577833200 + 21600, 5);
  ok(zt.length === 3 && zt[1].n === 1577833200 + 10800 && zt[1].label === "2020-01-01 03:00:00",
    "datetime ticks: hour ticks land on the axis's own (UTC+1) wall clock");
  // A Central-European datetime axis whose static breaks straddle DST: one fixed
  // offset cannot reproduce them all, so a zone is detected and every tick gets
  // its own offset (VW-10c).
  const cetAx = {
    type: "datetime", transform: "identity", time_unit: "second",
    breaks: [1577833200, 1585692000, 1593554400], labels: ["2020-01-01", "2020-04-01", "2020-07-01"]
  };
  const ci = T.detectTimeFormat(cetAx);
  ok(ci.fmt === "%Y-%m-%d" && !!ci.tz && ci.off === 3600000,
    "detectTimeFormat: breaks on local midnights across DST recover a time zone (" + ci.tz + ")");
  const dst = T.axisTicks(cetAx, 1585436400, 1585458000, 5); // 2020-03-29 00:00 CET .. 07:00 CEST
  ok(JSON.stringify(labelsOf(dst)) === JSON.stringify(["2020-03-29", "03:00", "06:00"]) &&
    dst[0].n === 1585436400 && dst[1].n === 1585443600 && dst[2].n === 1585454400,
    "datetime ticks: across the spring DST change each tick uses its own offset (03:00 CEST = 01:00 UTC)");
  const gap = labelsOf(T.axisTicks(cetAx, 1585436400, 1585450800, 5));
  ok(gap.indexOf("02:00") < 0 && gap.indexOf("03:00") >= 0 && gap.indexOf("01:00") >= 0,
    "datetime ticks: the wall time skipped by the DST change gets no tick");
  ok(T.detectTimeFormat(utcAx).tz === undefined || T.detectTimeFormat(utcAx).off === 0,
    "detectTimeFormat: a UTC axis keeps a zero offset");
  ok(JSON.stringify(labelsOf(T.axisTicks(utcAx, 1585436400, 1585458000, 5))) === JSON.stringify(["03:00", "06:00"]) ||
    JSON.stringify(labelsOf(T.axisTicks(utcAx, 1585436400, 1585458000, 5))) === JSON.stringify(["2020-03-29", "03:00"]),
    "datetime ticks: a UTC axis is not shifted by the viewer's zone");

  // --- discrete / binned / custom transform: static breaks re-positioned, kept in view
  const discAx = { type: "discrete", transform: "identity", breaks: [1, 2, 3, 4], labels: ["a", "b", "c", "d"] };
  ok(JSON.stringify(labelsOf(T.axisTicks(discAx, 1.6, 3.4, 5))) === JSON.stringify(["b", "c"]),
    "discrete ticks: only the categories still in view, at their own positions");
  ok(T.axisTicks({ type: "discrete", transform: "identity", breaks: 1, labels: "a" }, 0.5, 1.5, 5)[0].label === "a",
    "discrete ticks: a single unboxed break/label still works");
  ok(T.axisRetickable(discAx) && !T.axisRetickable({ type: "discrete", transform: "identity" }),
    "axisRetickable: a discrete axis needs its static breaks");
  ok(T.axisRetickable({ type: "continuous", transform: "log-2", breaks: [0, 1], labels: ["1", "2"] }) &&
    !T.axisRetickable({ type: "continuous", transform: "log-2" }),
    "axisRetickable: a custom transform re-positions its static breaks, or declines without them");
  ok(T.axisRetickable({ type: "continuous", transform: "sqrt" }) && T.axisRetickable(logAx) && T.axisRetickable(dateAx),
    "axisRetickable: sqrt / log10 / date generate their own ticks");
  // conjugatePan: identity A leaves T alone; a shifted panel keeps scale, moves translation.
  const tc = T.conjugatePan({ sx: 2, sy: 2, tx: -100, ty: -50 }, 1, 200, 1, 0);
  ok(tc.sx === 2 && tc.tx === -300 && tc.ty === -50, "conjugatePan: a panel shifted 200px right gets T's zoom about its own point");

  // --- integration: log / date / discrete axes re-tick on zoom (single panel)
  const svgOne =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="panel-1-1">' +
    '<g role="grid"><path d="M0 0 L0 80" stroke="#ffffff" stroke-width="1"/></g>' +
    '<path data-key="a" d="M100 50h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">x</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">y</text></g></svg>';
  const yLin = { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 };
  function mountOne(xAx) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 200, 100);
    i.renderValue({
      svg: svgOne,
      elements: { key: ["a"], x0: [100], y0: [50], x1: [102], y1: [52] },
      panels: { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, x: xAx, y: yLin },
      options: { axisZoom: true, hover: true, select: true, zoom: true }
    });
    return i;
  }
  // x labels sit on the scraped x-axis baseline (94); y labels at x = 16.
  const xLabels = (i) => i._test.retickLabels().filter((l) => near(l.y, 94)).map((l) => l.text);

  const logW = mountOne({ type: "continuous", transform: "log10", data_lo: 1, data_hi: 1000, native_lo: 0, native_hi: 3 });
  ok(logW._test.axisZoomActive() === true, "axis_zoom log: a log10 axis is now axis-zoomable");
  ok(JSON.stringify(xLabels(logW)) === JSON.stringify(["1", "10", "100", "1000"]),
    "axis_zoom log: full view ticks every decade");
  logW._test.setView({ x: 50, y: 25, w: 100, h: 50 }); // visible native 0.75 .. 2.25
  ok(JSON.stringify(xLabels(logW)) === JSON.stringify(["10", "30", "100"]),
    "axis_zoom log: zoomed in, the decades gain 1-3 subdivisions");

  const dateW = mountOne(Object.assign({ data_lo: 18262, data_hi: 18627, native_lo: 18262, native_hi: 18627 }, dateAx));
  ok(dateW._test.axisZoomActive() === true, "axis_zoom date: a date axis is axis-zoomable");
  ok(JSON.stringify(xLabels(dateW)) === JSON.stringify(["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]),
    "axis_zoom date: full view matches the static quarterly ISO labels");
  dateW._test.setView({ x: 50, y: 25, w: 100, h: 50 }); // ~Apr 1 .. Sep 30
  ok(JSON.stringify(xLabels(dateW)) === JSON.stringify(["2020-05-01", "2020-07-01", "2020-09-01"]),
    "axis_zoom date: zoomed to half a year -> bi-monthly calendar ticks");

  const discW = mountOne(Object.assign({ data_lo: 1, data_hi: 4, native_lo: 0.5, native_hi: 4.5 }, discAx));
  ok(discW._test.axisZoomActive() === true, "axis_zoom discrete: a discrete axis with breaks is axis-zoomable");
  ok(JSON.stringify(xLabels(discW)) === JSON.stringify(["a", "b", "c", "d"]), "axis_zoom discrete: all categories at full view");
  discW._test.setView({ x: 50, y: 25, w: 100, h: 50 }); // visible native 1.5 .. 3.5
  const dl = discW._test.retickLabels().filter((l) => near(l.y, 94));
  ok(dl.map((l) => l.text).join(",") === "b,c", "axis_zoom discrete: zoomed in, only the categories still in view remain");
  ok(near(dl[0].x, 60), "axis_zoom discrete: a category label follows its zoomed position");
  // The frame stays at the base view under axis_zoom, so a client point maps into
  // vb0 first and THEN through T⁻¹ (mapping it into the zoomed view first would
  // undo the zoom twice and drift the wheel anchor off the cursor).
  document.body.lastChild.querySelector("svg").getBoundingClientRect =
    () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 });
  const tv = discW._test.toView(150, 50);
  ok(near(tv.x, 125) && near(tv.y, 50), "axis_zoom: toView maps a client point through the base frame, then T⁻¹");

  // a datetime axis whose static labels vellum wrapped onto two lines re-ticks
  // wrapped too (date over time), centred on the tick.
  const wrapSvg = svgOne.replace(
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">x</text></g>',
    '<g data-vellum-panel="axis-x-3"><text x="-8" y="16" transform="matrix(1 0 0 1 20 90)" text-anchor="start" dominant-baseline="alphabetic" font-size="12">2020-01-01</text>' +
    '<text x="-1" y="30.4" transform="matrix(1 0 0 1 20 90)" text-anchor="start" dominant-baseline="alphabetic" font-size="12">00:00:00</text></g>');
  const e2 = document.createElement("div");
  document.body.appendChild(e2);
  const wrapW = widgetDef.factory(e2, 200, 100);
  wrapW.renderValue({
    svg: wrapSvg,
    elements: { key: ["a"], x0: [100], y0: [50], x1: [102], y1: [52] },
    panels: { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, y: yLin,
      x: Object.assign({ data_lo: 1577836800, data_hi: 1577923200, native_lo: 1577836800, native_hi: 1577923200 }, {
        type: "datetime", transform: "identity", time_unit: "second",
        breaks: [1577836800, 1577858400], labels: ["2020-01-01 00:00:00", "2020-01-01 06:00:00"] }) },
    options: { axisZoom: true, zoom: true }
  });
  const wl = e2.querySelector(".vellumwidget-retick-layer text");
  const wts = wl ? wl.querySelectorAll("tspan") : [];
  ok(wts.length === 2 && near(parseFloat(wts[1].getAttribute("dy")), 14.4),
    "axis_zoom datetime: a wrapped static axis re-ticks as two lines with the same spacing");
  ok(wl && wl.getAttribute("text-anchor") === "middle" && wl.querySelector("tspan").textContent === "2020-01-01",
    "axis_zoom datetime: wrapped labels are centred, date on the first line");

  // --- integration: multi-panel (facets) zoom together, each re-ticked
  const facetSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="panel-1-1">' +
    '<g role="grid"><path d="M0 0 L0 80" stroke="#ffffff" stroke-width="1"/></g>' +
    '<path data-key="a" d="M99 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="panel-1-2" clip-path="url(#c1)"><g data-vellum-pan="panel-1-2">' +
    '<path data-key="b" d="M299 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-x-5"><text x="20" y="4" transform="matrix(1 0 0 1 220 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g></svg>';
  const xLin = { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 };
  const facetPanels = [
    { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, x: xLin, y: yLin },
    { name: "panel-1-2", px0: 220, py0: 10, px1: 380, py1: 90, x: xLin, y: yLin }
  ];
  function mountFacet(svgStr, panels) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 400, 100);
    i.renderValue({
      svg: svgStr || facetSvg,
      elements: { key: ["a", "b"], mark: ["point", "point"], x0: [99, 299], y0: [49, 49], x1: [101, 301], y1: [51, 51] },
      panels: panels || facetPanels,
      options: { axisZoom: true, hover: true, select: true, zoom: true, selectMode: "multiple" }
    });
    e.querySelector("svg").getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100 });
    return { el: e, inst: i };
  }
  const fw = mountFacet();
  ok(fw.inst._test.axisZoomActive() === true, "axis_zoom facets: a two-panel scene is axis-zoomable");
  ok(fw.inst._test.panTransforms().length === 2, "axis_zoom facets: each panel's pan group is driven");
  const anc = fw.inst._test.axisAnchors();
  ok(anc[0].x && anc[0].y && anc[1].x && !anc[1].y,
    "axis_zoom facets: x labels for both panels, y labels only for the outer (left) panel");
  ok(near(anc[1].x.pos, 94), "axis_zoom facets: the second panel's x labels sit on its own axis baseline");
  fw.inst._test.setView({ x: 50, y: 25, w: 200, h: 50 }); // 2x about the reference panel's centre
  const pt = fw.inst._test.panTransforms();
  ok(pt[0].transform === "matrix(2 0 0 2 -100 -50)" && pt[1].transform === "matrix(2 0 0 2 -300 -50)",
    "axis_zoom facets: the second panel zooms 2x about its own corresponding point");
  const fl = fw.inst._test.retickLabels();
  const x30 = fl.filter((l) => l.text === "30" && near(l.y, 94));
  ok(x30.length === 2 && x30.some((l) => l.x > 200) && x30.some((l) => l.x < 200),
    "axis_zoom facets: both panels re-tick their x axis for the zoomed range (25..75)");
  ok(fl.filter((l) => near(l.x, 16)).length > 0 && fl.filter((l) => l.x > 380).length === 0,
    "axis_zoom facets: y labels drawn once, left of the outer panel");
  ok(fw.inst._test.retickGridCount() > 0 &&
    fw.el.querySelectorAll('[data-vellum-panel="panel-1-2"] .vellumwidget-retick-grid line').length > 0,
    "axis_zoom facets: each panel gets its own re-ticked gridlines");
  // hit-testing: a client point in panel 2 inverts through panel 2's transform
  const sv = fw.inst._test.toView(340, 50);
  ok(near(sv.x, 320) && near(sv.y, 50), "axis_zoom facets: toView inverts the panel under the cursor (T_2⁻¹)");
  // gesture anchor: the same spot in either panel anchors the same reference point
  const a1 = fw.inst._test.toAnchor(140, 50), a2 = fw.inst._test.toAnchor(340, 50);
  ok(near(a1.x, a2.x) && near(a1.y, a2.y) && near(a1.x, 120),
    "axis_zoom facets: a wheel/pinch in panel 2 anchors at the corresponding reference point");
  // zoom-to-selection in panel 2 frames the same region of every panel
  fw.inst._test.setView({ x: 0, y: 0, w: 400, h: 100 });
  fw.inst._test.zoomTo({ x0: 250, y0: 20, x1: 350, y1: 80 }, 0);
  const zv = fw.inst._test.getView();
  ok(zv && near(zv.x, 50) && near(zv.w, 100) && near(zv.y, 20) && near(zv.h, 60),
    "axis_zoom facets: zoom-to a region in panel 2 maps onto the reference frame");
  fw.inst._test.setView({ x: 0, y: 0, w: 400, h: 100 });
  ok(fw.inst._test.panTransforms().every((p) => p.transform === "matrix(1 0 0 1 0 0)"),
    "axis_zoom facets: reset restores identity on every panel");
  // a pannable group with no described panel (e.g. a polar panel) declines
  ok(mountFacet(facetSvg, [facetPanels[0]]).inst._test.axisZoomActive() === false,
    "axis_zoom facets: an undescribed pannable panel falls back to viewBox zoom");
}

// ===================== constant-size markers on zoom (2B) =====================
{
  const T = window.__vellumwidgetTest;
  // normalizeElements decodes the mark kind (columnar + scalar).
  ok(T.normalizeElements({ key: ["a", "b"], mark: ["point", "rect"], x0: [1, 2], y0: [1, 2], x1: [2, 3], y1: [2, 3] })[0].mark === "point",
    "constant-marks: normalizeElements decodes the mark kind");
  ok(T.normalizeElements({ key: "a", mark: "circle", x0: 1, y0: 1, x1: 2, y1: 2 })[0].mark === "circle",
    "constant-marks: mark kind survives the single-element (scalar) payload");

  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  // A glyph (point) and a positional mark (rect), both keyed, inside the pan group.
  // Plus a legend swatch (also a `point` glyph) OUTSIDE the pan group, positioned by
  // a `transform` attribute — it must NOT be counter-scaled (that would override the
  // attribute and fling it to a corner; see the legend-swatch regression below).
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="panel-1-1">' +
    '<path data-key="p" d="M98 48h4v4z"/><rect data-key="r" x="40" y="20" width="30" height="10"/>' +
    '</g></g>' +
    '<g data-vellum-panel="legend"><path data-key="legend:color:s" d="M2 2h5v5z" transform="matrix(1 0 0 1 185 40)"/></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  function mountCM(zoomMarks) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 200, 100);
    i.renderValue({
      svg: svg,
      elements: {
        key: ["p", "r", "legend:color:s"], mark: ["point", "rect", "point"],
        x0: [98, 40, 185], y0: [48, 20, 40], x1: [102, 70, 190], y1: [52, 30, 45],
        legend_for: [null, null, "color:s"]
      },
      panels: panel,
      options: { axisZoom: true, zoomMarks: zoomMarks, hover: true, select: true, zoom: true, selectMode: "multiple" }
    });
    return {
      el: e, inst: i, pt: e.querySelector('[data-key="p"]'), rect: e.querySelector('[data-key="r"]'),
      swatch: e.querySelector('[data-key="legend:color:s"]')
    };
  }

  // "fixed" (default): the glyph is counter-scaled from the shared vars; the
  // positional mark keeps a non-scaling stroke; neither the frame nor the data move yet.
  const fx = mountCM("fixed");
  ok(fx.inst._test.axisZoomActive() === true, "constant-marks: axis_zoom active for the test scene");
  ok(/scale\(var\(--vw-ix/.test(fx.pt.style.transform || fx.pt.getAttribute("style") || ""),
    "constant-marks: a point glyph counter-scales from the shared vars");
  ok((fx.pt.style.getPropertyValue("transform-box") || "") === "fill-box",
    "constant-marks: the glyph scales about its own bbox centre (transform-box: fill-box)");
  ok(fx.rect.getAttribute("vector-effect") === "non-scaling-stroke",
    "constant-marks: a positional mark (rect) gets a non-scaling stroke, not a counter-scale");
  ok(!/scale\(var/.test(fx.rect.style.transform || ""),
    "constant-marks: the positional mark is NOT counter-scaled (its geometry scales with the data)");
  // A legend swatch is a `point` glyph too, but it lives outside the pan group and is
  // positioned by a `transform` attribute. Counter-scaling it would set an inline
  // `transform` that overrides that attribute and drop its translate.
  ok(!/scale\(var/.test(fx.swatch.style.transform || ""),
    "constant-marks: a legend swatch (glyph outside the pan group) is NOT counter-scaled");
  ok(fx.swatch.getAttribute("transform") === "matrix(1 0 0 1 185 40)",
    "constant-marks: the legend swatch keeps its positioning transform attribute");
  const v0 = fx.inst._test.panScaleVars();
  ok(v0 && parseFloat(v0.ix) === 1 && parseFloat(v0.iy) === 1, "constant-marks: inverse-scale vars are 1 at the full view");
  // zoom in 2x in x: the inverse var tracks 1/sx so the glyph stays its pixel size.
  fx.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
  const v1 = fx.inst._test.panScaleVars();
  ok(v1 && Math.abs(parseFloat(v1.ix) - 0.5) < 1e-6 && Math.abs(parseFloat(v1.iy) - 0.5) < 1e-6,
    "constant-marks: inverse-scale vars track 1/scale on zoom (0.5 at 2x)");

  // "scale": opt out — glyphs are left to scale with the pan group (no counter-scale
  // style, no shared vars applied to the glyph).
  const sc = mountCM("scale");
  ok(!/scale\(var/.test(sc.pt.style.transform || ""), "constant-marks: zoom_marks='scale' leaves glyphs scaling (no counter-scale)");
  ok(sc.rect.getAttribute("vector-effect") !== "non-scaling-stroke",
    "constant-marks: zoom_marks='scale' leaves strokes scaling too (older behaviour)");
}

// ===================== declarative interactivity: conditions =====================
// A hover-driven condition on `color` with an explicit if_false: hovering one
// element keeps it, and recolours every OTHER element carrying the same condition
// tag to the if_false colour. Hover off reverts. An empty selection (empty=true)
// leaves the whole plot untouched (spotlight semantics).
{
  const elC = document.createElement("div");
  document.body.appendChild(elC);
  const svgC =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<path data-key="p1" fill="#ff0000" d="M5 5h4v4h-4z"/>' +
    '<path data-key="p2" fill="#00ff00" d="M20 5h4v4h-4z"/>' +
    '<path data-key="p3" fill="#0000ff" d="M35 5h4v4h-4z"/>' +
    "</g></svg>";
  const iC = widgetDef.factory(elC, 200, 100);
  iC.renderValue({
    svg: svgC,
    elements: [
      { key: "p1", cond: ["hi:color"] },
      { key: "p2", cond: ["hi:color"] },
      { key: "p3", cond: ["hi:color"] }
    ],
    interactions: {
      selections: [{ name: "hi", kind: "point", on: "hover", empty: true }],
      conditions: [{ selection: "hi", aes: "color", if_false: "#cccccc", empty: true }]
    },
    options: { hover: true, tooltip: true }
  });
  const svgCE = elC.querySelector("svg");
  const p1 = elC.querySelector('[data-key="p1"]');
  const p2 = elC.querySelector('[data-key="p2"]');
  const p3 = elC.querySelector('[data-key="p3"]');
  // initial (empty selection, empty=true): nothing recoloured
  ok(!p1.style.fill && !p2.style.fill, "condition: empty selection leaves all elements at their true colour");
  function fireC(type, target) {
    const ev = new window.MouseEvent(type, { bubbles: true, clientX: 6, clientY: 6 });
    Object.defineProperty(ev, "target", { value: target, enumerable: true });
    svgCE.dispatchEvent(ev);
  }
  fireC("pointermove", p1);
  ok(!p1.style.fill, "condition: hovered (member) element keeps its true colour");
  ok(p2.style.fill === "rgb(204, 204, 204)" || p2.style.fill === "#cccccc",
    "condition: non-member recoloured to if_false on hover");
  ok(p3.style.fill === "rgb(204, 204, 204)" || p3.style.fill === "#cccccc",
    "condition: every non-member recoloured to if_false");
  fireC("pointerleave", svgCE);
  ok(!p2.style.fill && !p3.style.fill, "condition: hover off reverts non-members to their true colour");
}

// ===================== VW-12: one element per point, or a fill + stroke twin =====================
// vellum draws a keyed point with a solid fill and an undashed solid stroke as
// ONE element carrying both paints; older vellum drew a fill element followed
// by a fill="none" stroke twin with the same data-key. The widget must behave
// the same on both: rings fully visible (paint-order: normal), every node of
// the key selected/hovered, and a condition recolouring only the paints a
// node actually uses.
{
  const css = document.getElementById("vellumwidget-style").textContent;
  ok(css.indexOf("paint-order: stroke fill") < 0,
    "VW-12: no ring rule paints the stroke under the fill (a single element would hide half the ring)");
  ok((css.match(/paint-order: normal;/g) || []).length === 3,
    "VW-12: hover, selection and focus rings all paint the stroke over the fill");

  const fixtures = {
    single:
      '<circle data-key="s1" cx="10" cy="10" r="3" fill="#ff0000" stroke="#000000" stroke-width="1"/>' +
      '<circle data-key="s2" cx="30" cy="10" r="3" fill="#00ff00" stroke="#000000" stroke-width="1"/>',
    twin:
      '<circle data-key="s1" cx="10" cy="10" r="3" fill="#ff0000"/>' +
      '<circle data-key="s1" cx="10" cy="10" r="3" fill="none" stroke="#000000" stroke-width="1"/>' +
      '<circle data-key="s2" cx="30" cy="10" r="3" fill="#00ff00"/>' +
      '<circle data-key="s2" cx="30" cy="10" r="3" fill="none" stroke="#000000" stroke-width="1"/>'
  };
  Object.keys(fixtures).forEach(function (kind) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const w = widgetDef.factory(e, 200, 100);
    w.renderValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g data-vellum-panel="panel-1-1">' +
        fixtures[kind] + "</g></svg>",
      elements: [
        { key: "s1", tooltip: "one", cond: ["hi:color"] },
        { key: "s2", tooltip: "two", cond: ["hi:color"] }
      ],
      interactions: {
        selections: [{ name: "hi", kind: "point", on: "hover", empty: true }],
        conditions: [{ selection: "hi", aes: "color", if_false: "#cccccc", empty: true }]
      },
      options: { hover: true, tooltip: true, select: true, selectMode: "multiple" }
    });
    const svgE = e.querySelector("svg");
    const s1 = e.querySelectorAll('[data-key="s1"]');
    const s2 = e.querySelectorAll('[data-key="s2"]');
    ok(s1.length === (kind === "single" ? 1 : 2), "VW-12 " + kind + ": fixture has the expected nodes per key");
    function fireS(type, target) {
      const ev = new window.MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 });
      Object.defineProperty(ev, "target", { value: target, enumerable: true });
      svgE.dispatchEvent(ev);
    }
    // hover the stroke node (the last one): tooltip + whole-key highlight
    fireS("pointermove", s1[s1.length - 1]);
    ok(e.querySelector(".vellumwidget-tip").textContent === "one", "VW-12 " + kind + ": hover resolves the key from any of its nodes");
    const grey = function (v) { return v === "rgb(204, 204, 204)" || v === "#cccccc"; };
    if (kind === "single") {
      ok(grey(s2[0].style.fill) && grey(s2[0].style.stroke),
        "VW-12 single: a condition recolours both the fill and the stroke of the one element");
    } else {
      ok(grey(s2[0].style.fill) && !s2[0].style.stroke,
        "VW-12 twin: a condition recolours the fill element's fill only");
      ok(!s2[1].style.fill && grey(s2[1].style.stroke),
        "VW-12 twin: a condition recolours the twin's stroke, never its fill:none");
    }
    ok(!s1[0].style.fill, "VW-12 " + kind + ": the hovered member keeps its colour");
    fireS("pointerleave", svgE);
    // click selects every node of the key
    fireS("click", s1[0]);
    ok(Array.prototype.every.call(s1, function (n) { return n.classList.contains("vellumwidget-selected"); }),
      "VW-12 " + kind + ": click selects every node of the key");
    ok(!s2[0].classList.contains("vellumwidget-selected"), "VW-12 " + kind + ": other keys stay unselected");
  });
}

// A condition with no if_false dims non-members via the theme-dim class (the
// default spotlight).
{
  const elD = document.createElement("div");
  document.body.appendChild(elD);
  const svgD =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g data-vellum-panel="panel-1-1">' +
    '<path data-key="d1" fill="#f00" d="M5 5h4v4h-4z"/>' +
    '<path data-key="d2" fill="#0f0" d="M20 5h4v4h-4z"/>' +
    "</g></svg>";
  const iD = widgetDef.factory(elD, 200, 100);
  iD.renderValue({
    svg: svgD,
    elements: [{ key: "d1", cond: ["hi:color"] }, { key: "d2", cond: ["hi:color"] }],
    interactions: {
      selections: [{ name: "hi", kind: "point", on: "hover", empty: true }],
      conditions: [{ selection: "hi", aes: "color", empty: true }]
    },
    options: { hover: true }
  });
  const svgDE = elD.querySelector("svg");
  const d1 = elD.querySelector('[data-key="d1"]');
  const d2 = elD.querySelector('[data-key="d2"]');
  const evD = new window.MouseEvent("pointermove", { bubbles: true, clientX: 6, clientY: 6 });
  Object.defineProperty(evD, "target", { value: d1, enumerable: true });
  svgDE.dispatchEvent(evD);
  ok(!d1.classList.contains("vellumwidget-cond-dim"), "condition(no if_false): member is not dimmed");
  ok(d2.classList.contains("vellumwidget-cond-dim"), "condition(no if_false): non-member gets the theme-dim class");
}

// ===================== declarative interactivity: filter_by =====================
// A click-driven point selection with a filter_by: clicking an element hides
// every OTHER element (display:none via the cross-filter class); clicking again
// empties the selection and (empty=true) shows everything.
{
  const elF = document.createElement("div");
  document.body.appendChild(elF);
  const svgF =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g data-vellum-panel="panel-1-1">' +
    '<path data-key="f1" d="M5 5h4v4h-4z"/>' +
    '<path data-key="f2" d="M20 5h4v4h-4z"/>' +
    '<path data-key="f3" d="M35 5h4v4h-4z"/>' +
    "</g></svg>";
  const iF = widgetDef.factory(elF, 200, 100);
  iF.renderValue({
    svg: svgF,
    elements: [
      { key: "f1", filt: ["pick"] },
      { key: "f2", filt: ["pick"] },
      { key: "f3", filt: ["pick"] }
    ],
    interactions: {
      selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
      filters: [{ selection: "pick" }]
    },
    options: { select: true, hover: true, selectMode: "multiple" }
  });
  const svgFE = elF.querySelector("svg");
  const f1 = elF.querySelector('[data-key="f1"]');
  const f2 = elF.querySelector('[data-key="f2"]');
  const f3 = elF.querySelector('[data-key="f3"]');
  function clickF(target) {
    const ev = new window.MouseEvent("click", { bubbles: true, clientX: 6, clientY: 6 });
    Object.defineProperty(ev, "target", { value: target, enumerable: true });
    svgFE.dispatchEvent(ev);
  }
  ok(!f2.classList.contains("vellumwidget-filtered"), "filter_by: empty selection shows everything");
  clickF(f1);
  ok(!f1.classList.contains("vellumwidget-filtered"), "filter_by: the selected element stays shown");
  ok(
    f2.classList.contains("vellumwidget-filtered") && f3.classList.contains("vellumwidget-filtered"),
    "filter_by: non-members are hidden"
  );
  clickF(f1);
  ok(
    !f2.classList.contains("vellumwidget-filtered") && !f3.classList.contains("vellumwidget-filtered"),
    "filter_by: clearing the selection shows everything again"
  );
}

// ============ declarative interactivity: cross-view filter (Option A) ============
// Two composition cells with per-cell-unique keys sharing a `join` id. A point
// selection in cell A, filter_by in cell B. Clicking a point in A hides only cell
// B's non-matching rows (matched by join) — cell A (the source) stays fully shown.
{
  const elX = document.createElement("div");
  document.body.appendChild(elX);
  const svgX =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g data-vellum-panel="panel-a">' +
    '<path data-key="s1:1" d="M5 5h4v4h-4z"/>' +
    '<path data-key="s1:2" d="M20 5h4v4h-4z"/>' +
    '<path data-key="s1:3" d="M35 5h4v4h-4z"/></g>' +
    '<g data-vellum-panel="panel-b">' +
    '<path data-key="s2:1" d="M5 50h4v4h-4z"/>' +
    '<path data-key="s2:2" d="M20 50h4v4h-4z"/>' +
    '<path data-key="s2:3" d="M35 50h4v4h-4z"/></g></svg>';
  const iX = widgetDef.factory(elX, 200, 200);
  iX.renderValue({
    svg: svgX,
    elements: [
      { key: "s1:1", join: "1" }, { key: "s1:2", join: "2" }, { key: "s1:3", join: "3" },
      { key: "s2:1", join: "1", filt: ["br"] },
      { key: "s2:2", join: "2", filt: ["br"] },
      { key: "s2:3", join: "3", filt: ["br"] }
    ],
    interactions: {
      selections: [{ name: "br", kind: "point", on: "click", empty: true }],
      filters: [{ selection: "br" }]
    },
    options: { select: true, hover: true, selectMode: "multiple" }
  });
  const svgXE = elX.querySelector("svg");
  const q = (k) => elX.querySelector('[data-key="' + k + '"]');
  function clickX(k) {
    const ev = new window.MouseEvent("click", { bubbles: true, clientX: 6, clientY: 6 });
    Object.defineProperty(ev, "target", { value: q(k), enumerable: true });
    svgXE.dispatchEvent(ev);
  }
  clickX("s1:2"); // select join "2" in the source cell A
  ok(!q("s1:1").classList.contains("vellumwidget-filtered") &&
     !q("s1:3").classList.contains("vellumwidget-filtered"),
    "cross-view: the source cell stays fully shown");
  ok(q("s2:1").classList.contains("vellumwidget-filtered") &&
     q("s2:3").classList.contains("vellumwidget-filtered"),
    "cross-view: the filtered cell hides rows whose join is not selected");
  ok(!q("s2:2").classList.contains("vellumwidget-filtered"),
    "cross-view: the filtered cell keeps the row matching the selection's join");
  clickX("s1:2"); // clear
  ok(!q("s2:1").classList.contains("vellumwidget-filtered"),
    "cross-view: clearing the selection restores the filtered cell");
}

// ============ hover coordinate mapping under CSS scaling (regression) ============
// An svg with width/height attributes that is CSS-scaled (the widget's
// max-width:100%) must still snap hover to the mark under the cursor. Previously
// toUser() trusted getScreenCTM(), which can report the attribute-based scale
// rather than the rendered one, under-mapping the pointer toward the top-left
// (hover highlighted a mark up-and-left of the cursor; click stayed correct
// because it uses the DOM target). We now map via getBoundingClientRect + viewBox.
{
  const elZ = document.createElement("div");
  document.body.appendChild(elZ);
  const svgZ =
    '<svg xmlns="http://www.w3.org/2000/svg" width="576" height="384" viewBox="0 0 576 384">' +
    '<g data-vellum-panel="p"><g data-vellum-pan="p">' +
    '<rect data-key="A" x="46" y="46" width="8" height="8"/>' +
    '<rect data-key="B" x="284" y="188" width="8" height="8"/>' +
    '<rect data-key="C" x="520" y="330" width="8" height="8"/>' +
    "</g></g></svg>";
  const iZ = widgetDef.factory(elZ, 576, 384);
  iZ.renderValue({
    svg: svgZ,
    elements: [
      { key: "A", x0: 46, y0: 46, x1: 54, y1: 54 },
      { key: "B", x0: 284, y0: 188, x1: 292, y1: 196 },
      { key: "C", x0: 520, y0: 330, x1: 528, y1: 338 }
    ],
    options: { hover: true, tooltip: true, nearest: true }
  });
  const svgZE = elZ.querySelector("svg");
  // Simulate a render scaled to 0.5: each mark's DOM node reports its true scaled
  // screen rect (scene coord * 0.5). A "buggy" svg getScreenCTM / rect that implies
  // scale 1 would offset hover toward the top-left; the calibrated hit-test (fit
  // screen<->bbox from the marks themselves) is immune. The dots' bbox centres are
  // 50, 288, 520 -> screen 25, 144, 260.
  const rectFor = (cx, cy) => () => ({ left: cx * 0.5 - 2, top: cy * 0.5 - 2, width: 4, height: 4, right: cx * 0.5 + 2, bottom: cy * 0.5 + 2 });
  elZ.querySelector('[data-key="A"]').getBoundingClientRect = rectFor(50, 50);
  elZ.querySelector('[data-key="B"]').getBoundingClientRect = rectFor(288, 192);
  elZ.querySelector('[data-key="C"]').getBoundingClientRect = rectFor(520, 330);
  // a misleading svg box (implies scale 1) — the calibration must ignore it
  svgZE.getBoundingClientRect = () => ({ left: 0, top: 0, width: 576, height: 384, right: 576, bottom: 384 });
  // cursor over dot B: scene centre (288,192) rendered at 0.5 -> client (144,96)
  const evZ = new window.MouseEvent("pointermove", { bubbles: true, clientX: 144, clientY: 96 });
  Object.defineProperty(evZ, "target", { value: svgZE, enumerable: true }); // open space -> nearest scan
  svgZE.dispatchEvent(evZ);
  const hlZ = Array.from(elZ.querySelectorAll(".vellumwidget-hl")).map((n) => n.getAttribute("data-key"));
  ok(hlZ.length === 1 && hlZ[0] === "B",
    "hover on a CSS-scaled svg snaps to the mark under the cursor (not offset top-left)");
}

// --- hover calibration: per panel, data marks only, cached (VW-3) ----------
// jsdom has no layout, so every mark's getBoundingClientRect is stubbed with the
// screen rect a real browser would report, and counted to check the cache.
{
  const svgCal =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="panel-1-1">' +
    '<rect data-key="a1" x="59" y="29" width="2" height="2"/><rect data-key="a2" x="139" y="69" width="2" height="2"/></g></g>' +
    '<g data-vellum-panel="panel-1-2" clip-path="url(#c1)"><g data-vellum-pan="panel-1-2">' +
    '<rect data-key="b1" x="259" y="29" width="2" height="2"/><rect data-key="b2" x="339" y="69" width="2" height="2"/></g></g>' +
    '<rect data-key="sw" x="389" y="4" width="2" height="2"/>' + // legend swatch, outside the panels
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-x-5"><text x="20" y="4" transform="matrix(1 0 0 1 220 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g></svg>';
  const lin = (hi) => ({ type: "continuous", transform: "identity", data_lo: 0, data_hi: hi, native_lo: 0, native_hi: hi });
  const eCal = document.createElement("div");
  document.body.appendChild(eCal);
  const iCal = widgetDef.factory(eCal, 400, 100);
  iCal.renderValue({
    svg: svgCal,
    elements: {
      key: ["a1", "a2", "b1", "b2", "sw"], mark: ["point", "point", "point", "point", "point"],
      legend_for: [null, null, null, null, "s1"],
      x0: [59, 139, 259, 339, 389], y0: [29, 69, 29, 69, 4], x1: [61, 141, 261, 341, 391], y1: [31, 71, 31, 71, 6]
    },
    panels: [
      { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, x: lin(100), y: lin(50) },
      { name: "panel-1-2", px0: 220, py0: 10, px1: 380, py1: 90, x: lin(100), y: lin(50) }
    ],
    options: { axisZoom: true, hover: true, zoom: true, nearest: true }
  });
  const svgCalE = eCal.querySelector("svg");
  let svgW = 400;
  svgCalE.getBoundingClientRect = () => ({ left: 0, top: 0, width: svgW, height: 100, right: svgW, bottom: 100 });
  ok(iCal._test.axisZoomActive() === true, "calibration: the two-facet fixture is axis-zoomable");
  // Each data mark is drawn at T_i(scene) of its own panel; the legend never moves.
  let T = [{ sx: 1, tx: 0, sy: 1, ty: 0 }, { sx: 1, tx: 0, sy: 1, ty: 0 }];
  let rectCalls = 0;
  const stub = (key, cx, cy, panel) => {
    eCal.querySelector('[data-key="' + key + '"]').getBoundingClientRect = () => {
      rectCalls++;
      const t = panel == null ? { sx: 1, tx: 0, sy: 1, ty: 0 } : T[panel];
      const x = t.sx * cx + t.tx, y = t.sy * cy + t.ty;
      return { left: x - t.sx, top: y - t.sy, width: 2 * t.sx, height: 2 * t.sy, right: x + t.sx, bottom: y + t.sy };
    };
  };
  stub("a1", 60, 30, 0); stub("a2", 140, 70, 0); stub("b1", 260, 30, 1); stub("b2", 340, 70, 1); stub("sw", 390, 5, null);
  const close = (p, x, y) => p && Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;
  ok(close(iCal._test.clientToScene(100, 50), 100, 50) && close(iCal._test.clientToScene(300, 50), 300, 50),
    "calibration: unzoomed, client px map 1:1 onto the scene");
  // 2x about the reference panel's centre: T1 = (2, -100, 2, -50), T2 = (2, -300, 2, -50).
  iCal._test.setView({ x: 50, y: 25, w: 200, h: 50 });
  T = [{ sx: 2, tx: -100, sy: 2, ty: -50 }, { sx: 2, tx: -300, sy: 2, ty: -50 }];
  const c1 = iCal._test.clientToScene(100, 50);
  ok(close(c1, 100, 50), "calibration: zoomed, a point in panel 1 maps through panel 1's own fit");
  const c2 = iCal._test.clientToScene(300, 70);
  ok(close(c2, 300, 60), "calibration: zoomed, a point in panel 2 maps through panel 2's own fit");
  const c3 = iCal._test.clientToScene(41, 82); // T1(a1)=(20,10)... T1(a2)=(180,90): near a2's corner
  ok(close(c3, 70.5, 66), "calibration: the unscaled legend swatch does not skew the zoomed fit");
  // Cached: further lookups at the same view and size measure no marks.
  const n0 = rectCalls;
  for (let k = 0; k < 20; k++) iCal._test.clientToScene(100 + k, 50);
  ok(rectCalls === n0, "calibration: the fit is cached between hover frames (no per-frame mark layout)");
  // A view change re-measures.
  iCal._test.setView({ x: 0, y: 0, w: 200, h: 100 });
  T = [{ sx: 1, tx: 0, sy: 1, ty: 0 }, { sx: 1, tx: 0, sy: 1, ty: 0 }];
  ok(close(iCal._test.clientToScene(300, 50), 300, 50) && rectCalls > n0, "calibration: a view change invalidates the cached fit");
  // A resized svg box re-measures too (the browser rescales the marks).
  const n1 = rectCalls;
  svgW = 800;
  T = [{ sx: 2, tx: 0, sy: 1, ty: 0 }, { sx: 2, tx: 0, sy: 1, ty: 0 }];
  ok(close(iCal._test.clientToScene(600, 50), 300, 50) && rectCalls > n1, "calibration: a resized svg invalidates the cached fit");
  // Hovering in open space resolves the nearest mark through the per-panel fit.
  svgW = 400;
  T = [{ sx: 2, tx: -100, sy: 2, ty: -50 }, { sx: 2, tx: -300, sy: 2, ty: -50 }];
  iCal._test.setView({ x: 50, y: 25, w: 200, h: 50 });
  const evC = new window.MouseEvent("pointermove", { bubbles: true, clientX: 379, clientY: 89 }); // T2(b2) = (380, 90)
  Object.defineProperty(evC, "target", { value: svgCalE, enumerable: true });
  svgCalE.dispatchEvent(evC);
  const hlC = Array.from(eCal.querySelectorAll(".vellumwidget-hl")).map((n) => n.getAttribute("data-key"));
  ok(hlC.length === 1 && hlC[0] === "b2", "calibration: zoomed facet hover picks the mark under the cursor");
}

// --- axis_zoom re-ticks a secondary axis through its transform (VW-10b) ----
{
  const TS = window.__vellumwidgetTest;
  const pl = TS.parseSecLabels(["$1,000", "$2,500", "$4,000"]);
  ok(pl && pl.prefix === "$" && pl.comma && pl.vals.join() === "1000,2500,4000", "sec axis: decorated labels parse (prefix, commas)");
  ok(TS.parseSecLabels(["low", "high"]) === null && TS.parseSecLabels(["1 a", "2 b"]) === null,
    "sec axis: non-numeric or inconsistently decorated labels decline");
  const lm = TS.secAxisMap([0, 10, 20], ["32", "50", "68"]);
  ok(lm && lm.linear, "sec axis: collinear pairs give an exact linear map");
  const lt = TS.secTicks(lm, 0, 100, 5).map((t) => t.label + "@" + Math.round(t.n * 1000) / 1000);
  ok(lt[0] === "50@10" && lt.indexOf("200@93.333") >= 0, "sec axis: linear ticks extrapolate past the static breaks");
  const ct = TS.secTicks(TS.secAxisMap([0, 1], ["$0", "$1,000"]), 0, 10, 4).map((t) => t.label);
  ok(ct.indexOf("$4,000") >= 0 && ct.indexOf("$10,000") >= 0, "sec axis: labels keep the prefix and thousands commas");
  const nm = TS.secAxisMap([0, 1, 2], ["1", "10", "100"]);
  ok(nm && !nm.linear && Math.abs(TS.secTicks(nm, 0, 2, 4).filter((t) => t.label === "60")[0].n - (1 + 50 / 90)) < 1e-9,
    "sec axis: a non-linear transform interpolates between the static pairs");
  ok(TS.secAxisMap([0, 1, 2], ["1", "3", "2"]) === null, "sec axis: non-monotone labels decline");

  const secSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><path data-key="a" d="M99 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-1"><text x="20" y="4" transform="matrix(1 0 0 1 0 90)" text-anchor="middle" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="16" y="90" text-anchor="end" font-size="12">0</text></g>' +
    // right axis, sec = 2 * y with a unit suffix: native 10..40 sit at y = 74, 58, 42, 26
    '<g data-vellum-panel="axis-y2-1">' +
    '<text x="184" y="74" text-anchor="start" dominant-baseline="central" font-size="12">20 km</text>' +
    '<text x="184" y="58" text-anchor="start" dominant-baseline="central" font-size="12">40 km</text>' +
    '<text x="184" y="42" text-anchor="start" dominant-baseline="central" font-size="12">60 km</text>' +
    '<text x="184" y="26" text-anchor="start" dominant-baseline="central" font-size="12">80 km</text></g>' +
    // top axis, sec = x / 10: native 25, 50, 75 at x = 60, 100, 140
    '<g data-vellum-panel="axis-x2-1">' +
    '<text x="60" y="6" text-anchor="middle" font-size="12">2.5</text>' +
    '<text x="100" y="6" text-anchor="middle" font-size="12">5.0</text>' +
    '<text x="140" y="6" text-anchor="middle" font-size="12">7.5</text></g></svg>';
  const eS = document.createElement("div");
  document.body.appendChild(eS);
  const iS = widgetDef.factory(eS, 200, 100);
  iS.renderValue({
    svg: secSvg,
    elements: { key: ["a"], mark: ["point"], x0: [99], y0: [49], x1: [101], y1: [51] },
    panels: [{
      name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
    }],
    options: { axisZoom: true, hover: true, zoom: true }
  });
  ok(iS._test.axisZoomActive() === true, "sec axis: the fixture is axis-zoomable");
  const labsAt = (pred) => iS._test.retickLabels().filter(pred);
  ok(labsAt((l) => / km$/.test(l.text)).length > 0 && labsAt((l) => l.x === 184).every((l) => / km$/.test(l.text)),
    "sec axis: unzoomed, the right axis is re-drawn with its unit");
  ok(labsAt((l) => l.text === "0").length >= 1 && labsAt((l) => / km$/.test(l.text) && l.x !== 184).length === 0,
    "sec axis: secondary labels never replace the primary ones");
  iS._test.setView({ x: 50, y: 25, w: 100, h: 50 }); // 2x about the centre: y native 12.5..37.5, x 25..75
  const km = labsAt((l) => / km$/.test(l.text)).map((l) => l.text + "@" + l.y);
  ok(km.indexOf("50 km@50") >= 0 && km.indexOf("30 km@82") >= 0 && km.indexOf("70 km@18") >= 0 && km.indexOf("20 km@98") < 0,
    "sec axis: zoomed, the right axis re-ticks in its own units at the right height");
  const top = labsAt((l) => l.y === 6).map((l) => l.text + "@" + l.x);
  ok(top.indexOf("5@100") >= 0 && top.indexOf("3@36") >= 0 && top.indexOf("7@164") >= 0,
    "sec axis: zoomed, the top axis re-ticks through x / 10");
}

// --- graph neighbour highlighting (select_neighbours preset) ---------------
// Triangle a-b-c plus a pendant d off c. Edges carry source/target endpoint keys.
{
  const gsvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<path data-key="e1" d="M0 0L10 10"/>' +
    '<path data-key="e2" d="M10 10L20 0"/>' +
    '<path data-key="e3" d="M20 0L0 0"/>' +
    '<path data-key="e4" d="M20 0L30 30"/>' +
    '<circle data-key="a" cx="0" cy="0" r="3"/>' +
    '<circle data-key="b" cx="10" cy="10" r="3"/>' +
    '<circle data-key="c" cx="20" cy="0" r="3"/>' +
    '<circle data-key="d" cx="30" cy="30" r="3"/>' +
    "</g></svg>";
  const edges = [
    { key: "e1", source: "a", target: "b" },
    { key: "e2", source: "b", target: "c" },
    { key: "e3", source: "c", target: "a" },
    { key: "e4", source: "c", target: "d" }
  ];
  const nodes = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
  const nbrSel = { name: "nbr", kind: "point", on: "hover", expand: { mode: "neighbours", degree: 1, edges: true } };

  const sortJSON = (xs) => JSON.stringify(xs.slice().sort());

  // degree-1 preset
  const elG = document.createElement("div");
  document.body.appendChild(elG);
  const instG = widgetDef.factory(elG, 300, 300);
  instG.renderValue({
    svg: gsvg,
    elements: nodes.concat(edges),
    interactions: { selections: [nbrSel] },
    options: { tooltip: true, hover: true, select: true }
  });
  const T = instG._test;
  const adj = T.graphAdjacency();
  ok(adj.neighbourExpand && adj.neighbourExpand.degree === 1, "select_neighbours enables the neighbourhood projection");
  ok(adj.edgeEndpoints.e1 && adj.edgeEndpoints.e1[0] === "a" && adj.edgeEndpoints.e1[1] === "b", "edge endpoints reconstructed");
  ok(sortJSON(adj.incidentEdges.c) === sortJSON(["e2", "e3", "e4"]), "node c's incident edges reconstructed");
  ok(sortJSON(T.linkedKeys("c")) === sortJSON(["a", "b", "c", "d", "e2", "e3", "e4"]), "hover node -> node + incident edges + neighbour nodes");
  ok(sortJSON(T.linkedKeys("e1")) === sortJSON(["a", "b", "e1"]), "hover edge -> the edge + its two endpoints");
  // a hovered node dims the rest and highlights its neighbourhood in the DOM
  const evc = new window.MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(evc, "target", { value: elG.querySelector('[data-key="c"]'), enumerable: true });
  elG.querySelector("svg").dispatchEvent(evc);
  const hl = Array.from(elG.querySelectorAll(".vellumwidget-hl")).map((n) => n.getAttribute("data-key")).sort();
  ok(sortJSON(hl) === sortJSON(["a", "b", "c", "d", "e2", "e3", "e4"]), "DOM highlights the whole neighbourhood on node hover");
  ok(elG.classList.contains("vellumwidget-hovering"), "root dims non-neighbourhood elements");

  // edges = FALSE excludes incident edges
  const elN = document.createElement("div");
  document.body.appendChild(elN);
  const instN = widgetDef.factory(elN, 300, 300);
  instN.renderValue({
    svg: gsvg,
    elements: nodes.concat(edges),
    interactions: { selections: [{ name: "nbr", kind: "point", on: "hover", expand: { mode: "neighbours", degree: 1, edges: false } }] },
    options: { hover: true }
  });
  ok(sortJSON(instN._test.linkedKeys("c")) === sortJSON(["a", "b", "c", "d"]), "edges = FALSE highlights only nodes");

  // degree 2 from a reaches d (a-c-d)
  const elD = document.createElement("div");
  document.body.appendChild(elD);
  const instD = widgetDef.factory(elD, 300, 300);
  instD.renderValue({
    svg: gsvg,
    elements: nodes.concat(edges),
    interactions: { selections: [{ name: "nbr", kind: "point", on: "hover", expand: { mode: "neighbours", degree: 2, edges: false } }] },
    options: { hover: true }
  });
  ok(instD._test.linkedKeys("a").indexOf("d") !== -1, "degree = 2 reaches neighbours-of-neighbours");

  // without the preset, a graph node hover stays single-element
  const elP = document.createElement("div");
  document.body.appendChild(elP);
  const instP = widgetDef.factory(elP, 300, 300);
  instP.renderValue({ svg: gsvg, elements: nodes.concat(edges), options: { hover: true } });
  ok(sortJSON(instP._test.linkedKeys("c")) === sortJSON(["c"]), "no select_neighbours -> node hover highlights only itself");
  ok(instP._test.graphAdjacency().neighbourExpand === null, "no preset -> no neighbourhood projection");
}

// --- nearest-hover skips graph edges (bbox of a diagonal edge is huge) -------
{
  const eG = document.createElement("div");
  document.body.appendChild(eG);
  const iG = widgetDef.factory(eG, 200, 200);
  iG.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g data-vellum-panel="panel-1-1">' +
      '<circle data-key="n1" cx="1" cy="1" r="1"/><path data-key="ed" d="M0 0L100 100"/></g></svg>',
    // n1: a small node bbox at the corner; ed: an edge whose bbox spans the whole
    // 100x100 diagonal. source/target present only on the edge.
    elements: { key: ["n1", "ed"], x0: [0, 0], y0: [0, 0], x1: [2, 100], y1: [2, 100], source: [null, "n1"], target: [null, "n2"] },
    options: { hover: true }
  });
  const T2 = iG._test;
  // (90,10) is deep inside the edge's bbox (bbox-distance 0) but far from the node;
  // the snap must skip the edge and return the node, not the edge.
  ok(T2.nearestKeyAt(90, 10, 1000) === "n1", "nearest-hover in open space skips the edge (snaps to the node)");
  ok(T2.nearestKeyAt(1, 1, 1000) === "n1", "nearest-hover still finds a node when near it");
}

// --- click-to-source (inspect_source): click a grob -> Shiny input + DOM event -
{
  const eS = document.createElement("div");
  eS.id = "wid_src";
  document.body.appendChild(eS);
  const iS = widgetDef.factory(eS, 200, 100);

  // capture Shiny read-back
  const shinyCalls = [];
  HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: (id, v) => shinyCalls.push({ id: id, v: v }) };
  // capture the bubbling DOM event
  let sourceEvent = null;
  document.addEventListener("vellum:source", (e) => (sourceEvent = e));

  iS.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<g data-vellum-panel="panel-1-1">' +
      '<path data-key="a" data-vellum-id="layer-1-point-g1" d="M10 10h5v5h-5z"/>' +
      '<path data-key="b" data-vellum-id="layer-1-point-g2" d="M40 10h5v5h-5z"/>' +
      '<path data-key="c" data-vellum-id="layer-1-point-g3" d="M70 10h5v5h-5z"/>' +
      "</g></svg>",
    elements: [{ key: "a" }, { key: "b" }, { key: "c" }],
    provenance: {
      on: "click",
      // g3's rows is a SCALAR, not an array: htmlwidgets auto-unboxes a
      // single-element group. The runtime must still handle it (regression).
      byId: { "layer-1-point-g1": [1, 3, 5], "layer-1-point-g2": [2, 4], "layer-1-point-g3": 2 },
      fields: ["wt", "mpg"],
      values: [
        { wt: 2.1, mpg: 22 }, { wt: 3.4, mpg: 18 }, { wt: 1.9, mpg: 30 },
        { wt: 3.9, mpg: 15 }, { wt: 2.5, mpg: 24 }
      ]
    },
    options: { select: true, selectMode: "multiple" }
  });

  const svgS = eS.querySelector("svg");
  const nodeA = eS.querySelector('[data-key="a"]');
  const clickS = (target) => {
    const ev = new window.MouseEvent("click", { bubbles: true, clientX: 12, clientY: 12 });
    Object.defineProperty(ev, "target", { value: target, enumerable: true });
    svgS.dispatchEvent(ev);
  };

  clickS(nodeA);
  ok(sourceEvent !== null, "clicking a grob fires a vellum:source event");
  ok(
    sourceEvent && JSON.stringify(sourceEvent.detail.rows) === JSON.stringify([1, 3, 5]),
    "the event carries the clicked grob's source rows (via data-vellum-id)"
  );
  ok(
    sourceEvent && sourceEvent.detail.values && sourceEvent.detail.values.length === 3,
    "values are resolved for the grob's rows when inspect_source(values=TRUE)"
  );
  const src = shinyCalls.find((c) => c.id === "wid_src_source");
  ok(!!src, "Shiny input$<id>_source is set on click");
  ok(src && JSON.stringify(src.v.rows) === JSON.stringify([1, 3, 5]), "the Shiny input carries the rows");
  ok(
    eS.querySelector(".vellumwidget-source") !== null,
    "a source popover is shown when values are present"
  );

  // a single-element group serialised as a scalar (auto-unbox) still resolves
  sourceEvent = null;
  clickS(eS.querySelector('[data-key="c"]'));
  ok(
    sourceEvent && JSON.stringify(sourceEvent.detail.rows) === JSON.stringify([2]),
    "a scalar (auto-unboxed single-row) group is coerced to a one-element array"
  );

  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}

// --- click-to-source popover: data is shown as text, never parsed as HTML ---
// Regression (XSS): the popover used to be built via innerHTML with only a
// tag-stripping regex, which an UNTERMINATED tag slips past.
{
  const eX = document.createElement("div");
  eX.id = "wid_src_xss";
  document.body.appendChild(eX);
  const iX = widgetDef.factory(eX, 200, 100);
  const evil = "<img src=x onerror=alert(1) //";
  const evilField = "<svg onload=alert(2) ";
  iX.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<g data-vellum-panel="panel-1-1">' +
      '<path data-key="a" data-vellum-id="layer-1-point-g1" d="M10 10h5v5h-5z"/>' +
      "</g></svg>",
    elements: [{ key: "a" }],
    provenance: {
      on: "click",
      byId: { "layer-1-point-g1": [1] },
      fields: ["name", evilField],
      values: [{ name: evil, [evilField]: "<b>bold</b>" }]
    },
    options: {}
  });
  const svgX = eX.querySelector("svg");
  const ev = new window.MouseEvent("click", { bubbles: true, clientX: 12, clientY: 12 });
  Object.defineProperty(ev, "target", { value: eX.querySelector('[data-key="a"]'), enumerable: true });
  svgX.dispatchEvent(ev);
  const pop = eX.querySelector(".vellumwidget-source");
  ok(pop !== null, "xss: the source popover is shown");
  ok(pop && pop.querySelector("img") === null, "xss: an unterminated <img> in a value creates no element");
  ok(pop && pop.querySelector("b") === null, "xss: markup in a value is not rendered");
  ok(
    pop && pop.querySelector("[onerror], [onload]") === null,
    "xss: no element carries an event-handler attribute"
  );
  ok(pop && pop.querySelectorAll("td")[0].textContent === evil, "xss: a value is shown literally, as text");
  ok(pop && pop.querySelectorAll("td")[1].textContent === "<b>bold</b>", "xss: markup is shown literally");
  ok(pop && pop.querySelectorAll("th")[1].textContent === evilField, "xss: a field name is shown literally");
}

// --- click-to-source: each mark reads its OWN source table ---
// A layer drawn from its own `data =` indexes that layer's table (`sourceOf` +
// `sources`), not the plot data; plot-data and untagged marks keep the top-level
// fields/values.
{
  // the pure resolver
  const provP = {
    on: "click",
    byId: {},
    fields: ["wt", "mpg"],
    values: [{ wt: 1, mpg: 2 }],
    sourceOf: { L: "layer:2", M: "layer:9" },
    sources: { "layer:2": { fields: "lab", values: [{ lab: "x" }] } }
  };
  const tP = T.sourceTable(provP, "P");
  ok(tP.source === "plot" && tP.fields === provP.fields, "sourceTable: an untagged id reads the plot data");
  const tL = T.sourceTable(provP, "L");
  ok(
    tL.source === "layer:2" && JSON.stringify(tL.fields) === '["lab"]' && tL.values[0].lab === "x",
    "sourceTable: a layer id reads its own table (an auto-unboxed field coerced to an array)"
  );
  const tM = T.sourceTable(provP, "M");
  ok(tM.source === "plot", "sourceTable: a source with no shipped table falls back to the plot data");
  const tOld = T.sourceTable({ on: "click", byId: {}, fields: ["a"] }, "L");
  ok(tOld.source === "plot" && tOld.fields[0] === "a", "sourceTable: an older payload reads the plot data");

  const eL = document.createElement("div");
  eL.id = "wid_src_layer";
  document.body.appendChild(eL);
  const iL = widgetDef.factory(eL, 200, 100);
  const shinyCallsL = [];
  HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: (id, v) => shinyCallsL.push({ id: id, v: v }) };
  let evL = null;
  eL.addEventListener("vellum:source", (e) => (evL = e));
  iL.renderValue({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<g data-vellum-panel="panel-1-1">' +
      '<path data-key="p" data-vellum-id="layer-1-point-g1" d="M10 10h5v5h-5z"/>' +
      '<path data-key="n" data-vellum-id="layer-2-point-g1" d="M40 10h5v5h-5z"/>' +
      "</g></svg>",
    elements: [{ key: "p" }, { key: "n" }],
    provenance: {
      on: "click",
      byId: { "layer-1-point-g1": [1, 2], "layer-2-point-g1": [2] },
      fields: ["wt", "mpg"],
      values: [{ wt: 2.6, mpg: 21 }, { wt: 2.9, mpg: 21.5 }],
      sourceOf: { "layer-2-point-g1": "layer:2" },
      sources: {
        "layer:2": {
          fields: ["wt", "mpg", "lab"],
          values: [{ wt: 2, mpg: 30, lab: "light" }, { wt: 5, mpg: 12, lab: "heavy" }]
        }
      }
    },
    options: {}
  });
  const svgL = eL.querySelector("svg");
  const clickL = (target) => {
    const ev = new window.MouseEvent("click", { bubbles: true, clientX: 12, clientY: 12 });
    Object.defineProperty(ev, "target", { value: target, enumerable: true });
    svgL.dispatchEvent(ev);
  };

  // a layer-data mark: its own fields and rows
  clickL(eL.querySelector('[data-key="n"]'));
  ok(evL && evL.detail.source === "layer:2", "layer source: the event names the mark's source table");
  ok(
    evL && JSON.stringify(evL.detail.fields) === '["wt","mpg","lab"]',
    "layer source: the event carries the layer's fields"
  );
  ok(
    evL && evL.detail.values.length === 1 && evL.detail.values[0].lab === "heavy",
    "layer source: rows index the layer's table, not the plot data"
  );
  const shL = shinyCallsL.filter((c) => c.id === "wid_src_layer_source").pop();
  ok(shL && shL.v.source === "layer:2" && shL.v.fields.length === 3, "layer source: the Shiny input carries source + fields");
  const popL = eL.querySelector(".vellumwidget-source");
  ok(
    popL && Array.from(popL.querySelectorAll("th")).map((t) => t.textContent).join(",") === "wt,mpg,lab",
    "layer source: the popover header shows the layer's fields"
  );
  ok(
    popL && Array.from(popL.querySelectorAll("td")).map((t) => t.textContent).join(",") === "5,12,heavy",
    "layer source: the popover shows the layer's row"
  );

  // a plot-data mark: unchanged
  evL = null;
  clickL(eL.querySelector('[data-key="p"]'));
  ok(evL && evL.detail.source === "plot", "plot source: the event names the plot table");
  ok(
    evL && JSON.stringify(evL.detail.fields) === '["wt","mpg"]' && evL.detail.values.length === 2,
    "plot source: plot fields and rows, as before"
  );
  const popP = eL.querySelector(".vellumwidget-source");
  ok(
    popP && Array.from(popP.querySelectorAll("th")).map((t) => t.textContent).join(",") === "wt,mpg",
    "plot source: the popover shows the plot fields"
  );

  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}

// ============ WI-3: exact hit-testing from element_geometry() ===============
//
// A bbox is right for a brush and wrong for picking. Each case below is one a
// bbox cannot get right: a diagonal matched from the far corner of the box its
// endpoints span, a graph edge (which had to be excluded from the open-space
// snap entirely because of that), and a click in the middle of a filled polygon.

// --- the pure distance function ---
ok(T.distToSegment2(0, 0, 0, 0, 10, 0) === 0, "distToSegment2: on the endpoint");
ok(T.distToSegment2(5, 3, 0, 0, 10, 0) === 9, "distToSegment2: perpendicular from the middle");
ok(T.distToSegment2(-4, 0, 0, 0, 10, 0) === 16, "distToSegment2: beyond the end clamps to it");

{
  // A 100x100 box with a diagonal from its top-left to its bottom-right.
  const gx = Float64Array.from([0, 100]);
  const gy = Float64Array.from([0, 100]);
  const seg = { kind: "segment", at: 0, n: 2 };
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  ok(Math.abs(T.distToGeom(50, 50, seg, gx, gy, box)) < 1e-9, "distToGeom: on the diagonal is 0");
  // The far corner of the bbox: bbox distance 0, true distance 70.7.
  ok(T.distToBbox(100, 0, box) === 0, "…the bbox says 0 at the opposite corner");
  ok(
    Math.abs(T.distToGeom(100, 0, seg, gx, gy, box) - Math.sqrt(2) * 50) < 1e-6,
    "…the geometry says 70.7 there — the point of the whole feature"
  );

  // A filled triangle: zero anywhere inside, positive outside.
  const px = Float64Array.from([0, 100, 50]);
  const py = Float64Array.from([0, 0, 80]);
  const tri = { kind: "polygon", at: 0, n: 3 };
  const tbox = { x0: 0, y0: 0, x1: 100, y1: 80 };
  ok(T.distToGeom(50, 30, tri, px, py, tbox) === 0, "distToGeom: inside a filled polygon is 0");
  ok(T.distToGeom(5, 70, tri, px, py, tbox) > 0, "…and positive in the box but outside the shape");

  // A point mark's radius comes from its bbox, since the geometry is a centre.
  const c = Float64Array.from([50]);
  const dot = { kind: "point", at: 0, n: 1 };
  const dbox = { x0: 45, y0: 45, x1: 55, y1: 55 };
  ok(T.distToGeom(52, 50, dot, c, c, dbox) === 0, "distToGeom: inside the glyph is 0");
  ok(Math.abs(T.distToGeom(60, 50, dot, c, c, dbox) - 5) < 1e-9, "…measured from the disc, not the centre");
}

// --- end to end, through a mounted widget ---
{
  // Two nodes joined by a diagonal edge, plus a filled region. The edge's bbox is
  // the whole rectangle between the nodes.
  const gsvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">' +
    '<path data-key="n1" d="M18 18h4v4h-4z"/>' +
    '<path data-key="n2" d="M198 158h4v4h-4z"/>' +
    '<path data-key="e1" d="M20 20L200 160"/>' +
    '<path data-key="rg" d="M220 20L290 20L255 90Z"/>' +
    "</svg>";
  const payload = {
    svg: gsvg,
    elements: [
      { key: "n1", x0: 14, y0: 14, x1: 26, y1: 26, tooltip: "node 1" },
      { key: "n2", x0: 194, y0: 154, x1: 206, y1: 166, tooltip: "node 2" },
      // the edge: bbox spans both endpoints, and it declares its endpoints, which
      // is what the old code keyed the open-space exclusion off
      { key: "e1", x0: 20, y0: 20, x1: 200, y1: 160, tooltip: "edge", source: "n1", target: "n2" },
      { key: "rg", x0: 220, y0: 20, x1: 290, y1: 90, tooltip: "region" }
    ],
    geometry: {
      key: ["n1", "n2", "e1", "rg"],
      kind: ["point", "point", "segment", "polygon"],
      n: [1, 1, 2, 3],
      x: [20, 200, 20, 200, 220, 290, 255],
      y: [20, 160, 20, 160, 20, 20, 90]
    },
    options: { tooltip: true, hover: true, select: true, nearest: true, selectMode: "multiple" }
  };
  const eG = document.createElement("div");
  document.body.appendChild(eG);
  const instG = widgetDef.factory(eG, 300, 200);
  instG.renderValue(payload);
  const tg = instG._test;

  ok(tg.haveGeometry(), "the geometry block is parsed off the payload");
  ok(tg.geomVertexCount() === 7, "every vertex is unpacked");

  // 1. a graph edge is hoverable, and no longer excluded from the open-space snap
  ok(tg.nearestKeyAt(110, 90, 8) === "e1", "a cursor on the edge picks the edge");
  ok(tg.distToKey(110, 90, "e1") < 1, "…at essentially zero distance");

  // 2. a diagonal is not matched from the far corner of its bbox
  ok(tg.distToBbox === undefined, "(the instance seam exposes distances, not the pure helper)");
  ok(tg.distToKey(200, 20, "e1") > 100, "the edge is far from the opposite corner of its bbox");
  ok(tg.nearestKeyAt(200, 20, 20) !== "e1", "…so the opposite corner does not pick the edge");
  ok(tg.nearestKeyAt(200, 20, 15) === null, "…and with nothing else in range, picks nothing at all");

  // 3. a click inside a filled region selects that region
  ok(tg.distToKey(255, 40, "rg") === 0, "a point inside the polygon is at distance 0");
  ok(tg.nearestKeyAt(255, 40, 8) === "rg", "…and picks the region, not its nearest border");

  // the nearest node still wins next to a node, with the edge available
  ok(tg.nearestKeyAt(22, 22, 10) === "n1", "next to a node, the node wins over the edge it touches");
}

// --- a multi-ring path: rings are measured separately ----------------------
//
// A `path` ships every ring's vertices concatenated. Read as ONE closed ring it
// invents a phantom edge from each ring's last vertex to the next ring's first,
// and closes the last ring back to the very first vertex -- so the boundary a
// client measures against is not the one the engine measured. `nr`/`rl` carry
// the ring lengths and fix that.
//
// The fixture is a 200x200 square with a 40x40 square hole, as one keyed path.
// Containment follows the fill rule across all rings, as the engine's
// `pick_table` does: a point in the hole is not a hit, and its distance is to
// the hole's boundary.
{
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' +
    '<g data-vellum-id="p1"><path data-key="holed" d="M40 40h200v200h-200z"/></g>' +
    "</svg>";
  // inner: the hole's vertices, in the same (cw) or the reverse (ccw) direction
  const SAME = { x: [120, 160, 160, 120], y: [120, 120, 160, 160] };
  const REV = { x: [120, 120, 160, 160], y: [120, 160, 160, 120] };
  const mk = (withRings, eo, inner) => {
    inner = inner || SAME;
    const payload = {
      svg: svg,
      elements: [{ key: "holed", x0: 40, y0: 40, x1: 240, y1: 240, tooltip: "holed" }],
      geometry: {
        key: ["holed"],
        kind: ["path"],
        n: [8],
        x: [40, 240, 240, 40].concat(inner.x),
        y: [40, 40, 240, 240].concat(inner.y)
      },
      options: { tooltip: true, hover: true, nearest: true }
    };
    if (withRings) {
      payload.geometry.nr = [2];
      payload.geometry.rl = [4, 4];
    }
    if (eo) payload.geometry.eo = [1];
    const el = document.createElement("div");
    document.body.appendChild(el);
    const inst = widgetDef.factory(el, 300, 300);
    inst.renderValue(payload);
    return inst._test;
  };
  const tr = mk(true, true);
  const tn = mk(false, true);

  ok(tr.geomVertexCount() === 8, "both rings' vertices are unpacked");

  // Even-odd: the hole is a hole -- 20px from its nearest edge.
  ok(Math.abs(tr.distToKey(140, 140, "holed") - 20) < 0.01,
     "even-odd: a point in the hole is not a hit, 20px from the hole's edge");
  // A point in the annulus is filled.
  ok(tr.distToKey(60, 140, "holed") === 0, "a point in the ring body is inside");
  // The phantom-edge reading gets this wrong: the spurious edges cut across the
  // shape, so the ring body lands outside its idea of the boundary.
  ok(tn.distToKey(60, 140, "holed") > 0, "…which the one-ring reading misses");

  // Nonzero winding (no `eo`, the engine's default): a same-direction inner
  // ring stays filled, a reversed one is a hole.
  ok(mk(true, false, SAME).distToKey(140, 140, "holed") === 0,
     "nonzero: a same-direction inner ring is filled");
  ok(Math.abs(mk(true, false, REV).distToKey(140, 140, "holed") - 20) < 0.01,
     "nonzero: a reversed inner ring is a hole");
  ok(mk(true, false, REV).distToKey(60, 140, "holed") === 0,
     "nonzero: the ring body is still inside");

  // Just outside the left edge: the true distance is to that edge, 20px away.
  // Without rings a phantom edge is nearer than the real boundary, so the
  // answer is not merely different, it is much larger.
  ok(Math.abs(tr.distToKey(20, 140, "holed") - 20) < 0.01, "outside, the distance is to the real edge (20px)");
  ok(tn.distToKey(20, 140, "holed") > 60, "…where the one-ring reading is out by more than 3x");

  // Well outside the whole shape both agree: no phantom edge is nearer there.
  ok(Math.abs(tr.distToKey(280, 280, "holed") - Math.hypot(40, 40)) < 0.01,
     "far outside, ring-awareness changes nothing");
}

// --- no geometry in the payload: the old bbox behaviour, unchanged ----------
{
  const payload = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">' +
      '<path data-key="e1" d="M20 20L200 160"/></svg>',
    elements: [
      { key: "n1", x0: 14, y0: 14, x1: 26, y1: 26 },
      { key: "e1", x0: 20, y0: 20, x1: 200, y1: 160, source: "n1", target: "n2" }
    ],
    options: { tooltip: true, hover: true, nearest: true }
  };
  const eB = document.createElement("div");
  document.body.appendChild(eB);
  const instB = widgetDef.factory(eB, 300, 200);
  instB.renderValue(payload);
  const tb = instB._test;
  ok(!tb.haveGeometry(), "a payload without geometry reports none");
  // An edge with no vertices to measure to stays excluded from the open-space
  // snap -- the workaround is still there for exactly the case it was for.
  ok(tb.nearestKeyAt(110, 90, 8) === null, "…and an unmeasurable edge stays out of the snap");
}

// --- round marks are discs, reconstructed from the bbox ---------------------
// No geometry is shipped for a point (its centre and radius are the bbox's), so
// this is the path a 150k-point scatter takes: exact disc picking, zero payload.
{
  const payload = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<circle data-key="p" cx="100" cy="100" r="10"/></svg>',
    elements: [{ key: "p", mark: "point", x0: 90, y0: 90, x1: 110, y1: 110 }],
    options: { tooltip: true, hover: true, nearest: true }
  };
  const eR = document.createElement("div");
  document.body.appendChild(eR);
  const instR = widgetDef.factory(eR, 200, 200);
  instR.renderValue(payload);
  const tr = instR._test;
  ok(!tr.haveGeometry(), "no geometry is shipped for a round mark");
  ok(tr.distToKey(100, 100, "p") === 0, "the centre is at distance 0");
  ok(Math.abs(tr.distToKey(120, 100, "p") - 10) < 1e-9, "…measured to the disc, not the box");
  // The bbox corner is sqrt(2)*10 = 14.1 from the centre, so 4.1 outside the
  // disc -- where a box distance would say 0.
  ok(Math.abs(tr.distToKey(110, 110, "p") - (Math.SQRT2 * 10 - 10)) < 1e-9,
    "the bbox corner is outside the disc, where a box would say 0");
}

{
  // --- constant-size glyphs must not lose their placement -------------------
  // Under axis_zoom + zoom_marks = "fixed" the runtime counter-scales glyph marks
  // with an inline CSS transform. Inline style outranks the SVG `transform`
  // presentation attribute, so a mark POSITIONED by that attribute (a panel-offset
  // matrix) has to have its placement carried into the CSS as well -- otherwise it
  // renders at its untranslated geometry, offset from the scene by the panel origin
  // (and from the crosshair, which is drawn in scene space).
  const OFF_X = 65.03937, OFF_Y = 50.036743;
  const svgAZ =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">' +
    '<g data-vellum-panel="axis-x-1"><text x="10" y="415">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="5" y="20">0</text></g>' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1">' +
    // positioned by a transform attribute, exactly as vellum emits panel marks
    '<path data-key="p" d="M96 96h8v8h-8z" ' +
    'transform="matrix(1 0 0 1 ' + OFF_X + ' ' + OFF_Y + ')"/>' +
    // a second glyph placed with translate() rather than a matrix
    '<path data-key="q" d="M196 96h8v8h-8z" transform="translate(10 20)"/>' +
    '</g></g>' +
    // a legend swatch OUTSIDE the pan group: must be left alone entirely
    '<g data-vellum-panel="legend"><path data-key="s" d="M0 0h6v6h-6z" ' +
    'transform="translate(560 40)"/></g>' +
    "</svg>";
  const elAZ = document.createElement("div");
  document.body.appendChild(elAZ);
  widgetDef.factory(elAZ, 600, 420).renderValue({
    svg: svgAZ,
    elements: [
      { key: "p", mark: "point", x0: 96 + OFF_X, y0: 96 + OFF_Y, x1: 104 + OFF_X, y1: 104 + OFF_Y },
      { key: "q", mark: "point", x0: 206, y0: 116, x1: 214, y1: 124 },
      { key: "s", mark: "point", x0: 560, y0: 40, x1: 566, y1: 46 }
    ],
    panels: {
      name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
    },
    options: { hover: true, zoom: true, axisZoom: true, zoomMarks: "fixed" }
  });
  const tfP = elAZ.querySelector('[data-key="p"]').style.transform;
  const tfQ = elAZ.querySelector('[data-key="q"]').style.transform;
  const swatch = elAZ.querySelector('[data-key="s"]');
  ok(/scale\(var\(--vw-ix/.test(tfP), "glyph still gets the constant-size counter-scale");
  ok(/matrix\(1, ?0, ?0, ?1, ?65\.03937, ?50\.036743\)/.test(tfP),
    "…and the inline transform carries the placement matrix, so the mark stays put");
  ok(tfP.indexOf("matrix") < tfP.indexOf("scale"),
    "…placement first, counter-scale second (scale resolves about the glyph's centre)");
  ok(/translate\(10px, ?20px\)/.test(tfQ) && /scale\(var\(--vw-ix/.test(tfQ),
    "a translate() placement is carried too, in CSS px units");
  ok(swatch.style.transform === "" && swatch.getAttribute("transform") === "translate(560 40)",
    "a legend swatch outside the pan group is left untouched");
}

// ============ declarative interactivity: interval selections (select_interval) ============
// A brush fills a named interval selection whose membership is by DATA VALUE: the
// brushed device-px range is inverted through the panel's scale and each element's
// own data values (`ix`/`iy`, `ixd`/`iyd`) are tested. condition()/filter_by()
// react exactly as for a point selection; clearing the brush empties it.
{
  const TI = window.__vellumwidgetTest;
  // Panel: device px 100..500 (x) maps data 0..100; py 10..410 maps data 50..0.
  const panelI = {
    name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100, aes: "x" },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50, aes: "y" }
  };
  // --- pure helpers ---
  ok(JSON.stringify(TI.selEncodings({ name: "b", kind: "interval", on: "x", encodings: "y" })) === '["y"]',
    "interval: selEncodings reads an auto-unboxed scalar `encodings`");
  ok(JSON.stringify(TI.selEncodings({ name: "b", kind: "interval", on: "xy" })) === '["x","y"]',
    "interval: selEncodings falls back to a legacy `on`");
  const rX = TI.intervalRangeOf(panelI, { x0: 140, y0: 200, x1: 300, y1: 220 }, ["x"]);
  ok(rX && Math.abs(rX.x.lo - 10) < 1e-9 && Math.abs(rX.x.hi - 50) < 1e-9 && !rX.y,
    "interval: an x brush resolves to the data range [10, 50] through the scale");
  const rY = TI.intervalRangeOf(panelI, { x0: 0, y0: 10, x1: 1, y1: 210 }, ["y"]);
  ok(rY && Math.abs(rY.y.lo - 25) < 1e-9 && Math.abs(rY.y.hi - 50) < 1e-9,
    "interval: a y brush inverts the top-down device axis (py 10..210 -> data 25..50)");
  ok(TI.inInterval({ key: "a", ix: 20 }, rX) && !TI.inInterval({ key: "b", ix: 60 }, rX),
    "interval: membership tests the element's data value");
  ok(!TI.inInterval({ key: "c" }, rX), "interval: an element with no data value is not a member");
  ok(TI.inInterval({ key: "s", ix: 0, ixh: 12 }, rX) && !TI.inInterval({ key: "t", ix: 60, ixh: 90 }, rX),
    "interval: a series spanning [ix, ixh] is a member when its span overlaps the range");
  // log10 axis: native 0..2 is data 1..100; px 300 (native 1) -> data 10.
  const panelLog = Object.assign({}, panelI, {
    x: { type: "continuous", transform: "log10", data_lo: 1, data_hi: 100, native_lo: 0, native_hi: 2, aes: "x" }
  });
  const rL = TI.intervalRangeOf(panelLog, { x0: 100, y0: 0, x1: 300, y1: 1 }, ["x"]);
  ok(rL && Math.abs(rL.x.lo - 1) < 1e-9 && Math.abs(rL.x.hi - 10) < 1e-9,
    "interval: a log10 axis is inverted to data units (1..10)");
  ok(TI.inInterval({ key: "a", ix: 5 }, rL) && !TI.inInterval({ key: "b", ix: 50 }, rL),
    "interval: log10 membership compares data values");
  // date axis: native/data are day numbers.
  const panelDate = Object.assign({}, panelI, {
    x: { type: "date", transform: "identity", data_lo: 18262, data_hi: 18362, native_lo: 18262, native_hi: 18362, time_unit: "day", aes: "x" }
  });
  const rD = TI.intervalRangeOf(panelDate, { x0: 100, y0: 0, x1: 140, y1: 1 }, ["x"]);
  ok(rD && Math.abs(rD.x.lo - 18262) < 1e-9 && Math.abs(rD.x.hi - 18272) < 1e-9,
    "interval: a date axis resolves to day numbers");
  ok(TI.inInterval({ key: "a", ix: 18265 }, rD) && !TI.inInterval({ key: "b", ix: 18300 }, rD),
    "interval: date membership compares the epoch value");
  // discrete axis: 4 levels at native 1..4 over domain 0.5..4.5 (100 px per band).
  const panelCat = Object.assign({}, panelI, {
    x: { type: "discrete", transform: "identity", data_lo: 1, data_hi: 4, native_lo: 0.5, native_hi: 4.5, aes: "x", levels: ["a", "b", "c", "d"] }
  });
  // px 180..360 -> native 1.3..3.1: covers the centres of b (2) and c (3) only.
  const rC = TI.intervalRangeOf(panelCat, { x0: 180, y0: 0, x1: 360, y1: 1 }, ["x"]);
  ok(rC && JSON.stringify(rC.x.levels) === '["b","c"]',
    "interval: a discrete brush selects the levels whose band centre it covers");
  ok(TI.inInterval({ key: "b", ixd: "b" }, rC) && !TI.inInterval({ key: "a", ixd: "a" }, rC),
    "interval: discrete membership matches the category label");
  ok(TI.intervalRangeOf(Object.assign({}, panelCat, { x: Object.assign({}, panelCat.x, { levels: undefined }) }),
    { x0: 180, y0: 0, x1: 360, y1: 1 }, ["x"]) === null,
    "interval: a discrete axis without levels declines (caller falls back to pixels)");
  // coord_flip: the vertical axis shows aesthetic x.
  const panelFlip = Object.assign({}, panelI, {
    x: Object.assign({}, panelI.y, { aes: "y" }), y: Object.assign({}, panelI.x, { aes: "x" })
  });
  const hitF = TI.axisForEncoding(panelFlip, "x");
  ok(hitF && hitF.horizontal === false, "interval: under coord_flip encoding x maps to the vertical axis");
  const rxy = TI.intervalRangeOf(panelI, { x0: 140, y0: 210, x1: 300, y1: 410 }, ["x", "y"]);
  ok(TI.intervalKeys([{ key: "in", ix: 20, iy: 10 }, { key: "outy", ix: 20, iy: 40 }, { key: "outx", ix: 80, iy: 10 }], rxy).join() === "in",
    "interval: an xy brush requires both channels inside");

  // --- runtime: condition + filter react; clearing empties ---
  const elI = document.createElement("div");
  document.body.appendChild(elI);
  const svgI =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><g data-vellum-panel="panel-1-1">' +
    '<path data-key="1" fill="#ff0000" d="M118 300h4v4h-4z"/>' +
    '<path data-key="2" fill="#ff0000" d="M218 200h4v4h-4z"/>' +
    '<path data-key="3" fill="#ff0000" d="M418 100h4v4h-4z"/>' +
    "</g></svg>";
  const iI = widgetDef.factory(elI, 600, 420);
  iI.renderValue({
    svg: svgI,
    // Data values deliberately disagree with pixel positions for key 3: it is drawn
    // at x=420 px (data 80) but its data value is 30, so only data-value membership
    // selects it.
    elements: [
      { key: "1", x0: 118, y0: 300, x1: 122, y1: 304, ix: 5, cond: ["br:color"] },
      { key: "2", x0: 218, y0: 200, x1: 222, y1: 204, ix: 30, cond: ["br:color"] },
      { key: "3", x0: 418, y0: 100, x1: 422, y1: 104, ix: 30, cond: ["br:color"] }
    ],
    panels: panelI,
    interactions: {
      selections: [{ name: "br", type: "interval", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x" }],
      conditions: [{ selection: "br", aes: "color", if_false: "#cccccc", empty: true }]
    },
    options: { hover: true, select: true, brush: true, selectMode: "multiple" }
  });
  const q = (k) => elI.querySelector('[data-key="' + k + '"]');
  const grey = (n) => n.style.fill === "rgb(204, 204, 204)" || n.style.fill === "#cccccc";
  ok(!q("1").style.fill && !q("2").style.fill, "interval: an empty selection leaves every element at its true colour");
  // brush px 180..260 (data 20..40), only a thin y strip: an x-only brush ignores y.
  const res = iI._test.brushInterval({ x0: 180, y0: 395, x1: 260, y1: 400 });
  ok(res && JSON.stringify(res.keys.slice().sort()) === '["2","3"]',
    "interval: members are the elements whose x data value is in [20, 40] (by value, not pixel)");
  ok(grey(q("1")) && !q("2").style.fill && !q("3").style.fill,
    "interval: condition() dims the non-member and keeps members");
  const band = iI._test.intervalBand();
  ok(band && band.x === 180 && band.w === 80 && band.y === 10 && band.h === 400,
    "interval: an x-only brush draws a persistent band spanning the panel height");
  ok(res.fields.selection === "br" && JSON.stringify(res.fields.interval.x) === "[20,40]",
    "interval: the brush reports the selection name and its data range");
  iI._test.clearSelection();
  ok(!q("1").style.fill && iI._test.intervalBand() === null && Object.keys(iI._test.intervals()).length === 0,
    "interval: clearing the brush empties the selection, restores colours, removes the band");
}
// filter_by + a discrete axis + Shiny read-back through real pointer events.
{
  const calls = [];
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  HTMLWidgets.shinyMode = true;
  const elJ = document.createElement("div");
  elJ.id = "ivplot";
  document.body.appendChild(elJ);
  const svgJ =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><g data-vellum-panel="panel-1-1">' +
    '<path data-key="a" d="M140 300h20v100h-20z"/>' +
    '<path data-key="b" d="M240 200h20v200h-20z"/>' +
    '<path data-key="c" d="M340 100h20v300h-20z"/>' +
    '<path data-key="d" d="M440 250h20v150h-20z"/>' +
    "</g></svg>";
  const iJ = widgetDef.factory(elJ, 600, 420);
  iJ.renderValue({
    svg: svgJ,
    elements: [
      { key: "a", x0: 140, y0: 300, x1: 160, y1: 400, ixd: "a", filt: ["cat"] },
      { key: "b", x0: 240, y0: 200, x1: 260, y1: 400, ixd: "b", filt: ["cat"] },
      { key: "c", x0: 340, y0: 100, x1: 360, y1: 400, ixd: "c", filt: ["cat"] },
      { key: "d", x0: 440, y0: 250, x1: 460, y1: 400, ixd: "d", filt: ["cat"] }
    ],
    panels: {
      name: "panel-1-1", px0: 100, py0: 10, px1: 500, py1: 410,
      x: { type: "discrete", transform: "identity", data_lo: 1, data_hi: 4, native_lo: 0.5, native_hi: 4.5, aes: "x", levels: ["a", "b", "c", "d"] },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50, aes: "y" }
    },
    interactions: {
      selections: [{ name: "cat", kind: "interval", on: "x", region: "rect", empty: true, encodings: ["x"] }],
      filters: [{ selection: "cat" }]
    },
    options: { hover: true, select: true, brush: true, selectMode: "multiple" }
  });
  const q = (k) => elJ.querySelector('[data-key="' + k + '"]');
  const last = (name) => calls.filter((c) => c.id === "ivplot_" + name).pop();
  const res = iJ._test.brushInterval({ x0: 180, y0: 50, x1: 360, y1: 60 });
  ok(JSON.stringify(res.keys.slice().sort()) === '["b","c"]',
    "interval (discrete): the brush selects the categories whose centre it covers");
  ok(q("a").classList.contains("vellumwidget-filtered") && q("d").classList.contains("vellumwidget-filtered") &&
     !q("b").classList.contains("vellumwidget-filtered") && !q("c").classList.contains("vellumwidget-filtered"),
    "interval: filter_by() hides the elements outside the brushed categories");
  ok(last("selected") && JSON.stringify(last("selected").v.slice().sort()) === '["b","c"]',
    "interval: members are reported through _selected, like a point selection");
  // Widening the brush brings filtered-out members back (they stay eligible).
  const res2 = iJ._test.brushInterval({ x0: 100, y0: 50, x1: 500, y1: 60 });
  ok(res2.keys.length === 4 && !q("a").classList.contains("vellumwidget-filtered"),
    "interval: a wider brush re-includes elements its own filter had hidden");
  ok(JSON.stringify(res2.fields.interval.x) === '["a","b","c","d"]',
    "interval: a discrete brush reports the covered levels");
  // Escape clears: filter lifted, `_brush` reset to NULL.
  calls.length = 0;
  elJ.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!q("a").classList.contains("vellumwidget-filtered") && !q("d").classList.contains("vellumwidget-filtered"),
    "interval: Escape clears the selection and lifts the filter");
  ok(last("brush") && last("brush").v === null, "interval: clearing pushes _brush = NULL to Shiny");
  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}
// A real pointer brush (drag) feeds the interval selection end to end.
{
  const calls = [];
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  HTMLWidgets.shinyMode = true;
  const elK = document.createElement("div");
  elK.id = "ivdrag";
  document.body.appendChild(elK);
  const iK = widgetDef.factory(elK, 100, 100);
  iK.renderValue({
    svg: svg2paths,
    elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10, ix: 1 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10, ix: 9 }],
    panels: {
      name: "panel-1-1", px0: 0, py0: 0, px1: 60, py1: 30,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 12, native_lo: 0, native_hi: 12, aes: "x" }
    },
    interactions: { selections: [{ name: "br", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x" }] },
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
  });
  const svgK = elK.querySelector("svg");
  const last = (name) => calls.filter((c) => c.id === "ivdrag_" + name).pop();
  firePointer(svgK, "pointerdown", 1, 5, 5);
  firePointer(svgK, "pointermove", 1, 55, 25, true);
  firePointer(svgK, "pointerup", 1, 55, 25, true);
  const b = last("brush");
  ok(b && b.v && b.v.selection === "br" && b.v.interval && Array.isArray(b.v.interval.x),
    "interval: a pointer brush reports {selection, interval} in _brush");
  ok(Object.keys(iK._test.intervals()).length === 1, "interval: a pointer brush fills the named selection");
  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}

// Interval selection under multi-panel axis zoom (facets): a brush in panel 2 is
// resolved through panel 2's scale, selects by value in every facet, and its band
// follows panel 2's own zoom transform.
{
  const lin = { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100, aes: "x" };
  const linY = { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100, aes: "y" };
  const svgF =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="panel-1-1">' +
    '<g role="grid"><path d="M0 0 L0 80" stroke="#ffffff" stroke-width="1"/></g>' +
    '<path data-key="a" d="M99 49h2v2z"/><path data-key="c" d="M30 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="panel-1-2" clip-path="url(#c1)"><g data-vellum-pan="panel-1-2">' +
    '<path data-key="b" d="M299 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-x-5"><text x="20" y="4" transform="matrix(1 0 0 1 220 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g></svg>';
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 400, 100);
  inst.renderValue({
    svg: svgF,
    elements: { key: ["a", "c", "b"], mark: ["point", "point", "point"], x0: [99, 30, 299], y0: [49, 49, 49],
      x1: [101, 32, 301], y1: [51, 51, 51], ix: [60, 5, 60], cond: ["br:color", "br:color", "br:color"] },
    panels: [
      { name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90, x: lin, y: linY },
      { name: "panel-1-2", px0: 220, py0: 10, px1: 380, py1: 90, x: lin, y: linY }
    ],
    interactions: {
      selections: [{ name: "br", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x" }],
      conditions: [{ selection: "br", aes: "color", empty: true }]
    },
    options: { axisZoom: true, hover: true, select: true, brush: true, zoom: true, selectMode: "multiple" }
  });
  e.querySelector("svg").getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100 });
  ok(inst._test.axisZoomActive() === true, "interval+axis_zoom facets: fixture is axis-zoomable");
  // panel 2 px 300..340 -> data 50..75
  const res = inst._test.brushInterval({ x0: 300, y0: 40, x1: 340, y1: 60 });
  ok(res && res.fields.interval.x[0] === 50 && res.fields.interval.x[1] === 75,
    "interval+axis_zoom facets: the brush resolves through the brushed panel's scale");
  ok(JSON.stringify(res.keys.slice().sort()) === '["a","b"]',
    "interval+axis_zoom facets: members by value in every facet (a in panel 1, b in panel 2)");
  ok(e.querySelector('[data-key="c"]').classList.contains("vellumwidget-cond-dim"),
    "interval+axis_zoom facets: the non-member is dimmed");
  inst._test.setView({ x: 50, y: 25, w: 200, h: 50 }); // panel 2's T = matrix(2 0 0 2 -300 -50)
  const band = inst._test.intervalBand();
  ok(band && band.x === 300 && band.w === 80 && band.y === 10 && band.h === 80,
    "interval+axis_zoom facets: the band follows panel 2's zoom and is clipped to its frame");
}

// ============ scale binds: bind_scale() overview + detail, bind = "scales" (F-15) ============
{
  const T = window.__vellumwidgetTest;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const lin = (hi) => ({ type: "continuous", transform: "identity", data_lo: 0, data_hi: hi, native_lo: 0, native_hi: hi, aes: "x" });
  const linY = { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50, aes: "y" };

  // pure: boundPan / channelToNative
  const P = { name: "p", px0: 220, py0: 10, px1: 380, py1: 90, x: lin(100), y: linY };
  const id = { sx: 1, sy: 1, tx: 0, ty: 0 };
  const full = T.boundPan(P, id, { h: [0, 100] });
  ok(near(full.sx, 1) && near(full.tx, 0), "boundPan: the full domain is the identity");
  const bp = T.boundPan(P, id, { h: [25, 50] });
  ok(near(bp.sx, 4) && near(bp.tx, -820) && bp.sy === 1 && bp.ty === 0,
    "boundPan: a bound x domain fills the panel; the unbound y keeps the shared transform");
  ok(near(bp.sx * (220 + 25 * 1.6) + bp.tx, 220) && near(bp.sx * (220 + 50 * 1.6) + bp.tx, 380),
    "boundPan: the bound range lands on the panel's edges");
  const bv = T.boundPan(P, id, { v: [10, 20] }); // y 10..20 of 0..50 across py 10..90
  ok(near(bv.sy * (10 + (50 - 20) * 1.6) + bv.ty, 10) && near(bv.sy * (10 + (50 - 10) * 1.6) + bv.ty, 90),
    "boundPan: a bound y domain maps hi to the top, lo to the bottom");
  const rev = Object.assign({}, P, { x: { type: "continuous", transform: "reverse", native_lo: 100, native_hi: 0 } });
  const br = T.boundPan(rev, id, { h: [25, 50] });
  ok(near(br.sx * (220 + (100 - 50) * 1.6) + br.tx, 220) && near(br.sx * (220 + (100 - 25) * 1.6) + br.tx, 380),
    "boundPan: a reversed axis stays reversed (50 on the left, 25 on the right)");
  const dSrc = { type: "date", transform: "identity", time_unit: "day" };
  const dDst = { type: "datetime", transform: "identity", time_unit: "second" };
  const cn = T.channelToNative({ lo: 1, hi: 2 }, dSrc, dDst);
  ok(cn && cn[0] === 86400 && cn[1] === 172800, "channelToNative: a Date brush drives a POSIXct axis in seconds");
  const lg = T.channelToNative({ lo: 10, hi: 1000 }, lin(1), { type: "log10", transform: "log10" });
  ok(lg && near(lg[0], 1) && near(lg[1], 3), "channelToNative: a log10 target maps through its transform");
  const dc = T.channelToNative({ lo: 1.5, hi: 3.5, levels: ["b", "c"] }, null, { type: "discrete", transform: "identity", levels: ["a", "b", "c"] });
  ok(dc && dc[0] === 1.5 && dc[1] === 3.5, "channelToNative: a discrete target spans the brushed levels' bands");
  ok(T.channelToNative({ lo: 1, hi: 1 }, lin(1), lin(1)) === null, "channelToNative: an empty range binds nothing");

  // integration: two composition cells side by side, overview (cell-1) + detail (cell-2)
  const svgOD =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="cell-1-panel-1-1" clip-path="url(#c0)"><g data-vellum-pan="cell-1-panel-1-1">' +
    '<path data-key="o1" d="M59 49h2v2z"/><path data-key="o2" d="M139 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="cell-2-panel-1-1" clip-path="url(#c1)"><g data-vellum-pan="cell-2-panel-1-1">' +
    '<path data-key="d1" d="M259 49h2v2z"/><path data-key="d2" d="M339 49h2v2z"/></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-x-5"><text x="20" y="4" transform="matrix(1 0 0 1 220 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">0</text></g>' +
    '<g data-vellum-panel="axis-y-2"><text x="-4" y="0" transform="matrix(1 0 0 1 220 90)" font-size="12">0</text></g></svg>';
  const elsOD = { key: ["o1", "o2", "d1", "d2"], mark: ["point", "point", "point", "point"],
    x0: [59, 139, 259, 339], y0: [49, 49, 49, 49], x1: [61, 141, 261, 341], y1: [51, 51, 51, 51], ix: [25, 75, 25, 75] };
  const captured = {};
  const savedShiny = window.Shiny, savedMode = window.HTMLWidgets.shinyMode;
  window.HTMLWidgets.shinyMode = true;
  window.Shiny = { setInputValue: function (iid, v) { captured[iid] = v; } };
  const mountOD = (id, interactions, detailX) => {
    const e = document.createElement("div");
    e.id = id;
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 400, 100);
    inst.renderValue({
      svg: svgOD,
      elements: elsOD,
      panels: [
        { name: "cell-1-panel-1-1", cell: "cell-1", px0: 20, py0: 10, px1: 180, py1: 90, x: lin(100), y: linY },
        { name: "cell-2-panel-1-1", cell: "cell-2", px0: 220, py0: 10, px1: 380, py1: 90, x: detailX || lin(100), y: linY }
      ],
      interactions: interactions,
      options: { axisZoom: true, hover: true, select: true, brush: true, zoom: true, selectMode: "multiple" }
    });
    e.querySelector("svg").getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100 });
    return inst;
  };
  const tOf = (inst, name) => inst._test.panTransforms().filter((p) => p.name === name)[0].transform;
  const iOD = mountOD("bindod", {
    selections: [{ name: "br", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x", cells: "cell-1" }],
    conditions: [], filters: [],
    binds: [{ selection: "br", aes: "x", cell: "cell-2" }]
  });
  ok(iOD._test.axisZoomActive() === true, "bind_scale: the two-cell fixture is axis-zoomable");
  iOD._test.brushInterval({ x0: 60, y0: 20, x1: 100, y1: 80 }); // overview data 25..50
  ok(tOf(iOD, "cell-2-panel-1-1") === "matrix(4 0 0 1 -820 0)",
    "bind_scale: brushing the overview zooms the detail to the brushed range");
  ok(tOf(iOD, "cell-1-panel-1-1") === "matrix(1 0 0 1 0 0)", "bind_scale: the overview itself does not zoom");
  const z1 = captured["bindod_zoom"];
  const dr = z1 && z1.panels && z1.panels["cell-2-panel-1-1"];
  ok(dr && near(dr.x[0], 25) && near(dr.x[1], 50), "bind_scale: input$<id>_zoom reports the detail's bound range");
  ok(z1 && z1.panels["cell-1-panel-1-1"] && near(z1.panels["cell-1-panel-1-1"].x[1], 100),
    "bind_scale: input$<id>_zoom reports the overview's full range");
  ok(z1 && z1.bound && z1.bound["cell-2-panel-1-1"] === "br" && !z1.bound["cell-1-panel-1-1"],
    "bind_scale: input$<id>_zoom names the bound panel and its selection");
  const labs = iOD._test.retickLabels().filter((l) => l.x >= 220 && l.y > 90).map((l) => l.text);
  ok(labs.length > 0 && labs.every((t) => +t >= 25 && +t <= 50),
    "bind_scale: the detail's x axis is re-ticked for the bound range (" + labs.join(",") + ")");
  // a brush in the detail cell leaves the overview's selection alone
  iOD._test.brushInterval({ x0: 300, y0: 20, x1: 340, y1: 80 });
  ok(tOf(iOD, "cell-2-panel-1-1") === "matrix(4 0 0 1 -820 0)" && iOD._test.intervals().br.range.panel === "cell-1-panel-1-1",
    "bind_scale: brushing the detail cell does not re-drive its own bind");
  // VW-18: with binds each cell zooms on its own. A zoom in the overview (the
  // active cell) leaves the detail's unbound y alone ...
  iOD._test.setView({ x: 50, y: 25, w: 200, h: 50 });
  ok(tOf(iOD, "cell-2-panel-1-1") === "matrix(4 0 0 1 -820 0)",
    "VW-18: zooming the overview cell leaves the bound detail's unbound axis alone (" + tOf(iOD, "cell-2-panel-1-1") + ")");
  ok(/^matrix\(2 0 0 2 /.test(tOf(iOD, "cell-1-panel-1-1")), "VW-18: the overview cell zooms itself");
  // ... and a zoom in the detail moves only its unbound y (the bound x holds),
  // leaving the overview's zoom where it was.
  iOD._test.focusCell("cell-2");
  ok(iOD._test.activeCell() === "cell-2" && iOD._test.getView().w === 400,
    "VW-18: focusing the detail cell hands it its own (full) view");
  iOD._test.setView({ x: 0, y: 25, w: 400, h: 50 });
  const tz = tOf(iOD, "cell-2-panel-1-1");
  ok(/^matrix\(4 0 0 2 -820 /.test(tz), "VW-18: the bound x holds while y follows the detail cell's zoom (" + tz + ")");
  ok(/^matrix\(2 0 0 2 /.test(tOf(iOD, "cell-1-panel-1-1")), "VW-18: the overview keeps its own zoom");
  iOD._test.focusCell("cell-1");
  ok(iOD._test.getView().w === 200, "VW-18: re-focusing the overview restores its parked view");
  ok(/^matrix\(4 0 0 2 -820 /.test(tOf(iOD, "cell-2-panel-1-1")), "VW-18: the detail keeps its parked view");
  iOD._test.resetZoom();
  ok(tOf(iOD, "cell-1-panel-1-1") === "matrix(1 0 0 1 0 0)" && tOf(iOD, "cell-2-panel-1-1") === "matrix(4 0 0 1 -820 0)",
    "VW-18: reset returns every cell to its full view (the bound x stays bound)");
  iOD._test.clearSelection();
  ok(tOf(iOD, "cell-2-panel-1-1") === "matrix(1 0 0 1 0 0)", "bind_scale: clearing the brush resets the detail's zoom");
  const z2 = captured["bindod_zoom"];
  ok(z2 && !z2.bound && near(z2.panels["cell-2-panel-1-1"].x[1], 100), "bind_scale: the reset is reported, with no bound panel");

  // an older payload: a bind with no cell drives every panel but the brushed one
  const iOld = mountOD("bindold", {
    selections: [{ name: "br", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x" }],
    binds: [{ selection: "br", aes: "x" }]
  });
  iOld._test.brushInterval({ x0: 60, y0: 20, x1: 100, y1: 80 });
  ok(tOf(iOld, "cell-2-panel-1-1") === "matrix(4 0 0 1 -820 0)" && tOf(iOld, "cell-1-panel-1-1") === "matrix(1 0 0 1 0 0)",
    "bind_scale: a cell-less bind zooms the other panels, never the brushed one");

  // bind = "scales": zooming the overview writes the selection; the detail follows it
  const iSc = mountOD("bindsc", {
    selections: [{ name: "z", kind: "interval", on: "x", region: "rect", empty: true, encodings: "x", bind: "scales", cells: ["cell-1"] }],
    conditions: [{ selection: "z", aes: "color", empty: true }],
    binds: [{ selection: "z", aes: "x", cell: "cell-2" }]
  }, lin(200));
  ok(iSc._test.mode() === "pan", "bind = scales: a scales-bound view drags to pan by default");
  ok(iSc._test.brushInterval({ x0: 60, y0: 20, x1: 100, y1: 80 }) === null,
    "bind = scales: a brush does not fill a scales-bound selection");
  iSc._test.setView({ x: 50, y: 0, w: 200, h: 100 }); // 2x in x about panel 1's centre -> 25..75
  const zr = iSc._test.intervals().z;
  ok(zr && zr.range && near(zr.range.x.lo, 25) && near(zr.range.x.hi, 75) && zr.range.panel === "cell-1-panel-1-1",
    "bind = scales: the overview's visible range is the selection");
  ok(tOf(iSc, "cell-2-panel-1-1") === "matrix(4 0 0 1 -740 0)",
    "bind = scales: the detail (its own 0..200 scale) zooms to 25..75 (" + tOf(iSc, "cell-2-panel-1-1") + ")");
  const zd = captured["bindsc_zoom"].panels["cell-2-panel-1-1"];
  ok(zd && near(zd.x[0], 25) && near(zd.x[1], 75), "bind = scales: the detail reports the linked range");
  // VW-18: a y zoom on the source view does not reach the detail's unbound y.
  iSc._test.setView({ x: 50, y: 25, w: 200, h: 50 });
  ok(tOf(iSc, "cell-2-panel-1-1") === "matrix(4 0 0 1 -740 0)",
    "VW-18: zooming the scales-bound source moves only the detail's bound axis (" + tOf(iSc, "cell-2-panel-1-1") + ")");
  iSc._test.setView({ x: 50, y: 0, w: 200, h: 100 });
  iSc._test.clearSelection(); // an empty-space click keeps the view-driven selection
  ok(iSc._test.intervals().z, "bind = scales: clearing the selection does not drop the view-driven interval");
  iSc._test.setView({ x: 0, y: 0, w: 400, h: 100 });
  ok(!iSc._test.intervals().z && tOf(iSc, "cell-2-panel-1-1") === "matrix(1 0 0 1 0 0)",
    "bind = scales: resetting the zoom empties the selection and unbinds the detail");
  window.Shiny = savedShiny; window.HTMLWidgets.shinyMode = savedMode;
}

// ============ VW-19: a brush does not select a partly covered line ============
// The overview of an overview + detail is one keyed line spanning the whole x
// range. A partial brush used to select it, and the selected style restroked
// the line in the selection colour (near-white in a dark scheme). It stays a
// member of the interval (conditions, filters, `_brush`) but is not selected;
// points keep today's selection.
{
  const T = window.__vellumwidgetTest;
  const L = { key: "L", mark: "line", x0: 20, y0: 20, x1: 380, y1: 80, ix: 0, ixh: 100, iy: 5, iyh: 45 };
  const P1 = { key: "p1", mark: "point", x0: 109, y0: 49, x1: 111, y1: 51, ix: 25, iy: 25 };
  ok(T.isSeriesElem(L) && !T.isSeriesElem(P1) && !T.isSeriesElem({ key: "s", mark: "segment", ix: 0, ixh: 9 }),
    "VW-19: isSeriesElem: a spanning line is a series; points and segments are not");
  ok(!T.isSeriesElem({ key: "z", mark: "line", ix: 3, ixh: 3 }), "VW-19: isSeriesElem: a zero-span line is not a series");
  const inside = (e) => e.x0 >= 0 && e.x1 <= 200;
  ok(JSON.stringify(T.dropPartialSeries([L, P1], ["L", "p1"], inside)) === '["p1"]',
    "VW-19: dropPartialSeries drops a partly covered line, keeps the point");
  ok(JSON.stringify(T.dropPartialSeries([L, P1], ["L", "p1"], () => true)) === '["L","p1"]',
    "VW-19: dropPartialSeries keeps a line the region covers in full");
  const area = Object.assign({}, L, { key: "A", mark: "polygon" });
  ok(JSON.stringify(T.dropPartialSeries([area], ["A"], inside)) === "[]", "VW-19: an area (polygon series) is dropped too");

  const el19 = document.createElement("div");
  document.body.appendChild(el19);
  const svg19 =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<g data-vellum-panel="panel-1-1"><path data-key="L" d="M20 80 L380 20" stroke="#000" fill="none"/>' +
    '<path data-key="p1" d="M109 49h2v2z"/><path data-key="p2" d="M289 49h2v2z"/></g></svg>';
  const i19 = widgetDef.factory(el19, 400, 100);
  i19.renderValue({
    svg: svg19,
    elements: [L, P1, { key: "p2", mark: "point", x0: 289, y0: 49, x1: 291, y1: 51, ix: 75, iy: 25 }],
    panels: {
      name: "panel-1-1", px0: 20, py0: 10, px1: 380, py1: 90,
      x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100, aes: "x" },
      y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50, aes: "y" }
    },
    interactions: { selections: [{ name: "br", kind: "interval", on: "x", region: "rect", empty: true, encodings: ["x"] }] },
    options: { hover: true, select: true, brush: true, selectMode: "multiple", axisZoom: false }
  });
  const q = (k) => el19.querySelector('[data-key="' + k + '"]');
  const res = i19._test.brushInterval({ x0: 92, y0: 20, x1: 200, y1: 80 }); // data 20..50
  ok(res && res.keys.indexOf("L") >= 0 && res.keys.indexOf("p1") >= 0,
    "VW-19: the partly brushed line is still a member of the interval");
  ok(!q("L").classList.contains("vellumwidget-selected"), "VW-19: the partly brushed line is not restyled as selected");
  ok(q("p1").classList.contains("vellumwidget-selected") && !q("p2").classList.contains("vellumwidget-selected"),
    "VW-19: points keep today's selection under the brush");
  i19._test.brushInterval({ x0: 15, y0: 20, x1: 385, y1: 80 }); // the whole range
  ok(q("L").classList.contains("vellumwidget-selected"), "VW-19: a brush covering the whole line still selects it");
}

// ============ VW-20: feedback ink follows the plot background ============
// The selection ring / crosshair / colorbar wash contrast with the background the
// scene was drawn on, not the OS colour scheme; a user selectedColor still wins.
{
  const T = window.__vellumwidgetTest;
  ok(JSON.stringify(T.parseColor("#EBEBEB")) === "[235,235,235,1]" && JSON.stringify(T.parseColor("#fff")) === "[255,255,255,1]",
    "VW-20: parseColor reads #rrggbb and #rgb");
  ok(JSON.stringify(T.parseColor("rgba(10, 20, 30, 0.5)")) === "[10,20,30,0.5]" && T.parseColor("none") === null,
    "VW-20: parseColor reads rgba() and declines none");
  ok(Math.abs(T.luminance([255, 255, 255]) - 1) < 1e-9 && T.luminance([0, 0, 0]) === 0, "VW-20: luminance spans 0..1");
  ok(!T.isDarkBg([235, 235, 235]) && !T.isDarkBg([255, 255, 255]), "VW-20: theme_grey / white panels are light");
  ok(T.isDarkBg([127, 127, 127]) && T.isDarkBg([13, 17, 33]), "VW-20: theme_dark's grey50 and a cyberpunk ink are dark");

  const mk = (panelFill, plotFill, style) => {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<rect width="200" height="100" fill="#ffffff"/>' +
      '<g data-vellum-panel="plot-background"><g role="presentation"><path d="M0 0 L200 0 L200 100 L0 100 Z" fill="' + plotFill + '"/></g></g>' +
      '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1">' +
      '<path d="M20 10 L180 10 L180 90 L20 90 Z" fill="' + panelFill + '"/>' +
      '<path data-key="a" d="M100 50h2v2z"/></g></g></svg>';
    const i = widgetDef.factory(e, 200, 100);
    i.renderValue({ svg: svg, elements: { key: ["a"], x0: [100], y0: [50], x1: [102], y1: [52] },
      options: { hover: true, select: true, style: style || {} } });
    return e;
  };
  const ink = (e, v) => e.style.getPropertyValue(v || "--vellumwidget-ink");
  const light = mk("#ebebeb", "#ffffff");
  ok(ink(light) === "#111827" && ink(light, "--vellumwidget-wash") === "rgba(255,255,255,0.66)",
    "VW-20: a light panel gets dark selection ink and a light wash");
  const dark = mk("#7f7f7f", "#ffffff");
  ok(ink(dark) === "#f9fafb" && ink(dark, "--vellumwidget-wash") === "rgba(255,255,255,0.66)",
    "VW-20: theme_dark (grey50 panel on a white plot) gets light ink; the legend wash follows the white plot");
  const cyber = mk("#0d1121", "#0d1121");
  ok(ink(cyber) === "#f9fafb" && ink(cyber, "--vellumwidget-wash") === "rgba(17,24,39,0.66)",
    "VW-20: a dark plot gets light ink and a dark wash");
  const user = mk("#0d1121", "#0d1121", { selectedColor: "#ff0000" });
  ok(user.style.getPropertyValue("--vellumwidget-selected-stroke") === "#ff0000",
    "VW-20: a user selectedColor is kept (it overrides the derived ink)");
  const css = Array.prototype.map.call(document.querySelectorAll("style"), (n) => n.textContent).join("\n");
  ok(/vellumwidget-selected \{\s*stroke: var\(--vellumwidget-selected-stroke, var\(--vellumwidget-ink,/.test(css),
    "VW-20: the selected stroke resolves user colour, then derived ink");
  ok(!/prefers-color-scheme: dark\)\s*\{[^}]*vellumwidget-selected/.test(css),
    "VW-20: no OS-scheme rule restyles the selection any more");
}

// ============ VW-14: split render in raster mode ============
// Raster mode with vellum's split render ships SVG furniture plus a PNG of the
// keyed marks (`marks`), which the runtime places in each panel's pan group so
// axis zoom (and the navigator, and binds) work as in SVG mode.
{
  const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const panel = (name, px0, px1) => ({
    name: name, px0: px0, py0: 10, px1: px1, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  });
  // Furniture only (layer = "unkeyed"): the pan groups hold no keyed marks.
  const furn = (names) =>
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">' +
    '<defs><clipPath id="c0"><rect x="0" y="0" width="400" height="100"/></clipPath></defs>' +
    names.map((n) => '<g data-vellum-panel="' + n + '" clip-path="url(#c0)"><g data-vellum-pan="' + n + '">' +
      '<g role="grid"><path d="M0 0 L0 80" stroke="#ffffff"/></g></g></g>').join("") +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  function mountSplit(names, panels, marksPanels, opts) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const i = widgetDef.factory(e, 400, 100);
    i.renderValue({
      svg: furn(names),
      elements: { key: ["a", "b"], mark: { levels: "point", codes: [0, 0] },
        x0: [100, 300], y0: [50, 50], x1: [102, 302], y1: [52, 52] },
      panels: panels,
      marks: { href: PNG1, width: 400, height: 100, panels: marksPanels },
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple" }, opts || {})
    });
    return { el: e, inst: i };
  }

  // one panel: a <use> in the pan group, the image defined once, axis zoom on.
  const one = mountSplit(["panel-1-1"], [panel("panel-1-1", 20, 180)], "panel-1-1");
  const pan1 = one.el.querySelector('[data-vellum-pan="panel-1-1"]');
  const use1 = pan1.querySelector("use.vellumwidget-marks");
  const def1 = one.el.querySelector("defs.vellumwidget-marks-defs image.vellumwidget-marks");
  ok(!!use1 && !!def1, "split: the mark image is defined once and drawn by a <use> in the pan group");
  ok(use1.getAttribute("href") === "#" + def1.getAttribute("id"), "split: the <use> references the image definition");
  ok(pan1.lastChild === use1, "split: the marks sit above the panel's unkeyed content");
  ok(one.inst._test.rasterMode() === true && one.inst._test.axisZoomActive() === true,
    "split: raster mode with the mark layer in the pan groups zooms by axis");
  const lab0 = one.inst._test.retickLabels().map((l) => l.text).join(",");
  one.inst._test.setView({ x: 50, y: 25, w: 200, h: 50 });
  const tm = /matrix\(([-\d.eE]+)/.exec(one.inst._test.panTransform());
  ok(tm && Math.abs(parseFloat(tm[1]) - 2) < 1e-6, "split: zooming scales the pan group (and the marks in it) 2x");
  ok(one.el.querySelector("svg").getAttribute("viewBox") === "0 0 400 100", "split: the frame stays at vb0 under axis zoom");
  const lab1 = one.inst._test.retickLabels().map((l) => l.text).join(",");
  ok(lab0.length > 0 && lab1.length > 0 && lab0 !== lab1, "split: the real axes re-tick in raster mode");

  // export: one SVG document with the mark layer and the re-ticked labels folded in.
  {
    let captured = null;
    const saved = { Blob: global.Blob, XS: global.XMLSerializer, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    const aClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {}; // no jsdom navigation
    one.el.querySelector('[data-act="svg"]').click();
    window.HTMLAnchorElement.prototype.click = aClick;
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    ok(captured && /<use[^>]*class="vellumwidget-marks"/.test(captured) && /<image[^>]*class="vellumwidget-marks"/.test(captured),
      "split export: the SVG carries the mark layer (furniture + marks in one image)");
    ok(captured && captured.indexOf("vellumwidget-retick-export") >= 0 && captured.indexOf(">" + one.inst._test.retickLabels()[0].text + "<") >= 0,
      "split export: the re-ticked axis labels are folded into the exported SVG");
  }

  // facets: one <use> per panel, one definition; ids are page-unique.
  const two = mountSplit(["panel-1-1", "panel-1-2"], [panel("panel-1-1", 20, 180), panel("panel-1-2", 220, 380)],
    ["panel-1-1", "panel-1-2"]);
  ok(two.el.querySelectorAll("use.vellumwidget-marks").length === 2 &&
     two.el.querySelectorAll("image.vellumwidget-marks").length === 1, "split: facets get a <use> each of one image");
  ok(two.el.querySelector("image.vellumwidget-marks").getAttribute("id") !== def1.getAttribute("id"),
    "split: the image id is unique per widget");
  ok(two.inst._test.axisZoomActive() === true, "split: facets zoom by axis in raster mode");

  // a listed panel without a pan group: one image over the whole scene, viewBox zoom.
  const root = mountSplit(["panel-1-1"], [panel("panel-1-1", 20, 180)], ["panel-1-1", "panel-9"]);
  const rootImg = root.el.querySelector("svg > image.vellumwidget-marks");
  ok(!!rootImg && !root.el.querySelector("use.vellumwidget-marks"), "split: a missing pan group falls back to one root image");
  ok(root.inst._test.axisZoomActive() === false, "split: the root fallback keeps viewBox zoom");

  // no marks layer (older vellum: one base image) keeps today's behaviour.
  const e0 = document.createElement("div");
  document.body.appendChild(e0);
  const i0 = widgetDef.factory(e0, 400, 100);
  i0.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100"><image width="400" height="100" href="' + PNG1 + '"/></svg>',
    elements: { key: ["a"], x0: [100], y0: [50], x1: [102], y1: [52] },
    panels: [panel("panel-1-1", 20, 180)],
    options: { raster: true, zoom: true }
  });
  ok(i0._test.axisZoomActive() === false && !e0.querySelector(".vellumwidget-marks"),
    "split: without a marks layer raster mode is unchanged (viewBox zoom)");

  // navigator: available in split raster mode; its clone keeps one <use>, no defs.
  const nav = mountSplit(["panel-1-1", "panel-1-2"], [panel("panel-1-1", 20, 180), panel("panel-1-2", 220, 380)],
    ["panel-1-1", "panel-1-2"], { navigator: true });
  const mini = nav.el.querySelector(".vellumwidget-nav-mini svg");
  ok(!!mini, "split: the navigator is built in raster mode");
  ok(mini && mini.querySelectorAll("use.vellumwidget-marks").length === 1 && !mini.querySelector("defs"),
    "split: the navigator clone keeps one mark <use> and drops every defs");
  ok(nav.inst._test.axisZoomActive() === true, "split: navigator + axis zoom in raster mode");
}

// ============ VW-15: the marks-only display list ============
{
  const T3 = window.__vellumwidgetTest;
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const col = (type, xs) => ({ type: type, n: xs.length, data: b64(type === "f32" ? Float32Array : type === "u8" ? Uint8Array : type === "u16" ? Uint16Array : Uint32Array, xs) });
  // 2 points (a circle, a square), 1 rect, 1 closed path (two rings), 1 flagged point.
  const DL = {
    format: "vellum-display-list", version: 1, width: 400, height: 100, n: 5,
    record: {
      kind: col("u8", [0, 0, 1, 2, 0]),
      paint: { type: "u8", n: 5, rle: { values: [0, 1], lengths: [2, 3] } },
      key: { type: "u8", n: 5, seq: [0, 1] },
      flags: col("u8", [0, 0, 0, 0, 1]),
      clip: { type: "u8", n: 5, const: 1 },
      panel: { type: "u8", n: 5, const: 1 }
    },
    point: { cx: col("f32", [100, 120, 300]), cy: col("f32", [50, 50, 50]), r: { type: "f32", n: 3, const: 4 }, shape: col("u8", [0, 1, 0]) },
    rect: { x: col("f32", [30]), y: col("f32", [20]), w: col("f32", [10]), h: col("f32", [-5]) },
    path: { xy: col("f32", [60, 60, 70, 60, 70, 70, 61, 61, 62, 61, 62, 62]), run_offset: col("u8", [0, 3, 6]), path_offset: col("u8", [0, 2]), closed: col("u8", [1]), evenodd: col("u8", [1]) },
    paints: { fill: ["#ff0000ff", "#0000ff80"], stroke: ["#ff0000ff", null], stroke_width: [1, 0], dash: [null, "2,1"], linecap: ["round", "butt"], linejoin: ["round", "miter"] },
    clips: { x0: 20, y0: 10, x1: 180, y1: 90 },
    keys: { type: "u16", n: 5, data: b64(Uint16Array, [7, 8, 9, 10, 11]) },
    panels: "panel-1-1"
  };
  const dl = T3.decodeDisplayList(DL);
  ok(dl && dl.n === 5 && dl.keys.join(",") === "7,8,9,10,11", "dlist: decodes the record table and an integer key column");
  ok(dl.paint[1] === 0 && dl.paint[2] === 1 && dl.clip[3] === 1 && dl.key[4] === 4, "dlist: rle / const / seq columns decode");
  ok(dl.paints[1].fill === "#0000ff80" && dl.paints[1].stroke === null && dl.paints[1].dash.join() === "2,1" && !dl.paints[1].opaque && dl.paints[0].opaque,
    "dlist: paints (colour, none, dash, opacity)");
  ok(dl.row[0] === 0 && dl.row[1] === 1 && dl.row[2] === 0 && dl.row[3] === 0 && dl.row[4] === 2, "dlist: each record finds its row in its kind's table");
  ok(dl.bx0[0] === 96 && dl.bx1[0] === 104 && dl.by0[2] === 15 && dl.by1[2] === 20 && dl.bx1[3] === 70 && dl.by0[3] === 60,
    "dlist: bboxes from a point's radius, a (negative-height) rect and a path's vertices");
  ok(dl.exact === false && dl.panels[0] === "panel-1-1" && dl.clips[0].x1 === 180, "dlist: a flagged record makes the list inexact");
  ok(T3.decodeDisplayList({ format: "x", version: 1 }) === null && T3.decodeDisplayList({ format: "vellum-display-list", version: 3 }) === null,
    "dlist: an unknown format or version is ignored");
  // fillBboxes: an element with no bbox takes its records' union; one with a bbox keeps it.
  const els = [{ key: "7" }, { key: "9", x0: 1, y0: 1, x1: 2, y1: 2 }, { key: "zz" }];
  ok(T3.fillBboxes(els, dl) === 1 && els[0].x0 === 96 && els[0].y1 === 54 && els[1].x0 === 1 && els[2].x0 === undefined,
    "dlist: bboxes are derived for the covered elements only");
  // tracing: record the path calls on a fake context.
  const calls = [];
  const rec = new Proxy({}, { get: (t, k) => function () { calls.push(k + "(" + [].slice.call(arguments).map((v) => Math.round(v * 100) / 100).join(",") + ")"); } });
  T3.tracePoint(rec, 1, 10, 10, 2);
  ok(calls.join(" ") === "moveTo(8,8) lineTo(12,8) lineTo(12,12) lineTo(8,12) closePath()", "dlist: a square marker traces its ring");
  calls.length = 0; T3.tracePoint(rec, 0, 10, 10, 2);
  ok(calls[0] === "moveTo(12,10)" && /^arc\(10,10,2,0,6.28\)$/.test(calls[1]), "dlist: a circle traces an arc");
  calls.length = 0; T3.tracePoint(rec, 4, 10, 10, 2);
  ok(calls.join(" ") === "moveTo(10,8) lineTo(10,12) moveTo(8,10) lineTo(12,10)", "dlist: a plus marker traces two arms");
  calls.length = 0; T3.traceShape(rec, dl, 3, { ax: 2, bx: 1, ay: 2, by: 0 });
  ok(calls.join(" ") === "moveTo(121,120) lineTo(141,120) lineTo(141,140) closePath() moveTo(123,122) lineTo(125,122) lineTo(125,124) closePath()",
    "dlist: a path traces each ring through the affine, closed");
  calls.length = 0; T3.traceShape(rec, dl, 2, { ax: 1, bx: 0, ay: 1, by: 0 });
  ok(calls.join(" ") === "rect(30,20,10,-5)", "dlist: a rect traces as a rect");
  // keys: the delta form with sparse non-integer keys.
  ok(T3.decodeKeys({ delta: [5, 2, -1], at: [1], v: ["legend:a"] }).join(",") === "5,legend:a,7,6" &&
     T3.decodeKeys({ delta: [3, 1], at: [], v: [] }).join(",") === "3,4" && T3.decodeKeys(["a", "b"]).join(",") === "a,b",
    "keys: the delta encoding decodes (with exceptions), plain keys pass through");
  // keys: prefixed integer keys (vellumplot default keys, VP-55) decode with
  // their run-length prefixes; a scalar (auto-unboxed) prefix level works too.
  ok(T3.decodeKeys({ delta: [1, 1, -1, 1], at: [2], v: ["legend:a"],
                     pre: { levels: ["p1-1:l1:", "p1-1:l2:"], rv: [0, 1], rl: [2, 2] } }).join(",") ===
       "p1-1:l1:1,p1-1:l1:2,legend:a,p1-1:l2:1,p1-1:l2:2" &&
     T3.decodeKeys({ delta: [3, 1], at: [], v: [], pre: { levels: "cell-1:p1-1:l1:", rv: 0, rl: 2 } }).join(",") ===
       "cell-1:p1-1:l1:3,cell-1:p1-1:l1:4",
    "keys: the prefixed delta encoding decodes");

  // renderValue: a raster payload whose covered marks ship no bbox gets them from the list.
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 400, 100);
  inst.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100"><g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"></g></g></svg>',
    elements: { key: { delta: [7, 1, 1, 1, 1], at: [], v: [] }, mark: { levels: ["point", "rect", "path"], rv: [0, 1, 2, 0], rl: [2, 1, 1, 1] } },
    marks: { href: "data:image/png;base64,", width: 400, height: 100, panels: "panel-1-1" },
    displayList: DL,
    options: { raster: true, hover: true, select: true }
  });
  ok(inst._test.displayListSize() === 5, "dlist: a raster render decodes the shipped list");
  ok(inst._test.bboxOf("7").join(",") === "96,46,104,54" && inst._test.bboxOf("9").join(",") === "30,15,40,20",
    "dlist: elements shipped without bboxes get them from the list");
  ok(inst._test.indexSize() === 5, "dlist: the derived bboxes feed the spatial index");
  ok(inst._test.nearestKeyAt(101, 50, 20) === "7", "dlist: hit-testing works on the derived geometry");
}

// ============ VW-16: the raster detail tier ============
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  const u8 = (xs) => ({ type: "u8", n: xs.length, data: b64(Uint8Array, xs) });
  // 4 points in panel-1-1 (20..180 x 10..90): a red circle, a square, a
  // translucent blue circle, and one far right; plus a rect.
  const DL = {
    format: "vellum-display-list", version: 1, width: 200, height: 100, n: 5,
    record: { kind: u8([0, 0, 0, 0, 1]), paint: u8([0, 0, 1, 0, 0]), key: { type: "u8", n: 5, seq: [0, 1] },
      flags: { type: "u8", n: 5, const: 0 }, clip: { type: "u8", n: 5, const: 0 }, panel: { type: "u8", n: 5, const: 1 } },
    point: { cx: f32([60, 64, 62, 170]), cy: f32([50, 50, 54, 50]), r: { type: "f32", n: 4, const: 2 }, shape: u8([0, 1, 0, 0]) },
    rect: { x: f32([66]), y: f32([46]), w: f32([4]), h: f32([4]) },
    path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
      closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
    paints: { fill: ["#ff0000ff", "#0000ff80"], stroke: ["#ff0000ff", null], stroke_width: [1, 0], dash: [null, null], linecap: ["round", "round"], linejoin: ["round", "round"] },
    clips: null, keys: ["p1", "p2", "p3", "p4", "r1"], panels: "panel-1-1"
  };
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><g role="grid"><path d="M0 0 L0 80"/></g></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  function mountTier(opts) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    inst.renderValue({
      svg: svg,
      elements: { key: ["p1", "p2", "p3", "p4", "r1"], mark: ["point", "point", "point", "point", "rect"] },
      panels: [panel],
      marks: { href: "data:image/png;base64,", width: 200, height: 100, panels: "panel-1-1" },
      displayList: DL,
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple", a11y: true }, opts || {})
    });
    return { el: e, inst: inst };
  }
  const t = mountTier({ detailMarks: 4 });
  ok(t.inst._test.markTier() === "overview" && t.inst._test.axisZoomActive(), "tier: a raster render starts in the overview tier");
  // zoom to a 40x20 window around the cluster: 4 records visible (not < 4): mid
  t.inst._test.setView({ x: 45, y: 40, w: 40, h: 20 });
  t.inst._test.evalTier();
  ok(t.inst._test.markTier() === "mid" && !t.el.querySelector(".vellumwidget-detail"), "tier: more visible marks than detailMarks stays on the canvas (mid)");
  // tighter: 3 visible (p1, p2, p3; the rect at x 66..70 is out) -> detail
  t.inst._test.setView({ x: 46, y: 40, w: 19, h: 20 });
  t.inst._test.evalTier();
  const det = t.el.querySelectorAll('[data-vellum-pan="panel-1-1"] > g.vellumwidget-detail [data-key]');
  ok(t.inst._test.markTier() === "detail" && det.length === 3, "tier: few enough visible marks become SVG nodes in the pan group");
  const c1 = t.el.querySelector('.vellumwidget-detail [data-key="p1"]');
  const sq = t.el.querySelector('.vellumwidget-detail [data-key="p2"]');
  const c3 = t.el.querySelector('.vellumwidget-detail [data-key="p3"]');
  ok(c1.tagName === "circle" && c1.getAttribute("cx") === "60" && c1.getAttribute("r") === "2" && c1.getAttribute("fill") === "#ff0000" && c1.getAttribute("stroke-width") === "1",
    "tier: a circle record becomes a <circle> with its own paint");
  ok(sq.tagName === "path" && /^M62 48L66 48L66 52L62 52Z$/.test(sq.getAttribute("d")), "tier: a square marker becomes its exact ring");
  ok(c3.getAttribute("fill") === "#0000ff" && c3.getAttribute("fill-opacity") === "0.502" && !c3.hasAttribute("stroke"),
    "tier: alpha becomes fill-opacity, a missing stroke stays off");
  ok(/scale\(var\(--vw-ix/.test(c1.style.transform), "tier: glyph nodes keep a constant size under axis zoom");
  ok(c1.getAttribute("role") === "graphics-symbol" && c1.hasAttribute("tabindex"), "tier: detail nodes are keyboard-focusable marks");
  ok(t.el.querySelector("svg").getAttribute("role") === "graphics-document" && !t.el.querySelector(".vellumwidget-data-table"),
    "tier: the chart is interactive in detail, with no data table of the whole set");
  ok(t.el.querySelector("use.vellumwidget-marks").style.visibility === "hidden", "tier: the mark image is hidden under the nodes");
  // selection is class-based on the nodes (no rings) and survives the tier swap
  fireOn(t.el.querySelector("svg"), "click", c1);
  ok(c1.classList.contains("vellumwidget-selected") && t.el.querySelectorAll(".vellumwidget-fb-sel").length === 0,
    "tier: clicking a detail node selects it by class, not by ring");
  // panning within detail rebuilds for the new view, keeping the selection
  t.inst._test.setView({ x: 47, y: 40, w: 20, h: 20 });
  t.inst._test.evalTier();
  const c1b = t.el.querySelector('.vellumwidget-detail [data-key="p1"]');
  ok(c1b && c1b !== c1 && c1b.classList.contains("vellumwidget-selected") && t.el.querySelectorAll(".vellumwidget-detail").length === 1,
    "tier: a settle within detail rebuilds the nodes and re-applies the selection");
  // zooming back out: nodes go, rings come back, focusables are dropped
  t.inst._test.setView({ x: 0, y: 0, w: 200, h: 100 });
  t.inst._test.evalTier();
  ok(t.inst._test.markTier() === "overview" && !t.el.querySelector(".vellumwidget-detail") && t.el.querySelectorAll(".vellumwidget-fb-sel").length === 1,
    "tier: zooming out leaves detail; the selection is drawn as a ring again");
  ok(t.el.querySelector("svg").getAttribute("role") === "img" && t.el.querySelector("use.vellumwidget-marks").style.visibility === "",
    "tier: out of detail the chart is an image again and the mark image shows");
  // hysteresis: in detail, 4 visible (<= 1.5 x 4 = 6) stays detail
  t.inst._test.setView({ x: 46, y: 40, w: 19, h: 20 }); t.inst._test.evalTier();
  t.inst._test.setView({ x: 45, y: 40, w: 40, h: 20 }); t.inst._test.evalTier();
  ok(t.inst._test.markTier() === "detail" && t.el.querySelectorAll(".vellumwidget-detail [data-key]").length === 4,
    "tier: hysteresis keeps detail up to 1.5x the threshold");
  // detailMarks = 0 turns the tier off
  const off = mountTier({ detailMarks: 0 });
  off.inst._test.setView({ x: 48, y: 40, w: 20, h: 20 }); off.inst._test.evalTier();
  ok(off.inst._test.markTier() === "mid" && !off.el.querySelector(".vellumwidget-detail"), "tier: detailMarks = 0 never materialises nodes");
}

// ============ VW-22: conditions / filters in the node-less raster tiers ============
const slowChecks = []; // promises resolved after timers (settle redraws)
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  const u8 = (xs) => ({ type: "u8", n: xs.length, data: b64(Uint8Array, xs) });
  // A recording 2D context: each fill/stroke with its style, alpha and the
  // circle centres traced since the last beginPath.
  function recCtx() {
    const log = [];
    let arcs = [];
    const c = {
      log: log, fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, lineWidth: 1, lineCap: "butt", lineJoin: "miter",
      _stack: [],
      save() { this._stack.push([this.fillStyle, this.strokeStyle, this.globalAlpha]); },
      restore() { const v = this._stack.pop(); if (v) { this.fillStyle = v[0]; this.strokeStyle = v[1]; this.globalAlpha = v[2]; } },
      setTransform() {}, clearRect() { log.length = 0; }, rect() {}, clip() {}, moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {},
      beginPath() { arcs = []; },
      arc(x) { arcs.push(Math.round(x)); },
      fill() { log.push({ op: "fill", style: this.fillStyle, alpha: this.globalAlpha, xs: arcs.slice() }); },
      stroke() { log.push({ op: "stroke", style: this.strokeStyle, alpha: this.globalAlpha, xs: arcs.slice() }); }
    };
    return c;
  }
  // Which circle centres were filled, and how: "x:style@alpha".
  const fills = (ctx) => ctx.log.filter((r) => r.op === "fill").flatMap((r) => r.xs.map((x) => x + ":" + r.style + "@" + r.alpha)).sort();
  // 4 opaque red circles at x = 40, 80, 120, 160 in panel-1-1.
  function dlOf(n, flagged) {
    const xs = [40, 80, 120, 160];
    return {
      format: "vellum-display-list", version: 1, width: 200, height: 100, n: n,
      record: { kind: { type: "u8", n: n, const: 0 }, paint: { type: "u8", n: n, const: 0 }, key: { type: "u32", n: n, seq: [0, 1] },
        flags: flagged ? u8([0, 0, 0, 1]) : { type: "u8", n: n, const: 0 }, clip: { type: "u8", n: n, const: 0 }, panel: { type: "u8", n: n, const: 1 } },
      point: { cx: n === 4 ? f32(xs) : { type: "f32", n: n, const: 100 }, cy: { type: "f32", n: n, const: 50 }, r: { type: "f32", n: n, const: 3 }, shape: { type: "u8", n: n, const: 0 } },
      rect: { x: f32([]), y: f32([]), w: f32([]), h: f32([]) },
      path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
        closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
      paints: { fill: ["#ff0000ff"], stroke: [null], stroke_width: [0], dash: [null], linecap: ["round"], linejoin: ["round"] },
      clips: null, keys: Array.from({ length: n }, (_, i) => "p" + (i + 1)), panels: "panel-1-1"
    };
  }
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"></g></g></svg>';
  function mountMS(opts) {
    const o = Object.assign({ n: 4 }, opts);
    const ctx = recCtx();
    const proto = window.HTMLCanvasElement.prototype, orig = proto.getContext;
    proto.getContext = function () { return ctx; };
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    const keys = Array.from({ length: o.n }, (_, i) => "p" + (i + 1));
    inst.renderValue({
      svg: svg,
      elements: { key: keys, mark: keys.map(() => "point"),
        cond: o.cond ? keys.map(() => ["pick:color"]) : undefined, filt: o.filt ? keys.map(() => ["pick"]) : undefined },
      panels: [panel],
      marks: { href: "data:image/png;base64,", width: 200, height: 100, panels: "panel-1-1" },
      displayList: dlOf(o.n, o.flagged),
      interactions: {
        selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
        conditions: o.cond ? [{ selection: "pick", aes: "color", if_false: o.cond === "dim" ? null : o.cond, empty: true }] : [],
        filters: o.filt ? [{ selection: "pick" }] : []
      },
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple" }, o.options || {})
    });
    proto.getContext = orig;
    const canvas = e.querySelector("canvas.vellumwidget-canvas");
    const img = () => e.querySelector("use.vellumwidget-marks").style.visibility;
    return { el: e, inst: inst, ctx: ctx, canvas: canvas, img: img };
  }

  // A dim condition, overview -> mid -> detail -> overview.
  const d = mountMS({ cond: "dim", options: { detailMarks: 2 } });
  ok(d.canvas.style.display !== "block" && d.img() === "", "markstate: no state -> the overview is the mark image");
  d.inst._call("select", ["p1"]);
  ok(d.canvas.style.display === "block" && d.img() === "hidden",
    "markstate: an active condition at the overview draws the marks on the canvas instead of the image");
  ok(fills(d.ctx).join(",") === "120:#ff0000ff@0.28,160:#ff0000ff@0.28,40:#ff0000ff@1,80:#ff0000ff@0.28",
    "markstate: the member keeps its paint, non-members draw at the dim opacity");
  ok(d.ctx.log.filter((r) => r.op === "fill" && r.alpha < 1).every((r) => r.xs.length === 1),
    "markstate: dimmed marks are drawn one by one (overlaps compound like SVG nodes)");
  d.inst._test.setView({ x: 30, y: 25, w: 100, h: 50 }); d.inst._test.evalTier();
  ok(d.inst._test.markTier() === "mid" && d.canvas.style.display === "block" && fills(d.ctx).some((f) => /@0.28$/.test(f)) && fills(d.ctx).some((f) => /@1$/.test(f)),
    "markstate: the mid canvas keeps the condition");
  d.inst._test.setView({ x: 30, y: 40, w: 20, h: 20 }); d.inst._test.evalTier();
  ok(d.inst._test.markTier() === "detail" && !d.el.querySelector('.vellumwidget-detail [data-key="p1"]').classList.contains("vellumwidget-cond-dim"),
    "markstate: detail nodes take the condition by class (member)");
  d.inst._test.setView({ x: 70, y: 40, w: 20, h: 20 }); d.inst._test.evalTier();
  ok(d.el.querySelector('.vellumwidget-detail [data-key="p2"]').classList.contains("vellumwidget-cond-dim"),
    "markstate: detail nodes take the condition by class (non-member)");
  d.inst._test.setView({ x: 0, y: 0, w: 200, h: 100 }); d.inst._test.evalTier();
  ok(d.inst._test.markTier() === "overview" && d.canvas.style.display === "block" && d.img() === "hidden" && fills(d.ctx).length === 4,
    "markstate: back at the overview the canvas still carries the condition");
  d.inst._call("clearSelection");
  ok(d.canvas.style.display !== "block" && d.img() === "", "markstate: an empty selection (spotlight) returns to the image");

  // An explicit if_false colour: non-members batched in that colour.
  const c = mountMS({ cond: "#cccccc" });
  c.inst._call("select", ["p1"]);
  ok(fills(c.ctx).join(",") === "120:#cccccc@1,160:#cccccc@1,40:#ff0000ff@1,80:#cccccc@1",
    "markstate: non-members draw in the condition's if_false colour");
  ok(c.ctx.log.filter((r) => r.op === "fill" && r.style === "#cccccc").length === 1, "markstate: same-colour opaque marks are batched");

  // filter_by(): non-members of the filtered view are not drawn and not pickable.
  const f = mountMS({ filt: true });
  f.inst._call("select", ["p3"]);
  ok(fills(f.ctx).join(",") === "120:#ff0000ff@1" && f.img() === "hidden", "markstate: filter_by() hides non-members on the overview canvas");
  ok(f.inst._test.inert("p1") && !f.inst._test.inert("p3"), "markstate: filtered-out marks are inert");
  f.inst._call("clearSelection");
  ok(f.canvas.style.display !== "block", "markstate: clearing the filter returns to the image");

  // A cross-filter (proxy / crosstalk) hides too.
  const x = mountMS({});
  x.inst._call("filter", ["p1", "p2"]);
  ok(fills(x.ctx).join(",") === "40:#ff0000ff@1,80:#ff0000ff@1", "markstate: a cross-filter hides the other marks on the canvas");
  x.inst._call("clearFilter");
  ok(x.canvas.style.display !== "block", "markstate: clearing the cross-filter returns to the image");

  // A flagged record lives only in the image: the overview stays the image.
  const g = mountMS({ cond: "dim", flagged: true });
  g.inst._call("select", ["p1"]);
  ok(g.canvas.style.display !== "block" && g.img() === "", "markstate: an inexact list keeps the overview image (documented limit)");

  // Over LIVE_DRAW_MAX marks a state change redraws once settled, and keeps a
  // drawn canvas up meanwhile.
  const big = mountMS({ n: 50001, cond: "dim" });
  big.inst._call("select", ["p1"]);
  ok(big.canvas.style.display !== "block", "markstate: >50k marks: the first state draw waits for the settle");
  slowChecks.push(new Promise(function (resolve) {
    setTimeout(function () {
      ok(big.canvas.style.display === "block" && big.ctx.log.filter((r) => r.op === "fill").length === 50001,
        "markstate: >50k marks: the settled redraw draws every mark");
      big.inst._call("select", ["p2"]);
      ok(big.canvas.style.display === "block" && big.ctx.log.length > 0 && big.img() === "hidden", "markstate: >50k marks: a later state change keeps the drawn canvas until it redraws");
      resolve();
    }, 200);
  }));
}

// ============ VW-25: raster export draws the marks as currently drawn ============
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  const u8 = (xs) => ({ type: "u8", n: xs.length, data: b64(Uint8Array, xs) });
  function recCtx() {
    const log = [];
    let arcs = [];
    return {
      log: log, fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, lineWidth: 1, _stack: [],
      save() { this._stack.push([this.fillStyle, this.strokeStyle, this.globalAlpha]); },
      restore() { const v = this._stack.pop(); if (v) { this.fillStyle = v[0]; this.strokeStyle = v[1]; this.globalAlpha = v[2]; } },
      setTransform() {}, clearRect() { log.length = 0; }, rect() {}, clip() {}, moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {},
      beginPath() { arcs = []; }, arc(x) { arcs.push(Math.round(x)); },
      fill() { log.push({ op: "fill", style: this.fillStyle, alpha: this.globalAlpha, xs: arcs.slice() }); },
      stroke() { log.push({ op: "stroke", style: this.strokeStyle, alpha: this.globalAlpha, xs: arcs.slice() }); }
    };
  }
  const fills = (ctx) => ctx.log.filter((r) => r.op === "fill").flatMap((r) => r.xs.map((x) => x + ":" + r.style + "@" + r.alpha)).sort();
  function dl4(flagged) {
    return {
      format: "vellum-display-list", version: 1, width: 200, height: 100, n: 4,
      record: { kind: { type: "u8", n: 4, const: 0 }, paint: { type: "u8", n: 4, const: 0 }, key: { type: "u32", n: 4, seq: [0, 1] },
        flags: flagged ? u8([0, 0, 0, 1]) : { type: "u8", n: 4, const: 0 }, clip: { type: "u8", n: 4, const: 0 }, panel: { type: "u8", n: 4, const: 1 } },
      point: { cx: f32([40, 80, 120, 160]), cy: { type: "f32", n: 4, const: 50 }, r: { type: "f32", n: 4, const: 3 }, shape: { type: "u8", n: 4, const: 0 } },
      rect: { x: f32([]), y: f32([]), w: f32([]), h: f32([]) },
      path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
        closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
      paints: { fill: ["#ff0000ff"], stroke: [null], stroke_width: [0], dash: [null], linecap: ["round"], linejoin: ["round"] },
      clips: null, keys: ["p1", "p2", "p3", "p4"], panels: "panel-1-1"
    };
  }
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const below = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><g role="grid"><path d="M20 50 L180 50" stroke="#fff"/></g></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  const above = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><g data-vellum-id="layer-2-rule-g2"><path class="ref" d="M20 30 L180 30" stroke="#ff0000"/></g></g></g></svg>';
  const proto = window.HTMLCanvasElement.prototype;
  function mountEx(o) {
    const screen = recCtx();
    const orig = proto.getContext;
    // (no list: the old pixel-sampling path would need an Image, so no context)
    proto.getContext = function () { return o.nolist ? null : screen; };
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    inst.renderValue({
      svg: below,
      elements: { key: ["p1", "p2", "p3", "p4"], mark: ["point", "point", "point", "point"], cond: [["pick:color"], ["pick:color"], ["pick:color"], ["pick:color"]] },
      panels: [panel],
      marks: { href: "data:image/png;base64,ORIGINAL", width: 400, height: 200, panels: "panel-1-1" },
      above: above,
      displayList: o.nolist ? null : dl4(o.flagged),
      interactions: { selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
        conditions: [{ selection: "pick", aes: "color", if_false: null, empty: true }], filters: [] },
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple" }, o.options || {})
    });
    proto.getContext = orig;
    return { el: e, inst: inst, screen: screen };
  }
  // Export through the toolbar's SVG button; the export canvas gets its own
  // recording context, its size and a stub data URI.
  function exportSvg(t) {
    const exp = recCtx();
    let size = null, captured = null;
    const saved = { gc: proto.getContext, tdu: proto.toDataURL, Blob: global.Blob, XS: global.XMLSerializer, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    proto.getContext = function () { return exp; };
    proto.toDataURL = function () { size = [this.width, this.height]; return "data:image/png;base64,REDRAWN"; };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    const aClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    t.el.querySelector('[data-act="svg"]').click();
    window.HTMLAnchorElement.prototype.click = aClick;
    proto.getContext = saved.gc; proto.toDataURL = saved.tdu;
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    return { svg: captured || "", ctx: exp, size: size };
  }
  // A dim condition at the overview: the export carries it.
  const a = mountEx({});
  a.inst._call("select", ["p1"]);
  const ea = exportSvg(a);
  ok(/class="vellumwidget-marks-export"[^>]*href="data:image\/png;base64,REDRAWN"/.test(ea.svg) && !/ORIGINAL/.test(ea.svg) && !/<use[^>]*vellumwidget-marks/.test(ea.svg),
    "export: with an exact list the marks are a redrawn image, not the mark PNG");
  // (canvas px at 2x: the marks at x = 40, 80, 120, 160 land at 80 ... 320)
  ok(fills(ea.ctx).join(",") === "160:#ff0000ff@0.28,240:#ff0000ff@0.28,320:#ff0000ff@0.28,80:#ff0000ff@1",
    "export: the redraw carries the condition (member opaque, the rest dimmed)");
  ok(ea.size && ea.size[0] === 400 && ea.size[1] === 200, "export: drawn at export resolution (at least 2x the frame)");
  // order: furniture, redrawn marks, the above layer, the re-ticked labels
  a.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
  const ez = exportSvg(a);
  const iImg = ez.svg.indexOf("vellumwidget-marks-export"), iAb = ez.svg.indexOf("vellumwidget-above-export"),
    iRef = ez.svg.indexOf('class="ref"'), iRt = ez.svg.indexOf("vellumwidget-retick-export"), iGrid = ez.svg.indexOf('role="grid"');
  ok(iGrid >= 0 && iImg > iGrid && iAb > iImg && iRef > iAb && iRt > iRef, "export: furniture, then the redrawn marks, then the above layer, then the re-ticked labels");
  ok(/vellumwidget-marks-export"[^>]*x="0" y="0" width="200" height="100"/.test(ez.svg), "export: under axis zoom the image covers the fixed frame");
  ok(fills(ez.ctx).join(",") === "120:#ff0000ff@0.28,280:#ff0000ff@0.28", "export: a zoomed export redraws the marks in view through the panel transform, at full size");
  // export_options(scale) raises the resolution
  const k = mountEx({ options: { export: { scale: 3 } } });
  ok(exportSvg(k).size[0] === 600, "export: export_options(scale) above 2 sets the resolution");
  // the detail tier's nodes are replaced by the redraw
  const d = mountEx({ options: { detailMarks: 2 } });
  d.inst._test.setView({ x: 30, y: 40, w: 20, h: 20 }); d.inst._test.evalTier();
  const ed = exportSvg(d);
  ok(d.inst._test.markTier() === "detail" && !/vellumwidget-detail/.test(ed.svg) && /vellumwidget-marks-export/.test(ed.svg),
    "export: in the detail tier the nodes give way to the redrawn image");
  // filter_by / cross-filter: hidden marks are left out
  const x = mountEx({});
  x.inst._call("filter", ["p2"]);
  ok(fills(exportSvg(x).ctx).join(",") === "160:#ff0000ff@1", "export: a cross-filter leaves the hidden marks out");
  // fall back to the PNG: an inexact list, or no list
  const g = mountEx({ flagged: true });
  const eg = exportSvg(g);
  ok(/ORIGINAL/.test(eg.svg) && /<use[^>]*vellumwidget-marks/.test(eg.svg) && !/vellumwidget-marks-export/.test(eg.svg),
    "export: a list with flagged records keeps the mark PNG");
  const n = mountEx({ nolist: true });
  ok(/ORIGINAL/.test(exportSvg(n).svg), "export: no display list (older vellum) keeps the mark PNG");
}

// ============ VW-21: furniture painted after the marks stays above them ============
{
  const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  // Both layers come from one scene, so they share vellum's id prefix ("vl1-").
  const below = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" role="img" aria-labelledby="vl1-t"><title id="vl1-t">T</title>' +
    '<defs><clipPath id="vl1-c0"><rect x="20" y="10" width="160" height="80"/></clipPath></defs>' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1" clip-path="url(#vl1-c0)"><g role="grid"><path d="M20 50 L180 50" stroke="#fff"/></g></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  const above = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" role="img" aria-labelledby="vl1-t vl1-d"><title id="vl1-t">T</title><desc id="vl1-d">D</desc>' +
    '<defs><clipPath id="vl1-c0"><rect x="20" y="10" width="160" height="80"/></clipPath></defs>' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1" clip-path="url(#vl1-c0)">' +
    '<g data-vellum-id="layer-2-rule" role="presentation"><path class="ref" d="M20 30 L180 30" stroke="#ff0000" stroke-width="2"/></g></g></g>' +
    '<g data-vellum-panel="axis-x-3"></g><text class="title" x="5" y="5">T</text></svg>';
  function mountAbove(withAbove, extra) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    const payload = (ab) => ({
      svg: below,
      elements: { key: ["a", "b"], mark: { levels: "point", codes: [0, 0] }, x0: [60, 120], y0: [50, 50], x1: [62, 122], y1: [52, 52] },
      panels: [panel],
      marks: { href: PNG1, width: 200, height: 100, panels: "panel-1-1" },
      above: ab ? above : null,
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple" }, extra || {})
    });
    inst.renderValue(payload(withAbove));
    return { el: e, inst: inst, payload: payload };
  }
  const t = mountAbove(true);
  const lay = t.el.querySelector("svg.vellumwidget-above-layer");
  ok(!!lay && lay.querySelector("path.ref") && lay.getAttribute("aria-hidden") === "true" && !lay.querySelector("title, desc") && !lay.hasAttribute("role"),
    "above: the furniture painted after the marks is an aria-hidden overlay");
  const kids = Array.prototype.slice.call(t.el.querySelector(".vellumwidget-stage").children);
  const canvas = t.el.querySelector("canvas.vellumwidget-canvas");
  ok(!canvas || kids.indexOf(lay) > kids.indexOf(canvas), "above: the overlay stacks after (over) the marks canvas");
  const css = Array.prototype.map.call(document.querySelectorAll("style"), (n) => n.textContent).join("\n");
  ok(/\.vellumwidget-above-layer \{[^}]*pointer-events: none/.test(css), "above: the overlay is never a pointer target (picking reaches the marks)");
  const clip = lay.querySelector("clipPath");
  const mPan = lay.querySelector('[data-vellum-pan="panel-1-1"]');
  ok(clip.id !== "vl1-c0" && mPan.parentNode.getAttribute("clip-path") === "url(#" + clip.id + ")" && document.querySelectorAll("#" + clip.id).length === 1,
    "above: its ids are page-unique and its references follow");
  ok(!mPan.hasAttribute("clip-path"), "above: the panel clip moves off the zoomed pan group onto the panel group");
  ok(t.inst._test.axisZoomActive(), "above: axis zoom stays on with the overlay");
  t.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
  const basePan = t.el.querySelector('.vellumwidget-svg-holder [data-vellum-pan="panel-1-1"]');
  ok(/matrix\(2 /.test(mPan.getAttribute("transform") || "") && mPan.getAttribute("transform") === basePan.getAttribute("transform") &&
     mPan.style.getPropertyValue("--vw-ix") === "0.5",
    "above: the overlay's pan group zooms with the panel's");
  ok(lay.getAttribute("viewBox") === t.el.querySelector(".vellumwidget-svg-holder svg").getAttribute("viewBox"), "above: the overlay shares the base frame");
  ok(lay.querySelector("path.ref").getAttribute("vector-effect") === "non-scaling-stroke", "above: the overlay's rule keeps its stroke width under zoom (VW-26)");
  // export: furniture, marks, then the above layer (with its zoomed pan group)
  {
    let captured = null;
    const saved = { Blob: global.Blob, XS: global.XMLSerializer, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    const aClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    t.el.querySelector('[data-act="svg"]').click();
    window.HTMLAnchorElement.prototype.click = aClick;
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    const iUse = captured ? captured.search(/<use[^>]*vellumwidget-marks/) : -1;
    const iAbove = captured ? captured.indexOf("vellumwidget-above-export") : -1;
    const iRef = captured ? captured.indexOf('class="ref"') : -1;
    ok(iUse >= 0 && iAbove > iUse && iRef > iAbove, "above export: the above layer is folded in after the marks");
    ok(captured && /vellumwidget-above-export[\s\S]*data-vellum-pan="panel-1-1"[^>]*transform="matrix\(2 /.test(captured),
      "above export: it carries the zoomed pan transform");
  }
  // a re-render without the layer drops the overlay
  t.inst.renderValue(t.payload(false));
  ok(!t.el.querySelector(".vellumwidget-above-layer"), "above: a render without the layer leaves no overlay");
  const none = mountAbove(false);
  ok(!none.el.querySelector(".vellumwidget-above-layer"), "above: no layer shipped (older vellum) -> no overlay, as before");
  // VW-27: the navigator's mini-map folds the above layer in, over the marks
  const nav = mountAbove(true, { navigator: true });
  const mini = nav.el.querySelector(".vellumwidget-nav-mini svg");
  const miniHtml = mini ? mini.outerHTML : "";
  const iMiniUse = miniHtml.search(/<use[^>]*vellumwidget-marks/), iMiniRef = miniHtml.indexOf('class="ref"');
  ok(mini && mini.querySelector(".vellumwidget-nav-above path.ref") && iMiniUse >= 0 && iMiniRef > iMiniUse,
    "navigator: the mini-map carries the above layer, after the mark image");
  ok(mini && !mini.querySelector(".vellumwidget-nav-above [id], .vellumwidget-nav-above [clip-path], .vellumwidget-nav-above defs"),
    "navigator: the folded-in overlay keeps no ids, clips or defs (no clash with the live overlay)");
  ok(nav.el.querySelectorAll("path.ref").length === 2, "navigator: the live overlay keeps its own line");
  const navNone = mountAbove(false, { navigator: true });
  ok(!navNone.el.querySelector(".vellumwidget-nav-above"), "navigator: no above layer -> nothing folded in");
}

// ============ VW-31: the mini-map's strokes do not squash ============
{
  const e = document.createElement("div");
  document.body.appendChild(e);
  const i = widgetDef.factory(e);
  i.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<g data-vellum-panel="panel-1-1">' +
      '<path class="grid" d="M0 50H200" fill="none" stroke="#fff" stroke-width="0.5"/>' +
      '<path class="rule" d="M0 30H200" fill="none" stroke="#f00" stroke-width="2.5"/>' +
      '<g stroke="#333" stroke-width="0.25"><line class="tick" x1="0" y1="90" x2="5" y2="90"/></g>' +
      '<rect class="bg" x="0" y="0" width="200" height="100" fill="#eee"/>' +
      '<rect class="nostroke" x="0" y="0" width="10" height="10" fill="#000" stroke="none"/>' +
      '<path data-key="k" d="M40 15h20v10z" fill="#00f"/>' +
      '</g></svg>',
    elements: { key: ["k"], x0: [40], y0: [15], x1: [60], y1: [25] },
    options: { hover: true, select: true, zoom: true, navigator: true }
  });
  const mini = e.querySelector(".vellumwidget-nav-mini svg");
  const q = (sel) => mini.querySelector(sel);
  ok(mini.getAttribute("preserveAspectRatio") === "none", "VW-31: the mini-map still stretches to fill the strip");
  ok(q(".grid").getAttribute("vector-effect") === "non-scaling-stroke" && q(".grid").getAttribute("stroke-width") === "1",
    "VW-31: a thin stroke is non-scaling and raised to the 1 px minimum");
  ok(q(".rule").getAttribute("vector-effect") === "non-scaling-stroke" && q(".rule").getAttribute("stroke-width") === "2.5",
    "VW-31: a stroke above the minimum keeps its own width");
  ok(q(".tick").getAttribute("vector-effect") === "non-scaling-stroke" && q(".tick").getAttribute("stroke-width") === "1",
    "VW-31: a stroke inherited from a group is found and raised too");
  ok(!q(".bg").hasAttribute("vector-effect") && !q(".nostroke").hasAttribute("vector-effect") && !q(".bg").hasAttribute("stroke-width"),
    "VW-31: unstroked shapes are left alone");
  ok(!e.querySelector(".vellumwidget-svg-holder svg .grid").hasAttribute("vector-effect") &&
    e.querySelector(".vellumwidget-svg-holder svg .grid").getAttribute("stroke-width") === "0.5",
    "VW-31: the live plot's strokes are untouched");
}

// ============ VW-26: unkeyed panel furniture keeps its size under axis zoom ============
{
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1">' +
    '<path d="M20 10 L180 10 L180 90 L20 90 Z" fill="#ebebeb"/>' +
    '<g role="grid"><path class="grid" d="M20 50 L180 50" stroke="#fff"/></g>' +
    '<g data-vellum-id="layer-1-point-g1" role="presentation"><circle data-key="a" cx="60" cy="50" r="3"/></g>' +
    '<g data-vellum-id="layer-2-rule-g2" role="presentation"><path class="rule" d="M20 30 L180 30" stroke="#f00" stroke-width="2"/></g>' +
    '<g data-vellum-id="layer-3-text-g3" role="presentation"><text class="note" x="40" y="20" transform="matrix(1 0 0 1 20 10)" font-size="10">note</text>' +
    '<text class="rot" x="0" y="0" transform="rotate(-90 50 50)">r</text></g>' +
    '<g data-vellum-id="layer-4-point-g4" role="presentation"><circle class="up" cx="100" cy="60" r="5"/></g>' +
    '</g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  function mountFurn(opts) {
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    inst.renderValue({
      svg: svg,
      elements: { key: ["a"], mark: ["point"], x0: [57], y0: [47], x1: [63], y1: [53] },
      panels: [panel],
      options: Object.assign({ hover: true, select: true, zoom: true }, opts || {})
    });
    return { el: e, inst: inst, q: (sel) => e.querySelector(sel) };
  }
  const f = mountFurn();
  ok(f.inst._test.axisZoomActive(), "furniture: axis zoom is active");
  ok(f.q("path.rule").getAttribute("vector-effect") === "non-scaling-stroke", "furniture: an unkeyed rule keeps its stroke width (non-scaling)");
  const note = f.q("text.note");
  ok(note.style.transformBox === "view-box" && /^translate\(60px, ?30px\) scale\(var\(--vw-ix/.test(note.style.transform) &&
     /translate\(-60px, ?-30px\) matrix\(1, ?0, ?0, ?1, ?20, ?10\)$/.test(note.style.transform),
    "furniture: annotation text counter-scales about its anchor and keeps its placement");
  ok(!f.q("text.rot").style.transform, "furniture: text with a transform it can't restate (rotate) is left alone");
  const up = f.q("circle.up");
  ok(/scale\(var\(--vw-ix/.test(up.style.transform) && up.style.transformBox === "fill-box" && !up.hasAttribute("vector-effect"),
    "furniture: an unkeyed glyph layer keeps its pixel size");
  ok(/scale\(var\(--vw-ix/.test(f.q('[data-key="a"]').style.transform), "furniture: keyed glyphs keep their own counter-scale");
  ok(!f.q("path.grid").hasAttribute("vector-effect"), "furniture: the hidden static gridlines are not touched");
  const bg = f.q("[data-vw-panel-bg]");
  ok(bg && !bg.closest("[data-vellum-pan]") && !bg.hasAttribute("vector-effect"), "furniture: the panel background still leaves the pan group untouched");
  f.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 });
  ok(f.q(".vellumwidget-retick-grid line") && f.q(".vellumwidget-retick-layer text"), "furniture: the re-tick still draws gridlines and labels");
  const sc = mountFurn({ zoomMarks: "scale" });
  ok(!sc.q("path.rule").hasAttribute("vector-effect") && !sc.q("text.note").style.transform, "furniture: zoom_marks = \"scale\" keeps the old scaling");
  // PNG export at scale 2: a non-scaling stroke is widened to match (else it
  // would be rasterised at half its on-screen width)
  {
    const k2 = mountFurn({ export: { scale: 2 } });
    let captured = null;
    const saved = { Blob: global.Blob, XS: global.XMLSerializer, Image: global.Image, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    global.Image = function () {}; // never loads: only the serialised SVG is checked
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    k2.el.querySelector('[data-act="png"]').click();
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS; global.Image = saved.Image;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    ok(captured && /class="rule"[^>]*stroke-width="4"/.test(captured), "furniture: a PNG export at scale 2 doubles the non-scaling rule's width");
    ok(k2.q("path.rule").getAttribute("stroke-width") === "2", "furniture: the live rule keeps its width");
  }
  const noaz = mountFurn({ axisZoom: false });
  ok(!noaz.q("path.rule").hasAttribute("vector-effect") && !noaz.q("text.note").style.transform, "furniture: no axis zoom, nothing changes");
}

// ============ VW-23: display list v2 -- gradients, clip paths, opacity groups ============
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  const u8 = (xs) => ({ type: "u8", n: xs.length, data: b64(Uint8Array, xs) });
  // A recording context that also logs gradients, clips, transforms and layer composites.
  function recCtx() {
    const log = [];
    return {
      log: log, fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, lineWidth: 1, _stack: [], _m: [1, 0, 0, 1, 0, 0],
      save() { this._stack.push([this.fillStyle, this.globalAlpha, this._m.slice()]); },
      restore() { const v = this._stack.pop(); if (v) { this.fillStyle = v[0]; this.globalAlpha = v[1]; this._m = v[2]; } },
      setTransform(a, b, c, d, e, f) { this._m = [a, b, c, d, e, f]; },
      transform(a, b, c, d, e, f) { const m = this._m; this._m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; },
      clearRect() { log.length = 0; }, rect() {}, moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {}, beginPath() {}, arc() {},
      clip(rule) { log.push({ op: "clip", rule: rule || "rect" }); },
      createLinearGradient(x1, y1, x2, y2) { const g = { kind: "linear", args: [x1, y1, x2, y2], stops: [], addColorStop(o, c) { this.stops.push(o + ":" + c); } }; log.push({ op: "grad", g: g }); return g; },
      createRadialGradient() { const g = { kind: "radial", args: [].slice.call(arguments), stops: [], addColorStop(o, c) { this.stops.push(o + ":" + c); } }; log.push({ op: "grad", g: g }); return g; },
      drawImage() { log.push({ op: "composite", alpha: this.globalAlpha }); },
      fill(rule) { log.push({ op: "fill", style: typeof this.fillStyle === "string" ? this.fillStyle : "gradient:" + this.fillStyle.kind, alpha: this.globalAlpha, m: this._m.slice() }); },
      stroke() { log.push({ op: "stroke" }); }
    };
  }
  // p1 solid; p2 gradient fill; p3 in a 0.5 opacity group; p4 clipped by a
  // triangle; p5 pick-only.
  function dlV2(o) {
    o = o || {};
    return {
      format: "vellum-display-list", version: o.version || 2, width: 200, height: 100, n: 5,
      record: { kind: { type: "u8", n: 5, const: 0 }, paint: u8([0, 1, 0, 0, 2]), key: { type: "u32", n: 5, seq: [0, 1] },
        flags: u8([0, 0, 0, 0, 16]), clip: u8([0, 0, 0, 1, 0]), panel: { type: "u8", n: 5, const: 1 },
        group: o.noGroups ? undefined : u8([0, 0, 1, 0, 0]) },
      point: { cx: f32([40, 70, 100, 130, 160]), cy: { type: "f32", n: 5, const: 50 }, r: { type: "f32", n: 5, const: 4 }, shape: { type: "u8", n: 5, const: 0 } },
      rect: { x: f32([]), y: f32([]), w: f32([]), h: f32([]) },
      path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
        closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
      paints: { fill: ["#ff0000ff", null, null], stroke: [null, null, null], stroke_width: [0, 0, 0], dash: [null, null, null],
        linecap: ["round", "round", "round"], linejoin: ["round", "round", "round"], fill_gradient: o.badGrad ? [0, 5, 0] : [0, 1, 0] },
      clips: { x0: [120], y0: [40], x1: [140], y1: [60], path_start: [0], path_n: [1] },
      gradients: { type: "linear", x1: 0, y1: 0, x2: 10, y2: 0, r1: 0, r2: 0, a: 1, b: 0, c: 0, d: 1, e: 65, f: 0,
        stop_offset: [0, 2], stop_pos: [0, 1], stop_color: ["#ff0000ff", "#0000ff80"] },
      clip_paths: { xy: f32([120, 60, 140, 60, 130, 40]), run_offset: u8([0, 3]), path_offset: u8([0, 1]), evenodd: u8([0]) },
      groups: o.noGroups ? null : { alpha: [0.5], parent: [0] },
      keys: ["p1", "p2", "p3", "p4", "p5"], panels: "panel-1-1"
    };
  }
  const T = widgetDef._internals || null;
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"></g></g></svg>';
  const proto = window.HTMLCanvasElement.prototype;
  function mountV2(o) {
    const ctx = recCtx(), layer = recCtx();
    const orig = proto.getContext;
    // the widget's canvas records into `ctx`, group layers into `layer`
    proto.getContext = function () { return this.classList && this.classList.contains("vellumwidget-canvas") ? ctx : layer; };
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    const keys = ["p1", "p2", "p3", "p4", "p5"];
    inst.renderValue({
      svg: svg,
      elements: { key: keys, mark: keys.map(() => "point"), cond: keys.map(() => ["pick:color"]) },
      panels: [panel],
      marks: { href: "data:image/png;base64,", width: 200, height: 100, panels: "panel-1-1" },
      displayList: dlV2(o),
      interactions: { selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
        conditions: [{ selection: "pick", aes: "color", if_false: "#cccccc", empty: true }], filters: [] },
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple", detailMarks: 10 }, (o && o.options) || {})
    });
    return { el: e, inst: inst, ctx: ctx, layer: layer, restore: function () { proto.getContext = orig; } };
  }
  const m = mountV2();
  ok(m.inst._test.displayListSize() === 5, "dlv2: a version-2 list decodes");
  // mid tier (zoomed): the canvas draws every record exactly
  m.inst._test.setView({ x: 20, y: 10, w: 160, h: 80 });
  m.inst._test.setView({ x: 25, y: 12, w: 150, h: 75 });
  m.inst._test.evalTier();
  ok(m.inst._test.markTier() === "detail", "dlv2: a list with gradients, clip paths and groups is exact: the detail tier is reachable");
  const det = m.el.querySelector(".vellumwidget-detail [data-key=\"p2\"]");
  const gid = det && /^url\(#(.+)\)$/.exec(det.getAttribute("fill") || "");
  const gEl = gid && document.getElementById(gid[1]);
  ok(gEl && gEl.tagName === "linearGradient" && gEl.getAttribute("gradientUnits") === "userSpaceOnUse" &&
     gEl.getAttribute("gradientTransform") === "matrix(1 0 0 1 65 0)" && gEl.querySelectorAll("stop").length === 2 &&
     gEl.querySelectorAll("stop")[1].getAttribute("stop-opacity") === "0.502",
    "dlv2 detail: a gradient fill is a userSpaceOnUse <linearGradient> with its transform and stops");
  const p3 = m.el.querySelector(".vellumwidget-detail [data-key=\"p3\"]");
  ok(p3 && p3.parentNode.getAttribute("opacity") === "0.5" && !m.el.querySelector(".vellumwidget-detail [data-key=\"p1\"]").parentNode.hasAttribute("opacity"),
    "dlv2 detail: a record in an opacity group sits in a <g opacity>");
  const p4 = m.el.querySelector(".vellumwidget-detail [data-key=\"p4\"]");
  const cid = p4 && /^url\(#(.+)\)$/.exec(p4.getAttribute("clip-path") || "");
  const c0 = cid && document.getElementById(cid[1]);
  const c1 = c0 && document.getElementById((/^url\(#(.+)\)$/.exec(c0.getAttribute("clip-path") || "") || [])[1]);
  ok(c0 && c0.querySelector("path") && c1 && c1.querySelector("rect"), "dlv2 detail: a clip path chains the path and the clip rect (intersection)");
  ok(!m.el.querySelector(".vellumwidget-detail [data-key=\"p5\"]"), "dlv2 detail: a pick-only record draws no node");
  // a mark only partly in view (centre outside) is still built
  m.inst._test.setView({ x: 73, y: 30, w: 40, h: 40 }); m.inst._test.evalTier();
  ok(m.inst._test.markTier() === "detail" && m.el.querySelector(".vellumwidget-detail [data-key=\"p2\"]"),
    "dlv2 detail: a mark whose box overlaps the view is built even with its centre outside");
  // back out to mid: the canvas
  m.inst._test.setView({ x: 0, y: 0, w: 200, h: 100 }); m.inst._test.evalTier();
  m.inst._call("select", ["p1", "p2", "p3", "p4"]); // a condition: the overview canvas draws
  const log = m.ctx.log;
  const grads = log.filter((r) => r.op === "grad");
  ok(grads.length === 1 && grads[0].g.kind === "linear" && grads[0].g.stops.join(",") === "0:#ff0000ff,1:#0000ff80",
    "dlv2 canvas: a gradient fill is built from its stops");
  const gfill = log.filter((r) => r.op === "fill" && r.style === "gradient:linear")[0];
  ok(gfill && gfill.m[4] === 65 && gfill.m[0] === 1, "dlv2 canvas: the gradient is placed through the record's affine times its own transform");
  const comp = log.filter((r) => r.op === "composite");
  ok(comp.length === 1 && comp[0].alpha === 0.5 && m.layer.log.filter((r) => r.op === "fill" && r.alpha === 1).length === 1,
    "dlv2 canvas: an opacity group draws into a layer (at full alpha) composited once at its alpha");
  ok(log.some((r) => r.op === "clip" && r.rule === "nonzero"), "dlv2 canvas: a clip path clips");
  // a condition colour replaces a gradient fill
  m.inst._call("select", ["p1"]);
  ok(m.ctx.log.some((r) => r.op === "fill" && r.style === "#cccccc") && !m.ctx.log.some((r) => r.style === "gradient:linear"),
    "dlv2 canvas: a condition colour replaces the gradient");
  m.restore();
  // a gradient ref past the table is not drawable: the record is flagged
  const bad = mountV2({ badGrad: true });
  bad.inst._test.setView({ x: 25, y: 12, w: 150, h: 75 }); bad.inst._test.evalTier();
  ok(bad.inst._test.markTier() === "mid", "dlv2: a gradient ref past the table flags its record (list inexact, no detail)");
  bad.restore();
  // version 1 with a pick-only record: exact (it paints nothing)
  const v1 = mountV2({ version: 1, noGroups: true });
  v1.inst._test.setView({ x: 25, y: 12, w: 150, h: 75 }); v1.inst._test.evalTier();
  ok(v1.inst._test.markTier() === "detail", "dlv2: pick-only records no longer keep a list from being exact");
  v1.restore();
}

// ============ VW-28: SVG-mode export keeps class-based state styles ============
{
  const e = document.createElement("div");
  document.body.appendChild(e);
  const svgS =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><g data-vellum-panel="panel-1-1">' +
    '<path data-key="s1" fill="#f00" d="M5 5h4v4h-4z"/>' +
    '<path data-key="s2" fill="#0f0" d="M20 5h4v4h-4z"/>' +
    '<path data-key="s3" fill="#00f" opacity="0.5" d="M35 5h4v4h-4z"/>' +
    '<path data-key="s4" fill="#000" d="M50 5h4v4h-4z"/>' +
    "</g></svg>";
  const inst = widgetDef.factory(e, 200, 100);
  inst.renderValue({
    svg: svgS,
    elements: [{ key: "s1", cond: ["pick:color"] }, { key: "s2", cond: ["pick:color"] }, { key: "s3", cond: ["pick:color"] }, { key: "s4", cond: ["pick:color"] }],
    interactions: {
      selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
      conditions: [{ selection: "pick", aes: "color", empty: true }]
    },
    options: { hover: true, select: true, selectMode: "multiple" }
  });
  inst._call("select", ["s1"]);
  e.querySelector('[data-key="s4"]').classList.add("vellumwidget-filtered");
  function exportSvgS(selector) {
    let captured = null;
    const saved = { Blob: global.Blob, XS: global.XMLSerializer, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    const aClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    e.querySelector(selector).click();
    window.HTMLAnchorElement.prototype.click = aClick;
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    return new window.DOMParser().parseFromString(captured || "<svg/>", "image/svg+xml");
  }
  const s1 = e.querySelector('[data-key="s1"]'), s2 = e.querySelector('[data-key="s2"]');
  ok(s1.classList.contains("vellumwidget-selected") && s2.classList.contains("vellumwidget-cond-dim"),
    "VW-28 setup: s1 selected, s2 condition-dimmed");
  const doc = exportSvgS('[data-act="svg"]');
  const x1 = doc.querySelector('[data-key="s1"]'), x2 = doc.querySelector('[data-key="s2"]'),
    x3 = doc.querySelector('[data-key="s3"]'), x4 = doc.querySelector('[data-key="s4"]');
  ok(x2 && parseFloat(x2.style.opacity) === 0.28, "VW-28 export: a condition-dimmed node carries its opacity inline");
  ok(x3 && parseFloat(x3.style.opacity) === 0.28 && x3.getAttribute("opacity") === "0.5",
    "VW-28 export: the dim overrides an opacity attribute, as the stylesheet does on screen");
  ok(x1 && !x1.style.opacity && x1.style.stroke !== "" && parseFloat(x1.style.strokeWidth) === 1.4,
    "VW-28 export: the selected node keeps its outline (stroke + width) and is not dimmed");
  ok(x4 && x4.style.display === "none", "VW-28 export: a filtered node is hidden in the export");
  // A themed dim opacity (custom property on the root) is resolved on the live node.
  e.style.setProperty("--vellumwidget-dim-opacity", "0.5");
  const themed = exportSvgS('[data-act="svg"]').querySelector('[data-key="s2"]');
  const cv = window.getComputedStyle(s2).getPropertyValue("--vellumwidget-dim-opacity").trim();
  ok(parseFloat(themed.style.opacity) === (cv ? parseFloat(cv) : 0.28),
    "VW-28 export: the dim opacity follows the theme's custom property where it resolves");
  e.style.removeProperty("--vellumwidget-dim-opacity");
  // the live DOM is untouched
  ok(!s2.style.opacity && !s1.style.stroke, "VW-28 export: the on-screen nodes are not restyled");
  // clearing the selection: nothing left inline
  inst._call("clearSelection");
  const cleared = exportSvgS('[data-act="svg"]');
  ok(!cleared.querySelector('[data-key="s2"]').style.opacity && !cleared.querySelector('[data-key="s1"]').style.stroke,
    "VW-28 export: with no selection the nodes export unstyled");
}

// ============ VW-29: one glyph-size rule for the mid and detail tiers ============
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  function recCtx() {
    const log = [];
    let arcs = [];
    return {
      log: log, fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, lineWidth: 1, _stack: [],
      save() {}, restore() {}, setTransform() {}, clearRect() { log.length = 0; }, rect() {}, clip() {},
      moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {},
      beginPath() { arcs = []; }, arc(x, y, r) { arcs.push(r); },
      fill() { log.push({ op: "fill", rs: arcs.slice() }); },
      stroke() { log.push({ op: "stroke", rs: arcs.slice(), lw: this.lineWidth }); }
    };
  }
  // A raw scene: no panels (so no axis zoom), two stroked discs of radius 3.
  const dl = {
    format: "vellum-display-list", version: 1, width: 200, height: 100, n: 2,
    record: { kind: { type: "u8", n: 2, const: 0 }, paint: { type: "u8", n: 2, const: 0 }, key: { type: "u32", n: 2, seq: [0, 1] },
      flags: { type: "u8", n: 2, const: 0 }, clip: { type: "u8", n: 2, const: 0 }, panel: { type: "u8", n: 2, const: 0 } },
    point: { cx: f32([60, 140]), cy: { type: "f32", n: 2, const: 50 }, r: { type: "f32", n: 2, const: 3 }, shape: { type: "u8", n: 2, const: 0 } },
    rect: { x: f32([]), y: f32([]), w: f32([]), h: f32([]) },
    path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
      closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
    paints: { fill: ["#ff0000ff"], stroke: ["#000000ff"], stroke_width: [1], dash: [null], linecap: ["round"], linejoin: ["round"] },
    clips: null, keys: ["p1", "p2"], panels: ""
  };
  const proto = window.HTMLCanvasElement.prototype;
  const ctx = recCtx();
  const orig = proto.getContext;
  proto.getContext = function () { return ctx; };
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 200, 100);
  inst.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/></svg>',
    elements: { key: ["p1", "p2"], mark: ["point", "point"], x0: [57, 137], y0: [47, 47], x1: [63, 143], y1: [53, 53] },
    marks: { href: "data:image/png;base64,ORIGINAL", width: 400, height: 200 },
    displayList: dl,
    options: { raster: true, hover: true, select: true, zoom: true, selectMode: "multiple", detailMarks: 1 }
  });
  const radii = () => ctx.log.filter((r) => r.op === "fill").flatMap((r) => r.rs);
  const widths = () => ctx.log.filter((r) => r.op === "stroke").map((r) => r.lw);
  inst._test.setView({ x: 50, y: 25, w: 100, h: 50 }); inst._test.evalTier();
  ok(inst._test.markTier() === "mid", "VW-29 setup: a 2x viewBox zoom with two marks in view is the mid tier");
  ok(radii().length === 2 && radii().every((r) => Math.abs(r - 6) < 1e-6),
    "VW-29: under viewBox zoom the canvas draws a disc at 2x its radius, as the zoomed SVG node is");
  ok(widths().length > 0 && widths().every((w) => Math.abs(w - 2) < 1e-6),
    "VW-29: under viewBox zoom the canvas stroke scales with the view too");
  inst._test.setView({ x: 0, y: 0, w: 200, h: 100 }); inst._test.evalTier();
  inst._test.setView({ x: 25, y: 37.5, w: 150, h: 25 }); inst._test.evalTier();
  ok(radii().length === 2 && radii().every((r) => Math.abs(r - 3 * 200 / 150) < 1e-6),
    "VW-29: a disc follows the viewBox's fit scale (min of the two axes, as SVG's meet does)");
  // the detail tier's node for the same record: an unscaled circle in the zoomed viewBox
  const d = mountDetailNoPanel();
  function mountDetailNoPanel() {
    proto.getContext = function () { return recCtx(); };
    const e2 = document.createElement("div");
    document.body.appendChild(e2);
    const i2 = widgetDef.factory(e2, 200, 100);
    i2.renderValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/></svg>',
      elements: { key: ["p1", "p2"], mark: ["point", "point"], x0: [57, 137], y0: [47, 47], x1: [63, 143], y1: [53, 53] },
      marks: { href: "data:image/png;base64,ORIGINAL", width: 400, height: 200 },
      displayList: dl,
      options: { raster: true, hover: true, select: true, zoom: true, selectMode: "multiple", detailMarks: 100 }
    });
    i2.inst = i2;
    return { el: e2, inst: i2 };
  }
  d.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 }); d.inst._test.evalTier();
  const node = d.el.querySelector('.vellumwidget-detail [data-key="p1"]');
  ok(d.inst._test.markTier() === "detail" && node && !/scale\(var/.test(node.style.transform || "") && !node.hasAttribute("vector-effect"),
    "VW-29: the detail node is not counter-scaled under viewBox zoom (it grows with the view, as the canvas now does)");
  proto.getContext = orig;
}

// ============ VW-30: the mixed tier (flagged runs as rasters) ============
{
  const b64 = (Arr, xs) => Buffer.from(new Arr(xs).buffer).toString("base64");
  const f32 = (xs) => ({ type: "f32", n: xs.length, data: b64(Float32Array, xs) });
  const u8 = (xs) => ({ type: "u8", n: xs.length, data: b64(Uint8Array, xs) });
  function recCtx() {
    const log = [];
    let arcs = [];
    return {
      log: log, fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, lineWidth: 1, _stack: [], _clips: 0,
      save() { this._stack.push(this._clips); }, restore() { this._clips = this._stack.pop() || 0; },
      setTransform(a, b, c, d, e, f) { this._t = [a, d, e, f]; }, clearRect() { log.length = 0; },
      rect() {}, clip() { this._clips++; }, moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {},
      beginPath() { arcs = []; }, arc(x) { arcs.push(Math.round(x)); },
      fill() { log.push({ op: "fill", xs: arcs.slice() }); },
      stroke() {},
      drawImage(img, x, y, w, h) { log.push({ op: "img", src: img && img.src, w: w, h: h, t: this._t.slice(), clipped: this._clips > 0 }); }
    };
  }
  // p1 exact, p2 flagged (run 1, under a mask), p3 exact, p4 flagged (run 2, text)
  function dlRuns(o) {
    o = o || {};
    const flags = o.flags || [0, 4, 0, 8];
    const rec = { kind: { type: "u8", n: 4, const: 0 }, paint: { type: "u8", n: 4, const: 0 }, key: { type: "u32", n: 4, seq: [0, 1] },
      flags: u8(flags), clip: { type: "u8", n: 4, const: 0 }, panel: { type: "u8", n: 4, const: o.panels ? 1 : 0 },
      group: { type: "u8", n: 4, const: 0 } };
    if (!o.noRuns) rec.run = u8([0, 1, 0, 2]);
    const dl = {
      format: "vellum-display-list", version: 2, width: 200, height: 100, n: 4, record: rec,
      point: { cx: f32([40, 80, 120, 160]), cy: { type: "f32", n: 4, const: 50 }, r: { type: "f32", n: 4, const: 3 }, shape: { type: "u8", n: 4, const: 0 } },
      rect: { x: f32([]), y: f32([]), w: f32([]), h: f32([]) },
      path: { xy: { type: "f32", n: 0, data: "" }, run_offset: { type: "u8", n: 1, const: 0 }, path_offset: { type: "u8", n: 1, const: 0 },
        closed: { type: "u8", n: 0, data: "" }, evenodd: { type: "u8", n: 0, data: "" } },
      paints: { fill: ["#ff0000ff"], stroke: [null], stroke_width: [0], dash: [null], linecap: ["round"], linejoin: ["round"], fill_gradient: [0] },
      clips: null, keys: ["p1", "p2", "p3", "p4"], panels: o.panels ? "panel-1-1" : null,
      gradients: null, clip_paths: null, groups: null
    };
    if (!o.noRuns) dl.runs = 2;
    return dl;
  }
  const panel = {
    name: "panel-1-1", px0: 20, py0: 10, px1: 180, py1: 90,
    x: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 100, native_lo: 0, native_hi: 100 },
    y: { type: "continuous", transform: "identity", data_lo: 0, data_hi: 50, native_lo: 0, native_hi: 50 }
  };
  const below = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1"><g data-vellum-pan="panel-1-1"><g role="grid"><path d="M20 50 L180 50" stroke="#fff"/></g></g></g>' +
    '<g data-vellum-panel="axis-x-3"><text x="20" y="4" transform="matrix(1 0 0 1 20 90)" font-size="12">50</text></g>' +
    '<g data-vellum-panel="axis-y-1"><text x="-4" y="0" transform="matrix(1 0 0 1 20 90)" font-size="12">25</text></g></svg>';
  const raw = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#fff"/></svg>';
  const proto = window.HTMLCanvasElement.prototype;
  const imgProto = window.HTMLImageElement.prototype;
  const srcDesc = Object.getOwnPropertyDescriptor(imgProto, "src");
  let autoLoad = true;
  const pending = [];
  Object.defineProperty(imgProto, "src", {
    configurable: true,
    get() { return this._vwSrc || ""; },
    set(v) { this._vwSrc = v; if (autoLoad) { if (this.onload) this.onload(); } else pending.push(this); }
  });
  function mount(o) {
    o = o || {};
    const ctx = recCtx();
    const orig = proto.getContext;
    proto.getContext = function () { return ctx; };
    const e = document.createElement("div");
    document.body.appendChild(e);
    const inst = widgetDef.factory(e, 200, 100);
    const flagged = o.noFlagged ? null : { runs: o.runHrefs || ["data:image/png;base64,RUN1", "data:image/png;base64,RUN2"], width: 200, height: 100 };
    inst.renderValue({
      svg: o.panels ? below : raw,
      elements: { key: ["p1", "p2", "p3", "p4"], mark: ["point", "point", "point", "text"], cond: [["pick:color"], ["pick:color"], ["pick:color"], ["pick:color"]],
        x0: [null, 77, null, 150], y0: [null, 47, null, 45], x1: [null, 83, null, 170], y1: [null, 53, null, 55] },
      panels: o.panels ? [panel] : undefined,
      marks: { href: "data:image/png;base64,ORIGINAL", width: 200, height: 100, panels: o.panels ? "panel-1-1" : null },
      displayList: dlRuns(o),
      flagged: flagged,
      interactions: { selections: [{ name: "pick", kind: "point", on: "click", empty: true }],
        conditions: [{ selection: "pick", aes: "color", if_false: null, empty: true }], filters: [] },
      options: Object.assign({ raster: true, hover: true, select: true, zoom: true, selectMode: "multiple", detailMarks: o.detailMarks || 1 }, o.options || {})
    });
    return { el: e, inst: inst, ctx: ctx, restore: function () { proto.getContext = orig; } };
  }
  const seq = (ctx) => ctx.log.map((r) => r.op === "img" ? "img:" + r.src.slice(-4) : "fill:" + r.xs.join("/")).join(",");
  const marksShown = (t) => { const u = t.el.querySelector("svg use.vellumwidget-marks, svg > image.vellumwidget-marks"); return !!u && u.style.visibility !== "hidden"; };

  // raw scene (viewBox zoom): the runs are drawn in paint order between the exact marks
  const a = mount({});
  ok(a.inst._test.runsAttached() && a.inst._test.listExact() === true, "VW-30: with the run rasters loaded the list counts as exact");
  a.inst._test.setView({ x: 20, y: 0, w: 160, h: 80 }); a.inst._test.evalTier();
  ok(a.inst._test.markTier() === "mid", "VW-30 setup: mid tier");
  // (view x 20..180 at 1.25 canvas px per scene px: p1 at 25, p3 at 125)
  ok(seq(a.ctx) === "fill:25,img:RUN1,fill:125,img:RUN2",
    "VW-30: the canvas draws p1, run 1, p3, run 2 -- the flagged marks keep their paint order");
  const im = a.ctx.log.filter((r) => r.op === "img")[0];
  ok(im && im.w === 200 && im.h === 100 && Math.abs(im.t[0] - 1.25) < 1e-6 && Math.abs(im.t[2] + 25) < 1e-6 && !im.clipped,
    "VW-30: under viewBox zoom a run raster goes through the view's transform, unclipped");
  ok(!marksShown(a), "VW-30: the mark PNG is hidden: every mark is on the canvas");
  // styling: the exact marks take a condition, the run raster is drawn as is
  a.inst._call("select", ["p1"]);
  ok(/img:RUN1/.test(seq(a.ctx)), "VW-30: a condition keeps the runs on the canvas (their own styling is baked in)");
  a.restore();

  // detail: the runs are <use>s of one image each, in paint order, and the flagged marks get stand-ins
  const d = mount({ detailMarks: 100 });
  d.inst._test.setView({ x: 20, y: 0, w: 160, h: 80 }); d.inst._test.evalTier();
  ok(d.inst._test.markTier() === "detail", "VW-30: a list with covered flagged runs reaches the detail tier");
  const kids = Array.from(d.el.querySelectorAll("g.vellumwidget-detail > *")).map((n) =>
    n.classList.contains("vellumwidget-detail-run") ? "run:" + n.getAttribute("href").slice(-1) : n.getAttribute("data-key"));
  ok(kids.join(",") === "p1,run:1,p2,p3,run:2,p4", "VW-30: detail nodes and run images interleave in paint order");
  const prox = d.el.querySelector('.vellumwidget-detail-proxy[data-key="p2"]');
  ok(prox && prox.getAttribute("fill-opacity") === "0" && !prox.hasAttribute("stroke"),
    "VW-30: a flagged mark's stand-in node is transparent (the run image paints it)");
  const defImg = d.el.querySelector("defs.vellumwidget-detail image");
  ok(defImg && /RUN1$/.test(defImg.getAttribute("href")) && defImg.getAttribute("width") === "200", "VW-30: the run raster is defined once, in the scene frame");
  d.inst._call("select", ["p2"]);
  ok(prox.classList.contains("vellumwidget-selected"), "VW-30: selecting a flagged mark outlines its stand-in");
  d.restore();

  // axis zoom: each run is drawn through the panel's transform, clipped to it
  const z = mount({ panels: true, options: { axisZoom: true } });
  z.inst._test.setView({ x: 50, y: 25, w: 100, h: 50 }); z.inst._test.evalTier();
  const zi = z.ctx.log.filter((r) => r.op === "img");
  ok(zi.length === 2 && zi.every((r) => r.clipped) && Math.abs(zi[0].t[0] - 2) < 1e-6,
    "VW-30: under axis zoom a run raster goes through the panel's T and is clipped to the panel");
  z.restore();

  // export (VW-25 path): the redraw includes the runs
  const x = mount({});
  {
    const exp = recCtx();
    let captured = null;
    const saved = { gc: proto.getContext, tdu: proto.toDataURL, Blob: global.Blob, XS: global.XMLSerializer, cou: URL.createObjectURL, rou: URL.revokeObjectURL };
    proto.getContext = function () { return exp; };
    proto.toDataURL = function () { return "data:image/png;base64,REDRAWN"; };
    global.Blob = function (parts) { captured = parts.join(""); };
    global.XMLSerializer = window.XMLSerializer;
    URL.createObjectURL = function () { return "blob:x"; };
    URL.revokeObjectURL = function () {};
    const aClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    x.el.querySelector('[data-act="svg"]').click();
    window.HTMLAnchorElement.prototype.click = aClick;
    proto.getContext = saved.gc; proto.toDataURL = saved.tdu;
    global.Blob = saved.Blob; global.XMLSerializer = saved.XS;
    URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou;
    ok(/vellumwidget-marks-export/.test(captured || "") && !/ORIGINAL/.test(captured || "") && seq(exp) === "fill:80,img:RUN1,fill:240,img:RUN2",
      "VW-30: the export redraws the exact marks and the runs in paint order");
  }
  x.restore();

  // fallbacks: exactly the old behaviour
  const none = mount({ noFlagged: true });
  none.inst._test.setView({ x: 20, y: 0, w: 160, h: 80 }); none.inst._test.evalTier();
  ok(!none.inst._test.runsAttached() && none.inst._test.listExact() === false && none.inst._test.markTier() === "mid" &&
    marksShown(none) && seq(none.ctx) === "fill:25/125",
    "VW-30 fallback: no run rasters (older vellum) -> inexact list, mark PNG kept, no detail");
  none.restore();
  const old = mount({ noRuns: true });
  ok(!old.inst._test.runsAttached() && old.inst._test.listExact() === false, "VW-30 fallback: a list without runs ignores the rasters");
  old.restore();
  const short = mount({ runHrefs: ["data:image/png;base64,RUN1"] });
  ok(!short.inst._test.runsAttached() && short.inst._test.listExact() === false, "VW-30 fallback: one raster short of the runs -> unchanged");
  short.restore();
  const blend = mount({ flags: [0, 36, 0, 8] });
  ok(!blend.inst._test.runsAttached() && blend.inst._test.listExact() === false, "VW-30 fallback: a blend-mode mark (flag 32) keeps the PNG path");
  blend.restore();
  const uncovered = mount({ flags: [0, 4, 8, 8] });
  ok(!uncovered.inst._test.runsAttached(), "VW-30 fallback: a flagged record outside every run -> unchanged");
  uncovered.restore();
  autoLoad = false;
  const lazy = mount({});
  lazy.inst._test.setView({ x: 20, y: 0, w: 160, h: 80 }); lazy.inst._test.evalTier();
  ok(!lazy.inst._test.runsAttached() && lazy.inst._test.markTier() === "mid" && marksShown(lazy),
    "VW-30: until the rasters load, the old behaviour holds");
  pending.splice(0).forEach((img) => img.onload && img.onload());
  ok(lazy.inst._test.runsAttached() && lazy.inst._test.listExact() === true && /img:RUN2/.test(seq(lazy.ctx)) && !marksShown(lazy),
    "VW-30: once they load the canvas redraws with the runs");
  lazy.restore();
  autoLoad = true;
  if (srcDesc) Object.defineProperty(imgProto, "src", srcDesc); else delete imgProto.src;
}

// Checks that need the MutationObserver (removal watcher) to have run.
setTimeout(function () {
  asyncChecks[0]();
  setTimeout(function () {
    for (let i = 1; i < asyncChecks.length; i++) asyncChecks[i]();
    Promise.all(slowChecks).then(function () {
    console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
    process.exit(failures === 0 ? 0 : 1);
    });
  }, 0);
}, 0);
