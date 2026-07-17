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
  // navToView maps fractions -> viewBox and moves the window
  N.inst._test.navToView(0.25, 0.5);
  const v = T.parseViewBox(N.svg.getAttribute("viewBox"));
  ok(Math.abs(v.x - 25) < 1e-6 && Math.abs(v.w - 50) < 1e-6, "navigator: navToView(0.25,0.5) sets the x-range to [25, +50] of vb0");
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

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
