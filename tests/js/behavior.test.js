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

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
